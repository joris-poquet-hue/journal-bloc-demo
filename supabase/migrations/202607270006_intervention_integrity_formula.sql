-- Lot 4: immutable, versioned intervention definitions and authoritative scores.
-- This migration deliberately does not backfill historical interventions.
-- Historical snapshots require a separate, explicit admin RPC call whose input
-- must match the hash returned by preview_legacy_intervention_snapshot_report().

create table if not exists public.autonomy_score_formulas (
  id uuid primary key default gen_random_uuid(),
  formula_version integer not null unique,
  status text not null,
  definition jsonb not null,
  published_at timestamptz not null,
  retired_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by_profile_id uuid references public.profiles(id) on delete set null,
  updated_by_profile_id uuid references public.profiles(id) on delete set null,
  version bigint not null default 1,
  constraint autonomy_score_formulas_status_check
    check (status in ('published', 'retired')),
  constraint autonomy_score_formulas_retirement_check
    check (
      (status = 'published' and retired_at is null)
      or (status = 'retired' and retired_at is not null)
    )
);

create unique index if not exists autonomy_score_formulas_one_published_idx
  on public.autonomy_score_formulas ((status))
  where status = 'published';

drop trigger if exists audit_autonomy_score_formulas_version
  on public.autonomy_score_formulas;
create trigger audit_autonomy_score_formulas_version
before insert or update on public.autonomy_score_formulas
for each row execute function public.audit_versioned_record();

alter table public.autonomy_score_formulas enable row level security;

alter table public.interventions
  add column if not exists definition_snapshot jsonb,
  add column if not exists definition_snapshot_schema_version integer,
  add column if not exists definition_version bigint,
  add column if not exists autonomy_score_formula_id uuid
    references public.autonomy_score_formulas(id) on delete restrict,
  add column if not exists autonomy_score_calculated_at timestamptz;

alter table public.interventions
  drop constraint if exists interventions_definition_snapshot_consistency;
alter table public.interventions
  add constraint interventions_definition_snapshot_consistency
  check (
    (
      definition_snapshot is null
      and definition_snapshot_schema_version is null
      and definition_version is null
    )
    or (
      definition_snapshot is not null
      and definition_snapshot_schema_version is not null
      and definition_version is not null
      and definition_snapshot_schema_version > 0
      and jsonb_typeof(definition_snapshot) = 'object'
    )
  );

alter table public.interventions
  drop constraint if exists interventions_score_provenance_consistency;
alter table public.interventions
  add constraint interventions_score_provenance_consistency
  check (
    (
      autonomy_score is null
      and autonomy_score_formula_id is null
      and autonomy_score_calculated_at is null
    )
    or (
      autonomy_score is not null
      and autonomy_score between 0 and 100
      and autonomy_score_formula_id is not null
      and autonomy_score_calculated_at is not null
    )
  ) not valid;

create or replace function public.validate_autonomy_score_formula(
  p_definition jsonb
)
returns void
language plpgsql
immutable
set search_path = public
as $$
declare
  autonomy_weight numeric;
  performance_weight numeric;
  minimum_coverage numeric;
  simple_coefficient numeric;
  intermediate_coefficient numeric;
  difficult_coefficient numeric;
  autonomy_scale_maximum numeric;
  performance_scale_minimum numeric;
  performance_scale_maximum numeric;
  clamp_minimum numeric;
  clamp_maximum numeric;
begin
  if p_definition is null
    or jsonb_typeof(p_definition) <> 'object'
    or p_definition ->> 'schemaVersion' <> '1'
    or p_definition ->> 'rounding' <> 'nearest_integer' then
    raise exception 'Définition de formule invalide.' using errcode = '22023';
  end if;

  begin
    autonomy_weight := (p_definition ->> 'autonomyWeight')::numeric;
    performance_weight := (p_definition ->> 'performanceWeight')::numeric;
    minimum_coverage := (p_definition ->> 'keyStepMinimumCoverage')::numeric;
    simple_coefficient :=
      (p_definition #>> '{difficultyCoefficients,1}')::numeric;
    intermediate_coefficient :=
      (p_definition #>> '{difficultyCoefficients,2}')::numeric;
    difficult_coefficient :=
      (p_definition #>> '{difficultyCoefficients,3}')::numeric;
    autonomy_scale_maximum :=
      (p_definition ->> 'autonomyScaleMaximum')::numeric;
    performance_scale_minimum :=
      (p_definition ->> 'performanceScaleMinimum')::numeric;
    performance_scale_maximum :=
      (p_definition ->> 'performanceScaleMaximum')::numeric;
    clamp_minimum := (p_definition ->> 'clampMinimum')::numeric;
    clamp_maximum := (p_definition ->> 'clampMaximum')::numeric;
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      raise exception 'Valeur numérique de formule invalide.'
        using errcode = '22023';
  end;

  if autonomy_weight < 0
    or autonomy_weight > 1
    or performance_weight < 0
    or performance_weight > 1
    or autonomy_weight + performance_weight <> 1
    or minimum_coverage < 0
    or minimum_coverage > 1
    or autonomy_scale_maximum <= 0
    or performance_scale_maximum <= performance_scale_minimum
    or simple_coefficient <= 0
    or intermediate_coefficient <= 0
    or difficult_coefficient <= 0
    or clamp_minimum < 0
    or clamp_maximum > 100
    or clamp_maximum <= clamp_minimum then
    raise exception
      'La formule officielle contient des paramètres incohérents.'
      using errcode = '22023';
  end if;
end;
$$;

insert into public.autonomy_score_formulas (
  formula_version,
  status,
  definition,
  published_at
)
select
  1,
  'published',
  jsonb_build_object(
    'schemaVersion', 1,
    'keyStepMinimumCoverage', 0.75,
    'autonomyWeight', 0.4,
    'performanceWeight', 0.6,
    'autonomyScaleMaximum', 4,
    'performanceScaleMinimum', 1,
    'performanceScaleMaximum', 5,
    'difficultyCoefficients', jsonb_build_object(
      '1', 0.95,
      '2', 1,
      '3', 1.05
    ),
    'rounding', 'nearest_integer',
    'clampMinimum', 0,
    'clampMaximum', 100
  ),
  now()
where not exists (
  select 1 from public.autonomy_score_formulas
);

create or replace function public.resolve_applicable_checklist_steps(
  p_definition jsonb,
  p_procedure_id text,
  p_approach text,
  p_entry_technique text
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  approach_configs jsonb :=
    case
      when jsonb_typeof(p_definition -> 'approachConfigs') = 'array'
        then p_definition -> 'approachConfigs'
      else '[]'::jsonb
    end;
  checklist_steps jsonb :=
    case
      when jsonb_typeof(p_definition -> 'checklistSteps') = 'array'
        then p_definition -> 'checklistSteps'
      else '[]'::jsonb
    end;
  key_step_ids jsonb :=
    case
      when jsonb_typeof(p_definition -> 'keyStepIds') = 'array'
        then p_definition -> 'keyStepIds'
      else '[]'::jsonb
    end;
  selected_config jsonb;
  resolved jsonb;
begin
  select config
  into selected_config
  from jsonb_array_elements(approach_configs) config
  where coalesce((config ->> 'active')::boolean, false)
    and config ->> 'approach' = p_approach
  limit 1;

  if selected_config is not null
    and jsonb_typeof(selected_config -> 'steps') = 'array' then
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', step ->> 'id',
          'label', step ->> 'label',
          'order', coalesce((step ->> 'order')::integer, ordinal::integer),
          'scored', coalesce((step ->> 'scored')::boolean, false)
        )
        order by coalesce((step ->> 'order')::integer, ordinal::integer)
      ),
      '[]'::jsonb
    )
    into resolved
    from jsonb_array_elements(selected_config -> 'steps')
      with ordinality as candidate(step, ordinal);

    return resolved;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', step ->> 'id',
        'label', step ->> 'label',
        'order', ordinal::integer,
        'scored', key_step_ids ? (step ->> 'id')
      )
      order by ordinal
    ),
    '[]'::jsonb
  )
  into resolved
  from jsonb_array_elements(checklist_steps)
    with ordinality as candidate(step, ordinal)
  where (
      jsonb_typeof(step -> 'applicableApproaches') is distinct from 'array'
      or jsonb_array_length(step -> 'applicableApproaches') = 0
      or exists (
        select 1
        from jsonb_array_elements_text(step -> 'applicableApproaches')
          allowed(approach)
        where allowed.approach = p_approach
      )
    )
    and not (
      p_procedure_id = 'salpingectomie'
      and step ->> 'id' = 'step-3'
      and coalesce(p_approach, '') not in ('coelioscopie', 'robot', 'vnotes')
    )
    and not (
      p_procedure_id = 'salpingectomie'
      and step ->> 'id' in ('step-4', 'step-11', 'step-13')
      and coalesce(p_approach, '') not in ('coelioscopie', 'robot')
    )
    and not (
      p_procedure_id = 'salpingectomie'
      and step ->> 'id' = 'step-14'
      and not (
        p_entry_technique = 'open'
        or p_approach = 'vnotes'
      )
    );

  return resolved;
end;
$$;

create or replace function public.build_intervention_definition_snapshot(
  p_definition public.surgical_intervention_definitions,
  p_approach text,
  p_entry_technique text,
  p_legacy_mode text default null
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  applicable_steps jsonb;
  snapshot jsonb;
begin
  applicable_steps := public.resolve_applicable_checklist_steps(
    p_definition.definition,
    p_definition.id,
    p_approach,
    p_entry_technique
  );

  snapshot := jsonb_build_object(
    'schemaVersion', 1,
    'capturedAt', now(),
    'source', jsonb_build_object(
      'id', p_definition.id,
      'name', p_definition.name,
      'status', p_definition.status,
      'version', p_definition.version
    ),
    'definition', p_definition.definition,
    'applicableChecklistSteps', applicable_steps
  );

  if p_legacy_mode is not null then
    snapshot := snapshot || jsonb_build_object(
      'legacy',
      jsonb_build_object('mode', p_legacy_mode)
    );
  end if;

  return snapshot;
end;
$$;

create or replace function public.validate_intervention_submission(
  p_definition public.surgical_intervention_definitions,
  p_intervention_date date,
  p_indication text,
  p_custom_indication text,
  p_approach text,
  p_entry_technique text,
  p_laterality text,
  p_surgery_context text,
  p_complexity integer,
  p_role text,
  p_checklist jsonb
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  definition jsonb := p_definition.definition;
  applicable_steps jsonb;
  allowed_approaches jsonb :=
    case
      when jsonb_typeof(definition -> 'allowedApproaches') = 'array'
        then definition -> 'allowedApproaches'
      else '[]'::jsonb
    end;
  allowed_entry_techniques jsonb :=
    case
      when jsonb_typeof(definition -> 'allowedEntryTechniques') = 'array'
        then definition -> 'allowedEntryTechniques'
      else '[]'::jsonb
    end;
  indication_options jsonb :=
    case
      when jsonb_typeof(definition -> 'indicationOptions') = 'array'
        then definition -> 'indicationOptions'
      else '[]'::jsonb
    end;
  legacy_indications jsonb :=
    case
      when jsonb_typeof(definition -> 'indications') = 'array'
        then definition -> 'indications'
      else '[]'::jsonb
    end;
  selected_approach_config jsonb;
  expected_step_count integer;
  distinct_step_count integer;
  is_custom boolean :=
    coalesce((definition ->> 'isCustom')::boolean, p_definition.id like 'custom-%');
  laterality_mode text := coalesce(
    nullif(definition ->> 'lateralityMode', ''),
    case
      when coalesce((definition ->> 'requiresLaterality')::boolean, false)
        then 'right_left_bilateral'
      else 'none'
    end
  );
begin
  if p_definition.id is null or p_definition.status <> 'active' then
    raise exception 'Le type d’intervention sélectionné n’est pas actif.'
      using errcode = '22023';
  end if;

  if p_intervention_date is null
    or p_complexity is null
    or p_complexity not between 1 and 10
    or p_role not in (
      'operateur_principal',
      'aide_principal',
      'aide_secondaire',
      'observateur'
    ) then
    raise exception 'Les données obligatoires de l’intervention sont invalides.'
      using errcode = '22023';
  end if;

  if length(coalesce(p_indication, '')) > 200
    or length(coalesce(p_custom_indication, '')) > 500
    or length(coalesce(p_approach, '')) > 100
    or length(coalesce(p_entry_technique, '')) > 100
    or length(coalesce(p_laterality, '')) > 50
    or length(coalesce(p_surgery_context, '')) > 50 then
    raise exception 'Une valeur de l’intervention est trop longue.'
      using errcode = '22023';
  end if;

  if p_definition.id = 'salpingectomie' then
    if p_indication is null
      or p_indication not in ('geu', 'ligature_tubaire', 'autre') then
      raise exception 'Indication incompatible avec cette intervention.'
        using errcode = '22023';
    end if;

    if p_custom_indication is not null then
      raise exception 'Indication personnalisée incompatible.'
        using errcode = '22023';
    end if;
  elsif is_custom then
    if jsonb_array_length(legacy_indications) > 0
      or jsonb_array_length(indication_options) > 0 then
      if nullif(btrim(coalesce(p_custom_indication, '')), '') is null
        or not (
          exists (
            select 1
            from jsonb_array_elements_text(legacy_indications) item(value)
            where item.value = p_custom_indication
          )
          or exists (
            select 1
            from jsonb_array_elements(indication_options) item
            where coalesce((item ->> 'active')::boolean, true)
              and item ->> 'label' = p_custom_indication
          )
        ) then
        raise exception 'Indication incompatible avec cette intervention.'
          using errcode = '22023';
      end if;
    elsif p_custom_indication is not null then
      raise exception 'Aucune indication n’est applicable à cette intervention.'
        using errcode = '22023';
    end if;

    if p_indication is not null then
      raise exception 'Indication standard incompatible.'
        using errcode = '22023';
    end if;
  elsif jsonb_array_length(legacy_indications) > 0 then
    if p_indication is null
      or not exists (
        select 1
        from jsonb_array_elements_text(legacy_indications) item(value)
        where item.value = p_indication
      ) then
      raise exception 'Indication incompatible avec cette intervention.'
        using errcode = '22023';
    end if;
  elsif p_indication is not null or p_custom_indication is not null then
    raise exception 'Aucune indication n’est applicable à cette intervention.'
      using errcode = '22023';
  end if;

  if jsonb_array_length(allowed_approaches) > 0 then
    if p_approach is null
      or not exists (
        select 1
        from jsonb_array_elements_text(allowed_approaches) item(value)
        where item.value = p_approach
      ) then
      raise exception 'Voie d’abord incompatible avec cette intervention.'
        using errcode = '22023';
    end if;
  elsif p_approach is not null then
    raise exception 'Aucune voie d’abord n’est applicable à cette intervention.'
      using errcode = '22023';
  end if;

  if p_definition.id = 'salpingectomie'
    and (
      (p_indication = 'geu' and p_approach in ('robot', 'vnotes'))
      or (
        p_indication = 'ligature_tubaire'
        and p_approach in ('laparotomie', 'robot')
      )
    ) then
    raise exception 'Voie d’abord incompatible avec cette indication.'
      using errcode = '22023';
  end if;

  select config
  into selected_approach_config
  from jsonb_array_elements(
    case
      when jsonb_typeof(definition -> 'approachConfigs') = 'array'
        then definition -> 'approachConfigs'
      else '[]'::jsonb
    end
  ) config
  where config ->> 'approach' = p_approach
    and coalesce((config ->> 'active')::boolean, false)
  limit 1;

  if selected_approach_config is not null
    and jsonb_typeof(selected_approach_config -> 'entryTechniques') = 'array' then
    select coalesce(
      jsonb_agg(entry -> 'label'),
      '[]'::jsonb
    )
    into allowed_entry_techniques
    from jsonb_array_elements(selected_approach_config -> 'entryTechniques') entry
    where coalesce((entry ->> 'active')::boolean, true);
  end if;

  if p_approach in ('coelioscopie', 'robot') then
    if p_entry_technique is null
      or not exists (
        select 1
        from jsonb_array_elements_text(allowed_entry_techniques) item(value)
        where item.value = p_entry_technique
      ) then
      raise exception 'Technique d’entrée incompatible avec cette voie d’abord.'
        using errcode = '22023';
    end if;
  elsif p_entry_technique is not null then
    raise exception 'La technique d’entrée n’est pas applicable.'
      using errcode = '22023';
  end if;

  if laterality_mode = 'none' then
    if p_laterality is not null then
      raise exception 'La latéralité n’est pas applicable.'
        using errcode = '22023';
    end if;
  elsif laterality_mode = 'right_left' then
    if p_laterality not in ('droite', 'gauche') then
      raise exception 'Latéralité invalide.' using errcode = '22023';
    end if;
  elsif laterality_mode = 'right_left_bilateral' then
    if p_laterality not in ('droite', 'gauche', 'bilateral') then
      raise exception 'Latéralité invalide.' using errcode = '22023';
    end if;
  else
    raise exception 'Règle de latéralité invalide dans le catalogue.'
      using errcode = '22023';
  end if;

  if p_surgery_context is not null
    and p_surgery_context not in ('urgence', 'programme') then
    raise exception 'Contexte opératoire invalide.' using errcode = '22023';
  end if;

  if p_definition.id = 'salpingectomie' and p_indication = 'geu'
    and p_surgery_context is distinct from 'urgence' then
    raise exception 'Le contexte attendu est « urgence ».'
      using errcode = '22023';
  end if;

  if p_definition.id = 'salpingectomie' and p_indication = 'ligature_tubaire'
    and p_surgery_context is distinct from 'programme' then
    raise exception 'Le contexte attendu est « programmé ».'
      using errcode = '22023';
  end if;

  if p_checklist is null or jsonb_typeof(p_checklist) <> 'object' then
    raise exception 'La checklist doit être un objet complet.'
      using errcode = '22023';
  end if;

  applicable_steps := public.resolve_applicable_checklist_steps(
    definition,
    p_definition.id,
    p_approach,
    p_entry_technique
  );

  select
    count(*)::integer,
    count(distinct step ->> 'id')::integer
  into expected_step_count, distinct_step_count
  from jsonb_array_elements(applicable_steps) step;

  if expected_step_count <> distinct_step_count
    or exists (
      select 1
      from jsonb_array_elements(applicable_steps) step
      where nullif(btrim(step ->> 'id'), '') is null
        or nullif(btrim(step ->> 'label'), '') is null
    ) then
    raise exception 'La définition contient des étapes invalides ou dupliquées.'
      using errcode = '22023';
  end if;

  if (select count(*) from jsonb_object_keys(p_checklist))
      <> expected_step_count
    or exists (
      select 1
      from jsonb_array_elements(applicable_steps) step
      where not p_checklist ? (step ->> 'id')
    )
    or exists (
      select 1
      from jsonb_object_keys(p_checklist) checklist_key
      where not exists (
        select 1
        from jsonb_array_elements(applicable_steps) step
        where step ->> 'id' = checklist_key
      )
    ) then
    raise exception 'Checklist incomplète ou incompatible avec la définition.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_each(p_checklist) answer(key, value)
    where jsonb_typeof(answer.value) <> 'string'
      or answer.value #>> '{}' not in ('NA', '0', '1', '2', '3', '4')
  ) then
    raise exception 'Une valeur de checklist est invalide.'
      using errcode = '22023';
  end if;

  return applicable_steps;
end;
$$;

create or replace function public.calculate_intervention_autonomy_score(
  p_intervention public.interventions,
  p_evaluation public.intervention_evaluations,
  p_formula public.autonomy_score_formulas
)
returns numeric
language plpgsql
stable
set search_path = public
as $$
declare
  steps jsonb;
  applicable_key_step_count integer;
  scored_key_step_count integer;
  key_step_average numeric;
  minimum_coverage numeric;
  autonomy_component numeric;
  performance_component numeric;
  difficulty_coefficient numeric;
  raw_score numeric;
begin
  if p_intervention.definition_snapshot is null
    or p_evaluation.intervention_id is null
    or p_evaluation.global_performance not in ('1', '2', '3', '4', '5')
    or p_evaluation.category_difficulty not in ('1', '2', '3') then
    return null;
  end if;

  steps := p_intervention.definition_snapshot -> 'applicableChecklistSteps';

  if jsonb_typeof(steps) <> 'array' then
    return null;
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where p_intervention.checklist ->> (step ->> 'id')
        in ('0', '1', '2', '3', '4')
    )::integer,
    avg(
      case
        when p_intervention.checklist ->> (step ->> 'id')
          in ('0', '1', '2', '3', '4')
          then (p_intervention.checklist ->> (step ->> 'id'))::numeric
        else null
      end
    )
  into
    applicable_key_step_count,
    scored_key_step_count,
    key_step_average
  from jsonb_array_elements(steps) step
  where coalesce((step ->> 'scored')::boolean, false);

  minimum_coverage :=
    (p_formula.definition ->> 'keyStepMinimumCoverage')::numeric;

  if applicable_key_step_count = 0
    or scored_key_step_count::numeric / applicable_key_step_count
      < minimum_coverage then
    return null;
  end if;

  autonomy_component :=
    key_step_average
    / (p_formula.definition ->> 'autonomyScaleMaximum')::numeric
    * 100;
  performance_component :=
    (
      p_evaluation.global_performance::numeric
      - (p_formula.definition ->> 'performanceScaleMinimum')::numeric
    )
    / (
      (p_formula.definition ->> 'performanceScaleMaximum')::numeric
      - (p_formula.definition ->> 'performanceScaleMinimum')::numeric
    )
    * 100;
  difficulty_coefficient :=
    (
      p_formula.definition
      #>> array['difficultyCoefficients', p_evaluation.category_difficulty]
    )::numeric;
  raw_score :=
    (
      (p_formula.definition ->> 'autonomyWeight')::numeric
        * autonomy_component
      + (p_formula.definition ->> 'performanceWeight')::numeric
        * performance_component
    )
    * difficulty_coefficient;

  return least(
    (p_formula.definition ->> 'clampMaximum')::numeric,
    greatest(
      (p_formula.definition ->> 'clampMinimum')::numeric,
      round(raw_score)
    )
  );
end;
$$;

create or replace function public.trophy_condition_is_met(
  p_profile_id uuid,
  p_trophy_definition jsonb,
  p_condition jsonb
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  condition_type text := p_condition ->> 'type';
  threshold numeric := coalesce((p_condition ->> 'threshold')::numeric, 0);
  tracked_status text := p_condition ->> 'trackedStatus';
  required_role text := nullif(p_condition ->> 'role', '');
  required_procedure text := coalesce(
    nullif(p_condition ->> 'procedure', ''),
    nullif(p_trophy_definition ->> 'associatedProcedure', '')
  );
  required_approach text := coalesce(
    nullif(p_condition ->> 'approach', ''),
    nullif(p_trophy_definition ->> 'associatedApproach', '')
  );
  matching_count integer;
  average_score numeric;
begin
  case condition_type
    when 'first_recorded' then
      select count(*) into matching_count
      from public.interventions intervention
      where intervention.internal_profile_id = p_profile_id
        and intervention.deleted_at is null;
      return matching_count >= 1;

    when 'total_recorded' then
      select count(*) into matching_count
      from public.interventions intervention
      where intervention.internal_profile_id = p_profile_id
        and intervention.deleted_at is null;
      return matching_count >= threshold;

    when 'total_evaluated' then
      select count(*) into matching_count
      from public.interventions intervention
      where intervention.internal_profile_id = p_profile_id
        and intervention.deleted_at is null
        and exists (
          select 1
          from public.intervention_evaluations evaluation
          where evaluation.intervention_id = intervention.id
        );
      return matching_count >= threshold;

    when 'profile_login_count' then
      select count(*) into matching_count
      from public.activity_log activity
      where activity.profile_id = p_profile_id
        and activity.action = 'Connexion au profil';
      return matching_count >= threshold;

    when 'procedure_count' then
      select count(*) into matching_count
      from public.interventions intervention
      where intervention.internal_profile_id = p_profile_id
        and intervention.deleted_at is null
        and (required_role is null or intervention.role = required_role)
        and (
          required_procedure is null
          or intervention.procedure_id = required_procedure
        )
        and (
          tracked_status is null
          or tracked_status = 'recorded'
          or (
            tracked_status = 'evaluated'
            and exists (
              select 1
              from public.intervention_evaluations evaluation
              where evaluation.intervention_id = intervention.id
            )
          )
        );
      return matching_count >= threshold;

    when 'approach_count' then
      select count(*) into matching_count
      from public.interventions intervention
      where intervention.internal_profile_id = p_profile_id
        and intervention.deleted_at is null
        and (required_role is null or intervention.role = required_role)
        and (
          required_approach is null
          or intervention.approach = required_approach
        )
        and (
          tracked_status is null
          or tracked_status = 'recorded'
          or (
            tracked_status = 'evaluated'
            and exists (
              select 1
              from public.intervention_evaluations evaluation
              where evaluation.intervention_id = intervention.id
            )
          )
        );
      return matching_count >= threshold;

    when 'recording_time_range' then
      select count(*) into matching_count
      from public.interventions intervention
      where intervention.internal_profile_id = p_profile_id
        and intervention.deleted_at is null
        and (required_role is null or intervention.role = required_role)
        and case
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
        end;
      return matching_count >= threshold;

    when 'average_autonomy' then
      select avg(intervention.autonomy_score)
      into average_score
      from public.interventions intervention
      where intervention.internal_profile_id = p_profile_id
        and intervention.deleted_at is null
        and intervention.autonomy_score is not null
        and (required_role is null or intervention.role = required_role)
        and (
          tracked_status is null
          or tracked_status = 'recorded'
          or exists (
            select 1
            from public.intervention_evaluations evaluation
            where evaluation.intervention_id = intervention.id
          )
        );
      return average_score is not null
        and average_score >= coalesce(
          (p_condition ->> 'autonomyMin')::numeric,
          0
        );

    when 'cross_procedure_autonomy' then
      select count(*) into matching_count
      from (
        select intervention.procedure_id
        from public.interventions intervention
        where intervention.internal_profile_id = p_profile_id
          and intervention.deleted_at is null
          and intervention.autonomy_score is not null
          and (required_role is null or intervention.role = required_role)
          and exists (
            select 1
            from public.intervention_evaluations evaluation
            where evaluation.intervention_id = intervention.id
          )
        group by intervention.procedure_id
        having count(*) >= coalesce(
            (p_condition ->> 'minEvaluatedPerProcedure')::integer,
            0
          )
          and avg(intervention.autonomy_score) >= coalesce(
            (p_condition ->> 'autonomyMin')::numeric,
            0
          )
      ) qualifying_procedures;
      return matching_count >= coalesce(
        (p_condition ->> 'distinctProcedureCount')::integer,
        0
      );

    when 'distinct_procedures' then
      select count(distinct intervention.procedure_id)
      into matching_count
      from public.interventions intervention
      where intervention.internal_profile_id = p_profile_id
        and intervention.deleted_at is null
        and (required_role is null or intervention.role = required_role)
        and (
          tracked_status is null
          or tracked_status = 'recorded'
          or (
            tracked_status = 'evaluated'
            and exists (
              select 1
              from public.intervention_evaluations evaluation
              where evaluation.intervention_id = intervention.id
            )
          )
        );
      return matching_count >= coalesce(
        (p_condition ->> 'distinctProcedureCount')::integer,
        threshold::integer
      );

    when 'role' then
      return exists (
        select 1
        from public.interventions intervention
        where intervention.internal_profile_id = p_profile_id
          and intervention.deleted_at is null
          and intervention.role = required_role
      );

    when 'intervention_status' then
      if p_condition ->> 'interventionStatus' = 'pending' then
        return exists (
          select 1
          from public.interventions intervention
          where intervention.internal_profile_id = p_profile_id
            and intervention.deleted_at is null
            and not exists (
              select 1
              from public.intervention_evaluations evaluation
              where evaluation.intervention_id = intervention.id
            )
        );
      elsif p_condition ->> 'interventionStatus' = 'evaluated' then
        return exists (
          select 1
          from public.interventions intervention
          where intervention.internal_profile_id = p_profile_id
            and intervention.deleted_at is null
            and exists (
              select 1
              from public.intervention_evaluations evaluation
              where evaluation.intervention_id = intervention.id
            )
        );
      end if;
      return false;

    else
      return false;
  end case;
end;
$$;

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
  all_conditions_met boolean;
  relevant_count integer;
  relevant_average numeric;
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

  create temporary table if not exists project1_desired_trophy_awards (
    trophy_id text not null,
    tier text not null,
    primary key (trophy_id, tier)
  ) on commit drop;
  truncate table project1_desired_trophy_awards;

  for trophy in
    select definition.*
    from public.trophy_definitions definition
    where definition.status = 'active'
  loop
    if coalesce(trophy.definition ->> 'format', 'unique') = 'levels'
      and jsonb_typeof(trophy.definition -> 'levels') = 'array' then
      select
        count(*)::integer,
        avg(intervention.autonomy_score)
      into relevant_count, relevant_average
      from public.interventions intervention
      where intervention.internal_profile_id = p_profile_id
        and intervention.deleted_at is null
        and (
          nullif(trophy.definition ->> 'associatedProcedure', '') is null
          or intervention.procedure_id =
            trophy.definition ->> 'associatedProcedure'
        )
        and (
          nullif(trophy.definition ->> 'associatedApproach', '') is null
          or intervention.approach = trophy.definition ->> 'associatedApproach'
        )
        and (
          nullif(trophy.definition ->> 'associatedIndication', '') is null
          or intervention.indication = trophy.definition ->> 'associatedIndication'
        )
        and (
          nullif(trophy.definition ->> 'trackedRole', '') is null
          or intervention.role = trophy.definition ->> 'trackedRole'
        )
        and (
          coalesce(
            trophy.definition ->> 'trackedInterventionStatus',
            'recorded'
          ) = 'recorded'
          or exists (
            select 1
            from public.intervention_evaluations evaluation
            where evaluation.intervention_id = intervention.id
          )
        );

      for level_definition in
        select level
        from jsonb_array_elements(trophy.definition -> 'levels') level
      loop
        if relevant_count >= coalesce(
            (level_definition ->> 'threshold')::integer,
            0
          )
          and (
            level_definition ->> 'autonomyMin' is null
            or (
              relevant_average is not null
              and relevant_average >=
                (level_definition ->> 'autonomyMin')::numeric
            )
          ) then
          insert into project1_desired_trophy_awards (trophy_id, tier)
          values (trophy.id, level_definition ->> 'tier')
          on conflict do nothing;
        end if;
      end loop;
    elsif jsonb_typeof(trophy.definition -> 'conditions') = 'array'
      and jsonb_array_length(trophy.definition -> 'conditions') > 0 then
      all_conditions_met := true;

      for condition in
        select item
        from jsonb_array_elements(trophy.definition -> 'conditions') item
      loop
        if not public.trophy_condition_is_met(
          p_profile_id,
          trophy.definition,
          condition
        ) then
          all_conditions_met := false;
          exit;
        end if;
      end loop;

      if all_conditions_met then
        insert into project1_desired_trophy_awards (trophy_id, tier)
        values (trophy.id, 'bronze')
        on conflict do nothing;
      end if;
    end if;
  end loop;

  insert into public.trophy_awards (
    trophy_id,
    profile_id,
    tier,
    awarded_at
  )
  select
    desired.trophy_id,
    p_profile_id,
    desired.tier,
    p_effective_at
  from project1_desired_trophy_awards desired
  on conflict (trophy_id, profile_id, tier) do nothing;

  get diagnostics desired_count = row_count;

  delete from public.trophy_awards award
  where award.profile_id = p_profile_id
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

create or replace function public.rebuild_all_trophy_awards(
  p_effective_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  internal_profile record;
  profile_result jsonb;
  awarded_count integer := 0;
  removed_count integer := 0;
begin
  for internal_profile in
    select profile.id
    from public.profiles profile
    where profile.role = 'internal'::public.app_role
  loop
    profile_result := public.rebuild_profile_trophy_awards(
      internal_profile.id,
      p_effective_at
    );
    awarded_count :=
      awarded_count + coalesce((profile_result ->> 'awarded')::integer, 0);
    removed_count :=
      removed_count + coalesce((profile_result ->> 'removed')::integer, 0);
  end loop;

  return jsonb_build_object(
    'awarded', awarded_count,
    'removed', removed_count
  );
end;
$$;

revoke all on function public.trophy_condition_is_met(uuid, jsonb, jsonb)
  from public;
revoke all on function public.rebuild_profile_trophy_awards(uuid, timestamptz)
  from public;
revoke all on function public.rebuild_all_trophy_awards(timestamptz)
  from public;

create or replace function public.recalculate_all_intervention_scores(
  p_formula_id uuid,
  p_effective_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  formula public.autonomy_score_formulas%rowtype;
  candidate record;
  calculated_score numeric;
  calculated_count integer := 0;
  non_calculable_count integer := 0;
begin
  select stored_formula.*
  into formula
  from public.autonomy_score_formulas stored_formula
  where stored_formula.id = p_formula_id;

  if formula.id is null or formula.status <> 'published' then
    raise exception 'La formule publiée est introuvable.'
      using errcode = 'P0002';
  end if;

  perform public.validate_autonomy_score_formula(formula.definition);
  perform set_config('app.skip_trophy_recalculation', 'true', true);

  for candidate in
    select
      intervention as intervention_record,
      evaluation as evaluation_record
    from public.interventions intervention
    join public.intervention_evaluations evaluation
      on evaluation.intervention_id = intervention.id
    where intervention.deleted_at is null
  loop
    calculated_score := public.calculate_intervention_autonomy_score(
      candidate.intervention_record,
      candidate.evaluation_record,
      formula
    );

    if calculated_score is null then
      update public.interventions intervention
      set
        autonomy_score = null,
        autonomy_score_formula_id = null,
        autonomy_score_calculated_at = null
      where intervention.id = (candidate.intervention_record).id;
      non_calculable_count := non_calculable_count + 1;
    else
      update public.interventions intervention
      set
        autonomy_score = calculated_score,
        autonomy_score_formula_id = formula.id,
        autonomy_score_calculated_at = p_effective_at
      where intervention.id = (candidate.intervention_record).id;
      calculated_count := calculated_count + 1;
    end if;
  end loop;

  perform set_config('app.skip_trophy_recalculation', 'false', true);

  return jsonb_build_object(
    'calculated', calculated_count,
    'nonCalculable', non_calculable_count
  );
end;
$$;

revoke all on function public.recalculate_all_intervention_scores(
  uuid,
  timestamptz
) from public;

create or replace function public.publish_autonomy_score_formula(
  p_definition jsonb,
  p_expected_current_formula_id uuid,
  p_expected_current_formula_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles%rowtype;
  current_formula public.autonomy_score_formulas%rowtype;
  published_formula public.autonomy_score_formulas%rowtype;
  score_result jsonb;
  trophy_result jsonb;
  next_formula_version integer;
  effective_at timestamptz := now();
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

  perform public.validate_autonomy_score_formula(p_definition);
  perform pg_advisory_xact_lock(hashtext('project1-autonomy-score-formula'));

  select formula.*
  into current_formula
  from public.autonomy_score_formulas formula
  where formula.status = 'published'
  for update;

  if current_formula.id is null
    or current_formula.id is distinct from p_expected_current_formula_id
    or current_formula.version is distinct from p_expected_current_formula_version then
    raise exception 'La formule active a changé. Rechargez les données.'
      using errcode = '40001';
  end if;

  if exists (
    select 1
    from public.interventions intervention
    join public.intervention_evaluations evaluation
      on evaluation.intervention_id = intervention.id
    where intervention.deleted_at is null
      and intervention.definition_snapshot is null
  ) then
    raise exception
      'Des interventions évaluées attendent encore la validation de leur instantané historique hérité.'
      using errcode = '55000';
  end if;

  select coalesce(max(formula.formula_version), 0) + 1
  into next_formula_version
  from public.autonomy_score_formulas formula;

  update public.autonomy_score_formulas formula
  set
    status = 'retired',
    retired_at = effective_at,
    updated_by_profile_id = actor.id
  where formula.id = current_formula.id;

  insert into public.autonomy_score_formulas (
    formula_version,
    status,
    definition,
    published_at,
    created_by_profile_id,
    updated_by_profile_id
  )
  values (
    next_formula_version,
    'published',
    p_definition,
    effective_at,
    actor.id,
    actor.id
  )
  returning * into published_formula;

  score_result := public.recalculate_all_intervention_scores(
    published_formula.id,
    effective_at
  );
  trophy_result := public.rebuild_all_trophy_awards(effective_at);

  insert into public.activity_log (
    profile_id,
    actor_role,
    actor_label,
    action,
    target_type,
    target_label,
    created_by_profile_id,
    analytics_event
  )
  values (
    actor.id,
    actor.role,
    trim(concat_ws(' ', actor.first_name, actor.last_name)),
    'Publication de la formule d’autonomie',
    'Formule',
    concat('Version ', published_formula.formula_version),
    actor.id,
    jsonb_build_object(
      'formulaId', published_formula.id,
      'formulaVersion', published_formula.formula_version,
      'scores', score_result,
      'trophies', trophy_result
    )
  );

  return jsonb_build_object(
    'formula', to_jsonb(published_formula),
    'scores', score_result,
    'trophies', trophy_result
  );
end;
$$;

revoke all on function public.publish_autonomy_score_formula(
  jsonb,
  uuid,
  bigint
) from public;
grant execute on function public.publish_autonomy_score_formula(
  jsonb,
  uuid,
  bigint
) to authenticated;

create or replace function public.protect_intervention_immutability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile_id uuid := public.current_profile_id();
  actor_role public.app_role := public.current_app_role();
begin
  if tg_op = 'INSERT' then
    if current_user in ('anon', 'authenticated')
      or new.definition_snapshot is null
      or new.definition_snapshot_schema_version <> 1
      or new.definition_version is null
      or new.autonomy_score is not null
      or new.autonomy_score_formula_id is not null
      or new.autonomy_score_calculated_at is not null then
      raise exception
        'Une intervention doit être créée par la fonction atomique officielle.'
        using errcode = '55000';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if current_user in ('anon', 'authenticated') then
      raise exception 'Une intervention enregistrée est immuable.'
        using errcode = '55000';
    end if;

    if new.id is distinct from old.id
      or new.internal_profile_id is distinct from old.internal_profile_id
      or new.senior_profile_id is distinct from old.senior_profile_id
      or new.procedure_id is distinct from old.procedure_id
      or new.intervention_date is distinct from old.intervention_date
      or new.indication is distinct from old.indication
      or new.indication_comment is distinct from old.indication_comment
      or new.custom_indication is distinct from old.custom_indication
      or new.approach is distinct from old.approach
      or new.entry_technique is distinct from old.entry_technique
      or new.laterality is distinct from old.laterality
      or new.surgery_context is distinct from old.surgery_context
      or new.complexity is distinct from old.complexity
      or new.role is distinct from old.role
      or new.checklist is distinct from old.checklist
      or new.saved_at is distinct from old.saved_at
      or new.created_by_profile_id is distinct from old.created_by_profile_id
      or new.deleted_at is distinct from old.deleted_at
      or new.client_mutation_id is distinct from old.client_mutation_id
      or (
        old.definition_snapshot is not null
        and new.definition_snapshot is distinct from old.definition_snapshot
      )
      or (
        old.definition_snapshot_schema_version is not null
        and new.definition_snapshot_schema_version
          is distinct from old.definition_snapshot_schema_version
      )
      or (
        old.definition_version is not null
        and new.definition_version is distinct from old.definition_version
      ) then
      raise exception 'Les données brutes d’une intervention sont immuables.'
        using errcode = '55000';
    end if;

    return new;
  end if;

  if actor_role is distinct from 'internal'::public.app_role
    or actor_profile_id is distinct from old.internal_profile_id
    or exists (
      select 1
      from public.intervention_evaluations evaluation
      where evaluation.intervention_id = old.id
    ) then
    raise exception
      'Seule une intervention en attente peut être supprimée par son Interne.'
      using errcode = '55000';
  end if;

  return old;
end;
$$;

drop trigger if exists protect_intervention_immutability
  on public.interventions;
create trigger protect_intervention_immutability
before insert or update or delete on public.interventions
for each row execute function public.protect_intervention_immutability();

create or replace function public.protect_evaluation_immutability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile_id uuid := public.current_profile_id();
  actor_role public.app_role := public.current_app_role();
begin
  if tg_op <> 'INSERT' then
    raise exception 'Une évaluation validée est définitive.'
      using errcode = '55000';
  end if;

  if current_user in ('anon', 'authenticated')
    or actor_role is distinct from 'senior'::public.app_role
    or new.senior_profile_id is distinct from actor_profile_id
    or not exists (
      select 1
      from public.interventions intervention
      join public.evaluation_requests request
        on request.intervention_id = intervention.id
      where intervention.id = new.intervention_id
        and intervention.deleted_at is null
        and intervention.senior_profile_id = actor_profile_id
        and request.senior_profile_id = actor_profile_id
        and request.status = 'completed'
    ) then
    raise exception
      'Une évaluation doit être créée par la fonction atomique officielle.'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_evaluation_immutability
  on public.intervention_evaluations;
create trigger protect_evaluation_immutability
before insert or update or delete on public.intervention_evaluations
for each row execute function public.protect_evaluation_immutability();

revoke insert, update, delete on table public.interventions from authenticated;
revoke insert, update, delete on table public.intervention_evaluations
  from authenticated;

create or replace function public.create_intervention(
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
  p_checklist jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile public.profiles%rowtype;
  designated_senior public.profiles%rowtype;
  procedure_definition public.surgical_intervention_definitions%rowtype;
  definition_snapshot jsonb;
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
    raise exception 'Un profil Interne actif est requis.'
      using errcode = '42501';
  end if;

  if p_intervention_id is null
    or nullif(btrim(coalesce(p_client_mutation_id, '')), '') is null
    or length(p_client_mutation_id) > 200 then
    raise exception 'Identifiant d’enregistrement invalide.'
      using errcode = '22023';
  end if;

  if length(coalesce(p_indication_comment, '')) > 500 then
    raise exception 'Le commentaire d’indication est trop long.'
      using errcode = '22023';
  end if;

  select intervention.*
  into saved_intervention
  from public.interventions intervention
  where intervention.client_mutation_id = p_client_mutation_id
  for update;

  if found then
    if saved_intervention.internal_profile_id is distinct from actor_profile.id
      or saved_intervention.id is distinct from p_intervention_id then
      raise exception
        'Cette tentative d’enregistrement appartient à une autre intervention.'
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
    or designated_senior.institution_id is null
    or designated_senior.institution_id
      is distinct from actor_profile.institution_id then
    raise exception
      'Le Senior désigné doit être actif dans le même établissement.'
      using errcode = '42501';
  end if;

  select definition.*
  into procedure_definition
  from public.surgical_intervention_definitions definition
  where definition.id = p_procedure_id
  for share;

  perform public.validate_intervention_submission(
    procedure_definition,
    p_intervention_date,
    p_indication,
    p_custom_indication,
    p_approach,
    p_entry_technique,
    p_laterality,
    p_surgery_context,
    p_complexity,
    p_role,
    p_checklist
  );

  definition_snapshot := public.build_intervention_definition_snapshot(
    procedure_definition,
    p_approach,
    p_entry_technique
  );

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
    client_mutation_id,
    definition_snapshot,
    definition_snapshot_schema_version,
    definition_version
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
    now(),
    actor_profile.id,
    actor_profile.id,
    p_client_mutation_id,
    definition_snapshot,
    1,
    procedure_definition.version
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

revoke all on function public.create_intervention(
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
  jsonb
) from public;
grant execute on function public.create_intervention(
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
  jsonb
) to authenticated;

-- Transitional wrapper: the currently deployed client keeps working while the
-- new client is rolled out. Its timestamp is ignored and the canonical server
-- function still performs every validation and captures the snapshot.
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
language sql
security definer
set search_path = public
as $$
  select public.create_intervention(
    p_intervention_id,
    p_client_mutation_id,
    p_senior_profile_id,
    p_procedure_id,
    p_intervention_date,
    p_indication,
    p_indication_comment,
    p_custom_indication,
    p_approach,
    p_entry_technique,
    p_laterality,
    p_surgery_context,
    p_complexity,
    p_role,
    p_checklist
  );
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

create or replace function public.save_intervention_evaluation(
  p_intervention_id uuid,
  p_expected_intervention_version bigint,
  p_expected_evaluation_version bigint,
  p_global_performance text,
  p_category_difficulty text,
  p_senior_comment text
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
  active_formula public.autonomy_score_formulas%rowtype;
  calculated_score numeric;
begin
  if actor_profile_id is null
    or actor_role <> 'senior'::public.app_role then
    raise exception 'Seul le Senior désigné peut valider cette évaluation.'
      using errcode = '42501';
  end if;

  if p_global_performance is null
    or p_global_performance not in ('1', '2', '3', '4', '5') then
    raise exception 'Performance globale invalide.'
      using errcode = '22023';
  end if;

  if p_category_difficulty is null
    or p_category_difficulty not in ('1', '2', '3') then
    raise exception 'Difficulté chirurgicale invalide.'
      using errcode = '22023';
  end if;

  if length(coalesce(p_senior_comment, '')) > 200 then
    raise exception 'Le commentaire du Senior est limité à 200 caractères.'
      using errcode = '22023';
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

  if stored_intervention.definition_snapshot is null then
    raise exception
      'Cette intervention attend la validation de son instantané historique.'
      using errcode = '55000';
  end if;

  if stored_intervention.senior_profile_id is distinct from actor_profile_id
    or not public.senior_can_read_internal(
      stored_intervention.internal_profile_id
    ) then
    raise exception 'Cette intervention ne peut pas être évaluée par ce Senior.'
      using errcode = '42501';
  end if;

  if p_expected_evaluation_version is not null
    or exists (
      select 1
      from public.intervention_evaluations evaluation
      where evaluation.intervention_id = p_intervention_id
    ) then
    raise exception
      'Cette évaluation est déjà validée et ne peut plus être modifiée.'
      using errcode = '23505';
  end if;

  select formula.*
  into active_formula
  from public.autonomy_score_formulas formula
  where formula.status = 'published'
  for share;

  if active_formula.id is null then
    raise exception 'Aucune formule officielle publiée n’est disponible.'
      using errcode = '55000';
  end if;

  perform public.validate_autonomy_score_formula(active_formula.definition);

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
    raise exception
      'Aucune demande d’évaluation active ne correspond à cette intervention.'
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

  calculated_score := public.calculate_intervention_autonomy_score(
    stored_intervention,
    saved_evaluation,
    active_formula
  );

  update public.interventions intervention
  set
    autonomy_score = calculated_score,
    autonomy_score_formula_id = case
      when calculated_score is null then null
      else active_formula.id
    end,
    autonomy_score_calculated_at = case
      when calculated_score is null then null
      else now()
    end,
    updated_by_profile_id = actor_profile_id
  where intervention.id = p_intervention_id
  returning * into saved_intervention;

  perform public.rebuild_profile_trophy_awards(
    stored_intervention.internal_profile_id,
    now()
  );

  insert into public.activity_log (
    profile_id,
    actor_role,
    actor_label,
    action,
    target_type,
    target_label,
    created_by_profile_id,
    analytics_event
  )
  select
    actor_profile_id,
    'senior'::public.app_role,
    trim(concat_ws(' ', profile.first_name, profile.last_name)),
    'Évaluation d’un interne validée',
    'Intervention',
    p_intervention_id::text,
    actor_profile_id,
    jsonb_build_object(
      'formulaId', active_formula.id,
      'formulaVersion', active_formula.formula_version,
      'autonomyScore', calculated_score
    )
  from public.profiles profile
  where profile.id = actor_profile_id;

  return jsonb_build_object(
    'evaluation', to_jsonb(saved_evaluation),
    'evaluationRequest', to_jsonb(saved_request),
    'intervention', to_jsonb(saved_intervention)
  );
end;
$$;

revoke all on function public.save_intervention_evaluation(
  uuid,
  bigint,
  bigint,
  text,
  text,
  text
) from public;
grant execute on function public.save_intervention_evaluation(
  uuid,
  bigint,
  bigint,
  text,
  text,
  text
) to authenticated;

-- Transitional wrapper: the legacy score and Senior identifier are accepted
-- only for the short rollout window and are deliberately ignored.
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
language sql
security definer
set search_path = public
as $$
  select public.save_intervention_evaluation(
    p_intervention_id,
    p_expected_intervention_version,
    p_expected_evaluation_version,
    p_global_performance,
    p_category_difficulty,
    p_senior_comment
  );
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

create or replace function public.refresh_trophies_after_intervention_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.rebuild_profile_trophy_awards(
    case when tg_op = 'DELETE' then old.internal_profile_id
      else new.internal_profile_id
    end,
    now()
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists refresh_trophies_after_intervention_change
  on public.interventions;
create trigger refresh_trophies_after_intervention_change
after insert or delete on public.interventions
for each row execute function public.refresh_trophies_after_intervention_change();

create or replace function public.build_legacy_intervention_snapshot(
  p_intervention public.interventions,
  p_definition public.surgical_intervention_definitions
)
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  snapshot jsonb;
  resolved_steps jsonb;
  resolved_ids jsonb;
  checklist_ids jsonb;
  fallback_steps jsonb;
  legacy_mode text;
  definition_steps jsonb :=
    case
      when jsonb_typeof(p_definition.definition -> 'checklistSteps') = 'array'
        then p_definition.definition -> 'checklistSteps'
      else '[]'::jsonb
    end;
  key_step_ids jsonb :=
    case
      when jsonb_typeof(p_definition.definition -> 'keyStepIds') = 'array'
        then p_definition.definition -> 'keyStepIds'
      else '[]'::jsonb
    end;
begin
  snapshot := public.build_intervention_definition_snapshot(
    p_definition,
    p_intervention.approach,
    p_intervention.entry_technique,
    'current_catalog_assumption'
  );
  snapshot := jsonb_set(
    snapshot,
    '{capturedAt}',
    to_jsonb(p_intervention.saved_at),
    true
  );
  resolved_steps := snapshot -> 'applicableChecklistSteps';

  select coalesce(jsonb_agg(step ->> 'id' order by step ->> 'id'), '[]'::jsonb)
  into resolved_ids
  from jsonb_array_elements(resolved_steps) step;

  select coalesce(jsonb_agg(key order by key), '[]'::jsonb)
  into checklist_ids
  from jsonb_object_keys(p_intervention.checklist) key;

  if resolved_ids = checklist_ids then
    return snapshot;
  end if;

  legacy_mode := 'raw_checklist_fallback';

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', answer.key,
        'label', coalesce(
          (
            select definition_step ->> 'label'
            from jsonb_array_elements(definition_steps) definition_step
            where definition_step ->> 'id' = answer.key
            limit 1
          ),
          answer.key
        ),
        'order', answer.ordinal::integer,
        'scored', key_step_ids ? answer.key
      )
      order by answer.ordinal
    ),
    '[]'::jsonb
  )
  into fallback_steps
  from jsonb_each(p_intervention.checklist)
    with ordinality as answer(key, value, ordinal);

  snapshot := jsonb_set(
    snapshot,
    '{applicableChecklistSteps}',
    fallback_steps,
    true
  );
  snapshot := jsonb_set(
    snapshot,
    '{legacy,mode}',
    to_jsonb(legacy_mode),
    true
  );

  return snapshot;
end;
$$;

create or replace function public.preview_legacy_intervention_snapshot_report()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  report_payload jsonb;
  report_hash text;
begin
  if public.current_app_role() is distinct from 'admin'::public.app_role
    and auth.role() <> 'service_role' then
    raise exception 'Un Administrateur actif est requis.'
      using errcode = '42501';
  end if;

  with candidates as (
    select
      intervention.id,
      intervention.procedure_id,
      intervention.checklist,
      intervention.saved_at,
      definition.version as definition_version,
      case
        when definition.id is null then 'definition_missing'
        when (
          select coalesce(
            jsonb_agg(step ->> 'id' order by step ->> 'id'),
            '[]'::jsonb
          )
          from jsonb_array_elements(
            public.resolve_applicable_checklist_steps(
              definition.definition,
              definition.id,
              intervention.approach,
              intervention.entry_technique
            )
          ) step
        ) = (
          select coalesce(jsonb_agg(key order by key), '[]'::jsonb)
          from jsonb_object_keys(intervention.checklist) key
        ) then 'current_catalog_assumption'
        else 'raw_checklist_fallback'
      end as mapping_mode
    from public.interventions intervention
    left join public.surgical_intervention_definitions definition
      on definition.id = intervention.procedure_id
    where intervention.definition_snapshot is null
  ),
  grouped as (
    select
      procedure_id,
      mapping_mode,
      definition_version,
      count(*)::integer as intervention_count
    from candidates
    group by procedure_id, mapping_mode, definition_version
    order by procedure_id, mapping_mode
  ),
  fingerprint as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'procedureId', procedure_id,
          'checklist', checklist,
          'savedAt', saved_at,
          'definitionVersion', definition_version,
          'mappingMode', mapping_mode
        )
        order by id
      ),
      '[]'::jsonb
    ) as value
    from candidates
  )
  select jsonb_build_object(
    'schemaVersion', 1,
    'historicalInterventionCount', (select count(*) from candidates),
    'evaluatedInterventionCount', (
      select count(*)
      from candidates candidate
      join public.intervention_evaluations evaluation
        on evaluation.intervention_id = candidate.id
    ),
    'definitionMissingCount', (
      select count(*)
      from candidates
      where mapping_mode = 'definition_missing'
    ),
    'currentCatalogAssumptionCount', (
      select count(*)
      from candidates
      where mapping_mode = 'current_catalog_assumption'
    ),
    'rawChecklistFallbackCount', (
      select count(*)
      from candidates
      where mapping_mode = 'raw_checklist_fallback'
    ),
    'groups', coalesce(
      (select jsonb_agg(to_jsonb(grouped) order by procedure_id, mapping_mode)
       from grouped),
      '[]'::jsonb
    ),
    'fingerprint', (select value from fingerprint)
  )
  into report_payload;

  report_hash := encode(
    extensions.digest((report_payload -> 'fingerprint')::text, 'sha256'::text),
    'hex'
  );

  return (report_payload - 'fingerprint')
    || jsonb_build_object('reportHash', report_hash);
end;
$$;

revoke all on function public.preview_legacy_intervention_snapshot_report()
  from public;
grant execute on function public.preview_legacy_intervention_snapshot_report()
  to authenticated;

create or replace function public.apply_legacy_intervention_snapshots(
  p_expected_report_hash text,
  p_confirmation text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor public.profiles%rowtype;
  preview_report jsonb;
  intervention_candidate record;
  candidate_snapshot jsonb;
  active_formula public.autonomy_score_formulas%rowtype;
  score_result jsonb;
  trophy_result jsonb;
  applied_count integer := 0;
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

  if p_confirmation <> 'APPLIQUER HISTORIQUE HERITE' then
    raise exception 'Confirmation explicite invalide.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtext('project1-legacy-intervention-snapshots')
  );
  preview_report := public.preview_legacy_intervention_snapshot_report();

  if nullif(btrim(coalesce(p_expected_report_hash, '')), '') is null
    or preview_report ->> 'reportHash' <> p_expected_report_hash then
    raise exception 'Le rapport historique a changé. Générez-le à nouveau.'
      using errcode = '40001';
  end if;

  if (preview_report ->> 'definitionMissingCount')::integer > 0 then
    raise exception
      'Le rapport contient des interventions sans définition de catalogue.'
      using errcode = '55000';
  end if;

  for intervention_candidate in
    select
      intervention as intervention_record,
      definition as definition_record
    from public.interventions intervention
    join public.surgical_intervention_definitions definition
      on definition.id = intervention.procedure_id
    where intervention.definition_snapshot is null
    order by intervention.id
    for update of intervention
  loop
    candidate_snapshot := public.build_legacy_intervention_snapshot(
      intervention_candidate.intervention_record,
      intervention_candidate.definition_record
    );
    candidate_snapshot := jsonb_set(
      candidate_snapshot,
      '{legacy,reportHash}',
      to_jsonb(p_expected_report_hash),
      true
    );

    update public.interventions intervention
    set
      definition_snapshot = candidate_snapshot,
      definition_snapshot_schema_version = 1,
      definition_version =
        (intervention_candidate.definition_record).version,
      autonomy_score = null,
      autonomy_score_formula_id = null,
      autonomy_score_calculated_at = null,
      updated_by_profile_id = actor.id
    where intervention.id = (intervention_candidate.intervention_record).id;

    applied_count := applied_count + 1;
  end loop;

  select formula.*
  into active_formula
  from public.autonomy_score_formulas formula
  where formula.status = 'published';

  score_result := public.recalculate_all_intervention_scores(
    active_formula.id,
    now()
  );
  alter table public.interventions
    validate constraint interventions_score_provenance_consistency;
  trophy_result := public.rebuild_all_trophy_awards(now());

  insert into public.activity_log (
    profile_id,
    actor_role,
    actor_label,
    action,
    target_type,
    target_label,
    created_by_profile_id,
    analytics_event
  )
  values (
    actor.id,
    actor.role,
    trim(concat_ws(' ', actor.first_name, actor.last_name)),
    'Validation des instantanés historiques hérités',
    'Intervention',
    concat(applied_count, ' intervention(s)'),
    actor.id,
    jsonb_build_object(
      'reportHash', p_expected_report_hash,
      'scores', score_result,
      'trophies', trophy_result
    )
  );

  return jsonb_build_object(
    'applied', applied_count,
    'reportHash', p_expected_report_hash,
    'scores', score_result,
    'trophies', trophy_result
  );
end;
$$;

revoke all on function public.apply_legacy_intervention_snapshots(text, text)
  from public;
grant execute on function public.apply_legacy_intervention_snapshots(text, text)
  to authenticated;

drop policy if exists "autonomy_score_formulas_select_visible"
  on public.autonomy_score_formulas;
create policy "autonomy_score_formulas_select_visible"
on public.autonomy_score_formulas for select
to authenticated
using (
  status in ('published', 'retired')
  or public.is_admin()
);

grant select on table public.autonomy_score_formulas to authenticated;
revoke insert, update, delete on table public.autonomy_score_formulas
  from authenticated;

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
        and tablename = 'autonomy_score_formulas'
    ) then
    alter publication supabase_realtime
      add table public.autonomy_score_formulas;
  end if;
end;
$$;
