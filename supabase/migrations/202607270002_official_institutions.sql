-- Official institution registry and stable institution-based authorization.
-- The legacy profiles.institution text remains during the transition, but it is
-- synchronized from institutions.name and no longer drives authorization.

create table if not exists public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  version bigint not null default 1,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  updated_by_profile_id uuid references public.profiles(id) on delete set null,
  constraint institutions_name_not_blank
    check (nullif(btrim(name), '') is not null),
  constraint institutions_name_trimmed
    check (name = btrim(name)),
  constraint institutions_status_check
    check (status in ('active', 'archived')),
  constraint institutions_archive_state_check
    check (
      (status = 'active' and archived_at is null)
      or (status = 'archived' and archived_at is not null)
    )
);

create unique index if not exists institutions_name_unique_idx
  on public.institutions (lower(name));

drop trigger if exists audit_institutions_version on public.institutions;
create trigger audit_institutions_version
before insert or update on public.institutions
for each row execute function public.audit_versioned_record();

create or replace function public.prevent_institution_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  raise exception
    'Un établissement ne peut pas être supprimé. Archivez-le pour conserver son historique.'
    using errcode = '55000';
end;
$$;

drop trigger if exists prevent_institution_delete on public.institutions;
create trigger prevent_institution_delete
before delete on public.institutions
for each row execute function public.prevent_institution_delete();

insert into public.institutions (name, status)
values ('CHU de Nantes', 'active')
on conflict (lower(name)) do nothing;

alter table public.profiles
  add column if not exists institution_id uuid
    references public.institutions(id) on delete restrict;

create index if not exists profiles_institution_id_role_active_idx
  on public.profiles (institution_id, role, is_active);

update public.profiles profile
set institution_id = institution.id,
    institution = institution.name
from public.institutions institution
where profile.role in ('internal'::public.app_role, 'senior'::public.app_role)
  and lower(btrim(profile.institution)) = lower(institution.name)
  and profile.institution_id is null;

do $$
declare
  unmatched_names text;
begin
  select string_agg(
    distinct coalesce(nullif(btrim(profile.institution), ''), '<vide>'),
    ', '
    order by coalesce(nullif(btrim(profile.institution), ''), '<vide>')
  )
  into unmatched_names
  from public.profiles profile
  where profile.role in ('internal'::public.app_role, 'senior'::public.app_role)
    and profile.institution_id is null;

  if unmatched_names is not null then
    raise exception
      'Migration interrompue : rattachements non validés pour %.',
      unmatched_names
      using errcode = '23514';
  end if;
end;
$$;

alter table public.profiles
  drop constraint if exists profiles_role_institution_id_consistency;

alter table public.profiles
  add constraint profiles_role_institution_id_consistency
  check (
    (
      role in ('internal'::public.app_role, 'senior'::public.app_role)
      and institution_id is not null
    )
    or (
      role = 'admin'::public.app_role
      and institution_id is null
    )
  ) not valid;

alter table public.profiles
  validate constraint profiles_role_institution_id_consistency;

create or replace function public.sync_profile_institution_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_institution public.institutions%rowtype;
  institution_change_allowed boolean :=
    coalesce(current_setting('app.allow_institution_move', true), '') = 'on';
begin
  if new.role = 'admin'::public.app_role then
    new.institution_id := null;
    new.institution := null;
    return new;
  end if;

  if tg_op = 'UPDATE'
    and new.institution_id is distinct from old.institution_id
    and not institution_change_allowed then
    raise exception
      'Utilisez la fonction atomique de déplacement d’établissement.'
      using errcode = '42501';
  end if;

  if new.institution_id is not null then
    select institution.*
    into resolved_institution
    from public.institutions institution
    where institution.id = new.institution_id;
  elsif nullif(btrim(coalesce(new.institution, '')), '') is not null then
    select institution.*
    into resolved_institution
    from public.institutions institution
    where lower(institution.name) = lower(btrim(new.institution));
  end if;

  if resolved_institution.id is null then
    raise exception
      'Sélectionnez un établissement présent dans le référentiel officiel.'
      using errcode = '23503';
  end if;

  if (
    tg_op = 'INSERT'
    or (tg_op = 'UPDATE' and new.institution_id is distinct from old.institution_id)
  )
    and resolved_institution.status <> 'active' then
    raise exception
      'Un établissement archivé ne peut pas recevoir une nouvelle affectation.'
      using errcode = '23514';
  end if;

  new.institution_id := resolved_institution.id;
  new.institution := resolved_institution.name;
  return new;
end;
$$;

drop trigger if exists sync_profile_institution_reference on public.profiles;
create trigger sync_profile_institution_reference
before insert or update of role, institution_id, institution
on public.profiles
for each row execute function public.sync_profile_institution_reference();

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
  limit 1;
$$;

create or replace function public.senior_can_read_internal(internal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles senior_profile
    join public.profiles internal_profile
      on internal_profile.id = internal_id
    where senior_profile.id = public.current_profile_id()
      and senior_profile.role = 'senior'::public.app_role
      and senior_profile.is_active
      and internal_profile.role = 'internal'::public.app_role
      and internal_profile.is_active
      and senior_profile.institution_id is not distinct
        from internal_profile.institution_id
  );
$$;

create or replace function public.can_read_internal(internal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin()
    or public.current_profile_id() = internal_id
    or public.senior_can_read_internal(internal_id);
$$;

revoke all on function public.current_profile_institution_id() from public;
revoke all on function public.current_profile_institution() from public;
revoke all on function public.senior_can_read_internal(uuid) from public;
revoke all on function public.can_read_internal(uuid) from public;
grant execute on function public.current_profile_institution_id() to authenticated;
grant execute on function public.current_profile_institution() to authenticated;
grant execute on function public.senior_can_read_internal(uuid) to authenticated;
grant execute on function public.can_read_internal(uuid) to authenticated;

drop function if exists public.list_senior_directory();
create function public.list_senior_directory()
returns table (
  id uuid,
  first_name text,
  last_name text,
  institution text,
  institution_id uuid,
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
    institution.name,
    institution.id,
    profile.created_at,
    profile.last_login_at
  from public.profiles profile
  join public.institutions institution
    on institution.id = profile.institution_id
  where profile.role = 'senior'::public.app_role
    and profile.is_active
    and (
      public.is_admin()
      or profile.institution_id is not distinct
        from public.current_profile_institution_id()
    )
  order by profile.last_name, profile.first_name;
$$;

drop function if exists public.list_visible_internal_directory();
create function public.list_visible_internal_directory()
returns table (
  id uuid,
  first_name text,
  last_name text,
  institution text,
  institution_id uuid,
  promotion text,
  semester text,
  avatar_image_src text,
  created_at timestamptz,
  updated_at timestamptz,
  version bigint
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
    institution.name,
    institution.id,
    profile.promotion,
    profile.semester,
    profile.avatar_image_src,
    profile.created_at,
    profile.updated_at,
    profile.version
  from public.profiles profile
  join public.institutions institution
    on institution.id = profile.institution_id
  where profile.role = 'internal'::public.app_role
    and profile.is_active
    and (
      public.is_admin()
      or (
        public.current_app_role() = 'senior'::public.app_role
        and profile.institution_id = public.current_profile_institution_id()
      )
    )
  order by profile.last_name, profile.first_name;
$$;

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

revoke all on function public.list_senior_directory() from public;
revoke all on function public.list_visible_internal_directory() from public;
revoke all on function public.get_own_senior_internal_settings() from public;
revoke all on function public.replace_own_senior_internal_assignments(uuid[])
  from public;
grant execute on function public.list_senior_directory() to authenticated;
grant execute on function public.list_visible_internal_directory()
  to authenticated;
grant execute on function public.get_own_senior_internal_settings()
  to authenticated;
grant execute on function public.replace_own_senior_internal_assignments(uuid[])
  to authenticated;

create or replace function public.create_institution(p_name text)
returns public.institutions
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile public.profiles%rowtype;
  created_institution public.institutions%rowtype;
  normalized_name text := btrim(coalesce(p_name, ''));
begin
  select profile.*
  into actor_profile
  from public.profiles profile
  where profile.id = public.current_profile_id()
    and profile.role = 'admin'::public.app_role
    and profile.is_active
  limit 1;

  if actor_profile.id is null then
    raise exception 'Un compte Administrateur actif est requis.'
      using errcode = '42501';
  end if;

  if normalized_name = '' or length(normalized_name) > 160 then
    raise exception 'Le nom de l’établissement doit contenir entre 1 et 160 caractères.'
      using errcode = '22023';
  end if;

  insert into public.institutions (
    name,
    created_by_profile_id,
    updated_by_profile_id
  )
  values (
    normalized_name,
    actor_profile.id,
    actor_profile.id
  )
  returning * into created_institution;

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
    actor_profile.id,
    actor_profile.role,
    trim(concat_ws(' ', actor_profile.first_name, actor_profile.last_name)),
    'Établissement créé',
    'Établissement',
    created_institution.name,
    actor_profile.id
  );

  return created_institution;
end;
$$;

create or replace function public.rename_institution(
  p_institution_id uuid,
  p_name text,
  p_expected_version bigint
)
returns public.institutions
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile public.profiles%rowtype;
  current_institution public.institutions%rowtype;
  renamed_institution public.institutions%rowtype;
  normalized_name text := btrim(coalesce(p_name, ''));
begin
  select profile.*
  into actor_profile
  from public.profiles profile
  where profile.id = public.current_profile_id()
    and profile.role = 'admin'::public.app_role
    and profile.is_active
  limit 1;

  if actor_profile.id is null then
    raise exception 'Un compte Administrateur actif est requis.'
      using errcode = '42501';
  end if;

  if normalized_name = '' or length(normalized_name) > 160 then
    raise exception 'Le nom de l’établissement doit contenir entre 1 et 160 caractères.'
      using errcode = '22023';
  end if;

  select institution.*
  into current_institution
  from public.institutions institution
  where institution.id = p_institution_id
  for update;

  if current_institution.id is null then
    raise exception 'Cet établissement est introuvable.'
      using errcode = 'P0002';
  end if;

  if current_institution.version <> p_expected_version then
    raise exception
      'Cet établissement a été modifié par une autre session. Rechargez les données.'
      using errcode = '40001';
  end if;

  update public.institutions institution
  set name = normalized_name,
      updated_by_profile_id = actor_profile.id
  where institution.id = current_institution.id
  returning * into renamed_institution;

  update public.profiles profile
  set institution = renamed_institution.name,
      updated_by_profile_id = actor_profile.id
  where profile.institution_id = renamed_institution.id;

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
    actor_profile.id,
    actor_profile.role,
    trim(concat_ws(' ', actor_profile.first_name, actor_profile.last_name)),
    'Établissement renommé',
    'Établissement',
    concat(current_institution.name, ' → ', renamed_institution.name),
    actor_profile.id
  );

  return renamed_institution;
end;
$$;

create or replace function public.archive_institution(
  p_institution_id uuid,
  p_expected_version bigint
)
returns public.institutions
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile public.profiles%rowtype;
  current_institution public.institutions%rowtype;
  archived_institution public.institutions%rowtype;
begin
  select profile.*
  into actor_profile
  from public.profiles profile
  where profile.id = public.current_profile_id()
    and profile.role = 'admin'::public.app_role
    and profile.is_active
  limit 1;

  if actor_profile.id is null then
    raise exception 'Un compte Administrateur actif est requis.'
      using errcode = '42501';
  end if;

  select institution.*
  into current_institution
  from public.institutions institution
  where institution.id = p_institution_id
  for update;

  if current_institution.id is null then
    raise exception 'Cet établissement est introuvable.'
      using errcode = 'P0002';
  end if;

  if current_institution.version <> p_expected_version then
    raise exception
      'Cet établissement a été modifié par une autre session. Rechargez les données.'
      using errcode = '40001';
  end if;

  if current_institution.status = 'archived' then
    return current_institution;
  end if;

  update public.institutions institution
  set status = 'archived',
      archived_at = now(),
      updated_by_profile_id = actor_profile.id
  where institution.id = current_institution.id
  returning * into archived_institution;

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
    actor_profile.id,
    actor_profile.role,
    trim(concat_ws(' ', actor_profile.first_name, actor_profile.last_name)),
    'Établissement archivé',
    'Établissement',
    archived_institution.name,
    actor_profile.id
  );

  return archived_institution;
end;
$$;

create or replace function public.move_profile_to_institution(
  p_profile_id uuid,
  p_institution_id uuid,
  p_expected_profile_version bigint
)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile public.profiles%rowtype;
  moved_profile public.profiles%rowtype;
  source_institution public.institutions%rowtype;
  target_institution public.institutions%rowtype;
begin
  select profile.*
  into actor_profile
  from public.profiles profile
  where profile.id = public.current_profile_id()
    and profile.role = 'admin'::public.app_role
    and profile.is_active
  limit 1;

  if actor_profile.id is null then
    raise exception 'Un compte Administrateur actif est requis.'
      using errcode = '42501';
  end if;

  select profile.*
  into moved_profile
  from public.profiles profile
  where profile.id = p_profile_id
    and profile.role in ('internal'::public.app_role, 'senior'::public.app_role)
  for update;

  if moved_profile.id is null then
    raise exception 'Ce compte clinique est introuvable.'
      using errcode = 'P0002';
  end if;

  if moved_profile.version <> p_expected_profile_version then
    raise exception
      'Ce profil a été modifié par une autre session. Rechargez les données.'
      using errcode = '40001';
  end if;

  select institution.*
  into target_institution
  from public.institutions institution
  where institution.id = p_institution_id
    and institution.status = 'active'
  for share;

  if target_institution.id is null then
    raise exception
      'L’établissement cible est introuvable ou archivé.'
      using errcode = '23514';
  end if;

  if moved_profile.institution_id = target_institution.id then
    return moved_profile;
  end if;

  select institution.*
  into source_institution
  from public.institutions institution
  where institution.id = moved_profile.institution_id;

  perform set_config('app.allow_institution_move', 'on', true);

  update public.profiles profile
  set institution_id = target_institution.id,
      institution = target_institution.name,
      updated_by_profile_id = actor_profile.id
  where profile.id = moved_profile.id
  returning * into moved_profile;

  delete from public.senior_internal_assignments assignment
  where (
    assignment.internal_profile_id = moved_profile.id
    or assignment.senior_profile_id = moved_profile.id
  )
  and exists (
    select 1
    from public.profiles senior_profile
    join public.profiles internal_profile
      on internal_profile.id = assignment.internal_profile_id
    where senior_profile.id = assignment.senior_profile_id
      and senior_profile.institution_id is distinct
        from internal_profile.institution_id
  );

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
    actor_profile.id,
    actor_profile.role,
    trim(concat_ws(' ', actor_profile.first_name, actor_profile.last_name)),
    'Changement d’établissement',
    case
      when moved_profile.role = 'internal'::public.app_role then 'Interne'
      else 'Senior'
    end,
    concat(
      trim(concat_ws(' ', moved_profile.first_name, moved_profile.last_name)),
      ' : ',
      coalesce(source_institution.name, 'Aucun établissement'),
      ' → ',
      target_institution.name
    ),
    actor_profile.id
  );

  return moved_profile;
end;
$$;

revoke all on function public.create_institution(text) from public;
revoke all on function public.rename_institution(uuid, text, bigint) from public;
revoke all on function public.archive_institution(uuid, bigint) from public;
revoke all on function public.move_profile_to_institution(uuid, uuid, bigint)
  from public;
grant execute on function public.create_institution(text) to authenticated;
grant execute on function public.rename_institution(uuid, text, bigint)
  to authenticated;
grant execute on function public.archive_institution(uuid, bigint)
  to authenticated;
grant execute on function public.move_profile_to_institution(uuid, uuid, bigint)
  to authenticated;

alter table public.institutions enable row level security;

drop policy if exists "institutions_select_visible" on public.institutions;
create policy "institutions_select_visible"
on public.institutions for select
to authenticated
using (
  public.is_admin()
  or status = 'active'
  or id = public.current_profile_institution_id()
);

grant select on table public.institutions to authenticated;
revoke insert, update, delete on table public.institutions from authenticated;

-- Existing policies call senior_can_read_internal(), which now compares stable
-- institution identifiers. Recreate them to make the intended authorization
-- boundary explicit in this migration.
drop policy if exists "interventions_select_visible" on public.interventions;
create policy "interventions_select_visible"
on public.interventions for select
to authenticated
using (
  deleted_at is null
  and (
    public.is_admin()
    or internal_profile_id = public.current_profile_id()
    or public.senior_can_read_internal(internal_profile_id)
  )
);

drop policy if exists "evaluations_select_visible"
  on public.intervention_evaluations;
create policy "evaluations_select_visible"
on public.intervention_evaluations for select
to authenticated
using (
  exists (
    select 1
    from public.interventions intervention
    where intervention.id = intervention_id
      and intervention.deleted_at is null
      and (
        public.is_admin()
        or intervention.internal_profile_id = public.current_profile_id()
        or public.senior_can_read_internal(intervention.internal_profile_id)
      )
  )
);

drop policy if exists "evaluation_requests_select_visible"
  on public.evaluation_requests;
create policy "evaluation_requests_select_visible"
on public.evaluation_requests for select
to authenticated
using (
  public.is_admin()
  or internal_profile_id = public.current_profile_id()
  or (
    senior_profile_id = public.current_profile_id()
    and public.senior_can_read_internal(internal_profile_id)
  )
);

drop policy if exists "trophy_awards_select_visible" on public.trophy_awards;
create policy "trophy_awards_select_visible"
on public.trophy_awards for select
to authenticated
using (
  public.is_admin()
  or profile_id = public.current_profile_id()
  or public.senior_can_read_internal(profile_id)
);

do $$
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  )
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'institutions'
    ) then
    alter publication supabase_realtime add table public.institutions;
  end if;
end;
$$;
