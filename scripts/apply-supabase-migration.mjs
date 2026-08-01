#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const DEFAULT_ENV_FILES = ['.env.production.local', '.env.local', '.env'];
const DEFAULT_MIGRATION_DIRECTORY = 'supabase/migrations';
const isDryRun = process.argv.slice(2).includes('--dry-run');
const requireTestDatabase = process.argv
  .slice(2)
  .includes('--require-test-database');
const applyToTestDatabase = process.argv
  .slice(2)
  .includes('--apply-to-test-database');
const useTestDatabase = requireTestDatabase || applyToTestDatabase;
const reportLegacyInterventions = process.argv
  .slice(2)
  .includes('--report-legacy-interventions');

const migrationFile = process.argv
  .slice(2)
  .find((arg) => arg.startsWith('--file='))
  ?.split('=')
  .slice(1)
  .join('=');
const explicitEnvFile = process.argv
  .slice(2)
  .find((arg) => arg.startsWith('--env-file='))
  ?.split('=')
  .slice(1)
  .join('=');

loadEnv(explicitEnvFile);

const connectionString = useTestDatabase
  ? process.env.SUPABASE_TEST_POSTGRES_URL
  : process.env.SUPABASE_POSTGRES_URL_NON_POOLING ||
    process.env.SUPABASE_POSTGRES_URL;
const migrationFiles = migrationFile
  ? [migrationFile]
  : readdirSync(resolve(process.cwd(), DEFAULT_MIGRATION_DIRECTORY))
      .filter((fileName) => fileName.endsWith('.sql'))
      .sort((left, right) => left.localeCompare(right))
      .map((fileName) => `${DEFAULT_MIGRATION_DIRECTORY}/${fileName}`);

if (!connectionString) {
  console.error(
    useTestDatabase
      ? 'SUPABASE_TEST_POSTGRES_URL est requis pour valider les migrations sur la base de test isolée.'
      : 'Missing SUPABASE_POSTGRES_URL_NON_POOLING or SUPABASE_POSTGRES_URL.'
  );
  process.exit(1);
}

if (requireTestDatabase && !isDryRun) {
  console.error(
    '--require-test-database est réservé aux migrations exécutées avec --dry-run.'
  );
  process.exit(1);
}

if (applyToTestDatabase && isDryRun) {
  console.error(
    '--apply-to-test-database applique les migrations durablement et ne doit pas être combiné avec --dry-run.'
  );
  process.exit(1);
}

if (
  useTestDatabase &&
  [process.env.SUPABASE_POSTGRES_URL_NON_POOLING, process.env.SUPABASE_POSTGRES_URL]
    .filter(Boolean)
    .includes(connectionString)
) {
  console.error(
    'La base de test isolée doit utiliser une URL distincte de la production.'
  );
  process.exit(1);
}

if (useTestDatabase) {
  const databaseUrl = new URL(connectionString);
  const isLocalDatabase = ['127.0.0.1', '::1', 'localhost'].includes(
    databaseUrl.hostname
  );

  if (!isLocalDatabase && process.env.ALLOW_REMOTE_SUPABASE_TESTS !== '1') {
    console.error(
      'La validation distante exige ALLOW_REMOTE_SUPABASE_TESTS=1 et doit viser uniquement la base isolée.'
    );
    process.exit(1);
  }
}

if (migrationFiles.length === 0) {
  console.error(`No SQL migration found in ${DEFAULT_MIGRATION_DIRECTORY}.`);
  process.exit(1);
}

for (const filePath of migrationFiles) {
  if (!existsSync(resolve(process.cwd(), filePath))) {
    console.error(`Migration file not found: ${resolve(process.cwd(), filePath)}`);
    process.exit(1);
  }
}

const client = new pg.Client({
  connectionString: stripSslMode(connectionString),
  ssl: {
    rejectUnauthorized: false,
  },
});

try {
  await client.connect();
  await client.query('begin');
  await client.query(`
    create table if not exists public.app_schema_migrations (
      migration_name text primary key,
      applied_at timestamptz not null default now()
    )
  `);
  await client.query(
    'alter table public.app_schema_migrations enable row level security'
  );
  const appliedMigrationRows = await client.query(
    'select migration_name from public.app_schema_migrations'
  );
  const appliedMigrationNames = new Set(
    appliedMigrationRows.rows.map((row) => row.migration_name)
  );
  const newlyAppliedFiles = [];
  let legacyInterventionReport = null;

  for (const filePath of migrationFiles) {
    if (appliedMigrationNames.has(filePath)) {
      continue;
    }

    const sql = stripTopLevelTransactionStatements(
      readFileSync(resolve(process.cwd(), filePath), 'utf8')
    );
    await client.query(sql);
    await client.query(
      'insert into public.app_schema_migrations (migration_name) values ($1)',
      [filePath]
    );
    newlyAppliedFiles.push(filePath);
  }

  if (reportLegacyInterventions) {
    if (!isDryRun) {
      throw new Error(
        '--report-legacy-interventions is restricted to dry-run migrations.'
      );
    }

    await client.query(
      "select set_config('request.jwt.claim.role', 'service_role', true)"
    );
    await client.query(
      `select set_config(
        'request.jwt.claims',
        '{"role":"service_role"}',
        true
      )`
    );
    const reportResult = await client.query(
      'select public.preview_legacy_intervention_snapshot_report() as report'
    );
    legacyInterventionReport = reportResult.rows[0]?.report ?? null;
  }

  await client.query(isDryRun ? 'rollback' : 'commit');

  if (legacyInterventionReport) {
    console.log(
      `Legacy intervention report (not persisted): ${JSON.stringify(
        legacyInterventionReport,
        null,
        2
      )}`
    );
  }

  for (const filePath of newlyAppliedFiles) {
    console.log(
      `${isDryRun ? 'Validated' : 'Applied'} migration: ${filePath}`
    );
  }

  console.log(
    newlyAppliedFiles.length > 0
      ? `${isDryRun ? 'Validated' : 'Applied'} ${newlyAppliedFiles.length} migration(s)${
          isDryRun ? ' without persisting changes.' : '.'
        }`
      : 'Database schema is already up to date.'
  );
} catch (error) {
  await client.query('rollback').catch(() => {});
  console.error(
    error instanceof Error ? error.message : 'Unable to apply migration.'
  );
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}

function loadEnv(envFile) {
  const envFiles = envFile ? [envFile] : DEFAULT_ENV_FILES;
  const selectedEnvFile = envFiles
    .map((filePath) => resolve(process.cwd(), filePath))
    .find((filePath) => existsSync(filePath));

  if (!selectedEnvFile) {
    return;
  }

  const content = readFileSync(selectedEnvFile, 'utf8');

  for (const line of content.split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim();

    if (!key || process.env[key] != null) {
      continue;
    }

    process.env[key] = rawValue.replace(/^["']|["']$/g, '');
  }
}

function stripSslMode(value) {
  try {
    const url = new URL(value);
    url.searchParams.delete('sslmode');

    return url.toString();
  } catch {
    return value;
  }
}

function stripTopLevelTransactionStatements(sql) {
  return sql.replace(/^\s*(?:begin|commit)\s*;\s*$/gim, '');
}
