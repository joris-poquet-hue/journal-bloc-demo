import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [contextSource, draftSource, layoutSource] = await Promise.all([
  readFile(new URL('../src/context/AppContext.tsx', import.meta.url), 'utf8'),
  readFile(
    new URL('../src/utils/offlineInterventionDraft.ts', import.meta.url),
    'utf8'
  ),
  readFile(
    new URL('../src/components/InterventionFlowLayout.tsx', import.meta.url),
    'utf8'
  ),
]);

test('le brouillon local est chiffré avec une clé non extractible et expire', () => {
  assert.match(draftSource, /name: 'AES-GCM'/);
  assert.match(draftSource, /generateKey\([\s\S]*false,[\s\S]*\['decrypt', 'encrypt'\]/);
  assert.match(draftSource, /72 \* 60 \* 60 \* 1000/);
  assert.match(draftSource, /additionalData: getAdditionalData/);
  assert.doesNotMatch(draftSource, /localStorage|sessionStorage/);
});

test('le brouillon est purgé après validation, abandon et déconnexion', () => {
  assert.match(contextSource, /await clearAllOfflineInterventionDrafts/);
  assert.match(contextSource, /await clearOfflineInterventionDraft\(internalId\)/);
  assert.match(contextSource, /discardOfflineInterventionDraft/);
  assert.match(contextSource, /offlineDraftWriteGenerationRef/);
});

test('la reprise et l’état hors ligne sont visibles et explicites', () => {
  assert.match(layoutSource, /Brouillon retrouvé/);
  assert.match(layoutSource, /Reprendre le brouillon/);
  assert.match(layoutSource, /Hors ligne · brouillon chiffré/);
  assert.match(layoutSource, /Supprimer le brouillon/);
});
