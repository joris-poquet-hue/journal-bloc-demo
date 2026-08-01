#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const ENV_FILES = ['.env.production.local', '.env.local', '.env'];

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
  await client.query('begin read only');

  const functionState = await client.query(
    `select to_regprocedure(
       'public.preview_legacy_intervention_snapshot_report()'
     ) is not null as available`
  );

  let report;

  if (functionState.rows[0].available) {
    await client.query(
      `select
         set_config('request.jwt.claim.role', 'service_role', true),
         set_config(
           'request.jwt.claims',
           '{"role":"service_role"}',
           true
         )`
    );
    const result = await client.query(
      'select public.preview_legacy_intervention_snapshot_report() as report'
    );
    report = {
      ...result.rows[0].report,
      provisional: false,
      writePerformed: false,
    };
  } else {
    const result = await client.query(
      `select
         intervention.procedure_id,
         definition.version as definition_version,
         count(*)::integer as intervention_count,
         count(evaluation.intervention_id)::integer as evaluated_count,
         count(*) filter (
           where definition.id is null
         )::integer as definition_missing_count
       from public.interventions intervention
       left join public.surgical_intervention_definitions definition
         on definition.id = intervention.procedure_id
       left join public.intervention_evaluations evaluation
         on evaluation.intervention_id = intervention.id
       group by intervention.procedure_id, definition.version
       order by intervention.procedure_id`
    );

    report = {
      schemaVersion: 1,
      provisional: true,
      reason:
        'La migration Lot 4 n’est pas encore installée : le hash officiel et la compatibilité exacte des checklists seront disponibles après la simulation de schéma.',
      historicalInterventionCount: result.rows.reduce(
        (total, row) => total + row.intervention_count,
        0
      ),
      evaluatedInterventionCount: result.rows.reduce(
        (total, row) => total + row.evaluated_count,
        0
      ),
      definitionMissingCount: result.rows.reduce(
        (total, row) => total + row.definition_missing_count,
        0
      ),
      groups: result.rows.map((row) => ({
        procedureId: row.procedure_id,
        definitionVersion: row.definition_version,
        interventionCount: row.intervention_count,
        evaluatedCount: row.evaluated_count,
        definitionMissingCount: row.definition_missing_count,
      })),
      reportHash: null,
      writePerformed: false,
    };
  }

  console.log(JSON.stringify(report, null, 2));
  await client.query('rollback');
} catch (error) {
  await client.query('rollback').catch(() => {});
  throw error;
} finally {
  await client.end().catch(() => {});
}

function loadEnv() {
  const envFile = ENV_FILES.map((filePath) => resolve(process.cwd(), filePath)).find(
    (filePath) => existsSync(filePath)
  );

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
