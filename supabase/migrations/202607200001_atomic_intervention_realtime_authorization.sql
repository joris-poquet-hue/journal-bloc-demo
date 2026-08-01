-- Make an intervention and its evaluation request one atomic server operation.
-- Senior read access follows the internal's current institution; favorites never
-- participate in authorization decisions.

create table if not exists public.evaluation_requests (
  intervention_id uuid primary key references public.interventions(id) on delete cascade,
  internal_profile_id uuid not null references public.profiles(id) on delete cascade,
  senior_profile_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  version bigint not null default 1,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  updated_by_profile_id uuid references public.profiles(id) on delete set null,
  constraint evaluation_requests_status_check
    check (status in ('pending', 'completed', 'cancelled'))
);

create index if not exists evaluation_requests_senior_status_idx
  on public.evaluation_requests (senior_profile_id, status, created_at desc);

create index if not exists evaluation_requests_internal_idx
  on public.evaluation_requests (internal_profile_id, created_at desc);

drop trigger if exists audit_evaluation_requests_version
  on public.evaluation_requests;
create trigger audit_evaluation_requests_version
before insert or update on public.evaluation_requests
for each row execute function public.audit_versioned_record();

drop trigger if exists set_evaluation_requests_created_by
  on public.evaluation_requests;
create trigger set_evaluation_requests_created_by
before insert on public.evaluation_requests
for each row execute function public.set_created_by_profile();

alter table public.evaluation_requests enable row level security;

grant select on table public.evaluation_requests to authenticated;
revoke insert, update, delete on table public.evaluation_requests from authenticated;

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
      and senior_profile.institution is not distinct from internal_profile.institution
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

revoke all on function public.senior_can_read_internal(uuid) from public;
revoke all on function public.can_read_internal(uuid) from public;
grant execute on function public.senior_can_read_internal(uuid) to authenticated;
grant execute on function public.can_read_internal(uuid) to authenticated;

-- The directory follows the same institution rule. Administrators keep the
-- complete directory; clinical users receive only seniors from their institution.
create or replace function public.list_senior_directory()
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
    and (
      public.is_admin()
      or profile.institution is not distinct from public.current_profile_institution()
    )
  order by profile.last_name, profile.first_name;
$$;

revoke all on function public.list_senior_directory() from public;
grant execute on function public.list_senior_directory() to authenticated;

-- Seniors receive only the pedagogical fields required by their directory.
-- Authentication identifiers, contact metadata and password state remain
-- inaccessible even though the RPC runs with the privileges needed to build the
-- same-institution directory.
create or replace function public.list_visible_internal_directory()
returns table (
  id uuid,
  first_name text,
  last_name text,
  institution text,
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
    profile.institution,
    profile.promotion,
    profile.semester,
    profile.avatar_image_src,
    profile.created_at,
    profile.updated_at,
    profile.version
  from public.profiles profile
  where profile.role = 'internal'::public.app_role
    and profile.is_active
    and (
      public.is_admin()
      or (
        public.current_app_role() = 'senior'::public.app_role
        and profile.institution = public.current_profile_institution()
      )
    )
  order by profile.last_name, profile.first_name;
$$;

revoke all on function public.list_visible_internal_directory() from public;
grant execute on function public.list_visible_internal_directory() to authenticated;

drop policy if exists "profiles_select_visible" on public.profiles;
create policy "profiles_select_visible"
on public.profiles for select
to authenticated
using (
  public.is_admin()
  or id = public.current_profile_id()
);

drop policy if exists "interventions_select_visible" on public.interventions;
drop policy if exists "interventions_insert_owner_or_admin" on public.interventions;
drop policy if exists "interventions_update_owner_or_admin" on public.interventions;

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
drop policy if exists "evaluations_senior_or_admin_write"
  on public.intervention_evaluations;
drop policy if exists "evaluations_senior_or_admin_insert"
  on public.intervention_evaluations;
drop policy if exists "evaluations_senior_or_admin_update"
  on public.intervention_evaluations;
drop policy if exists "evaluations_senior_or_admin_delete"
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

-- Trophy visibility follows the same institution authorization and no longer
-- depends on the optional favorites table.
drop policy if exists "trophy_awards_select_visible" on public.trophy_awards;
create policy "trophy_awards_select_visible"
on public.trophy_awards for select
to authenticated
using (
  public.is_admin()
  or profile_id = public.current_profile_id()
  or public.senior_can_read_internal(profile_id)
);

-- Existing unevaluated interventions receive their missing request before new
-- writes are routed exclusively through the atomic function below.
insert into public.evaluation_requests (
  intervention_id,
  internal_profile_id,
  senior_profile_id,
  status,
  created_at,
  updated_at,
  created_by_profile_id,
  updated_by_profile_id
)
select
  intervention.id,
  intervention.internal_profile_id,
  intervention.senior_profile_id,
  'pending',
  intervention.saved_at,
  intervention.saved_at,
  intervention.created_by_profile_id,
  intervention.created_by_profile_id
from public.interventions intervention
where intervention.deleted_at is null
  and intervention.senior_profile_id is not null
  and not exists (
    select 1
    from public.intervention_evaluations evaluation
    where evaluation.intervention_id = intervention.id
  )
on conflict (intervention_id) do nothing;

create or replace function public.create_intervention_with_evaluation_request(
  p_intervention_id uuid,
  p_client_mutation_id text,
  p_senior_profile_id uuid,
  p_procedure_id text,
  p_intervention_date date,
  p_indication text,
  p_indication_comment text,
  p_custom_indication text,
  p_approach text,
  p_entry_technique text,
  p_laterality text,
  p_surgery_context text,
  p_complexity integer,
  p_role text,
  p_checklist jsonb,
  p_saved_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile public.profiles%rowtype;
  designated_senior public.profiles%rowtype;
  saved_intervention public.interventions%rowtype;
  saved_request public.evaluation_requests%rowtype;
begin
  select profile.*
  into actor_profile
  from public.profiles profile
  where profile.id = public.current_profile_id()
    and profile.role = 'internal'::public.app_role
    and profile.is_active
  limit 1;

  if actor_profile.id is null then
    raise exception 'Un profil Interne actif est requis.' using errcode = '42501';
  end if;

  if p_intervention_id is null
    or nullif(btrim(coalesce(p_client_mutation_id, '')), '') is null
    or length(p_client_mutation_id) > 200 then
    raise exception 'Identifiant d’enregistrement invalide.' using errcode = '22023';
  end if;

  select intervention.*
  into saved_intervention
  from public.interventions intervention
  where intervention.client_mutation_id = p_client_mutation_id
  for update;

  if found then
    if saved_intervention.internal_profile_id is distinct from actor_profile.id then
      raise exception 'Cette tentative d’enregistrement appartient à un autre compte.'
        using errcode = '42501';
    end if;

    select request.*
    into saved_request
    from public.evaluation_requests request
    where request.intervention_id = saved_intervention.id;

    if saved_request.intervention_id is null then
      raise exception 'La demande d’évaluation associée est introuvable.'
        using errcode = 'P0002';
    end if;

    return jsonb_build_object(
      'evaluationRequest', to_jsonb(saved_request),
      'intervention', to_jsonb(saved_intervention)
    );
  end if;

  select profile.*
  into designated_senior
  from public.profiles profile
  where profile.id = p_senior_profile_id
    and profile.role = 'senior'::public.app_role
    and profile.is_active
  limit 1;

  if designated_senior.id is null
    or designated_senior.institution is distinct from actor_profile.institution then
    raise exception 'Le Senior désigné doit être actif dans le même établissement.'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.surgical_intervention_definitions definition
    where definition.id = p_procedure_id
      and definition.status = 'active'
  ) then
    raise exception 'Le type d’intervention sélectionné n’est pas actif.'
      using errcode = '22023';
  end if;

  if p_intervention_date is null
    or p_complexity is null
    or p_complexity not between 1 and 10
    or p_role is null
    or p_checklist is null
    or jsonb_typeof(p_checklist) <> 'object' then
    raise exception 'Les données de l’intervention sont incomplètes.'
      using errcode = '22023';
  end if;

  insert into public.interventions (
    id,
    internal_profile_id,
    senior_profile_id,
    procedure_id,
    intervention_date,
    indication,
    indication_comment,
    custom_indication,
    approach,
    entry_technique,
    laterality,
    surgery_context,
    complexity,
    role,
    checklist,
    autonomy_score,
    saved_at,
    created_by_profile_id,
    updated_by_profile_id,
    client_mutation_id
  )
  values (
    p_intervention_id,
    actor_profile.id,
    designated_senior.id,
    p_procedure_id,
    p_intervention_date,
    p_indication,
    coalesce(p_indication_comment, ''),
    p_custom_indication,
    p_approach,
    p_entry_technique,
    p_laterality,
    p_surgery_context,
    p_complexity,
    p_role,
    p_checklist,
    null,
    coalesce(p_saved_at, now()),
    actor_profile.id,
    actor_profile.id,
    p_client_mutation_id
  )
  returning * into saved_intervention;

  insert into public.evaluation_requests (
    intervention_id,
    internal_profile_id,
    senior_profile_id,
    created_by_profile_id,
    updated_by_profile_id
  )
  values (
    saved_intervention.id,
    actor_profile.id,
    designated_senior.id,
    actor_profile.id,
    actor_profile.id
  )
  returning * into saved_request;

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
    'Ajout d’une intervention au journal',
    'Intervention',
    p_procedure_id,
    actor_profile.id
  );

  return jsonb_build_object(
    'evaluationRequest', to_jsonb(saved_request),
    'intervention', to_jsonb(saved_intervention)
  );
end;
$$;

revoke all on function public.create_intervention_with_evaluation_request(
  uuid,
  text,
  uuid,
  text,
  date,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  jsonb,
  timestamptz
) from public;

grant execute on function public.create_intervention_with_evaluation_request(
  uuid,
  text,
  uuid,
  text,
  date,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  jsonb,
  timestamptz
) to authenticated;

-- Evaluation remains atomic with score persistence, but only the designated
-- senior may perform it. A validated evaluation is append-only.
create or replace function public.save_intervention_evaluation_with_score(
  p_intervention_id uuid,
  p_expected_intervention_version bigint,
  p_expected_evaluation_version bigint,
  p_senior_profile_id uuid,
  p_global_performance text,
  p_category_difficulty text,
  p_senior_comment text,
  p_autonomy_score numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile_id uuid := public.current_profile_id();
  actor_role public.app_role := public.current_app_role();
  stored_intervention public.interventions%rowtype;
  saved_intervention public.interventions%rowtype;
  saved_evaluation public.intervention_evaluations%rowtype;
  saved_request public.evaluation_requests%rowtype;
begin
  if actor_profile_id is null or actor_role <> 'senior'::public.app_role then
    raise exception 'Seul le Senior désigné peut valider cette évaluation.'
      using errcode = '42501';
  end if;

  if p_senior_profile_id is distinct from actor_profile_id then
    raise exception 'Le Senior connecté ne correspond pas au Senior désigné.'
      using errcode = '42501';
  end if;

  if p_global_performance is null
    or p_global_performance not in ('1', '2', '3', '4', '5') then
    raise exception 'Performance globale invalide.' using errcode = '22023';
  end if;

  if p_category_difficulty is null
    or p_category_difficulty not in ('1', '2', '3') then
    raise exception 'Difficulté chirurgicale invalide.' using errcode = '22023';
  end if;

  if p_autonomy_score is not null
    and (p_autonomy_score < 0 or p_autonomy_score > 100) then
    raise exception 'Score d’autonomie invalide.' using errcode = '22023';
  end if;

  select intervention.*
  into stored_intervention
  from public.interventions intervention
  where intervention.id = p_intervention_id
    and intervention.deleted_at is null
  for update;

  if stored_intervention.id is null then
    raise exception 'Intervention introuvable.' using errcode = 'P0002';
  end if;

  if stored_intervention.version <> p_expected_intervention_version then
    raise exception 'Cette intervention a été modifiée. Rechargez les données.'
      using errcode = '40001';
  end if;

  if stored_intervention.senior_profile_id is distinct from actor_profile_id
    or not public.senior_can_read_internal(stored_intervention.internal_profile_id) then
    raise exception 'Cette intervention ne peut pas être évaluée par ce Senior.'
      using errcode = '42501';
  end if;

  if p_expected_evaluation_version is not null
    or exists (
      select 1
      from public.intervention_evaluations evaluation
      where evaluation.intervention_id = p_intervention_id
    ) then
    raise exception 'Cette évaluation est déjà validée et ne peut plus être modifiée.'
      using errcode = '23505';
  end if;

  update public.evaluation_requests request
  set
    status = 'completed',
    completed_at = now(),
    updated_by_profile_id = actor_profile_id
  where request.intervention_id = p_intervention_id
    and request.senior_profile_id = actor_profile_id
    and request.status = 'pending'
  returning * into saved_request;

  if saved_request.intervention_id is null then
    raise exception 'Aucune demande d’évaluation active ne correspond à cette intervention.'
      using errcode = '42501';
  end if;

  insert into public.intervention_evaluations (
    intervention_id,
    senior_profile_id,
    global_performance,
    category_difficulty,
    senior_comment,
    updated_by_profile_id
  )
  values (
    p_intervention_id,
    actor_profile_id,
    p_global_performance,
    p_category_difficulty,
    coalesce(p_senior_comment, ''),
    actor_profile_id
  )
  returning * into saved_evaluation;

  update public.interventions
  set
    autonomy_score = p_autonomy_score,
    updated_by_profile_id = actor_profile_id
  where id = p_intervention_id
  returning * into saved_intervention;

  insert into public.activity_log (
    profile_id,
    actor_role,
    actor_label,
    action,
    target_type,
    target_label,
    created_by_profile_id
  )
  select
    actor_profile_id,
    'senior'::public.app_role,
    trim(concat_ws(' ', profile.first_name, profile.last_name)),
    'Évaluation d’un interne validée',
    'Intervention',
    p_intervention_id::text,
    actor_profile_id
  from public.profiles profile
  where profile.id = actor_profile_id;

  return jsonb_build_object(
    'evaluation', to_jsonb(saved_evaluation),
    'evaluationRequest', to_jsonb(saved_request),
    'intervention', to_jsonb(saved_intervention)
  );
end;
$$;

revoke all on function public.save_intervention_evaluation_with_score(
  uuid,
  bigint,
  bigint,
  uuid,
  text,
  text,
  text,
  numeric
) from public;

grant execute on function public.save_intervention_evaluation_with_score(
  uuid,
  bigint,
  bigint,
  uuid,
  text,
  text,
  text,
  numeric
) to authenticated;

-- Realtime is an acceleration mechanism. Clients also perform a complete
-- reference reload on visibility/focus and at a short reconciliation interval.
do $$
declare
  table_name text;
begin
  if exists (
    select 1
    from pg_publication
    where pubname = 'supabase_realtime'
  ) then
    foreach table_name in array array[
      'profiles',
      'senior_internal_assignments',
      'interventions',
      'intervention_evaluations',
      'evaluation_requests'
    ]
    loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = table_name
      ) then
        execute format(
          'alter publication supabase_realtime add table public.%I',
          table_name
        );
      end if;
    end loop;
  end if;
end;
$$;
