-- Make the e-mail confirmation non-blocking after the protected first-login
-- setup. The provisional key still cannot expose business data: the password
-- is changed first, every provisional session is revoked atomically, and the
-- server creates one replacement standard session only after this transaction.

-- Credential changes touch Supabase Auth outside the database transaction. A
-- versioned reservation on the profile serializes first-login setup with an
-- administrator regenerating the provisional key. No password or key is ever
-- stored in this reservation.
create or replace function public.protect_profile_credential_operation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.metadata -> 'credentialOperation'
      is distinct from new.metadata -> 'credentialOperation'
    and coalesce(
      current_setting('app.allow_profile_credential_operation', true),
      ''
    ) <> 'on'
  then
    raise exception 'Utilisez le protocole réservé de mutation des identifiants.'
      using errcode = '55000';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_profile_credential_operation
  on public.profiles;
create trigger protect_profile_credential_operation
before update of metadata on public.profiles
for each row execute function public.protect_profile_credential_operation();

revoke all on function public.protect_profile_credential_operation()
  from public, anon, authenticated, service_role;

create or replace function public.begin_initial_account_setup(
  p_profile_id uuid,
  p_current_session_id uuid,
  p_contact_email text,
  p_expected_version bigint,
  p_started_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_profile public.profiles%rowtype;
  target_session public.application_sessions%rowtype;
  normalized_email text := lower(btrim(coalesce(p_contact_email, '')));
  credential_operation jsonb;
  operation_id uuid;
  prepared_at timestamptz := clock_timestamp();
begin
  if p_profile_id is null
    or p_current_session_id is null
    or p_expected_version is null
    or p_expected_version < 1
    or p_started_at is null
  then
    raise exception 'Profil, session, version ou date de configuration manquant.'
      using errcode = '22023';
  end if;

  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Adresse e-mail invalide.' using errcode = '22023';
  end if;

  select profile.*
  into target_profile
  from public.profiles profile
  where profile.id = p_profile_id
  for update;

  if target_profile.id is null then
    raise exception 'Profil introuvable.' using errcode = 'P0002';
  end if;

  if not target_profile.is_active
    or target_profile.auth_user_id is null
    or not target_profile.must_change_password
  then
    raise exception 'Un profil actif en attente lié à Auth est requis.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.profile_deletion_requests deletion_request
    where deletion_request.profile_id = target_profile.id
  ) then
    raise exception 'Une suppression définitive est en cours pour ce profil.'
      using errcode = '55000';
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
    or (
      target_session.idle_timeout_seconds is not null
      and target_session.last_seen_at
        < prepared_at
          - make_interval(secs => target_session.idle_timeout_seconds)
    )
  then
    raise exception 'La session de première connexion a expiré.'
      using errcode = '42501';
  end if;

  credential_operation := target_profile.metadata -> 'credentialOperation';

  if credential_operation is not null then
    if credential_operation ->> 'kind' = 'initial_setup'
      and credential_operation ->> 'state' = 'prepared'
      and lower(btrim(coalesce(
        credential_operation ->> 'contactEmail',
        ''
      ))) = normalized_email
      and coalesce(credential_operation ->> 'id', '') ~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then
      operation_id := (credential_operation ->> 'id')::uuid;

      if coalesce(credential_operation ->> 'sessionId', '')
          <> p_current_session_id::text
      then
        perform set_config(
          'app.allow_profile_credential_operation',
          'on',
          true
        );

        update public.profiles profile
        set metadata = jsonb_set(
          profile.metadata,
          '{credentialOperation,sessionId}',
          to_jsonb(p_current_session_id::text),
          false
        )
        where profile.id = target_profile.id
        returning profile.* into target_profile;
      end if;

      return jsonb_build_object(
        'alreadyPrepared', true,
        'operationId', operation_id,
        'profileVersion', target_profile.version
      );
    end if;

    raise exception 'Une autre mutation des identifiants est déjà en cours.'
      using errcode = '55000';
  end if;

  if target_profile.version <> p_expected_version then
    raise exception 'Le profil a été modifié. Reconnectez-vous puis réessayez.'
      using errcode = '40001';
  end if;

  operation_id := gen_random_uuid();
  perform set_config('app.allow_profile_credential_operation', 'on', true);

  update public.profiles profile
  set
    metadata = coalesce(profile.metadata, '{}'::jsonb) || jsonb_build_object(
      'credentialOperation',
      jsonb_build_object(
        'contactEmail', normalized_email,
        'id', operation_id,
        'kind', 'initial_setup',
        'sessionId', p_current_session_id,
        'startedAt', p_started_at,
        'state', 'prepared'
      )
    ),
    updated_by_profile_id = target_profile.id
  where profile.id = target_profile.id
  returning profile.* into target_profile;

  return jsonb_build_object(
    'alreadyPrepared', false,
    'operationId', operation_id,
    'profileVersion', target_profile.version
  );
end;
$$;

revoke all on function public.begin_initial_account_setup(
  uuid,
  uuid,
  text,
  bigint,
  timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.begin_initial_account_setup(
  uuid,
  uuid,
  text,
  bigint,
  timestamptz
) to service_role;

-- A definite Auth rejection may happen after the database reservation but
-- before Auth stores the correlated marker. Only that marker-free state may be
-- cancelled; an ambiguous network outcome remains resumable instead.
create or replace function public.cancel_initial_account_setup(
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
  auth_operation_id text;
begin
  if p_profile_id is null
    or p_current_session_id is null
    or p_operation_id is null
  then
    raise exception 'Profil, session ou opération d’annulation manquant.'
      using errcode = '22023';
  end if;

  select profile.*
  into target_profile
  from public.profiles profile
  where profile.id = p_profile_id
  for update;

  if target_profile.id is null then
    raise exception 'Profil introuvable.' using errcode = 'P0002';
  end if;

  if target_profile.metadata ->> 'lastInitialSetupOperationId'
      = p_operation_id::text
    and not target_profile.must_change_password
  then
    return jsonb_build_object('alreadyFinalized', true);
  end if;

  if not target_profile.is_active
    or target_profile.auth_user_id is null
    or not target_profile.must_change_password
  then
    raise exception 'Ce profil ne permet plus d’annuler cette configuration.'
      using errcode = '42501';
  end if;

  credential_operation := target_profile.metadata -> 'credentialOperation';

  if credential_operation is null then
    if target_profile.metadata ->> 'lastCancelledInitialSetupOperationId'
        = p_operation_id::text
    then
      return jsonb_build_object('alreadyCancelled', true);
    end if;

    raise exception 'La réservation à annuler est introuvable.'
      using errcode = '42501';
  end if;

  if coalesce(credential_operation ->> 'id', '') <> p_operation_id::text
    or coalesce(credential_operation ->> 'kind', '') <> 'initial_setup'
    or coalesce(credential_operation ->> 'state', '') <> 'prepared'
    or coalesce(credential_operation ->> 'sessionId', '')
      <> p_current_session_id::text
  then
    raise exception 'La réservation à annuler est invalide.'
      using errcode = '42501';
  end if;

  select session_row.*
  into target_session
  from public.application_sessions session_row
  where session_row.id = p_current_session_id
    and session_row.profile_id = target_profile.id
    and session_row.auth_user_id = target_profile.auth_user_id
  for update;

  if target_session.id is null or target_session.auth_context <> 'standard' then
    raise exception 'La session de première connexion est invalide.'
      using errcode = '42501';
  end if;

  select auth_account.raw_user_meta_data ->> 'initialSetupOperationId'
  into auth_operation_id
  from auth.users auth_account
  where auth_account.id = target_profile.auth_user_id
  for update;

  if not found then
    raise exception 'L’identité Auth du profil est introuvable.'
      using errcode = 'P0002';
  end if;

  if coalesce(auth_operation_id, '') <> '' then
    raise exception 'La mutation Auth a déjà commencé et doit être reprise.'
      using errcode = '55000';
  end if;

  perform set_config('app.allow_profile_credential_operation', 'on', true);

  update public.profiles profile
  set
    metadata = (
      coalesce(profile.metadata, '{}'::jsonb)
      - 'credentialOperation'
    ) || jsonb_build_object(
      'lastCancelledInitialSetupOperationId', p_operation_id
    ),
    updated_by_profile_id = target_profile.id
  where profile.id = target_profile.id
  returning profile.* into target_profile;

  return jsonb_build_object(
    'alreadyCancelled', false,
    'profileVersion', target_profile.version
  );
end;
$$;

revoke all on function public.cancel_initial_account_setup(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.cancel_initial_account_setup(uuid, uuid, uuid)
  to service_role;

create or replace function public.begin_provisional_access_key_rotation(
  p_actor_profile_id uuid,
  p_profile_id uuid,
  p_expected_version bigint,
  p_started_at timestamptz,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_profile public.profiles%rowtype;
  target_profile public.profiles%rowtype;
  credential_operation jsonb;
  operation_id uuid := p_operation_id;
begin
  if p_actor_profile_id is null
    or p_profile_id is null
    or p_expected_version is null
    or p_expected_version < 1
    or p_started_at is null
    or p_operation_id is null
  then
    raise exception 'Acteur, profil, version ou date de rotation manquant.'
      using errcode = '22023';
  end if;

  select profile.*
  into actor_profile
  from public.profiles profile
  where profile.id = p_actor_profile_id
  for update;

  if actor_profile.id is null
    or not actor_profile.is_active
    or actor_profile.must_change_password
    or actor_profile.role <> 'admin'::public.app_role
  then
    raise exception 'Un Administrateur actif est requis.'
      using errcode = '42501';
  end if;

  select profile.*
  into target_profile
  from public.profiles profile
  where profile.id = p_profile_id
  for update;

  if target_profile.id is null then
    raise exception 'Profil introuvable.' using errcode = 'P0002';
  end if;

  if not target_profile.is_active
    or target_profile.auth_user_id is null
    or not target_profile.must_change_password
  then
    raise exception 'Seul un compte actif encore en attente peut recevoir une clé.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.profile_deletion_requests deletion_request
    where deletion_request.profile_id = target_profile.id
  ) then
    raise exception 'Une suppression définitive est en cours pour ce profil.'
      using errcode = '55000';
  end if;

  credential_operation := target_profile.metadata -> 'credentialOperation';

  if target_profile.metadata ->> 'lastAccessKeyOperationId'
      = operation_id::text
    and target_profile.metadata ->> 'lastAccessKeyActorProfileId'
      = actor_profile.id::text
    and credential_operation is null
  then
    return jsonb_build_object(
      'alreadyFinalized', true,
      'alreadyPrepared', false,
      'operationId', operation_id,
      'profileVersion', target_profile.version
    );
  end if;

  if credential_operation is not null then
    if credential_operation ->> 'kind' = 'access_key'
      and credential_operation ->> 'state' = 'prepared'
      and credential_operation ->> 'actorProfileId' = actor_profile.id::text
      and credential_operation ->> 'id' = operation_id::text
    then
      return jsonb_build_object(
        'alreadyFinalized', false,
        'alreadyPrepared', true,
        'operationId', operation_id,
        'profileVersion', target_profile.version
      );
    end if;

    raise exception 'Une mutation des identifiants est déjà en cours.'
      using errcode = '55000';
  end if;

  if target_profile.version <> p_expected_version then
    raise exception 'Ce profil a été modifié. Rechargez les données.'
      using errcode = '40001';
  end if;

  perform set_config('app.allow_profile_credential_operation', 'on', true);

  update public.profiles profile
  set
    metadata = coalesce(profile.metadata, '{}'::jsonb) || jsonb_build_object(
      'credentialOperation',
      jsonb_build_object(
        'actorProfileId', actor_profile.id,
        'id', operation_id,
        'kind', 'access_key',
        'startedAt', p_started_at,
        'state', 'prepared'
      )
    ),
    updated_by_profile_id = actor_profile.id
  where profile.id = target_profile.id
  returning profile.* into target_profile;

  return jsonb_build_object(
    'alreadyFinalized', false,
    'alreadyPrepared', false,
    'operationId', operation_id,
    'profileVersion', target_profile.version
  );
end;
$$;

revoke all on function public.begin_provisional_access_key_rotation(
  uuid,
  uuid,
  bigint,
  timestamptz,
  uuid
) from public, anon, authenticated, service_role;
grant execute on function public.begin_provisional_access_key_rotation(
  uuid,
  uuid,
  bigint,
  timestamptz,
  uuid
) to service_role;

-- A replay never performs the Auth write a second time. If the sole writer
-- disappeared before storing its marker, an administrator may release the
-- reservation only after a delay longer than the server execution window.
create or replace function public.cancel_stale_provisional_access_key_rotation(
  p_actor_profile_id uuid,
  p_profile_id uuid,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor_profile public.profiles%rowtype;
  target_profile public.profiles%rowtype;
  credential_operation jsonb;
  auth_operation_id text;
  operation_started_at timestamptz;
begin
  if p_actor_profile_id is null
    or p_profile_id is null
    or p_operation_id is null
  then
    raise exception 'Acteur, profil ou opération de rotation manquant.'
      using errcode = '22023';
  end if;

  select profile.*
  into actor_profile
  from public.profiles profile
  where profile.id = p_actor_profile_id
  for update;

  if actor_profile.id is null
    or not actor_profile.is_active
    or actor_profile.must_change_password
    or actor_profile.role <> 'admin'::public.app_role
  then
    raise exception 'Un Administrateur actif est requis.'
      using errcode = '42501';
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
    raise exception 'Le profil en attente est introuvable.'
      using errcode = '42501';
  end if;

  credential_operation := target_profile.metadata -> 'credentialOperation';

  if credential_operation is null then
    if target_profile.metadata ->> 'lastCancelledAccessKeyOperationId'
        = p_operation_id::text
    then
      return jsonb_build_object('alreadyCancelled', true);
    end if;

    raise exception 'La réservation de rotation est introuvable.'
      using errcode = '42501';
  end if;

  if coalesce(credential_operation ->> 'id', '') <> p_operation_id::text
    or coalesce(credential_operation ->> 'kind', '') <> 'access_key'
    or coalesce(credential_operation ->> 'state', '') <> 'prepared'
    or coalesce(credential_operation ->> 'actorProfileId', '')
      <> actor_profile.id::text
  then
    raise exception 'La réservation de rotation est invalide.'
      using errcode = '42501';
  end if;

  begin
    operation_started_at := nullif(
      credential_operation ->> 'startedAt',
      ''
    )::timestamptz;
  exception when invalid_datetime_format then
    raise exception 'La date de réservation est invalide.'
      using errcode = '22007';
  end;

  if operation_started_at is null
    or operation_started_at > clock_timestamp() - interval '15 minutes'
  then
    raise exception 'La rotation de clé est toujours en cours.'
      using errcode = '55000';
  end if;

  select auth_user.raw_app_meta_data ->> 'provisionalCredentialOperationId'
  into auth_operation_id
  from auth.users auth_user
  where auth_user.id = target_profile.auth_user_id
  for update;

  if not found then
    raise exception 'L’identité Auth du profil est introuvable.'
      using errcode = 'P0002';
  end if;

  if coalesce(auth_operation_id, '') <> '' then
    raise exception 'La mutation Auth a commencé et doit être finalisée.'
      using errcode = '55000';
  end if;

  perform set_config('app.allow_profile_credential_operation', 'on', true);

  update public.profiles profile
  set
    metadata = (
      coalesce(profile.metadata, '{}'::jsonb)
      - 'credentialOperation'
    ) || jsonb_build_object(
      'lastCancelledAccessKeyOperationId', p_operation_id
    ),
    updated_by_profile_id = actor_profile.id
  where profile.id = target_profile.id;

  return jsonb_build_object('alreadyCancelled', false);
end;
$$;

revoke all on function public.cancel_stale_provisional_access_key_rotation(
  uuid,
  uuid,
  uuid
) from public, anon, authenticated, service_role;
grant execute on function public.cancel_stale_provisional_access_key_rotation(
  uuid,
  uuid,
  uuid
) to service_role;

create or replace function public.complete_initial_account_setup(
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
  already_finalized boolean := false;
  confirmation_pending boolean;
  completed_at timestamptz := clock_timestamp();
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

  if target_profile.id is null then
    raise exception 'Profil introuvable.' using errcode = 'P0002';
  end if;

  if not target_profile.is_active or target_profile.auth_user_id is null then
    raise exception 'Un profil actif lié à Auth est requis.'
      using errcode = '42501';
  end if;

  already_finalized :=
    not target_profile.must_change_password
    and target_profile.metadata ->> 'lastInitialSetupOperationId'
      = p_operation_id::text;

  if already_finalized then
    return jsonb_build_object(
      'alreadyFinalized', true,
      'contactEmail', target_profile.metadata ->> 'contactEmail',
      'emailConfirmationPending',
        coalesce(
          target_profile.metadata ->> 'pendingEmailPurpose' = 'activation',
          false
        ),
      'mustChangePassword', false,
      'profileId', target_profile.id
    );
  end if;

  if not target_profile.must_change_password then
    raise exception 'Une autre opération a déjà activé ce compte.'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.profile_deletion_requests deletion_request
    where deletion_request.profile_id = target_profile.id
  ) then
    raise exception 'Une suppression définitive est en cours pour ce profil.'
      using errcode = '55000';
  end if;

  credential_operation := target_profile.metadata -> 'credentialOperation';
  normalized_email := lower(btrim(coalesce(
    credential_operation ->> 'contactEmail',
    ''
  )));

  if credential_operation is null
    or coalesce(credential_operation ->> 'id', '') <> p_operation_id::text
    or coalesce(credential_operation ->> 'kind', '') <> 'initial_setup'
    or coalesce(credential_operation ->> 'state', '') <> 'prepared'
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
    or (
      target_session.idle_timeout_seconds is not null
      and target_session.last_seen_at
        < completed_at
          - make_interval(secs => target_session.idle_timeout_seconds)
    )
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

  if auth_confirmed_email = normalized_email then
    if auth_pending_email <> '' then
      raise exception 'Une autre adresse Auth est encore en attente.'
        using errcode = '42501';
    end if;

    confirmation_pending := false;
  elsif auth_pending_email = normalized_email then
    confirmation_pending := true;
  else
    raise exception 'La demande Auth ne correspond pas à l’adresse réservée.'
      using errcode = '42501';
  end if;

  update auth.users auth_account
  set
    raw_app_meta_data = jsonb_set(
      coalesce(auth_account.raw_app_meta_data, '{}'::jsonb),
      '{pending_activation}',
      'false'::jsonb,
      true
    ) - 'provisionalCredentialOperationId',
    raw_user_meta_data = case
      when auth_account.raw_user_meta_data
          ->> 'initialSetupOperationId' = p_operation_id::text
      then coalesce(
        auth_account.raw_user_meta_data,
        '{}'::jsonb
      ) - 'emailTemplatePurpose' - 'initialSetupOperationId'
      when coalesce(
        auth_account.raw_user_meta_data ->> 'initialSetupOperationId',
        ''
      ) = ''
        and auth_account.raw_user_meta_data
          ->> 'emailTemplatePurpose' = 'activation'
      then coalesce(
        auth_account.raw_user_meta_data,
        '{}'::jsonb
      ) - 'emailTemplatePurpose'
      else coalesce(auth_account.raw_user_meta_data, '{}'::jsonb)
    end,
    updated_at = completed_at
  where auth_account.id = target_profile.auth_user_id;

  update public.application_sessions session_row
  set
    revoked_at = coalesce(session_row.revoked_at, completed_at),
    revocation_reason = coalesce(
      session_row.revocation_reason,
      'initial_account_setup_completed'
    )
  where session_row.profile_id = target_profile.id
    and session_row.revoked_at is null;

  delete from auth.sessions auth_session
  where auth_session.user_id = target_profile.auth_user_id;

  perform set_config('app.allow_profile_credential_operation', 'on', true);

  update public.profiles profile
  set
    metadata = case
      when confirmation_pending then
        (
          coalesce(profile.metadata, '{}'::jsonb)
          - 'credentialOperation'
          - 'contactEmail'
        ) || jsonb_build_object(
          'lastInitialSetupOperationId', p_operation_id,
          'pendingContactEmail', normalized_email,
          'pendingEmailPurpose', 'activation',
          'pendingEmailRequestedAt',
            credential_operation ->> 'startedAt'
        )
      else
        (
          coalesce(profile.metadata, '{}'::jsonb)
          - 'credentialOperation'
          - 'pendingContactEmail'
          - 'pendingEmailPurpose'
          - 'pendingEmailRequestedAt'
        ) || jsonb_build_object(
          'contactEmail', normalized_email,
          'lastInitialSetupOperationId', p_operation_id
        )
    end,
    must_change_password = false,
    updated_at = completed_at,
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
    'Première connexion finalisée',
    'Compte utilisateur',
    target_profile.login_id::text,
    target_profile.id,
    jsonb_build_object(
      'kind', 'initial_account_setup',
      'operationId', p_operation_id,
      'profileId', target_profile.id,
      'emailConfirmationPending', confirmation_pending
    )
  );

  return jsonb_build_object(
    'alreadyFinalized', false,
    'contactEmail', case
      when confirmation_pending then null
      else normalized_email
    end,
    'emailConfirmationPending', confirmation_pending,
    'mustChangePassword', false,
    'profileId', target_profile.id,
    'revokedSessionId', target_session.id
  );
end;
$$;

revoke all on function public.complete_initial_account_setup(
  uuid,
  uuid,
  uuid
) from public, anon, authenticated, service_role;
grant execute on function public.complete_initial_account_setup(
  uuid,
  uuid,
  uuid
) to service_role;

-- Repairs metadata left behind only when an older API response was lost after
-- the business transaction committed. The exact completed operation is
-- required, and JSONB keys are changed atomically while preserving all others.
create or replace function public.repair_completed_initial_setup_auth_metadata(
  p_profile_id uuid,
  p_operation_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_profile public.profiles%rowtype;
  auth_user_id uuid;
begin
  if p_profile_id is null or p_operation_id is null then
    raise exception 'Profil ou opération de réparation manquant.'
      using errcode = '22023';
  end if;

  select profile.*
  into target_profile
  from public.profiles profile
  where profile.id = p_profile_id
  for update;

  if target_profile.id is null
    or not target_profile.is_active
    or target_profile.must_change_password
    or target_profile.auth_user_id is null
    or coalesce(
      target_profile.metadata ->> 'lastInitialSetupOperationId',
      ''
    ) <> p_operation_id::text
  then
    raise exception 'La configuration terminée ne correspond pas à ce profil.'
      using errcode = '42501';
  end if;

  select auth_account.id
  into auth_user_id
  from auth.users auth_account
  where auth_account.id = target_profile.auth_user_id
  for update;

  if auth_user_id is null then
    raise exception 'L’identité Auth du profil est introuvable.'
      using errcode = 'P0002';
  end if;

  update auth.users auth_account
  set
    raw_app_meta_data = jsonb_set(
      coalesce(auth_account.raw_app_meta_data, '{}'::jsonb),
      '{pending_activation}',
      'false'::jsonb,
      true
    ) - 'provisionalCredentialOperationId',
    raw_user_meta_data = case
      when auth_account.raw_user_meta_data
          ->> 'initialSetupOperationId' = p_operation_id::text
      then coalesce(
        auth_account.raw_user_meta_data,
        '{}'::jsonb
      ) - 'emailTemplatePurpose' - 'initialSetupOperationId'
      when coalesce(
        auth_account.raw_user_meta_data ->> 'initialSetupOperationId',
        ''
      ) = ''
        and auth_account.raw_user_meta_data
          ->> 'emailTemplatePurpose' = 'activation'
      then coalesce(
        auth_account.raw_user_meta_data,
        '{}'::jsonb
      ) - 'emailTemplatePurpose'
      else coalesce(auth_account.raw_user_meta_data, '{}'::jsonb)
    end,
    updated_at = clock_timestamp()
  where auth_account.id = target_profile.auth_user_id;

  return true;
end;
$$;

revoke all on function public.repair_completed_initial_setup_auth_metadata(
  uuid,
  uuid
) from public, anon, authenticated, service_role;
grant execute on function public.repair_completed_initial_setup_auth_metadata(
  uuid,
  uuid
) to service_role;

create or replace function public.complete_provisional_access_key_rotation(
  p_actor_profile_id uuid,
  p_profile_id uuid,
  p_operation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor_profile public.profiles%rowtype;
  target_profile public.profiles%rowtype;
  credential_operation jsonb;
  auth_operation_id text;
  completed_at timestamptz := clock_timestamp();
begin
  if p_actor_profile_id is null
    or p_profile_id is null
    or p_operation_id is null
  then
    raise exception 'Acteur, profil ou opération de rotation manquant.'
      using errcode = '22023';
  end if;

  select profile.*
  into actor_profile
  from public.profiles profile
  where profile.id = p_actor_profile_id
  for update;

  if actor_profile.id is null
    or not actor_profile.is_active
    or actor_profile.must_change_password
    or actor_profile.role <> 'admin'::public.app_role
  then
    raise exception 'Un Administrateur actif est requis.'
      using errcode = '42501';
  end if;

  select profile.*
  into target_profile
  from public.profiles profile
  where profile.id = p_profile_id
  for update;

  if target_profile.id is null then
    raise exception 'Profil introuvable.' using errcode = 'P0002';
  end if;

  if target_profile.metadata ->> 'lastAccessKeyOperationId'
      = p_operation_id::text
    and target_profile.metadata ->> 'lastAccessKeyActorProfileId'
      = actor_profile.id::text
    and target_profile.metadata -> 'credentialOperation' is null
  then
    if not target_profile.is_active
      or target_profile.auth_user_id is null
      or not target_profile.must_change_password
    then
      raise exception 'Le compte ne permet plus la rotation de sa clé provisoire.'
        using errcode = '42501';
    end if;

    select auth_user.raw_app_meta_data
      ->> 'provisionalCredentialOperationId'
    into auth_operation_id
    from auth.users auth_user
    where auth_user.id = target_profile.auth_user_id
    for update;

    if auth_operation_id is not null
      and auth_operation_id <> p_operation_id::text
    then
      raise exception 'Une autre rotation Auth est déjà en cours.'
        using errcode = '55000';
    end if;

    update auth.users auth_user
    set
      raw_app_meta_data = jsonb_set(
        coalesce(auth_user.raw_app_meta_data, '{}'::jsonb),
        '{pending_activation}',
        'true'::jsonb,
        true
      ) - 'provisionalCredentialOperationId',
      raw_user_meta_data = coalesce(
        auth_user.raw_user_meta_data,
        '{}'::jsonb
      ) - 'emailTemplatePurpose' - 'initialSetupOperationId',
      updated_at = completed_at
    where auth_user.id = target_profile.auth_user_id;

    update public.application_sessions session_row
    set
      revoked_at = coalesce(session_row.revoked_at, completed_at),
      revocation_reason = coalesce(
        session_row.revocation_reason,
        'provisional_access_key_rotation_reconciled'
      )
    where session_row.profile_id = target_profile.id
      and session_row.revoked_at is null;

    delete from auth.sessions auth_session
    where auth_session.user_id = target_profile.auth_user_id;

    return jsonb_build_object(
      'alreadyFinalized', true,
      'profileId', target_profile.id,
      'profileVersion', target_profile.version
    );
  end if;

  credential_operation := target_profile.metadata -> 'credentialOperation';

  if credential_operation is null
    or coalesce(credential_operation ->> 'id', '') <> p_operation_id::text
    or coalesce(credential_operation ->> 'kind', '') <> 'access_key'
    or coalesce(credential_operation ->> 'state', '') <> 'prepared'
    or coalesce(credential_operation ->> 'actorProfileId', '')
      <> actor_profile.id::text
  then
    raise exception 'La réservation de rotation de clé est invalide.'
      using errcode = '42501';
  end if;

  if not target_profile.is_active
    or target_profile.auth_user_id is null
    or not target_profile.must_change_password
  then
    raise exception 'Le compte ne permet plus la rotation de sa clé provisoire.'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.profile_deletion_requests deletion_request
    where deletion_request.profile_id = target_profile.id
  ) then
    raise exception 'Une suppression définitive est en cours pour ce profil.'
      using errcode = '55000';
  end if;

  select auth_user.raw_app_meta_data ->> 'provisionalCredentialOperationId'
  into auth_operation_id
  from auth.users auth_user
  where auth_user.id = target_profile.auth_user_id
  for update;

  if auth_operation_id is null or auth_operation_id <> p_operation_id::text then
    raise exception 'La rotation Auth ne correspond pas à l’opération réservée.'
      using errcode = '42501';
  end if;

  update auth.users auth_user
  set
    raw_app_meta_data = jsonb_set(
      coalesce(auth_user.raw_app_meta_data, '{}'::jsonb),
      '{pending_activation}',
      'true'::jsonb,
      true
    ) - 'provisionalCredentialOperationId',
    raw_user_meta_data = coalesce(
      auth_user.raw_user_meta_data,
      '{}'::jsonb
    ) - 'emailTemplatePurpose' - 'initialSetupOperationId',
    updated_at = completed_at
  where auth_user.id = target_profile.auth_user_id;

  update public.application_sessions session_row
  set
    revoked_at = coalesce(session_row.revoked_at, completed_at),
    revocation_reason = coalesce(
      session_row.revocation_reason,
      'provisional_access_key_rotated'
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
    ) || jsonb_build_object(
      'lastAccessKeyActorProfileId', actor_profile.id,
      'lastAccessKeyOperationId', p_operation_id
    ),
    updated_by_profile_id = actor_profile.id
  where profile.id = target_profile.id
  returning profile.* into target_profile;

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
    actor_profile.id,
    target_profile.id,
    actor_profile.role,
    trim(concat_ws(
      ' ',
      actor_profile.first_name,
      actor_profile.last_name
    )),
    'Clé d’accès provisoire régénérée',
    'Compte utilisateur',
    trim(concat_ws(
      ' ',
      target_profile.first_name,
      target_profile.last_name
    )),
    actor_profile.id,
    jsonb_build_object(
      'kind', 'account_lifecycle',
      'operationId', p_operation_id,
      'targetAuthUserId', target_profile.auth_user_id,
      'targetProfileId', target_profile.id
    )
  );

  return jsonb_build_object(
    'alreadyFinalized', false,
    'profileId', target_profile.id,
    'profileVersion', target_profile.version
  );
end;
$$;

revoke all on function public.complete_provisional_access_key_rotation(
  uuid,
  uuid,
  uuid
) from public, anon, authenticated, service_role;
grant execute on function public.complete_provisional_access_key_rotation(
  uuid,
  uuid,
  uuid
) to service_role;

-- A recovery application session may change credentials, but it must never be
-- accepted as a business-data session. All role helpers inherit this guard.
create or replace function public.current_profile_id()
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  session_claim text := auth.jwt() ->> 'app_session_id';
  claimed_session_id uuid;
  resolved_profile_id uuid;
begin
  if session_claim is null
    or session_claim !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  then
    return null;
  end if;

  claimed_session_id := session_claim::uuid;

  select profile.id
  into resolved_profile_id
  from public.application_sessions session_row
  join public.profiles profile
    on profile.id = session_row.profile_id
   and profile.auth_user_id = session_row.auth_user_id
  where session_row.id = claimed_session_id
    and session_row.auth_user_id = auth.uid()
    and session_row.auth_context = 'standard'
    and session_row.revoked_at is null
    and (
      session_row.idle_timeout_seconds is null
      or session_row.last_seen_at
        >= clock_timestamp()
          - make_interval(secs => session_row.idle_timeout_seconds)
    )
    and profile.is_active
    and not profile.must_change_password
  limit 1;

  return resolved_profile_id;
end;
$$;

-- The historical helper remains useful after password recovery, but it may no
-- longer activate a pending account from a raw Auth token. First activation is
-- reserved to the correlated server protocol above.
create or replace function public.complete_password_setup(p_contact_email text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_email text := lower(trim(coalesce(p_contact_email, '')));
  actor_profile public.profiles%rowtype;
  auth_email text;
  auth_pending_email text;
  pending_activation boolean;
begin
  if auth.uid() is null or public.current_profile_id() is null then
    raise exception 'A protected standard session is required'
      using errcode = '42501';
  end if;

  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'A valid contact email is required' using errcode = '22023';
  end if;

  select profile.*
  into actor_profile
  from public.profiles profile
  where profile.id = public.current_profile_id()
    and profile.auth_user_id = auth.uid()
    and profile.is_active
  for update;

  if actor_profile.id is null or actor_profile.must_change_password then
    raise exception 'First activation requires the protected setup protocol.'
      using errcode = '42501';
  end if;

  select
    lower(trim(coalesce(account.email, ''))),
    lower(trim(coalesce(account.email_change, ''))),
    lower(coalesce(account.raw_app_meta_data ->> 'pending_activation', 'false'))
      = 'true'
  into auth_email, auth_pending_email, pending_activation
  from auth.users account
  where account.id = actor_profile.auth_user_id
  for update;

  if auth_email is null
    or auth_email <> normalized_email
    or auth_pending_email <> ''
    or pending_activation
  then
    raise exception 'The confirmed Auth email is required.'
      using errcode = '42501';
  end if;

  update public.profiles profile
  set
    metadata = coalesce(profile.metadata, '{}'::jsonb) || jsonb_build_object(
      'contactEmail', normalized_email
    ),
    updated_by_profile_id = actor_profile.id
  where profile.id = actor_profile.id;
end;
$$;

revoke all on function public.complete_password_setup(text)
  from public, anon, authenticated, service_role;
grant execute on function public.complete_password_setup(text)
  to authenticated;

-- Existing accounts may still confirm an activation link after their business
-- access has already been opened. In that state the callback promotes only the
-- exact pending address; it does not perform account activation a second time.
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
  pending_email text;
  pending_purpose text;
  current_contact_email text;
  saved_must_change_password boolean;
  confirms_email_after_activation boolean := false;
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

  if target_profile.id is null then
    raise exception 'Profile not found' using errcode = 'P0002';
  end if;

  if not target_profile.is_active then
    raise exception 'Inactive profiles cannot confirm an email address'
      using errcode = '42501';
  end if;

  if target_profile.auth_user_id is null then
    raise exception 'The profile has no Auth identity'
      using errcode = '42501';
  end if;

  select
    lower(trim(coalesce(account.email, ''))),
    lower(trim(coalesce(account.email_change, '')))
  into auth_email, auth_pending_email
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

  if pending_email <> '' and pending_email <> normalized_email then
    raise exception 'The confirmed email does not match the pending request'
      using errcode = '42501';
  end if;

  if pending_purpose <> '' and pending_purpose <> normalized_purpose then
    raise exception 'The confirmation purpose does not match the pending request'
      using errcode = '42501';
  end if;

  confirms_email_after_activation :=
    normalized_purpose = 'activation'
    and not target_profile.must_change_password
    and pending_email = normalized_email
    and pending_purpose = 'activation';

  if normalized_purpose = 'activation' and not target_profile.must_change_password then
    if pending_email = '' and current_contact_email = normalized_email then
      return jsonb_build_object(
        'alreadyFinalized', true,
        'contactEmail', normalized_email,
        'mustChangePassword', false
      );
    end if;

    if not confirms_email_after_activation then
      raise exception 'The account is already activated'
        using errcode = '42501';
    end if;
  end if;

  if normalized_purpose = 'activation'
    and target_profile.must_change_password
    and (
      pending_email = ''
      or pending_email <> normalized_email
      or pending_purpose <> 'activation'
      or coalesce(
        target_profile.metadata ->> 'pendingEmailRequestedAt',
        ''
      ) = ''
      or target_profile.metadata -> 'credentialOperation' is not null
    )
  then
    raise exception 'First activation requires the exact pending email request'
      using errcode = '42501';
  end if;

  if normalized_purpose = 'change' and target_profile.must_change_password then
    raise exception 'First account activation is still required'
      using errcode = '42501';
  end if;

  if normalized_purpose = 'change'
    and pending_email = ''
    and current_contact_email = normalized_email then
    return jsonb_build_object(
      'alreadyFinalized', true,
      'contactEmail', normalized_email,
      'mustChangePassword', target_profile.must_change_password
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
    updated_at = clock_timestamp()
  where account.id = target_profile.auth_user_id;

  saved_must_change_password := case
    when normalized_purpose = 'activation' then false
    else target_profile.must_change_password
  end;

  update public.profiles
  set
    metadata = (
      coalesce(metadata, '{}'::jsonb)
      - 'pendingContactEmail'
      - 'pendingEmailPurpose'
      - 'pendingEmailRequestedAt'
    ) || jsonb_build_object('contactEmail', normalized_email),
    must_change_password = saved_must_change_password,
    updated_at = now(),
    updated_by_profile_id = target_profile.id
  where id = target_profile.id;

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
    target_profile.id,
    target_profile.role,
    trim(concat_ws(
      ' ',
      target_profile.first_name,
      target_profile.last_name
    )),
    case
      when confirms_email_after_activation
        then 'Adresse e-mail de récupération confirmée'
      when normalized_purpose = 'activation'
        then 'Première connexion finalisée'
      else 'Adresse e-mail modifiée'
    end,
    'Compte utilisateur',
    target_profile.login_id::text,
    target_profile.id,
    jsonb_build_object(
      'kind', 'confirmed_email_lifecycle',
      'purpose', normalized_purpose,
      'profileId', target_profile.id,
      'accountAlreadyActive', confirms_email_after_activation
    )
  );

  return jsonb_build_object(
    'alreadyFinalized', false,
    'contactEmail', normalized_email,
    'mustChangePassword', saved_must_change_password
  );
end;
$$;

revoke all on function public.finalize_confirmed_email(uuid, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.finalize_confirmed_email(uuid, text, text)
  to service_role;
