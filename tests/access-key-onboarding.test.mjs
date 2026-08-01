import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import accessKeyModule from '../src/accessKey.cjs';

const {
  ACCESS_KEY_ALPHABET,
  generateAccessKey,
  isAccessKey,
  toPendingAuthPassword,
} = accessKeyModule;

async function readProjectFile(relativePath) {
  return readFile(new URL(`../${relativePath}`, import.meta.url), 'utf8');
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

test('la première connexion saisit une seule adresse et attend sa confirmation avant activation', async () => {
  const [passwordApi, callbackApi, loginScreen, appContext] = await Promise.all([
    readProjectFile('api/auth-password.js'),
    readProjectFile('api/auth-callback.js'),
    readProjectFile('src/screens/LoginScreen.tsx'),
    readProjectFile('src/context/AppContext.tsx'),
  ]);

  assert.doesNotMatch(passwordApi, /confirmContactEmail/);
  assert.match(passwordApi, /requestConfirmedEmailChange/);
  assert.match(passwordApi, /pendingEmailConfirmation: true/);
  assert.doesNotMatch(passwordApi, /email_confirm: true/);
  assert.match(passwordApi, /\{ email: contactEmail, password \}/);
  assert.doesNotMatch(loginScreen, /Confirmer l’adresse e-mail/);
  assert.match(loginScreen, /Un lien te sera envoyé/);
  assert.match(loginScreen, /Mot de passe ou clé d’accès/);
  assert.doesNotMatch(appContext, /sanitizedContactEmailConfirmation/);
  assert.match(callbackApi, /callbackType !== 'email_change'/);
  assert.match(callbackApi, /pending_activation: false/);
  assert.match(callbackApi, /purpose === 'activation' \? false/);
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

  assert.match(passwordApi, /action === 'change-email'/);
  assert.match(passwordApi, /Le mot de passe actuel est obligatoire/);
  assert.match(passwordApi, /pendingContactEmail: contactEmail/);
  assert.match(callbackApi, /contactEmail: confirmedEmail/);
  assert.match(callbackApi, /rpc\/finalize_confirmed_email/);
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

test('une régénération est réservée à un compte encore en attente et remplace immédiatement l’ancienne clé', async () => {
  const regenerationApi = await readProjectFile('api/admin-access-key.js');

  assert.match(regenerationApi, /requireAdmin\(request\)/);
  assert.match(regenerationApi, /if \(!profile\.must_change_password\)/);
  assert.match(
    regenerationApi,
    /password: toPendingAuthPassword\(accessKey\)/
  );
  assert.match(regenerationApi, /Clé d’accès provisoire régénérée/);
  assert.match(regenerationApi, /expectedVersion/);
});

test('une session en attente d’activation est bloquée par les RLS', async () => {
  const migration = await readProjectFile(
    'supabase/migrations/202607270003_pending_account_activation_guard.sql'
  );

  assert.match(
    migration,
    /and not profile\.must_change_password/g
  );
  assert.match(
    migration,
    /create policy "activated_session_required"[\s\S]*as restrictive/
  );
  assert.match(
    migration,
    /public\.current_profile_id\(\) is not null/
  );
  assert.match(migration, /raw_app_meta_data ->> 'pending_activation'/);
  assert.match(
    migration,
    /First account activation must use the protected server flow/
  );
});
