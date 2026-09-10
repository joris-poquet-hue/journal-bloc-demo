import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { createSerializedAsyncQueue } from '../src/utils/serializedAsyncQueue.ts';

const appContext = readFileSync(
  new URL('../src/context/AppContext.tsx', import.meta.url),
  'utf8'
);
const notebookScreen = readFileSync(
  new URL('../src/screens/NotebookScreen.tsx', import.meta.url),
  'utf8'
);
const notebookHtml = readFileSync(
  new URL('../src/utils/notebookHtml.ts', import.meta.url),
  'utf8'
);

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

test('la file de sauvegarde sérialise les écritures du bloc-notes', async () => {
  const queue = createSerializedAsyncQueue();
  const firstSave = createDeferred();
  const events = [];
  const first = queue.enqueue(async () => {
    events.push('début-1');
    await firstSave.promise;
    events.push('fin-1');
    return 1;
  });
  const second = queue.enqueue(async () => {
    events.push('début-2');
    return 2;
  });

  await Promise.resolve();
  assert.deepEqual(events, ['début-1']);

  firstSave.resolve();
  assert.equal(await first, 1);
  assert.equal(await second, 2);
  assert.deepEqual(events, ['début-1', 'fin-1', 'début-2']);
});

test('un échec réseau ne bloque pas la tentative suivante', async () => {
  const queue = createSerializedAsyncQueue();
  const first = queue.enqueue(async () => {
    throw new Error('réseau indisponible');
  });
  const second = queue.enqueue(async () => 'enregistré');

  await assert.rejects(first, /réseau indisponible/);
  assert.equal(await second, 'enregistré');
});

test('le succès du bloc-notes dépend de la réponse du serveur', () => {
  const updateStart = appContext.indexOf('const updateNotebookDocument = (');
  const serverConfirmation = appContext.indexOf(
    'await upsertBackendNotebookDocument',
    updateStart
  );
  const localUpdate = appContext.indexOf(
    'setNotebookDocuments(nextDocuments)',
    serverConfirmation
  );
  const screenAwait = notebookScreen.indexOf(
    'const confirmedDocument = await saveDocument()'
  );
  const visibleSuccess = notebookScreen.indexOf(
    "setSaveState('saved')",
    screenAwait
  );

  assert.ok(updateStart >= 0, 'la sauvegarde du bloc-notes doit être exposée');
  assert.ok(
    serverConfirmation > updateStart,
    'la réponse du serveur doit être attendue'
  );
  assert.ok(
    localUpdate > serverConfirmation,
    'le document local ne doit changer qu’après le serveur'
  );
  assert.ok(screenAwait >= 0, 'l’écran doit attendre la promesse de sauvegarde');
  assert.ok(
    visibleSuccess > screenAwait,
    'le libellé Enregistré doit suivre la confirmation serveur'
  );
  assert.match(notebookScreen, /Réessayer l’enregistrement/);
  assert.match(notebookScreen, /n’a pas été enregistré sur le serveur/);
  assert.match(
    notebookScreen,
    /catch \(error\)[\s\S]*!isMountedRef\.current \|\| remoteConflictRef\.current/
  );
  assert.match(
    notebookScreen,
    /let saveSucceeded = false[\s\S]*saveSucceeded = true[\s\S]*finally[\s\S]*saveSucceeded &&/
  );
  assert.match(
    notebookScreen,
    /updateNotebookDocumentRef[\s\S]*\.current\(pendingContent, editorDocumentVersionRef\.current\)/,
    'une modification temporisée doit être transmise avant de quitter l’écran'
  );
  assert.doesNotMatch(appContext, /void syncNotebookDocumentToDurableBackend/);
});

test('une version distante ne peut pas être écrasée silencieusement', () => {
  const updateStart = appContext.indexOf('const updateNotebookDocument = (');
  const updateEnd = appContext.indexOf(
    '\n  const clearNotebookDocument',
    updateStart
  );
  const updateBody = appContext.slice(updateStart, updateEnd);

  assert.match(
    updateBody,
    /expectedVersion !== undefined[\s\S]*currentVersion !== expectedVersion/
  );
  assert.match(
    updateBody,
    /upsertBackendNotebookDocument\([\s\S]*version: expectedVersion \?\? currentVersion/
  );
  assert.match(
    updateBody,
    /latestKnownDocument\.version \?\? 0\)[\s\S]*confirmedDocument\.version \?\? 0/
  );
  assert.match(
    notebookScreen,
    /remoteVersion !== editorDocumentVersionRef\.current/
  );
  assert.match(notebookScreen, /Une version plus récente existe sur un autre appareil/);
  assert.match(notebookScreen, /Charger la version serveur/);
  assert.match(notebookScreen, /Conserver ma version/);
  assert.match(
    notebookScreen,
    /if \(isVersionConflict\)[\s\S]*refreshBackendData\(\)/
  );
  assert.match(
    notebookScreen,
    /updateNotebookDocument\(localContent, expectedVersion\)/
  );
});

test('le HTML du bloc-notes est assaini à chaque entrée et avant stockage', () => {
  assert.match(notebookHtml, /const ALLOWED_NOTEBOOK_TAGS = new Set/);
  assert.match(notebookHtml, /const CONTENT_REMOVAL_TAGS = new Set/);
  assert.match(notebookHtml, /'SCRIPT'/);
  assert.match(notebookHtml, /'IFRAME'/);
  assert.match(notebookHtml, /'SVG'/);
  assert.match(
    notebookHtml,
    /attribute\.name !== 'class' && attribute\.name !== 'style'/
  );
  assert.match(notebookHtml, /sanitizeNotebookStyle/);
  assert.match(notebookScreen, /sanitizeNotebookHtml\(editor\.innerHTML\)/);
  assert.match(
    appContext,
    /const sanitizedContentHtml = sanitizeNotebookHtml\(contentHtml\)[\s\S]*contentHtml: sanitizedContentHtml/
  );
  assert.match(notebookScreen, /onPaste=\{handleEditorPaste\}/);
  assert.match(notebookScreen, /onDrop=\{handleEditorDrop\}/);
  assert.match(notebookScreen, /sanitizeNotebookHtml\(conflict\.contentHtml\)/);
  assert.doesNotMatch(
    notebookScreen,
    /editor\.innerHTML = notebookDocument\?\.contentHtml/
  );
});

test('la déconnexion invalide les sauvegardes et vide l’état métier en mémoire', () => {
  const logoutStart = appContext.indexOf('const logout = async () => {');
  const logoutEnd = appContext.indexOf('\n  };', logoutStart);
  const logoutBody = appContext.slice(logoutStart, logoutEnd);

  assert.match(logoutBody, /notebookSaveGenerationRef\.current \+= 1/);
  assert.match(logoutBody, /setInternalProfiles\(\[\]\)/);
  assert.match(logoutBody, /setSavedInterventions\(\[\]\)/);
  assert.match(logoutBody, /setNotebookDocuments\(\[\]\)/);
  assert.match(logoutBody, /setCustomSurgicalInterventions\(\[\]\)/);
  assert.match(logoutBody, /setCustomSeniors\(\[\]\)/);
  assert.match(logoutBody, /setAdminEvaluations\(\{\}\)/);
  assert.match(logoutBody, /setAdminTrophies\(\[\]\)/);
  assert.match(logoutBody, /setActivityLog\(\[\]\)/);
  assert.doesNotMatch(logoutBody, /localStorage\.(?:setItem|removeItem)/);
  assert.doesNotMatch(
    appContext,
    /window\.localStorage\.setItem\(\s*(?:INTERNAL_PROFILES_STORAGE_KEY|SAVED_INTERVENTIONS_STORAGE_KEY|NOTEBOOK_DOCUMENTS_STORAGE_KEY|CUSTOM_SURGICAL_INTERVENTIONS_STORAGE_KEY|CUSTOM_SENIORS_STORAGE_KEY|ADMIN_EVALUATIONS_STORAGE_KEY|ACTIVITY_LOG_STORAGE_KEY)/,
    'les anciennes copies doivent rester gelées jusqu’à leur récupération contrôlée'
  );
});

test('une réponse tardive de l’ancien compte ne peut pas alimenter le nouveau', () => {
  const updateStart = appContext.indexOf('const updateNotebookDocument = (');
  const updateEnd = appContext.indexOf(
    '\n  const clearNotebookDocument',
    updateStart
  );
  const updateBody = appContext.slice(updateStart, updateEnd);
  const serverRequest = updateBody.indexOf('await upsertBackendNotebookDocument');
  const generationChecks = [
    ...updateBody.matchAll(
      /saveGeneration !== notebookSaveGenerationRef\.current/g
    ),
  ].map((match) => match.index ?? -1);
  const identityChecks = [
    ...updateBody.matchAll(
      /activeBackendIdentityRef\.current !== expectedIdentity/g
    ),
  ].map((match) => match.index ?? -1);

  assert.ok(serverRequest >= 0, 'la requête serveur doit être identifiable');
  assert.ok(
    generationChecks.some((position) => position < serverRequest) &&
      generationChecks.some((position) => position > serverRequest),
    'la génération de session doit être contrôlée avant et après le serveur'
  );
  assert.ok(
    identityChecks.some((position) => position < serverRequest) &&
      identityChecks.some((position) => position > serverRequest),
    'l’identité active doit être contrôlée avant et après le serveur'
  );
});
