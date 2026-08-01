-- A valid provisional access key may create a short Supabase Auth session, but
-- that session must not expose business data before the user has chosen their
-- e-mail address and personal password.

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

-- Restrictive policies are combined with every existing role-specific policy.
-- They close tables whose permissive read policy otherwise exposes active
-- catalog rows to any authenticated JWT.
do $$
declare
  protected_table text;
begin
  foreach protected_table in array array[
    'profiles',
    'senior_internal_assignments',
    'surgical_intervention_definitions',
    'interventions',
    'evaluation_requests',
    'intervention_evaluations',
    'notebook_documents',
    'trophy_definitions',
    'trophy_awards',
    'activity_log',
    'test_feedback',
    'legacy_app_state_imports',
    'institutions'
  ]
  loop
    if to_regclass(format('public.%I', protected_table)) is not null then
      execute format(
        'drop policy if exists "activated_session_required" on public.%I',
        protected_table
      );
      execute format(
        'create policy "activated_session_required" on public.%I as restrictive for all to authenticated using (public.current_profile_id() is not null) with check (public.current_profile_id() is not null)',
        protected_table
      );
    end if;
  end loop;
end;
$$;

-- This legacy RPC remains necessary after an e-mail recovery. It may never be
-- used to bypass first activation: pending_activation lives in app_metadata,
-- which an authenticated browser cannot modify.
create or replace function public.complete_password_setup(p_contact_email text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_email text := lower(trim(coalesce(p_contact_email, '')));
  auth_email text;
  pending_activation boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid contact email is required' using errcode = '22023';
  end if;

  select
    lower(trim(coalesce(account.email, ''))),
    lower(coalesce(account.raw_app_meta_data ->> 'pending_activation', 'false'))
      = 'true'
  into auth_email, pending_activation
  from auth.users account
  where account.id = auth.uid();

  if auth_email is null
    or auth_email <> normalized_email
    or pending_activation then
    raise exception 'First account activation must use the protected server flow.'
      using errcode = '42501';
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
    raise exception 'Profile not found' using errcode = 'P0002';
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
  actor public.profiles%rowtype;
  current_login_count integer;
begin
  select profile.*
  into actor
  from public.profiles profile
  where profile.auth_user_id = auth.uid()
    and profile.is_active
    and not profile.must_change_password
  for update;

  if actor.id is null then
    raise exception 'Un profil actif et activé est requis.'
      using errcode = '42501';
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

create or replace function public.get_own_senior_internal_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  senior_profile public.profiles%rowtype;
begin
  select profile.*
  into senior_profile
  from public.profiles profile
  where profile.auth_user_id = auth.uid()
    and profile.role = 'senior'::public.app_role
    and profile.is_active
    and not profile.must_change_password
  limit 1;

  if senior_profile.id is null then
    raise exception 'An active and activated senior profile is required'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'seniorProfileId', senior_profile.id,
    'internals', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', internal_profile.id,
            'firstName', internal_profile.first_name,
            'lastName', internal_profile.last_name,
            'semester', internal_profile.semester,
            'isSelected', exists (
              select 1
              from public.senior_internal_assignments assignment
              where assignment.senior_profile_id = senior_profile.id
                and assignment.internal_profile_id = internal_profile.id
            )
          )
          order by internal_profile.last_name, internal_profile.first_name
        )
        from public.profiles internal_profile
        where internal_profile.role = 'internal'::public.app_role
          and internal_profile.is_active
          and internal_profile.institution_id = senior_profile.institution_id
      ),
      '[]'::jsonb
    )
  );
end;
$$;

create or replace function public.replace_own_senior_internal_assignments(
  internal_ids uuid[]
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  senior_profile public.profiles%rowtype;
  normalized_internal_ids uuid[];
begin
  select profile.*
  into senior_profile
  from public.profiles profile
  where profile.auth_user_id = auth.uid()
    and profile.role = 'senior'::public.app_role
    and profile.is_active
    and not profile.must_change_password
  limit 1;

  if senior_profile.id is null then
    raise exception 'An active and activated senior profile is required'
      using errcode = '42501';
  end if;

  select coalesce(
    array_agg(selected.internal_id order by selected.internal_id),
    array[]::uuid[]
  )
  into normalized_internal_ids
  from (
    select distinct unnest(coalesce(internal_ids, array[]::uuid[])) as internal_id
  ) selected;

  if exists (
    select 1
    from unnest(normalized_internal_ids) selected(internal_id)
    left join public.profiles internal_profile
      on internal_profile.id = selected.internal_id
    where internal_profile.id is null
      or internal_profile.role <> 'internal'::public.app_role
      or not internal_profile.is_active
      or internal_profile.institution_id is distinct
        from senior_profile.institution_id
  ) then
    raise exception
      'Every selected profile must be an active internal from the same institution'
      using errcode = '42501';
  end if;

  delete from public.senior_internal_assignments assignment
  where assignment.senior_profile_id = senior_profile.id
    and not assignment.internal_profile_id = any(normalized_internal_ids);

  insert into public.senior_internal_assignments (
    senior_profile_id,
    internal_profile_id
  )
  select senior_profile.id, selected.internal_id
  from unnest(normalized_internal_ids) selected(internal_id)
  on conflict (senior_profile_id, internal_profile_id) do nothing;

  return normalized_internal_ids;
end;
$$;

revoke all on function public.get_own_senior_internal_settings() from public;
revoke all on function public.replace_own_senior_internal_assignments(uuid[])
  from public;
grant execute on function public.get_own_senior_internal_settings()
  to authenticated;
grant execute on function public.replace_own_senior_internal_assignments(uuid[])
  to authenticated;
