drop function if exists public.update_own_profile_settings(
  bigint,
  text,
  text,
  text,
  boolean,
  boolean
);

drop function if exists public.update_own_profile_settings(
  bigint,
  text,
  text,
  boolean,
  boolean
);

alter table public.profiles
  drop column if exists current_rotation;

create function public.update_own_profile_settings(
  p_expected_version bigint,
  p_semester text default null,
  p_avatar_image_src text default null,
  p_update_semester boolean default false,
  p_update_avatar boolean default false
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_id uuid := public.current_profile_id();
  updated_profile public.profiles%rowtype;
begin
  if profile_id is null then
    raise exception 'Authentication required';
  end if;

  update public.profiles
  set
    semester = case
      when p_update_semester then upper(trim(coalesce(p_semester, '')))
      else semester
    end,
    avatar_image_src = case
      when p_update_avatar then nullif(trim(coalesce(p_avatar_image_src, '')), '')
      else avatar_image_src
    end,
    updated_by_profile_id = profile_id
  where id = profile_id
    and role = 'internal'::public.app_role
    and is_active
    and version = p_expected_version
    and (
      not p_update_semester
      or trim(coalesce(p_semester, '')) <> ''
    )
  returning * into updated_profile;

  if updated_profile.id is null then
    raise exception 'VERSION_CONFLICT_OR_INVALID_PROFILE';
  end if;

  return updated_profile;
end;
$$;

revoke all on function public.update_own_profile_settings(
  bigint,
  text,
  text,
  boolean,
  boolean
) from public;

grant execute on function public.update_own_profile_settings(
  bigint,
  text,
  text,
  boolean,
  boolean
) to authenticated;
