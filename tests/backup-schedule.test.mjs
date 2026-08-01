import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const setupSource = await readFile(
  new URL('../scripts/setup-external-backup.mjs', import.meta.url),
  'utf8'
);
const backupSource = await readFile(
  new URL('../scripts/backup-external.mjs', import.meta.url),
  'utf8'
);
const retrySource = await readFile(
  new URL('../scripts/run-external-backup-with-retry.mjs', import.meta.url),
  'utf8'
);

test('la sauvegarde quotidienne utilise le lanceur avec nouvelles tentatives', () => {
  assert.match(setupSource, /run-external-backup-with-retry\.mjs/);
  assert.match(retrySource, /\[0,\s*60_000,\s*180_000\]/);
  assert.match(retrySource, /Toutes les tentatives de sauvegarde ont échoué/);
});

test('une coupure PostgreSQL est capturée proprement avant une nouvelle tentative', () => {
  assert.match(backupSource, /snapshotClient\.on\('error'/);
  assert.match(backupSource, /connectionTimeoutMillis:\s*30_000/);
  assert.match(backupSource, /keepAlive:\s*true/);
});
