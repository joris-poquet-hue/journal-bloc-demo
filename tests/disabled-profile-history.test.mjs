import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const adminScreen = readSource('../src/screens/AdminScreen.tsx');
const backendRepository = readSource('../src/services/backendRepository.ts');
const adminAccountService = readSource('../src/services/adminAccountService.ts');

test('le dépôt charge séparément les profils inactifs pour l’Administrateur', () => {
  const functionStart = backendRepository.indexOf(
    'export async function loadBackendDisabledProfiles'
  );
  const functionEnd = backendRepository.indexOf(
    '\nexport async function loadBackendInstitutions',
    functionStart
  );
  const source = backendRepository.slice(functionStart, functionEnd);

  assert.ok(functionStart >= 0);
  assert.match(source, /selectSupabaseRows<ProfileRow>\('profiles'/);
  assert.match(source, /is_active: 'eq\.false'/);
  assert.match(source, /updated_at\.desc/);
});

test('l’interface Admin affiche les comptes désactivés et permet leur réactivation', () => {
  assert.match(adminScreen, /Comptes désactivés/);
  assert.match(adminScreen, /leur identité de connexion sont conservés/);
  assert.match(adminScreen, /loadBackendDisabledProfiles/);
  assert.match(adminScreen, /profile\.role === 'internal'/);
  assert.match(adminScreen, /handleReactivateProfile/);
  assert.match(adminScreen, /Réactiver/);
  assert.match(adminAccountService, /action: 'deactivate' \| 'reactivate'/);
  assert.match(adminAccountService, /reactivateAdminAccount/);
  assert.match(adminAccountService, /\/api\/admin-account-lifecycle/);

  const historyStart = adminScreen.indexOf(
    'title="Comptes désactivés"'
  );
  const historyEnd = adminScreen.indexOf(
    '\n          </SectionCard>',
    historyStart
  );
  const historySource = adminScreen.slice(historyStart, historyEnd);

  assert.match(historySource, /onClick=.*handleReactivateProfile/i);
  assert.doesNotMatch(historySource, /profile\.contactEmail|profile\.loginId/);
  assert.doesNotMatch(historySource, />\s*\{profile\.authUserId\}\s*</);
});
