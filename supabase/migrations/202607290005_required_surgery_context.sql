-- Le cadre de l'intervention est désormais choisi explicitement par l'Interne.
-- Il est obligatoire, limité à Bloc programmé / Urgence et n'est plus déduit
-- automatiquement de l'indication.

select set_config('request.jwt.claim.role', 'service_role', true);

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
    or p_surgery_context is null
    or p_surgery_context not in ('urgence', 'programme')
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

create or replace function public.apply_required_surgery_context_definition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.definition_snapshot is not null then
    new.definition_snapshot := jsonb_set(
      new.definition_snapshot,
      '{surgeryContextDefinition}',
      jsonb_build_object(
        'schemaVersion', 1,
        'required', true,
        'values', jsonb_build_array('programme', 'urgence'),
        'labels', jsonb_build_object(
          'programme', 'Bloc programmé',
          'urgence', 'Urgence'
        ),
        'derivedFromIndication', false
      ),
      true
    );
  end if;

  return new;
end;
$$;

revoke all on function public.apply_required_surgery_context_definition()
  from public;

drop trigger if exists required_surgery_context_definition_snapshot
  on public.interventions;
create trigger required_surgery_context_definition_snapshot
before insert on public.interventions
for each row execute function
  public.apply_required_surgery_context_definition();

notify pgrst, 'reload schema';
