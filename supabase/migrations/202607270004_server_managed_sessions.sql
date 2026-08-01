-- Browser and mobile clients authenticate through an opaque application
-- session. Supabase access and refresh tokens are never persisted client-side.

create table if not exists public.application_sessions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete restrict,
  auth_user_id uuid not null,
  token_hash text not null unique
    check (token_hash ~ '^[0-9a-f]{64}$'),
  client_kind text not null
    check (client_kind in ('web', 'mobile')),
  auth_context text not null default 'standard'
    check (auth_context in ('standard', 'recovery')),
  idle_timeout_seconds integer
    check (
      idle_timeout_seconds is null
      or idle_timeout_seconds between 60 and 86400
    ),
  created_at timestamptz not null default clock_timestamp(),
  last_seen_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  revocation_reason text,
  user_agent_hash text
    check (
      user_agent_hash is null
      or user_agent_hash ~ '^[0-9a-f]{64}$'
    )
);

create index if not exists application_sessions_profile_active_idx
  on public.application_sessions (profile_id, created_at desc)
  where revoked_at is null;

create index if not exists application_sessions_auth_user_active_idx
  on public.application_sessions (auth_user_id, created_at desc)
  where revoked_at is null;

alter table public.application_sessions enable row level security;
revoke all on table public.application_sessions from anon, authenticated;
grant select, insert, update, delete
  on table public.application_sessions
  to service_role;

create or replace function public.resolve_application_session(
  p_token_hash text,
  p_touch boolean default false
)
returns table (
  session_id uuid,
  profile_id uuid,
  auth_user_id uuid,
  role public.app_role,
  client_kind text,
  auth_context text,
  must_change_password boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  resolved_session public.application_sessions%rowtype;
  resolved_profile public.profiles%rowtype;
  resolved_at timestamptz := clock_timestamp();
begin
  if coalesce(p_token_hash, '') !~ '^[0-9a-f]{64}$' then
    return;
  end if;

  select session_row.*
  into resolved_session
  from public.application_sessions session_row
  where session_row.token_hash = p_token_hash
  for update;

  if resolved_session.id is null or resolved_session.revoked_at is not null then
    return;
  end if;

  select profile.*
  into resolved_profile
  from public.profiles profile
  where profile.id = resolved_session.profile_id
    and profile.auth_user_id = resolved_session.auth_user_id
  limit 1;

  if resolved_profile.id is null or not resolved_profile.is_active then
    update public.application_sessions
    set
      revoked_at = coalesce(revoked_at, resolved_at),
      revocation_reason = coalesce(
        revocation_reason,
        'account_deactivated'
      )
    where id = resolved_session.id;
    return;
  end if;

  if
    resolved_session.idle_timeout_seconds is not null
    and resolved_session.last_seen_at
      < resolved_at
        - make_interval(secs => resolved_session.idle_timeout_seconds)
  then
    update public.application_sessions
    set
      revoked_at = resolved_at,
      revocation_reason = 'inactivity_timeout'
    where id = resolved_session.id;
    return;
  end if;

  if p_touch then
    update public.application_sessions
    set last_seen_at = resolved_at
    where id = resolved_session.id;
  end if;

  return query
  select
    resolved_session.id,
    resolved_profile.id,
    resolved_profile.auth_user_id,
    resolved_profile.role,
    resolved_session.client_kind,
    resolved_session.auth_context,
    resolved_profile.must_change_password;
end;
$$;

revoke all on function public.resolve_application_session(text, boolean)
  from public, anon, authenticated;
grant execute on function public.resolve_application_session(text, boolean)
  to service_role;

create or replace function public.revoke_application_session(
  p_session_id uuid,
  p_reason text default 'session_cleanup'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  revoked_count integer := 0;
begin
  update public.application_sessions
  set
    revoked_at = clock_timestamp(),
    revocation_reason = coalesce(
      nullif(trim(coalesce(p_reason, '')), ''),
      'session_cleanup'
    )
  where id = p_session_id
    and revoked_at is null;

  get diagnostics revoked_count = row_count;
  return revoked_count > 0;
end;
$$;

revoke all on function public.revoke_application_session(uuid, text)
  from public, anon, authenticated;
grant execute on function public.revoke_application_session(uuid, text)
  to service_role;

create or replace function public.revoke_all_application_sessions(
  p_profile_id uuid,
  p_reason text default 'voluntary_logout'
)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_auth_user_id uuid;
  revoked_count integer := 0;
begin
  select profile.auth_user_id
  into target_auth_user_id
  from public.profiles profile
  where profile.id = p_profile_id
  for update;

  if not found then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  update public.application_sessions
  set
    revoked_at = coalesce(revoked_at, clock_timestamp()),
    revocation_reason = coalesce(
      revocation_reason,
      nullif(trim(coalesce(p_reason, '')), ''),
      'voluntary_logout'
    )
  where profile_id = p_profile_id
    and revoked_at is null;

  get diagnostics revoked_count = row_count;

  if target_auth_user_id is not null then
    delete from auth.sessions
    where user_id = target_auth_user_id;
  end if;

  return revoked_count;
end;
$$;

revoke all on function public.revoke_all_application_sessions(uuid, text)
  from public, anon, authenticated;
grant execute on function public.revoke_all_application_sessions(uuid, text)
  to service_role;

comment on table public.application_sessions is
  'Opaque web/mobile session registry. Raw session tokens are never stored.';
