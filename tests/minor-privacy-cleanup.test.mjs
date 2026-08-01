import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

import {
  loadSeniorDashboardNavigationState,
  saveSeniorDashboardNavigationState,
} from '../src/screens/admin/seniorDashboardNavigation.ts';

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function installFakeSessionStorage(initialEntries = []) {
  const entries = new Map(initialEntries);
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'window'
  );

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      sessionStorage: {
        getItem(key) {
          return entries.get(key) ?? null;
        },
        removeItem(key) {
          entries.delete(key);
        },
        setItem(key, value) {
          entries.set(key, String(value));
        },
      },
    },
    writable: true,
  });

  return {
    entries,
    restore() {
      if (originalWindowDescriptor) {
        Object.defineProperty(globalThis, 'window', originalWindowDescriptor);
      } else {
        delete globalThis.window;
      }
    },
  };
}

test('la navigation Senior ne persiste aucun identifiant personnel ou métier', () => {
  const seniorId = 'senior-confidentiel';
  const legacyKey = `journal-bord:senior-dashboard-navigation:v2:${seniorId}`;
  const fakeWindow = installFakeSessionStorage([
    [
      legacyKey,
      JSON.stringify({
        populationFilter: 'mine',
        selectedInternalId: 'internal-confidentiel',
        selectedInterventionKey: 'procedure-confidentielle',
      }),
    ],
  ]);

  try {
    const initialState = loadSeniorDashboardNavigationState(seniorId);

    assert.equal(fakeWindow.entries.has(legacyKey), false);
    assert.deepEqual(initialState, {
      internalStripScrollLeft: 0,
      populationFilter: 'all',
      windowScrollY: 0,
    });

    saveSeniorDashboardNavigationState({
      internalStripScrollLeft: 32,
      populationFilter: 'mine',
      selectedInternalId: 'internal-a-ne-jamais-stocker',
      selectedInterventionKey: 'procedure-a-ne-jamais-stocker',
      windowScrollY: 240,
    });

    const storedEntries = [...fakeWindow.entries.entries()];
    assert.equal(storedEntries.length, 1);
    assert.equal(
      storedEntries[0][0],
      'journal-bord:senior-dashboard-navigation:v3'
    );
    assert.deepEqual(JSON.parse(storedEntries[0][1]), {
      internalStripScrollLeft: 32,
      populationFilter: 'mine',
      windowScrollY: 240,
    });
  } finally {
    fakeWindow.restore();
  }
});

test('l’ancienne couche app-state a disparu du code déployable', () => {
  const trophyImageStorage = readSource(
    '../src/services/trophyImageStorage.ts'
  );
  const trophyDisplay = readSource('../src/utils/trophyDisplay.ts');

  assert.equal(existsSync(new URL('../api/app-state.js', import.meta.url)), false);
  assert.equal(
    existsSync(new URL('../src/services/persistentStorage.ts', import.meta.url)),
    false
  );
  assert.match(trophyImageStorage, /\.\/authenticatedApi/);
  assert.doesNotMatch(trophyImageStorage, /persistentStorage|app-state/);
  assert.doesNotMatch(
    trophyDisplay,
    /loadStoredAdminEvaluations|loadStoredAdminTrophies|localStorage/
  );
});

test('les trophées surprise non obtenus restent totalement invisibles', () => {
  const trophyDisplay = readSource('../src/utils/trophyDisplay.ts');
  const trophiesScreen = readSource('../src/screens/TrophiesScreen.tsx');

  assert.match(
    trophyDisplay,
    /trophy\.visibility === 'surprise' && !isEarned[\s\S]*return null/
  );
  assert.doesNotMatch(trophiesScreen, /Secrets à découvrir|filter: 'secret'/);
});

test('l’adresse d’assistance web est centralisée et configurable', () => {
  const supportConfig = readSource('../src/supportConfig.ts');
  const profileScreen = readSource('../src/screens/ProfileScreen.tsx');
  const seniorDashboard = readSource(
    '../src/screens/admin/SeniorDashboard.tsx'
  );
  const adminScreen = readSource('../src/screens/AdminScreen.tsx');
  const mobileSupportConfig = readSource('../mobile/supportConfig.ts');
  const mobileApp = readSource('../mobile/App.tsx');

  assert.match(supportConfig, /import\.meta\.env\.VITE_SUPPORT_EMAIL/);
  assert.match(mobileSupportConfig, /EXPO_PUBLIC_SUPPORT_EMAIL/);

  for (const source of [
    profileScreen,
    seniorDashboard,
    adminScreen,
    mobileApp,
  ]) {
    assert.match(source, /buildSupportMailto/);
    assert.doesNotMatch(source, /mailto:contact@monjournaldebloc\.fr/);
  }

  assert.match(seniorDashboard, /Je rencontre le problème suivant/);
  assert.match(seniorDashboard, /Espace : Senior/);
  assert.match(adminScreen, /Je rencontre le problème suivant/);
  assert.match(adminScreen, /Espace : Administrateur/);
});
