-- Require the first contact e-mail to be confirmed before business access and
-- retire operating start time/duration from historical and future records.

-- Prevent an older API deployment from invoking the former non-blocking
-- finalizer while the application and database are rolling forward.
revoke all on function public.complete_initial_account_setup(
  uuid,
  uuid,
  uuid
) from public, anon, authenticated, service_role;

create or replace function public.await_initial_account_email_confirmation(
  p_profile_id uuid,
  p_current_session_id uuid,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_profile public.profiles%rowtype;
  target_session public.application_sessions%rowtype;
  credential_operation jsonb;
  normalized_email text;
  auth_pending_email text;
  auth_confirmed_email text;
  auth_operation_id text;
  requested_at timestamptz := clock_timestamp();
begin
  if p_profile_id is null
    or p_current_session_id is null
    or p_operation_id is null
  then
    raise exception 'Profil, session ou opération de configuration manquant.'
      using errcode = '22023';
  end if;

  select profile.*
  into target_profile
  from public.profiles profile
  where profile.id = p_profile_id
  for update;

  if target_profile.id is null
    or not target_profile.is_active
    or target_profile.auth_user_id is null
    or not target_profile.must_change_password
  then
    raise exception 'Un profil actif en attente lié à Auth est requis.'
      using errcode = '42501';
  end if;

  credential_operation := target_profile.metadata -> 'credentialOperation';
  normalized_email := lower(btrim(coalesce(
    credential_operation ->> 'contactEmail',
    ''
  )));

  if credential_operation is null
    or coalesce(credential_operation ->> 'id', '') <> p_operation_id::text
    or coalesce(credential_operation ->> 'kind', '') <> 'initial_setup'
    or coalesce(credential_operation ->> 'state', '') not in (
      'prepared',
      'awaiting_email'
    )
    or coalesce(credential_operation ->> 'sessionId', '')
      <> p_current_session_id::text
  then
    raise exception 'La réservation de première connexion est invalide.'
      using errcode = '42501';
  end if;

  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Adresse e-mail réservée invalide.' using errcode = '22023';
  end if;

  select session_row.*
  into target_session
  from public.application_sessions session_row
  where session_row.id = p_current_session_id
    and session_row.profile_id = target_profile.id
    and session_row.auth_user_id = target_profile.auth_user_id
  for update;

  if target_session.id is null
    or target_session.revoked_at is not null
    or target_session.auth_context <> 'standard'
  then
    raise exception 'La session de première connexion a expiré.'
      using errcode = '42501';
  end if;

  select
    lower(btrim(coalesce(auth_account.email_change, ''))),
    lower(btrim(coalesce(auth_account.email, ''))),
    auth_account.raw_user_meta_data ->> 'initialSetupOperationId'
  into auth_pending_email, auth_confirmed_email, auth_operation_id
  from auth.users auth_account
  where auth_account.id = target_profile.auth_user_id
  for update;

  if auth_operation_id is null or auth_operation_id <> p_operation_id::text then
    raise exception 'La rotation Auth ne correspond pas à l’opération réservée.'
      using errcode = '42501';
  end if;

  if auth_pending_email <> normalized_email
    and auth_confirmed_email <> normalized_email
  then
    raise exception 'La demande Auth ne correspond pas à l’adresse réservée.'
      using errcode = '42501';
  end if;

  perform set_config('app.allow_profile_credential_operation', 'on', true);

  update public.profiles profile
  set
    metadata = (
      jsonb_set(
        coalesce(profile.metadata, '{}'::jsonb),
        '{credentialOperation,state}',
        to_jsonb('awaiting_email'::text),
        false
      ) - 'contactEmail'
    ) || jsonb_build_object(
      'pendingContactEmail', normalized_email,
      'pendingEmailPurpose', 'activation',
      'pendingEmailRequestedAt', requested_at
    ),
    updated_by_profile_id = target_profile.id
  where profile.id = target_profile.id;

  update public.application_sessions session_row
  set
    revoked_at = coalesce(session_row.revoked_at, requested_at),
    revocation_reason = coalesce(
      session_row.revocation_reason,
      'initial_account_email_confirmation_required'
    )
  where session_row.profile_id = target_profile.id
    and session_row.revoked_at is null;

  delete from auth.sessions auth_session
  where auth_session.user_id = target_profile.auth_user_id;

  insert into public.activity_log (
    profile_id,
    target_profile_id,
    actor_role,
    actor_label,
    action,
    target_type,
    target_label,
    created_by_profile_id,
    analytics_event
  )
  values (
    target_profile.id,
    target_profile.id,
    target_profile.role,
    trim(concat_ws(
      ' ',
      target_profile.first_name,
      target_profile.last_name
    )),
    'Confirmation e-mail de première connexion demandée',
    'Compte utilisateur',
    target_profile.login_id::text,
    target_profile.id,
    jsonb_build_object(
      'kind', 'initial_account_email_confirmation',
      'operationId', p_operation_id,
      'profileId', target_profile.id
    )
  );

  return jsonb_build_object(
    'confirmationPending', true,
    'contactEmail', normalized_email,
    'profileId', target_profile.id
  );
end;
$$;

revoke all on function public.await_initial_account_email_confirmation(
  uuid,
  uuid,
  uuid
) from public, anon, authenticated, service_role;
grant execute on function public.await_initial_account_email_confirmation(
  uuid,
  uuid,
  uuid
) to service_role;

create or replace function public.finalize_confirmed_email(
  p_profile_id uuid,
  p_confirmed_email text,
  p_purpose text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_profile public.profiles%rowtype;
  normalized_email text := lower(trim(coalesce(p_confirmed_email, '')));
  normalized_purpose text := lower(trim(coalesce(p_purpose, '')));
  auth_email text;
  auth_pending_email text;
  auth_operation_id text;
  pending_email text;
  pending_purpose text;
  current_contact_email text;
  credential_operation jsonb;
  protected_activation boolean := false;
  legacy_activation boolean := false;
  finalized_at timestamptz := clock_timestamp();
begin
  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid confirmed email is required'
      using errcode = '22023';
  end if;

  if normalized_purpose not in ('activation', 'change') then
    raise exception 'Invalid email confirmation purpose'
      using errcode = '22023';
  end if;

  select profile.*
  into target_profile
  from public.profiles profile
  where profile.id = p_profile_id
  for update;

  if target_profile.id is null
    or not target_profile.is_active
    or target_profile.auth_user_id is null
  then
    raise exception 'An active profile with an Auth identity is required'
      using errcode = '42501';
  end if;

  select
    lower(trim(coalesce(account.email, ''))),
    lower(trim(coalesce(account.email_change, ''))),
    account.raw_user_meta_data ->> 'initialSetupOperationId'
  into auth_email, auth_pending_email, auth_operation_id
  from auth.users account
  where account.id = target_profile.auth_user_id
  for update;

  if auth_email is null
    or auth_email <> normalized_email
    or auth_pending_email <> ''
  then
    raise exception 'The Auth email has not been confirmed'
      using errcode = '42501';
  end if;

  pending_email := lower(trim(coalesce(
    target_profile.metadata ->> 'pendingContactEmail',
    ''
  )));
  pending_purpose := lower(trim(coalesce(
    target_profile.metadata ->> 'pendingEmailPurpose',
    ''
  )));
  current_contact_email := lower(trim(coalesce(
    target_profile.metadata ->> 'contactEmail',
    ''
  )));
  credential_operation := target_profile.metadata -> 'credentialOperation';

  if pending_email <> '' and pending_email <> normalized_email then
    raise exception 'The confirmed email does not match the pending request'
      using errcode = '42501';
  end if;

  if pending_purpose <> '' and pending_purpose <> normalized_purpose then
    raise exception 'The confirmation purpose does not match the pending request'
      using errcode = '42501';
  end if;

  protected_activation := coalesce(
    normalized_purpose = 'activation'
    and target_profile.must_change_password
    and credential_operation ->> 'kind' = 'initial_setup'
    and credential_operation ->> 'state' in ('prepared', 'awaiting_email')
    and lower(trim(coalesce(
      credential_operation ->> 'contactEmail',
      ''
    ))) = normalized_email
    and coalesce(credential_operation ->> 'id', '') <> ''
    and auth_operation_id = credential_operation ->> 'id',
    false
  );

  legacy_activation := coalesce(
    normalized_purpose = 'activation'
    and target_profile.must_change_password
    and credential_operation is null
    and pending_email = normalized_email
    and pending_purpose = 'activation'
    and coalesce(
      target_profile.metadata ->> 'pendingEmailRequestedAt',
      ''
    ) <> '',
    false
  );

  if normalized_purpose = 'activation'
    and not target_profile.must_change_password
  then
    if pending_email = '' and current_contact_email = normalized_email then
      return jsonb_build_object(
        'alreadyFinalized', true,
        'contactEmail', normalized_email,
        'mustChangePassword', false
      );
    end if;

    raise exception 'The account is already activated'
      using errcode = '42501';
  end if;

  if normalized_purpose = 'activation'
    and not (protected_activation or legacy_activation)
  then
    raise exception 'First activation requires the exact confirmed request'
      using errcode = '42501';
  end if;

  if normalized_purpose = 'change' and target_profile.must_change_password then
    raise exception 'First account activation is still required'
      using errcode = '42501';
  end if;

  if normalized_purpose = 'change'
    and pending_email = ''
    and current_contact_email = normalized_email
  then
    return jsonb_build_object(
      'alreadyFinalized', true,
      'contactEmail', normalized_email,
      'mustChangePassword', false
    );
  end if;

  update auth.users account
  set
    raw_app_meta_data = case
      when normalized_purpose = 'activation' then
        jsonb_set(
          coalesce(account.raw_app_meta_data, '{}'::jsonb),
          '{pending_activation}',
          'false'::jsonb,
          true
        ) - 'provisionalCredentialOperationId'
      else coalesce(account.raw_app_meta_data, '{}'::jsonb)
    end,
    raw_user_meta_data = coalesce(
      account.raw_user_meta_data,
      '{}'::jsonb
    ) - 'emailTemplatePurpose' - 'initialSetupOperationId',
    updated_at = finalized_at
  where account.id = target_profile.auth_user_id;

  update public.application_sessions session_row
  set
    revoked_at = coalesce(session_row.revoked_at, finalized_at),
    revocation_reason = coalesce(
      session_row.revocation_reason,
      case
        when normalized_purpose = 'activation'
          then 'initial_account_email_confirmed'
        else 'confirmed_email_changed'
      end
    )
  where session_row.profile_id = target_profile.id
    and session_row.revoked_at is null;

  delete from auth.sessions auth_session
  where auth_session.user_id = target_profile.auth_user_id;

  perform set_config('app.allow_profile_credential_operation', 'on', true);

  update public.profiles profile
  set
    metadata = (
      coalesce(profile.metadata, '{}'::jsonb)
      - 'credentialOperation'
      - 'pendingContactEmail'
      - 'pendingEmailPurpose'
      - 'pendingEmailRequestedAt'
      - 'contactEmail'
    ) || jsonb_build_object('contactEmail', normalized_email)
      || case
        when protected_activation then jsonb_build_object(
          'lastInitialSetupOperationId', credential_operation ->> 'id'
        )
        else '{}'::jsonb
      end,
    must_change_password = case
      when normalized_purpose = 'activation' then false
      else profile.must_change_password
    end,
    updated_at = finalized_at,
    updated_by_profile_id = target_profile.id
  where profile.id = target_profile.id;

  insert into public.activity_log (
    profile_id,
    target_profile_id,
    actor_role,
    actor_label,
    action,
    target_type,
    target_label,
    created_by_profile_id,
    analytics_event
  )
  values (
    target_profile.id,
    target_profile.id,
    target_profile.role,
    trim(concat_ws(
      ' ',
      target_profile.first_name,
      target_profile.last_name
    )),
    case
      when normalized_purpose = 'activation'
        then 'Première connexion finalisée après confirmation e-mail'
      else 'Adresse e-mail modifiée'
    end,
    'Compte utilisateur',
    target_profile.login_id::text,
    target_profile.id,
    jsonb_build_object(
      'kind', 'confirmed_email_lifecycle',
      'purpose', normalized_purpose,
      'profileId', target_profile.id
    )
  );

  return jsonb_build_object(
    'alreadyFinalized', false,
    'contactEmail', normalized_email,
    'mustChangePassword', case
      when normalized_purpose = 'activation' then false
      else target_profile.must_change_password
    end
  );
end;
$$;

revoke all on function public.finalize_confirmed_email(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_confirmed_email(uuid, text, text)
  to service_role;

-- Accounts completed by the former non-blocking flow but still waiting for the
-- first address confirmation become pending again. Their chosen password stays
-- valid, but no application or Auth session remains usable before confirmation.
update auth.users auth_account
set raw_app_meta_data = jsonb_set(
  coalesce(auth_account.raw_app_meta_data, '{}'::jsonb),
  '{pending_activation}',
  'true'::jsonb,
  true
)
where exists (
  select 1
  from public.profiles profile
  where profile.auth_user_id = auth_account.id
    and profile.is_active
    and not profile.must_change_password
    and profile.metadata ->> 'pendingEmailPurpose' = 'activation'
    and coalesce(profile.metadata ->> 'contactEmail', '') = ''
);

update public.application_sessions session_row
set
  revoked_at = coalesce(session_row.revoked_at, clock_timestamp()),
  revocation_reason = coalesce(
    session_row.revocation_reason,
    'first_email_confirmation_now_required'
  )
where session_row.revoked_at is null
  and exists (
    select 1
    from public.profiles profile
    where profile.id = session_row.profile_id
      and profile.is_active
      and not profile.must_change_password
      and profile.metadata ->> 'pendingEmailPurpose' = 'activation'
      and coalesce(profile.metadata ->> 'contactEmail', '') = ''
  );

delete from auth.sessions auth_session
where exists (
  select 1
  from public.profiles profile
  where profile.auth_user_id = auth_session.user_id
    and profile.is_active
    and not profile.must_change_password
    and profile.metadata ->> 'pendingEmailPurpose' = 'activation'
    and coalesce(profile.metadata ->> 'contactEmail', '') = ''
);

update public.profiles profile
set
  must_change_password = true,
  updated_at = clock_timestamp()
where profile.is_active
  and not profile.must_change_password
  and profile.metadata ->> 'pendingEmailPurpose' = 'activation'
  and coalesce(profile.metadata ->> 'contactEmail', '') = '';

create or replace function public.remove_intervention_operating_time()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.intervention_start_time := null;
  new.operative_duration_minutes := null;
  new.definition_snapshot :=
    coalesce(new.definition_snapshot, '{}'::jsonb)
    - 'interventionTimingDefinition';
  return new;
end;
$$;

revoke all on function public.remove_intervention_operating_time()
  from public, anon, authenticated, service_role;

drop trigger if exists remove_intervention_operating_time_before_insert
  on public.interventions;
create trigger remove_intervention_operating_time_before_insert
before insert on public.interventions
for each row execute function public.remove_intervention_operating_time();

alter table public.interventions
  disable trigger protect_intervention_immutability;

update public.interventions
set
  intervention_start_time = null,
  operative_duration_minutes = null,
  definition_snapshot =
    coalesce(definition_snapshot, '{}'::jsonb)
    - 'interventionTimingDefinition'
where intervention_start_time is not null
  or operative_duration_minutes is not null
  or definition_snapshot ? 'interventionTimingDefinition';

alter table public.interventions
  enable trigger protect_intervention_immutability;

comment on column public.interventions.intervention_start_time is
  'Deprecated compatibility column. Values are removed before insertion.';
comment on column public.interventions.operative_duration_minutes is
  'Deprecated compatibility column. Values are removed before insertion.';
