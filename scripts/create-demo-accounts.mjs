#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_ENV_FILES = ['.env.local', '.env.production.local', '.env'];
const applyChanges = process.argv.includes('--apply');

loadEnv();

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !serviceRoleKey || !anonKey) {
  throw new Error(
    'SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and VITE_SUPABASE_ANON_KEY are required.'
  );
}

const demoAccounts = [
  {
    email: 'demo.interne@monjournaldebloc.fr',
    firstName: 'Démo',
    institution: 'CHU de Nantes',
    lastName: 'Interne',
    loginId: 'demo.interne',
    password: 'DemoInterne-MJDB-2026!',
    promotion: 'Démonstration',
    role: 'internal',
    semester: 'S1',
  },
  {
    email: 'demo.senior@monjournaldebloc.fr',
    firstName: 'Démo',
    institution: 'CHU de Nantes',
    lastName: 'Senior',
    loginId: 'demo.senior',
    password: 'DemoSenior-MJDB-2026!',
    promotion: null,
    role: 'senior',
    semester: null,
  },
];

console.log(`\nDemo accounts (${applyChanges ? 'apply' : 'dry-run'})`);
console.log('------------------------------------------------------------');

if (!applyChanges) {
  for (const account of demoAccounts) {
    console.log(`- ${account.loginId}: create or refresh ${account.role} demo account`);
  }
  console.log('\nDry run only. Re-run with --apply to create the accounts.');
  process.exit(0);
}

const authUsersByEmail = await loadAuthUsersByEmail();
const createdProfiles = new Map();

for (const account of demoAccounts) {
  const authUser = await ensureAuthUser(account, authUsersByEmail);
  const profile = await ensureProfile(account, authUser.id);
  createdProfiles.set(account.role, profile);
  await verifyAccount(account, authUser.id);
  console.log(`- ${account.loginId}: ready (${account.role})`);
}

const internalProfile = createdProfiles.get('internal');
const seniorProfile = createdProfiles.get('senior');

if (!internalProfile || !seniorProfile) {
  throw new Error('Unable to resolve both demo profiles.');
}

await restRequest('senior_internal_assignments', {
  body: {
    internal_profile_id: internalProfile.id,
    senior_profile_id: seniorProfile.id,
  },
  headers: {
    Prefer: 'resolution=merge-duplicates,return=minimal',
  },
  method: 'POST',
  searchParams: {
    on_conflict: 'senior_profile_id,internal_profile_id',
  },
});

console.log('- demo.senior: assigned to demo.interne');
console.log('\nDemo accounts created and verified.');

async function ensureAuthUser(account, usersByEmail) {
  const existingUser = usersByEmail.get(account.email);
  const body = {
    app_metadata: {
      demo: true,
      login_id: account.loginId,
      role: account.role,
    },
    email: account.email,
    email_confirm: true,
    password: account.password,
    user_metadata: {
      demo: true,
      first_name: account.firstName,
      last_name: account.lastName,
      login_id: account.loginId,
      role: account.role,
    },
  };

  if (existingUser) {
    const payload = await authRequest(`admin/users/${encodeURIComponent(existingUser.id)}`, {
      body,
      method: 'PUT',
    });
    return payload?.user ?? payload;
  }

  const payload = await authRequest('admin/users', {
    body,
    method: 'POST',
  });
  return payload?.user ?? payload;
}

async function ensureProfile(account, authUserId) {
  const existingProfiles = await restRequest('profiles', {
    searchParams: {
      limit: '1',
      login_id: `eq.${account.loginId}`,
      select: 'id,auth_user_id,login_id,role',
    },
  });
  const existingProfile = existingProfiles[0] ?? null;

  if (
    existingProfile?.auth_user_id &&
    existingProfile.auth_user_id !== authUserId
  ) {
    throw new Error(
      `${account.loginId} is already linked to another authentication user.`
    );
  }

  const body = {
    auth_user_id: authUserId,
    first_name: account.firstName,
    institution: account.institution,
    is_active: true,
    last_name: account.lastName,
    login_id: account.loginId,
    metadata: {
      contactEmail: account.email,
      demo: true,
    },
    must_change_password: false,
    promotion: account.promotion,
    role: account.role,
    semester: account.semester,
  };

  if (existingProfile) {
    const rows = await restRequest('profiles', {
      body,
      headers: { Prefer: 'return=representation' },
      method: 'PATCH',
      searchParams: {
        id: `eq.${existingProfile.id}`,
        select: 'id,auth_user_id,login_id,role',
      },
    });
    return rows[0];
  }

  const rows = await restRequest('profiles', {
    body,
    headers: { Prefer: 'return=representation' },
    method: 'POST',
    searchParams: {
      select: 'id,auth_user_id,login_id,role',
    },
  });
  return rows[0];
}

async function verifyAccount(account, expectedAuthUserId) {
  const session = await request(`${supabaseUrl}/auth/v1/token`, {
    body: {
      email: account.email,
      password: account.password,
    },
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    method: 'POST',
    searchParams: {
      grant_type: 'password',
    },
  });

  if (session?.user?.id !== expectedAuthUserId || !session?.access_token) {
    throw new Error(`Authentication verification failed for ${account.loginId}.`);
  }

  const response = await fetch(
    `${supabaseUrl}/rest/v1/profiles?select=id,login_id,role&auth_user_id=eq.${encodeURIComponent(expectedAuthUserId)}&limit=1`,
    {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${session.access_token}`,
      },
    }
  );
  const rows = await parseResponse(response);

  if (rows[0]?.login_id !== account.loginId || rows[0]?.role !== account.role) {
    throw new Error(`Profile verification failed for ${account.loginId}.`);
  }
}

async function loadAuthUsersByEmail() {
  const usersByEmail = new Map();

  for (let page = 1; page < 100; page += 1) {
    const payload = await authRequest('admin/users', {
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
        usersByEmail.set(String(user.email).trim().toLowerCase(), user);
      }
    }

    if (users.length < 100) {
      break;
    }
  }

  return usersByEmail;
}

async function restRequest(path, options = {}) {
  return request(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...options.headers,
    },
  });
}

async function authRequest(path, options = {}) {
  return request(`${supabaseUrl}/auth/v1/${path}`, {
    ...options,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...options.headers,
    },
  });
}

async function request(baseUrl, options = {}) {
  const searchParams = new URLSearchParams(options.searchParams ?? {});
  const query = searchParams.toString();
  const response = await fetch(`${baseUrl}${query ? `?${query}` : ''}`, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers: {
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
    method: options.method ?? 'GET',
  });

  return parseResponse(response);
}

async function parseResponse(response) {
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

function loadEnv() {
  const selectedEnvFile = DEFAULT_ENV_FILES.map((filePath) =>
    resolve(process.cwd(), filePath)
  ).find((filePath) => existsSync(filePath));

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
