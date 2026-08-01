#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const DEFAULT_ENV_FILES = ['.env.local', '.env.production.local', '.env'];
const DEFAULT_OUTPUT_FILE = 'supabase/auth-users.local.json';

const explicitEnvFile = getArgValue('--env-file');
const outputFile = getArgValue('--output') || DEFAULT_OUTPUT_FILE;

loadEnv(explicitEnvFile);

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add them to the environment or pass --env-file=.env.local.'
  );
  process.exit(1);
}
const profiles = await supabaseRestRequest(
  'profiles',
  {
    searchParams: {
      auth_user_id: 'is.null',
      order: 'role.asc,last_name.asc,first_name.asc',
      select: 'id,role,first_name,last_name,login_id',
    },
  }
);
const resolvedOutputFile = resolve(process.cwd(), outputFile);
const existingEntries = loadExistingEntries(resolvedOutputFile);
const entries = profiles.map((profile) => {
  const existingEntry = existingEntries.find(
    (entry) => entry.profileId === profile.id
  );

  return {
    profileId: profile.id,
    role: profile.role,
    loginId: profile.login_id,
    firstName: profile.first_name,
    lastName: profile.last_name,
    email: existingEntry?.email ?? '',
    invite: existingEntry?.invite ?? true,
  };
});

mkdirSync(dirname(resolvedOutputFile), { recursive: true });
writeFileSync(
  resolvedOutputFile,
  `${JSON.stringify({ users: entries }, null, 2)}\n`
);

console.log(`Prepared ${entries.length} auth user entries: ${outputFile}`);

if (entries.some((entry) => !entry.email)) {
  console.log('Fill the email fields before running auth:invite.');
}

function getArgValue(name) {
  return process.argv
    .slice(2)
    .find((arg) => arg.startsWith(`${name}=`))
    ?.split('=')
    .slice(1)
    .join('=');
}

function loadExistingEntries(filePath) {
  if (!existsSync(filePath)) {
    return [];
  }

  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf8'));

    return Array.isArray(parsed?.users) ? parsed.users : [];
  } catch {
    return [];
  }
}

async function supabaseRestRequest(path, options = {}) {
  const searchParams = new URLSearchParams(options.searchParams || {});
  const queryString = searchParams.toString();
  const response = await fetch(
    `${supabaseUrl}/rest/v1/${path}${queryString ? `?${queryString}` : ''}`,
    {
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...options.headers,
      },
      method: options.method || 'GET',
    }
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message =
      payload?.message ||
      payload?.error ||
      `Supabase request failed with status ${response.status}`;

    throw new Error(`${path}: ${message}`);
  }

  const text = await response.text();

  return text ? JSON.parse(text) : null;
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
