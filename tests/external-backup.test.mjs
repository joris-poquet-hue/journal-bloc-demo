import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  appendFile,
  mkdir,
  readFile,
  rm,
  stat,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import {
  BACKUP_EXTENSION,
  BACKUP_FILE_PREFIX,
  buildFileInventory,
  createPrivateTemporaryDirectory,
  createTarGzip,
  decryptAndVerifyBackup,
  enforceRetention,
  encryptFile,
  removeTemporaryDirectory,
} from '../scripts/external-backup-lib.mjs';

test('une archive chiffrée se déchiffre et valide tous ses fichiers', async () => {
  const temporaryDirectory = await createPrivateTemporaryDirectory(
    'project1-backup-test-'
  );
  const payloadDirectory = join(temporaryDirectory, 'payload');
  const archivePath = join(temporaryDirectory, 'payload.tar.gz');
  const encryptedPath = join(temporaryDirectory, `test${BACKUP_EXTENSION}`);
  const key = randomBytes(32);

  try {
    await mkdir(join(payloadDirectory, 'database'), { recursive: true });
    await writeFile(
      join(payloadDirectory, 'database', 'sample.sql'),
      'select 1;\n'
    );
    const manifest = {
      format: 'project1-external-backup',
      version: 1,
      createdAt: new Date().toISOString(),
      database: { publicTables: 1 },
      storage: { objects: 0 },
      files: await buildFileInventory(payloadDirectory, ['manifest.json']),
    };
    await writeFile(
      join(payloadDirectory, 'manifest.json'),
      `${JSON.stringify(manifest)}\n`
    );
    await createTarGzip(payloadDirectory, archivePath);
    await encryptFile(archivePath, encryptedPath, key);

    const verification = await decryptAndVerifyBackup(encryptedPath, key);
    try {
      assert.equal(verification.manifest.version, 1);
      assert.equal(
        await readFile(
          join(verification.extractedDirectory, 'database', 'sample.sql'),
          'utf8'
        ),
        'select 1;\n'
      );
    } finally {
      await removeTemporaryDirectory(verification.temporaryDirectory);
    }
  } finally {
    await removeTemporaryDirectory(temporaryDirectory);
  }
});

test('toute altération de l’archive chiffrée est détectée', async () => {
  const temporaryDirectory = await createPrivateTemporaryDirectory(
    'project1-backup-tamper-test-'
  );
  const payloadDirectory = join(temporaryDirectory, 'payload');
  const archivePath = join(temporaryDirectory, 'payload.tar.gz');
  const encryptedPath = join(temporaryDirectory, `test${BACKUP_EXTENSION}`);
  const key = randomBytes(32);

  try {
    await mkdir(payloadDirectory, { recursive: true });
    await writeFile(join(payloadDirectory, 'data.txt'), 'contenu sensible\n');
    await writeFile(
      join(payloadDirectory, 'manifest.json'),
      `${JSON.stringify({
        format: 'project1-external-backup',
        version: 1,
        files: await buildFileInventory(payloadDirectory, ['manifest.json']),
      })}\n`
    );
    await createTarGzip(payloadDirectory, archivePath);
    await encryptFile(archivePath, encryptedPath, key);
    await appendFile(encryptedPath, Buffer.from([0xff]));

    await assert.rejects(
      decryptAndVerifyBackup(encryptedPath, key),
      /authenticate|invalide|incorrect|format|archive/i
    );
  } finally {
    await removeTemporaryDirectory(temporaryDirectory);
  }
});

test('la rétention ne supprime que les sauvegardes Project1 expirées', async () => {
  const temporaryDirectory = await createPrivateTemporaryDirectory(
    'project1-backup-retention-test-'
  );
  const expiredName = `${BACKUP_FILE_PREFIX}ancien${BACKUP_EXTENSION}`;
  const recentName = `${BACKUP_FILE_PREFIX}recent${BACKUP_EXTENSION}`;
  const unrelatedName = 'document-personnel.txt';

  try {
    await writeFile(join(temporaryDirectory, expiredName), 'ancien');
    await writeFile(join(temporaryDirectory, recentName), 'récent');
    await writeFile(join(temporaryDirectory, unrelatedName), 'à conserver');
    const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000);
    await utimes(join(temporaryDirectory, expiredName), oldDate, oldDate);

    const removed = await enforceRetention(temporaryDirectory, 30);

    assert.deepEqual(removed, [expiredName]);
    await assert.rejects(stat(join(temporaryDirectory, expiredName)));
    assert.equal((await stat(join(temporaryDirectory, recentName))).isFile(), true);
    assert.equal((await stat(join(temporaryDirectory, unrelatedName))).isFile(), true);
  } finally {
    await removeTemporaryDirectory(temporaryDirectory);
  }
});
