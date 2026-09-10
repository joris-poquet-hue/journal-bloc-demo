import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const appContext = readSource('../src/context/AppContext.tsx');
const backendApi = readSource('../api/backend.js');
const backendRepository = readSource('../src/services/backendRepository.ts');

test('la connexion réutilise le profil authentifié sans seconde lecture Supabase', () => {
  const loginStart = appContext.indexOf('const login = async (');
  const loginEnd = appContext.indexOf(
    '\n  const cancelPasswordChangeChallenge',
    loginStart
  );
  const loginBody = appContext.slice(loginStart, loginEnd);

  assert.match(loginBody, /toBackendProfileFromLogin\(loginProfile\)/);
  assert.doesNotMatch(loginBody, /loadBackendProfileByAuthUserId/);
});

test('les annuaires Senior et Admin sont chargés une seule fois par bootstrap', () => {
  assert.match(
    backendRepository,
    /const \[assignmentRows, directoryProfiles\] = await Promise\.all/
  );
  assert.match(
    backendRepository,
    /loadBackendUserData\(profileId, signal, initialProfile\)/
  );
  assert.doesNotMatch(
    appContext,
    /loadBackendBootstrapPayload\(backendProfile\.id\)[\s\S]{0,180}loadBackendVisibleInternalProfiles/
  );
});

test('les lectures RPC ne déclenchent pas le distributeur de notifications', () => {
  assert.match(backendApi, /const PUSH_DISPATCH_RPC_PATHS = new Set/);
  assert.doesNotMatch(
    backendApi,
    /PUSH_DISPATCH_RPC_PATHS[\s\S]*rpc\/list_visible_internal_directory/
  );
  assert.match(
    backendApi,
    /response\.end\(responseBody\);[\s\S]*dispatchPendingPushNotifications/
  );
});
