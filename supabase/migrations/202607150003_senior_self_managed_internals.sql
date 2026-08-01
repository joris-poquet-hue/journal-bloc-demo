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
  limit 1;

  if senior_profile.id is null then
    raise exception 'An active senior profile is required'
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
          and internal_profile.institution = senior_profile.institution
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
  limit 1;

  if senior_profile.id is null then
    raise exception 'An active senior profile is required'
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
      or internal_profile.institution is distinct from senior_profile.institution
  ) then
    raise exception 'Every selected profile must be an active internal from the same institution'
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
revoke all on function public.replace_own_senior_internal_assignments(uuid[]) from public;

grant execute on function public.get_own_senior_internal_settings() to authenticated;
grant execute on function public.replace_own_senior_internal_assignments(uuid[]) to authenticated;
