#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';

const COMMANDS = new Set([
  'cleanup',
  'move',
  'setup',
  'status',
  'visibility',
]);
const command = process.argv.find((value) => COMMANDS.has(value));
const productionAllowed = process.argv.includes('--allow-production-recipe');
const statePath =
  process.env.PROJECT1_RECIPE_STATE_PATH ||
  '/private/tmp/project1-production-recipe.json';

if (!command) {
  throw new Error(
    'Commande requise : setup, status, visibility, move ou cleanup.'
  );
}

if (!productionAllowed) {
  throw new Error(
    'Recette de production non autorisée. Ajoutez --allow-production-recipe uniquement après accord explicite du propriétaire.'
  );
}

loadEnv();

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !serviceRoleKey || !anonKey) {
  throw new Error(
    'SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY et VITE_SUPABASE_ANON_KEY sont requis.'
  );
}

if (command === 'setup') {
  await setup();
} else if (command === 'status') {
  await status();
} else if (command === 'move') {
  await moveInternal();
} else if (command === 'visibility') {
  await verifyVisibility();
} else {
  await cleanup();
}

async function setup() {
  if (existsSync(statePath)) {
    throw new Error(
      `Un état de recette existe déjà dans ${statePath}. Exécutez cleanup avant un nouveau setup.`
    );
  }

  const recipeId = `r${new Date()
    .toISOString()
    .replace(/\D/g, '')
    .slice(0, 14)}${randomBytes(3).toString('hex')}`;
  const institutionA = `Recette MJDB ${recipeId} A`;
  const institutionB = `Recette MJDB ${recipeId} B`;
  const baseline = await loadGlobalCounts();
  const state = {
    accounts: [],
    baseline,
    createdAt: new Date().toISOString(),
    institutionA,
    institutionB,
    recipeId,
  };

  saveState(state);

  const definitions = [
    {
      firstName: 'Recette',
      institution: institutionA,
      key: 'internal',
      lastName: `Interne ${recipeId}`,
      promotion: 'Recette automatisée',
      role: 'internal',
      semester: 'S1',
    },
    {
      firstName: 'Recette',
      institution: institutionA,
      key: 'designatedSenior',
      lastName: `Senior Désigné ${recipeId}`,
      role: 'senior',
    },
    {
      firstName: 'Recette',
      institution: institutionA,
      key: 'sameInstitutionSenior',
      lastName: `Senior Même Établissement ${recipeId}`,
      role: 'senior',
    },
    {
      firstName: 'Recette',
      institution: institutionB,
      key: 'newInstitutionSenior',
      lastName: `Senior Nouvel Établissement ${recipeId}`,
      role: 'senior',
    },
  ];

  try {
    for (const definition of definitions) {
      const account = await createRecipeAccount(recipeId, definition);
      state.accounts.push(account);
      saveState(state);
    }

    console.log('Recette synthétique prête.');
    console.log(JSON.stringify(publicState(state, true), null, 2));
  } catch (error) {
    console.error(
      `Setup incomplet. L'état de nettoyage est conservé dans ${statePath}.`
    );
    throw error;
  }
}

async function status() {
  const state = loadState();
  const residue = await loadRecipeResidue(state);

  console.log(
    JSON.stringify(
      {
        fixture: publicState(state, false),
        residue,
      },
      null,
      2
    )
  );
}

async function moveInternal() {
  const state = loadState();
  const internal = findAccount(state, 'internal');
  const rows = await restRequest('profiles', {
    body: { institution: state.institutionB },
    headers: { Prefer: 'return=representation' },
    method: 'PATCH',
    searchParams: {
      id: `eq.${internal.profileId}`,
      select: 'id,institution,version',
    },
  });

  if (rows.length !== 1 || rows[0].institution !== state.institutionB) {
    throw new Error("Le déplacement de l'interne n'a pas été confirmé.");
  }

  state.movedAt = new Date().toISOString();
  saveState(state);
  console.log(
    JSON.stringify(
      {
        internalProfileId: internal.profileId,
        institution: rows[0].institution,
        version: rows[0].version,
      },
      null,
      2
    )
  );
}

async function verifyVisibility() {
  const state = loadState();
  const internal = findAccount(state, 'internal');
  const results = [];

  for (const account of state.accounts) {
    const session = await request(`${supabaseUrl}/auth/v1/token`, {
      body: { email: account.email, password: account.password },
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      method: 'POST',
      searchParams: { grant_type: 'password' },
    });
    const headers = {
      apikey: anonKey,
      Authorization: `Bearer ${session.access_token}`,
    };
    const interventions = await request(
      `${supabaseUrl}/rest/v1/interventions`,
      {
        headers,
        searchParams: {
          deleted_at: 'is.null',
          internal_profile_id: `eq.${internal.profileId}`,
          select: 'id,senior_profile_id,version',
        },
      }
    );
    const visibleInternals =
      account.role === 'senior'
        ? await request(
            `${supabaseUrl}/rest/v1/rpc/list_visible_internal_directory`,
            {
              body: {},
              headers,
              method: 'POST',
            }
          )
        : [];

    results.push({
      interventionCount: interventions.length,
      key: account.key,
      role: account.role,
      visibleInternalCount: visibleInternals.filter(
        (profile) => profile.id === internal.profileId
      ).length,
    });
  }

  console.log(
    JSON.stringify(
      {
        internalInstitution:
          (
            await restRequest('profiles', {
              searchParams: {
                id: `eq.${internal.profileId}`,
                select: 'institution',
              },
            })
          )[0]?.institution ?? null,
        results,
      },
      null,
      2
    )
  );
}

async function cleanup() {
  const state = loadState();
  const recipeProfiles = await restRequest('profiles', {
    searchParams: {
      'metadata->>recipeId': `eq.${state.recipeId}`,
      select: 'id',
    },
  });
  const profileIds = [
    ...new Set([
      ...state.accounts.map((account) => account.profileId).filter(Boolean),
      ...recipeProfiles.map((profile) => profile.id),
    ]),
  ];
  const recipeAuthUsers = (await loadAuthUsers()).filter(
    (user) => user.app_metadata?.recipe_id === state.recipeId
  );
  const authUserIds = [
    ...new Set([
      ...state.accounts.map((account) => account.authUserId).filter(Boolean),
      ...recipeAuthUsers.map((user) => user.id),
    ]),
  ];
  const ids = inFilter(profileIds);

  if (profileIds.length > 0) {
    await restRequest('activity_log', {
      method: 'DELETE',
      searchParams: { profile_id: ids },
    });
    await restRequest('activity_log', {
      method: 'DELETE',
      searchParams: { created_by_profile_id: ids },
    });
    await restRequest('evaluation_requests', {
      method: 'DELETE',
      searchParams: { internal_profile_id: ids },
    });
    await restRequest('evaluation_requests', {
      method: 'DELETE',
      searchParams: { senior_profile_id: ids },
    });
    await restRequest('interventions', {
      method: 'DELETE',
      searchParams: { internal_profile_id: ids },
    });
    await restRequest('profiles', {
      method: 'DELETE',
      searchParams: { id: ids },
    });
  }

  for (const authUserId of authUserIds) {
    await authRequest(`admin/users/${encodeURIComponent(authUserId)}`, {
      method: 'DELETE',
    });
  }

  const residue = await loadRecipeResidue(state);
  const after = await loadGlobalCounts();

  if (
    residue.authUsers !== 0 ||
    residue.profiles !== 0 ||
    residue.interventions !== 0 ||
    residue.evaluations !== 0 ||
    residue.evaluationRequests !== 0
  ) {
    throw new Error(
      `Nettoyage incomplet : ${JSON.stringify(residue)}`
    );
  }

  unlinkSync(statePath);
  console.log(
    JSON.stringify(
      {
        after,
        baseline: state.baseline,
        cleanedRecipeId: state.recipeId,
        residue,
      },
      null,
      2
    )
  );
}

async function createRecipeAccount(recipeId, definition) {
  const loginId = `recette.${definition.key}.${recipeId}`.toLowerCase();
  const email = `${loginId}@example.com`;
  const password = `Recette-${randomBytes(18).toString('base64url')}!9aA`;
  const authPayload = await authRequest('admin/users', {
    body: {
      app_metadata: {
        login_id: loginId,
        recipe_id: recipeId,
        role: definition.role,
        synthetic: true,
      },
      email,
      email_confirm: true,
      password,
      user_metadata: {
        first_name: definition.firstName,
        last_name: definition.lastName,
        login_id: loginId,
        recipe_id: recipeId,
        role: definition.role,
        synthetic: true,
      },
    },
    method: 'POST',
  });
  const authUser = authPayload?.user ?? authPayload;

  if (!authUser?.id) {
    throw new Error(`Compte Auth non créé pour ${definition.key}.`);
  }

  const profiles = await restRequest('profiles', {
    body: {
      auth_user_id: authUser.id,
      first_name: definition.firstName,
      institution: definition.institution,
      is_active: true,
      last_name: definition.lastName,
      login_id: loginId,
      metadata: {
        contactEmail: email,
        recipeId,
        synthetic: true,
      },
      must_change_password: false,
      promotion: definition.promotion ?? null,
      role: definition.role,
      semester: definition.semester ?? null,
    },
    headers: { Prefer: 'return=representation' },
    method: 'POST',
    searchParams: { select: 'id,login_id,role,institution' },
  });
  const profile = profiles[0];

  if (!profile?.id) {
    throw new Error(`Profil non créé pour ${definition.key}.`);
  }

  const session = await request(`${supabaseUrl}/auth/v1/token`, {
    body: { email, password },
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
    method: 'POST',
    searchParams: { grant_type: 'password' },
  });

  if (!session?.access_token || session.user?.id !== authUser.id) {
    throw new Error(`Authentification non confirmée pour ${definition.key}.`);
  }

  return {
    authUserId: authUser.id,
    email,
    institution: definition.institution,
    key: definition.key,
    loginId,
    password,
    profileId: profile.id,
    role: definition.role,
  };
}

async function loadRecipeResidue(state) {
  const recipeProfiles = await restRequest('profiles', {
    searchParams: {
      'metadata->>recipeId': `eq.${state.recipeId}`,
      select: 'id',
    },
  });
  const profileIds = [
    ...new Set([
      ...state.accounts.map((account) => account.profileId).filter(Boolean),
      ...recipeProfiles.map((profile) => profile.id),
    ]),
  ];
  const authUserIds = new Set(
    state.accounts.map((account) => account.authUserId).filter(Boolean)
  );
  const users = await loadAuthUsers();
  const recipeUsers = users.filter(
    (user) =>
      authUserIds.has(user.id) ||
      user.app_metadata?.recipe_id === state.recipeId
  );

  if (profileIds.length === 0) {
    return {
      authUsers: recipeUsers.length,
      evaluationRequests: 0,
      evaluations: 0,
      interventions: 0,
      profiles: 0,
    };
  }

  const ids = inFilter(profileIds);
  const interventions = await restRequest('interventions', {
    searchParams: {
      internal_profile_id: ids,
      select: 'id',
    },
  });
  const interventionIds = interventions.map((row) => row.id);

  return {
    authUsers: recipeUsers.length,
    evaluationRequests: await countRows(
      'evaluation_requests',
      interventionIds.length
        ? { intervention_id: inFilter(interventionIds) }
        : { internal_profile_id: ids }
    ),
    evaluations: await countRows(
      'intervention_evaluations',
      interventionIds.length
        ? { intervention_id: inFilter(interventionIds) }
        : { senior_profile_id: ids }
    ),
    interventions: interventions.length,
    profiles: await countRows('profiles', { id: ids }),
  };
}

async function loadGlobalCounts() {
  const [users, profiles, interventions, evaluations, requests] =
    await Promise.all([
      loadAuthUsers(),
      restRequest('profiles', { searchParams: { select: 'id' } }),
      restRequest('interventions', { searchParams: { select: 'id' } }),
      restRequest('intervention_evaluations', {
        searchParams: { select: 'intervention_id' },
      }),
      restRequest('evaluation_requests', {
        searchParams: { select: 'intervention_id' },
      }),
    ]);

  return {
    authUsers: users.length,
    evaluationRequests: requests.length,
    evaluations: evaluations.length,
    interventions: interventions.length,
    profiles: profiles.length,
  };
}

async function countRows(table, filters) {
  const rows = await restRequest(table, {
    searchParams: { ...filters, select: '*' },
  });
  return rows.length;
}

async function loadAuthUsers() {
  const users = [];

  for (let page = 1; page < 100; page += 1) {
    const payload = await authRequest('admin/users', {
      searchParams: { page: String(page), per_page: '100' },
    });
    const pageUsers = Array.isArray(payload?.users)
      ? payload.users
      : Array.isArray(payload)
        ? payload
        : [];
    users.push(...pageUsers);

    if (pageUsers.length < 100) {
      break;
    }
  }

  return users;
}

function publicState(state, includePasswords) {
  return {
    accounts: state.accounts.map((account) => ({
      institution: account.institution,
      key: account.key,
      loginId: account.loginId,
      ...(includePasswords ? { password: account.password } : {}),
      profileId: account.profileId,
      role: account.role,
    })),
    baseline: state.baseline,
    institutionA: state.institutionA,
    institutionB: state.institutionB,
    movedAt: state.movedAt ?? null,
    recipeId: state.recipeId,
  };
}

function findAccount(state, key) {
  const account = state.accounts.find((candidate) => candidate.key === key);

  if (!account) {
    throw new Error(`Compte de recette absent : ${key}.`);
  }

  return account;
}

function inFilter(ids) {
  return `in.(${ids.join(',')})`;
}

function saveState(state) {
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  chmodSync(statePath, 0o600);
}

function loadState() {
  if (!existsSync(statePath)) {
    throw new Error(`État de recette absent : ${statePath}.`);
  }

  return JSON.parse(readFileSync(statePath, 'utf8'));
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
  const params = new URLSearchParams(options.searchParams ?? {});
  const response = await fetch(
    `${baseUrl}${params.size ? `?${params.toString()}` : ''}`,
    {
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      headers: {
        ...(options.body === undefined
          ? {}
          : { 'Content-Type': 'application/json' }),
        ...options.headers,
      },
      method: options.method ?? 'GET',
    }
  );
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(
      payload?.message ||
        payload?.msg ||
        payload?.error ||
        `Supabase a répondu ${response.status}.`
    );
  }

  return payload;
}

function loadEnv() {
  const envFile = ['.env.local', '.env.production.local', '.env']
    .map((filePath) => resolve(process.cwd(), filePath))
    .find((filePath) => existsSync(filePath));

  if (!envFile) {
    return;
  }

  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separator = trimmed.indexOf('=');

    if (separator <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value.replace(/\\n/g, '\n');
    }
  }
}
