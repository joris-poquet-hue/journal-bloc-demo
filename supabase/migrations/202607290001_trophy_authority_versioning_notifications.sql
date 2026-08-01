begin;

-- ---------------------------------------------------------------------------
-- Trophy definitions: private catalogue access, durable draft versions and
-- atomic publication.
-- ---------------------------------------------------------------------------

create table if not exists public.trophy_definition_drafts (
  trophy_id text primary key references public.trophy_definitions(id) on delete cascade,
  definition jsonb not null,
  base_version bigint not null,
  version bigint not null default 1,
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  updated_by_profile_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trophy_definition_versions (
  id uuid primary key default gen_random_uuid(),
  trophy_id text not null references public.trophy_definitions(id) on delete restrict,
  definition_version bigint not null,
  definition jsonb not null,
  publication_status text not null
    check (publication_status in ('published', 'superseded')),
  published_at timestamptz not null default now(),
  published_by_profile_id uuid references public.profiles(id) on delete set null,
  unique (trophy_id, definition_version)
);

insert into public.trophy_definition_versions (
  trophy_id,
  definition_version,
  definition,
  publication_status,
  published_at,
  published_by_profile_id
)
select
  definition.id,
  definition.version,
  definition.definition,
  'published',
  coalesce(definition.updated_at, definition.created_at, now()),
  definition.updated_by_profile_id
from public.trophy_definitions definition
where definition.status in ('active', 'inactive')
on conflict (trophy_id, definition_version) do nothing;

alter table public.trophy_definition_drafts enable row level security;
alter table public.trophy_definition_versions enable row level security;

revoke all on table public.trophy_definition_drafts from public, anon, authenticated;
revoke all on table public.trophy_definition_versions from public, anon, authenticated;

drop policy if exists "trophy_definition_drafts_admin_read"
  on public.trophy_definition_drafts;
create policy "trophy_definition_drafts_admin_read"
on public.trophy_definition_drafts for select
to authenticated
using (public.is_admin());

drop policy if exists "trophy_definition_versions_admin_read"
  on public.trophy_definition_versions;
create policy "trophy_definition_versions_admin_read"
on public.trophy_definition_versions for select
to authenticated
using (public.is_admin());

grant select on table public.trophy_definition_drafts to authenticated;
grant select on table public.trophy_definition_versions to authenticated;

create or replace function public.require_active_admin()
returns public.profiles
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  actor public.profiles%rowtype;
begin
  select profile.*
  into actor
  from public.profiles profile
  where profile.id = public.current_profile_id()
    and profile.role = 'admin'::public.app_role
    and profile.is_active
  limit 1;

  if actor.id is null then
    raise exception 'Un Administrateur actif est requis.'
      using errcode = '42501';
  end if;

  return actor;
end;
$$;

revoke all on function public.require_active_admin() from public;

-- Publishing "inactive" is a deactivation operation, never an initial state.
-- Existing ambiguous inactive records stay protected as previously activated.
create or replace function public.protect_trophy_definition_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft'
      or old.ever_activated is distinct from false
      or exists (
        select 1
        from public.trophy_awards award
        where award.trophy_id = old.id
      ) then
      raise exception
        'Un trophée activé ou dont l’historique est incertain doit être désactivé et ne peut pas être supprimé.'
        using errcode = '55000';
    end if;

    return old;
  end if;

  if tg_op = 'INSERT' then
    if new.status = 'active' then
      new.ever_activated := true;
      new.activated_at := coalesce(new.activated_at, now());
    else
      new.ever_activated := false;
      new.activated_at := null;
    end if;

    return new;
  end if;

  if old.ever_activated is true then
    new.ever_activated := true;
    new.activated_at := coalesce(old.activated_at, new.activated_at);
  elsif new.status = 'active' then
    new.ever_activated := true;
    new.activated_at := coalesce(old.activated_at, new.activated_at, now());
  elsif old.ever_activated is null then
    new.ever_activated := null;
    new.activated_at := old.activated_at;
  else
    new.ever_activated := false;
    new.activated_at := null;
  end if;

  return new;
end;
$$;

create or replace function public.validate_trophy_definition_for_publication(
  p_definition jsonb
)
returns void
language plpgsql
immutable
set search_path = public
as $$
declare
  trophy_format text := coalesce(p_definition ->> 'format', '');
  trophy_type text := coalesce(p_definition ->> 'type', '');
  operative_scope text := coalesce(p_definition ->> 'operativeScope', '');
  level_definition jsonb;
  condition jsonb;
  expected_tiers text[] := array['bronze', 'silver', 'gold', 'diamond'];
  current_threshold numeric;
  previous_threshold numeric := null;
  current_autonomy_min numeric;
  previous_autonomy_min numeric := null;
  tier_index integer := 0;
  condition_type text;
  expected_tracked_status text := null;
  level_tracked_status text;
begin
  if jsonb_typeof(p_definition) <> 'object' then
    raise exception 'La définition du trophée est invalide.'
      using errcode = '22023';
  end if;

  if nullif(trim(p_definition ->> 'title'), '') is null then
    raise exception 'Le nom du trophée est obligatoire.'
      using errcode = '22023';
  end if;

  if nullif(trim(p_definition ->> 'description'), '') is null then
    raise exception 'La description du trophée est obligatoire.'
      using errcode = '22023';
  end if;

  if trophy_type not in ('operatoire', 'special')
    or trophy_format not in ('unique', 'levels')
    or coalesce(p_definition ->> 'visibility', '') not in ('visible', 'surprise') then
    raise exception 'Le type, le format ou la visibilité du trophée est invalide.'
      using errcode = '22023';
  end if;

  if trophy_type = 'operatoire' then
    if operative_scope = 'procedure'
      and nullif(trim(p_definition ->> 'associatedProcedure'), '') is null then
      raise exception 'Une intervention associée est obligatoire.'
        using errcode = '22023';
    elsif operative_scope = 'approach'
      and nullif(trim(p_definition ->> 'associatedApproach'), '') is null then
      raise exception 'Une voie d’abord associée est obligatoire.'
        using errcode = '22023';
    elsif operative_scope not in ('procedure', 'approach') then
      raise exception 'La progression opératoire suivie est invalide.'
        using errcode = '22023';
    end if;
  end if;

  if trophy_format = 'levels' then
    if jsonb_typeof(p_definition -> 'levels') <> 'array'
      or jsonb_array_length(p_definition -> 'levels') <> 4 then
      raise exception 'Les niveaux Bronze, Argent, Or et Diamant sont obligatoires.'
        using errcode = '22023';
    end if;

    for level_definition in
      select item
      from jsonb_array_elements(p_definition -> 'levels') item
    loop
      tier_index := tier_index + 1;

      if level_definition ->> 'tier' <> expected_tiers[tier_index] then
        raise exception 'Les niveaux doivent suivre l’ordre Bronze, Argent, Or et Diamant.'
          using errcode = '22023';
      end if;

      level_tracked_status := coalesce(
        level_definition ->> 'trackedStatus',
        p_definition ->> 'trackedInterventionStatus'
      );

      if level_tracked_status not in ('recorded', 'evaluated') then
        raise exception 'Le statut suivi par les niveaux est invalide.'
          using errcode = '22023';
      end if;

      if expected_tracked_status is null then
        expected_tracked_status := level_tracked_status;
      elsif level_tracked_status <> expected_tracked_status then
        raise exception 'Tous les niveaux doivent suivre la même règle métier.'
          using errcode = '22023';
      end if;

      if level_tracked_status <>
        coalesce(p_definition ->> 'trackedInterventionStatus', '') then
        raise exception
          'Les niveaux doivent suivre le statut d’intervention défini pour le trophée.'
          using errcode = '22023';
      end if;

      begin
        current_threshold := (level_definition ->> 'threshold')::numeric;
      exception
        when others then
          raise exception 'Chaque niveau doit posséder un seuil numérique.'
            using errcode = '22023';
      end;

      if current_threshold <= 0
        or (previous_threshold is not null and current_threshold <= previous_threshold) then
        raise exception 'Les seuils Bronze, Argent, Or et Diamant doivent être strictement croissants.'
          using errcode = '22023';
      end if;

      if level_definition ->> 'autonomyMin' is not null then
        current_autonomy_min :=
          (level_definition ->> 'autonomyMin')::numeric;

        if current_autonomy_min < 0 or current_autonomy_min > 100 then
          raise exception
            'Le minimum d’autonomie doit être compris entre 0 et 100.'
            using errcode = '22023';
        end if;

        if previous_autonomy_min is not null
          and current_autonomy_min < previous_autonomy_min then
          raise exception
            'Le minimum d’autonomie ne peut pas diminuer entre deux niveaux.'
            using errcode = '22023';
        end if;

        previous_autonomy_min := current_autonomy_min;
      elsif previous_autonomy_min is not null then
        raise exception
          'Le minimum d’autonomie ne peut pas disparaître à un niveau supérieur.'
          using errcode = '22023';
      end if;

      if nullif(
        trim(
          coalesce(
            level_definition ->> 'imageSrc',
            p_definition #>> array['images', expected_tiers[tier_index]]
          )
        ),
        ''
      ) is null then
        raise exception 'Une image est obligatoire pour chaque niveau.'
          using errcode = '22023';
      end if;

      if coalesce(p_definition ->> 'visibility', '') = 'surprise'
        and coalesce(
          level_definition ->> 'imageSrc',
          p_definition #>> array['images', expected_tiers[tier_index]]
        ) not like '/api/trophy-image?%'
        and coalesce(
          level_definition ->> 'imageSrc',
          p_definition #>> array['images', expected_tiers[tier_index]]
        ) not like '%/storage/v1/object/public/trophy-images/%' then
        raise exception
          'Les images d’un trophée surprise doivent utiliser le stockage protégé.'
          using errcode = '22023';
      end if;

      previous_threshold := current_threshold;
    end loop;
  else
    if nullif(trim(p_definition #>> array['images', 'single']), '') is null then
      raise exception 'Une image est obligatoire pour un trophée unique.'
        using errcode = '22023';
    end if;

    if coalesce(p_definition ->> 'visibility', '') = 'surprise'
      and (p_definition #>> array['images', 'single'])
        not like '/api/trophy-image?%'
      and (p_definition #>> array['images', 'single'])
        not like '%/storage/v1/object/public/trophy-images/%' then
      raise exception
        'L’image d’un trophée surprise doit utiliser le stockage protégé.'
        using errcode = '22023';
    end if;

    if jsonb_typeof(p_definition -> 'conditions') <> 'array'
      or jsonb_array_length(p_definition -> 'conditions') = 0 then
      raise exception 'Ajoutez au moins une condition d’obtention.'
        using errcode = '22023';
    end if;

    for condition in
      select item
      from jsonb_array_elements(p_definition -> 'conditions') item
    loop
      condition_type := condition ->> 'type';

      if condition_type not in (
        'first_recorded',
        'total_recorded',
        'total_evaluated',
        'profile_login_count',
        'procedure_count',
        'approach_count',
        'recording_time_range',
        'average_autonomy',
        'cross_procedure_autonomy',
        'distinct_procedures',
        'role',
        'intervention_status'
      ) then
        raise exception 'Une condition d’obtention est invalide.'
          using errcode = '22023';
      end if;

      if condition_type in (
        'total_recorded',
        'total_evaluated',
        'profile_login_count',
        'procedure_count',
        'approach_count',
        'recording_time_range'
      )
        and coalesce((condition ->> 'threshold')::numeric, 0) <= 0 then
        raise exception 'Chaque condition de volume doit posséder un seuil positif.'
          using errcode = '22023';
      end if;

      if condition_type in ('average_autonomy', 'cross_procedure_autonomy')
        and (
          condition ->> 'autonomyMin' is null
          or (condition ->> 'autonomyMin')::numeric < 0
          or (condition ->> 'autonomyMin')::numeric > 100
        ) then
        raise exception 'Le minimum d’autonomie doit être compris entre 0 et 100.'
          using errcode = '22023';
      end if;

      if condition_type = 'cross_procedure_autonomy'
        and (
          coalesce((condition ->> 'distinctProcedureCount')::integer, 0) <= 0
          or coalesce((condition ->> 'minEvaluatedPerProcedure')::integer, 0) <= 0
        ) then
        raise exception 'Les volumes de la condition multi-interventions doivent être positifs.'
          using errcode = '22023';
      end if;

      if condition_type = 'procedure_count'
        and nullif(
          trim(
            coalesce(
              condition ->> 'procedure',
              p_definition ->> 'associatedProcedure'
            )
          ),
          ''
        ) is null then
        raise exception 'Une intervention doit être sélectionnée.'
          using errcode = '22023';
      end if;

      if condition_type = 'approach_count'
        and nullif(
          trim(
            coalesce(
              condition ->> 'approach',
              p_definition ->> 'associatedApproach'
            )
          ),
          ''
        ) is null then
        raise exception 'Une voie d’abord doit être sélectionnée.'
          using errcode = '22023';
      end if;

      if condition_type = 'distinct_procedures'
        and coalesce(
          (condition ->> 'distinctProcedureCount')::integer,
          (condition ->> 'threshold')::integer,
          0
        ) <= 0 then
        raise exception 'Le nombre d’interventions distinctes doit être positif.'
          using errcode = '22023';
      end if;

      if condition_type = 'recording_time_range'
        and (
          coalesce(condition ->> 'startHour', '') !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
          or coalesce(condition ->> 'endHour', '') !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$'
        ) then
        raise exception 'La plage horaire de la condition est invalide.'
          using errcode = '22023';
      end if;

      if condition_type = 'role'
        and nullif(trim(condition ->> 'role'), '') is null then
        raise exception 'Le rôle de la condition est obligatoire.'
          using errcode = '22023';
      end if;

      if condition_type = 'intervention_status'
        and coalesce(condition ->> 'interventionStatus', '')
          not in ('evaluated', 'pending') then
        raise exception 'Le statut d’intervention de la condition est invalide.'
          using errcode = '22023';
      end if;
    end loop;
  end if;
end;
$$;

revoke all on function public.validate_trophy_definition_for_publication(jsonb)
  from public;

create or replace function public.list_visible_trophy_definitions()
returns table (
  id text,
  title text,
  status text,
  definition jsonb,
  created_by_profile_id uuid,
  created_at timestamptz,
  updated_at timestamptz,
  version bigint,
  updated_by_profile_id uuid,
  ever_activated boolean,
  activated_at timestamptz,
  pending_draft_definition jsonb,
  pending_draft_version bigint,
  pending_draft_base_version bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    trophy.id,
    trophy.title,
    trophy.status,
    trophy.definition,
    trophy.created_by_profile_id,
    trophy.created_at,
    trophy.updated_at,
    trophy.version,
    trophy.updated_by_profile_id,
    trophy.ever_activated,
    trophy.activated_at,
    case when public.is_admin() then draft.definition else null end,
    case when public.is_admin() then draft.version else null end,
    case when public.is_admin() then draft.base_version else null end
  from public.trophy_definitions trophy
  left join public.trophy_definition_drafts draft
    on draft.trophy_id = trophy.id
  where public.is_admin()
    or (
      trophy.status = 'active'
      and (
        coalesce(trophy.definition ->> 'visibility', 'visible') <> 'surprise'
        or exists (
          select 1
          from public.trophy_awards award
          where award.trophy_id = trophy.id
            and (
              award.profile_id = public.current_profile_id()
              or public.senior_can_read_internal(award.profile_id)
            )
        )
      )
    )
  order by trophy.title asc;
$$;

revoke all on function public.list_visible_trophy_definitions() from public;
grant execute on function public.list_visible_trophy_definitions()
  to authenticated;

-- The connection counter is part of trophy progression. Seniors may already
-- consult the progression of every internal in their institution, so expose
-- only this derived counter (never the profile metadata object).
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
  version bigint,
  last_login_at timestamptz,
  login_count integer
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
    profile.version,
    profile.last_login_at,
    (
      select count(*)::integer
      from public.activity_log activity
      where activity.profile_id = profile.id
        and activity.action = 'Connexion au profil'
    )
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

revoke all on function public.list_visible_internal_directory() from public;
grant execute on function public.list_visible_internal_directory()
  to authenticated;

drop policy if exists "trophy_definitions_read" on public.trophy_definitions;
drop policy if exists "trophy_definitions_admin_insert" on public.trophy_definitions;
drop policy if exists "trophy_definitions_admin_update" on public.trophy_definitions;
drop policy if exists "trophy_definitions_admin_delete" on public.trophy_definitions;
revoke select, insert, update, delete
  on table public.trophy_definitions
  from authenticated;

create policy "trophy_definitions_admin_read"
on public.trophy_definitions for select
to authenticated
using (public.is_admin());

grant select on table public.trophy_definitions to authenticated;

-- Defense in depth: attributions are always produced by the server engine.
revoke insert, update, delete
  on table public.trophy_awards
  from authenticated;

create or replace function public.save_trophy_definition_draft(
  p_trophy_id text,
  p_expected_definition_version bigint,
  p_expected_draft_version bigint,
  p_definition jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles%rowtype;
  stored_definition public.trophy_definitions%rowtype;
  stored_draft public.trophy_definition_drafts%rowtype;
  saved_definition public.trophy_definitions%rowtype;
  saved_draft public.trophy_definition_drafts%rowtype;
  normalized_definition jsonb;
  now_value timestamptz := now();
begin
  actor := public.require_active_admin();

  if nullif(trim(p_trophy_id), '') is null
    or jsonb_typeof(p_definition) <> 'object' then
    raise exception 'Le brouillon du trophée est invalide.'
      using errcode = '22023';
  end if;

  normalized_definition :=
    p_definition
    || jsonb_build_object(
      'id', p_trophy_id,
      'status', 'draft',
      'updatedAt', now_value
    );

  select trophy.*
  into stored_definition
  from public.trophy_definitions trophy
  where trophy.id = p_trophy_id
  for update;

  if stored_definition.id is null then
    if p_expected_definition_version is not null then
      raise exception 'Ce trophée n’existe plus. Rechargez les données.'
        using errcode = '40001';
    end if;

    insert into public.trophy_definitions (
      id,
      title,
      status,
      definition,
      created_by_profile_id,
      updated_by_profile_id,
      created_at,
      updated_at
    )
    values (
      p_trophy_id,
      coalesce(nullif(trim(normalized_definition ->> 'title'), ''), 'Trophée sans titre'),
      'draft',
      normalized_definition,
      actor.id,
      actor.id,
      now_value,
      now_value
    )
    returning * into saved_definition;

    return jsonb_build_object(
      'definition', to_jsonb(saved_definition),
      'draftVersion', null,
      'baseVersion', saved_definition.version
    );
  end if;

  if stored_definition.version <> p_expected_definition_version then
    raise exception 'Ce trophée a été modifié. Rechargez les données.'
      using errcode = '40001';
  end if;

  if stored_definition.status = 'draft'
    and stored_definition.ever_activated is distinct from true then
    update public.trophy_definitions trophy
    set
      title = coalesce(
        nullif(trim(normalized_definition ->> 'title'), ''),
        trophy.title
      ),
      definition = normalized_definition,
      status = 'draft',
      updated_by_profile_id = actor.id,
      updated_at = now_value
    where trophy.id = stored_definition.id
      and trophy.version = stored_definition.version
    returning * into saved_definition;

    return jsonb_build_object(
      'definition', to_jsonb(saved_definition),
      'draftVersion', null,
      'baseVersion', saved_definition.version
    );
  end if;

  select draft.*
  into stored_draft
  from public.trophy_definition_drafts draft
  where draft.trophy_id = stored_definition.id
  for update;

  if stored_draft.trophy_id is null then
    if p_expected_draft_version is not null then
      raise exception 'Le brouillon a été modifié. Rechargez les données.'
        using errcode = '40001';
    end if;

    insert into public.trophy_definition_drafts (
      trophy_id,
      definition,
      base_version,
      created_by_profile_id,
      updated_by_profile_id
    )
    values (
      stored_definition.id,
      normalized_definition,
      stored_definition.version,
      actor.id,
      actor.id
    )
    returning * into saved_draft;
  else
    if stored_draft.base_version <> stored_definition.version
      or stored_draft.version <> p_expected_draft_version then
      raise exception 'Le brouillon a été modifié. Rechargez les données.'
        using errcode = '40001';
    end if;

    update public.trophy_definition_drafts draft
    set
      definition = normalized_definition,
      version = draft.version + 1,
      updated_by_profile_id = actor.id,
      updated_at = now_value
    where draft.trophy_id = stored_definition.id
      and draft.version = stored_draft.version
    returning * into saved_draft;
  end if;

  return jsonb_build_object(
    'definition', to_jsonb(stored_definition),
    'draft', saved_draft.definition,
    'draftVersion', saved_draft.version,
    'baseVersion', saved_draft.base_version
  );
end;
$$;

revoke all on function public.save_trophy_definition_draft(
  text,
  bigint,
  bigint,
  jsonb
) from public;
grant execute on function public.save_trophy_definition_draft(
  text,
  bigint,
  bigint,
  jsonb
) to authenticated;

-- ---------------------------------------------------------------------------
-- Deterministic achievement dates and authoritative awards.
-- ---------------------------------------------------------------------------

create or replace function public.trophy_level_achievement(
  p_profile_id uuid,
  p_trophy_definition jsonb,
  p_level_definition jsonb
)
returns table (
  met boolean,
  event_at timestamptz,
  source_intervention_id uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with filtered_events as (
    select
      intervention.id,
      case
        when coalesce(p_level_definition ->> 'trackedStatus', 'recorded') = 'evaluated'
          or p_level_definition ->> 'autonomyMin' is not null
          then evaluation.created_at
        else intervention.saved_at
      end as effective_at,
      intervention.autonomy_score
    from public.interventions intervention
    left join public.intervention_evaluations evaluation
      on evaluation.intervention_id = intervention.id
    where intervention.internal_profile_id = p_profile_id
      and intervention.deleted_at is null
      and (
        nullif(p_trophy_definition ->> 'associatedProcedure', '') is null
        or intervention.procedure_id =
          p_trophy_definition ->> 'associatedProcedure'
      )
      and (
        nullif(p_trophy_definition ->> 'associatedApproach', '') is null
        or intervention.approach =
          p_trophy_definition ->> 'associatedApproach'
      )
      and (
        nullif(p_trophy_definition ->> 'associatedIndication', '') is null
        or intervention.indication =
          p_trophy_definition ->> 'associatedIndication'
      )
      and (
        nullif(p_trophy_definition ->> 'trackedRole', '') is null
        or intervention.role = p_trophy_definition ->> 'trackedRole'
      )
      and (
        coalesce(p_level_definition ->> 'trackedStatus', 'recorded') = 'recorded'
        or evaluation.intervention_id is not null
      )
      and (
        p_level_definition ->> 'autonomyMin' is null
        or intervention.autonomy_score is not null
      )
  ),
  progress as (
    select
      event.id,
      event.effective_at,
      count(*) over (
        order by event.effective_at, event.id
        rows between unbounded preceding and current row
      ) as running_count,
      avg(event.autonomy_score) over (
        order by event.effective_at, event.id
        rows between unbounded preceding and current row
      ) as running_average
    from filtered_events event
    where event.effective_at is not null
  ),
  states as (
    select
      progress.*,
      (
        progress.running_count >=
          coalesce((p_level_definition ->> 'threshold')::integer, 0)
        and (
          p_level_definition ->> 'autonomyMin' is null
          or progress.running_average >=
            (p_level_definition ->> 'autonomyMin')::numeric
        )
      ) as is_met
    from progress
  ),
  transitions as (
    select
      state.*,
      lag(state.is_met, 1, false) over (
        order by state.effective_at, state.id
      ) as was_met
    from states state
  ),
  current_state as (
    select state.is_met
    from states state
    order by state.effective_at desc, state.id desc
    limit 1
  ),
  latest_achievement as (
    select transition.id, transition.effective_at
    from transitions transition
    where transition.is_met and not transition.was_met
    order by transition.effective_at desc, transition.id desc
    limit 1
  )
  select
    coalesce(current_state.is_met, false),
    case
      when coalesce(current_state.is_met, false)
        then latest_achievement.effective_at
      else null
    end,
    case
      when coalesce(current_state.is_met, false)
        then latest_achievement.id
      else null
    end
  from (select 1) seed
  left join current_state on true
  left join latest_achievement on true;
$$;

revoke all on function public.trophy_level_achievement(uuid, jsonb, jsonb)
  from public;

create or replace function public.trophy_condition_achievement(
  p_profile_id uuid,
  p_trophy_definition jsonb,
  p_condition jsonb
)
returns table (
  met boolean,
  event_at timestamptz,
  source_intervention_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  condition_type text := p_condition ->> 'type';
  threshold integer := greatest(
    1,
    coalesce((p_condition ->> 'threshold')::integer, 1)
  );
  tracked_status text := coalesce(
    p_condition ->> 'trackedStatus',
    'recorded'
  );
  required_role text := nullif(p_condition ->> 'role', '');
  required_procedure text := coalesce(
    nullif(p_condition ->> 'procedure', ''),
    nullif(p_trophy_definition ->> 'associatedProcedure', '')
  );
  required_approach text := coalesce(
    nullif(p_condition ->> 'approach', ''),
    nullif(p_trophy_definition ->> 'associatedApproach', '')
  );
begin
  if not public.trophy_condition_is_met(
    p_profile_id,
    p_trophy_definition,
    p_condition
  ) then
    return query select false, null::timestamptz, null::uuid;
    return;
  end if;

  if condition_type = 'profile_login_count' then
    return query
    select true, activity.created_at, null::uuid
    from public.activity_log activity
    where activity.profile_id = p_profile_id
      and activity.action = 'Connexion au profil'
    order by activity.created_at, activity.id
    offset threshold - 1
    limit 1;
    return;
  end if;

  if condition_type = 'average_autonomy' then
    return query
    with events as (
      select
        intervention.id,
        coalesce(evaluation.created_at, intervention.saved_at) as effective_at,
        intervention.autonomy_score
      from public.interventions intervention
      left join public.intervention_evaluations evaluation
        on evaluation.intervention_id = intervention.id
      where intervention.internal_profile_id = p_profile_id
        and intervention.deleted_at is null
        and intervention.autonomy_score is not null
        and (required_role is null or intervention.role = required_role)
    ),
    states as (
      select
        event.id,
        event.effective_at,
        avg(event.autonomy_score) over (
          order by event.effective_at, event.id
          rows between unbounded preceding and current row
        ) >= (p_condition ->> 'autonomyMin')::numeric as is_met
      from events event
    ),
    transitions as (
      select
        state.*,
        lag(state.is_met, 1, false) over (
          order by state.effective_at, state.id
        ) as was_met
      from states state
    ),
    latest_achievement as (
      select transition.id, transition.effective_at
      from transitions transition
      where transition.is_met and not transition.was_met
      order by transition.effective_at desc, transition.id desc
      limit 1
    )
    select true, achievement.effective_at, achievement.id
    from latest_achievement achievement;
    return;
  end if;

  if condition_type = 'cross_procedure_autonomy' then
    return query
    with events as (
      select
        intervention.id,
        intervention.procedure_id,
        coalesce(evaluation.created_at, intervention.saved_at) as effective_at,
        intervention.autonomy_score
      from public.interventions intervention
      join public.intervention_evaluations evaluation
        on evaluation.intervention_id = intervention.id
      where intervention.internal_profile_id = p_profile_id
        and intervention.deleted_at is null
        and intervention.autonomy_score is not null
        and (required_role is null or intervention.role = required_role)
    ),
    states as (
      select
        checkpoint.id,
        checkpoint.effective_at,
        (
          select count(*)
          from (
            select prior.procedure_id
            from events prior
            where (prior.effective_at, prior.id)
              <= (checkpoint.effective_at, checkpoint.id)
            group by prior.procedure_id
            having count(*) >=
              (p_condition ->> 'minEvaluatedPerProcedure')::integer
              and avg(prior.autonomy_score) >=
                (p_condition ->> 'autonomyMin')::numeric
          ) qualifying_procedures
        ) >= (p_condition ->> 'distinctProcedureCount')::integer as is_met
      from events checkpoint
    ),
    transitions as (
      select
        state.*,
        lag(state.is_met, 1, false) over (
          order by state.effective_at, state.id
        ) as was_met
      from states state
    ),
    latest_achievement as (
      select transition.id, transition.effective_at
      from transitions transition
      where transition.is_met and not transition.was_met
      order by transition.effective_at desc, transition.id desc
      limit 1
    )
    select true, achievement.effective_at, achievement.id
    from latest_achievement achievement;
    return;
  end if;

  if condition_type = 'distinct_procedures' then
    return query
    with first_per_procedure as (
      select distinct on (intervention.procedure_id)
        intervention.id,
        case
          when tracked_status = 'evaluated' then evaluation.created_at
          else intervention.saved_at
        end as effective_at
      from public.interventions intervention
      left join public.intervention_evaluations evaluation
        on evaluation.intervention_id = intervention.id
      where intervention.internal_profile_id = p_profile_id
        and intervention.deleted_at is null
        and (required_role is null or intervention.role = required_role)
        and (
          tracked_status = 'recorded'
          or evaluation.intervention_id is not null
        )
      order by
        intervention.procedure_id,
        case
          when tracked_status = 'evaluated' then evaluation.created_at
          else intervention.saved_at
        end,
        intervention.id
    )
    select true, event.effective_at, event.id
    from first_per_procedure event
    order by event.effective_at, event.id
    offset greatest(
      1,
      coalesce(
        (p_condition ->> 'distinctProcedureCount')::integer,
        threshold
      )
    ) - 1
    limit 1;
    return;
  end if;

  return query
  with matching_events as (
    select
      intervention.id,
      case
        when condition_type in ('total_evaluated')
          or (
            condition_type in ('procedure_count', 'approach_count')
            and tracked_status = 'evaluated'
          )
          or (
            condition_type = 'intervention_status'
            and p_condition ->> 'interventionStatus' = 'evaluated'
          )
          then evaluation.created_at
        else intervention.saved_at
      end as effective_at
    from public.interventions intervention
    left join public.intervention_evaluations evaluation
      on evaluation.intervention_id = intervention.id
    where intervention.internal_profile_id = p_profile_id
      and intervention.deleted_at is null
      and (
        condition_type not in ('procedure_count')
        or required_procedure is null
        or intervention.procedure_id = required_procedure
      )
      and (
        condition_type not in ('approach_count')
        or required_approach is null
        or intervention.approach = required_approach
      )
      and (
        condition_type <> 'role'
        or intervention.role = required_role
      )
      and (
        condition_type not in (
          'procedure_count',
          'approach_count',
          'recording_time_range'
        )
        or required_role is null
        or intervention.role = required_role
      )
      and (
        condition_type not in ('total_evaluated')
        or evaluation.intervention_id is not null
      )
      and (
        condition_type not in ('procedure_count', 'approach_count')
        or tracked_status = 'recorded'
        or evaluation.intervention_id is not null
      )
      and (
        condition_type <> 'recording_time_range'
        or case
          when coalesce(p_condition ->> 'startHour', '00:00')
            <= coalesce(p_condition ->> 'endHour', '00:00') then
            to_char(intervention.saved_at at time zone 'Europe/Paris', 'HH24:MI')
              between coalesce(p_condition ->> 'startHour', '00:00')
                and coalesce(p_condition ->> 'endHour', '00:00')
          else
            to_char(intervention.saved_at at time zone 'Europe/Paris', 'HH24:MI')
              >= coalesce(p_condition ->> 'startHour', '00:00')
            or to_char(
              intervention.saved_at at time zone 'Europe/Paris',
              'HH24:MI'
            ) <= coalesce(p_condition ->> 'endHour', '00:00')
        end
      )
      and (
        condition_type <> 'intervention_status'
        or (
          p_condition ->> 'interventionStatus' = 'pending'
          and evaluation.intervention_id is null
        )
        or (
          p_condition ->> 'interventionStatus' = 'evaluated'
          and evaluation.intervention_id is not null
        )
      )
  )
  select true, event.effective_at, event.id
  from matching_events event
  where event.effective_at is not null
  order by event.effective_at, event.id
  offset case
    when condition_type in ('first_recorded', 'role', 'intervention_status')
      then 0
    else threshold - 1
  end
  limit 1;
end;
$$;

revoke all on function public.trophy_condition_achievement(uuid, jsonb, jsonb)
  from public;

create or replace function public.rebuild_profile_trophy_awards(
  p_profile_id uuid,
  p_effective_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  trophy public.trophy_definitions%rowtype;
  condition jsonb;
  level_definition jsonb;
  condition_result record;
  level_result record;
  all_conditions_met boolean;
  achieved_at timestamptz;
  condition_achieved_at timestamptz;
  achieved_source_id uuid;
  condition_source_id uuid;
  desired_count integer;
  removed_count integer;
begin
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = p_profile_id
      and profile.role = 'internal'::public.app_role
  ) then
    return jsonb_build_object('awarded', 0, 'removed', 0);
  end if;

  drop table if exists pg_temp.project1_desired_trophy_awards;
  create temporary table project1_desired_trophy_awards (
    trophy_id text not null,
    tier text not null,
    awarded_at timestamptz not null,
    source_intervention_id uuid,
    primary key (trophy_id, tier)
  ) on commit drop;

  for trophy in
    select definition.*
    from public.trophy_definitions definition
    where definition.status = 'active'
  loop
    if coalesce(trophy.definition ->> 'format', 'unique') = 'levels'
      and jsonb_typeof(trophy.definition -> 'levels') = 'array' then
      for level_definition in
        select level
        from jsonb_array_elements(trophy.definition -> 'levels') level
      loop
        select *
        into level_result
        from public.trophy_level_achievement(
          p_profile_id,
          trophy.definition,
          level_definition
        );

        if level_result.met then
          insert into project1_desired_trophy_awards (
            trophy_id,
            tier,
            awarded_at,
            source_intervention_id
          )
          values (
            trophy.id,
            level_definition ->> 'tier',
            greatest(
              coalesce(trophy.activated_at, trophy.created_at),
              coalesce(level_result.event_at, p_effective_at)
            ),
            level_result.source_intervention_id
          )
          on conflict do nothing;
        end if;
      end loop;
    elsif jsonb_typeof(trophy.definition -> 'conditions') = 'array'
      and jsonb_array_length(trophy.definition -> 'conditions') > 0 then
      all_conditions_met := true;
      achieved_at := null;
      achieved_source_id := null;

      for condition in
        select item
        from jsonb_array_elements(trophy.definition -> 'conditions') item
      loop
        select *
        into condition_result
        from public.trophy_condition_achievement(
          p_profile_id,
          trophy.definition,
          condition
        );

        if not condition_result.met then
          all_conditions_met := false;
          exit;
        end if;

        condition_achieved_at := condition_result.event_at;
        condition_source_id := condition_result.source_intervention_id;

        if achieved_at is null
          or condition_achieved_at > achieved_at then
          achieved_at := condition_achieved_at;
          achieved_source_id := condition_source_id;
        end if;
      end loop;

      if all_conditions_met then
        insert into project1_desired_trophy_awards (
          trophy_id,
          tier,
          awarded_at,
          source_intervention_id
        )
        values (
          trophy.id,
          'bronze',
          greatest(
            coalesce(trophy.activated_at, trophy.created_at),
            coalesce(achieved_at, p_effective_at)
          ),
          achieved_source_id
        )
        on conflict do nothing;
      end if;
    end if;
  end loop;

  insert into public.trophy_awards (
    trophy_id,
    profile_id,
    tier,
    awarded_at,
    source_intervention_id
  )
  select
    desired.trophy_id,
    p_profile_id,
    desired.tier,
    desired.awarded_at,
    desired.source_intervention_id
  from project1_desired_trophy_awards desired
  on conflict (trophy_id, profile_id, tier) do update
  set
    awarded_at = excluded.awarded_at,
    source_intervention_id = excluded.source_intervention_id
  where public.trophy_awards.awarded_at is distinct from excluded.awarded_at
     or public.trophy_awards.source_intervention_id
       is distinct from excluded.source_intervention_id;

  get diagnostics desired_count = row_count;

  delete from public.trophy_awards award
  using public.trophy_definitions definition
  where award.profile_id = p_profile_id
    and definition.id = award.trophy_id
    and definition.status = 'active'
    and not exists (
      select 1
      from project1_desired_trophy_awards desired
      where desired.trophy_id = award.trophy_id
        and desired.tier = award.tier
    );

  get diagnostics removed_count = row_count;

  return jsonb_build_object(
    'awarded', desired_count,
    'removed', removed_count
  );
end;
$$;

revoke all on function public.rebuild_profile_trophy_awards(uuid, timestamptz)
  from public;

-- ---------------------------------------------------------------------------
-- In-app and mobile push notification outbox.
-- ---------------------------------------------------------------------------

create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  award_event_id uuid not null unique,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('trophy_awarded')),
  trophy_id text references public.trophy_definitions(id) on delete restrict,
  tier text,
  title text not null,
  body text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  push_status text not null default 'pending'
    check (push_status in ('pending', 'processing', 'sent', 'failed', 'unavailable')),
  push_attempts integer not null default 0
    check (push_attempts between 0 and 5),
  push_attempted_at timestamptz,
  push_next_attempt_at timestamptz not null default now(),
  push_ticket_ids jsonb,
  push_error text
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null unique,
  device_id text not null,
  platform text not null check (platform in ('ios', 'android')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (profile_id, device_id)
);

alter table public.user_notifications enable row level security;
alter table public.push_subscriptions enable row level security;

revoke all on table public.user_notifications from public, anon, authenticated;
revoke all on table public.push_subscriptions from public, anon, authenticated;

create policy "user_notifications_owner_or_admin_read"
on public.user_notifications for select
to authenticated
using (
  profile_id = public.current_profile_id()
  or public.is_admin()
);

grant select on table public.user_notifications to authenticated;

create or replace function public.create_trophy_award_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_setting(
    'monjdb.suppress_trophy_notifications',
    true
  ) = 'on' then
    return null;
  end if;

  insert into public.user_notifications (
    award_event_id,
    profile_id,
    kind,
    trophy_id,
    tier,
    title,
    body,
    created_at
  )
  select distinct on (award.profile_id, award.trophy_id)
    award.id,
    award.profile_id,
    'trophy_awarded',
    award.trophy_id,
    award.tier,
    'Nouveau trophée obtenu',
    case
      when coalesce(definition.definition ->> 'format', 'unique') = 'levels'
        then concat(
          definition.title,
          ' — niveau ',
          case award.tier
            when 'silver' then 'Argent'
            when 'gold' then 'Or'
            when 'diamond' then 'Diamant'
            else 'Bronze'
          end
        )
      else definition.title
    end,
    now()
  from inserted_awards award
  join public.trophy_definitions definition
    on definition.id = award.trophy_id
   and definition.status = 'active'
  order by
    award.profile_id,
    award.trophy_id,
    case award.tier
      when 'diamond' then 4
      when 'gold' then 3
      when 'silver' then 2
      else 1
    end desc,
    award.awarded_at desc
  on conflict (award_event_id) do nothing;

  return null;
end;
$$;

drop trigger if exists notify_trophy_award on public.trophy_awards;
create trigger notify_trophy_award
after insert on public.trophy_awards
referencing new table as inserted_awards
for each statement execute function public.create_trophy_award_notifications();

create or replace function public.register_push_subscription(
  p_expo_push_token text,
  p_device_id text,
  p_platform text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles%rowtype;
  subscription public.push_subscriptions%rowtype;
begin
  select profile.*
  into actor
  from public.profiles profile
  where profile.id = public.current_profile_id()
    and profile.is_active
  limit 1;

  if actor.id is null then
    raise exception 'Un profil actif est requis.' using errcode = '42501';
  end if;

  if coalesce(p_expo_push_token, '') !~ '^ExponentPushToken\[[A-Za-z0-9_-]+\]$'
    and coalesce(p_expo_push_token, '') !~ '^ExpoPushToken\[[A-Za-z0-9_-]+\]$' then
    raise exception 'Le jeton de notification est invalide.'
      using errcode = '22023';
  end if;

  if nullif(trim(p_device_id), '') is null
    or length(trim(p_device_id)) > 128
    or p_platform not in ('ios', 'android') then
    raise exception 'L’appareil de notification est invalide.'
      using errcode = '22023';
  end if;

  delete from public.push_subscriptions existing
  where existing.profile_id = actor.id
    and existing.device_id = trim(p_device_id)
    and existing.expo_push_token <> p_expo_push_token;

  insert into public.push_subscriptions (
    profile_id,
    expo_push_token,
    device_id,
    platform,
    is_active,
    last_seen_at
  )
  values (
    actor.id,
    p_expo_push_token,
    p_device_id,
    p_platform,
    true,
    now()
  )
  on conflict (expo_push_token) do update
  set
    profile_id = excluded.profile_id,
    device_id = excluded.device_id,
    expo_push_token = excluded.expo_push_token,
    platform = excluded.platform,
    is_active = true,
    updated_at = now(),
    last_seen_at = now()
  returning * into subscription;

  return subscription.id;
end;
$$;

revoke all on function public.register_push_subscription(text, text, text)
  from public;
grant execute on function public.register_push_subscription(text, text, text)
  to authenticated;

-- The server claims push work atomically. Device tokens are never returned to
-- browser or mobile sessions through the Data API.
create or replace function public.claim_pending_push_notifications(
  p_limit integer default 20
)
returns table (
  notification_id uuid,
  title text,
  body text,
  push_attempts integer,
  expo_push_tokens text[]
)
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_notifications notification
  set
    push_status = 'unavailable',
    push_attempted_at = now(),
    push_error = 'Aucun appareil autorisé pour les notifications.'
  where notification.push_status in ('pending', 'failed')
    and notification.push_next_attempt_at <= now()
    and not exists (
      select 1
      from public.push_subscriptions subscription
      where subscription.profile_id = notification.profile_id
        and subscription.is_active
    );

  return query
  with candidates as (
    select notification.id
    from public.user_notifications notification
    where (
      notification.push_status = 'pending'
      or (
        notification.push_status = 'processing'
        and notification.push_attempted_at < now() - interval '5 minutes'
      )
    )
      and notification.push_attempts < 5
      and notification.push_next_attempt_at <= now()
      and exists (
        select 1
        from public.push_subscriptions subscription
        where subscription.profile_id = notification.profile_id
          and subscription.is_active
      )
    order by notification.created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 50))
  ),
  claimed as (
    update public.user_notifications notification
    set
      push_status = 'processing',
      push_attempts = notification.push_attempts + 1,
      push_attempted_at = now(),
      push_error = null
    from candidates
    where notification.id = candidates.id
    returning
      notification.id,
      notification.profile_id,
      notification.title,
      notification.body,
      notification.push_attempts
  )
  select
    claimed.id,
    claimed.title,
    claimed.body,
    claimed.push_attempts,
    array_agg(
      subscription.expo_push_token
      order by subscription.id
    )
  from claimed
  join public.push_subscriptions subscription
    on subscription.profile_id = claimed.profile_id
   and subscription.is_active
  group by
    claimed.id,
    claimed.title,
    claimed.body,
    claimed.push_attempts;
end;
$$;

revoke all on function public.claim_pending_push_notifications(integer)
  from public, anon, authenticated;
grant execute on function public.claim_pending_push_notifications(integer)
  to service_role;

create or replace function public.mark_user_notification_read(
  p_notification_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.user_notifications notification
  set read_at = coalesce(notification.read_at, now())
  where notification.id = p_notification_id
    and notification.profile_id = public.current_profile_id();

  if not found then
    raise exception 'Notification introuvable.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.mark_user_notification_read(uuid) from public;
grant execute on function public.mark_user_notification_read(uuid)
  to authenticated;

-- Every server-recorded internal login immediately refreshes its trophy awards.
create or replace function public.refresh_trophies_after_login_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.action = 'Connexion au profil'
    and new.profile_id is not null
    and new.actor_role = 'internal'::public.app_role then
    perform public.rebuild_profile_trophy_awards(new.profile_id, new.created_at);
  end if;

  return new;
end;
$$;

drop trigger if exists refresh_trophies_after_login_activity
  on public.activity_log;
create trigger refresh_trophies_after_login_activity
after insert on public.activity_log
for each row execute function public.refresh_trophies_after_login_activity();

create or replace function public.publish_trophy_definition_draft(
  p_trophy_id text,
  p_expected_definition_version bigint,
  p_expected_draft_version bigint,
  p_target_status text default 'active'
)
returns public.trophy_definitions
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles%rowtype;
  stored_definition public.trophy_definitions%rowtype;
  stored_draft public.trophy_definition_drafts%rowtype;
  published_definition public.trophy_definitions%rowtype;
  definition_to_publish jsonb;
  effective_at timestamptz := now();
begin
  actor := public.require_active_admin();

  if p_target_status not in ('active', 'inactive') then
    raise exception 'Le statut publié est invalide.' using errcode = '22023';
  end if;

  select trophy.*
  into stored_definition
  from public.trophy_definitions trophy
  where trophy.id = p_trophy_id
  for update;

  if stored_definition.id is null then
    raise exception 'Trophée introuvable.' using errcode = 'P0002';
  end if;

  if p_target_status = 'inactive'
    and stored_definition.ever_activated is distinct from true then
    raise exception
      'Un trophée jamais activé doit rester en brouillon.'
      using errcode = '22023';
  end if;

  if stored_definition.version <> p_expected_definition_version then
    raise exception 'Ce trophée a été modifié. Rechargez les données.'
      using errcode = '40001';
  end if;

  if stored_definition.status = 'draft'
    and stored_definition.ever_activated is distinct from true then
    if p_expected_draft_version is not null then
      raise exception 'Le brouillon a été modifié. Rechargez les données.'
        using errcode = '40001';
    end if;
    definition_to_publish := stored_definition.definition;
  else
    select draft.*
    into stored_draft
    from public.trophy_definition_drafts draft
    where draft.trophy_id = stored_definition.id
    for update;

    if stored_draft.trophy_id is null
      or stored_draft.base_version <> stored_definition.version
      or stored_draft.version <> p_expected_draft_version then
      raise exception 'Le brouillon publié est introuvable ou obsolète.'
        using errcode = '40001';
    end if;

    definition_to_publish := stored_draft.definition;
  end if;

  if p_target_status = 'active' then
    perform public.validate_trophy_definition_for_publication(
      definition_to_publish
    );
  end if;

  definition_to_publish :=
    definition_to_publish
    || jsonb_build_object(
      'id', stored_definition.id,
      'status', p_target_status,
      'updatedAt', effective_at
    );
  update public.trophy_definition_versions version_record
  set publication_status = 'superseded'
  where version_record.trophy_id = stored_definition.id
    and version_record.publication_status = 'published';

  update public.trophy_definitions trophy
  set
    title = trim(definition_to_publish ->> 'title'),
    status = p_target_status,
    definition = definition_to_publish,
    updated_by_profile_id = actor.id,
    updated_at = effective_at,
    ever_activated = (
      trophy.ever_activated
      or p_target_status = 'active'
    ),
    activated_at = case
      when p_target_status = 'active'
        then coalesce(trophy.activated_at, effective_at)
      else trophy.activated_at
    end
  where trophy.id = stored_definition.id
    and trophy.version = stored_definition.version
  returning * into published_definition;

  if published_definition.id is null then
    raise exception 'Ce trophée a été modifié. Rechargez les données.'
      using errcode = '40001';
  end if;

  insert into public.trophy_definition_versions (
    trophy_id,
    definition_version,
    definition,
    publication_status,
    published_at,
    published_by_profile_id
  )
  values (
    published_definition.id,
    published_definition.version,
    published_definition.definition,
    'published',
    effective_at,
    actor.id
  );

  delete from public.trophy_definition_drafts draft
  where draft.trophy_id = published_definition.id;

  perform public.rebuild_all_trophy_awards(effective_at);

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
    case
      when p_target_status = 'active'
        then 'Publication atomique d’une version de trophée'
      else 'Désactivation atomique d’un trophée'
    end,
    'Trophée',
    published_definition.title,
    actor.id
  );

  return published_definition;
end;
$$;

revoke all on function public.publish_trophy_definition_draft(
  text,
  bigint,
  bigint,
  text
) from public;
grant execute on function public.publish_trophy_definition_draft(
  text,
  bigint,
  bigint,
  text
) to authenticated;

-- Existing public object URLs are converted to authenticated proxy URLs by the
-- client. Once this migration is applied, direct public object access closes.
update storage.buckets
set public = false
where id = 'trophy-images';

drop policy if exists "trophy_images_public_read" on storage.objects;

-- Refuse the whole migration before touching historical awards when an active
-- legacy definition cannot satisfy the new publication contract.
do $$
declare
  active_trophy record;
begin
  for active_trophy in
    select definition.id, definition.definition
    from public.trophy_definitions definition
    where definition.status = 'active'
  loop
    begin
      perform public.validate_trophy_definition_for_publication(
        active_trophy.definition
      );
    exception
      when others then
        raise exception 'Trophée actif "%" invalide : %',
          active_trophy.id,
          sqlerrm
          using errcode = '22023';
    end;
  end loop;
end;
$$;

-- The migration itself establishes the first authoritative, retrospective
-- snapshot. Future intervention, evaluation, login and publication events keep
-- it synchronized.
select set_config('monjdb.suppress_trophy_notifications', 'on', true);
select public.rebuild_all_trophy_awards(now());
select set_config('monjdb.suppress_trophy_notifications', 'off', true);

commit;
