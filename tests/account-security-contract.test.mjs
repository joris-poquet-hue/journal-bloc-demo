import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
  apiSource,
  cleanupSource,
  clientSource,
  e2eAuthSource,
  loginContextSource,
  loginScreenSource,
  loginSource,
  migrationSource,
  sessionMigrationSource,
  securityPanelSource,
  securityServiceSource,
  serverAuthSource,
] =
  await Promise.all([
    readFile(new URL('../src/serverAccountSecurity.cjs', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/remove-auth-factors.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../src/services/supabaseClient.ts', import.meta.url), 'utf8'),
    readFile(new URL('../e2e/helpers/auth.ts', import.meta.url), 'utf8'),
    readFile(new URL('../src/context/AppContext.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../src/screens/LoginScreen.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../api/auth-login.js', import.meta.url), 'utf8'),
    readFile(
      new URL(
        '../supabase/migrations/202609100001_remove_multi_factor_authentication.sql',
        import.meta.url
      ),
      'utf8'
    ),
    readFile(
      new URL(
        '../supabase/migrations/202609090001_account_security_notebook_history.sql',
        import.meta.url
      ),
      'utf8'
    ),
    readFile(
      new URL('../src/components/AccountSecurityPanel.tsx', import.meta.url),
      'utf8'
    ),
    readFile(
      new URL('../src/services/accountSecurityService.ts', import.meta.url),
      'utf8'
    ),
    readFile(new URL('../src/serverAuth.cjs', import.meta.url), 'utf8'),
  ]);

test('la connexion standard ne demande plus de second facteur', () => {
  for (const source of [
    clientSource,
    e2eAuthSource,
    loginContextSource,
    loginScreenSource,
    loginSource,
    serverAuthSource,
  ]) {
    assert.doesNotMatch(source, /mfa|totp/i);
  }

  assert.match(loginSource, /signInAuthUserWithPassword/);
  assert.match(loginSource, /createApplicationSession\(profile, request\)/);
});

test('la sécurité du compte conserve uniquement la gestion des sessions', () => {
  assert.match(apiSource, /revoke-session/);
  assert.match(apiSource, /rpc\/revoke_other_application_sessions/);
  assert.match(securityPanelSource, /Appareils connectés/);
  assert.match(securityServiceSource, /revokeAccountSession/);

  for (const source of [apiSource, securityPanelSource, securityServiceSource]) {
    assert.doesNotMatch(source, /mfa|totp|double authentification/i);
  }
});

test('le retrait des facteurs est gardé, vérifiable et sans écriture par défaut', () => {
  assert.match(cleanupSource, /auth\.admin\.mfa\.listFactors/);
  assert.match(cleanupSource, /auth\.admin\.mfa\.deleteFactor/);
  assert.match(cleanupSource, /process\.argv\.includes\('--apply'\)/);
  assert.match(cleanupSource, /REMOVE-AUTH-FACTORS/);
  assert.match(cleanupSource, /remainingFactors\.length > 0/);
  assert.match(migrationSource, /drop column if exists mfa_verified_at/);
});

test('les appareils affichent seulement un libellé générique', () => {
  assert.match(serverAuthSource, /function getDeviceLabel/);
  assert.match(serverAuthSource, /user_agent_hash/);
  assert.match(apiSource, /deviceLabel/);
  assert.doesNotMatch(apiSource, /user_agent_hash|user-agent|ip_address/i);
});

test('la révocation multiple reste réservée au service serveur', () => {
  assert.match(
    sessionMigrationSource,
    /revoke all on function public\.revoke_other_application_sessions[\s\S]*from public, anon, authenticated/
  );
  assert.match(
    sessionMigrationSource,
    /grant execute on function public\.revoke_other_application_sessions[\s\S]*to service_role/
  );
  assert.match(
    sessionMigrationSource,
    /session_row\.profile_id = p_profile_id/
  );
});
