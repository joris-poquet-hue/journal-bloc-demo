import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import accessKeyModule from '../src/accessKey.cjs';

const {
  ACCESS_KEY_ALPHABET,
  deriveAccessKey,
  generateAccessKey,
  isAccessKey,
  toPendingAuthPassword,
} = accessKeyModule;

async function readProjectFile(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
}

function sourceSection(source, startMarker, endMarker) {
  const startIndex = source.indexOf(startMarker);
  assert.notEqual(startIndex, -1, `Section introuvable: ${startMarker}`);

  const endIndex = source.indexOf(endMarker, startIndex + startMarker.length);
  assert.notEqual(endIndex, -1, `Fin de section introuvable: ${endMarker}`);

  return source.slice(startIndex, endIndex);
}

test('la clé d’accès respecte exactement le format non ambigu XXXX-XXXX', () => {
  const generatedKeys = Array.from({ length: 250 }, generateAccessKey);

  generatedKeys.forEach((accessKey) => {
    assert.equal(isAccessKey(accessKey), true);
    assert.match(accessKey, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/);
    assert.equal(accessKey.replace('-', '').length, 8);
    assert.doesNotMatch(accessKey, /[O0I1L]/);
  });

  assert.equal(ACCESS_KEY_ALPHABET.includes('O'), false);
  assert.equal(ACCESS_KEY_ALPHABET.includes('0'), false);
  assert.equal(ACCESS_KEY_ALPHABET.includes('I'), false);
  assert.equal(ACCESS_KEY_ALPHABET.includes('1'), false);
  assert.equal(ACCESS_KEY_ALPHABET.includes('L'), false);
});

test('la clé visible reste simple tandis que le secret Auth satisfait la politique Supabase', () => {
  const accessKey = 'ABCD-2345';
  const authPassword = toPendingAuthPassword(accessKey);

  assert.equal(authPassword, 'AABCD-2345a1!');
  assert.match(authPassword, /[a-z]/);
  assert.match(authPassword, /[A-Z]/);
  assert.match(authPassword, /\d/);
  assert.match(authPassword, /[^A-Za-z0-9]/);
  assert.throws(() => toPendingAuthPassword('clé-invalide'));
});

test('la clé de rotation dérivée par HMAC est déterministe pour une même opération', () => {
  const operationId = '8b638d44-2018-4a90-86d8-e8ba5fe29f55';
  const secret = 'secret-de-rotation-avec-au-moins-32-octets';
  const accessKey = deriveAccessKey(operationId, secret);

  assert.equal(accessKey, deriveAccessKey(operationId, secret));
  assert.equal(isAccessKey(accessKey), true);
  assert.notEqual(
    accessKey,
    deriveAccessKey('57d90f0f-6607-4413-9212-d174fbecfd3e', secret)
  );
  assert.throws(() => deriveAccessKey(operationId, 'trop-court'));
});

test('la création génère la clé uniquement côté serveur et ne la stocke pas dans le profil', async () => {
  const [adminApi, adminScreen, accountService] = await Promise.all([
    readProjectFile('api/admin-users.js'),
    readProjectFile('src/screens/AdminScreen.tsx'),
    readProjectFile('src/services/adminAccountService.ts'),
  ]);

  assert.match(adminApi, /const accessKey = generateAccessKey\(\)/);
  assert.match(adminApi, /password: toPendingAuthPassword\(accessKey\)/);
  assert.match(adminApi, /app_metadata:[\s\S]*pending_activation: true/);
  assert.match(adminApi, /metadata: \{\}/);
  assert.doesNotMatch(adminApi, /key_hash|accessKey:\s*accessKey[\s\S]*metadata/);
  assert.doesNotMatch(adminScreen, /generateTemporaryPassword/);
  assert.doesNotMatch(adminScreen, /Mot de passe temporaire/);
  assert.match(adminScreen, /Clé d’accès générée automatiquement/);
  assert.match(accountService, /accessKey\?: string/);
});

test('la première connexion reste bloquée jusqu’à la confirmation e-mail exacte', async () => {
  const [passwordApi, loginApi, setupMigration, blockingMigration] =
    await Promise.all([
    readProjectFile('api/auth-password.js'),
    readProjectFile('api/auth-login.js'),
    readProjectFile(
      'supabase/migrations/202609010002_immediate_first_login.sql'
    ),
    readProjectFile(
      'supabase/migrations/202609080001_require_email_confirmation_remove_operating_time.sql'
    ),
  ]);

  const completeSetupBranch = sourceSection(
    passwordApi,
    "    if (action === 'complete-setup') {\n      const purpose = 'activation';",
    "    if (action === 'change-email') {"
  );
  const operationGuard = sourceSection(
    setupMigration,
    'create or replace function public.protect_profile_credential_operation()',
    'create or replace function public.begin_initial_account_setup('
  );
  const beginSetupFunction = sourceSection(
    setupMigration,
    'create or replace function public.begin_initial_account_setup(',
    'create or replace function public.begin_provisional_access_key_rotation('
  );
  const setupFunction = sourceSection(
    setupMigration,
    'create or replace function public.complete_initial_account_setup(',
    '-- Repairs metadata left behind only when an older API response was lost'
  );
  const repairSetupAuthMetadataFunction = sourceSection(
    setupMigration,
    'create or replace function public.repair_completed_initial_setup_auth_metadata(',
    'create or replace function public.complete_provisional_access_key_rotation('
  );
  const awaitingFunction = sourceSection(
    blockingMigration,
    'create or replace function public.await_initial_account_email_confirmation(',
    'create or replace function public.finalize_confirmed_email('
  );
  const reservationIndex = completeSetupBranch.indexOf(
    "'rpc/begin_initial_account_setup'"
  );
  const authMutationIndex = completeSetupBranch.indexOf(
    'await requestConfirmedEmailChange'
  );
  const passwordProofIndex = completeSetupBranch.indexOf(
    'payload: verifiedPasswordPayload'
  );
  const awaitingIndex = completeSetupBranch.indexOf(
    "'rpc/await_initial_account_email_confirmation'"
  );

  assert.ok(reservationIndex >= 0);
  assert.ok(authMutationIndex > reservationIndex);
  assert.ok(passwordProofIndex > authMutationIndex);
  assert.ok(awaitingIndex > passwordProofIndex);

  assert.doesNotMatch(completeSetupBranch, /confirmContactEmail/);
  assert.match(completeSetupBranch, /requestConfirmedEmailChange/);
  assert.match(completeSetupBranch, /emailTemplatePurpose: purpose/);
  assert.match(completeSetupBranch, /initialSetupOperationId: operationId/);
  assert.doesNotMatch(completeSetupBranch, /email_confirm: true/);
  assert.doesNotMatch(completeSetupBranch, /pending_activation:\s*true/);
  assert.match(
    completeSetupBranch,
    /current_password: verifiedAuthPassword,[\s\S]*initialSetupOperationId: operationId[\s\S]*email: contactEmail[\s\S]*password/
  );
  assert.match(
    passwordApi,
    /verifiedAuthPassword = passwordAlreadyRotated[\s\S]*\? password[\s\S]*: authenticationPassword/
  );
  assert.doesNotMatch(completeSetupBranch, /current_password:\s*currentPassword/);
  assert.match(
    completeSetupBranch,
    /currentAuthUser\?\.user_metadata\?\.initialSetupOperationId === operationId/
  );
  assert.match(
    completeSetupBranch,
    /requestPasswordGrant\([\s\S]*currentAuthUser\.email,[\s\S]*password[\s\S]*verifiedPasswordPayload\?\.access_token/
  );
  assert.match(
    completeSetupBranch,
    /rpc\/await_initial_account_email_confirmation[\s\S]*p_current_session_id: identity\.session\.session_id,[\s\S]*p_operation_id: operationId/
  );
  assert.match(completeSetupBranch, /clearApplicationSessionCookie\(response\)/);
  assert.match(completeSetupBranch, /pendingEmailConfirmation: true/);
  assert.match(completeSetupBranch, /requiresLogin: true/);
  assert.doesNotMatch(completeSetupBranch, /createApplicationSession/);
  assert.doesNotMatch(completeSetupBranch, /setApplicationSessionCookie/);

  assert.match(
    operationGuard,
    /old\.metadata -> 'credentialOperation'[\s\S]*current_setting\('app\.allow_profile_credential_operation'/
  );
  assert.match(
    operationGuard,
    /revoke all on function public\.protect_profile_credential_operation\(\)[\s\S]*from public, anon, authenticated, service_role/
  );
  assert.match(
    beginSetupFunction,
    /target_profile\.version <> p_expected_version/
  );
  assert.match(
    beginSetupFunction,
    /credential_operation ->> 'kind' = 'initial_setup'[\s\S]*credential_operation ->> 'state' = 'prepared'/
  );
  assert.match(
    beginSetupFunction,
    /'credentialOperation',[\s\S]*'contactEmail', normalized_email[\s\S]*'id', operation_id[\s\S]*'kind', 'initial_setup'[\s\S]*'sessionId', p_current_session_id[\s\S]*'state', 'prepared'/
  );
  assert.match(
    beginSetupFunction,
    /grant execute on function public\.begin_initial_account_setup\([\s\S]*to service_role/
  );
  assert.match(
    setupFunction,
    /lastInitialSetupOperationId'[\s\S]*= p_operation_id::text[\s\S]*'alreadyFinalized', true/
  );
  assert.match(
    setupFunction,
    /credential_operation ->> 'id'[\s\S]*p_operation_id::text[\s\S]*credential_operation ->> 'kind'[\s\S]*'initial_setup'[\s\S]*credential_operation ->> 'state'[\s\S]*'prepared'/
  );
  assert.match(
    setupFunction,
    /raw_user_meta_data ->> 'initialSetupOperationId'[\s\S]*auth_operation_id <> p_operation_id::text/
  );
  assert.match(
    setupFunction,
    /if auth_confirmed_email = normalized_email[\s\S]*auth_pending_email <> ''[\s\S]*confirmation_pending := false[\s\S]*elsif auth_pending_email = normalized_email[\s\S]*confirmation_pending := true/
  );
  assert.match(
    setupFunction,
    /update auth\.users auth_account[\s\S]*'\{pending_activation\}'[\s\S]*'false'::jsonb[\s\S]*- 'provisionalCredentialOperationId'[\s\S]*- 'emailTemplatePurpose' - 'initialSetupOperationId'/
  );
  assert.match(
    setupFunction,
    /update public\.application_sessions[\s\S]*revocation_reason[\s\S]*initial_account_setup_completed/
  );
  assert.match(
    setupFunction,
    /delete from auth\.sessions[\s\S]*target_profile\.auth_user_id/
  );
  assert.match(
    setupFunction,
    /when confirmation_pending then[\s\S]*lastInitialSetupOperationId[\s\S]*pendingContactEmail[\s\S]*else[\s\S]*contactEmail[\s\S]*lastInitialSetupOperationId[\s\S]*must_change_password = false/
  );
  assert.match(setupFunction, /Première connexion finalisée/);
  assert.match(
    setupFunction,
    /revoke all on function public\.complete_initial_account_setup\([\s\S]*from public, anon, authenticated, service_role/
  );
  assert.match(
    setupFunction,
    /grant execute on function public\.complete_initial_account_setup\([\s\S]*to service_role/
  );
  assert.doesNotMatch(
    setupFunction,
    /grant execute on function public\.complete_initial_account_setup\([\s\S]*to (?:anon|authenticated)/
  );
  assert.match(
    repairSetupAuthMetadataFunction,
    /lastInitialSetupOperationId'[\s\S]*<> p_operation_id::text[\s\S]*update auth\.users auth_account/
  );
  assert.match(
    repairSetupAuthMetadataFunction,
    /'\{pending_activation\}'[\s\S]*'false'::jsonb[\s\S]*- 'provisionalCredentialOperationId'[\s\S]*- 'emailTemplatePurpose' - 'initialSetupOperationId'/
  );
  assert.match(
    repairSetupAuthMetadataFunction,
    /grant execute on function public\.repair_completed_initial_setup_auth_metadata\([\s\S]*to service_role/
  );
  assert.match(awaitingFunction, /'awaiting_email'/);
  assert.match(
    blockingMigration,
    /revoke all on function public\.complete_initial_account_setup\([\s\S]*from public, anon, authenticated, service_role/
  );
  assert.match(awaitingFunction, /'pendingContactEmail', normalized_email/);
  assert.match(awaitingFunction, /'pendingEmailPurpose', 'activation'/);
  assert.match(
    awaitingFunction,
    /update public\.application_sessions[\s\S]*initial_account_email_confirmation_required/
  );
  assert.match(
    awaitingFunction,
    /delete from auth\.sessions[\s\S]*target_profile\.auth_user_id/
  );
  assert.match(
    awaitingFunction,
    /grant execute on function public\.await_initial_account_email_confirmation\([\s\S]*to service_role/
  );

  assert.match(loginApi, /const usedProvisionalAccessKey =/);
  assert.match(
    loginApi,
    /const hasResidualSetupAuthMetadata = Boolean[\s\S]*rpc\/repair_completed_initial_setup_auth_metadata[\s\S]*p_operation_id: lastInitialSetupOperationId/
  );
  assert.doesNotMatch(loginApi, /authAdminRequest/);
  assert.match(
    loginApi,
    /const confirmedInitialSetup = Boolean\([\s\S]*authEmail === pendingEmail[\s\S]*!authPendingEmail/
  );
  assert.match(
    loginApi,
    /if \(confirmedInitialSetup\)[\s\S]*rpc\/finalize_confirmed_email/
  );
  assert.match(
    loginApi,
    /else if \(!usedProvisionalAccessKey && profile\.must_change_password\)[\s\S]*sendJson\(response, 403[\s\S]*Confirme d’abord ton adresse e-mail/
  );
  assert.match(loginApi, /const refreshedProfile = await getProfileByLoginId\(loginId\)/);
  assert.match(
    loginApi,
    /usedProvisionalAccessKey && !refreshedProfile\.must_change_password/
  );
  assert.match(loginApi, /provisional_key_invalidated_during_login/);
  assert.match(loginApi, /revokeApplicationSession/);
});

test('le client ferme la session jusqu’à l’activation par e-mail', async () => {
  const [supabaseClient, appContext, loginScreen] =
    await Promise.all([
      readProjectFile('src/services/supabaseClient.ts'),
      readProjectFile('src/context/AppContext.tsx'),
      readProjectFile('src/screens/LoginScreen.tsx'),
    ]);

  const updatePasswordClient = sourceSection(
    supabaseClient,
    'export async function updateSupabasePassword(',
    'export async function requestSupabaseEmailChange('
  );
  const forcedSetupBranch = sourceSection(
    appContext,
    "      if (challenge.reason === 'forced') {",
    '      } else {\n        await updateSupabasePassword'
  );

  assert.match(updatePasswordClient, /\.\.\.getNativeApplicationHeaders\(\)/);
  assert.match(updatePasswordClient, /const requiresLogin = payload\.requiresLogin === true/);
  assert.match(
    updatePasswordClient,
    /postNativeSessionMessage\([\s\S]*MONJDB_SESSION_CREATED[\s\S]*payload\.mobileSessionToken/
  );
  assert.match(
    updatePasswordClient,
    /setActiveSession\(toApplicationSession\(payload\.profile\)\)/
  );
  assert.match(
    updatePasswordClient,
    /if \(requiresLogin\)[\s\S]*setActiveSession\(null\)[\s\S]*MONJDB_SESSION_REVOKED/
  );

  assert.match(forcedSetupBranch, /setPasswordChangeChallengeState\(null\)/);
  assert.match(forcedSetupBranch, /setSupabaseAccessToken\(null\)/);
  assert.match(forcedSetupBranch, /requiresLogin: true/);
  assert.match(forcedSetupBranch, /Ouvre-le pour activer ton compte/);
  assert.doesNotMatch(forcedSetupBranch, /activateBackendProfile/);
  assert.match(
    appContext,
    /status === 403[\s\S]*Confirme d’abord ton adresse e-mail avec le lien reçu/
  );

  assert.match(loginScreen, /Première connexion/);
  assert.match(loginScreen, /ouvre-le pour activer ton compte avant[\s\S]*d’accéder à ton espace/);
  assert.match(loginScreen, /Envoyer le lien d’activation/);
  assert.match(loginScreen, /Mot de passe ou clé d’accès/);
  assert.doesNotMatch(appContext, /sanitizedContactEmailConfirmation/);
});

test('seule la confirmation exacte finalise l’activation et ouvre une session', async () => {
  const [callbackApi, recoveryApi, blockingMigration] = await Promise.all([
    readProjectFile('api/auth-callback.js'),
    readProjectFile('api/auth-recovery.js'),
    readProjectFile(
      'supabase/migrations/202609080001_require_email_confirmation_remove_operating_time.sql'
    ),
  ]);

  const callbackEmailChangeBranch = sourceSection(
    callbackApi,
    "    if (callbackType === 'email_change') {",
    '    const applicationSession = await createApplicationSession(profile, request, {\n      authContext: \'recovery\','
  );
  const finalizeFunction = blockingMigration.slice(
    blockingMigration.indexOf(
      'create or replace function public.finalize_confirmed_email('
    )
  );

  assert.match(callbackApi, /callbackType !== 'email_change'/);
  assert.match(
    callbackEmailChangeBranch,
    /const hasExactPendingConfirmation = Boolean\([\s\S]*pendingEmail === confirmedEmail[\s\S]*pendingPurpose === 'activation'[\s\S]*pendingPurpose === 'change'[\s\S]*pendingRequestRecordedAt/
  );
  assert.match(
    callbackEmailChangeBranch,
    /const completesActivation =[\s\S]*profile\.must_change_password[\s\S]*preparedInitialSetup[\s\S]*pendingPurpose === 'activation'[\s\S]*!credentialOperation/
  );
  assert.match(
    callbackEmailChangeBranch,
    /credentialOperation\?\.state === 'prepared'[\s\S]*credentialOperation\?\.state === 'awaiting_email'/
  );
  assert.match(callbackEmailChangeBranch, /rpc\/finalize_confirmed_email/);
  assert.match(
    callbackEmailChangeBranch,
    /await revokeAllApplicationSessions\([\s\S]*Première connexion confirmée/
  );
  assert.doesNotMatch(callbackApi, /authAdminRequest/);
  assert.doesNotMatch(callbackEmailChangeBranch, /pending_activation:/);
  assert.match(callbackEmailChangeBranch, /authContext: 'standard'/);
  assert.match(
    callbackEmailChangeBranch,
    /Confirmed email finalized without a replacement session[\s\S]*clearApplicationSessionCookie\(response\)[\s\S]*sendJson\(response, 200[\s\S]*confirmationRecorded: true[\s\S]*requiresLogin: true/
  );
  assert.match(
    callbackEmailChangeBranch,
    /Adresse confirmée\. Ton compte est maintenant actif\./
  );
  assert.match(
    recoveryApi,
    /confirmedContactEmail && authEmail === confirmedContactEmail/
  );
  assert.match(
    recoveryApi,
    /const confirmedContactEmail = normalizeEmail\([\s\S]*profile\.metadata\?\.contactEmail/
  );
  assert.match(recoveryApi, /JSON\.stringify\(\{ email: authEmail \}\)/);
  assert.doesNotMatch(recoveryApi, /JSON\.stringify\(\{ email: user\.email \}\)/);

  assert.match(
    finalizeFunction,
    /auth_email is null[\s\S]*auth_email <> normalized_email[\s\S]*auth_pending_email <> ''/
  );
  assert.match(
    finalizeFunction,
    /pending_email <> '' and pending_email <> normalized_email/
  );
  assert.match(
    finalizeFunction,
    /protected_activation := coalesce\([\s\S]*credential_operation ->> 'state' in \('prepared', 'awaiting_email'\)/
  );
  assert.match(
    finalizeFunction,
    /if normalized_purpose = 'activation'[\s\S]*not \(protected_activation or legacy_activation\)[\s\S]*First activation requires the exact confirmed request/
  );
  assert.match(
    finalizeFunction,
    /update auth\.users account[\s\S]*'\{pending_activation\}'[\s\S]*'false'::jsonb[\s\S]*- 'provisionalCredentialOperationId'[\s\S]*- 'emailTemplatePurpose' - 'initialSetupOperationId'/
  );
  assert.match(
    finalizeFunction,
    /- 'pendingContactEmail'[\s\S]*jsonb_build_object\('contactEmail', normalized_email\)/
  );
  assert.match(
    finalizeFunction,
    /Première connexion finalisée après confirmation e-mail/
  );
});

test('les e-mails Auth sont versionnés en français et distinguent activation et changement', async () => {
  const [changeEmail, recovery, passwordChanged, emailChanged] =
    await Promise.all([
      readProjectFile('supabase/templates/change-email.html'),
      readProjectFile('supabase/templates/recovery.html'),
      readProjectFile('supabase/templates/password-changed.html'),
      readProjectFile('supabase/templates/email-changed.html'),
    ]);

  assert.match(changeEmail, /emailTemplatePurpose/);
  assert.match(changeEmail, /Bienvenue sur Mon Journal de Bloc/);
  assert.match(changeEmail, /Pour activer votre compte et accéder à votre espace/);
  assert.match(changeEmail, /Activer mon compte/);
  assert.match(changeEmail, /Confirmer ma nouvelle adresse e-mail/);
  assert.match(recovery, /Réinitialiser mon mot de passe/);
  assert.match(passwordChanged, /Le mot de passe associé à votre compte/);
  assert.doesNotMatch(passwordChanged, /Accéder à Mon Journal de Bloc/);
  assert.match(emailChanged, /vient d’être remplacée par/);
  assert.match(emailChanged, /\{\{ \.Email \}\}/);
});

test('le changement d’adresse exige le mot de passe actuel et révoque les anciennes sessions après confirmation', async () => {
  const [
    passwordApi,
    callbackApi,
    emailLifecycleMigration,
    profileScreen,
    seniorDashboard,
  ] = await Promise.all([
    readProjectFile('api/auth-password.js'),
    readProjectFile('api/auth-callback.js'),
    readProjectFile(
      'supabase/migrations/202608010002_confirmed_email_lifecycle.sql'
    ),
    readProjectFile('src/screens/ProfileScreen.tsx'),
    readProjectFile('src/screens/admin/SeniorDashboard.tsx'),
  ]);
  const emailChangeRequestHelper = sourceSection(
    passwordApi,
    'async function requestConfirmedEmailChange(request, accessToken, input) {',
    'async function requestPasswordGrant(request, email, password) {'
  );
  const emailChangeBranch = sourceSection(
    passwordApi,
    "    if (action === 'change-email') {",
    '    if (authenticatedAccessToken) {'
  );

  assert.match(passwordApi, /action === 'change-email'/);
  assert.match(passwordApi, /Le mot de passe actuel est obligatoire/);
  assert.match(emailChangeRequestHelper, /SUPABASE_URL}\/auth\/v1\/user/);
  assert.match(emailChangeRequestHelper, /Authorization: `Bearer \$\{accessToken\}`/);
  assert.match(
    emailChangeBranch,
    /requestConfirmedEmailChange\(request, authenticatedAccessToken/
  );
  assert.match(passwordApi, /rpc\/store_pending_email_confirmation/);
  assert.match(passwordApi, /p_contact_email: contactEmail/);
  assert.match(passwordApi, /p_profile_id: profile\.id/);
  assert.match(
    callbackApi,
    /rpc\/finalize_confirmed_email[\s\S]*p_confirmed_email: confirmedEmail/
  );
  assert.match(
    callbackApi,
    /const finalizedProfile = await getProfileByAuthUserId/
  );
  assert.match(callbackApi, /revokeAllApplicationSessions/);
  assert.match(
    emailLifecycleMigration,
    /create or replace function public\.finalize_confirmed_email/
  );
  assert.match(
    emailLifecycleMigration,
    /update public\.profiles[\s\S]*insert into public\.activity_log/
  );
  assert.match(
    emailLifecycleMigration,
    /grant execute on function public\.finalize_confirmed_email[\s\S]*to service_role/
  );
  assert.match(profileScreen, /label="Adresse e-mail"/);
  assert.match(profileScreen, /requestEmailChange/);
  assert.match(seniorDashboard, /Modifier l’adresse e-mail/);
  assert.match(seniorDashboard, /Envoyer le lien de confirmation/);
});

test('les changements de mot de passe transmettent le secret actuel déjà vérifié à Supabase Auth', async () => {
  const [passwordApi, serverAuth] = await Promise.all([
    readProjectFile('api/auth-password.js'),
    readProjectFile('src/serverAuth.cjs'),
  ]);

  assert.match(passwordApi, /let verifiedAuthPassword = null/);
  assert.match(
    passwordApi,
    /verifiedAuthPassword = passwordAlreadyRotated[\s\S]*\? password[\s\S]*: authenticationPassword/
  );
  assert.match(
    passwordApi,
    /body: JSON\.stringify\(\{\s*current_password: verifiedAuthPassword \|\| undefined,\s*password,\s*\}\)/
  );
  assert.doesNotMatch(passwordApi, /current_password:\s*currentPassword/);
  assert.doesNotMatch(passwordApi, /console\.(?:log|info|warn|error)\([^\n]*verifiedAuthPassword/);
  assert.match(
    serverAuth,
    /module\.exports\s*=\s*\{[\s\S]*getProfileByAuthUserId,[\s\S]*getProfileByLoginId,/
  );
});

test('une régénération admin réserve et corrèle la rotation avant d’exposer la nouvelle clé', async () => {
  const [regenerationApi, accountService, accessKeySource, setupMigration] = await Promise.all([
    readProjectFile('api/admin-access-key.js'),
    readProjectFile('src/services/adminAccountService.ts'),
    readProjectFile('src/accessKey.cjs'),
    readProjectFile(
      'supabase/migrations/202609010002_immediate_first_login.sql'
    ),
  ]);
  const beginRotationFunction = sourceSection(
    setupMigration,
    'create or replace function public.begin_provisional_access_key_rotation(',
    'create or replace function public.complete_initial_account_setup('
  );
  const completeRotationFunction = sourceSection(
    setupMigration,
    'create or replace function public.complete_provisional_access_key_rotation(',
    '-- A recovery application session may change credentials'
  );
  const cancelStaleRotationFunction = sourceSection(
    setupMigration,
    'create or replace function public.cancel_stale_provisional_access_key_rotation(',
    'create or replace function public.complete_initial_account_setup('
  );
  const reservationIndex = regenerationApi.indexOf(
    "'rpc/begin_provisional_access_key_rotation'"
  );
  const authMutationIndex = regenerationApi.indexOf('await authAdminRequest(');
  const passwordProofIndex = regenerationApi.indexOf(
    'payload: verifiedKey'
  );
  const completionIndex = regenerationApi.indexOf(
    "'rpc/complete_provisional_access_key_rotation'"
  );
  const responseIndex = regenerationApi.indexOf('accessKey,');
  const postCompletionApi = regenerationApi.slice(completionIndex);
  const regenerateClient = sourceSection(
    accountService,
    'export async function regenerateAdminAccessKey(',
    'async function changeAdminAccountLifecycle('
  );

  assert.ok(reservationIndex >= 0);
  assert.ok(authMutationIndex > reservationIndex);
  assert.ok(passwordProofIndex > authMutationIndex);
  assert.ok(completionIndex > passwordProofIndex);
  assert.ok(responseIndex > completionIndex);
  assert.doesNotMatch(postCompletionApi, /authAdminRequest/);
  assert.doesNotMatch(postCompletionApi, /getAuthUser/);

  assert.match(regenerationApi, /requireAdmin\(request\)/);
  assert.match(regenerationApi, /if \(!profile\.must_change_password\)/);
  assert.match(
    regenerationApi,
    /const requestedOperationId = String\(body\?\.operationId[\s\S]*requestedOperationId[\s\S]*p_operation_id: requestedOperationId/
  );
  assert.match(
    regenerationApi,
    /PROVISIONAL_ACCESS_KEY_SECRET[\s\S]*Buffer\.byteLength\(accessKeySecret, 'utf8'\) < 32/
  );
  assert.match(
    regenerationApi,
    /operationId !== requestedOperationId/
  );
  assert.match(
    regenerationApi,
    /const alreadyFinalized = preparedRotation\?\.alreadyFinalized === true/
  );
  assert.match(
    regenerationApi,
    /const alreadyPrepared = preparedRotation\?\.alreadyPrepared === true/
  );
  assert.match(
    regenerationApi,
    /const accessKey = deriveAccessKey\([\s\S]*operationId,[\s\S]*accessKeySecret/
  );
  assert.match(regenerationApi, /const authPassword = toPendingAuthPassword\(accessKey\)/);
  assert.match(
    regenerationApi,
    /pending_activation: true,[\s\S]*provisionalCredentialOperationId: operationId[\s\S]*password: authPassword/
  );
  assert.match(
    regenerationApi,
    /if \(!alreadyFinalized && alreadyPrepared\)[\s\S]*getAuthUser\(profile\.auth_user_id\)[\s\S]*existingAuthOperationId !== operationId/
  );
  assert.match(
    regenerationApi,
    /if \(!alreadyFinalized && !alreadyPrepared\)[\s\S]*await authAdminRequest\(/
  );
  assert.match(
    regenerationApi,
    /rpc\/cancel_stale_provisional_access_key_rotation[\s\S]*resetOperation: true/
  );
  assert.match(
    regenerationApi,
    /grant_type=password[\s\S]*password: authPassword[\s\S]*verifiedKey\?\.access_token/
  );
  assert.match(
    regenerationApi,
    /rpc\/complete_provisional_access_key_rotation[\s\S]*p_operation_id: operationId/
  );
  assert.match(
    regenerationApi,
    /lastAccessKeyOperationId !== operationId[\s\S]*throw finalizationError/
  );
  assert.doesNotMatch(regenerationApi, /finalizedAppMetadata/);
  assert.match(regenerationApi, /expectedVersion/);

  assert.match(accountService, /crypto\.randomUUID\(\)/);
  assert.match(accountService, /const pendingAccessKeyOperations = new Map/);
  assert.match(
    accountService,
    /sessionStorage\.getItem\(storageKey\)[\s\S]*sessionStorage\.setItem\(storageKey, JSON\.stringify\(operation\)\)/
  );
  assert.match(
    regenerateClient,
    /const operationId = getAccessKeyOperation\(profileId, expectedVersion\)[\s\S]*JSON\.stringify\(\{ expectedVersion, operationId, profileId \}\)/
  );
  assert.match(
    regenerateClient,
    /if \(!response\.ok \|\| !result\?\.accessKey \|\| !result\.profile\)[\s\S]*clearAccessKeyOperation\(profileId, operationId\)/
  );
  assert.match(
    regenerateClient,
    /result\?\.resetOperation === true[\s\S]*clearAccessKeyOperation\(profileId, operationId\)/
  );
  assert.match(
    accountService,
    /sessionStorage\.removeItem\(storageKey\)/
  );
  assert.match(
    accessKeySource,
    /createHmac\('sha256', normalizedSecret\)[\s\S]*provisional-access-key:v1:\$\{normalizedOperationId\}:\$\{counter\}/
  );
  assert.match(accessKeySource, /Buffer\.byteLength\(normalizedSecret, 'utf8'\) < 32/);

  assert.match(
    beginRotationFunction,
    /actor_profile\.role <> 'admin'::public\.app_role/
  );
  assert.match(
    beginRotationFunction,
    /target_profile\.version <> p_expected_version/
  );
  assert.match(
    beginRotationFunction,
    /profile_deletion_requests/
  );
  assert.match(
    beginRotationFunction,
    /p_operation_id uuid[\s\S]*operation_id uuid := p_operation_id/
  );
  assert.match(
    beginRotationFunction,
    /lastAccessKeyOperationId'[\s\S]*operation_id::text[\s\S]*lastAccessKeyActorProfileId'[\s\S]*actor_profile\.id::text[\s\S]*'alreadyFinalized', true/
  );
  assert.match(
    beginRotationFunction,
    /credential_operation ->> 'actorProfileId' = actor_profile\.id::text[\s\S]*credential_operation ->> 'id' = operation_id::text[\s\S]*'alreadyPrepared', true/
  );
  assert.match(
    beginRotationFunction,
    /'credentialOperation',[\s\S]*'actorProfileId', actor_profile\.id[\s\S]*'id', operation_id[\s\S]*'kind', 'access_key'[\s\S]*'state', 'prepared'/
  );
  assert.match(
    completeRotationFunction,
    /lastAccessKeyOperationId'[\s\S]*= p_operation_id::text[\s\S]*lastAccessKeyActorProfileId'[\s\S]*= actor_profile\.id::text[\s\S]*credentialOperation' is null[\s\S]*'alreadyFinalized', true/
  );
  assert.match(
    completeRotationFunction,
    /raw_app_meta_data ->> 'provisionalCredentialOperationId'[\s\S]*auth_operation_id <> p_operation_id::text/
  );
  assert.match(
    completeRotationFunction,
    /provisional_access_key_rotated[\s\S]*delete from auth\.sessions/
  );
  assert.match(
    completeRotationFunction,
    /update auth\.users auth_user[\s\S]*'\{pending_activation\}'[\s\S]*'true'::jsonb[\s\S]*- 'provisionalCredentialOperationId'[\s\S]*- 'emailTemplatePurpose' - 'initialSetupOperationId'/
  );
  assert.match(
    completeRotationFunction,
    /- 'credentialOperation'[\s\S]*'lastAccessKeyActorProfileId', actor_profile\.id[\s\S]*'lastAccessKeyOperationId', p_operation_id/
  );
  assert.match(completeRotationFunction, /Clé d’accès provisoire régénérée/);

  assert.match(
    cancelStaleRotationFunction,
    /credential_operation ->> 'id'[\s\S]*p_operation_id::text[\s\S]*credential_operation ->> 'kind'[\s\S]*'access_key'[\s\S]*credential_operation ->> 'state'[\s\S]*'prepared'/
  );
  assert.match(
    cancelStaleRotationFunction,
    /operation_started_at > clock_timestamp\(\) - interval '15 minutes'/
  );
  assert.match(
    cancelStaleRotationFunction,
    /provisionalCredentialOperationId'[\s\S]*coalesce\(auth_operation_id, ''\) <> ''[\s\S]*- 'credentialOperation'/
  );
});

test('la clé reste bloquée par les RLS et seule une session standard active ouvre les données métier', async () => {
  const [pendingGuardMigration, setupMigration] = await Promise.all([
    readProjectFile(
      'supabase/migrations/202607270003_pending_account_activation_guard.sql'
    ),
    readProjectFile(
      'supabase/migrations/202609010002_immediate_first_login.sql'
    ),
  ]);
  const currentProfileFunction = sourceSection(
    setupMigration,
    'create or replace function public.current_profile_id()',
    '-- Existing accounts may still confirm an activation link'
  );

  assert.match(
    pendingGuardMigration,
    /and not profile\.must_change_password/g
  );
  assert.match(
    pendingGuardMigration,
    /create policy "activated_session_required"[\s\S]*as restrictive/
  );
  assert.match(
    pendingGuardMigration,
    /public\.current_profile_id\(\) is not null/
  );
  assert.match(
    pendingGuardMigration,
    /raw_app_meta_data ->> 'pending_activation'/
  );
  assert.match(
    pendingGuardMigration,
    /First account activation must use the protected server flow/
  );
  assert.match(
    currentProfileFunction,
    /session_row\.auth_context = 'standard'/
  );
  assert.match(currentProfileFunction, /session_row\.revoked_at is null/);
  assert.match(currentProfileFunction, /and profile\.is_active/);
  assert.match(currentProfileFunction, /and not profile\.must_change_password/);
});
