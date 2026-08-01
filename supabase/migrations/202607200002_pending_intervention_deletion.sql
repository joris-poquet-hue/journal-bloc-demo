-- An Internal may delete only their own intervention while its evaluation is
-- still pending. The intervention, its request and its audit trace are handled
-- in one transaction. No role, including Administrator, keeps a direct DELETE
-- privilege on the intervention table.

drop policy if exists "interventions_delete_admin" on public.interventions;
revoke delete on table public.interventions from authenticated;

create or replace function public.delete_pending_intervention(
  p_intervention_id uuid,
  p_expected_intervention_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile public.profiles%rowtype;
  stored_intervention public.interventions%rowtype;
  deleted_request public.evaluation_requests%rowtype;
begin
  select profile.*
  into actor_profile
  from public.profiles profile
  where profile.id = public.current_profile_id()
    and profile.role = 'internal'::public.app_role
    and profile.is_active
  limit 1;

  if actor_profile.id is null then
    raise exception 'Seul l’Interne propriétaire peut supprimer cette intervention.'
      using errcode = '42501';
  end if;

  if p_intervention_id is null or p_expected_intervention_version is null then
    raise exception 'Intervention ou version manquante.' using errcode = '22023';
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

  if stored_intervention.internal_profile_id is distinct from actor_profile.id then
    raise exception 'Seul l’Interne propriétaire peut supprimer cette intervention.'
      using errcode = '42501';
  end if;

  if stored_intervention.version <> p_expected_intervention_version then
    raise exception 'Cette intervention a changé. Rechargez les données avant de réessayer.'
      using errcode = '40001';
  end if;

  if exists (
    select 1
    from public.intervention_evaluations evaluation
    where evaluation.intervention_id = stored_intervention.id
  ) then
    raise exception 'Cette intervention est déjà évaluée et ne peut plus être supprimée.'
      using errcode = '55000';
  end if;

  delete from public.evaluation_requests request
  where request.intervention_id = stored_intervention.id
    and request.internal_profile_id = actor_profile.id
    and request.status = 'pending'
  returning * into deleted_request;

  if deleted_request.intervention_id is null then
    raise exception 'La demande d’évaluation active est introuvable.'
      using errcode = '55000';
  end if;

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
    'Suppression d’une intervention en attente',
    'Intervention',
    stored_intervention.procedure_id,
    actor_profile.id
  );

  delete from public.interventions intervention
  where intervention.id = stored_intervention.id;

  if not found then
    raise exception 'La suppression de l’intervention a échoué.' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'evaluationRequest', to_jsonb(deleted_request),
    'intervention', to_jsonb(stored_intervention)
  );
end;
$$;

revoke all on function public.delete_pending_intervention(uuid, bigint)
  from public;
grant execute on function public.delete_pending_intervention(uuid, bigint)
  to authenticated;
