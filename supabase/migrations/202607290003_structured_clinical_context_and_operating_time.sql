-- Horaire opératoire et variables cliniques structurées.
-- Les anciennes interventions conservent leur tableau context_variables historique.
-- Seule create_intervention_v3() accepte les nouvelles saisies.

select set_config('request.jwt.claim.role', 'service_role', true);

alter table public.interventions
  add column if not exists intervention_start_time time without time zone,
  add column if not exists operative_duration_minutes integer;

alter table public.interventions
  drop constraint if exists interventions_operative_duration_minutes_check;
alter table public.interventions
  add constraint interventions_operative_duration_minutes_check
  check (
    operative_duration_minutes is null
    or operative_duration_minutes between 1 and 10080
  );

alter table public.interventions
  drop constraint if exists interventions_context_variables_array_check;
alter table public.interventions
  drop constraint if exists interventions_context_variables_shape_check;
alter table public.interventions
  add constraint interventions_context_variables_shape_check
  check (jsonb_typeof(context_variables) in ('array', 'object'));

create or replace function public.validate_structured_clinical_context(
  p_context_variables jsonb
)
returns void
language plpgsql
immutable
set search_path = public
as $$
declare
  patient jsonb := p_context_variables -> 'patient';
  history jsonb := p_context_variables -> 'history';
  intraoperative jsonb := p_context_variables -> 'intraoperative';
  age_years numeric;
  bmi numeric;
  blood_loss_ml numeric;
  surgery_details text;
  complication_details text;
begin
  if p_context_variables is null
    or jsonb_typeof(p_context_variables) <> 'object'
    or p_context_variables ->> 'schemaVersion' <> '2'
    or jsonb_typeof(patient) <> 'object'
    or jsonb_typeof(history) <> 'object'
    or jsonb_typeof(intraoperative) <> 'object' then
    raise exception 'Les variables de contexte clinique sont incomplètes.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(patient -> 'ageYears') <> 'number' then
    raise exception 'L’âge de la patiente est obligatoire.'
      using errcode = '22023';
  end if;
  age_years := (patient ->> 'ageYears')::numeric;
  if age_years < 0 or age_years > 120 or age_years <> trunc(age_years) then
    raise exception 'L’âge de la patiente doit être un entier entre 0 et 120.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(patient -> 'bmi') <> 'number' then
    raise exception 'L’IMC de la patiente est obligatoire.'
      using errcode = '22023';
  end if;
  bmi := (patient ->> 'bmi')::numeric;
  if bmi < 15 or bmi > 40 then
    raise exception 'L’IMC doit être compris entre les bornes ≤ 15 et ≥ 40.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(patient -> 'tobaccoUse') <> 'boolean'
    or jsonb_typeof(history -> 'igh') <> 'boolean'
    or jsonb_typeof(history -> 'pelvicPeritonitis') <> 'boolean'
    or jsonb_typeof(history -> 'abdominopelvicSurgery') <> 'boolean'
    or jsonb_typeof(intraoperative -> 'complication') <> 'boolean' then
    raise exception 'Chaque variable Oui / Non doit être renseignée.'
      using errcode = '22023';
  end if;

  if coalesce(patient ->> 'parity', '') not in ('0', '1', '2', '3_plus')
    or coalesce(history ->> 'cesareanCount', '') not in ('0', '1', '2', '3_plus') then
    raise exception 'La parité et les antécédents de césarienne sont obligatoires.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(history -> 'abdominopelvicSurgeryDetails') <> 'string'
    or jsonb_typeof(intraoperative -> 'complicationDetails') <> 'string' then
    raise exception 'Les précisions cliniques doivent être du texte.'
      using errcode = '22023';
  end if;

  surgery_details := history ->> 'abdominopelvicSurgeryDetails';
  complication_details := intraoperative ->> 'complicationDetails';
  if length(surgery_details) > 500 or length(complication_details) > 500 then
    raise exception 'Une précision clinique dépasse 500 caractères.'
      using errcode = '22023';
  end if;

  if (history ->> 'abdominopelvicSurgery')::boolean = false
    and nullif(btrim(surgery_details), '') is not null then
    raise exception
      'La précision chirurgicale exige un antécédent de chirurgie.'
      using errcode = '22023';
  end if;

  if (intraoperative ->> 'complication')::boolean = false
    and nullif(btrim(complication_details), '') is not null then
    raise exception
      'La précision de complication exige une complication per-opératoire.'
      using errcode = '22023';
  end if;

  if jsonb_typeof(intraoperative -> 'bloodLossMl') <> 'number' then
    raise exception 'Le saignement per-opératoire est obligatoire.'
      using errcode = '22023';
  end if;
  blood_loss_ml := (intraoperative ->> 'bloodLossMl')::numeric;
  if blood_loss_ml < 0
    or blood_loss_ml > 2500
    or blood_loss_ml <> trunc(blood_loss_ml)
    or mod(blood_loss_ml, 50) <> 0 then
    raise exception
      'Le saignement doit être renseigné de 50 mL en 50 mL entre 0 et ≥ 2 500 mL.'
      using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.validate_structured_clinical_context(jsonb)
  from public;

create or replace function public.create_intervention_v3(
  p_intervention_id uuid,
  p_client_mutation_id text,
  p_senior_profile_id uuid,
  p_procedure_id text,
  p_intervention_date date,
  p_intervention_start_time time without time zone,
  p_operative_duration_minutes integer,
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

  if p_intervention_start_time is null then
    raise exception 'L’heure de début de l’intervention est obligatoire.'
      using errcode = '22023';
  end if;

  if p_operative_duration_minutes is null
    or p_operative_duration_minutes < 1
    or p_operative_duration_minutes > 10080 then
    raise exception 'La durée opératoire en minutes est invalide.'
      using errcode = '22023';
  end if;

  if length(coalesce(p_indication_comment, '')) > 500 then
    raise exception 'Le commentaire d’indication est trop long.'
      using errcode = '22023';
  end if;

  perform public.validate_structured_clinical_context(p_context_variables);

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
      'interventionTimingDefinition',
      jsonb_build_object(
        'schemaVersion', 1,
        'startTimeRequired', true,
        'durationUnit', 'minutes',
        'minimumDurationMinutes', 1
      ),
      'clinicalContextDefinition',
      jsonb_build_object(
        'schemaVersion', 2,
        'patient',
        jsonb_build_object(
          'ageYears', jsonb_build_object('required', true, 'minimum', 0, 'maximum', 120),
          'bmi', jsonb_build_object(
            'required', true,
            'minimumBucket', '≤ 15',
            'maximumBucket', '≥ 40',
            'step', 0.1
          ),
          'tobaccoUse', jsonb_build_object('required', true, 'type', 'boolean'),
          'parity', jsonb_build_array('0', '1', '2', '3_plus')
        ),
        'history',
        jsonb_build_object(
          'igh', jsonb_build_object('required', true, 'type', 'boolean'),
          'pelvicPeritonitis', jsonb_build_object('required', true, 'type', 'boolean'),
          'abdominopelvicSurgery', jsonb_build_object(
            'required', true,
            'type', 'boolean',
            'optionalDetails', true
          ),
          'cesareanCount', jsonb_build_array('0', '1', '2', '3_plus')
        ),
        'intraoperative',
        jsonb_build_object(
          'bloodLossMl', jsonb_build_object(
            'required', true,
            'minimum', 0,
            'maximumBucket', '≥ 2500',
            'step', 50
          ),
          'complication', jsonb_build_object(
            'required', true,
            'type', 'boolean',
            'optionalDetails', true
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
    intervention_start_time,
    operative_duration_minutes,
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
    p_intervention_start_time,
    p_operative_duration_minutes,
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

revoke all on function public.create_intervention_v3(
  uuid,
  text,
  uuid,
  text,
  date,
  time without time zone,
  integer,
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
grant execute on function public.create_intervention_v3(
  uuid,
  text,
  uuid,
  text,
  date,
  time without time zone,
  integer,
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

-- L’ancien point d’entrée ne collecte ni l’horaire ni le nouveau contexte :
-- il ne doit plus permettre de créer une intervention.
revoke execute on function public.create_intervention_v2(
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
) from authenticated;

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
      or new.intervention_start_time is distinct from old.intervention_start_time
      or new.operative_duration_minutes is distinct from old.operative_duration_minutes
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

notify pgrst, 'reload schema';
