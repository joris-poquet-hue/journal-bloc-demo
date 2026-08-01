-- Replace the legacy whole-collection persistence model with explicit,
-- versioned records protected by resource-specific RLS policies.

-- ---------------------------------------------------------------------------
-- Version and audit metadata
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists is_active boolean not null default true,
  add column if not exists version bigint not null default 1,
  add column if not exists updated_by_profile_id uuid references public.profiles(id) on delete set null;

alter table public.senior_internal_assignments
  add column if not exists version bigint not null default 1,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists updated_by_profile_id uuid references public.profiles(id) on delete set null;

alter table public.surgical_intervention_definitions
  add column if not exists version bigint not null default 1,
  add column if not exists updated_by_profile_id uuid references public.profiles(id) on delete set null;

alter table public.interventions
  add column if not exists version bigint not null default 1,
  add column if not exists updated_by_profile_id uuid references public.profiles(id) on delete set null;

alter table public.intervention_evaluations
  add column if not exists version bigint not null default 1,
  add column if not exists updated_by_profile_id uuid references public.profiles(id) on delete set null;

update public.intervention_evaluations
set updated_at = coalesce(updated_at, created_at, now())
where updated_at is null;

alter table public.intervention_evaluations
  alter column updated_at set default now(),
  alter column updated_at set not null;

alter table public.notebook_documents
  add column if not exists version bigint not null default 1,
  add column if not exists updated_by_profile_id uuid references public.profiles(id) on delete set null;

alter table public.trophy_definitions
  add column if not exists version bigint not null default 1,
  add column if not exists updated_by_profile_id uuid references public.profiles(id) on delete set null;

alter table public.trophy_awards
  add column if not exists version bigint not null default 1,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists updated_by_profile_id uuid references public.profiles(id) on delete set null;

alter table public.activity_log
  add column if not exists version bigint not null default 1,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by_profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists analytics_event jsonb;

alter table public.test_feedback
  add column if not exists profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists version bigint not null default 1,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by_profile_id uuid references public.profiles(id) on delete set null;

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.profiles
  where auth_user_id = auth.uid()
    and is_active
  limit 1;
$$;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where auth_user_id = auth.uid()
    and is_active
  limit 1;
$$;

create or replace function public.audit_versioned_record()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  actor_profile_id uuid := public.current_profile_id();
begin
  if tg_op = 'INSERT' then
    new.version := greatest(coalesce(new.version, 1), 1);
    new.updated_at := coalesce(new.updated_at, now());
    new.updated_by_profile_id := coalesce(
      actor_profile_id,
      new.updated_by_profile_id
    );
    return new;
  end if;

  new.version := old.version + 1;
  new.updated_at := now();
  new.updated_by_profile_id := coalesce(
    actor_profile_id,
    new.updated_by_profile_id,
    old.updated_by_profile_id
  );
  return new;
end;
$$;

drop trigger if exists touch_profiles_updated_at on public.profiles;
drop trigger if exists audit_profiles_version on public.profiles;
create trigger audit_profiles_version
before insert or update on public.profiles
for each row execute function public.audit_versioned_record();

drop trigger if exists audit_assignments_version on public.senior_internal_assignments;
create trigger audit_assignments_version
before insert or update on public.senior_internal_assignments
for each row execute function public.audit_versioned_record();

drop trigger if exists touch_surgical_definitions_updated_at on public.surgical_intervention_definitions;
drop trigger if exists audit_surgical_definitions_version on public.surgical_intervention_definitions;
create trigger audit_surgical_definitions_version
before insert or update on public.surgical_intervention_definitions
for each row execute function public.audit_versioned_record();

drop trigger if exists touch_interventions_updated_at on public.interventions;
drop trigger if exists audit_interventions_version on public.interventions;
create trigger audit_interventions_version
before insert or update on public.interventions
for each row execute function public.audit_versioned_record();

drop trigger if exists audit_evaluations_version on public.intervention_evaluations;
create trigger audit_evaluations_version
before insert or update on public.intervention_evaluations
for each row execute function public.audit_versioned_record();

drop trigger if exists audit_notebook_documents_version on public.notebook_documents;
create trigger audit_notebook_documents_version
before insert or update on public.notebook_documents
for each row execute function public.audit_versioned_record();

drop trigger if exists touch_trophy_definitions_updated_at on public.trophy_definitions;
drop trigger if exists audit_trophy_definitions_version on public.trophy_definitions;
create trigger audit_trophy_definitions_version
before insert or update on public.trophy_definitions
for each row execute function public.audit_versioned_record();

drop trigger if exists audit_trophy_awards_version on public.trophy_awards;
create trigger audit_trophy_awards_version
before insert or update on public.trophy_awards
for each row execute function public.audit_versioned_record();

drop trigger if exists audit_test_feedback_version on public.test_feedback;
create trigger audit_test_feedback_version
before insert or update on public.test_feedback
for each row execute function public.audit_versioned_record();

create or replace function public.set_created_by_profile()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.created_by_profile_id := coalesce(
    public.current_profile_id(),
    new.created_by_profile_id
  );
  return new;
end;
$$;

drop trigger if exists set_assignments_created_by on public.senior_internal_assignments;
create trigger set_assignments_created_by
before insert on public.senior_internal_assignments
for each row execute function public.set_created_by_profile();

drop trigger if exists set_interventions_created_by on public.interventions;
create trigger set_interventions_created_by
before insert on public.interventions
for each row execute function public.set_created_by_profile();

drop trigger if exists set_trophy_definitions_created_by on public.trophy_definitions;
create trigger set_trophy_definitions_created_by
before insert on public.trophy_definitions
for each row execute function public.set_created_by_profile();

drop trigger if exists set_trophy_awards_created_by on public.trophy_awards;
create trigger set_trophy_awards_created_by
before insert on public.trophy_awards
for each row execute function public.set_created_by_profile();

create or replace function public.set_surgical_definition_owner()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.owner_profile_id := coalesce(
    public.current_profile_id(),
    new.owner_profile_id
  );
  return new;
end;
$$;

drop trigger if exists set_surgical_definition_owner on public.surgical_intervention_definitions;
create trigger set_surgical_definition_owner
before insert on public.surgical_intervention_definitions
for each row execute function public.set_surgical_definition_owner();

-- Append-only records derive their author from the authenticated profile so a
-- client cannot forge an actor role, label, or owner.
create or replace function public.set_activity_log_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles%rowtype;
begin
  if auth.role() = 'service_role' then
    new.version := greatest(coalesce(new.version, 1), 1);
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := coalesce(new.updated_at, new.created_at);
    return new;
  end if;

  select * into actor
  from public.profiles
  where auth_user_id = auth.uid()
    and is_active
  limit 1;

  if actor.id is null then
    raise exception 'Active profile required';
  end if;

  new.profile_id := actor.id;
  new.created_by_profile_id := actor.id;
  new.actor_role := actor.role;
  new.actor_label := trim(concat_ws(' ', actor.first_name, actor.last_name));
  new.version := 1;
  new.created_at := coalesce(new.created_at, now());
  new.updated_at := new.created_at;
  return new;
end;
$$;

drop trigger if exists set_activity_log_identity on public.activity_log;
create trigger set_activity_log_identity
before insert on public.activity_log
for each row execute function public.set_activity_log_identity();

create or replace function public.set_test_feedback_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles%rowtype;
begin
  if auth.role() = 'service_role' then
    new.version := greatest(coalesce(new.version, 1), 1);
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := coalesce(new.updated_at, new.created_at);
    return new;
  end if;

  select * into actor
  from public.profiles
  where auth_user_id = auth.uid()
    and is_active
  limit 1;

  if actor.id is null then
    raise exception 'Active profile required';
  end if;

  new.profile_id := actor.id;
  new.author_role := actor.role;
  new.author_label := trim(concat_ws(' ', actor.first_name, actor.last_name));
  new.version := 1;
  new.created_at := coalesce(new.created_at, now());
  new.updated_at := new.created_at;
  new.updated_by_profile_id := actor.id;
  return new;
end;
$$;

drop trigger if exists set_test_feedback_identity on public.test_feedback;
create trigger set_test_feedback_identity
before insert on public.test_feedback
for each row execute function public.set_test_feedback_identity();

-- ---------------------------------------------------------------------------
-- Safe RPCs for limited self-service operations
-- ---------------------------------------------------------------------------

create or replace function public.list_senior_directory()
returns table (
  id uuid,
  first_name text,
  last_name text,
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
    profile.created_at,
    profile.last_login_at
  from public.profiles profile
  where profile.role = 'senior'::public.app_role
    and profile.is_active
  order by profile.last_name, profile.first_name;
$$;

revoke all on function public.list_senior_directory() from public;
grant execute on function public.list_senior_directory() to authenticated;

create or replace function public.update_own_profile_settings(
  p_expected_version bigint,
  p_semester text default null,
  p_current_rotation text default null,
  p_avatar_image_src text default null,
  p_update_training boolean default false,
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
      when p_update_training then upper(trim(coalesce(p_semester, '')))
      else semester
    end,
    current_rotation = case
      when p_update_training then trim(coalesce(p_current_rotation, ''))
      else current_rotation
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
      not p_update_training
      or (
        trim(coalesce(p_semester, '')) <> ''
        and trim(coalesce(p_current_rotation, '')) <> ''
      )
    )
  returning * into updated_profile;

  if updated_profile.id is null then
    raise exception 'VERSION_CONFLICT_OR_INVALID_PROFILE';
  end if;

  return updated_profile;
end;
$$;

revoke all on function public.update_own_profile_settings(bigint, text, text, text, boolean, boolean) from public;
grant execute on function public.update_own_profile_settings(bigint, text, text, text, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Explicit authorization matrix
-- ---------------------------------------------------------------------------

drop policy if exists "profiles_select_visible" on public.profiles;
drop policy if exists "profiles_admin_write" on public.profiles;
drop policy if exists "profiles_admin_insert" on public.profiles;
drop policy if exists "profiles_admin_update" on public.profiles;
drop policy if exists "profiles_admin_delete" on public.profiles;

create policy "profiles_select_visible"
on public.profiles for select
to authenticated
using (
  public.is_admin()
  or id = public.current_profile_id()
  or (
    role = 'internal'::public.app_role
    and public.senior_manages_internal(id)
  )
);

create policy "profiles_admin_insert"
on public.profiles for insert
to authenticated
with check (public.is_admin());

create policy "profiles_admin_update"
on public.profiles for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "profiles_admin_delete"
on public.profiles for delete
to authenticated
using (public.is_admin());

drop policy if exists "assignments_select_visible" on public.senior_internal_assignments;
drop policy if exists "assignments_admin_write" on public.senior_internal_assignments;
drop policy if exists "assignments_admin_insert" on public.senior_internal_assignments;
drop policy if exists "assignments_admin_update" on public.senior_internal_assignments;
drop policy if exists "assignments_admin_delete" on public.senior_internal_assignments;

create policy "assignments_select_visible"
on public.senior_internal_assignments for select
to authenticated
using (
  public.is_admin()
  or senior_profile_id = public.current_profile_id()
  or internal_profile_id = public.current_profile_id()
);

create policy "assignments_admin_insert"
on public.senior_internal_assignments for insert
to authenticated
with check (public.is_admin());

create policy "assignments_admin_update"
on public.senior_internal_assignments for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "assignments_admin_delete"
on public.senior_internal_assignments for delete
to authenticated
using (public.is_admin());

drop policy if exists "surgical_definitions_read" on public.surgical_intervention_definitions;
drop policy if exists "surgical_definitions_admin_write" on public.surgical_intervention_definitions;
drop policy if exists "surgical_definitions_admin_insert" on public.surgical_intervention_definitions;
drop policy if exists "surgical_definitions_admin_update" on public.surgical_intervention_definitions;
drop policy if exists "surgical_definitions_admin_delete" on public.surgical_intervention_definitions;

create policy "surgical_definitions_read"
on public.surgical_intervention_definitions for select
to authenticated
using (public.is_admin() or status = 'active');

create policy "surgical_definitions_admin_insert"
on public.surgical_intervention_definitions for insert
to authenticated
with check (public.is_admin());

create policy "surgical_definitions_admin_update"
on public.surgical_intervention_definitions for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "surgical_definitions_admin_delete"
on public.surgical_intervention_definitions for delete
to authenticated
using (public.is_admin());

drop policy if exists "interventions_select_visible" on public.interventions;
drop policy if exists "interventions_insert_owner_or_admin" on public.interventions;
drop policy if exists "interventions_update_owner_or_admin" on public.interventions;
drop policy if exists "interventions_delete_admin" on public.interventions;

create policy "interventions_select_visible"
on public.interventions for select
to authenticated
using (
  public.is_admin()
  or internal_profile_id = public.current_profile_id()
  or (
    senior_profile_id = public.current_profile_id()
    and public.senior_manages_internal(internal_profile_id)
  )
);

create policy "interventions_insert_owner_or_admin"
on public.interventions for insert
to authenticated
with check (
  public.is_admin()
  or (
    internal_profile_id = public.current_profile_id()
    and created_by_profile_id = public.current_profile_id()
    and senior_profile_id is not null
    and exists (
      select 1
      from public.senior_internal_assignments assignment
      where assignment.senior_profile_id = interventions.senior_profile_id
        and assignment.internal_profile_id = interventions.internal_profile_id
    )
  )
);

create policy "interventions_update_owner_or_admin"
on public.interventions for update
to authenticated
using (
  public.is_admin()
  or internal_profile_id = public.current_profile_id()
)
with check (
  public.is_admin()
  or (
    internal_profile_id = public.current_profile_id()
    and senior_profile_id is not null
    and exists (
      select 1
      from public.senior_internal_assignments assignment
      where assignment.senior_profile_id = interventions.senior_profile_id
        and assignment.internal_profile_id = interventions.internal_profile_id
    )
  )
);

create policy "interventions_delete_admin"
on public.interventions for delete
to authenticated
using (public.is_admin());

drop policy if exists "evaluations_select_visible" on public.intervention_evaluations;
drop policy if exists "evaluations_senior_or_admin_write" on public.intervention_evaluations;
drop policy if exists "evaluations_senior_or_admin_insert" on public.intervention_evaluations;
drop policy if exists "evaluations_senior_or_admin_update" on public.intervention_evaluations;
drop policy if exists "evaluations_senior_or_admin_delete" on public.intervention_evaluations;

create policy "evaluations_select_visible"
on public.intervention_evaluations for select
to authenticated
using (
  exists (
    select 1
    from public.interventions intervention
    where intervention.id = intervention_id
      and (
        public.is_admin()
        or intervention.internal_profile_id = public.current_profile_id()
        or (
          intervention.senior_profile_id = public.current_profile_id()
          and public.senior_manages_internal(intervention.internal_profile_id)
        )
      )
  )
);

create policy "evaluations_senior_or_admin_insert"
on public.intervention_evaluations for insert
to authenticated
with check (
  public.is_admin()
  or (
    senior_profile_id = public.current_profile_id()
    and exists (
      select 1
      from public.interventions intervention
      where intervention.id = intervention_id
        and intervention.senior_profile_id = public.current_profile_id()
        and public.senior_manages_internal(intervention.internal_profile_id)
    )
  )
);

create policy "evaluations_senior_or_admin_update"
on public.intervention_evaluations for update
to authenticated
using (
  public.is_admin()
  or senior_profile_id = public.current_profile_id()
)
with check (
  public.is_admin()
  or (
    senior_profile_id = public.current_profile_id()
    and exists (
      select 1
      from public.interventions intervention
      where intervention.id = intervention_id
        and intervention.senior_profile_id = public.current_profile_id()
        and public.senior_manages_internal(intervention.internal_profile_id)
    )
  )
);

create policy "evaluations_senior_or_admin_delete"
on public.intervention_evaluations for delete
to authenticated
using (public.is_admin() or senior_profile_id = public.current_profile_id());

drop policy if exists "notebook_select_owner_or_admin" on public.notebook_documents;
drop policy if exists "notebook_write_owner_or_admin" on public.notebook_documents;
drop policy if exists "notebook_insert_owner_or_admin" on public.notebook_documents;
drop policy if exists "notebook_update_owner_or_admin" on public.notebook_documents;
drop policy if exists "notebook_delete_owner_or_admin" on public.notebook_documents;

create policy "notebook_select_owner_or_admin"
on public.notebook_documents for select
to authenticated
using (public.is_admin() or profile_id = public.current_profile_id());

create policy "notebook_insert_owner_or_admin"
on public.notebook_documents for insert
to authenticated
with check (public.is_admin() or profile_id = public.current_profile_id());

create policy "notebook_update_owner_or_admin"
on public.notebook_documents for update
to authenticated
using (public.is_admin() or profile_id = public.current_profile_id())
with check (public.is_admin() or profile_id = public.current_profile_id());

create policy "notebook_delete_owner_or_admin"
on public.notebook_documents for delete
to authenticated
using (public.is_admin() or profile_id = public.current_profile_id());

drop policy if exists "trophy_definitions_read" on public.trophy_definitions;
drop policy if exists "trophy_definitions_admin_write" on public.trophy_definitions;
drop policy if exists "trophy_definitions_admin_insert" on public.trophy_definitions;
drop policy if exists "trophy_definitions_admin_update" on public.trophy_definitions;
drop policy if exists "trophy_definitions_admin_delete" on public.trophy_definitions;

create policy "trophy_definitions_read"
on public.trophy_definitions for select
to authenticated
using (public.is_admin() or status = 'active');

create policy "trophy_definitions_admin_insert"
on public.trophy_definitions for insert
to authenticated
with check (public.is_admin());

create policy "trophy_definitions_admin_update"
on public.trophy_definitions for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "trophy_definitions_admin_delete"
on public.trophy_definitions for delete
to authenticated
using (public.is_admin());

drop policy if exists "trophy_awards_select_visible" on public.trophy_awards;
drop policy if exists "trophy_awards_admin_write" on public.trophy_awards;
drop policy if exists "trophy_awards_admin_insert" on public.trophy_awards;
drop policy if exists "trophy_awards_admin_update" on public.trophy_awards;
drop policy if exists "trophy_awards_admin_delete" on public.trophy_awards;

create policy "trophy_awards_select_visible"
on public.trophy_awards for select
to authenticated
using (
  public.is_admin()
  or profile_id = public.current_profile_id()
  or public.senior_manages_internal(profile_id)
);

create policy "trophy_awards_admin_insert"
on public.trophy_awards for insert
to authenticated
with check (public.is_admin());

create policy "trophy_awards_admin_update"
on public.trophy_awards for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "trophy_awards_admin_delete"
on public.trophy_awards for delete
to authenticated
using (public.is_admin());

drop policy if exists "activity_log_select_visible" on public.activity_log;
drop policy if exists "activity_log_insert_authenticated" on public.activity_log;

create policy "activity_log_select_visible"
on public.activity_log for select
to authenticated
using (public.is_admin() or profile_id = public.current_profile_id());

create policy "activity_log_insert_authenticated"
on public.activity_log for insert
to authenticated
with check (profile_id = public.current_profile_id());

drop policy if exists "test_feedback_select_admin" on public.test_feedback;
drop policy if exists "test_feedback_insert_authenticated" on public.test_feedback;
drop policy if exists "test_feedback_admin_delete" on public.test_feedback;

create policy "test_feedback_select_visible"
on public.test_feedback for select
to authenticated
using (public.is_admin() or profile_id = public.current_profile_id());

create policy "test_feedback_insert_authenticated"
on public.test_feedback for insert
to authenticated
with check (profile_id = public.current_profile_id());

create policy "test_feedback_admin_delete"
on public.test_feedback for delete
to authenticated
using (public.is_admin());

-- The historical JSON table is retained temporarily for rollback/read-only
-- migration checks, but clients no longer receive any table privileges.
do $$
begin
  if to_regclass('public.app_state') is not null then
    revoke all on table public.app_state from anon, authenticated;
  end if;
end;
$$;
