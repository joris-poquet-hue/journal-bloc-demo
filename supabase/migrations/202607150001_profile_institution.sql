alter table public.profiles
  add column if not exists institution text;

update public.profiles
set institution = 'CHU de Nantes'
where role in ('internal'::public.app_role, 'senior'::public.app_role)
  and nullif(btrim(institution), '') is null;

alter table public.profiles
  drop constraint if exists profiles_clinical_institution_required;

alter table public.profiles
  add constraint profiles_clinical_institution_required
  check (
    role not in ('internal'::public.app_role, 'senior'::public.app_role)
    or nullif(btrim(institution), '') is not null
  ) not valid;

alter table public.profiles
  validate constraint profiles_clinical_institution_required;

drop function if exists public.list_senior_directory();

create function public.list_senior_directory()
returns table (
  id uuid,
  first_name text,
  last_name text,
  institution text,
  created_at timestamptz,
  last_login_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    profile.id,
    profile.first_name,
    profile.last_name,
    profile.institution,
    profile.created_at,
    profile.last_login_at
  from public.profiles profile
  where profile.role = 'senior'::public.app_role
    and profile.is_active
  order by profile.last_name, profile.first_name;
$$;

revoke all on function public.list_senior_directory() from public;
grant execute on function public.list_senior_directory() to authenticated;
