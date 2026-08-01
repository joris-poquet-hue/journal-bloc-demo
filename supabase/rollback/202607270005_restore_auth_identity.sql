-- Emergency rollback for 202607270005_enforce_server_managed_sessions.sql.
-- This file is never applied automatically. It restores the identity helpers
-- from 202607270003 so the previously deployed client can be restored while the
-- inert application_sessions registry remains available for diagnosis.

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select profile.id
  from public.profiles profile
  where profile.auth_user_id = auth.uid()
    and profile.is_active
    and not profile.must_change_password
  limit 1;
$$;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select profile.role
  from public.profiles profile
  where profile.auth_user_id = auth.uid()
    and profile.is_active
    and not profile.must_change_password
  limit 1;
$$;

create or replace function public.current_profile_institution_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select profile.institution_id
  from public.profiles profile
  where profile.auth_user_id = auth.uid()
    and profile.is_active
    and not profile.must_change_password
  limit 1;
$$;

create or replace function public.current_profile_institution()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select institution.name
  from public.profiles profile
  join public.institutions institution
    on institution.id = profile.institution_id
  where profile.auth_user_id = auth.uid()
    and profile.is_active
    and not profile.must_change_password
  limit 1;
$$;
