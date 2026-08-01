#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_ENV_FILES = ['.env.local', '.env.production.local', '.env'];
const TABLES = [
  'profiles',
  'senior_internal_assignments',
  'surgical_intervention_definitions',
  'interventions',
  'evaluation_requests',
  'intervention_evaluations',
  'notebook_documents',
  'trophy_definitions',
  'trophy_awards',
  'activity_log',
  'auth_rate_limits',
  'app_schema_migrations',
];

const explicitEnvFile = process.argv
  .slice(2)
  .find((arg) => arg.startsWith('--env-file='))
  ?.split('=')
  .slice(1)
  .join('=');

loadEnv(explicitEnvFile);

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add them to the environment or pass --env-file=.env.local.'
  );
  process.exit(1);
}

console.log('\nDurable backend row counts');
console.log('--------------------------');

for (const table of TABLES) {
  const count = await countRows(table);
  console.log(`${table}: ${count}`);
}

async function countRows(table) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?select=*`, {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      Prefer: 'count=exact',
      Range: '0-0',
      'Range-Unit': 'items',
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message =
      payload?.message ||
      payload?.error ||
      `Supabase request failed with status ${response.status}`;

    throw new Error(`${table}: ${message}`);
  }

  const contentRange = response.headers.get('content-range');
  const [, count = '0'] = contentRange?.split('/') ?? [];

  return count === '*' ? 'unknown' : count;
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
