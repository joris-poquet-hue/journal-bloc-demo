-- Fix the whole-row reference used by the explicitly confirmed historical
-- snapshot operation. The previous alias matched the JSONB column name and was
-- therefore resolved as JSONB instead of surgical_intervention_definitions.

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
      catalog_definition as definition_record
    from public.interventions intervention
    join public.surgical_intervention_definitions catalog_definition
      on catalog_definition.id = intervention.procedure_id
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
