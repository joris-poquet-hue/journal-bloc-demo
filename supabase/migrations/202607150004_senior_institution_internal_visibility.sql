create or replace function public.current_profile_institution()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select profile.institution
  from public.profiles profile
  where profile.auth_user_id = auth.uid()
    and profile.is_active
  limit 1;
$$;

revoke all on function public.current_profile_institution() from public;
grant execute on function public.current_profile_institution() to authenticated;

drop policy if exists "profiles_select_visible" on public.profiles;

create policy "profiles_select_visible"
on public.profiles for select
to authenticated
using (
  public.is_admin()
  or id = public.current_profile_id()
  or (
    role = 'internal'::public.app_role
    and (
      public.senior_manages_internal(id)
      or (
        public.current_app_role() = 'senior'::public.app_role
        and is_active
        and institution = public.current_profile_institution()
      )
    )
  )
);
