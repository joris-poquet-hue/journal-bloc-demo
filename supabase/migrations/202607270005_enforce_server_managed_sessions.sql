-- Apply only after the server using application_sessions has been deployed.
-- Every authenticated Data API request must then carry a live application
-- session id minted and checked by the Project1 server.

create or replace function public.current_profile_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  session_claim text := auth.jwt() ->> 'app_session_id';
  claimed_session_id uuid;
  resolved_profile_id uuid;
begin
  if session_claim is null
    or session_claim !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    return null;
  end if;

  claimed_session_id := session_claim::uuid;

  select profile.id
  into resolved_profile_id
  from public.application_sessions session_row
  join public.profiles profile
    on profile.id = session_row.profile_id
   and profile.auth_user_id = session_row.auth_user_id
  where session_row.id = claimed_session_id
    and session_row.auth_user_id = auth.uid()
    and session_row.revoked_at is null
    and (
      session_row.idle_timeout_seconds is null
      or session_row.last_seen_at
        >= clock_timestamp()
          - make_interval(secs => session_row.idle_timeout_seconds)
    )
    and profile.is_active
    and not profile.must_change_password
  limit 1;

  return resolved_profile_id;
end;
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
  where profile.id = public.current_profile_id()
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
  where profile.id = public.current_profile_id()
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
  where profile.id = public.current_profile_id()
  limit 1;
$$;
