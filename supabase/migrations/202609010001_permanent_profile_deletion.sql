-- Permanent account deletion is a recoverable two-step saga.
-- Prepare detaches Auth only after recording a durable request. Finalize proves
-- that Auth is gone, then purges the profile and all related data atomically.

begin;

create table if not exists public.profile_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique
    references public.profiles(id) on delete cascade,
  auth_user_id uuid unique,
  login_id extensions.citext not null,
  expected_profile_version bigint not null
    check (expected_profile_version >= 1),
  prepared_profile_version bigint
    check (prepared_profile_version is null or prepared_profile_version >= 1),
  prepared_at timestamptz not null default clock_timestamp()
);

alter table public.profile_deletion_requests enable row level security;
revoke all on table public.profile_deletion_requests
  from public, anon, authenticated, service_role;

-- Shared messages outlive their author account. Their author FK must therefore
-- be anonymizable without deleting messages or recipient notifications.
alter table public.admin_notification_messages
  alter column created_by_profile_id drop not null;

-- Durable target identity for account/profile audit rows. The FK closes races
-- between an audit INSERT and profile deletion, including compensating cleanup
-- of a just-created pending account.
alter table public.activity_log
  add column if not exists target_profile_id uuid;

do $activity_target_fk$
begin
  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conname = 'activity_log_target_profile_id_fkey'
      and constraint_row.conrelid = 'public.activity_log'::regclass
  ) then
    alter table public.activity_log
      add constraint activity_log_target_profile_id_fkey
      foreign key (target_profile_id)
      references public.profiles(id)
      on delete cascade;
  end if;
end;
$activity_target_fk$;

create index if not exists activity_log_target_profile_id_idx
  on public.activity_log (target_profile_id)
  where target_profile_id is not null;

update public.activity_log activity
set target_profile_id = profile.id
from public.profiles profile
where activity.target_profile_id is null
  and profile.id::text = lower(btrim(coalesce(
    activity.analytics_event ->> 'targetProfileId',
    ''
  )));

-- move_profile_to_institution already marks its profile UPDATE with this
-- transaction-local flag. Capture the exact row while it is available, then
-- attach that UUID to the audit INSERT emitted later by the same RPC. Keeping
-- this as two narrow triggers avoids reproducing the administrative workflow.
create or replace function public.capture_institution_move_activity_target()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('app.allow_institution_move', true), '') = 'on'
    and old.institution_id is distinct from new.institution_id
  then
    perform set_config(
      'app.institution_move_target_profile_id',
      new.id::text,
      true
    );
  end if;

  return new;
end;
$$;

drop trigger if exists capture_institution_move_activity_target
  on public.profiles;
create trigger capture_institution_move_activity_target
after update of institution_id on public.profiles
for each row
execute function public.capture_institution_move_activity_target();

create or replace function public.link_institution_move_activity_target()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  captured_target_id_text text;
  captured_target_id uuid;
  analytics_target_id_text text;
  analytics_target_id uuid;
begin
  analytics_target_id_text := nullif(
    btrim(coalesce(new.analytics_event ->> 'targetProfileId', '')),
    ''
  );

  if analytics_target_id_text is not null then
    begin
      analytics_target_id := analytics_target_id_text::uuid;
    exception
      when invalid_text_representation then
        raise exception 'Identifiant de profil cible invalide dans l’audit.'
          using errcode = '22023';
    end;

    if new.target_profile_id is null then
      new.target_profile_id := analytics_target_id;
    elsif new.target_profile_id is distinct from analytics_target_id then
      raise exception
        'Les identifiants de profil cible de l’audit sont incohérents.'
        using errcode = '22023';
    end if;
  end if;

  if new.action = 'Changement d’établissement' then
    captured_target_id_text := nullif(
      current_setting('app.institution_move_target_profile_id', true),
      ''
    );

    if captured_target_id_text is not null then
      captured_target_id := captured_target_id_text::uuid;

      if new.target_profile_id is not null
        and new.target_profile_id is distinct from captured_target_id
      then
        raise exception
          'La cible de l’audit ne correspond pas au profil déplacé.'
          using errcode = '22023';
      end if;

      new.target_profile_id := captured_target_id;
      new.analytics_event := coalesce(new.analytics_event, '{}'::jsonb)
        || jsonb_build_object(
          'kind', 'profile_target',
          'targetProfileId', captured_target_id
        );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists link_institution_move_activity_target
  on public.activity_log;
create trigger link_institution_move_activity_target
before insert on public.activity_log
for each row
execute function public.link_institution_move_activity_target();

revoke all on function public.capture_institution_move_activity_target()
  from public, anon, authenticated, service_role;
revoke all on function public.link_institution_move_activity_target()
  from public, anon, authenticated, service_role;

create or replace function public.profile_permanent_deletion_is_allowed()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    current_setting('app.allow_profile_permanent_deletion', true),
    ''
  ) = 'on';
$$;

revoke all on function public.profile_permanent_deletion_is_allowed()
  from public, anon, authenticated;

-- Catalogue definitions and immutable snapshots may contain denormalized audit
-- identifiers. Remove only known author/owner keys whose value is the deleted
-- profile UUID, at any nesting depth, while preserving every other field.
create or replace function public.scrub_profile_audit_json(
  p_document jsonb,
  p_profile_id uuid
)
returns jsonb
language plpgsql
immutable
security definer
set search_path = public
as $$
declare
  scrubbed_document jsonb;
begin
  if p_document is null or p_profile_id is null then
    return p_document;
  end if;

  if jsonb_typeof(p_document) = 'object' then
    select coalesce(
      jsonb_object_agg(
        entry.key,
        public.scrub_profile_audit_json(entry.value, p_profile_id)
      ),
      '{}'::jsonb
    )
    into scrubbed_document
    from jsonb_each(p_document) entry
    where not (
      entry.key in (
        'ownerProfileId',
        'owner_profile_id',
        'createdByProfileId',
        'created_by_profile_id',
        'updatedByProfileId',
        'updated_by_profile_id',
        'publishedByProfileId',
        'published_by_profile_id'
      )
      and jsonb_typeof(entry.value) = 'string'
      and lower(entry.value #>> '{}') = p_profile_id::text
    );

    return scrubbed_document;
  end if;

  if jsonb_typeof(p_document) = 'array' then
    select coalesce(
      jsonb_agg(
        public.scrub_profile_audit_json(item.value, p_profile_id)
        order by item.ordinality
      ),
      '[]'::jsonb
    )
    into scrubbed_document
    from jsonb_array_elements(p_document) with ordinality item(value, ordinality);

    return scrubbed_document;
  end if;

  return p_document;
end;
$$;

revoke all on function public.scrub_profile_audit_json(jsonb, uuid)
  from public, anon, authenticated;

-- The normal audit trigger intentionally restores an old modifier when a new
-- value is NULL. Finalize must be able to remove that reference explicitly.
create or replace function public.audit_versioned_record()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  actor_profile_id uuid := public.current_profile_id();
begin
  if tg_op = 'INSERT' then
    new.version := greatest(coalesce(new.version, 1), 1);
    new.updated_at := coalesce(new.updated_at, now());
    new.updated_by_profile_id := coalesce(
      actor_profile_id,
      new.updated_by_profile_id
    );
    return new;
  end if;

  if coalesce(
    current_setting('app.allow_profile_permanent_deletion', true),
    ''
  ) = 'on' then
    new.version := old.version;
    new.updated_at := old.updated_at;
    return new;
  end if;

  new.version := old.version + 1;
  new.updated_at := now();

  new.updated_by_profile_id := coalesce(
    actor_profile_id,
    new.updated_by_profile_id,
    old.updated_by_profile_id
  );
  return new;
end;
$$;

create or replace function public.prevent_profile_history_delete()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if public.profile_permanent_deletion_is_allowed() then
    return old;
  end if;

  -- Preserve only the compensating cleanup used when account creation fails
  -- immediately after inserting a brand-new pending profile. This is narrower
  -- than a general "no history" delete and cannot remove an activated account.
  if coalesce(
      auth.jwt() ->> 'role',
      current_setting('request.jwt.claim.role', true),
      ''
    ) = 'service_role'
    and old.created_at >= clock_timestamp() - interval '15 minutes'
    and old.must_change_password
    and old.auth_user_id is not null
    and exists (
      select 1
      from auth.users auth_user
      where auth_user.id = old.auth_user_id
        and coalesce(
          (auth_user.raw_app_meta_data ->> 'pending_activation')::boolean,
          false
        )
    )
    and not exists (
      select 1 from public.interventions intervention
      where intervention.internal_profile_id = old.id
         or intervention.senior_profile_id = old.id
    )
    and not exists (
      select 1 from public.intervention_evaluations evaluation
      where evaluation.senior_profile_id = old.id
    )
    and not exists (
      select 1 from public.evaluation_requests request
      where request.internal_profile_id = old.id
         or request.senior_profile_id = old.id
    )
    and not exists (
      select 1 from public.notebook_documents document
      where document.profile_id = old.id
    )
    and not exists (
      select 1 from public.trophy_awards award
      where award.profile_id = old.id
    )
    and not exists (
      select 1 from public.senior_internal_assignments assignment
      where assignment.internal_profile_id = old.id
         or assignment.senior_profile_id = old.id
    )
    and not exists (
      select 1 from public.activity_log event
      where event.profile_id = old.id
         or event.created_by_profile_id = old.id
    )
    and not exists (
      select 1 from public.test_feedback feedback
      where feedback.profile_id = old.id
         or feedback.author_profile_id = old.id
    )
    and not exists (
      select 1 from public.application_sessions session
      where session.profile_id = old.id
         or session.auth_user_id = old.auth_user_id
    )
    and not exists (
      select 1 from public.user_notifications notification
      where notification.profile_id = old.id
    )
    and not exists (
      select 1 from public.push_subscriptions subscription
      where subscription.profile_id = old.id
    )
    and not exists (
      select 1 from public.admin_notification_messages message
      where message.audience_profile_id = old.id
         or message.created_by_profile_id = old.id
    )
  then
    return old;
  end if;

  raise exception
    'Utilisez la finalisation atomique de suppression définitive du profil.'
    using errcode = '55000';
end;
$$;

-- Auth detachment is accepted only when prepare has already inserted the
-- matching durable hand-off in the same transaction.
create or replace function public.protect_profile_account_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.profile_permanent_deletion_is_allowed()
    and exists (
      select 1
      from public.profile_deletion_requests deletion_request
      where deletion_request.profile_id = old.id
    )
  then
    raise exception
      'Ce profil est verrouillé par une suppression définitive en cours.'
      using errcode = '55000';
  end if;

  if old.auth_user_id is not null and new.auth_user_id is null then
    if not public.profile_permanent_deletion_is_allowed()
      or not exists (
        select 1
        from public.profile_deletion_requests deletion_request
        where deletion_request.profile_id = old.id
          and deletion_request.auth_user_id = old.auth_user_id
      )
    then
      raise exception
        'L’identité Supabase Auth d’un profil ne peut pas être détachée.'
        using errcode = '55000';
    end if;
  end if;

  if old.is_active is distinct from new.is_active
    and coalesce(
      current_setting('app.allow_profile_account_lifecycle', true),
      ''
    ) <> 'on'
  then
    raise exception
      'Utilisez la fonction atomique de cycle de vie du compte.'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

-- The historical trigger listened only to auth_user_id/is_active. Listen to
-- every UPDATE so no concurrent admin edit can invalidate a prepared saga
-- after the Auth identity has already been deleted.
drop trigger if exists protect_profile_account_lifecycle
  on public.profiles;
create trigger protect_profile_account_lifecycle
before update on public.profiles
for each row execute function public.protect_profile_account_lifecycle();

-- These two guards retain the existing immutable behavior except inside the
-- local finalize transaction. FK cascades fire the same triggers.
create or replace function public.protect_intervention_immutability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile_id uuid := public.current_profile_id();
  actor_role public.app_role := public.current_app_role();
begin
  if public.profile_permanent_deletion_is_allowed()
    and tg_op in ('UPDATE', 'DELETE')
  then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'INSERT' then
    if current_user in ('anon', 'authenticated')
      or new.definition_snapshot is null
      or new.definition_snapshot_schema_version <> 1
      or new.definition_version is null
      or new.autonomy_score is not null
      or new.autonomy_score_formula_id is not null
      or new.autonomy_score_calculated_at is not null then
      raise exception
        'Une intervention doit être créée par la fonction atomique officielle.'
        using errcode = '55000';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if current_user in ('anon', 'authenticated') then
      raise exception 'Une intervention enregistrée est immuable.'
        using errcode = '55000';
    end if;

    if new.id is distinct from old.id
      or new.internal_profile_id is distinct from old.internal_profile_id
      or new.senior_profile_id is distinct from old.senior_profile_id
      or new.procedure_id is distinct from old.procedure_id
      or new.intervention_date is distinct from old.intervention_date
      or new.intervention_start_time is distinct from old.intervention_start_time
      or new.operative_duration_minutes is distinct from old.operative_duration_minutes
      or new.indication is distinct from old.indication
      or new.indication_comment is distinct from old.indication_comment
      or new.custom_indication is distinct from old.custom_indication
      or new.approach is distinct from old.approach
      or new.entry_technique is distinct from old.entry_technique
      or new.laterality is distinct from old.laterality
      or new.surgery_context is distinct from old.surgery_context
      or new.context_variables is distinct from old.context_variables
      or new.complexity is distinct from old.complexity
      or new.role is distinct from old.role
      or new.checklist is distinct from old.checklist
      or new.saved_at is distinct from old.saved_at
      or new.created_by_profile_id is distinct from old.created_by_profile_id
      or new.deleted_at is distinct from old.deleted_at
      or new.client_mutation_id is distinct from old.client_mutation_id
      or (
        old.definition_snapshot is not null
        and new.definition_snapshot is distinct from old.definition_snapshot
      )
      or (
        old.definition_snapshot_schema_version is not null
        and new.definition_snapshot_schema_version
          is distinct from old.definition_snapshot_schema_version
      )
      or (
        old.definition_version is not null
        and new.definition_version is distinct from old.definition_version
      ) then
      raise exception 'Les données brutes d’une intervention sont immuables.'
        using errcode = '55000';
    end if;
    return new;
  end if;

  if actor_role is distinct from 'internal'::public.app_role
    or actor_profile_id is distinct from old.internal_profile_id
    or exists (
      select 1
      from public.intervention_evaluations evaluation
      where evaluation.intervention_id = old.id
    ) then
    raise exception
      'Seule une intervention en attente peut être supprimée par son Interne.'
      using errcode = '55000';
  end if;
  return old;
end;
$$;

create or replace function public.protect_evaluation_immutability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile_id uuid := public.current_profile_id();
  actor_role public.app_role := public.current_app_role();
begin
  if public.profile_permanent_deletion_is_allowed()
    and tg_op in ('UPDATE', 'DELETE')
  then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op <> 'INSERT' then
    raise exception 'Une évaluation validée est définitive.'
      using errcode = '55000';
  end if;

  if current_user in ('anon', 'authenticated')
    or actor_role is distinct from 'senior'::public.app_role
    or new.senior_profile_id is distinct from actor_profile_id
    or not exists (
      select 1
      from public.interventions intervention
      join public.evaluation_requests request
        on request.intervention_id = intervention.id
      where intervention.id = new.intervention_id
        and intervention.deleted_at is null
        and intervention.senior_profile_id = actor_profile_id
        and request.senior_profile_id = actor_profile_id
        and request.status = 'completed'
    ) then
    raise exception
      'Une évaluation doit être créée par la fonction atomique officielle.'
      using errcode = '55000';
  end if;
  return new;
end;
$$;

-- A permanent deletion can remove many interventions for the same Internal.
-- Skip the row-level rebuild during that tightly scoped transaction; finalize
-- performs one explicit rebuild per distinct affected Internal afterwards.
create or replace function public.refresh_trophies_after_intervention_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(
    current_setting('app.allow_profile_permanent_deletion', true),
    ''
  ) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  perform public.rebuild_profile_trophy_awards(
    case when tg_op = 'DELETE' then old.internal_profile_id
      else new.internal_profile_id
    end,
    now()
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Profile-targeted analytics must carry a durable UUID, never rely only on a
-- mutable or non-unique display name supplied by the client.
create or replace function public.record_profile_target_activity_event(
  p_event_kind text,
  p_target_profile_id uuid
)
returns public.activity_log
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles%rowtype;
  target_profile public.profiles%rowtype;
  event_action text;
  event_target_type text;
  saved_event public.activity_log%rowtype;
begin
  if p_target_profile_id is null then
    raise exception 'Profil cible manquant.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('project1-profile-permanent-deletion')
  );

  select profile.*
  into actor
  from public.profiles profile
  where profile.id = public.current_profile_id()
    and profile.is_active
  for share;

  if actor.id is null then
    raise exception 'Un profil actif est requis.' using errcode = '42501';
  end if;

  select profile.*
  into target_profile
  from public.profiles profile
  where profile.id = p_target_profile_id
  for share;

  if target_profile.id is null then
    raise exception 'Profil cible introuvable.' using errcode = 'P0002';
  end if;

  case p_event_kind
    when 'view_internal_statistics' then
      if actor.role not in (
        'senior'::public.app_role,
        'admin'::public.app_role
      )
        or target_profile.role <> 'internal'::public.app_role
        or not public.can_read_internal(target_profile.id)
      then
        raise exception 'Interne non visible pour ce profil.'
          using errcode = '42501';
      end if;

      event_action := 'Consultation des statistiques d’un interne';
      event_target_type := 'Interne';

    when 'prepare_reminder_email' then
      if actor.role <> 'admin'::public.app_role
        or target_profile.role not in (
          'internal'::public.app_role,
          'senior'::public.app_role
        )
      then
        raise exception 'Rappel non autorisé pour ce profil.'
          using errcode = '42501';
      end if;

      event_action := 'Préparation d’un rappel e-mail';
      event_target_type := 'Relance profil';

    else
      raise exception 'Type d’événement profil non autorisé.'
        using errcode = '22023';
  end case;

  insert into public.activity_log (
    profile_id,
    actor_role,
    actor_label,
    action,
    target_type,
    target_label,
    target_profile_id,
    created_by_profile_id,
    analytics_event
  )
  values (
    actor.id,
    actor.role,
    btrim(concat_ws(' ', actor.first_name, actor.last_name)),
    event_action,
    event_target_type,
    btrim(concat_ws(
      ' ',
      target_profile.first_name,
      target_profile.last_name
    )),
    target_profile.id,
    actor.id,
    jsonb_build_object(
      'kind', 'profile_target',
      'targetProfileId', target_profile.id
    )
  )
  returning * into saved_event;

  return saved_event;
end;
$$;

revoke all on function public.record_profile_target_activity_event(text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.record_profile_target_activity_event(text, uuid)
  to authenticated, service_role;

-- The password API must never replace profile.metadata from a stale read. Merge
-- the pending e-mail fields into the locked current row, and let the pending
-- deletion guard reject the update if permanent deletion already started.
create or replace function public.store_pending_email_confirmation(
  p_profile_id uuid,
  p_contact_email text,
  p_purpose text,
  p_requested_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_profile public.profiles%rowtype;
  normalized_email text := lower(btrim(coalesce(p_contact_email, '')));
  normalized_purpose text := lower(btrim(coalesce(p_purpose, '')));
begin
  if p_profile_id is null or p_requested_at is null then
    raise exception 'Profil ou date de demande manquant.'
      using errcode = '22023';
  end if;

  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Adresse e-mail invalide.' using errcode = '22023';
  end if;

  if normalized_purpose not in ('activation', 'change') then
    raise exception 'Motif de confirmation invalide.' using errcode = '22023';
  end if;

  select profile.*
  into target_profile
  from public.profiles profile
  where profile.id = p_profile_id
  for update;

  if target_profile.id is null then
    raise exception 'Profil introuvable.' using errcode = 'P0002';
  end if;

  if not target_profile.is_active or target_profile.auth_user_id is null then
    raise exception 'Un profil actif lié à Auth est requis.'
      using errcode = '42501';
  end if;

  if (normalized_purpose = 'activation' and not target_profile.must_change_password)
    or (normalized_purpose = 'change' and target_profile.must_change_password)
  then
    raise exception 'Le motif ne correspond pas à l’état du compte.'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.profile_deletion_requests deletion_request
    where deletion_request.profile_id = target_profile.id
  ) then
    raise exception 'Une suppression définitive est en cours pour ce profil.'
      using errcode = '55000';
  end if;

  update public.profiles profile
  set
    metadata = coalesce(profile.metadata, '{}'::jsonb) || jsonb_build_object(
      'pendingContactEmail', normalized_email,
      'pendingEmailPurpose', normalized_purpose,
      'pendingEmailRequestedAt', p_requested_at
    ),
    updated_by_profile_id = target_profile.id
  where profile.id = target_profile.id;

  return jsonb_build_object(
    'pendingContactEmail', normalized_email,
    'pendingEmailPurpose', normalized_purpose,
    'pendingEmailRequestedAt', p_requested_at,
    'profileId', target_profile.id
  );
end;
$$;

revoke all on function public.store_pending_email_confirmation(
  uuid,
  text,
  text,
  timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.store_pending_email_confirmation(
  uuid,
  text,
  text,
  timestamptz
) to service_role;

create or replace function public.prepare_disabled_profile_deletion(
  p_profile_id uuid,
  p_expected_version bigint,
  p_actor_profile_id uuid,
  p_confirmation_login_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions
as $$
declare
  actor_profile public.profiles%rowtype;
  target_profile public.profiles%rowtype;
  detached_profile public.profiles%rowtype;
  deletion_request public.profile_deletion_requests%rowtype;
  normalized_confirmation text := btrim(coalesce(p_confirmation_login_id, ''));
begin
  if p_profile_id is null
    or p_actor_profile_id is null
    or p_expected_version is null
    or p_expected_version < 1
  then
    raise exception 'Profil, Administrateur ou version manquant.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('project1-profile-permanent-deletion')
  );

  select profile.*
  into actor_profile
  from public.profiles profile
  where profile.id = p_actor_profile_id
    and profile.role = 'admin'::public.app_role
    and profile.is_active
  for share;

  if actor_profile.id is null then
    raise exception 'Un Administrateur actif est requis.'
      using errcode = '42501';
  end if;

  select profile.*
  into target_profile
  from public.profiles profile
  where profile.id = p_profile_id
  for update;

  if target_profile.id is null then
    raise exception 'Profil introuvable.' using errcode = 'P0002';
  end if;

  if target_profile.id = actor_profile.id then
    raise exception
      'Le compte Administrateur connecté ne peut pas être supprimé.'
      using errcode = '42501';
  end if;

  if target_profile.is_active then
    raise exception
      'Le profil doit être désactivé avant sa suppression définitive.'
      using errcode = '55000';
  end if;

  if normalized_confirmation = ''
    or normalized_confirmation
      is distinct from target_profile.login_id::text
  then
    raise exception
      'La confirmation doit correspondre exactement à l’identifiant du profil.'
      using errcode = '22023';
  end if;

  select request.*
  into deletion_request
  from public.profile_deletion_requests request
  where request.profile_id = target_profile.id
  for update;

  -- Retry after a server crash: the original or post-prepare version is
  -- accepted, but any unrelated mutation makes the request fail closed.
  if deletion_request.id is not null then
    if target_profile.auth_user_id is not null
      or target_profile.version <> deletion_request.prepared_profile_version
      or p_expected_version not in (
        deletion_request.expected_profile_version,
        deletion_request.prepared_profile_version
      )
    then
      raise exception
        'La demande de suppression est incohérente ou le profil a changé.'
        using errcode = '40001';
    end if;

    return jsonb_build_object(
      'alreadyPrepared', true,
      'authIdentityExists', exists (
        select 1 from auth.users auth_user
        where auth_user.id = deletion_request.auth_user_id
      ),
      'authUserId', deletion_request.auth_user_id,
      'deletionRequestId', deletion_request.id,
      'profileId', deletion_request.profile_id
    );
  end if;

  if target_profile.version <> p_expected_version then
    raise exception
      'Le profil a été modifié par une autre session.'
      using errcode = '40001';
  end if;

  insert into public.profile_deletion_requests (
    profile_id,
    auth_user_id,
    login_id,
    expected_profile_version,
    prepared_profile_version
  )
  values (
    target_profile.id,
    target_profile.auth_user_id,
    target_profile.login_id,
    target_profile.version,
    case when target_profile.auth_user_id is null
      then target_profile.version else null end
  )
  returning * into deletion_request;

  if target_profile.auth_user_id is not null then
    perform set_config(
      'app.allow_profile_permanent_deletion',
      'on',
      true
    );

    update public.profiles profile
    set
      auth_user_id = null,
      updated_by_profile_id = actor_profile.id
    where profile.id = target_profile.id
      and profile.version = target_profile.version
    returning profile.* into detached_profile;

    if detached_profile.id is null then
      raise exception
        'Le profil a été modifié par une autre session.'
        using errcode = '40001';
    end if;

    update public.profile_deletion_requests request
    set prepared_profile_version = detached_profile.version
    where request.id = deletion_request.id
    returning * into deletion_request;
  end if;

  return jsonb_build_object(
    'alreadyPrepared', false,
    'authIdentityExists', exists (
      select 1 from auth.users auth_user
      where auth_user.id = deletion_request.auth_user_id
    ),
    'authUserId', deletion_request.auth_user_id,
    'deletionRequestId', deletion_request.id,
    'profileId', deletion_request.profile_id
  );
end;
$$;

create or replace function public.finalize_disabled_profile_deletion(
  p_deletion_request_id uuid,
  p_actor_profile_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor_profile public.profiles%rowtype;
  target_profile public.profiles%rowtype;
  deletion_request public.profile_deletion_requests%rowtype;
  affected_intervention_ids uuid[] := '{}'::uuid[];
  affected_internal_profile_ids uuid[] := '{}'::uuid[];
  affected_trophy_award_ids uuid[] := '{}'::uuid[];
  affected_internal_profile_id uuid;
  target_legacy_id text;
  legacy_intervention_ids text[] := '{}'::text[];
  foreign_key record;
  has_remaining_reference boolean;
begin
  if p_deletion_request_id is null or p_actor_profile_id is null then
    raise exception 'Demande de suppression ou Administrateur manquant.'
      using errcode = '22023';
  end if;

  -- Finalizations anonymize references in other profiles. Serialize them before
  -- any profile row lock to avoid cross-target lock inversion and version drift.
  perform pg_advisory_xact_lock(
    hashtext('project1-profile-permanent-deletion')
  );

  select profile.*
  into actor_profile
  from public.profiles profile
  where profile.id = p_actor_profile_id
    and profile.role = 'admin'::public.app_role
    and profile.is_active
  for share;

  if actor_profile.id is null then
    raise exception 'Un Administrateur actif est requis.'
      using errcode = '42501';
  end if;

  -- Read once to learn the target, then lock in the same target -> request order
  -- used by prepare. This avoids a prepare/finalize lock inversion.
  select request.*
  into deletion_request
  from public.profile_deletion_requests request
  where request.id = p_deletion_request_id;

  if deletion_request.id is null then
    raise exception 'Demande de suppression introuvable.'
      using errcode = 'P0002';
  end if;

  select profile.*
  into target_profile
  from public.profiles profile
  where profile.id = deletion_request.profile_id
  for update;

  select request.*
  into deletion_request
  from public.profile_deletion_requests request
  where request.id = p_deletion_request_id
    and request.profile_id = target_profile.id
  for update;

  if target_profile.id is null or deletion_request.id is null then
    raise exception 'Profil ou demande de suppression introuvable.'
      using errcode = 'P0002';
  end if;

  if target_profile.id = actor_profile.id then
    raise exception
      'Le compte Administrateur connecté ne peut pas être supprimé.'
      using errcode = '42501';
  end if;

  if target_profile.is_active
    or target_profile.auth_user_id is not null
    or target_profile.version <> deletion_request.prepared_profile_version
  then
    raise exception
      'Le profil n’est plus dans l’état préparé pour sa suppression.'
      using errcode = '40001';
  end if;

  if exists (
    select 1
    from auth.users auth_user
    where auth_user.id = deletion_request.auth_user_id
  ) then
    raise exception
      'L’identité Supabase Auth doit être supprimée avant la finalisation.'
      using errcode = '55000';
  end if;

  perform set_config(
    'app.allow_profile_permanent_deletion',
    'on',
    true
  );
  perform set_config('monjdb.suppress_trophy_notifications', 'on', true);

  select
    coalesce(array_agg(distinct intervention.id), '{}'::uuid[]),
    coalesce(array_agg(distinct intervention.internal_profile_id), '{}'::uuid[])
  into affected_intervention_ids, affected_internal_profile_ids
  from public.interventions intervention
  where intervention.internal_profile_id = target_profile.id
    or intervention.senior_profile_id = target_profile.id
    or exists (
      select 1
      from public.intervention_evaluations evaluation
      where evaluation.intervention_id = intervention.id
        and evaluation.senior_profile_id = target_profile.id
    )
    or exists (
      select 1
      from public.evaluation_requests request
      where request.intervention_id = intervention.id
        and (
          request.internal_profile_id = target_profile.id
          or request.senior_profile_id = target_profile.id
        )
    );

  select coalesce(array_agg(award.id), '{}'::uuid[])
  into affected_trophy_award_ids
  from public.trophy_awards award
  where award.profile_id = target_profile.id
    or award.profile_id = any(affected_internal_profile_ids);

  delete from public.application_sessions session
  where session.profile_id = target_profile.id
    or session.auth_user_id = deletion_request.auth_user_id;

  delete from public.push_subscriptions subscription
  where subscription.profile_id = target_profile.id;

  -- Only messages addressed exclusively to the target disappear; their
  -- delivered user_notifications cascade with admin_message_id. Shared messages
  -- and their recipients survive with an anonymized author reference.
  delete from public.admin_notification_messages message
  where message.audience_profile_id = target_profile.id;

  update public.admin_notification_messages message
  set created_by_profile_id = null
  where message.created_by_profile_id = target_profile.id;

  delete from public.user_notifications notification
  where notification.profile_id = target_profile.id
    or notification.evaluation_id = any(affected_intervention_ids)
    or exists (
      select 1
      from unnest(affected_intervention_ids) as affected(intervention_id)
      where notification.action_target = affected.intervention_id::text
        or notification.source_key in (
          'evaluation:' || affected.intervention_id::text,
          'intervention:' || affected.intervention_id::text
        )
    );

  -- The target participates in every selected intervention as Internal or
  -- Senior. Requests, evaluations and interventions are all removed explicitly.
  delete from public.evaluation_requests request
  where request.intervention_id = any(affected_intervention_ids);

  delete from public.intervention_evaluations evaluation
  where evaluation.intervention_id = any(affected_intervention_ids);

  delete from public.interventions intervention
  where intervention.id = any(affected_intervention_ids);

  foreach affected_internal_profile_id in array affected_internal_profile_ids
  loop
    perform public.rebuild_profile_trophy_awards(
      affected_internal_profile_id,
      clock_timestamp()
    );
  end loop;

  delete from public.trophy_awards award
  where award.profile_id = target_profile.id;

  -- award_event_id deliberately has no FK to trophy_awards. Only remove
  -- notifications for awards captured in this deletion scope and actually
  -- removed by the targeted rebuild/deletion above.
  delete from public.user_notifications notification
  where notification.kind = 'trophy_awarded'
    and notification.award_event_id = any(affected_trophy_award_ids)
    and (
      notification.profile_id = target_profile.id
      or notification.profile_id = any(affected_internal_profile_ids)
    )
    and not exists (
      select 1
      from public.trophy_awards award
      where award.id = notification.award_event_id
    );

  delete from public.notebook_documents document
  where document.profile_id = target_profile.id;

  delete from public.senior_internal_assignments assignment
  where assignment.senior_profile_id = target_profile.id
    or assignment.internal_profile_id = target_profile.id;

  delete from public.test_feedback feedback
  where feedback.author_profile_id = target_profile.id
    or feedback.profile_id = target_profile.id;

  delete from public.activity_log activity
  where activity.profile_id = target_profile.id
    or activity.created_by_profile_id = target_profile.id
    or activity.target_profile_id = target_profile.id
    or coalesce(activity.analytics_event::text, '') like
      '%' || target_profile.id::text || '%'
    or coalesce(activity.analytics_event::text, '') like
      '%' || deletion_request.auth_user_id::text || '%'
    or exists (
      select 1
      from unnest(affected_intervention_ids) as affected(intervention_id)
      where coalesce(activity.analytics_event::text, '') like
        '%' || affected.intervention_id::text || '%'
        or (
          activity.target_type = 'Intervention'
          and activity.target_label = affected.intervention_id::text
        )
    );

  -- Global catalogues and organizational history survive. Only their author,
  -- owner or modifier references are anonymized.
  update public.profiles profile
  set
    updated_by_profile_id = case
      when profile.updated_by_profile_id = target_profile.id then null
      else profile.updated_by_profile_id
    end,
    metadata = case
      when profile.metadata #>> '{accountLifecycle,deactivatedByProfileId}'
        = target_profile.id::text
        then profile.metadata #- '{accountLifecycle,deactivatedByProfileId}'
      else profile.metadata
    end
  where profile.id <> target_profile.id
    and (
      profile.updated_by_profile_id = target_profile.id
      or profile.metadata #>> '{accountLifecycle,deactivatedByProfileId}'
        = target_profile.id::text
    );

  update public.profiles profile
  set metadata = profile.metadata #- '{accountLifecycle,reactivatedByProfileId}'
  where profile.id <> target_profile.id
    and profile.metadata #>> '{accountLifecycle,reactivatedByProfileId}'
      = target_profile.id::text;

  -- A historical profile without Auth is not touched by prepare. Remove a
  -- possible self-audit reference before the residual-FK fail-closed scan.
  update public.profiles profile
  set updated_by_profile_id = null
  where profile.id = target_profile.id
    and profile.updated_by_profile_id = target_profile.id;

  update public.senior_internal_assignments assignment
  set
    created_by_profile_id = case
      when assignment.created_by_profile_id = target_profile.id then null
      else assignment.created_by_profile_id
    end,
    updated_by_profile_id = case
      when assignment.updated_by_profile_id = target_profile.id then null
      else assignment.updated_by_profile_id
    end
  where assignment.created_by_profile_id = target_profile.id
    or assignment.updated_by_profile_id = target_profile.id;

  update public.surgical_intervention_definitions definition
  set
    definition = public.scrub_profile_audit_json(
      definition.definition,
      target_profile.id
    ),
    owner_profile_id = case
      when definition.owner_profile_id = target_profile.id then null
      else definition.owner_profile_id
    end,
    updated_by_profile_id = case
      when definition.updated_by_profile_id = target_profile.id then null
      else definition.updated_by_profile_id
    end
  where definition.owner_profile_id = target_profile.id
    or definition.updated_by_profile_id = target_profile.id
    or definition.definition is distinct from
      public.scrub_profile_audit_json(definition.definition, target_profile.id);

  update public.interventions intervention
  set
    created_by_profile_id = case
      when intervention.created_by_profile_id = target_profile.id then null
      else intervention.created_by_profile_id
    end,
    updated_by_profile_id = case
      when intervention.updated_by_profile_id = target_profile.id then null
      else intervention.updated_by_profile_id
    end,
    definition_snapshot = public.scrub_profile_audit_json(
      intervention.definition_snapshot,
      target_profile.id
    )
  where intervention.created_by_profile_id = target_profile.id
    or intervention.updated_by_profile_id = target_profile.id
    or intervention.definition_snapshot is distinct from
      public.scrub_profile_audit_json(
        intervention.definition_snapshot,
        target_profile.id
      );

  update public.intervention_evaluations evaluation
  set
    senior_profile_id = case
      when evaluation.senior_profile_id = target_profile.id then null
      else evaluation.senior_profile_id
    end,
    updated_by_profile_id = case
      when evaluation.updated_by_profile_id = target_profile.id then null
      else evaluation.updated_by_profile_id
    end
  where evaluation.senior_profile_id = target_profile.id
    or evaluation.updated_by_profile_id = target_profile.id;

  update public.evaluation_requests request
  set
    created_by_profile_id = case
      when request.created_by_profile_id = target_profile.id then null
      else request.created_by_profile_id
    end,
    updated_by_profile_id = case
      when request.updated_by_profile_id = target_profile.id then null
      else request.updated_by_profile_id
    end
  where request.created_by_profile_id = target_profile.id
    or request.updated_by_profile_id = target_profile.id;

  update public.notebook_documents document
  set updated_by_profile_id = null
  where document.updated_by_profile_id = target_profile.id;

  update public.trophy_definitions definition
  set
    definition = public.scrub_profile_audit_json(
      definition.definition,
      target_profile.id
    ),
    created_by_profile_id = case
      when definition.created_by_profile_id = target_profile.id then null
      else definition.created_by_profile_id
    end,
    updated_by_profile_id = case
      when definition.updated_by_profile_id = target_profile.id then null
      else definition.updated_by_profile_id
    end
  where definition.created_by_profile_id = target_profile.id
    or definition.updated_by_profile_id = target_profile.id
    or definition.definition is distinct from
      public.scrub_profile_audit_json(definition.definition, target_profile.id);

  update public.trophy_awards award
  set
    created_by_profile_id = case
      when award.created_by_profile_id = target_profile.id then null
      else award.created_by_profile_id
    end,
    updated_by_profile_id = case
      when award.updated_by_profile_id = target_profile.id then null
      else award.updated_by_profile_id
    end
  where award.created_by_profile_id = target_profile.id
    or award.updated_by_profile_id = target_profile.id;

  update public.test_feedback feedback
  set updated_by_profile_id = null
  where feedback.updated_by_profile_id = target_profile.id;

  update public.institutions institution
  set
    created_by_profile_id = case
      when institution.created_by_profile_id = target_profile.id then null
      else institution.created_by_profile_id
    end,
    updated_by_profile_id = case
      when institution.updated_by_profile_id = target_profile.id then null
      else institution.updated_by_profile_id
    end
  where institution.created_by_profile_id = target_profile.id
    or institution.updated_by_profile_id = target_profile.id;

  update public.autonomy_score_formulas formula
  set
    definition = public.scrub_profile_audit_json(
      formula.definition,
      target_profile.id
    ),
    created_by_profile_id = case
      when formula.created_by_profile_id = target_profile.id then null
      else formula.created_by_profile_id
    end,
    updated_by_profile_id = case
      when formula.updated_by_profile_id = target_profile.id then null
      else formula.updated_by_profile_id
    end
  where formula.created_by_profile_id = target_profile.id
    or formula.updated_by_profile_id = target_profile.id
    or formula.definition is distinct from
      public.scrub_profile_audit_json(formula.definition, target_profile.id);

  update public.trophy_definition_drafts draft
  set
    definition = public.scrub_profile_audit_json(
      draft.definition,
      target_profile.id
    ),
    created_by_profile_id = case
      when draft.created_by_profile_id = target_profile.id then null
      else draft.created_by_profile_id
    end,
    updated_by_profile_id = case
      when draft.updated_by_profile_id = target_profile.id then null
      else draft.updated_by_profile_id
    end
  where draft.created_by_profile_id = target_profile.id
    or draft.updated_by_profile_id = target_profile.id
    or draft.definition is distinct from
      public.scrub_profile_audit_json(draft.definition, target_profile.id);

  update public.trophy_definition_versions version_row
  set
    definition = public.scrub_profile_audit_json(
      version_row.definition,
      target_profile.id
    ),
    published_by_profile_id = case
      when version_row.published_by_profile_id = target_profile.id then null
      else version_row.published_by_profile_id
    end
  where version_row.published_by_profile_id = target_profile.id
    or version_row.definition is distinct from
      public.scrub_profile_audit_json(
        version_row.definition,
        target_profile.id
      );

  -- app_state is retired but may still exist after a historical restore. Purge
  -- its structured personal records without touching global catalogues.
  target_legacy_id := nullif(target_profile.metadata ->> 'legacy_id', '');

  if to_regclass('public.app_state') is not null then
    -- Retired catalogue copies remain global resources: scrub only embedded
    -- audit UUIDs and preserve every catalogue entry.
    update public.app_state state
    set
      data = public.scrub_profile_audit_json(state.data, target_profile.id),
      updated_at = clock_timestamp()
    where state.key in (
        'custom_surgical_interventions',
        'admin_trophies'
      )
      and state.data is distinct from
        public.scrub_profile_audit_json(state.data, target_profile.id);

    if target_legacy_id is not null then
      select coalesce(array_agg(item ->> 'id'), '{}'::text[])
      into legacy_intervention_ids
      from public.app_state state
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(state.data) = 'array'
          then state.data else '[]'::jsonb end
      ) item
      where state.key = 'saved_interventions'
        and (
          item ->> 'internalId' = target_legacy_id
          or item ->> 'seniorId' = target_legacy_id
        )
        and nullif(item ->> 'id', '') is not null;

      update public.app_state state
      set
        data = coalesce((
          select jsonb_agg(item)
          from jsonb_array_elements(state.data) item
          where coalesce(item ->> 'id', '') <> target_legacy_id
        ), '[]'::jsonb),
        updated_at = clock_timestamp()
      where state.key = 'internal_profiles'
        and jsonb_typeof(state.data) = 'array';

      update public.app_state state
      set
        data = coalesce((
          select jsonb_agg(
            case
              when jsonb_typeof(item -> 'managedInternalIds') = 'array' then
                jsonb_set(
                  item,
                  '{managedInternalIds}',
                  coalesce((
                    select jsonb_agg(managed_id)
                    from jsonb_array_elements(item -> 'managedInternalIds') managed_id
                    where managed_id #>> '{}' is distinct from target_legacy_id
                  ), '[]'::jsonb),
                  true
                )
              else item
            end
          )
          from jsonb_array_elements(state.data) item
          where coalesce(item ->> 'id', '') <> target_legacy_id
        ), '[]'::jsonb),
        updated_at = clock_timestamp()
      where state.key = 'custom_seniors'
        and jsonb_typeof(state.data) = 'array';

      update public.app_state state
      set
        data = coalesce((
          select jsonb_agg(item)
          from jsonb_array_elements(state.data) item
          where coalesce(item ->> 'internalId', '') <> target_legacy_id
        ), '[]'::jsonb),
        updated_at = clock_timestamp()
      where state.key = 'notebook_documents'
        and jsonb_typeof(state.data) = 'array';

      update public.app_state state
      set
        data = coalesce((
          select jsonb_agg(item)
          from jsonb_array_elements(state.data) item
          where coalesce(item ->> 'id', '') <> all(legacy_intervention_ids)
        ), '[]'::jsonb),
        updated_at = clock_timestamp()
      where state.key = 'saved_interventions'
        and jsonb_typeof(state.data) = 'array';

      update public.app_state state
      set
        data = coalesce((
          select jsonb_agg(item)
          from jsonb_array_elements(state.data) item
          where coalesce(item ->> 'internalId', '') <> target_legacy_id
            and coalesce(item ->> 'seniorId', '') <> target_legacy_id
        ), '[]'::jsonb),
        updated_at = clock_timestamp()
      where state.key = 'saved_obstetric_gestures'
        and jsonb_typeof(state.data) = 'array';

      update public.app_state state
      set
        data = case jsonb_typeof(state.data)
          when 'array' then coalesce((
            select jsonb_agg(item)
            from jsonb_array_elements(state.data) item
            where coalesce(item ->> 'interventionId', '')
              <> all(legacy_intervention_ids)
          ), '[]'::jsonb)
          when 'object' then coalesce((
            select jsonb_object_agg(entry.key, entry.value)
            from jsonb_each(state.data) entry
            where entry.key <> all(legacy_intervention_ids)
              and coalesce(entry.value ->> 'interventionId', '')
                <> all(legacy_intervention_ids)
          ), '{}'::jsonb)
          else state.data
        end,
        updated_at = clock_timestamp()
      where state.key = 'admin_evaluations';

      update public.app_state state
      set
        data = coalesce((
          select jsonb_agg(item)
          from jsonb_array_elements(state.data) item
          where coalesce(item ->> 'actorId', '') <> target_legacy_id
        ), '[]'::jsonb),
        updated_at = clock_timestamp()
      where state.key = 'activity_log'
        and jsonb_typeof(state.data) = 'array';
    end if;
  end if;

  delete from public.profile_deletion_requests request
  where request.id = deletion_request.id;

  -- Fail closed if a future migration adds a profile FK not handled above.
  if exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.contype = 'f'
      and constraint_row.confrelid = 'public.profiles'::regclass
      and array_length(constraint_row.conkey, 1) <> 1
  ) then
    raise exception
      'Une nouvelle FK composite vers profiles doit être auditée avant suppression.'
      using errcode = '55000';
  end if;

  for foreign_key in
    select
      constraint_row.conrelid::regclass as referencing_table,
      attribute.attname as referencing_column
    from pg_constraint constraint_row
    join pg_attribute attribute
      on attribute.attrelid = constraint_row.conrelid
     and attribute.attnum = constraint_row.conkey[1]
    where constraint_row.contype = 'f'
      and constraint_row.confrelid = 'public.profiles'::regclass
      and array_length(constraint_row.conkey, 1) = 1
  loop
    execute format(
      'select exists (select 1 from %s where %I = $1)',
      foreign_key.referencing_table,
      foreign_key.referencing_column
    )
    into has_remaining_reference
    using target_profile.id;

    if has_remaining_reference then
      raise exception
        'Référence résiduelle vers le profil dans %.%.',
        foreign_key.referencing_table,
        foreign_key.referencing_column
        using errcode = '55000';
    end if;
  end loop;

  delete from public.profiles profile
  where profile.id = target_profile.id;

  if not found then
    raise exception 'La suppression définitive du profil a échoué.'
      using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'authUserId', deletion_request.auth_user_id,
    'deleted', true,
    'deletedProfileId', target_profile.id,
    'deletionRequestId', deletion_request.id,
    'profileId', target_profile.id
  );
end;
$$;

revoke all on function public.prepare_disabled_profile_deletion(
  uuid,
  bigint,
  uuid,
  text
) from public, anon, authenticated;
grant execute on function public.prepare_disabled_profile_deletion(
  uuid,
  bigint,
  uuid,
  text
) to service_role;

revoke all on function public.finalize_disabled_profile_deletion(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_disabled_profile_deletion(uuid, uuid)
  to service_role;

-- Rate-limit scopes are pseudonymous anti-abuse telemetry rather than profile
-- rows. They cannot be targeted safely by account deletion because the scope
-- also contains the requester IP, so bound their independent retention instead.
create or replace function public.purge_expired_auth_rate_limits()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  purge_time timestamptz := clock_timestamp();
  deleted_row_count bigint;
begin
  delete from public.auth_rate_limits rate_limit
  where rate_limit.updated_at < purge_time - interval '1 hour'
    and (
      rate_limit.blocked_until is null
      or rate_limit.blocked_until <= purge_time
    );

  get diagnostics deleted_row_count = row_count;
  return deleted_row_count;
end;
$$;

revoke all on function public.purge_expired_auth_rate_limits()
  from public, anon, authenticated, service_role;

create extension if not exists pg_cron with schema pg_catalog;

do $schedule_auth_rate_limit_retention$
begin
  if not exists (
    select 1
    from cron.job scheduled_job
    where scheduled_job.jobname = 'monjdb-purge-expired-auth-rate-limits'
  ) then
    perform cron.schedule(
      'monjdb-purge-expired-auth-rate-limits',
      '0 * * * *',
      'select public.purge_expired_auth_rate_limits();'
    );
  end if;
end;
$schedule_auth_rate_limit_retention$;

comment on table public.profile_deletion_requests is
  'Minimal recoverable hand-off between profile/Auth detachment and atomic data purge.';
comment on function public.prepare_disabled_profile_deletion(
  uuid,
  bigint,
  uuid,
  text
) is
  'Idempotently prepares deletion of a disabled profile and returns the Auth identity, if any.';
comment on function public.finalize_disabled_profile_deletion(uuid, uuid) is
  'After proving Auth is gone, atomically purges related data, references and the profile.';
comment on function public.purge_expired_auth_rate_limits() is
  'Privately removes inactive anti-abuse scopes once their one-hour utility window and any active block have expired.';

notify pgrst, 'reload schema';

commit;
