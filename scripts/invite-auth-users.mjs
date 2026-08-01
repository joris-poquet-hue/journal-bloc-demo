#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_ENV_FILES = ['.env.local', '.env.production.local', '.env'];
const DEFAULT_INPUT_FILE = 'supabase/auth-users.local.json';

const applyChanges = process.argv.includes('--apply');
const explicitEnvFile = getArgValue('--env-file');
const inputFile = getArgValue('--input') || DEFAULT_INPUT_FILE;

loadEnv(explicitEnvFile);

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const authRedirectTo = process.env.SUPABASE_AUTH_REDIRECT_TO;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add them to the environment or pass --env-file=.env.local.'
  );
  process.exit(1);
}

const entries = loadEntries(resolve(process.cwd(), inputFile));
const existingUsersByEmail = await loadAuthUsersByEmail();

validateEntries(entries);

console.log(`\nSupabase Auth invite plan (${applyChanges ? 'apply' : 'dry-run'})`);
console.log('------------------------------------------------------------');

for (const entry of entries) {
  const profile = await loadProfile(entry.profileId);
  const email = normalizeEmail(entry.email);
  const existingUser = existingUsersByEmail.get(email);

  if (!profile) {
    throw new Error(`Profile not found: ${entry.profileId}`);
  }

  if (profile.auth_user_id) {
    console.log(`- ${entry.loginId}: already linked`);
    continue;
  }

  console.log(
    `- ${entry.loginId}: ${existingUser ? 'link existing Auth user' : 'invite new Auth user'} (${email})`
  );

  if (!applyChanges) {
    continue;
  }

  const authUser = existingUser ?? (await inviteAuthUser(entry));

  if (!authUser?.id) {
    throw new Error(`Unable to resolve Auth user id for ${email}`);
  }

  await linkProfileToAuthUser(entry.profileId, authUser.id);
}

if (!applyChanges) {
  console.log('\nDry run only. Re-run with --apply after checking the emails.');
} else {
  console.log('\nSupabase Auth users invited/linked.');
}

function getArgValue(name) {
  return process.argv
    .slice(2)
    .find((arg) => arg.startsWith(`${name}=`))
    ?.split('=')
    .slice(1)
    .join('=');
}

function loadEntries(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(
      `Missing ${filePath}. Run npm run auth:prepare and fill the email fields.`
    );
  }

  const parsed = JSON.parse(readFileSync(filePath, 'utf8'));

  if (!Array.isArray(parsed?.users)) {
    throw new Error(`${filePath} must contain a users array.`);
  }

  return parsed.users;
}

function validateEntries(entries) {
  const emails = new Set();

  for (const entry of entries) {
    if (!entry.profileId || !entry.loginId) {
      throw new Error('Each auth entry must include profileId and loginId.');
    }

    const email = normalizeEmail(entry.email);

    if (!email || !email.includes('@')) {
      throw new Error(`Missing valid email for ${entry.loginId}.`);
    }

    if (emails.has(email)) {
      throw new Error(`Duplicate email in auth file: ${email}`);
    }

    emails.add(email);
  }
}

async function loadProfile(profileId) {
  const rows = await supabaseRestRequest('profiles', {
    searchParams: {
      id: `eq.${profileId}`,
      limit: '1',
      select: 'id,login_id,auth_user_id',
    },
  });

  return rows[0] ?? null;
}

async function loadAuthUsersByEmail() {
  const usersByEmail = new Map();
  let page = 1;

  while (page < 100) {
    const payload = await supabaseAuthRequest('admin/users', {
      searchParams: {
        page: String(page),
        per_page: '100',
      },
    });
    const users = Array.isArray(payload?.users)
      ? payload.users
      : Array.isArray(payload)
        ? payload
        : [];

    for (const user of users) {
      if (user.email) {
        usersByEmail.set(normalizeEmail(user.email), user);
      }
    }

    if (users.length < 100) {
      break;
    }

    page += 1;
  }

  return usersByEmail;
}

async function inviteAuthUser(entry) {
  const email = normalizeEmail(entry.email);
  const payload = await supabaseAuthRequest('invite', {
    body: {
      email,
      data: {
        first_name: entry.firstName,
        last_name: entry.lastName,
        login_id: entry.loginId,
        profile_id: entry.profileId,
        role: entry.role,
      },
    },
    method: 'POST',
    searchParams: authRedirectTo
      ? {
          redirect_to: authRedirectTo,
        }
      : {},
  });

  return payload?.user ?? payload;
}

async function linkProfileToAuthUser(profileId, authUserId) {
  await supabaseRestRequest('profiles', {
    body: {
      auth_user_id: authUserId,
      must_change_password: true,
    },
    headers: {
      Prefer: 'return=minimal',
    },
    method: 'PATCH',
    searchParams: {
      id: `eq.${profileId}`,
    },
  });
}

async function supabaseRestRequest(path, options = {}) {
  return supabaseRequest(`${supabaseUrl}/rest/v1/${path}`, options);
}

async function supabaseAuthRequest(path, options = {}) {
  return supabaseRequest(`${supabaseUrl}/auth/v1/${path}`, options);
}

async function supabaseRequest(baseUrl, options = {}) {
  const searchParams = new URLSearchParams(options.searchParams || {});
  const queryString = searchParams.toString();
  const response = await fetch(`${baseUrl}${queryString ? `?${queryString}` : ''}`, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
    method: options.method || 'GET',
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message =
      payload?.message ||
      payload?.error ||
      `Supabase request failed with status ${response.status}`;

    throw new Error(`${baseUrl}: ${message}`);
  }

  const text = await response.text();

  return text ? JSON.parse(text) : null;
}

function normalizeEmail(value) {
  return String(value ?? '').trim().toLowerCase();
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
