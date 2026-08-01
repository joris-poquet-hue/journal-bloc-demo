-- Final enforcement step for Lot 4.
-- Apply only after the client using create_intervention() and
-- save_intervention_evaluation() has been deployed and verified.

drop function if exists public.create_intervention_with_evaluation_request(
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
);

drop function if exists public.save_intervention_evaluation_with_score(
  uuid,
  bigint,
  bigint,
  uuid,
  text,
  text,
  text,
  numeric
);

revoke insert, update, delete on table public.interventions from authenticated;
revoke insert, update, delete on table public.intervention_evaluations
  from authenticated;
