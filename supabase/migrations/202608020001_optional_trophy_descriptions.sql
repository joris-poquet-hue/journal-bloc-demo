begin;

-- La description est un enrichissement éditorial facultatif. La validation
-- historique reste inchangée pour le titre, les règles, les seuils et les images.
do $migration$
declare
  validator_oid oid := to_regprocedure(
    'public.validate_trophy_definition_for_publication(jsonb)'
  );
  validator_body text;
  updated_body text;
  required_description_block text := E'\n  if nullif(trim(p_definition ->> ''description''), '''') is null then\n    raise exception ''La description du trophée est obligatoire.''\n      using errcode = ''22023'';\n  end if;\n';
begin
  if validator_oid is null then
    raise exception
      'La fonction validate_trophy_definition_for_publication(jsonb) est absente.';
  end if;

  select routine.prosrc
  into validator_body
  from pg_proc routine
  where routine.oid = validator_oid;

  updated_body := replace(
    validator_body,
    required_description_block,
    E'\n'
  );

  if updated_body = validator_body then
    if position(
      'La description du trophée est obligatoire.' in validator_body
    ) > 0 then
      raise exception
        'La validation de description existe encore mais son format est inattendu.';
    end if;

    return;
  end if;

  execute format(
    $definition$
      create or replace function public.validate_trophy_definition_for_publication(
        p_definition jsonb
      )
      returns void
      language plpgsql
      immutable
      set search_path = public
      as %L
    $definition$,
    updated_body
  );
end;
$migration$;

comment on function public.validate_trophy_definition_for_publication(jsonb)
  is 'Valide une définition avant publication ; la description est facultative.';

commit;
