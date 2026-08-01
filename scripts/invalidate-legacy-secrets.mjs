#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_ENV_FILES = ['.env.local', '.env.production.local', '.env'];
const applyChanges = process.argv.includes('--apply');
const explicitEnvFile = getArgValue('--env-file');

loadEnv(explicitEnvFile);

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const profiles = await supabaseRestRequest('profiles', {
  searchParams: {
    auth_user_id: 'not.is.null',
    order: 'role.asc,last_name.asc,first_name.asc',
    select: 'id,auth_user_id,role,login_id',
  },
});

console.log(
  `\nLegacy credential invalidation (${applyChanges ? 'apply' : 'dry-run'})`
);
console.log('------------------------------------------------------------');

for (const profile of profiles) {
  console.log(`- ${profile.login_id}: rotate credential and require recovery`);

  if (!applyChanges) {
    continue;
  }

  const randomPassword = `${randomBytes(32).toString('base64url')}!Aa9`;

  await supabaseAuthRequest(
    `admin/users/${encodeURIComponent(profile.auth_user_id)}`,
    {
      body: { password: randomPassword },
      method: 'PUT',
    }
  );
  await supabaseRestRequest('profiles', {
    body: { must_change_password: true },
    headers: { Prefer: 'return=minimal' },
    method: 'PATCH',
    searchParams: { id: `eq.${profile.id}` },
  });
}

console.log(
  applyChanges
    ? '\nLegacy credentials invalidated. Users must use “Mot de passe oublié ?”.'
    : '\nDry run only. Re-run with --apply after reviewing the account list.'
);

function getArgValue(name) {
  return process.argv
    .slice(2)
    .find((arg) => arg.startsWith(`${name}=`))
    ?.split('=')
    .slice(1)
    .join('=');
}

async function supabaseRestRequest(path, options = {}) {
  return supabaseRequest(`${supabaseUrl}/rest/v1/${path}`, options);
}

async function supabaseAuthRequest(path, options = {}) {
  return supabaseRequest(`${supabaseUrl}/auth/v1/${path}`, options);
}

async function supabaseRequest(baseUrl, options = {}) {
  const searchParams = new URLSearchParams(options.searchParams ?? {});
  const query = searchParams.toString();
  const response = await fetch(`${baseUrl}${query ? `?${query}` : ''}`, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
    method: options.method ?? 'GET',
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      payload?.message ||
        payload?.msg ||
        payload?.error ||
        `Supabase request failed with status ${response.status}`
    );
  }

  return payload;
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

    if (key && process.env[key] == null) {
      process.env[key] = rawValue.replace(/^["']|["']$/g, '');
    }
  }
}
