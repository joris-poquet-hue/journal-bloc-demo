create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('internal', 'senior', 'admin');
  end if;
end $$;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  role public.app_role not null,
  first_name text not null,
  last_name text not null,
  login_id extensions.citext not null unique,
  promotion text,
  semester text,
  current_rotation text,
  avatar_image_src text,
  must_change_password boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create table if not exists public.senior_internal_assignments (
  senior_profile_id uuid not null references public.profiles(id) on delete cascade,
  internal_profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (senior_profile_id, internal_profile_id),
  constraint senior_internal_assignments_distinct_profiles check (senior_profile_id <> internal_profile_id)
);

create table if not exists public.surgical_intervention_definitions (
  id text primary key,
  name text not null,
  status text not null default 'active',
  definition jsonb not null,
  owner_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.interventions (
  id uuid primary key default gen_random_uuid(),
  internal_profile_id uuid not null references public.profiles(id) on delete cascade,
  senior_profile_id uuid references public.profiles(id) on delete set null,
  procedure_id text not null references public.surgical_intervention_definitions(id),
  intervention_date date not null,
  indication text,
  indication_comment text not null default '',
  custom_indication text,
  approach text,
  entry_technique text,
  laterality text,
  surgery_context text,
  complexity int,
  role text,
  checklist jsonb not null default '{}'::jsonb,
  autonomy_score numeric(5, 2),
  saved_at timestamptz not null default now(),
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  client_mutation_id text,
  constraint interventions_complexity_range check (complexity is null or complexity between 1 and 10)
);

create unique index if not exists interventions_client_mutation_id_idx
  on public.interventions (client_mutation_id)
  where client_mutation_id is not null;

create index if not exists interventions_internal_date_idx
  on public.interventions (internal_profile_id, intervention_date desc);

create index if not exists interventions_senior_idx
  on public.interventions (senior_profile_id)
  where senior_profile_id is not null;

create table if not exists public.intervention_evaluations (
  intervention_id uuid primary key references public.interventions(id) on delete cascade,
  senior_profile_id uuid references public.profiles(id) on delete set null,
  global_performance text,
  category_difficulty text,
  senior_comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.notebook_documents (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  content_html text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.trophy_definitions (
  id text primary key,
  title text not null,
  status text not null default 'draft',
  definition jsonb not null,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trophy_awards (
  id uuid primary key default gen_random_uuid(),
  trophy_id text not null references public.trophy_definitions(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  tier text,
  awarded_at timestamptz not null default now(),
  source_intervention_id uuid references public.interventions(id) on delete set null,
  unique (trophy_id, profile_id, tier)
);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  actor_role public.app_role not null,
  actor_label text not null,
  action text not null,
  target_type text not null,
  target_label text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.test_feedback (
  id uuid primary key default gen_random_uuid(),
  author_profile_id uuid references public.profiles(id) on delete set null,
  author_role public.app_role not null,
  author_label text not null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.legacy_app_state_imports (
  id uuid primary key default gen_random_uuid(),
  source_key text not null,
  source_row jsonb not null,
  imported_at timestamptz,
  import_error text,
  created_at timestamptz not null default now()
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_profiles_updated_at on public.profiles;
create trigger touch_profiles_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists touch_surgical_definitions_updated_at on public.surgical_intervention_definitions;
create trigger touch_surgical_definitions_updated_at
before update on public.surgical_intervention_definitions
for each row execute function public.touch_updated_at();

drop trigger if exists touch_interventions_updated_at on public.interventions;
create trigger touch_interventions_updated_at
before update on public.interventions
for each row execute function public.touch_updated_at();

drop trigger if exists touch_trophy_definitions_updated_at on public.trophy_definitions;
create trigger touch_trophy_definitions_updated_at
before update on public.trophy_definitions
for each row execute function public.touch_updated_at();

create or replace function public.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = 'admin'::public.app_role, false);
$$;

create or replace function public.senior_manages_internal(internal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.senior_internal_assignments assignment
    where assignment.senior_profile_id = public.current_profile_id()
      and assignment.internal_profile_id = internal_id
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
    or public.senior_manages_internal(internal_id);
$$;

alter table public.profiles enable row level security;
alter table public.senior_internal_assignments enable row level security;
alter table public.surgical_intervention_definitions enable row level security;
alter table public.interventions enable row level security;
alter table public.intervention_evaluations enable row level security;
alter table public.notebook_documents enable row level security;
alter table public.trophy_definitions enable row level security;
alter table public.trophy_awards enable row level security;
alter table public.activity_log enable row level security;
alter table public.test_feedback enable row level security;
alter table public.legacy_app_state_imports enable row level security;

drop policy if exists "profiles_select_visible" on public.profiles;
create policy "profiles_select_visible"
on public.profiles for select
to authenticated
using (
  public.is_admin()
  or id = public.current_profile_id()
  or role = 'senior'::public.app_role
  or public.can_read_internal(id)
);

drop policy if exists "profiles_admin_write" on public.profiles;
create policy "profiles_admin_write"
on public.profiles for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "assignments_select_visible" on public.senior_internal_assignments;
create policy "assignments_select_visible"
on public.senior_internal_assignments for select
to authenticated
using (
  public.is_admin()
  or senior_profile_id = public.current_profile_id()
  or internal_profile_id = public.current_profile_id()
);

drop policy if exists "assignments_admin_write" on public.senior_internal_assignments;
create policy "assignments_admin_write"
on public.senior_internal_assignments for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "surgical_definitions_read" on public.surgical_intervention_definitions;
create policy "surgical_definitions_read"
on public.surgical_intervention_definitions for select
to authenticated
using (status <> 'archived' or public.is_admin());

drop policy if exists "surgical_definitions_admin_write" on public.surgical_intervention_definitions;
create policy "surgical_definitions_admin_write"
on public.surgical_intervention_definitions for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "interventions_select_visible" on public.interventions;
create policy "interventions_select_visible"
on public.interventions for select
to authenticated
using (public.can_read_internal(internal_profile_id));

drop policy if exists "interventions_insert_owner_or_admin" on public.interventions;
create policy "interventions_insert_owner_or_admin"
on public.interventions for insert
to authenticated
with check (
  public.is_admin()
  or internal_profile_id = public.current_profile_id()
);

drop policy if exists "interventions_update_owner_or_admin" on public.interventions;
create policy "interventions_update_owner_or_admin"
on public.interventions for update
to authenticated
using (
  public.is_admin()
  or internal_profile_id = public.current_profile_id()
)
with check (
  public.is_admin()
  or internal_profile_id = public.current_profile_id()
);

drop policy if exists "evaluations_select_visible" on public.intervention_evaluations;
create policy "evaluations_select_visible"
on public.intervention_evaluations for select
to authenticated
using (
  exists (
    select 1
    from public.interventions intervention
    where intervention.id = intervention_id
      and public.can_read_internal(intervention.internal_profile_id)
  )
);

drop policy if exists "evaluations_senior_or_admin_write" on public.intervention_evaluations;
create policy "evaluations_senior_or_admin_write"
on public.intervention_evaluations for all
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.interventions intervention
    where intervention.id = intervention_id
      and public.senior_manages_internal(intervention.internal_profile_id)
  )
)
with check (
  public.is_admin()
  or exists (
    select 1
    from public.interventions intervention
    where intervention.id = intervention_id
      and public.senior_manages_internal(intervention.internal_profile_id)
  )
);

drop policy if exists "notebook_select_owner_or_admin" on public.notebook_documents;
create policy "notebook_select_owner_or_admin"
on public.notebook_documents for select
to authenticated
using (public.is_admin() or profile_id = public.current_profile_id());

drop policy if exists "notebook_write_owner_or_admin" on public.notebook_documents;
create policy "notebook_write_owner_or_admin"
on public.notebook_documents for all
to authenticated
using (public.is_admin() or profile_id = public.current_profile_id())
with check (public.is_admin() or profile_id = public.current_profile_id());

drop policy if exists "trophy_definitions_read" on public.trophy_definitions;
create policy "trophy_definitions_read"
on public.trophy_definitions for select
to authenticated
using (
  public.is_admin()
  or definition ->> 'status' = 'active'
  or status = 'active'
);

drop policy if exists "trophy_definitions_admin_write" on public.trophy_definitions;
create policy "trophy_definitions_admin_write"
on public.trophy_definitions for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "trophy_awards_select_visible" on public.trophy_awards;
create policy "trophy_awards_select_visible"
on public.trophy_awards for select
to authenticated
using (public.can_read_internal(profile_id));

drop policy if exists "trophy_awards_admin_write" on public.trophy_awards;
create policy "trophy_awards_admin_write"
on public.trophy_awards for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "activity_log_select_visible" on public.activity_log;
create policy "activity_log_select_visible"
on public.activity_log for select
to authenticated
using (
  public.is_admin()
  or profile_id = public.current_profile_id()
  or (profile_id is not null and public.can_read_internal(profile_id))
);

drop policy if exists "activity_log_insert_authenticated" on public.activity_log;
create policy "activity_log_insert_authenticated"
on public.activity_log for insert
to authenticated
with check (
  public.is_admin()
  or profile_id is null
  or profile_id = public.current_profile_id()
);

drop policy if exists "test_feedback_select_admin" on public.test_feedback;
create policy "test_feedback_select_admin"
on public.test_feedback for select
to authenticated
using (public.is_admin());

drop policy if exists "test_feedback_insert_authenticated" on public.test_feedback;
create policy "test_feedback_insert_authenticated"
on public.test_feedback for insert
to authenticated
with check (
  author_profile_id is null
  or author_profile_id = public.current_profile_id()
  or public.is_admin()
);

drop policy if exists "legacy_imports_admin_only" on public.legacy_app_state_imports;
create policy "legacy_imports_admin_only"
on public.legacy_app_state_imports for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into storage.buckets (id, name, public)
values ('trophy-images', 'trophy-images', true)
on conflict (id) do nothing;

drop policy if exists "trophy_images_public_read" on storage.objects;
create policy "trophy_images_public_read"
on storage.objects for select
to public
using (bucket_id = 'trophy-images');

drop policy if exists "trophy_images_admin_write" on storage.objects;
create policy "trophy_images_admin_write"
on storage.objects for all
to authenticated
using (bucket_id = 'trophy-images' and public.is_admin())
with check (bucket_id = 'trophy-images' and public.is_admin());
