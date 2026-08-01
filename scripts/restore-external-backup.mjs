#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import {
  DEFAULT_BACKUP_DIRECTORY,
  assertPostgresTools,
  decryptAndVerifyBackup,
  extractProjectReference,
  findLatestBackup,
  getBackupKey,
  getPostgresConnectionString,
  getPostgresProcessEnvironment,
  loadEnvironment,
  parseCliArguments,
  postgresExecutable,
  removeTemporaryDirectory,
  requireEnvironment,
  runCommand,
  stripSslMode,
} from './external-backup-lib.mjs';

const args = parseCliArguments();
const backupDirectory = resolve(
  String(args.get('backup-dir') || process.env.PROJECT1_BACKUP_DIR || DEFAULT_BACKUP_DIRECTORY)
);
const explicitBackupFile = args.get('file');
const backupPath = explicitBackupFile
  ? resolve(String(explicitBackupFile))
  : await findLatestBackup(backupDirectory);

if (!backupPath || !existsSync(backupPath)) {
  throw new Error(
    'Aucune sauvegarde trouvée. Utilisez --file=/chemin/sauvegarde.p1backup.'
  );
}

await assertPostgresTools();
const backupKey = await getBackupKey();
const verification = await decryptAndVerifyBackup(backupPath, backupKey);
let targetClient;

try {
  const { manifest, extractedDirectory } = verification;
  const databaseDirectory = join(extractedDirectory, 'database');
  await runCommand(postgresExecutable('pg_restore'), [
    '--list',
    join(databaseDirectory, 'full.dump'),
  ]);

  if (!args.get('apply')) {
    console.log(`Sauvegarde valide : ${backupPath}`);
    console.log(`Créée le : ${manifest.createdAt}`);
    console.log(
      `Contenu : ${manifest.database.publicTables} tables applicatives, ${manifest.storage.objects} objets Storage.`
    );
    console.log('Aucune donnée n’a été restaurée : option --apply absente.');
  } else {
    if (!args.get('replace-existing')) {
    throw new Error(
      'La restauration remplace les données de la cible. Ajoutez explicitement --replace-existing.'
    );
    }

  const targetEnvFile = args.get('target-env');

  if (!targetEnvFile) {
    throw new Error(
      'La cible doit être explicite : --target-env=/chemin/vers/.env.test.local.'
    );
  }

  const selectedTargetEnv = await loadEnvironment({
    explicitEnvFile: String(targetEnvFile),
    override: true,
  });

  if (!selectedTargetEnv) {
    throw new Error(`Fichier cible introuvable : ${targetEnvFile}.`);
  }

  const connectionString = getPostgresConnectionString();
  const targetSupabaseUrl = requireEnvironment('SUPABASE_URL').replace(/\/$/, '');
  const targetServiceRoleKey = requireEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  const targetProjectRef = extractProjectReference(targetSupabaseUrl);

  const sameProjectDrillAllowed =
    args.get('allow-same-project-drill') &&
    process.env.PROJECT1_RESTORE_DRILL === '1';

  if (
    targetProjectRef === manifest.source.projectRef &&
    !sameProjectDrillAllowed
  ) {
    throw new Error(
      'Restauration refusée : la cible est le projet ayant produit la sauvegarde.'
    );
  }

  targetClient = new pg.Client({
    connectionString: stripSslMode(connectionString),
    ssl: { rejectUnauthorized: false },
  });
  await targetClient.connect();

  await applyBundledMigrations(
    targetClient,
    join(extractedDirectory, 'migrations')
  );
  await ensureSupabaseApiPrivileges(targetClient);

  const databaseMetadata = JSON.parse(
    await readFile(join(databaseDirectory, 'database-metadata.json'), 'utf8')
  );
  const prepareRestorePath = join(
    verification.temporaryDirectory,
    'prepare-restore.sql'
  );
  const authRestorePath = join(
    verification.temporaryDirectory,
    'auth-data.restore.sql'
  );
  const publicRestorePath = join(
    verification.temporaryDirectory,
    'public-data.restore.sql'
  );
  await writeFile(
    prepareRestorePath,
    buildPrepareRestoreSql(databaseMetadata.publicTables),
    { mode: 0o600 }
  );
  const publicDumpSql = await readFile(
    join(databaseDirectory, 'public-data.sql'),
    'utf8'
  );
  await writeFile(
    publicRestorePath,
    publicDumpSql.replace(
      /^ALTER TABLE public\..+\s+(?:DISABLE|ENABLE) TRIGGER ALL;\s*$/gim,
      ''
    ),
    { mode: 0o600 }
  );
  const authDumpSql = await readFile(
    join(databaseDirectory, 'auth-data.sql'),
    'utf8'
  );
  await writeFile(
    authRestorePath,
    authDumpSql.replace(
      /^ALTER TABLE auth\..+\s+(?:DISABLE|ENABLE) TRIGGER ALL;\s*$/gim,
      ''
    ),
    { mode: 0o600 }
  );

  await runCommand(
    postgresExecutable('psql'),
    [
      '--no-password',
      '--no-psqlrc',
      '--single-transaction',
      '--set=ON_ERROR_STOP=1',
      `--file=${prepareRestorePath}`,
      `--file=${authRestorePath}`,
      `--file=${publicRestorePath}`,
    ],
    { env: getPostgresProcessEnvironment(connectionString) }
  );

  const storageManifest = JSON.parse(
    await readFile(
      join(extractedDirectory, 'storage', 'storage-manifest.json'),
      'utf8'
    )
  );
  await restoreStorage({
    pgClient: targetClient,
    supabaseUrl: targetSupabaseUrl,
    serviceRoleKey: targetServiceRoleKey,
    storageManifest,
    objectDirectory: join(extractedDirectory, 'storage', 'objects'),
  });

  await verifyRestoredDatabase(targetClient, databaseMetadata);
  await verifyRestoredStorage({
    supabaseUrl: targetSupabaseUrl,
    serviceRoleKey: targetServiceRoleKey,
    storageManifest,
  });
  await targetClient.query("notify pgrst, 'reload schema'");

  console.log(`Restauration validée sur le projet cible ${targetProjectRef}.`);
  console.log(
    `Données : ${Object.values(databaseMetadata.publicRowCounts).reduce(
      (total, value) => total + Number(value),
      0
    )} lignes applicatives.`
  );
  console.log(`Storage : ${storageManifest.objects.length} objet(s).`);
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Échec de la restauration.'
  );
  process.exitCode = 1;
} finally {
  await targetClient?.end().catch(() => {});
  await removeTemporaryDirectory(verification.temporaryDirectory);
}

async function applyBundledMigrations(client, migrationDirectory) {
  const files = (await readdir(migrationDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  if (files.length === 0) {
    throw new Error('Aucune migration SQL dans la sauvegarde.');
  }

  await client.query('begin');

  try {
    await client.query(`
      create table if not exists public.app_schema_migrations (
        migration_name text primary key,
        applied_at timestamptz not null default now()
      )
    `);
    await client.query(
      'alter table public.app_schema_migrations enable row level security'
    );
    const appliedRows = await client.query(
      'select migration_name from public.app_schema_migrations'
    );
    const applied = new Set(appliedRows.rows.map((row) => row.migration_name));

    for (const fileName of files) {
      const migrationName = `supabase/migrations/${fileName}`;

      if (applied.has(migrationName) || applied.has(fileName)) {
        continue;
      }

      const sql = await readFile(join(migrationDirectory, fileName), 'utf8');
      await client.query(sql);
      await client.query(
        'insert into public.app_schema_migrations (migration_name) values ($1)',
        [migrationName]
      );
    }

    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  }
}

async function ensureSupabaseApiPrivileges(client) {
  await client.query('begin');

  try {
    await client.query(
      'grant usage on schema public to anon, authenticated, service_role'
    );
    await client.query(
      'grant select, insert, update, delete on all tables in schema public to anon, authenticated, service_role'
    );
    await client.query(
      'grant usage, select on all sequences in schema public to anon, authenticated, service_role'
    );
    await client.query(
      'grant execute on all routines in schema public to anon, authenticated, service_role'
    );
    await client.query(
      'alter default privileges in schema public grant select, insert, update, delete on tables to anon, authenticated, service_role'
    );
    await client.query(
      'alter default privileges in schema public grant usage, select on sequences to anon, authenticated, service_role'
    );
    await client.query(
      'alter default privileges in schema public grant execute on routines to anon, authenticated, service_role'
    );
    await client.query('commit');
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  }
}

function buildPrepareRestoreSql(publicTables) {
  const qualifiedPublicTables = publicTables.map(
    (tableName) => `public.${quoteIdentifier(tableName)}`
  );
  const statements = [
    "set session_replication_role = 'replica';",
    'truncate table auth.identities, auth.mfa_factors, auth.users cascade;',
  ];

  if (qualifiedPublicTables.length > 0) {
    statements.push(
      `truncate table ${qualifiedPublicTables.join(', ')} restart identity cascade;`
    );
  }

  return `${statements.join('\n')}\n`;
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

async function restoreStorage({
  pgClient,
  supabaseUrl,
  serviceRoleKey,
  storageManifest,
  objectDirectory,
}) {
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bucketIds = storageManifest.buckets.map((bucket) => String(bucket.id));

  if (bucketIds.length > 0) {
    const existingObjects = await pgClient.query(
      'select bucket_id, name from storage.objects where bucket_id = any($1::text[]) order by bucket_id, name',
      [bucketIds]
    );

    for (const bucketId of bucketIds) {
      const names = existingObjects.rows
        .filter((row) => row.bucket_id === bucketId)
        .map((row) => row.name);

      for (let index = 0; index < names.length; index += 100) {
        const { error } = await supabase.storage
          .from(bucketId)
          .remove(names.slice(index, index + 100));

        if (error) {
          throw new Error(`Nettoyage du bucket ${bucketId} impossible : ${error.message}`);
        }
      }
    }
  }

  for (const bucket of storageManifest.buckets) {
    const bucketId = String(bucket.id);
    const options = {
      public: Boolean(bucket.public),
      fileSizeLimit: bucket.file_size_limit ?? undefined,
      allowedMimeTypes: bucket.allowed_mime_types ?? undefined,
    };
    const { data: existingBucket } = await supabase.storage.getBucket(bucketId);
    const bucketResult = existingBucket
      ? await supabase.storage.updateBucket(bucketId, options)
      : await supabase.storage.createBucket(bucketId, options);

    if (bucketResult.error) {
      throw new Error(
        `Configuration du bucket ${bucketId} impossible : ${bucketResult.error.message}`
      );
    }
  }

  for (const object of storageManifest.objects) {
    const bucketId = String(object.record.bucket_id);
    const objectName = String(object.record.name);
    const content = await readFile(join(objectDirectory, object.file));
    const rawCacheControl =
      object.record.metadata?.cacheControl || object.backup.cacheControl || '';
    const cacheControl = String(rawCacheControl).match(/(\d+)/)?.[1] || '3600';
    const { error } = await supabase.storage.from(bucketId).upload(
      objectName,
      content,
      {
        upsert: true,
        contentType: object.backup.contentType,
        cacheControl: String(cacheControl),
        metadata: object.record.user_metadata ?? undefined,
      }
    );

    if (error) {
      throw new Error(
        `Restauration de ${bucketId}/${objectName} impossible : ${error.message}`
      );
    }

    await pgClient.query(
      `update storage.objects
       set owner_id = $3,
           user_metadata = $4
       where bucket_id = $1 and name = $2`,
      [
        bucketId,
        objectName,
        object.record.owner_id ?? null,
        object.record.user_metadata ?? null,
      ]
    );
  }
}

async function verifyRestoredDatabase(client, metadata) {
  for (const [tableName, expectedCount] of Object.entries(
    metadata.publicRowCounts
  )) {
    const result = await client.query(
      `select count(*)::bigint as count from public.${quoteIdentifier(tableName)}`
    );
    const actualCount = Number(result.rows[0].count);

    if (actualCount !== Number(expectedCount)) {
      throw new Error(
        `Contrôle de restauration échoué pour public.${tableName} : ${actualCount} au lieu de ${expectedCount}.`
      );
    }
  }

  for (const [tableName, expectedCount] of Object.entries(metadata.authRowCounts)) {
    const result = await client.query(
      `select count(*)::bigint as count from auth.${quoteIdentifier(tableName)}`
    );
    const actualCount = Number(result.rows[0].count);

    if (actualCount !== Number(expectedCount)) {
      throw new Error(
        `Contrôle de restauration échoué pour auth.${tableName} : ${actualCount} au lieu de ${expectedCount}.`
      );
    }
  }
}

async function verifyRestoredStorage({
  supabaseUrl,
  serviceRoleKey,
  storageManifest,
}) {
  for (const object of storageManifest.objects) {
    const bucketId = String(object.record.bucket_id);
    const objectName = String(object.record.name);
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

    if (!response.ok) {
      throw new Error(
        `Contrôle Storage impossible pour ${bucketId}/${objectName} (${response.status}).`
      );
    }

    const content = Buffer.from(await response.arrayBuffer());
    const checksum = createHash('sha256').update(content).digest('hex');

    if (checksum !== object.backup.sha256) {
      throw new Error(
        `Contrôle Storage échoué pour ${bucketId}/${objectName}.`
      );
    }
  }
}
