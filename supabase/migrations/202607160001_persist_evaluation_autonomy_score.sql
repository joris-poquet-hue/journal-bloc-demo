-- Persist the senior evaluation and its derived autonomy score atomically.
-- Seniors keep no direct UPDATE permission on interventions: this narrowly
-- scoped function checks assignment, ownership and optimistic versions first.

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
  stored_evaluation public.intervention_evaluations%rowtype;
  saved_intervention public.interventions%rowtype;
  saved_evaluation public.intervention_evaluations%rowtype;
  evaluation_exists boolean := false;
  evaluation_senior_profile_id uuid;
begin
  if actor_profile_id is null or actor_role is null then
    raise exception 'Aucune session autorisée.' using errcode = '42501';
  end if;

  if p_global_performance is not null
    and p_global_performance not in ('1', '2', '3', '4', '5') then
    raise exception 'Performance globale invalide.' using errcode = '22023';
  end if;

  if p_category_difficulty is not null
    and p_category_difficulty not in ('1', '2', '3') then
    raise exception 'Difficulté chirurgicale invalide.' using errcode = '22023';
  end if;

  if p_autonomy_score is not null
    and (p_autonomy_score < 0 or p_autonomy_score > 100) then
    raise exception 'Score d’autonomie invalide.' using errcode = '22023';
  end if;

  select *
  into stored_intervention
  from public.interventions
  where id = p_intervention_id
    and deleted_at is null
  for update;

  if not found then
    raise exception 'Intervention introuvable.' using errcode = 'P0002';
  end if;

  if stored_intervention.version <> p_expected_intervention_version then
    raise exception 'Cette intervention a été modifiée. Rechargez les données.'
      using errcode = '40001';
  end if;

  if actor_role = 'senior' then
    if stored_intervention.senior_profile_id is distinct from actor_profile_id
      or not public.senior_manages_internal(
        stored_intervention.internal_profile_id
      ) then
      raise exception 'Cette intervention ne peut pas être évaluée par ce Senior.'
        using errcode = '42501';
    end if;

    evaluation_senior_profile_id := actor_profile_id;
  elsif actor_role = 'admin' then
    evaluation_senior_profile_id := p_senior_profile_id;
  else
    raise exception 'Aucune session autorisée pour cette évaluation.'
      using errcode = '42501';
  end if;

  select *
  into stored_evaluation
  from public.intervention_evaluations
  where intervention_id = p_intervention_id
  for update;

  evaluation_exists := found;

  if evaluation_exists then
    if p_expected_evaluation_version is null
      or stored_evaluation.version <> p_expected_evaluation_version then
      raise exception 'Cette évaluation a été modifiée. Rechargez les données.'
        using errcode = '40001';
    end if;

    update public.intervention_evaluations
    set
      senior_profile_id = evaluation_senior_profile_id,
      global_performance = p_global_performance,
      category_difficulty = p_category_difficulty,
      senior_comment = coalesce(p_senior_comment, '')
    where intervention_id = p_intervention_id
    returning * into saved_evaluation;
  else
    if p_expected_evaluation_version is not null then
      raise exception 'Cette évaluation n’existe plus. Rechargez les données.'
        using errcode = '40001';
    end if;

    insert into public.intervention_evaluations (
      intervention_id,
      senior_profile_id,
      global_performance,
      category_difficulty,
      senior_comment
    )
    values (
      p_intervention_id,
      evaluation_senior_profile_id,
      p_global_performance,
      p_category_difficulty,
      coalesce(p_senior_comment, '')
    )
    returning * into saved_evaluation;
  end if;

  update public.interventions
  set autonomy_score = p_autonomy_score
  where id = p_intervention_id
  returning * into saved_intervention;

  return jsonb_build_object(
    'evaluation', to_jsonb(saved_evaluation),
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
