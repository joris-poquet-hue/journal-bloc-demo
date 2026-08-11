import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const restoreSource = await readFile(
  new URL('../scripts/restore-external-backup.mjs', import.meta.url),
  'utf8'
);

test('la reconstruction destructive est réservée à un exercice autorisé', () => {
  assert.match(restoreSource, /args\.get\('rebuild-public-schema'\)/);
  assert.match(restoreSource, /process\.env\.PROJECT1_RESTORE_DRILL !== '1'/);
  assert.match(restoreSource, /rebuildTargetPublicSchema\(targetClient\)/);
});

test('les migrations conservent leurs révocations de privilèges', () => {
  const migrationIndex = restoreSource.indexOf('await applyBundledMigrations(');
  const historicalTableIndex = restoreSource.indexOf(
    'await ensureHistoricalPublicTables('
  );

  assert.ok(migrationIndex >= 0, 'les migrations doivent être appliquées');
  assert.ok(
    historicalTableIndex > migrationIndex,
    'la compatibilité historique doit être préparée après les migrations'
  );
  assert.doesNotMatch(
    restoreSource,
    /grant select, insert, update, delete on all tables in schema public/
  );
  assert.doesNotMatch(
    restoreSource,
    /grant execute on all routines in schema public/
  );
});

test('la table historique restaurée reste inaccessible aux utilisateurs', () => {
  assert.match(
    restoreSource,
    /revoke all privileges on table public\.app_state from public, anon, authenticated/
  );
});
