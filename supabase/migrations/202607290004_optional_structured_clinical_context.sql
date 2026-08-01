-- Les variables de contexte clinique deviennent facultatives.
-- Leur structure reste versionnée et toute valeur fournie reste validée.

select set_config('request.jwt.claim.role', 'service_role', true);

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
  surgery_details text := coalesce(
    history ->> 'abdominopelvicSurgeryDetails',
    ''
  );
  complication_details text := coalesce(
    intraoperative ->> 'complicationDetails',
    ''
  );
begin
  if p_context_variables is null
    or jsonb_typeof(p_context_variables) <> 'object'
    or p_context_variables ->> 'schemaVersion' <> '2'
    or jsonb_typeof(patient) <> 'object'
    or jsonb_typeof(history) <> 'object'
    or jsonb_typeof(intraoperative) <> 'object' then
    raise exception 'La structure des variables de contexte clinique est invalide.'
      using errcode = '22023';
  end if;

  if coalesce(jsonb_typeof(patient -> 'ageYears'), 'null')
    not in ('number', 'null') then
    raise exception 'L’âge de la patiente doit être un nombre ou rester vide.'
      using errcode = '22023';
  end if;
  if jsonb_typeof(patient -> 'ageYears') = 'number' then
    age_years := (patient ->> 'ageYears')::numeric;
    if age_years < 0 or age_years > 120 or age_years <> trunc(age_years) then
      raise exception 'L’âge de la patiente doit être un entier entre 0 et 120.'
        using errcode = '22023';
    end if;
  end if;

  if coalesce(jsonb_typeof(patient -> 'bmi'), 'null')
    not in ('number', 'null') then
    raise exception 'L’IMC doit être un nombre ou rester vide.'
      using errcode = '22023';
  end if;
  if jsonb_typeof(patient -> 'bmi') = 'number' then
    bmi := (patient ->> 'bmi')::numeric;
    if bmi < 15 or bmi > 40 then
      raise exception 'L’IMC doit être compris entre les bornes ≤ 15 et ≥ 40.'
        using errcode = '22023';
    end if;
  end if;

  if coalesce(jsonb_typeof(patient -> 'tobaccoUse'), 'null')
      not in ('boolean', 'null')
    or coalesce(jsonb_typeof(history -> 'igh'), 'null')
      not in ('boolean', 'null')
    or coalesce(jsonb_typeof(history -> 'pelvicPeritonitis'), 'null')
      not in ('boolean', 'null')
    or coalesce(
      jsonb_typeof(history -> 'abdominopelvicSurgery'),
      'null'
    ) not in ('boolean', 'null')
    or coalesce(jsonb_typeof(intraoperative -> 'complication'), 'null')
      not in ('boolean', 'null') then
    raise exception 'Une variable Oui / Non contient une valeur invalide.'
      using errcode = '22023';
  end if;

  if coalesce(jsonb_typeof(patient -> 'parity'), 'null')
    not in ('string', 'null')
    or (
      jsonb_typeof(patient -> 'parity') = 'string'
      and patient ->> 'parity' not in ('0', '1', '2', '3_plus')
    ) then
    raise exception 'La parité contient une valeur invalide.'
      using errcode = '22023';
  end if;

  if coalesce(jsonb_typeof(history -> 'cesareanCount'), 'null')
    not in ('string', 'null')
    or (
      jsonb_typeof(history -> 'cesareanCount') = 'string'
      and history ->> 'cesareanCount' not in ('0', '1', '2', '3_plus')
    ) then
    raise exception 'Le nombre de césariennes contient une valeur invalide.'
      using errcode = '22023';
  end if;

  if coalesce(
      jsonb_typeof(history -> 'abdominopelvicSurgeryDetails'),
      'null'
    ) not in ('string', 'null')
    or coalesce(
      jsonb_typeof(intraoperative -> 'complicationDetails'),
      'null'
    ) not in ('string', 'null') then
    raise exception 'Les précisions cliniques doivent être du texte.'
      using errcode = '22023';
  end if;

  if length(surgery_details) > 500 or length(complication_details) > 500 then
    raise exception 'Une précision clinique dépasse 500 caractères.'
      using errcode = '22023';
  end if;

  if nullif(btrim(surgery_details), '') is not null
    and coalesce((history ->> 'abdominopelvicSurgery')::boolean, false)
      is not true then
    raise exception
      'La précision chirurgicale exige un antécédent de chirurgie.'
      using errcode = '22023';
  end if;

  if nullif(btrim(complication_details), '') is not null
    and coalesce((intraoperative ->> 'complication')::boolean, false)
      is not true then
    raise exception
      'La précision de complication exige une complication per-opératoire.'
      using errcode = '22023';
  end if;

  if coalesce(jsonb_typeof(intraoperative -> 'bloodLossMl'), 'null')
    not in ('number', 'null') then
    raise exception 'Le saignement per-opératoire doit être un nombre ou rester vide.'
      using errcode = '22023';
  end if;
  if jsonb_typeof(intraoperative -> 'bloodLossMl') = 'number' then
    blood_loss_ml := (intraoperative ->> 'bloodLossMl')::numeric;
    if blood_loss_ml < 0
      or blood_loss_ml > 2500
      or blood_loss_ml <> trunc(blood_loss_ml)
      or mod(blood_loss_ml, 50) <> 0 then
      raise exception
        'Le saignement doit être renseigné de 50 mL en 50 mL entre 0 et ≥ 2 500 mL.'
        using errcode = '22023';
    end if;
  end if;
end;
$$;

revoke all on function public.validate_structured_clinical_context(jsonb)
  from public;

create or replace function public.apply_optional_clinical_context_definition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.definition_snapshot is not null then
    new.definition_snapshot := jsonb_set(
      new.definition_snapshot,
      '{clinicalContextDefinition}',
      jsonb_build_object(
        'schemaVersion', 2,
        'optional', true,
        'patient',
        jsonb_build_object(
          'ageYears', jsonb_build_object(
            'required', false,
            'minimum', 0,
            'maximum', 120
          ),
          'bmi', jsonb_build_object(
            'required', false,
            'minimumBucket', '≤ 15',
            'maximumBucket', '≥ 40',
            'step', 0.1
          ),
          'tobaccoUse', jsonb_build_object(
            'required', false,
            'type', 'boolean'
          ),
          'parity', jsonb_build_object(
            'required', false,
            'values', jsonb_build_array('0', '1', '2', '3_plus')
          )
        ),
        'history',
        jsonb_build_object(
          'igh', jsonb_build_object(
            'required', false,
            'type', 'boolean'
          ),
          'pelvicPeritonitis', jsonb_build_object(
            'required', false,
            'type', 'boolean'
          ),
          'abdominopelvicSurgery', jsonb_build_object(
            'required', false,
            'type', 'boolean',
            'optionalDetails', true
          ),
          'cesareanCount', jsonb_build_object(
            'required', false,
            'values', jsonb_build_array('0', '1', '2', '3_plus')
          )
        ),
        'intraoperative',
        jsonb_build_object(
          'bloodLossMl', jsonb_build_object(
            'required', false,
            'minimum', 0,
            'maximumBucket', '≥ 2500',
            'step', 50
          ),
          'complication', jsonb_build_object(
            'required', false,
            'type', 'boolean',
            'optionalDetails', true
          )
        )
      ),
      true
    );
  end if;

  return new;
end;
$$;

revoke all on function public.apply_optional_clinical_context_definition()
  from public;

drop trigger if exists optional_clinical_context_definition_snapshot
  on public.interventions;
create trigger optional_clinical_context_definition_snapshot
before insert on public.interventions
for each row execute function
  public.apply_optional_clinical_context_definition();

notify pgrst, 'reload schema';
