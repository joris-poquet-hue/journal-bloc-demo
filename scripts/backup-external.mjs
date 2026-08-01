#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { basename, join, resolve } from 'node:path';
import pg from 'pg';
import {
  BACKUP_EXTENSION,
  BACKUP_FILE_PREFIX,
  DEFAULT_BACKUP_DIRECTORY,
  DEFAULT_RETENTION_DAYS,
  assertPostgresTools,
  buildFileInventory,
  copyMigrations,
  createPrivateTemporaryDirectory,
  createTarGzip,
  decryptAndVerifyBackup,
  enforceRetention,
  encryptFile,
  extractProjectReference,
  formatBackupTimestamp,
  getBackupKey,
  getPostgresConnectionString,
  getPostgresProcessEnvironment,
  loadEnvironment,
  parseCliArguments,
  postgresExecutable,
  removeTemporaryDirectory,
  requireEnvironment,
  runCommand,
  sha256File,
  stripSslMode,
} from './external-backup-lib.mjs';

const args = parseCliArguments();
const envFile = await loadEnvironment({
  explicitEnvFile: args.get('env-file'),
});

if (!envFile) {
  throw new Error(
    'Fichier d’environnement introuvable. Utilisez --env-file=/chemin/vers/.env.production.local.'
  );
}

const connectionString = getPostgresConnectionString();
const supabaseUrl = requireEnvironment('SUPABASE_URL').replace(/\/$/, '');
const serviceRoleKey = requireEnvironment('SUPABASE_SERVICE_ROLE_KEY');
const sourceProjectRef = extractProjectReference(supabaseUrl);
const backupDirectory = resolve(
  String(args.get('backup-dir') || process.env.PROJECT1_BACKUP_DIR || DEFAULT_BACKUP_DIRECTORY)
);
const retentionDays = Number(
  args.get('retention-days') ||
    process.env.PROJECT1_BACKUP_RETENTION_DAYS ||
    DEFAULT_RETENTION_DAYS
);

if (!Number.isInteger(retentionDays) || retentionDays < 1) {
  throw new Error('La rétention doit être un nombre entier positif de jours.');
}

if (!args.get('allow-external-production-backup')) {
  throw new Error(
    'Export externe non autorisé. Ajoutez --allow-external-production-backup uniquement après accord explicite du propriétaire sur la destination.'
  );
}

await assertPostgresTools();
const backupKey = await getBackupKey();
await mkdir(backupDirectory, { recursive: true, mode: 0o700 });

const startedAt = new Date();
const timestamp = formatBackupTimestamp(startedAt);
const finalFileName = `${BACKUP_FILE_PREFIX}${timestamp}${BACKUP_EXTENSION}`;
const finalPath = join(backupDirectory, finalFileName);
const partialPath = `${finalPath}.partial-${process.pid}`;
const workingDirectory = await createPrivateTemporaryDirectory('project1-backup-');
const payloadDirectory = join(workingDirectory, 'payload');
const databaseDirectory = join(payloadDirectory, 'database');
const storageDirectory = join(payloadDirectory, 'storage');
const storageObjectDirectory = join(storageDirectory, 'objects');
const archivePath = join(workingDirectory, 'payload.tar.gz');
let snapshotClient;
let snapshotConnectionError;

try {
  await mkdir(databaseDirectory, { recursive: true, mode: 0o700 });
  await mkdir(storageObjectDirectory, { recursive: true, mode: 0o700 });

  snapshotClient = new pg.Client({
    connectionTimeoutMillis: 30_000,
    connectionString: stripSslMode(connectionString),
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
    ssl: { rejectUnauthorized: false },
  });
  snapshotClient.on('error', (error) => {
    snapshotConnectionError ??= error;
  });
  await snapshotClient.connect();
  await snapshotClient.query(
    'begin isolation level repeatable read read only'
  );

  const snapshotId = (await snapshotClient.query('select pg_export_snapshot() as id'))
    .rows[0].id;
  const databaseVersion = (
    await snapshotClient.query('select version() as version')
  ).rows[0].version;
  const publicTables = (
    await snapshotClient.query(`
      select c.relname as name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
        and c.relname <> 'app_schema_migrations'
      order by c.relname
    `)
  ).rows.map((row) => row.name);
  const bucketRows = (
    await snapshotClient.query(`
      select to_jsonb(bucket_row) as value
      from storage.buckets bucket_row
      order by bucket_row.id
    `)
  ).rows.map((row) => row.value);
  const objectRows = (
    await snapshotClient.query(`
      select to_jsonb(object_row) as value
      from storage.objects object_row
      order by object_row.bucket_id, object_row.name
    `)
  ).rows.map((row) => row.value);
  const publicRowCounts = {};

  for (const tableName of publicTables) {
    const escapedTableName = tableName.replaceAll('"', '""');
    const count = (
      await snapshotClient.query(
        `select count(*)::bigint as count from public."${escapedTableName}"`
      )
    ).rows[0].count;
    publicRowCounts[tableName] = Number(count);
  }
  const authRowCounts = Object.fromEntries(
    (
      await snapshotClient.query(`
        select 'users' as name, count(*)::bigint as count from auth.users
        union all
        select 'identities', count(*)::bigint from auth.identities
        union all
        select 'mfa_factors', count(*)::bigint from auth.mfa_factors
      `)
    ).rows.map((row) => [row.name, Number(row.count)])
  );

  const postgresEnvironment = getPostgresProcessEnvironment(connectionString);
  const dumpCommonArguments = [
    '--no-password',
    '--no-owner',
    '--no-privileges',
    `--snapshot=${snapshotId}`,
  ];
  const pgDump = postgresExecutable('pg_dump');

  await Promise.all([
    runCommand(
      pgDump,
      [
        ...dumpCommonArguments,
        '--format=custom',
        '--compress=9',
        `--file=${join(databaseDirectory, 'full.dump')}`,
      ],
      { env: postgresEnvironment }
    ),
    runCommand(
      pgDump,
      [
        ...dumpCommonArguments,
        '--schema=public',
        '--schema-only',
        '--format=plain',
        `--file=${join(databaseDirectory, 'public-schema.sql')}`,
      ],
      { env: postgresEnvironment }
    ),
    runCommand(
      pgDump,
      [
        ...dumpCommonArguments,
        '--schema=public',
        '--exclude-table=public.app_schema_migrations',
        '--data-only',
        '--format=plain',
        `--file=${join(databaseDirectory, 'public-data.sql')}`,
      ],
      { env: postgresEnvironment }
    ),
    runCommand(
      pgDump,
      [
        ...dumpCommonArguments,
        '--table=auth.users',
        '--table=auth.identities',
        '--table=auth.mfa_factors',
        '--data-only',
        '--format=plain',
        `--file=${join(databaseDirectory, 'auth-data.sql')}`,
      ],
      { env: postgresEnvironment }
    ),
  ]);

  if (snapshotConnectionError) {
    throw new Error(
      `La connexion PostgreSQL de l’instantané a été interrompue : ${snapshotConnectionError.message}`
    );
  }

  await snapshotClient.query('commit');
  await snapshotClient.end();
  snapshotClient = null;

  const storageManifest = await downloadStorageObjects({
    supabaseUrl,
    serviceRoleKey,
    buckets: bucketRows,
    objects: objectRows,
    targetDirectory: storageObjectDirectory,
  });
  await writeFile(
    join(storageDirectory, 'storage-manifest.json'),
    `${JSON.stringify(storageManifest, null, 2)}\n`,
    { mode: 0o600 }
  );

  await copyMigrations(
    resolve(process.cwd(), 'supabase/migrations'),
    join(payloadDirectory, 'migrations')
  );

  const databaseMetadata = {
    serverVersion: databaseVersion,
    publicTables,
    authTables: ['users', 'identities', 'mfa_factors'],
    publicRowCounts,
    authRowCounts,
  };
  await writeFile(
    join(databaseDirectory, 'database-metadata.json'),
    `${JSON.stringify(databaseMetadata, null, 2)}\n`,
    { mode: 0o600 }
  );

  const manifest = {
    format: 'project1-external-backup',
    version: 1,
    createdAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    source: {
      projectRef: sourceProjectRef,
      postgresVersion: databaseVersion,
    },
    retentionDays,
    database: {
      publicTables: publicTables.length,
      authTables: databaseMetadata.authTables.length,
    },
    storage: {
      buckets: bucketRows.length,
      objects: storageManifest.objects.length,
      bytes: storageManifest.objects.reduce(
        (total, object) => total + object.backup.bytes,
        0
      ),
    },
    files: await buildFileInventory(payloadDirectory, ['manifest.json']),
  };
  await writeFile(
    join(payloadDirectory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600 }
  );

  await createTarGzip(payloadDirectory, archivePath);
  await encryptFile(archivePath, partialPath, backupKey);
  await chmod(partialPath, 0o600);

  const verification = await decryptAndVerifyBackup(partialPath, backupKey);
  try {
    await validateDatabaseArtifacts(verification.extractedDirectory);
  } finally {
    await removeTemporaryDirectory(verification.temporaryDirectory);
  }

  await rename(partialPath, finalPath);
  await chmod(finalPath, 0o600);
  const removedFiles = await enforceRetention(backupDirectory, retentionDays);
  const finalStats = await stat(finalPath);
  const encryptedSha256 = await sha256File(finalPath);

  console.log(`Sauvegarde créée : ${finalPath}`);
  console.log(`Taille chiffrée : ${finalStats.size} octets`);
  console.log(`SHA-256 chiffré : ${encryptedSha256}`);
  console.log(
    `Contenu : ${publicTables.length} tables applicatives, ${storageManifest.objects.length} objets Storage.`
  );
  console.log(
    removedFiles.length > 0
      ? `Rétention : ${removedFiles.length} ancienne(s) sauvegarde(s) supprimée(s).`
      : `Rétention : aucune sauvegarde de plus de ${retentionDays} jours.`
  );
} catch (error) {
  if (snapshotClient) {
    await snapshotClient.query('rollback').catch(() => {});
    await snapshotClient.end().catch(() => {});
  }
  await rm(partialPath, { force: true }).catch(() => {});
  console.error(
    error instanceof Error ? error.message : 'Échec de la sauvegarde externe.'
  );
  process.exitCode = 1;
} finally {
  await removeTemporaryDirectory(workingDirectory);
}

async function downloadStorageObjects({
  supabaseUrl,
  serviceRoleKey,
  buckets,
  objects,
  targetDirectory,
}) {
  const backedUpObjects = [];

  for (const [index, object] of objects.entries()) {
    const objectName = String(object.name);
    const bucketId = String(object.bucket_id);
    const identifier = createHash('sha256')
      .update(`${bucketId}\0${objectName}`)
      .digest('hex')
      .slice(0, 20);
    const fileName = `${String(index + 1).padStart(6, '0')}-${identifier}.bin`;
    const targetPath = join(targetDirectory, fileName);
    const encodedPath = objectName
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
    const response = await fetch(
      `${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucketId)}/${encodedPath}`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );

    if (!response.ok || !response.body) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Téléchargement Storage impossible pour ${bucketId}/${objectName} (${response.status})${
          detail ? ` : ${detail.slice(0, 200)}` : ''
        }.`
      );
    }

    await pipeline(
      Readable.fromWeb(response.body),
      createWriteStream(targetPath, { mode: 0o600 })
    );
    const fileStats = await stat(targetPath);
    const expectedSize = Number(object.metadata?.size);

    if (Number.isFinite(expectedSize) && expectedSize !== fileStats.size) {
      throw new Error(
        `Taille Storage incohérente pour ${bucketId}/${objectName} : ${fileStats.size} au lieu de ${expectedSize}.`
      );
    }

    backedUpObjects.push({
      file: fileName,
      record: object,
      backup: {
        bytes: fileStats.size,
        sha256: await sha256File(targetPath),
        etag: response.headers.get('etag'),
        contentType:
          response.headers.get('content-type') ||
          object.metadata?.mimetype ||
          'application/octet-stream',
        cacheControl: response.headers.get('cache-control'),
      },
    });
  }

  return {
    buckets,
    objects: backedUpObjects,
  };
}

async function validateDatabaseArtifacts(extractedDirectory) {
  const databaseDirectory = join(extractedDirectory, 'database');
  await runCommand(postgresExecutable('pg_restore'), [
    '--list',
    join(databaseDirectory, 'full.dump'),
  ]);

  for (const fileName of [
    'public-schema.sql',
    'public-data.sql',
    'auth-data.sql',
    'database-metadata.json',
  ]) {
    const filePath = join(databaseDirectory, fileName);
    const fileStats = await stat(filePath);

    if (fileStats.size === 0) {
      throw new Error(`Artefact de base vide : ${fileName}.`);
    }
  }

  const storageManifest = JSON.parse(
    await readFile(
      join(extractedDirectory, 'storage', 'storage-manifest.json'),
      'utf8'
    )
  );

  for (const object of storageManifest.objects) {
    const objectPath = join(extractedDirectory, 'storage', 'objects', object.file);
    if ((await sha256File(objectPath)) !== object.backup.sha256) {
      throw new Error(`Objet Storage invalide : ${object.file}.`);
    }
  }
}
