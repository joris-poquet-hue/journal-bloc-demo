import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [migrationSource, repositorySource, screenSource] = await Promise.all([
  readFile(
    new URL(
      '../supabase/migrations/202609090001_account_security_notebook_history.sql',
      import.meta.url
    ),
    'utf8'
  ),
  readFile(
    new URL('../src/services/backendRepository.ts', import.meta.url),
    'utf8'
  ),
  readFile(new URL('../src/screens/NotebookScreen.tsx', import.meta.url), 'utf8'),
]);

test('les instantanés sont privés, bornés et espacés', () => {
  assert.match(migrationSource, /enable row level security/);
  assert.match(
    migrationSource,
    /profile_id = public\.current_profile_id\(\)[\s\S]*current_app_role\(\) = 'internal'/
  );
  assert.match(migrationSource, /interval '5 minutes'/);
  assert.match(migrationSource, /offset 50/);
  assert.match(migrationSource, /restore_notebook_document_version/);
  assert.match(migrationSource, /for update/);
  assert.match(
    migrationSource,
    /insert into public\.notebook_document_versions[\s\S]*update public\.notebook_documents/
  );
});

test('l’historique charge au plus cinquante versions', () => {
  assert.match(repositorySource, /loadBackendNotebookVersions/);
  assert.match(repositorySource, /limit: 50/);
  assert.match(repositorySource, /order: 'archived_at\.desc'/);
  assert.match(repositorySource, /restoreBackendNotebookVersion/);
});

test('un conflit peut être comparé, fusionné ou restauré sans HTML brut', () => {
  assert.match(screenSource, /notebook-conflict-comparison/);
  assert.match(screenSource, /Fusionner les deux versions/);
  assert.match(screenSource, /Historique du bloc-notes/);
  assert.match(screenSource, /Restaurer cette version/);
  assert.match(screenSource, /sanitizeNotebookHtml\(version\.contentHtml\)/);
});
