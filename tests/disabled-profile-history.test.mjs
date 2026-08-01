import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const adminScreen = readSource('../src/screens/AdminScreen.tsx');
const backendRepository = readSource('../src/services/backendRepository.ts');

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

test('l’interface Admin affiche un historique séparé et en lecture seule', () => {
  assert.match(adminScreen, /Historique des comptes désactivés/);
  assert.match(adminScreen, /Cette vue est en lecture seule/);
  assert.match(adminScreen, /loadBackendDisabledProfiles/);
  assert.match(adminScreen, /profile\.role === 'internal'/);

  const historyStart = adminScreen.indexOf(
    'title="Historique des comptes désactivés"'
  );
  const historyEnd = adminScreen.indexOf(
    '\n          </SectionCard>',
    historyStart
  );
  const historySource = adminScreen.slice(historyStart, historyEnd);

  assert.doesNotMatch(historySource, /onClick=.*(?:delete|update|reactivat)/i);
  assert.doesNotMatch(historySource, /contactEmail|loginId|authUserId/);
});
