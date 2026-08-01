begin;

-- Corrections explicitement validées le 29 juillet 2026 avant l’activation
-- de l’autorité serveur et du versionnement des trophées.
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config(
  'request.jwt.claims',
  '{"role":"service_role"}',
  true
);

do $$
declare
  salpingectomy public.trophy_definitions%rowtype;
  aspiration public.trophy_definitions%rowtype;
  salpingectomy_changed boolean := false;
  aspiration_changed boolean := false;
begin
  select definition.*
  into salpingectomy
  from public.trophy_definitions definition
  where definition.id = 'admin-trophy-1782840984014'
  for update;

  if salpingectomy.id is null then
    raise exception 'Le trophée historique Salpingectomie est introuvable.'
      using errcode = 'P0002';
  end if;

  if salpingectomy.status <> 'active'
    or jsonb_typeof(salpingectomy.definition -> 'levels') <> 'array'
    or jsonb_array_length(salpingectomy.definition -> 'levels') <> 4
    or salpingectomy.definition #>> '{levels,3,tier}' <> 'diamond'
    or coalesce(
      (salpingectomy.definition #>> '{levels,3,autonomyMin}')::numeric,
      -1
    ) <> 80
    or coalesce(
      (salpingectomy.definition #>> '{levels,3,threshold}')::numeric,
      -1
    ) not in (30, 31)
    or coalesce(salpingectomy.definition ->> 'description', '') not in (
      '',
      'Récompense ta progression en salpingectomie'
    ) then
    raise exception
      'La définition historique de Salpingectomie ne correspond pas à l’état validé.'
      using errcode = '22023';
  end if;

  salpingectomy_changed :=
    coalesce(salpingectomy.definition ->> 'description', '')
      <> 'Récompense ta progression en salpingectomie'
    or (salpingectomy.definition #>> '{levels,3,threshold}')::numeric <> 31;

  if salpingectomy_changed then
    update public.trophy_definitions definition
    set definition = jsonb_set(
      jsonb_set(
        definition.definition,
        '{description}',
        to_jsonb('Récompense ta progression en salpingectomie'::text),
        true
      ),
      '{levels,3,threshold}',
      '31'::jsonb,
      false
    )
    where definition.id = salpingectomy.id;

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
      null,
      'admin'::public.app_role,
      'Migration de conformité validée',
      'Correction de la définition historique d’un trophée',
      'Trophée',
      salpingectomy.title,
      null
    );
  end if;

  select definition.*
  into aspiration
  from public.trophy_definitions definition
  where definition.id = 'admin-trophy-1783252388276'
  for update;

  if aspiration.id is null then
    raise exception 'Le trophée historique Aspiration est introuvable.'
      using errcode = 'P0002';
  end if;

  if aspiration.status <> 'active'
    or jsonb_typeof(aspiration.definition -> 'levels') <> 'array'
    or jsonb_array_length(aspiration.definition -> 'levels') <> 4
    or aspiration.definition #>> '{levels,3,tier}' <> 'diamond'
    or coalesce(
      (aspiration.definition #>> '{levels,3,autonomyMin}')::numeric,
      -1
    ) <> 90
    or coalesce(
      (aspiration.definition #>> '{levels,3,threshold}')::numeric,
      -1
    ) not in (15, 16)
    or coalesce(aspiration.definition ->> 'description', '') not in (
      '',
      'Récompense ta progression en aspiration endo-utérine'
    ) then
    raise exception
      'La définition historique d’Aspiration ne correspond pas à l’état validé.'
      using errcode = '22023';
  end if;

  aspiration_changed :=
    coalesce(aspiration.definition ->> 'description', '')
      <> 'Récompense ta progression en aspiration endo-utérine'
    or (aspiration.definition #>> '{levels,3,threshold}')::numeric <> 16;

  if aspiration_changed then
    update public.trophy_definitions definition
    set definition = jsonb_set(
      jsonb_set(
        definition.definition,
        '{description}',
        to_jsonb(
          'Récompense ta progression en aspiration endo-utérine'::text
        ),
        true
      ),
      '{levels,3,threshold}',
      '16'::jsonb,
      false
    )
    where definition.id = aspiration.id;

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
      null,
      'admin'::public.app_role,
      'Migration de conformité validée',
      'Correction de la définition historique d’un trophée',
      'Trophée',
      aspiration.title,
      null
    );
  end if;
end;
$$;

commit;
