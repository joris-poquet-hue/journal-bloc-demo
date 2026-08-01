-- Supabase Auth becomes the only source of credentials. Passwords must never be
-- stored in public tables, JSON application state, or browser profile objects.

create table if not exists public.auth_rate_limits (
  scope text primary key,
  failure_count integer not null default 0 check (failure_count >= 0),
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.auth_rate_limits enable row level security;

-- No client policy is created intentionally. Only the service role used by the
-- authentication endpoint can read or update rate-limit records.

create index if not exists auth_rate_limits_updated_at_idx
  on public.auth_rate_limits (updated_at);

create or replace function public.complete_password_setup(p_contact_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_email text := lower(trim(coalesce(p_contact_email, '')));
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid contact email is required';
  end if;

  update public.profiles
  set
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'contactEmail', normalized_email
    ),
    must_change_password = false,
    updated_at = now()
  where auth_user_id = auth.uid();

  if not found then
    raise exception 'Profile not found';
  end if;
end;
$$;

revoke all on function public.complete_password_setup(text) from public;
grant execute on function public.complete_password_setup(text) to authenticated;

create or replace function public.record_profile_login()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_login_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select
    case
      when coalesce(metadata ->> 'loginCount', '') ~ '^[0-9]+$'
        then (metadata ->> 'loginCount')::integer
      else 0
    end
  into current_login_count
  from public.profiles
  where auth_user_id = auth.uid();

  update public.profiles
  set
    last_login_at = now(),
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'loginCount', coalesce(current_login_count, 0) + 1
    ),
    updated_at = now()
  where auth_user_id = auth.uid();
end;
$$;

revoke all on function public.record_profile_login() from public;
grant execute on function public.record_profile_login() to authenticated;

-- Remove legacy clear-text credentials already stored in app_state. This is
-- idempotent and safe if the legacy table has already been removed.
do $$
begin
  if to_regclass('public.app_state') is not null then
    update public.app_state
    set
      data = coalesce(
        (
          select jsonb_agg(item - 'password')
          from jsonb_array_elements(data) as item
        ),
        '[]'::jsonb
      ),
      updated_at = now()
    where key in ('internal_profiles', 'custom_seniors')
      and jsonb_typeof(data) = 'array';
  end if;
end;
$$;

-- Every migrated account must establish a new personal password. The separate
-- invalidate-legacy-secrets script rotates Auth secrets before go-live.
update public.profiles
set must_change_password = true
where auth_user_id is not null;
