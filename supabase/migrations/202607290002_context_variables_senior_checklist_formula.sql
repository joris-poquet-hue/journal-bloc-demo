-- Contexte opératoire explicite, checklist sous autorité Senior et formule
-- officielle 100 % autonomie. Cette migration doit être appliquée avec le
-- client qui appelle create_intervention_v2() et
-- save_intervention_evaluation_v2().

-- Les écritures d'audit réalisées par cette migration sont des opérations
-- système. Le trigger d'identité les accepte uniquement sous service_role.
select set_config('request.jwt.claim.role', 'service_role', true);

alter table public.interventions
  add column if not exists context_variables jsonb not null default '[]'::jsonb;

alter table public.interventions
  drop constraint if exists interventions_context_variables_array_check;
alter table public.interventions
  add constraint interventions_context_variables_array_check
  check (jsonb_typeof(context_variables) = 'array');

alter table public.intervention_evaluations
  add column if not exists checklist jsonb;

-- Les réponses historiques restent inchangées : elles sont seulement copiées
-- vers leur emplacement d'autorité définitif, sans modifier les horodatages ni
-- les versions des évaluations.
alter table public.intervention_evaluations
  disable trigger protect_evaluation_immutability;
alter table public.intervention_evaluations
  disable trigger audit_evaluations_version;

update public.intervention_evaluations evaluation
set checklist = intervention.checklist
from public.interventions intervention
where intervention.id = evaluation.intervention_id
  and evaluation.checklist is null;

alter table public.intervention_evaluations
  enable trigger audit_evaluations_version;
alter table public.intervention_evaluations
  enable trigger protect_evaluation_immutability;

alter table public.intervention_evaluations
  alter column checklist set default '{}'::jsonb,
  alter column checklist set not null;

alter table public.intervention_evaluations
  drop constraint if exists intervention_evaluations_checklist_object_check;
alter table public.intervention_evaluations
  add constraint intervention_evaluations_checklist_object_check
  check (jsonb_typeof(checklist) = 'object');

create or replace function public.validate_context_variables(
  p_context_variables jsonb
)
returns void
language plpgsql
immutable
set search_path = public
as $$
declare
  allowed_values constant text[] := array[
    'urgence',
    'antecedent_chirurgie_abdominale',
    'complication_per_operatoire',
    'imc_superieur_30',
    'aucun_contexte_particulier'
  ];
  value_count integer;
  distinct_value_count integer;
begin
  if p_context_variables is null
    or jsonb_typeof(p_context_variables) <> 'array'
    or jsonb_array_length(p_context_variables) = 0 then
    raise exception 'Sélectionnez au moins une variable de contexte.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_context_variables) item
    where jsonb_typeof(item) <> 'string'
      or item #>> '{}' <> all(allowed_values)
  ) then
    raise exception 'Une variable de contexte est invalide.'
      using errcode = '22023';
  end if;

  select count(*), count(distinct item #>> '{}')
  into value_count, distinct_value_count
  from jsonb_array_elements(p_context_variables) item;

  if value_count <> distinct_value_count then
    raise exception 'Une variable de contexte est présente plusieurs fois.'
      using errcode = '22023';
  end if;

  if p_context_variables ? 'aucun_contexte_particulier'
    and jsonb_array_length(p_context_variables) <> 1 then
    raise exception
      '« Aucun contexte particulier » ne peut pas être associé à une autre variable.'
      using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.validate_context_variables(jsonb) from public;

create or replace function public.validate_senior_evaluation_checklist(
  p_definition_snapshot jsonb,
  p_checklist jsonb
)
returns void
language plpgsql
immutable
set search_path = public
as $$
declare
  applicable_steps jsonb := p_definition_snapshot -> 'applicableChecklistSteps';
  expected_step_count integer;
  distinct_step_count integer;
begin
  if p_definition_snapshot is null
    or jsonb_typeof(p_definition_snapshot) <> 'object'
    or jsonb_typeof(applicable_steps) <> 'array' then
    raise exception 'L’instantané historique de l’intervention est invalide.'
      using errcode = '55000';
  end if;

  if p_checklist is null or jsonb_typeof(p_checklist) <> 'object' then
    raise exception 'La checklist Senior doit être un objet complet.'
      using errcode = '22023';
  end if;

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
    raise exception 'La définition historique contient des étapes invalides.'
      using errcode = '55000';
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
    raise exception 'Checklist Senior incomplète ou incompatible.'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_each(p_checklist) answer(key, value)
    where jsonb_typeof(answer.value) <> 'string'
      or answer.value #>> '{}' not in ('NA', '0', '1', '2', '3', '4')
  ) then
    raise exception 'Une valeur de checklist Senior est invalide.'
      using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.validate_senior_evaluation_checklist(jsonb, jsonb)
  from public;

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
  authoritative_checklist jsonb;
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
  authoritative_checklist := coalesce(
    p_evaluation.checklist,
    p_intervention.checklist,
    '{}'::jsonb
  );

  if jsonb_typeof(steps) <> 'array'
    or jsonb_typeof(authoritative_checklist) <> 'object' then
    return null;
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where authoritative_checklist ->> (step ->> 'id')
        in ('0', '1', '2', '3', '4')
    )::integer,
    avg(
      case
        when authoritative_checklist ->> (step ->> 'id')
          in ('0', '1', '2', '3', '4')
          then (authoritative_checklist ->> (step ->> 'id'))::numeric
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

create or replace function public.create_intervention_v2(
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
  p_context_variables jsonb,
  p_complexity integer,
  p_role text
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
  applicable_steps jsonb;
  validation_checklist jsonb;
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

  perform public.validate_context_variables(p_context_variables);

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

  applicable_steps := public.resolve_applicable_checklist_steps(
    procedure_definition.definition,
    procedure_definition.id,
    p_approach,
    p_entry_technique
  );

  select coalesce(
    jsonb_object_agg(step ->> 'id', to_jsonb('NA'::text)),
    '{}'::jsonb
  )
  into validation_checklist
  from jsonb_array_elements(applicable_steps) step;

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
    validation_checklist
  );

  definition_snapshot :=
    public.build_intervention_definition_snapshot(
      procedure_definition,
      p_approach,
      p_entry_technique
    )
    || jsonb_build_object(
      'contextVariableCatalog',
      jsonb_build_object(
        'schemaVersion', 1,
        'options',
        jsonb_build_array(
          jsonb_build_object('id', 'urgence', 'label', 'Urgence'),
          jsonb_build_object(
            'id',
            'antecedent_chirurgie_abdominale',
            'label',
            'Antécédent de chirurgie abdominale'
          ),
          jsonb_build_object(
            'id',
            'complication_per_operatoire',
            'label',
            'Complication per-opératoire'
          ),
          jsonb_build_object('id', 'imc_superieur_30', 'label', 'IMC > 30'),
          jsonb_build_object(
            'id',
            'aucun_contexte_particulier',
            'label',
            'Aucun contexte particulier'
          )
        )
      )
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
    context_variables,
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
    p_context_variables,
    p_complexity,
    p_role,
    '{}'::jsonb,
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

revoke all on function public.create_intervention_v2(
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
  jsonb,
  integer,
  text
) from public;
grant execute on function public.create_intervention_v2(
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
  jsonb,
  integer,
  text
) to authenticated;

create or replace function public.save_intervention_evaluation_v2(
  p_intervention_id uuid,
  p_expected_intervention_version bigint,
  p_expected_evaluation_version bigint,
  p_checklist jsonb,
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

  perform public.validate_senior_evaluation_checklist(
    stored_intervention.definition_snapshot,
    p_checklist
  );

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
    checklist,
    global_performance,
    category_difficulty,
    senior_comment,
    updated_by_profile_id
  )
  values (
    p_intervention_id,
    actor_profile_id,
    p_checklist,
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
      'autonomyScore', calculated_score,
      'checklistAuthority', 'senior'
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

revoke all on function public.save_intervention_evaluation_v2(
  uuid,
  bigint,
  bigint,
  jsonb,
  text,
  text,
  text
) from public;
grant execute on function public.save_intervention_evaluation_v2(
  uuid,
  bigint,
  bigint,
  jsonb,
  text,
  text,
  text
) to authenticated;

-- Les nouvelles données brutes sont couvertes par la même immutabilité que le
-- reste de l'intervention.
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
      or new.context_variables is distinct from old.context_variables
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

-- Publication versionnée de la formule 100 % autonomie et recalcul
-- rétroactif des scores, statistiques dérivées et trophées.
do $$
declare
  current_formula public.autonomy_score_formulas%rowtype;
  published_formula public.autonomy_score_formulas%rowtype;
  next_formula_version integer;
  effective_at timestamptz := now();
  formula_definition jsonb := jsonb_build_object(
    'schemaVersion', 1,
    'keyStepMinimumCoverage', 0.75,
    'autonomyWeight', 1,
    'performanceWeight', 0,
    'autonomyScaleMaximum', 4,
    'performanceScaleMinimum', 1,
    'performanceScaleMaximum', 5,
    'difficultyCoefficients', jsonb_build_object('1', 1, '2', 1, '3', 1),
    'rounding', 'nearest_integer',
    'clampMinimum', 0,
    'clampMaximum', 100
  );
  score_result jsonb;
  trophy_result jsonb;
begin
  perform public.validate_autonomy_score_formula(formula_definition);
  perform pg_advisory_xact_lock(hashtext('project1-autonomy-score-formula'));

  select formula.*
  into current_formula
  from public.autonomy_score_formulas formula
  where formula.status = 'published'
  for update;

  if current_formula.id is null then
    raise exception 'La formule officielle actuelle est introuvable.'
      using errcode = 'P0002';
  end if;

  select coalesce(max(formula.formula_version), 0) + 1
  into next_formula_version
  from public.autonomy_score_formulas formula;

  update public.autonomy_score_formulas formula
  set
    status = 'retired',
    retired_at = effective_at
  where formula.id = current_formula.id;

  insert into public.autonomy_score_formulas (
    formula_version,
    status,
    definition,
    published_at
  )
  values (
    next_formula_version,
    'published',
    formula_definition,
    effective_at
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
    analytics_event
  )
  values (
    null,
    'admin'::public.app_role,
    'Migration système',
    'Publication de la formule d’autonomie',
    'Formule',
    concat('Version ', published_formula.formula_version),
    jsonb_build_object(
      'formulaId', published_formula.id,
      'formulaVersion', published_formula.formula_version,
      'scores', score_result,
      'trophies', trophy_result
    )
  );
end;
$$;

-- Les anciens points d'entrée ne doivent plus permettre de contourner les
-- variables de contexte ni la checklist Senior.
revoke execute on function public.create_intervention(
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
) from authenticated;

revoke execute on function public.save_intervention_evaluation(
  uuid,
  bigint,
  bigint,
  text,
  text,
  text
) from authenticated;

revoke insert, update, delete on table public.interventions from authenticated;
revoke insert, update, delete on table public.intervention_evaluations
  from authenticated;
