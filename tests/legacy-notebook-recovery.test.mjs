import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  cleanupKnownLegacyBusinessStorage,
  KNOWN_LEGACY_BUSINESS_STORAGE_KEYS,
  findLegacyNotebookRecovery,
  LEGACY_NOTEBOOK_DOCUMENTS_STORAGE_KEY,
  parseLegacyNotebookDocuments,
  resolveLegacyNotebookRecovery,
} from '../src/utils/legacyNotebookRecovery.ts';

const appContext = readFileSync(
  new URL('../src/context/AppContext.tsx', import.meta.url),
  'utf8'
);
const notebookScreen = readFileSync(
  new URL('../src/screens/NotebookScreen.tsx', import.meta.url),
  'utf8'
);
const recoveryUtility = readFileSync(
  new URL('../src/utils/legacyNotebookRecovery.ts', import.meta.url),
  'utf8'
);

const localDocument = {
  contentHtml: '<p>Note locale non synchronisée</p>',
  internalId: 'internal-1',
  updatedAt: '2026-07-19T09:30:00.000Z',
  updatedByProfileId: null,
  version: 2,
};

function installFakeWindow(initialEntries) {
  const entries = new Map(initialEntries);
  const originalWindowDescriptor = Object.getOwnPropertyDescriptor(
    globalThis,
    'window'
  );

  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      localStorage: {
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

test('seule une copie locale valide et différente de Supabase est proposée', () => {
  const documents = parseLegacyNotebookDocuments(
    JSON.stringify([
      localDocument,
      { contentHtml: 42, internalId: 'invalid', updatedAt: null },
    ])
  );

  assert.deepEqual(documents, [localDocument]);
  assert.equal(
    findLegacyNotebookRecovery(
      documents,
      localDocument.internalId,
      localDocument.contentHtml
    ),
    null
  );
  assert.deepEqual(
    findLegacyNotebookRecovery(documents, localDocument.internalId, ''),
    localDocument
  );
  assert.equal(findLegacyNotebookRecovery(documents, 'internal-2', ''), null);
  assert.deepEqual(parseLegacyNotebookDocuments('{illisible'), []);
});

test('la résolution explicite conserve seulement les copies valides des autres Internes', () => {
  const otherDocument = {
    ...localDocument,
    contentHtml: '<p>Autre Interne</p>',
    internalId: 'internal-2',
  };
  const fakeWindow = installFakeWindow([
    [
      LEGACY_NOTEBOOK_DOCUMENTS_STORAGE_KEY,
      JSON.stringify([localDocument, otherDocument, { ancienneValeur: true }]),
    ],
  ]);

  try {
    assert.equal(resolveLegacyNotebookRecovery(localDocument.internalId), true);

    const remainingRaw = fakeWindow.entries.get(
      LEGACY_NOTEBOOK_DOCUMENTS_STORAGE_KEY
    );
    const remaining = JSON.parse(remainingRaw);

    assert.deepEqual(remaining, [otherDocument]);
    assert.equal(resolveLegacyNotebookRecovery('internal-inconnu'), false);
    assert.equal(resolveLegacyNotebookRecovery(otherDocument.internalId), true);
    assert.equal(
      fakeWindow.entries.has(LEGACY_NOTEBOOK_DOCUMENTS_STORAGE_KEY),
      false
    );
  } finally {
    fakeWindow.restore();
  }
});

test('le démarrage nettoie les collections métier mais préserve le bloc-notes récupérable', () => {
  const fakeWindow = installFakeWindow([
    ...KNOWN_LEGACY_BUSINESS_STORAGE_KEYS.map((key) => [key, 'secret historique']),
    [LEGACY_NOTEBOOK_DOCUMENTS_STORAGE_KEY, JSON.stringify([localDocument])],
  ]);

  try {
    const result = cleanupKnownLegacyBusinessStorage();

    assert.equal(result.notebookRecoveryPreserved, true);
    assert.equal(
      fakeWindow.entries.has(LEGACY_NOTEBOOK_DOCUMENTS_STORAGE_KEY),
      true
    );
    KNOWN_LEGACY_BUSINESS_STORAGE_KEYS.forEach((key) => {
      assert.equal(fakeWindow.entries.has(key), false);
    });
  } finally {
    fakeWindow.restore();
  }
});

test('une copie de bloc-notes illisible est supprimée pendant le nettoyage', () => {
  const fakeWindow = installFakeWindow([
    [LEGACY_NOTEBOOK_DOCUMENTS_STORAGE_KEY, '{illisible'],
  ]);

  try {
    const result = cleanupKnownLegacyBusinessStorage();

    assert.equal(result.notebookRecoveryPreserved, false);
    assert.deepEqual(result.removedKeys, [
      LEGACY_NOTEBOOK_DOCUMENTS_STORAGE_KEY,
    ]);
    assert.equal(fakeWindow.entries.size, 0);
  } finally {
    fakeWindow.restore();
  }
});

test('les anciennes collections métier ne sont plus chargées dans l’état actif', () => {
  assert.doesNotMatch(appContext, /localStorage\.getItem/);
  assert.doesNotMatch(appContext, /loadStoredArray/);
  assert.doesNotMatch(appContext, /loadStoredAdminEvaluations/);
  assert.match(
    appContext,
    /useState<Record<string, AdminInterventionEvaluation>>\(\{\}\)/
  );
  assert.match(recoveryUtility, /cleanupKnownLegacyBusinessStorage/);
  assert.match(recoveryUtility, /saved-interventions/);
  assert.match(recoveryUtility, /admin-intervention-evaluations/);
  assert.match(recoveryUtility, /internal-profiles/);
});

test('la restauration attend Supabase avant de résoudre la copie locale', () => {
  const restoreStart = notebookScreen.indexOf(
    'const restoreLegacyNotebook = async () => {'
  );
  const restoreEnd = notebookScreen.indexOf(
    '\n  const lastSavedLabel',
    restoreStart
  );
  const restoreBody = notebookScreen.slice(restoreStart, restoreEnd);
  const serverSave = restoreBody.indexOf('await persistNotebookContent');
  const localResolution = restoreBody.indexOf(
    'resolveLegacyNotebookRecovery(selectedInternal.id)'
  );

  assert.ok(restoreStart >= 0, 'le parcours de restauration doit exister');
  assert.ok(serverSave >= 0, 'la restauration doit attendre la sauvegarde');
  assert.ok(
    localResolution > serverSave,
    'la copie locale ne doit être résolue qu’après Supabase'
  );
  assert.match(restoreBody, /window\.confirm/);
  assert.match(notebookScreen, /ne sera jamais\s+réimportée sans ton accord/);
});
