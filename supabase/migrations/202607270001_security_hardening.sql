-- Close the remaining destructive and privacy-sensitive authorization paths.
-- This migration does not delete or rewrite business content. It only adds
-- conservative lifecycle metadata to existing trophy definitions.

-- ---------------------------------------------------------------------------
-- Profiles: authenticated administrators deactivate accounts through the
-- server API. They must never physically delete a profile through PostgREST.
-- A trusted maintenance operation may delete only a profile with no history.
-- ---------------------------------------------------------------------------

drop policy if exists "profiles_admin_delete" on public.profiles;
revoke delete on table public.profiles from authenticated;

create or replace function public.prevent_profile_history_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.interventions intervention
    where intervention.internal_profile_id = old.id
       or intervention.senior_profile_id = old.id
  )
  or exists (
    select 1
    from public.intervention_evaluations evaluation
    where evaluation.senior_profile_id = old.id
  )
  or exists (
    select 1
    from public.evaluation_requests request
    where request.internal_profile_id = old.id
       or request.senior_profile_id = old.id
  )
  or exists (
    select 1
    from public.notebook_documents document
    where document.profile_id = old.id
  )
  or exists (
    select 1
    from public.trophy_awards award
    where award.profile_id = old.id
  )
  or exists (
    select 1
    from public.senior_internal_assignments assignment
    where assignment.internal_profile_id = old.id
       or assignment.senior_profile_id = old.id
  )
  or exists (
    select 1
    from public.surgical_intervention_definitions definition
    where definition.owner_profile_id = old.id
  )
  or exists (
    select 1
    from public.trophy_definitions definition
    where definition.created_by_profile_id = old.id
  )
  or exists (
    select 1
    from public.activity_log event
    where event.profile_id = old.id
       or event.created_by_profile_id = old.id
  )
  or exists (
    select 1
    from public.test_feedback feedback
    where feedback.profile_id = old.id
       or feedback.author_profile_id = old.id
  ) then
    raise exception
      'Un compte ayant produit des données doit être désactivé et ne peut pas être supprimé.'
      using errcode = '55000';
  end if;

  return old;
end;
$$;

drop trigger if exists prevent_profile_history_delete on public.profiles;
create trigger prevent_profile_history_delete
before delete on public.profiles
for each row execute function public.prevent_profile_history_delete();

-- ---------------------------------------------------------------------------
-- Notebook: its content is private to the owning Internal. Administrators keep
-- operational backup access through service_role, not through an app session.
-- ---------------------------------------------------------------------------

drop policy if exists "notebook_select_owner_or_admin"
  on public.notebook_documents;
drop policy if exists "notebook_write_owner_or_admin"
  on public.notebook_documents;
drop policy if exists "notebook_insert_owner_or_admin"
  on public.notebook_documents;
drop policy if exists "notebook_update_owner_or_admin"
  on public.notebook_documents;
drop policy if exists "notebook_delete_owner_or_admin"
  on public.notebook_documents;

create policy "notebook_select_owner"
on public.notebook_documents for select
to authenticated
using (
  profile_id = public.current_profile_id()
  and public.current_app_role() = 'internal'::public.app_role
);

create policy "notebook_insert_owner"
on public.notebook_documents for insert
to authenticated
with check (
  profile_id = public.current_profile_id()
  and public.current_app_role() = 'internal'::public.app_role
);

create policy "notebook_update_owner"
on public.notebook_documents for update
to authenticated
using (
  profile_id = public.current_profile_id()
  and public.current_app_role() = 'internal'::public.app_role
)
with check (
  profile_id = public.current_profile_id()
  and public.current_app_role() = 'internal'::public.app_role
);

revoke delete on table public.notebook_documents from authenticated;

-- ---------------------------------------------------------------------------
-- Audit log: only Administrators may read it and clients may no longer insert
-- arbitrary audit descriptions. A restricted RPC preserves approved product
-- analytics while deriving identity and labels on the server.
-- ---------------------------------------------------------------------------

drop policy if exists "activity_log_select_visible" on public.activity_log;
drop policy if exists "activity_log_insert_authenticated" on public.activity_log;

create policy "activity_log_select_admin"
on public.activity_log for select
to authenticated
using (public.is_admin());

revoke insert, update, delete on table public.activity_log from authenticated;

create or replace function public.record_user_activity_event(
  p_event_kind text,
  p_target_label text default null,
  p_analytics_event jsonb default null
)
returns public.activity_log
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles%rowtype;
  normalized_target_label text := nullif(btrim(coalesce(p_target_label, '')), '');
  event_action text;
  event_target_type text;
  event_target_label text;
  saved_event public.activity_log%rowtype;
begin
  select profile.*
  into actor
  from public.profiles profile
  where profile.id = public.current_profile_id()
    and profile.is_active
  limit 1;

  if actor.id is null then
    raise exception 'Un profil actif est requis.' using errcode = '42501';
  end if;

  if p_analytics_event is not null
    and (
      jsonb_typeof(p_analytics_event) <> 'object'
      or octet_length(p_analytics_event::text) > 4096
    ) then
    raise exception 'Événement analytique invalide.' using errcode = '22023';
  end if;

  case p_event_kind
    when 'view_own_statistics' then
      if actor.role <> 'internal'::public.app_role then
        raise exception 'Événement non autorisé pour ce rôle.' using errcode = '42501';
      end if;

      if normalized_target_label is null
        or normalized_target_label not in (
          'Historique opératoire',
          'Progression pédagogique'
        ) then
        raise exception 'Cible statistique invalide.' using errcode = '22023';
      end if;

      event_action := 'Consultation de ses statistiques opératoires';
      event_target_type := 'Statistiques';
      event_target_label := normalized_target_label;
      p_analytics_event := null;

    when 'view_trophies' then
      if actor.role <> 'internal'::public.app_role then
        raise exception 'Événement non autorisé pour ce rôle.' using errcode = '42501';
      end if;

      event_action := 'Consultation de ses trophées';
      event_target_type := 'Trophées';
      event_target_label := 'Mes trophées';
      p_analytics_event := null;

    when 'view_notebook' then
      if actor.role <> 'internal'::public.app_role then
        raise exception 'Événement non autorisé pour ce rôle.' using errcode = '42501';
      end if;

      event_action := 'Consultation de son bloc-notes';
      event_target_type := 'Bloc-notes';
      event_target_label := 'Notes personnelles';
      p_analytics_event := null;

    when 'view_technical_guide' then
      if actor.role <> 'internal'::public.app_role then
        raise exception 'Événement non autorisé pour ce rôle.' using errcode = '42501';
      end if;

      if normalized_target_label is null
        or length(normalized_target_label) > 200 then
        raise exception 'Fiche technique invalide.' using errcode = '22023';
      end if;

      event_action := 'Consultation d’une fiche technique';
      event_target_type := 'Fiche';
      event_target_label := normalized_target_label;
      p_analytics_event := null;

    when 'view_internal_statistics' then
      if actor.role not in (
        'senior'::public.app_role,
        'admin'::public.app_role
      ) then
        raise exception 'Événement non autorisé pour ce rôle.' using errcode = '42501';
      end if;

      if normalized_target_label is null
        or length(normalized_target_label) > 200 then
        raise exception 'Interne invalide.' using errcode = '22023';
      end if;

      event_action := 'Consultation des statistiques d’un interne';
      event_target_type := 'Interne';
      event_target_label := normalized_target_label;
      p_analytics_event := null;

    when 'prepare_reminder_email' then
      if actor.role <> 'admin'::public.app_role then
        raise exception 'Événement non autorisé pour ce rôle.' using errcode = '42501';
      end if;

      if normalized_target_label is null
        or length(normalized_target_label) > 200 then
        raise exception 'Profil invalide.' using errcode = '22023';
      end if;

      event_action := 'Préparation d’un rappel e-mail';
      event_target_type := 'Relance profil';
      event_target_label := normalized_target_label;
      p_analytics_event := null;

    when 'intervention_form_metrics' then
      if actor.role <> 'internal'::public.app_role
        or p_analytics_event is null
        or p_analytics_event ->> 'kind' <> 'intervention_form'
        or normalized_target_label is null
        or length(normalized_target_label) > 200 then
        raise exception 'Mesure de formulaire invalide.' using errcode = '22023';
      end if;

      event_action := 'Mesure interne du formulaire intervention';
      event_target_type := 'Analytics';
      event_target_label := normalized_target_label;

    when 'senior_evaluation_metrics' then
      if actor.role <> 'senior'::public.app_role
        or p_analytics_event is null
        or p_analytics_event ->> 'kind' <> 'senior_evaluation'
        or normalized_target_label is null
        or length(normalized_target_label) > 200 then
        raise exception 'Mesure d’évaluation invalide.' using errcode = '22023';
      end if;

      event_action := 'Mesure senior du formulaire évaluation';
      event_target_type := 'Analytics';
      event_target_label := normalized_target_label;

    else
      raise exception 'Type d’événement non autorisé.' using errcode = '22023';
  end case;

  insert into public.activity_log (
    profile_id,
    actor_role,
    actor_label,
    action,
    target_type,
    target_label,
    created_by_profile_id,
    analytics_event
  )
  values (
    actor.id,
    actor.role,
    trim(concat_ws(' ', actor.first_name, actor.last_name)),
    event_action,
    event_target_type,
    event_target_label,
    actor.id,
    p_analytics_event
  )
  returning * into saved_event;

  return saved_event;
end;
$$;

revoke all on function public.record_user_activity_event(text, text, jsonb)
  from public;
grant execute on function public.record_user_activity_event(text, text, jsonb)
  to authenticated;

create or replace function public.record_profile_login()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles%rowtype;
  current_login_count integer;
begin
  select profile.*
  into actor
  from public.profiles profile
  where profile.auth_user_id = auth.uid()
    and profile.is_active
  for update;

  if actor.id is null then
    raise exception 'Un profil actif est requis.' using errcode = '42501';
  end if;

  current_login_count := case
    when coalesce(actor.metadata ->> 'loginCount', '') ~ '^[0-9]+$'
      then (actor.metadata ->> 'loginCount')::integer
    else 0
  end;

  update public.profiles
  set
    last_login_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'loginCount', current_login_count + 1
    ),
    updated_by_profile_id = actor.id
  where id = actor.id;

  insert into public.activity_log (
    profile_id,
    actor_role,
    actor_label,
    action,
    target_type,
    target_label,
    created_by_profile_id
  )
  values (
    actor.id,
    actor.role,
    trim(concat_ws(' ', actor.first_name, actor.last_name)),
    'Connexion au profil',
    'Connexion',
    case actor.role
      when 'internal'::public.app_role then 'Espace interne'
      when 'senior'::public.app_role then 'Espace senior'
      else 'Espace administrateur'
    end,
    actor.id
  );
end;
$$;

revoke all on function public.record_profile_login() from public;
grant execute on function public.record_profile_login() to authenticated;

-- ---------------------------------------------------------------------------
-- Trophies: a definition that may have been active is never physically
-- deleted. Existing drafts are considered "unknown" and remain protected until
-- their history is reviewed. New drafts are marked as never activated.
-- ---------------------------------------------------------------------------

alter table public.trophy_definitions
  add column if not exists ever_activated boolean,
  add column if not exists activated_at timestamptz;

update public.trophy_definitions definition
set
  ever_activated = true,
  activated_at = coalesce(
    definition.activated_at,
    definition.updated_at,
    definition.created_at,
    now()
  )
where definition.status in ('active', 'inactive')
   or exists (
     select 1
     from public.trophy_awards award
     where award.trophy_id = definition.id
   );

create or replace function public.protect_trophy_definition_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft'
      or old.ever_activated is distinct from false
      or exists (
        select 1
        from public.trophy_awards award
        where award.trophy_id = old.id
      ) then
      raise exception
        'Un trophée activé ou dont l’historique est incertain doit être désactivé et ne peut pas être supprimé.'
        using errcode = '55000';
    end if;

    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status in ('active', 'inactive') then
      new.ever_activated := true;
      new.activated_at := coalesce(new.activated_at, now());
    else
      new.ever_activated := false;
      new.activated_at := null;
    end if;

    return new;
  end if;

  if old.ever_activated is true
    or new.status in ('active', 'inactive') then
    new.ever_activated := true;
    new.activated_at := coalesce(old.activated_at, new.activated_at, now());
  elsif old.ever_activated is null then
    new.ever_activated := null;
    new.activated_at := old.activated_at;
  else
    new.ever_activated := false;
    new.activated_at := null;
  end if;

  return new;
end;
$$;

drop trigger if exists protect_trophy_definition_lifecycle
  on public.trophy_definitions;
create trigger protect_trophy_definition_lifecycle
before insert or update or delete on public.trophy_definitions
for each row execute function public.protect_trophy_definition_lifecycle();

drop policy if exists "trophy_definitions_admin_delete"
  on public.trophy_definitions;
revoke delete on table public.trophy_definitions from authenticated;

create or replace function public.delete_never_activated_trophy_draft(
  p_trophy_id text,
  p_expected_version bigint
)
returns public.trophy_definitions
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles%rowtype;
  stored_definition public.trophy_definitions%rowtype;
  deleted_definition public.trophy_definitions%rowtype;
begin
  select profile.*
  into actor
  from public.profiles profile
  where profile.id = public.current_profile_id()
    and profile.role = 'admin'::public.app_role
    and profile.is_active
  limit 1;

  if actor.id is null then
    raise exception 'Un Administrateur actif est requis.' using errcode = '42501';
  end if;

  select definition.*
  into stored_definition
  from public.trophy_definitions definition
  where definition.id = p_trophy_id
  for update;

  if stored_definition.id is null then
    raise exception 'Trophée introuvable.' using errcode = 'P0002';
  end if;

  if stored_definition.version <> p_expected_version then
    raise exception 'Ce trophée a été modifié. Rechargez les données.'
      using errcode = '40001';
  end if;

  if stored_definition.status <> 'draft'
    or stored_definition.ever_activated is distinct from false
    or exists (
      select 1
      from public.trophy_awards award
      where award.trophy_id = stored_definition.id
    ) then
    raise exception
      'Seul un brouillon dont l’absence d’activation est certaine peut être supprimé.'
      using errcode = '55000';
  end if;

  delete from public.trophy_definitions definition
  where definition.id = stored_definition.id
  returning * into deleted_definition;

  insert into public.activity_log (
    profile_id,
    actor_role,
    actor_label,
    action,
    target_type,
    target_label,
    created_by_profile_id
  )
  values (
    actor.id,
    actor.role,
    trim(concat_ws(' ', actor.first_name, actor.last_name)),
    'Suppression d’un brouillon de trophée jamais activé',
    'Trophée',
    stored_definition.title,
    actor.id
  );

  return deleted_definition;
end;
$$;

revoke all on function public.delete_never_activated_trophy_draft(text, bigint)
  from public;
grant execute on function public.delete_never_activated_trophy_draft(text, bigint)
  to authenticated;

-- Trophy awards are produced by the future authoritative server engine. No
-- authenticated application role may attribute, edit or remove them directly.
drop policy if exists "trophy_awards_admin_write" on public.trophy_awards;
drop policy if exists "trophy_awards_admin_insert" on public.trophy_awards;
drop policy if exists "trophy_awards_admin_update" on public.trophy_awards;
drop policy if exists "trophy_awards_admin_delete" on public.trophy_awards;
revoke insert, update, delete on table public.trophy_awards from authenticated;
