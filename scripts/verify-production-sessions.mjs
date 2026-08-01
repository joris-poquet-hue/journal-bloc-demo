#!/usr/bin/env node

import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  authAdminRequest,
  restRequest,
} = require('../src/serverAuth.cjs');

const baseUrl = (
  process.argv
    .find((argument) => argument.startsWith('--base-url='))
    ?.slice('--base-url='.length) ?? 'https://monjournaldebloc.fr'
).replace(/\/$/, '');
const runId = randomUUID().slice(0, 8);
const loginId = `session.test.${runId}`;
const email = `${loginId}@example.test`;
const password = `Session-${randomBytes(18).toString('base64url')}!Aa1`;
let authUserId = null;
let profileId = null;
let adminAuthUserId = null;
let adminProfileId = null;

try {
  const institutions = await restRequest('institutions', {
    searchParams: {
      limit: '1',
      select: 'id,name',
      status: 'eq.active',
    },
  });
  const institution = institutions?.[0];

  assert.ok(institution?.id, 'Aucun établissement actif disponible.');

  const authPayload = await authAdminRequest('admin/users', {
    body: {
      app_metadata: {
        pending_activation: false,
        production_session_test: true,
      },
      email,
      email_confirm: true,
      password,
      user_metadata: {
        login_id: loginId,
        production_session_test: true,
        role: 'internal',
      },
    },
    method: 'POST',
  });
  const authUser = authPayload?.user ?? authPayload;
  authUserId = authUser?.id ?? null;

  assert.ok(authUserId, 'Le compte Auth synthétique n’a pas été créé.');

  const profiles = await restRequest('profiles', {
    body: {
      auth_user_id: authUserId,
      first_name: 'Test',
      institution_id: institution.id,
      is_active: true,
      last_name: 'Sessions',
      login_id: loginId,
      metadata: {
        contactEmail: email,
        productionSessionTest: true,
      },
      must_change_password: false,
      promotion: 'Test automatique',
      role: 'internal',
      semester: 'S1',
    },
    headers: {
      Prefer: 'return=representation',
    },
    method: 'POST',
    searchParams: {
      select: 'id',
    },
  });
  profileId = profiles?.[0]?.id ?? null;

  assert.ok(profileId, 'Le profil synthétique n’a pas été créé.');

  const sessions = [
    await login('web', 'Project1SessionTest/Chrome'),
    await login('web', 'Project1SessionTest/Safari'),
    await login('mobile', 'MonJournalDeBlocMobile/iOS-Test'),
    await login('mobile', 'MonJournalDeBlocMobile/Android-Test'),
  ];

  assert.equal(
    sessions.filter((session) => session.kind === 'web').length,
    2
  );
  assert.equal(
    sessions.filter((session) => session.kind === 'mobile').length,
    2
  );

  for (const session of sessions) {
    await assertSessionWorks(session);
  }

  const registeredSessions = await restRequest('application_sessions', {
    searchParams: {
      order: 'created_at.asc',
      profile_id: `eq.${profileId}`,
      select: 'id,client_kind,token_hash,revoked_at',
    },
  });

  assert.equal(registeredSessions.length, 4);
  assert.equal(
    registeredSessions.filter((session) => session.client_kind === 'web')
      .length,
    2
  );
  assert.equal(
    registeredSessions.filter((session) => session.client_kind === 'mobile')
      .length,
    2
  );
  assert.ok(
    registeredSessions.every(
      (session) =>
        /^[0-9a-f]{64}$/.test(session.token_hash) &&
        session.revoked_at === null
    ),
    'Le registre ne doit contenir que les hashes des jetons actifs.'
  );

  await restRequest('application_sessions', {
    body: {
      last_seen_at: new Date(Date.now() - 31 * 60 * 1000).toISOString(),
    },
    headers: {
      Prefer: 'return=minimal',
    },
    method: 'PATCH',
    searchParams: {
      id: `eq.${registeredSessions[0].id}`,
    },
  });

  assert.equal(
    (await restoreWebSession(sessions[0])).status,
    401,
    'Le premier navigateur aurait dû expirer seul.'
  );

  for (const session of sessions.slice(1)) {
    await assertSessionWorks(session);
  }

  const logoutResponse = await fetch(`${baseUrl}/api/auth-logout`, {
    body: JSON.stringify({ scope: 'all' }),
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessions[1].cookie,
      'User-Agent': sessions[1].userAgent,
    },
    method: 'POST',
  });

  assert.equal(logoutResponse.status, 200);

  for (const session of sessions.slice(1)) {
    const response =
      session.kind === 'web'
        ? await restoreWebSession(session)
        : await restoreMobileSession(session);
    assert.equal(
      response.status,
      401,
      'La déconnexion volontaire doit révoquer chaque session restante.'
    );
  }

  const adminLoginId = `session.admin.${runId}`;
  const adminEmail = `${adminLoginId}@example.test`;
  const adminPassword = `Admin-${randomBytes(18).toString('base64url')}!Aa1`;
  const adminAuthPayload = await authAdminRequest('admin/users', {
    body: {
      app_metadata: {
        pending_activation: false,
        production_session_test: true,
      },
      email: adminEmail,
      email_confirm: true,
      password: adminPassword,
      user_metadata: {
        login_id: adminLoginId,
        production_session_test: true,
        role: 'admin',
      },
    },
    method: 'POST',
  });
  adminAuthUserId =
    (adminAuthPayload?.user ?? adminAuthPayload)?.id ?? null;
  assert.ok(adminAuthUserId, 'Le compte Admin synthétique n’a pas été créé.');

  const adminProfiles = await restRequest('profiles', {
    body: {
      auth_user_id: adminAuthUserId,
      first_name: 'Test',
      is_active: true,
      last_name: 'Admin Sessions',
      login_id: adminLoginId,
      metadata: {
        contactEmail: adminEmail,
        productionSessionTest: true,
      },
      must_change_password: false,
      role: 'admin',
    },
    headers: {
      Prefer: 'return=representation',
    },
    method: 'POST',
    searchParams: {
      select: 'id',
    },
  });
  adminProfileId = adminProfiles?.[0]?.id ?? null;
  assert.ok(adminProfileId, 'Le profil Admin synthétique n’a pas été créé.');

  const adminSession = await login(
    'web',
    'Project1SessionTest/Admin',
    {
      loginId: adminLoginId,
      password: adminPassword,
    }
  );
  const sessionsBeforeDeactivation = [
    await login('web', 'Project1SessionTest/Deactivation-Web'),
    await login('mobile', 'MonJournalDeBlocMobile/Deactivation-Mobile'),
  ];
  const targetProfiles = await restRequest('profiles', {
    searchParams: {
      id: `eq.${profileId}`,
      limit: '1',
      select: 'id,version',
    },
  });
  const targetVersion = Number(targetProfiles?.[0]?.version ?? 0);

  assert.ok(targetVersion > 0, 'Version du profil cible introuvable.');

  const deactivationResponse = await fetch(
    `${baseUrl}/api/admin-account-lifecycle`,
    {
      body: JSON.stringify({
        action: 'deactivate',
        expectedVersion: targetVersion,
        profileId,
      }),
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminSession.cookie,
        'User-Agent': adminSession.userAgent,
      },
      method: 'POST',
    }
  );
  const deactivationPayload = await deactivationResponse.json();

  assert.equal(
    deactivationResponse.status,
    200,
    deactivationPayload?.error
  );

  for (const session of sessionsBeforeDeactivation) {
    const response =
      session.kind === 'web'
        ? await restoreWebSession(session)
        : await restoreMobileSession(session);
    assert.equal(
      response.status,
      401,
      'La désactivation doit révoquer toutes les sessions du compte.'
    );
  }

  const deactivatedProfiles = await restRequest('profiles', {
    searchParams: {
      id: `eq.${profileId}`,
      limit: '1',
      select: 'auth_user_id,is_active,version',
    },
  });

  assert.equal(deactivatedProfiles?.[0]?.is_active, false);
  assert.equal(
    deactivatedProfiles?.[0]?.auth_user_id,
    authUserId,
    'La désactivation doit conserver la même identité Supabase Auth.'
  );

  const reactivationResponse = await fetch(
    `${baseUrl}/api/admin-account-lifecycle`,
    {
      body: JSON.stringify({
        action: 'reactivate',
        expectedVersion: Number(deactivatedProfiles?.[0]?.version ?? 0),
        profileId,
      }),
      headers: {
        'Content-Type': 'application/json',
        Cookie: adminSession.cookie,
        'User-Agent': adminSession.userAgent,
      },
      method: 'POST',
    }
  );
  const reactivationPayload = await reactivationResponse.json();

  assert.equal(
    reactivationResponse.status,
    200,
    reactivationPayload?.error
  );

  const reactivatedProfiles = await restRequest('profiles', {
    searchParams: {
      id: `eq.${profileId}`,
      limit: '1',
      select: 'auth_user_id,is_active',
    },
  });

  assert.equal(reactivatedProfiles?.[0]?.is_active, true);
  assert.equal(reactivatedProfiles?.[0]?.auth_user_id, authUserId);

  for (const session of sessionsBeforeDeactivation) {
    const response =
      session.kind === 'web'
        ? await restoreWebSession(session)
        : await restoreMobileSession(session);
    assert.equal(
      response.status,
      401,
      'La réactivation ne doit jamais restaurer une ancienne session.'
    );
  }

  const reactivatedSession = await login(
    'web',
    'Project1SessionTest/Reactivation-Web'
  );
  await assertSessionWorks(reactivatedSession);

  console.log(
    'Production session verification passed: 2 web + 2 mobile, inactivity, global logout, reversible deactivation and fresh-login reactivation.'
  );
} finally {
  if (profileId) {
    await restRequest('application_sessions', {
      method: 'DELETE',
      searchParams: {
        profile_id: `eq.${profileId}`,
      },
    }).catch(() => null);
    await restRequest('profiles', {
      method: 'DELETE',
      searchParams: {
        id: `eq.${profileId}`,
      },
    }).catch(() => null);
  }

  if (authUserId) {
    await authAdminRequest(
      `admin/users/${encodeURIComponent(authUserId)}`,
      { method: 'DELETE' }
    ).catch(() => null);
  }

  if (adminProfileId) {
    await restRequest('application_sessions', {
      method: 'DELETE',
      searchParams: {
        profile_id: `eq.${adminProfileId}`,
      },
    }).catch(() => null);
    await restRequest('profiles', {
      method: 'DELETE',
      searchParams: {
        id: `eq.${adminProfileId}`,
      },
    }).catch(() => null);
  }

  if (adminAuthUserId) {
    await authAdminRequest(
      `admin/users/${encodeURIComponent(adminAuthUserId)}`,
      { method: 'DELETE' }
    ).catch(() => null);
  }
}

async function login(
  kind,
  userAgent,
  credentials = { loginId, password }
) {
  const response = await fetch(`${baseUrl}/api/auth-login`, {
    body: JSON.stringify(credentials),
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': userAgent,
      ...(kind === 'mobile' ? { 'X-Monjdb-Native-App': '1' } : {}),
    },
    method: 'POST',
  });
  const payload = await response.json();
  const setCookie = response.headers.get('set-cookie') ?? '';

  assert.equal(response.status, 200, payload?.error);
  assert.match(setCookie, /__Host-monjdb_session=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Secure/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.doesNotMatch(
    setCookie.split(/,\s*__Host-monjdb_session=/)[0],
    /Expires=/i
  );

  const cookie = setCookie.split(';')[0];

  if (kind === 'mobile') {
    assert.match(payload.mobileSessionToken ?? '', /^[A-Za-z0-9_-]{43}$/);
  } else {
    assert.equal(payload.mobileSessionToken, undefined);
  }

  return {
    cookie,
    kind,
    token: payload.mobileSessionToken ?? null,
    userAgent,
  };
}

async function assertSessionWorks(session) {
  const sessionResponse =
    session.kind === 'web'
      ? await restoreWebSession(session)
      : await restoreMobileSession(session);

  assert.ok(
    [200, 302].includes(sessionResponse.status),
    `La session ${session.kind} n’a pas été restaurée.`
  );

  const backendResponse = await fetch(
    `${baseUrl}/api/backend?path=profiles&select=id&id=eq.${profileId}`,
    {
      headers: {
        Cookie: session.cookie,
        'User-Agent': session.userAgent,
      },
    }
  );
  const rows = await backendResponse.json();

  assert.equal(backendResponse.status, 200);
  assert.equal(rows?.[0]?.id, profileId);
}

function restoreWebSession(session) {
  return fetch(`${baseUrl}/api/auth-session`, {
    headers: {
      Cookie: session.cookie,
      'User-Agent': session.userAgent,
    },
  });
}

function restoreMobileSession(session) {
  return fetch(`${baseUrl}/api/auth-mobile-bootstrap`, {
    headers: {
      Authorization: `Session ${session.token}`,
      'User-Agent': session.userAgent,
      'X-Monjdb-Native-App': '1',
    },
    redirect: 'manual',
  });
}
