#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const args = new Set(process.argv.slice(2));
const envFileArgument = process.argv.find((argument) =>
  argument.startsWith('--env-file=')
);
const applyChanges = args.has('--apply');

if (!envFileArgument) {
  throw new Error(
    'Un fichier d’environnement de test explicite est requis (--env-file=/chemin/absolu).'
  );
}

const envFilePath = resolve(envFileArgument.slice('--env-file='.length));
loadEnvFile(envFilePath);

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const expectedProjectRef = process.env.SUPABASE_TEST_PROJECT_REF;
const allowRemoteTests = process.env.ALLOW_REMOTE_SUPABASE_TESTS === '1';
const restoreDrill = process.env.PROJECT1_RESTORE_DRILL === '1';

if (!supabaseUrl || !serviceRoleKey || !expectedProjectRef) {
  throw new Error(
    'SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY et SUPABASE_TEST_PROJECT_REF sont requis.'
  );
}

const parsedUrl = new URL(supabaseUrl);
const actualProjectRef = parsedUrl.hostname.split('.')[0];

if (
  parsedUrl.protocol !== 'https:' ||
  parsedUrl.hostname !== `${expectedProjectRef}.supabase.co` ||
  actualProjectRef !== expectedProjectRef ||
  !allowRemoteTests ||
  !restoreDrill
) {
  throw new Error(
    'Provisionnement refusé : la cible n’est pas une base Supabase de test explicitement autorisée.'
  );
}

const accounts = [
  accountFromEnv('internal', {
    email: 'e2e-internal@project1.invalid',
    firstName: 'E2E',
    institution: 'CHU de Nantes',
    lastName: 'Interne',
    promotion: 'Tests automatisés',
    semester: 'S1',
  }),
  accountFromEnv('senior', {
    email: 'e2e-senior@project1.invalid',
    firstName: 'E2E',
    institution: 'CHU de Nantes',
    lastName: 'Senior',
    promotion: null,
    semester: null,
  }),
  accountFromEnv('admin', {
    email: 'e2e-admin@project1.invalid',
    firstName: 'E2E',
    institution: null,
    lastName: 'Administrateur',
    promotion: null,
    semester: null,
  }),
];

console.log(`Comptes E2E isolés (${applyChanges ? 'application' : 'simulation'})`);

if (!applyChanges) {
  for (const account of accounts) {
    console.log(`- ${account.role}: prêt à être provisionné`);
  }
  console.log('Aucune écriture effectuée. Ajoutez --apply pour continuer.');
  process.exit(0);
}

const institution = await loadInstitution('CHU de Nantes');
const authUsersByEmail = await loadAuthUsersByEmail();
const profilesByRole = new Map();

for (const account of accounts) {
  const authUser = await ensureAuthUser(account, authUsersByEmail);
  const profile = await ensureProfile(account, authUser.id, institution.id);
  await verifyAccount(account, authUser.id);
  profilesByRole.set(account.role, profile);
  console.log(`- ${account.role}: compte actif et connexion vérifiée`);
}

const internalProfile = profilesByRole.get('internal');
const seniorProfile = profilesByRole.get('senior');

await restRequest('senior_internal_assignments', {
  body: {
    internal_profile_id: internalProfile.id,
    senior_profile_id: seniorProfile.id,
  },
  headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
  method: 'POST',
  searchParams: {
    on_conflict: 'senior_profile_id,internal_profile_id',
  },
});

console.log('- relation Senior–Interne: vérifiée');
console.log('Provisionnement E2E terminé sans exposition des identifiants secrets.');

function accountFromEnv(role, details) {
  const prefix = `E2E_${role.toUpperCase()}`;
  const loginId = process.env[`${prefix}_LOGIN_ID`];
  const password = process.env[`${prefix}_PASSWORD`];

  if (!loginId || !password) {
    throw new Error(`${prefix}_LOGIN_ID et ${prefix}_PASSWORD sont requis.`);
  }

  if (password.length < 16) {
    throw new Error(`${prefix}_PASSWORD doit contenir au moins 16 caractères.`);
  }

  return { ...details, loginId, password, role };
}

async function loadInstitution(name) {
  const rows = await restRequest('institutions', {
    searchParams: {
      limit: '1',
      name: `eq.${name}`,
      select: 'id,name,status',
      status: 'eq.active',
    },
  });

  if (!rows[0]?.id) {
    throw new Error(`Établissement de test actif introuvable : ${name}.`);
  }

  return rows[0];
}

async function ensureAuthUser(account, usersByEmail) {
  const existingUser = usersByEmail.get(account.email);
  const body = {
    app_metadata: {
      e2e: true,
      login_id: account.loginId,
      role: account.role,
    },
    email: account.email,
    email_confirm: true,
    password: account.password,
    user_metadata: {
      e2e: true,
      first_name: account.firstName,
      last_name: account.lastName,
      login_id: account.loginId,
      role: account.role,
    },
  };

  if (existingUser) {
    const payload = await authRequest(
      `admin/users/${encodeURIComponent(existingUser.id)}`,
      { body, method: 'PUT' }
    );
    return payload?.user ?? payload;
  }

  const payload = await authRequest('admin/users', {
    body,
    method: 'POST',
  });
  return payload?.user ?? payload;
}

async function ensureProfile(account, authUserId, institutionId) {
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
      `${account.role}: le profil E2E est déjà lié à une autre identité Auth.`
    );
  }

  const body = {
    auth_user_id: authUserId,
    first_name: account.firstName,
    institution: account.institution,
    institution_id: account.role === 'admin' ? null : institutionId,
    is_active: true,
    last_name: account.lastName,
    login_id: account.loginId,
    metadata: {
      contactEmail: account.email,
      e2e: true,
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
    searchParams: { select: 'id,auth_user_id,login_id,role' },
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
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    method: 'POST',
    searchParams: { grant_type: 'password' },
  });

  if (session?.user?.id !== expectedAuthUserId || !session?.access_token) {
    throw new Error(`${account.role}: vérification de connexion impossible.`);
  }

  const rows = await restRequest('profiles', {
    searchParams: {
      auth_user_id: `eq.${expectedAuthUserId}`,
      limit: '1',
      select: 'id,login_id,role,is_active,must_change_password',
    },
  });

  const profile = rows[0];
  if (
    profile?.login_id !== account.loginId ||
    profile?.role !== account.role ||
    profile?.is_active !== true ||
    profile?.must_change_password !== false
  ) {
    throw new Error(`${account.role}: vérification du profil impossible.`);
  }
}

async function loadAuthUsersByEmail() {
  const usersByEmail = new Map();

  for (let page = 1; page < 100; page += 1) {
    const payload = await authRequest('admin/users', {
      searchParams: { page: String(page), per_page: '100' },
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
      ...(options.body === undefined
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
    method: options.method ?? 'GET',
  });

  const responseText = await response.text();
  const payload = responseText ? JSON.parse(responseText) : null;

  if (!response.ok) {
    throw new Error(
      payload?.message ||
        payload?.msg ||
        payload?.error ||
        `Requête Supabase en échec (${response.status}).`
    );
  }

  return payload;
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`Fichier d’environnement introuvable : ${filePath}`);
  }

  const content = readFileSync(filePath, 'utf8');

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
