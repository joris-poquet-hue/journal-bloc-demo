-- Centre de notifications commun Interne / Senior.
-- Les notifications restent pilotées par Supabase, dédupliquées à la source
-- et les destinataires des messages programmés sont résolus au moment de l'envoi.

create table if not exists public.admin_notification_messages (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  audience_type text not null
    check (audience_type in ('all', 'role', 'institution', 'profile')),
  audience_role public.app_role,
  audience_institution_id uuid references public.institutions(id) on delete restrict,
  audience_profile_id uuid references public.profiles(id) on delete restrict,
  deletion_policy text not null
    check (deletion_policy in ('on_read', 'manual')),
  action_label text,
  action_type text
    check (action_type is null or action_type in ('internal_path', 'external_url')),
  action_target text,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'sending', 'sent', 'cancelled', 'retracted')),
  created_by_profile_id uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sent_at timestamptz,
  cancelled_at timestamptz,
  retracted_at timestamptz,
  constraint admin_notification_messages_title_check
    check (length(btrim(title)) between 1 and 100),
  constraint admin_notification_messages_body_check
    check (length(btrim(body)) between 1 and 1500),
  constraint admin_notification_messages_action_check
    check (
      (action_label is null and action_type is null and action_target is null)
      or (
        length(btrim(coalesce(action_label, ''))) between 1 and 60
        and action_type is not null
        and length(btrim(coalesce(action_target, ''))) between 1 and 500
        and (
          (action_type = 'internal_path' and action_target in (
            '/accueil',
            '/progression',
            '/historique',
            '/trophees',
            '/profil'
          ))
          or (action_type = 'external_url' and action_target ~* '^https://')
        )
      )
    ),
  constraint admin_notification_messages_audience_check
    check (
      (audience_type = 'all'
        and audience_role is null
        and audience_institution_id is null
        and audience_profile_id is null)
      or (audience_type = 'role'
        and audience_role in ('internal'::public.app_role, 'senior'::public.app_role)
        and audience_institution_id is null
        and audience_profile_id is null)
      or (audience_type = 'institution'
        and audience_role is null
        and audience_institution_id is not null
        and audience_profile_id is null)
      or (audience_type = 'profile'
        and audience_role is null
        and audience_institution_id is null
        and audience_profile_id is not null)
    )
);

create index if not exists admin_notification_messages_schedule_idx
  on public.admin_notification_messages (scheduled_at, id)
  where status = 'scheduled';

alter table public.user_notifications
  alter column award_event_id drop not null;

alter table public.user_notifications
  add column if not exists evaluation_id uuid
    references public.intervention_evaluations(intervention_id) on delete cascade,
  add column if not exists admin_message_id uuid
    references public.admin_notification_messages(id) on delete cascade,
  add column if not exists source_key text,
  add column if not exists action_type text,
  add column if not exists action_target text,
  add column if not exists action_label text,
  add column if not exists deletion_policy text not null default 'on_read',
  add column if not exists celebrated_at timestamptz,
  add column if not exists deleted_at timestamptz;

update public.user_notifications notification
set
  source_key = coalesce(
    notification.source_key,
    'trophy:' || notification.award_event_id::text
  ),
  action_type = coalesce(notification.action_type, 'trophy'),
  action_target = coalesce(notification.action_target, notification.trophy_id),
  deletion_policy = 'on_read'
where notification.kind = 'trophy_awarded';

alter table public.user_notifications
  alter column source_key set not null;

alter table public.user_notifications
  drop constraint if exists user_notifications_kind_check,
  drop constraint if exists user_notifications_action_type_check,
  drop constraint if exists user_notifications_deletion_policy_check,
  drop constraint if exists user_notifications_source_check;

alter table public.user_notifications
  add constraint user_notifications_kind_check
    check (kind in ('trophy_awarded', 'evaluation_completed', 'admin_message')),
  add constraint user_notifications_action_type_check
    check (
      action_type is null
      or action_type in ('trophy', 'intervention', 'internal_path', 'external_url')
    ),
  add constraint user_notifications_deletion_policy_check
    check (deletion_policy in ('on_read', 'manual')),
  add constraint user_notifications_source_check
    check (
      (kind = 'trophy_awarded'
        and award_event_id is not null
        and trophy_id is not null
        and evaluation_id is null
        and admin_message_id is null)
      or (kind = 'evaluation_completed'
        and award_event_id is null
        and evaluation_id is not null
        and admin_message_id is null)
      or (kind = 'admin_message'
        and award_event_id is null
        and evaluation_id is null
        and admin_message_id is not null)
    );

create unique index if not exists user_notifications_source_key_idx
  on public.user_notifications (source_key);
create unique index if not exists user_notifications_evaluation_idx
  on public.user_notifications (evaluation_id)
  where evaluation_id is not null;
create unique index if not exists user_notifications_admin_recipient_idx
  on public.user_notifications (admin_message_id, profile_id)
  where admin_message_id is not null;
create index if not exists user_notifications_profile_center_idx
  on public.user_notifications (profile_id, read_at, created_at desc)
  where deleted_at is null;

alter table public.admin_notification_messages enable row level security;
revoke all on table public.admin_notification_messages
  from public, anon, authenticated;

create policy "admin_notification_messages_admin_read"
on public.admin_notification_messages for select
to authenticated
using (public.is_admin());

grant select on table public.admin_notification_messages to authenticated;

-- Les nouvelles obtentions créent exactement une notification durable.
create or replace function public.create_trophy_award_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting('monjdb.suppress_trophy_notifications', true) = 'on' then
    return null;
  end if;

  insert into public.user_notifications (
    award_event_id,
    profile_id,
    kind,
    trophy_id,
    tier,
    title,
    body,
    created_at,
    source_key,
    action_type,
    action_target,
    deletion_policy
  )
  select distinct on (award.profile_id, award.trophy_id)
    award.id,
    award.profile_id,
    'trophy_awarded',
    award.trophy_id,
    award.tier,
    'Nouveau trophée',
    'Vous avez obtenu un nouveau trophée : ' || definition.title || ' !',
    now(),
    'trophy:' || award.id::text,
    'trophy',
    award.trophy_id,
    'on_read'
  from inserted_awards award
  join public.trophy_definitions definition
    on definition.id = award.trophy_id
   and definition.status = 'active'
  join public.profiles profile
    on profile.id = award.profile_id
   and profile.role = 'internal'::public.app_role
   and profile.is_active
  order by
    award.profile_id,
    award.trophy_id,
    case award.tier
      when 'diamond' then 4
      when 'gold' then 3
      when 'silver' then 2
      else 1
    end desc,
    award.awarded_at desc
  on conflict (source_key) do nothing;

  return null;
end;
$$;

-- Une évaluation validée notifie uniquement l'Interne concerné.
create or replace function public.create_evaluation_completed_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_notifications (
    evaluation_id,
    profile_id,
    kind,
    title,
    body,
    created_at,
    source_key,
    action_type,
    action_target,
    deletion_policy,
    push_status
  )
  select
    new.intervention_id,
    intervention.internal_profile_id,
    'evaluation_completed',
    'Évaluation complétée',
    'Une évaluation a été complétée par ' ||
      trim(concat_ws(' ', senior.first_name, senior.last_name)),
    coalesce(new.created_at, now()),
    'evaluation:' || new.intervention_id::text,
    'intervention',
    new.intervention_id::text,
    'on_read',
    'unavailable'
  from public.interventions intervention
  join public.profiles internal_profile
    on internal_profile.id = intervention.internal_profile_id
   and internal_profile.role = 'internal'::public.app_role
   and internal_profile.is_active
  join public.profiles senior
    on senior.id = new.senior_profile_id
  where intervention.id = new.intervention_id
  on conflict (source_key) do nothing;

  return new;
end;
$$;

drop trigger if exists notify_evaluation_completed
  on public.intervention_evaluations;
create trigger notify_evaluation_completed
after insert on public.intervention_evaluations
for each row execute function public.create_evaluation_completed_notification();

create or replace function public.admin_notification_recipient_ids(
  p_audience_type text,
  p_audience_role public.app_role,
  p_audience_institution_id uuid,
  p_audience_profile_id uuid
)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select profile.id
  from public.profiles profile
  where profile.is_active
    and profile.role in ('internal'::public.app_role, 'senior'::public.app_role)
    and (
      p_audience_type = 'all'
      or (p_audience_type = 'role' and profile.role = p_audience_role)
      or (
        p_audience_type = 'institution'
        and profile.institution_id = p_audience_institution_id
      )
      or (p_audience_type = 'profile' and profile.id = p_audience_profile_id)
    )
  order by profile.id;
$$;

revoke all on function public.admin_notification_recipient_ids(
  text,
  public.app_role,
  uuid,
  uuid
) from public, anon, authenticated;

create or replace function public.dispatch_admin_notification_message(
  p_message_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  message_row public.admin_notification_messages%rowtype;
  inserted_count integer := 0;
begin
  select message.*
  into message_row
  from public.admin_notification_messages message
  where message.id = p_message_id
  for update;

  if message_row.id is null
    or message_row.status <> 'scheduled'
    or message_row.scheduled_at > now() then
    return 0;
  end if;

  update public.admin_notification_messages message
  set status = 'sending', updated_at = now()
  where message.id = message_row.id;

  insert into public.user_notifications (
    admin_message_id,
    profile_id,
    kind,
    title,
    body,
    created_at,
    source_key,
    action_type,
    action_target,
    action_label,
    deletion_policy,
    push_status
  )
  select
    message_row.id,
    recipient_id,
    'admin_message',
    message_row.title,
    message_row.body,
    now(),
    'admin:' || message_row.id::text || ':' || recipient_id::text,
    message_row.action_type,
    message_row.action_target,
    message_row.action_label,
    message_row.deletion_policy,
    'unavailable'
  from public.admin_notification_recipient_ids(
    message_row.audience_type,
    message_row.audience_role,
    message_row.audience_institution_id,
    message_row.audience_profile_id
  ) as recipient(recipient_id)
  on conflict (source_key) do nothing;

  get diagnostics inserted_count = row_count;

  update public.admin_notification_messages message
  set status = 'sent', sent_at = now(), updated_at = now()
  where message.id = message_row.id;

  return inserted_count;
end;
$$;

revoke all on function public.dispatch_admin_notification_message(uuid)
  from public, anon, authenticated;

create or replace function public.dispatch_due_admin_notification_messages()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  due_message record;
  dispatched_count integer := 0;
begin
  for due_message in
    select message.id
    from public.admin_notification_messages message
    where message.status = 'scheduled'
      and message.scheduled_at <= now()
    order by message.scheduled_at, message.id
    for update skip locked
  loop
    dispatched_count := dispatched_count +
      public.dispatch_admin_notification_message(due_message.id);
  end loop;

  return dispatched_count;
end;
$$;

revoke all on function public.dispatch_due_admin_notification_messages()
  from public, anon, authenticated;
grant execute on function public.dispatch_due_admin_notification_messages()
  to service_role;

create or replace function public.count_admin_notification_recipients(
  p_audience_type text,
  p_audience_role public.app_role default null,
  p_audience_institution_id uuid default null,
  p_audience_profile_id uuid default null
)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  recipient_count integer;
begin
  if not public.is_admin() then
    raise exception 'Accès réservé à l’administrateur.' using errcode = '42501';
  end if;

  select count(*)::integer
  into recipient_count
  from public.admin_notification_recipient_ids(
    p_audience_type,
    p_audience_role,
    p_audience_institution_id,
    p_audience_profile_id
  );

  return recipient_count;
end;
$$;

revoke all on function public.count_admin_notification_recipients(
  text,
  public.app_role,
  uuid,
  uuid
) from public;
grant execute on function public.count_admin_notification_recipients(
  text,
  public.app_role,
  uuid,
  uuid
) to authenticated;

create or replace function public.create_admin_notification_message(
  p_title text,
  p_body text,
  p_audience_type text,
  p_audience_role public.app_role default null,
  p_audience_institution_id uuid default null,
  p_audience_profile_id uuid default null,
  p_deletion_policy text default 'manual',
  p_action_label text default null,
  p_action_type text default null,
  p_action_target text default null,
  p_scheduled_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile_id uuid := public.current_profile_id();
  message_row public.admin_notification_messages%rowtype;
  recipient_count integer;
begin
  if actor_profile_id is null or not public.is_admin() then
    raise exception 'Accès réservé à l’administrateur.' using errcode = '42501';
  end if;

  if p_audience_type not in ('all', 'role', 'institution', 'profile') then
    raise exception 'Ciblage invalide.' using errcode = '22023';
  end if;

  if p_deletion_policy not in ('on_read', 'manual') then
    raise exception 'Politique de conservation invalide.' using errcode = '22023';
  end if;

  insert into public.admin_notification_messages (
    title,
    body,
    audience_type,
    audience_role,
    audience_institution_id,
    audience_profile_id,
    deletion_policy,
    action_label,
    action_type,
    action_target,
    scheduled_at,
    created_by_profile_id
  ) values (
    btrim(p_title),
    btrim(p_body),
    p_audience_type,
    p_audience_role,
    p_audience_institution_id,
    p_audience_profile_id,
    p_deletion_policy,
    nullif(btrim(coalesce(p_action_label, '')), ''),
    p_action_type,
    nullif(btrim(coalesce(p_action_target, '')), ''),
    coalesce(p_scheduled_at, now()),
    actor_profile_id
  )
  returning * into message_row;

  if message_row.scheduled_at <= now() then
    recipient_count := public.dispatch_admin_notification_message(message_row.id);
    select * into message_row
    from public.admin_notification_messages message
    where message.id = message_row.id;
  else
    recipient_count := public.count_admin_notification_recipients(
      message_row.audience_type,
      message_row.audience_role,
      message_row.audience_institution_id,
      message_row.audience_profile_id
    );
  end if;

  return jsonb_build_object(
    'message', to_jsonb(message_row),
    'recipientCount', recipient_count
  );
end;
$$;

revoke all on function public.create_admin_notification_message(
  text,
  text,
  text,
  public.app_role,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  timestamptz
) from public;
grant execute on function public.create_admin_notification_message(
  text,
  text,
  text,
  public.app_role,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  timestamptz
) to authenticated;

create or replace function public.update_admin_notification_message(
  p_message_id uuid,
  p_title text,
  p_body text,
  p_audience_type text,
  p_audience_role public.app_role default null,
  p_audience_institution_id uuid default null,
  p_audience_profile_id uuid default null,
  p_deletion_policy text default 'manual',
  p_action_label text default null,
  p_action_type text default null,
  p_action_target text default null,
  p_scheduled_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  message_row public.admin_notification_messages%rowtype;
  recipient_count integer;
begin
  if not public.is_admin() then
    raise exception 'Accès réservé à l’administrateur.' using errcode = '42501';
  end if;

  if p_audience_type not in ('all', 'role', 'institution', 'profile') then
    raise exception 'Ciblage invalide.' using errcode = '22023';
  end if;

  if p_deletion_policy not in ('on_read', 'manual') then
    raise exception 'Politique de conservation invalide.' using errcode = '22023';
  end if;

  update public.admin_notification_messages message
  set
    title = btrim(p_title),
    body = btrim(p_body),
    audience_type = p_audience_type,
    audience_role = p_audience_role,
    audience_institution_id = p_audience_institution_id,
    audience_profile_id = p_audience_profile_id,
    deletion_policy = p_deletion_policy,
    action_label = nullif(btrim(coalesce(p_action_label, '')), ''),
    action_type = p_action_type,
    action_target = nullif(btrim(coalesce(p_action_target, '')), ''),
    scheduled_at = coalesce(p_scheduled_at, message.scheduled_at),
    updated_at = now()
  where message.id = p_message_id
    and message.status = 'scheduled'
    and message.scheduled_at > now()
  returning * into message_row;

  if message_row.id is null then
    raise exception 'Ce message ne peut plus être modifié.' using errcode = '55000';
  end if;

  recipient_count := public.count_admin_notification_recipients(
    message_row.audience_type,
    message_row.audience_role,
    message_row.audience_institution_id,
    message_row.audience_profile_id
  );

  return jsonb_build_object(
    'message', to_jsonb(message_row),
    'recipientCount', recipient_count
  );
end;
$$;

revoke all on function public.update_admin_notification_message(
  uuid,
  text,
  text,
  text,
  public.app_role,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  timestamptz
) from public;
grant execute on function public.update_admin_notification_message(
  uuid,
  text,
  text,
  text,
  public.app_role,
  uuid,
  uuid,
  text,
  text,
  text,
  text,
  timestamptz
) to authenticated;

create or replace function public.cancel_admin_notification_message(
  p_message_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Accès réservé à l’administrateur.' using errcode = '42501';
  end if;

  update public.admin_notification_messages message
  set status = 'cancelled', cancelled_at = now(), updated_at = now()
  where message.id = p_message_id
    and message.status = 'scheduled';

  if not found then
    raise exception 'Ce message ne peut plus être annulé.' using errcode = '55000';
  end if;
end;
$$;

revoke all on function public.cancel_admin_notification_message(uuid) from public;
grant execute on function public.cancel_admin_notification_message(uuid)
  to authenticated;

create or replace function public.retract_admin_notification_message(
  p_message_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Accès réservé à l’administrateur.' using errcode = '42501';
  end if;

  update public.admin_notification_messages message
  set status = 'retracted', retracted_at = now(), updated_at = now()
  where message.id = p_message_id
    and message.status = 'sent';

  if not found then
    raise exception 'Ce message ne peut pas être retiré.' using errcode = '55000';
  end if;

  update public.user_notifications notification
  set deleted_at = coalesce(notification.deleted_at, now())
  where notification.admin_message_id = p_message_id;
end;
$$;

revoke all on function public.retract_admin_notification_message(uuid) from public;
grant execute on function public.retract_admin_notification_message(uuid)
  to authenticated;

create or replace function public.mark_user_notification_read(
  p_notification_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_notifications notification
  set
    read_at = coalesce(notification.read_at, now()),
    deleted_at = case
      when notification.deletion_policy = 'on_read'
        then coalesce(notification.deleted_at, now())
      else notification.deleted_at
    end
  where notification.id = p_notification_id
    and notification.profile_id = public.current_profile_id()
    and notification.deleted_at is null;

  if not found then
    raise exception 'Notification introuvable.' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.mark_all_user_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  update public.user_notifications notification
  set
    read_at = coalesce(notification.read_at, now()),
    deleted_at = case
      when notification.deletion_policy = 'on_read'
        then coalesce(notification.deleted_at, now())
      else notification.deleted_at
    end
  where notification.profile_id = public.current_profile_id()
    and notification.read_at is null
    and notification.deleted_at is null;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

revoke all on function public.mark_user_notification_read(uuid) from public;
grant execute on function public.mark_user_notification_read(uuid)
  to authenticated;

revoke all on function public.mark_all_user_notifications_read() from public;
grant execute on function public.mark_all_user_notifications_read()
  to authenticated;

create or replace function public.delete_user_notification(
  p_notification_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_notifications notification
  set deleted_at = now()
  where notification.id = p_notification_id
    and notification.profile_id = public.current_profile_id()
    and notification.deletion_policy = 'manual'
    and notification.deleted_at is null;

  if not found then
    raise exception 'Cette notification ne peut pas être supprimée.'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.delete_user_notification(uuid) from public;
grant execute on function public.delete_user_notification(uuid)
  to authenticated;

create or replace function public.mark_trophy_notification_celebrated(
  p_notification_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_notifications notification
  set celebrated_at = coalesce(notification.celebrated_at, now())
  where notification.id = p_notification_id
    and notification.profile_id = public.current_profile_id()
    and notification.kind = 'trophy_awarded'
    and notification.deleted_at is null;

  if not found then
    raise exception 'Notification de trophée introuvable.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.mark_trophy_notification_celebrated(uuid)
  from public;
grant execute on function public.mark_trophy_notification_celebrated(uuid)
  to authenticated;

-- Supabase exécute la distribution des messages programmés chaque minute.
create extension if not exists pg_cron with schema pg_catalog;

do $$
begin
  if not exists (
    select 1
    from cron.job
    where jobname = 'monjdb-dispatch-admin-notifications'
  ) then
    perform cron.schedule(
      'monjdb-dispatch-admin-notifications',
      '* * * * *',
      'select public.dispatch_due_admin_notification_messages();'
    );
  end if;
end;
$$;
