import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [apiSource, loginSource, migrationSource, serverAuthSource] =
  await Promise.all([
    readFile(new URL('../src/serverAccountSecurity.cjs', import.meta.url), 'utf8'),
    readFile(new URL('../api/auth-login.js', import.meta.url), 'utf8'),
    readFile(
      new URL(
        '../supabase/migrations/202609090001_account_security_notebook_history.sql',
        import.meta.url
      ),
      'utf8'
    ),
    readFile(new URL('../src/serverAuth.cjs', import.meta.url), 'utf8'),
  ]);

test('toute connexion utilise le facteur TOTP dès qu’il est activé', () => {
  assert.match(loginSource, /listMfaFactors/);
  assert.match(loginSource, /requiresMfa: true/);
  assert.match(loginSource, /challengeAndVerifyAnyTotp/);
  assert.doesNotMatch(
    loginSource,
    /profile\.role === 'admin' \|\| profile\.role === 'senior'/
  );
});

test('la gestion MFA réauthentifie et révoque les autres sessions', () => {
  assert.match(apiSource, /reauthenticate/);
  assert.match(apiSource, /begin-mfa-enrollment/);
  assert.match(apiSource, /verify-mfa-enrollment/);
  assert.match(apiSource, /disable-mfa/);
  assert.match(apiSource, /rpc\/revoke_other_application_sessions/);
  assert.match(apiSource, /mfa_verified_at/);
});

test('les appareils affichent seulement un libellé générique', () => {
  assert.match(serverAuthSource, /function getDeviceLabel/);
  assert.match(serverAuthSource, /user_agent_hash/);
  assert.match(apiSource, /deviceLabel/);
  assert.doesNotMatch(apiSource, /user_agent_hash|user-agent|ip_address/i);
});

test('la révocation multiple reste réservée au service serveur', () => {
  assert.match(
    migrationSource,
    /revoke all on function public\.revoke_other_application_sessions[\s\S]*from public, anon, authenticated/
  );
  assert.match(
    migrationSource,
    /grant execute on function public\.revoke_other_application_sessions[\s\S]*to service_role/
  );
  assert.match(
    migrationSource,
    /session_row\.profile_id = p_profile_id/
  );
});
