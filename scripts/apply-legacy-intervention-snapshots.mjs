#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const ENV_FILES = ['.env.production.local', '.env.local', '.env'];
const SERVER_CONFIRMATION = 'APPLIQUER HISTORIQUE HERITE';
const isApply = process.argv.slice(2).includes('--apply');
const ownerValidationConfirmed = process.argv
  .slice(2)
  .includes('--confirm-owner-validation');
const expectedReportHash = process.argv
  .slice(2)
  .find((argument) => argument.startsWith('--report-hash='))
  ?.slice('--report-hash='.length);

if (!/^[a-f0-9]{64}$/.test(expectedReportHash ?? '')) {
  throw new Error(
    'Un hash de rapport SHA-256 valide est requis avec --report-hash=...'
  );
}

if (isApply && !ownerValidationConfirmed) {
  throw new Error(
    'L’écriture exige --confirm-owner-validation après validation métier explicite.'
  );
}

loadEnv();

const connectionString =
  process.env.SUPABASE_POSTGRES_URL_NON_POOLING ||
  process.env.SUPABASE_POSTGRES_URL;

if (!connectionString) {
  throw new Error(
    'SUPABASE_POSTGRES_URL_NON_POOLING ou SUPABASE_POSTGRES_URL est requis.'
  );
}

const client = new pg.Client({
  connectionString: stripSslMode(connectionString),
  ssl: { rejectUnauthorized: false },
});

try {
  await client.connect();
  await client.query('begin');

  const adminResult = await client.query(
    `select profile.id, profile.auth_user_id
     from public.profiles profile
     where profile.role = 'admin'::public.app_role
       and profile.is_active
       and profile.auth_user_id is not null
     order by profile.created_at, profile.id
     limit 1`
  );
  const admin = adminResult.rows[0];

  if (!admin) {
    throw new Error('Aucun Administrateur actif ne peut valider l’opération.');
  }

  const temporarySessionId = randomUUID();
  const temporaryTokenHash = createHash('sha256')
    .update(`legacy-snapshot-operation:${temporarySessionId}`)
    .digest('hex');

  await client.query(
    `insert into public.application_sessions (
       id,
       profile_id,
       auth_user_id,
       token_hash,
       client_kind,
       idle_timeout_seconds
     ) values ($1::uuid, $2::uuid, $3::uuid, $4, 'web', 1800)`,
    [
      temporarySessionId,
      admin.id,
      admin.auth_user_id,
      temporaryTokenHash,
    ]
  );
  await client.query(
    `select
       set_config('request.jwt.claim.sub', $1, true),
       set_config('request.jwt.claim.role', 'authenticated', true),
       set_config(
         'request.jwt.claims',
         jsonb_build_object(
           'sub', $1::text,
           'role', 'authenticated',
           'app_session_id', $2::text
         )::text,
         true
       )`,
    [admin.auth_user_id, temporarySessionId]
  );
  await client.query('set local role authenticated');

  const beforeResult = await client.query(
    'select public.preview_legacy_intervention_snapshot_report() as report'
  );
  const beforeReport = beforeResult.rows[0].report;

  if (beforeReport.reportHash !== expectedReportHash) {
    throw new Error(
      `Le rapport a changé : ${beforeReport.reportHash}. Aucune écriture effectuée.`
    );
  }

  const applicationResult = await client.query(
    `select public.apply_legacy_intervention_snapshots(
       $1::text,
       $2::text
     ) as result`,
    [expectedReportHash, SERVER_CONFIRMATION]
  );
  const afterResult = await client.query(
    'select public.preview_legacy_intervention_snapshot_report() as report'
  );

  await client.query('reset role');
  await client.query(
    'delete from public.application_sessions where id = $1::uuid',
    [temporarySessionId]
  );

  const integrityResult = await client.query(
    `select
       count(*)::integer as total_interventions,
       count(*) filter (
         where definition_snapshot is null
       )::integer as interventions_without_snapshot,
       count(*) filter (
         where autonomy_score is not null
           and autonomy_score_formula_id is null
       )::integer as scores_without_formula
     from public.interventions`
  );

  await client.query(isApply ? 'commit' : 'rollback');

  console.log(
    JSON.stringify(
      {
        mode: isApply ? 'applied' : 'dry-run',
        persisted: isApply,
        before: beforeReport,
        result: applicationResult.rows[0].result,
        after: afterResult.rows[0].report,
        integrity: integrityResult.rows[0],
        temporarySessionPersisted: false,
      },
      null,
      2
    )
  );
} catch (error) {
  await client.query('rollback').catch(() => {});
  throw error;
} finally {
  await client.end().catch(() => {});
}

function loadEnv() {
  const envFile = ENV_FILES.map((filePath) =>
    resolve(process.cwd(), filePath)
  ).find((filePath) => existsSync(filePath));

  if (!envFile) {
    return;
  }

  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');

    if (separatorIndex < 1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (process.env[key] == null) {
      process.env[key] = value.replace(/^["']|["']$/g, '');
    }
  }
}

function stripSslMode(value) {
  const url = new URL(value);
  url.searchParams.delete('sslmode');
  return url.toString();
}
