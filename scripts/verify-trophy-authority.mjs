#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

const ENV_FILES = ['.env.production.local', '.env.local', '.env'];
const EXPECTED_MIGRATIONS = [
  'supabase/migrations/202607290000_repair_legacy_trophy_definitions.sql',
  'supabase/migrations/202607290001_trophy_authority_versioning_notifications.sql',
];
const EXPECTED_TROPHIES = new Map([
  [
    'admin-trophy-1782840984014',
    {
      autonomyMinimum: 80,
      diamondThreshold: 31,
      label: 'Salpingectomie',
    },
  ],
  [
    'admin-trophy-1783252388276',
    {
      autonomyMinimum: 90,
      diamondThreshold: 16,
      label: 'Aspiration',
    },
  ],
]);

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

  const migrationResult = await client.query(
    `select migration_name
     from public.app_schema_migrations
     where migration_name = any($1::text[])`,
    [EXPECTED_MIGRATIONS]
  );
  assert.deepEqual(
    new Set(migrationResult.rows.map((row) => row.migration_name)),
    new Set(EXPECTED_MIGRATIONS),
    'Les deux migrations de trophées doivent être enregistrées.'
  );

  const trophyResult = await client.query(
    `select
       id,
       title,
       status,
       definition ->> 'description' as description,
       (definition #>> '{levels,3,threshold}')::numeric as diamond_threshold,
       (definition #>> '{levels,3,autonomyMin}')::numeric as autonomy_minimum
     from public.trophy_definitions
     where id = any($1::text[])`,
    [[...EXPECTED_TROPHIES.keys()]]
  );
  assert.equal(
    trophyResult.rows.length,
    EXPECTED_TROPHIES.size,
    'Les deux trophées corrigés doivent être présents.'
  );

  for (const row of trophyResult.rows) {
    const expected = EXPECTED_TROPHIES.get(row.id);
    assert.ok(expected, `Trophée inattendu : ${row.id}`);
    assert.equal(row.status, 'active', `${expected.label} doit rester actif.`);
    assert.equal(
      typeof row.description,
      'string',
      `${expected.label} doit exposer une description textuelle, éventuellement vide.`
    );
    assert.equal(Number(row.diamond_threshold), expected.diamondThreshold);
    assert.equal(Number(row.autonomy_minimum), expected.autonomyMinimum);
  }

  const authorityResult = await client.query(
    `select
       to_regclass('public.trophy_definition_drafts') is not null
         as drafts_table,
       to_regclass('public.trophy_definition_versions') is not null
         as versions_table,
       to_regclass('public.user_notifications') is not null
         as notifications_table,
       to_regclass('public.push_subscriptions') is not null
         as subscriptions_table,
       to_regprocedure(
         'public.publish_trophy_definition_draft(text,bigint,bigint,text)'
       ) is not null as publication_function,
       to_regprocedure(
         'public.claim_pending_push_notifications(integer)'
       ) is not null as push_claim_function,
       not has_table_privilege(
         'authenticated',
         'public.trophy_awards',
         'INSERT'
       ) as awards_insert_revoked,
       not has_table_privilege(
         'authenticated',
         'public.trophy_awards',
         'UPDATE'
       ) as awards_update_revoked,
       not has_table_privilege(
         'authenticated',
         'public.trophy_awards',
         'DELETE'
       ) as awards_delete_revoked`
  );

  for (const [key, value] of Object.entries(authorityResult.rows[0])) {
    assert.equal(value, true, `Contrôle d’autorité non satisfait : ${key}`);
  }

  const storageResult = await client.query(
    `select public
     from storage.buckets
     where id = 'trophy-images'`
  );
  assert.equal(
    storageResult.rows.length,
    1,
    'Le bucket trophy-images doit exister.'
  );
  assert.equal(
    storageResult.rows[0].public,
    false,
    'Le bucket trophy-images doit être privé.'
  );

  const countResult = await client.query(
    `select
       (select count(*)::integer
        from public.trophy_definition_versions) as published_versions,
       (select count(*)::integer
        from public.trophy_awards) as awards,
       (select count(*)::integer
        from public.user_notifications) as notifications,
       (select count(*)::integer
        from public.push_subscriptions
        where is_active) as active_push_subscriptions`
  );

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        migrations: EXPECTED_MIGRATIONS.length,
        correctedTrophies: trophyResult.rows.map((row) => ({
          id: row.id,
          title: row.title,
          diamondThreshold: Number(row.diamond_threshold),
          autonomyMinimum: Number(row.autonomy_minimum),
        })),
        ...countResult.rows[0],
      },
      null,
      2
    )
  );

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

  const content = readFileSync(envFile, 'utf8');

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

    if (key && process.env[key] == null) {
      process.env[key] = rawValue.replace(/^["']|["']$/g, '');
    }
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
