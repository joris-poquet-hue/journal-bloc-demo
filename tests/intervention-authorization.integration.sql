-- Run only against an isolated Supabase test database after all migrations.
-- Every fixture and assertion lives inside a transaction that is rolled back.

begin;

insert into auth.users (
  id,
  aud,
  role,
  created_at,
  updated_at
)
values
  ('00000000-0000-4000-8000-000000000201', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-8000-000000000202', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-8000-000000000203', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-8000-000000000204', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-8000-000000000205', 'authenticated', 'authenticated', now(), now());

insert into public.profiles (
  id,
  auth_user_id,
  role,
  first_name,
  last_name,
  login_id,
  institution,
  must_change_password,
  is_active
)
values
  (
    '00000000-0000-4000-8000-000000000101',
    '00000000-0000-4000-8000-000000000201',
    'internal',
    'Test',
    'Interne',
    'integration-internal',
    'Établissement A',
    false,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    '00000000-0000-4000-8000-000000000202',
    'senior',
    'Test',
    'Désigné',
    'integration-designated',
    'Établissement A',
    false,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000103',
    '00000000-0000-4000-8000-000000000203',
    'senior',
    'Test',
    'Même établissement',
    'integration-same-institution',
    'Établissement A',
    false,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000104',
    '00000000-0000-4000-8000-000000000204',
    'senior',
    'Test',
    'Nouvel établissement',
    'integration-new-institution',
    'Établissement B',
    false,
    true
  ),
  (
    '00000000-0000-4000-8000-000000000105',
    '00000000-0000-4000-8000-000000000205',
    'admin',
    'Test',
    'Administrateur',
    'integration-admin',
    null,
    false,
    true
  );

insert into public.surgical_intervention_definitions (
  id,
  name,
  status,
  definition
)
values (
  'integration-atomic-intervention',
  'Intervention atomique de test',
  'active',
  '{
    "allowedApproaches": ["voie_vaginale"],
    "allowedEntryTechniques": [],
    "checklistSteps": [{"id": "step-1", "label": "Étape de test"}],
    "indications": ["Test"],
    "keyStepIds": ["step-1"],
    "name": "Intervention atomique de test",
    "requiresLaterality": false,
    "status": "active"
  }'::jsonb
);

-- An internal cannot designate a senior from another institution, and the
-- rejected transaction must leave no partial intervention or request.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000201', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000201","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  denied boolean := false;
begin
  begin
    perform public.create_intervention_with_evaluation_request(
      '00000000-0000-4000-8000-000000000302',
      'integration-invalid-mutation',
      '00000000-0000-4000-8000-000000000104',
      'integration-atomic-intervention',
      current_date,
      'autre',
      '',
      'Indication de test',
      'voie_vaginale',
      null,
      null,
      'programme',
      5,
      'operateur_principal',
      '{"step-1":"3"}'::jsonb,
      now()
    );
  exception when sqlstate '42501' then
    denied := true;
  end;

  if not denied then
    raise exception 'Un Senior d’un autre établissement a été accepté.';
  end if;
end;
$$;

reset role;

do $$
begin
  if exists (
    select 1 from public.interventions
    where id = '00000000-0000-4000-8000-000000000302'
  ) or exists (
    select 1 from public.evaluation_requests
    where intervention_id = '00000000-0000-4000-8000-000000000302'
  ) then
    raise exception 'L’enregistrement rejeté a laissé des données partielles.';
  end if;
end;
$$;

-- A valid save and its exact retry produce one intervention and one request.
set local role authenticated;

select public.create_intervention_with_evaluation_request(
  '00000000-0000-4000-8000-000000000301',
  'integration-valid-mutation',
  '00000000-0000-4000-8000-000000000102',
  'integration-atomic-intervention',
  current_date,
  'autre',
  '',
  'Indication de test',
  'voie_vaginale',
  null,
  null,
  'programme',
  5,
  'operateur_principal',
  '{"step-1":"3"}'::jsonb,
  now()
);

select public.create_intervention_with_evaluation_request(
  '00000000-0000-4000-8000-000000000301',
  'integration-valid-mutation',
  '00000000-0000-4000-8000-000000000102',
  'integration-atomic-intervention',
  current_date,
  'autre',
  '',
  'Indication de test',
  'voie_vaginale',
  null,
  null,
  'programme',
  5,
  'operateur_principal',
  '{"step-1":"3"}'::jsonb,
  now()
);

reset role;

do $$
begin
  if (
    select count(*) from public.interventions
    where id = '00000000-0000-4000-8000-000000000301'
  ) <> 1 then
    raise exception 'La relance a créé plusieurs interventions.';
  end if;

  if (
    select count(*) from public.evaluation_requests
    where intervention_id = '00000000-0000-4000-8000-000000000301'
  ) <> 1 then
    raise exception 'La demande d’évaluation atomique est absente ou dupliquée.';
  end if;
end;
$$;

-- The designated senior and every other senior in institution A see the same
-- intervention. Institution B sees nothing. Direct profile rows stay private,
-- while the redacted pedagogical directory remains available.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000202', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000202","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
begin
  if (
    select count(*) from public.interventions
    where id = '00000000-0000-4000-8000-000000000301'
  ) <> 1 then
    raise exception 'Le Senior désigné ne voit pas l’intervention.';
  end if;

  if exists (
    select 1 from public.profiles
    where id = '00000000-0000-4000-8000-000000000101'
  ) then
    raise exception 'Le Senior peut lire directement le profil privé de l’Interne.';
  end if;

  if (
    select count(*) from public.list_visible_internal_directory()
    where id = '00000000-0000-4000-8000-000000000101'
  ) <> 1 then
    raise exception 'Le répertoire pédagogique expurgé est incomplet.';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000203', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000203","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
begin
  if (
    select count(*) from public.interventions
    where id = '00000000-0000-4000-8000-000000000301'
  ) <> 1 then
    raise exception 'Le second Senior du même établissement ne voit pas l’intervention.';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000204', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000204","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
begin
  if exists (
    select 1 from public.interventions
    where id = '00000000-0000-4000-8000-000000000301'
  ) then
    raise exception 'Un Senior d’un autre établissement voit l’intervention.';
  end if;
end;
$$;

-- Neither another same-institution senior nor an administrator may evaluate.
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000203', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000203","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  denied boolean := false;
begin
  begin
    perform public.save_intervention_evaluation_with_score(
      '00000000-0000-4000-8000-000000000301',
      1,
      null,
      '00000000-0000-4000-8000-000000000103',
      '4',
      '2',
      'Évaluation de test',
      80
    );
  exception when sqlstate '42501' then
    denied := true;
  end;

  if not denied then
    raise exception 'Un Senior non désigné a pu évaluer.';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000205', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000205","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
declare
  denied boolean := false;
begin
  begin
    perform public.save_intervention_evaluation_with_score(
      '00000000-0000-4000-8000-000000000301',
      1,
      null,
      '00000000-0000-4000-8000-000000000102',
      '4',
      '2',
      'Évaluation de test',
      80
    );
  exception when sqlstate '42501' then
    denied := true;
  end;

  if not denied then
    raise exception 'Un Administrateur a pu valider l’évaluation.';
  end if;
end;
$$;

-- The designated senior evaluates successfully without any favorite assignment.
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000202', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000202","role":"authenticated"}',
  true
);
set local role authenticated;

select public.save_intervention_evaluation_with_score(
  '00000000-0000-4000-8000-000000000301',
  1,
  null,
  '00000000-0000-4000-8000-000000000102',
  '4',
  '2',
  'Évaluation de test',
  80
);

reset role;

do $$
begin
  if (
    select count(*) from public.intervention_evaluations
    where intervention_id = '00000000-0000-4000-8000-000000000301'
  ) <> 1 then
    raise exception 'L’évaluation désignée n’a pas été créée exactement une fois.';
  end if;

  if (
    select status from public.evaluation_requests
    where intervention_id = '00000000-0000-4000-8000-000000000301'
  ) <> 'completed' then
    raise exception 'La demande d’évaluation n’est pas terminée.';
  end if;
end;
$$;

-- Keep a favorite assignment on purpose, then move the internal. The former
-- institution must lose access despite this stale favorite, and the new one must
-- inherit the full intervention and evaluation history.
insert into public.senior_internal_assignments (
  senior_profile_id,
  internal_profile_id
)
values (
  '00000000-0000-4000-8000-000000000102',
  '00000000-0000-4000-8000-000000000101'
);

update public.profiles
set institution = 'Établissement B'
where id = '00000000-0000-4000-8000-000000000101';

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000202', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000202","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
begin
  if exists (
    select 1 from public.interventions
    where id = '00000000-0000-4000-8000-000000000301'
  ) then
    raise exception 'L’ancien Senior conserve un accès via Mes internes.';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000203', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000203","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
begin
  if exists (
    select 1 from public.interventions
    where id = '00000000-0000-4000-8000-000000000301'
  ) then
    raise exception 'L’ancien établissement conserve l’accès.';
  end if;
end;
$$;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000204', true);
select set_config(
  'request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-000000000204","role":"authenticated"}',
  true
);
set local role authenticated;

do $$
begin
  if (
    select count(*) from public.interventions
    where id = '00000000-0000-4000-8000-000000000301'
  ) <> 1 then
    raise exception 'Le nouvel établissement ne voit pas l’intervention historique.';
  end if;

  if (
    select count(*) from public.intervention_evaluations
    where intervention_id = '00000000-0000-4000-8000-000000000301'
  ) <> 1 then
    raise exception 'Le nouvel établissement ne voit pas l’évaluation historique.';
  end if;
end;
$$;

reset role;

do $$
declare
  required_table text;
begin
  foreach required_table in array array[
    'profiles',
    'senior_internal_assignments',
    'interventions',
    'intervention_evaluations',
    'evaluation_requests'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = required_table
    ) then
      raise exception '% n’est pas publié dans Supabase Realtime.', required_table;
    end if;
  end loop;
end;
$$;

rollback;

select 'Tous les contrôles Interne–Seniors ont réussi.' as result;
