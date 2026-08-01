import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const adminScreen = readSource('../src/screens/AdminScreen.tsx');
const appContext = readSource('../src/context/AppContext.tsx');
const backendRepository = readSource('../src/services/backendRepository.ts');
const backendTypes = readSource('../src/shared/backendTypes.ts');
const legacyImportScript = readSource('../scripts/import-legacy-app-state.mjs');
const durableBackendVerification = readSource(
  '../scripts/verify-durable-backend.mjs'
);
const productionFixture = readSource('../scripts/production-recipe-fixture.mjs');
const foundationMigration = readSource(
  '../supabase/migrations/202607010001_durable_backend_foundation.sql'
);
const retirementMigration = readSource(
  '../supabase/migrations/202607270009_retire_test_feedback_operations.sql'
);

test('les Remarques de test ne sont plus accessibles dans le client', () => {
  assert.doesNotMatch(
    adminScreen,
    /TestFeedback|testFeedback|Remarque de test|journal-bord:test-feedback/
  );
  assert.doesNotMatch(
    backendRepository,
    /BackendTestFeedback|TestFeedbackRow|test_feedback/
  );
  assert.doesNotMatch(backendTypes, /BackendTestFeedback|testFeedback/);
  assert.equal(existsSync(new URL('../api/app-state.js', import.meta.url)), false);
  assert.equal(
    existsSync(new URL('../src/services/persistentStorage.ts', import.meta.url)),
    false
  );
  assert.doesNotMatch(
    legacyImportScript,
    /test_feedback|testFeedback/
  );
  assert.doesNotMatch(durableBackendVerification, /test_feedback/);
  assert.doesNotMatch(productionFixture, /test_feedback/);
});

test('la copie locale obsolète est nettoyée sans réactiver la fonctionnalité', () => {
  assert.match(appContext, /cleanupKnownLegacyBusinessStorage\(\)/);
  assert.doesNotMatch(appContext, /test_feedback:/);
  assert.doesNotMatch(appContext, /OBSOLETE_TEST_FEEDBACK_STORAGE_KEY/);
});

test('les données Supabase historiques ne sont pas supprimées par ce lot', () => {
  assert.match(
    foundationMigration,
    /create table if not exists public\.test_feedback/
  );
  assert.doesNotMatch(appContext, /delete.*test_feedback/i);
  assert.doesNotMatch(backendRepository, /delete.*test_feedback/i);
  assert.match(retirementMigration, /alter table public\.test_feedback enable row level security/);
  assert.match(
    retirementMigration,
    /revoke all privileges on table public\.test_feedback from authenticated/
  );
  assert.doesNotMatch(
    retirementMigration,
    /drop table|truncate|delete\s+from\s+public\.test_feedback/i
  );
});

test('le bootstrap Admin doit être complet avant toute authentification', () => {
  const adminLoadStart = appContext.indexOf(
    'const [profiles, assignments, payload] = await Promise.all(['
  );
  const adminAuthentication = appContext.indexOf(
    'authenticateAdmin(backendProfile.id);',
    adminLoadStart
  );
  const adminBlock = appContext.slice(adminLoadStart, adminAuthentication);
  const payloadGuard = adminBlock.indexOf('if (\n      !payload ||');
  const firstStateUpdate = adminBlock.indexOf('setInternalProfiles(');

  assert.ok(adminLoadStart >= 0, 'le chargement Admin doit être identifiable');
  assert.ok(adminAuthentication > adminLoadStart);
  assert.match(adminBlock, /loadBackendProfiles\(\)/);
  assert.match(adminBlock, /loadBackendSeniorAssignments\(\)/);
  assert.match(adminBlock, /loadBackendBootstrapPayload\(backendProfile\.id\)/);
  assert.doesNotMatch(
    adminBlock,
    /loadBackend(?:Profiles|SeniorAssignments|BootstrapPayload)[\s\S]*?\.catch\(/
  );
  assert.ok(payloadGuard >= 0, 'le payload Admin doit être contrôlé');
  assert.ok(
    firstStateUpdate > payloadGuard,
    'aucun état Admin ne doit être appliqué avant le contrôle complet'
  );
  assert.match(
    adminBlock,
    /Chargement complet de l’espace Administrateur impossible/
  );
});

test('un échec de connexion révoque la session Supabase résiduelle', () => {
  const loginStart = appContext.indexOf('const login = async (');
  const loginEnd = appContext.indexOf(
    '\n  const cancelPasswordChangeChallenge',
    loginStart
  );
  const loginBody = appContext.slice(loginStart, loginEnd);

  assert.match(
    loginBody,
    /catch \(error\) \{\n      await signOutFromSupabase\(\{ scope: 'current' \}\)\.catch/
  );
  assert.match(loginBody, /isIncompleteAdminBootstrap/);
});
