const {
  createHash,
  createHmac,
  createPrivateKey,
  randomBytes,
  sign,
} = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_JWT_SECRET = process.env.SUPABASE_JWT_SECRET;
const SUPABASE_SIGNING_PRIVATE_JWK =
  process.env.SUPABASE_SIGNING_PRIVATE_JWK;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_FAILURES = 5;
const APPLICATION_SESSION_COOKIE_NAME = '__Host-monjdb_session';
const WEB_IDLE_TIMEOUT_SECONDS = 30 * 60;
const APPLICATION_JWT_LIFETIME_SECONDS = 2 * 60;

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function isApplicationJwtConfigured() {
  return Boolean(SUPABASE_SIGNING_PRIVATE_JWK || SUPABASE_JWT_SECRET);
}

function isApplicationSessionConfigured() {
  return Boolean(
    isConfigured() &&
      SUPABASE_ANON_KEY &&
      isApplicationJwtConfigured()
  );
}

function normalizeLoginId(value) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('fr-FR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizeEmail(value) {
  return String(value ?? '').trim().toLocaleLowerCase('fr-FR');
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function validatePassword(password) {
  const value = String(password ?? '');

  if (value.length < 8) {
    return 'Le mot de passe doit contenir au moins 8 caractères.';
  }

  if (!/[a-z]/.test(value)) {
    return 'Le mot de passe doit contenir au moins une lettre minuscule.';
  }

  if (!/[A-Z]/.test(value)) {
    return 'Le mot de passe doit contenir au moins une lettre majuscule.';
  }

  if (!/\d/.test(value)) {
    return 'Le mot de passe doit contenir au moins un chiffre.';
  }

  if (!/[^A-Za-z0-9]/.test(value)) {
    return 'Le mot de passe doit contenir au moins un caractère spécial.';
  }

  return null;
}

function getRequestBody(request, maxBytes = 32 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk;

      if (Buffer.byteLength(body, 'utf8') > maxBytes) {
        reject(new Error('PAYLOAD_TOO_LARGE'));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function getClientIp(request) {
  const forwarded = String(request.headers['x-forwarded-for'] ?? '')
    .split(',')[0]
    .trim();

  return forwarded || String(request.headers['x-real-ip'] ?? '').trim() || 'unknown';
}

function getBearerToken(request) {
  const authorization = String(request.headers.authorization ?? '').trim();
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  return match?.[1]?.trim() || null;
}

function parseCookies(request) {
  return String(request.headers.cookie ?? '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce((cookies, entry) => {
      const separatorIndex = entry.indexOf('=');

      if (separatorIndex <= 0) {
        return cookies;
      }

      const name = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();

      try {
        cookies[name] = decodeURIComponent(value);
      } catch {
        cookies[name] = value;
      }

      return cookies;
    }, {});
}

function getApplicationSessionToken(request) {
  const authorization = String(request.headers.authorization ?? '').trim();
  const sessionAuthorization = authorization.match(/^Session\s+(.+)$/i);

  if (sessionAuthorization?.[1]) {
    return sessionAuthorization[1].trim();
  }

  return parseCookies(request)[APPLICATION_SESSION_COOKIE_NAME] ?? null;
}

function hashApplicationSessionToken(token) {
  return createHash('sha256').update(String(token ?? '')).digest('hex');
}

function isMobileApplicationRequest(request) {
  const explicitMobileHeader = String(
    request.headers['x-monjdb-native-app'] ?? ''
  ).trim();
  const userAgent = String(request.headers['user-agent'] ?? '');

  return (
    explicitMobileHeader === '1' ||
    /MonJournalDeBlocMobile\//i.test(userAgent)
  );
}

function appendSetCookie(response, value) {
  const currentValue = response.getHeader('Set-Cookie');

  if (!currentValue) {
    response.setHeader('Set-Cookie', value);
    return;
  }

  response.setHeader(
    'Set-Cookie',
    Array.isArray(currentValue)
      ? [...currentValue, value]
      : [String(currentValue), value]
  );
}

function setApplicationSessionCookie(response, token) {
  appendSetCookie(
    response,
    [
      `${APPLICATION_SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
      'Path=/',
      'HttpOnly',
      'Secure',
      'SameSite=Lax',
      'Priority=High',
    ].join('; ')
  );
}

function clearApplicationSessionCookie(response) {
  appendSetCookie(
    response,
    [
      `${APPLICATION_SESSION_COOKIE_NAME}=`,
      'Path=/',
      'HttpOnly',
      'Secure',
      'SameSite=Lax',
      'Max-Age=0',
      'Priority=High',
    ].join('; ')
  );
}

function serviceHeaders(extraHeaders = {}) {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    ...extraHeaders,
  };
}

async function parsePayload(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function supabaseRequest(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await parsePayload(response);

  return { payload, response };
}

async function restRequest(path, options = {}) {
  const searchParams = new URLSearchParams(options.searchParams ?? {});
  const query = searchParams.toString();
  const { payload, response } = await supabaseRequest(
    `${SUPABASE_URL}/rest/v1/${path}${query ? `?${query}` : ''}`,
    {
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      headers: serviceHeaders({
        ...(options.body === undefined
          ? {}
          : { 'Content-Type': 'application/json' }),
        ...options.headers,
      }),
      method: options.method ?? 'GET',
    }
  );

  if (!response.ok) {
    const error = new Error(
      payload?.message || payload?.error || `Supabase REST error ${response.status}`
    );
    error.status = response.status;
    error.details = payload;
    throw error;
  }

  return payload;
}

async function authAdminRequest(path, options = {}) {
  const searchParams = new URLSearchParams(options.searchParams ?? {});
  const query = searchParams.toString();
  const { payload, response } = await supabaseRequest(
    `${SUPABASE_URL}/auth/v1/${path}${query ? `?${query}` : ''}`,
    {
      body:
        options.body === undefined ? undefined : JSON.stringify(options.body),
      headers: serviceHeaders({
        ...(options.body === undefined
          ? {}
          : { 'Content-Type': 'application/json' }),
        ...options.headers,
      }),
      method: options.method ?? 'GET',
    }
  );

  if (!response.ok) {
    const error = new Error(
      payload?.msg ||
        payload?.message ||
        payload?.error_description ||
        payload?.error ||
        `Supabase Auth error ${response.status}`
    );
    error.status = response.status;
    error.details = payload;
    throw error;
  }

  return payload;
}

async function logoutSupabaseAccessToken(accessToken) {
  if (!accessToken) {
    return;
  }

  await supabaseRequest(`${SUPABASE_URL}/auth/v1/logout?scope=local`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
    method: 'POST',
  });
}

async function getProfileByLoginId(loginId) {
  const rows = await restRequest('profiles', {
    searchParams: {
      limit: '1',
      login_id: `eq.${loginId}`,
      is_active: 'eq.true',
      select:
        'id,auth_user_id,role,first_name,last_name,login_id,institution,institution_id,metadata,must_change_password,is_active,version,updated_at,updated_by_profile_id',
    },
  });

  return rows?.[0] ?? null;
}

async function getProfileByAuthUserId(authUserId) {
  const rows = await restRequest('profiles', {
    searchParams: {
      auth_user_id: `eq.${authUserId}`,
      is_active: 'eq.true',
      limit: '1',
      select:
        'id,auth_user_id,role,first_name,last_name,login_id,institution,institution_id,metadata,must_change_password,is_active,version,updated_at,updated_by_profile_id',
    },
  });

  return rows?.[0] ?? null;
}

async function getAuthUser(authUserId) {
  const payload = await authAdminRequest(
    `admin/users/${encodeURIComponent(authUserId)}`
  );

  return payload?.user ?? payload;
}

async function createApplicationSession(profile, request, options = {}) {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashApplicationSessionToken(token);
  const clientKind = isMobileApplicationRequest(request) ? 'mobile' : 'web';
  const userAgent = String(request.headers['user-agent'] ?? '').trim();
  const rows = await restRequest('application_sessions', {
    body: {
      auth_user_id: profile.auth_user_id,
      auth_context:
        options.authContext === 'recovery' ? 'recovery' : 'standard',
      client_kind: clientKind,
      idle_timeout_seconds:
        clientKind === 'web' ? WEB_IDLE_TIMEOUT_SECONDS : null,
      profile_id: profile.id,
      token_hash: tokenHash,
      user_agent_hash: userAgent
        ? createHash('sha256').update(userAgent).digest('hex')
        : null,
    },
    headers: {
      Prefer: 'return=representation',
    },
    method: 'POST',
    searchParams: {
      select:
        'id,profile_id,auth_user_id,client_kind,auth_context,idle_timeout_seconds,created_at,last_seen_at',
    },
  });
  const session = rows?.[0] ?? null;

  if (!session?.id) {
    throw new Error('Unable to create the protected application session.');
  }

  return { session, token };
}

async function resolveApplicationSessionToken(token, options = {}) {
  if (!token) {
    return null;
  }

  const rows = await restRequest('rpc/resolve_application_session', {
    body: {
      p_token_hash: hashApplicationSessionToken(token),
      p_touch: options.touch === true,
    },
    method: 'POST',
  });
  const session = rows?.[0] ?? null;

  if (!session?.session_id || !session.profile_id) {
    return null;
  }

  const profiles = await restRequest('profiles', {
    searchParams: {
      id: `eq.${session.profile_id}`,
      limit: '1',
      select: '*',
    },
  });
  const profile = profiles?.[0] ?? null;

  if (!profile?.auth_user_id || profile.is_active === false) {
    return null;
  }

  return {
    profile,
    session,
    token,
  };
}

async function findApplicationSessionByToken(token) {
  if (!token) {
    return null;
  }

  const rows = await restRequest('application_sessions', {
    searchParams: {
      limit: '1',
      select: 'id,profile_id,auth_user_id,client_kind,revoked_at',
      token_hash: `eq.${hashApplicationSessionToken(token)}`,
    },
  });

  return rows?.[0] ?? null;
}

async function authenticateApplicationSession(request, options = {}) {
  return resolveApplicationSessionToken(
    getApplicationSessionToken(request),
    options
  );
}

async function authenticateRequest(request, options = {}) {
  const identity = await authenticateApplicationSession(request, options);

  if (!identity) {
    return null;
  }

  return {
    ...identity,
    user: await getAuthUser(identity.profile.auth_user_id),
  };
}

async function requireAdmin(request) {
  const identity = await authenticateRequest(request);

  return identity?.profile?.role === 'admin' ? identity : null;
}

async function revokeAllApplicationSessions(profileId, reason) {
  return restRequest('rpc/revoke_all_application_sessions', {
    body: {
      p_profile_id: profileId,
      p_reason: reason,
    },
    method: 'POST',
  });
}

async function revokeApplicationSession(sessionId, reason) {
  return restRequest('rpc/revoke_application_session', {
    body: {
      p_reason: reason,
      p_session_id: sessionId,
    },
    method: 'POST',
  });
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function createSupabaseApplicationJwt(identity) {
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlJson({
    app_session_id: identity.session.session_id,
    aud: 'authenticated',
    exp: now + APPLICATION_JWT_LIFETIME_SECONDS,
    iat: now,
    role: 'authenticated',
    sub: identity.profile.auth_user_id,
  });

  if (SUPABASE_SIGNING_PRIVATE_JWK) {
    let privateJwk;

    try {
      privateJwk = JSON.parse(SUPABASE_SIGNING_PRIVATE_JWK);
    } catch {
      throw new Error('SUPABASE_SIGNING_PRIVATE_JWK must be valid JSON.');
    }

    if (
      privateJwk?.kty !== 'EC' ||
      privateJwk?.crv !== 'P-256' ||
      !privateJwk?.d ||
      !privateJwk?.kid
    ) {
      throw new Error(
        'SUPABASE_SIGNING_PRIVATE_JWK must be an ES256 P-256 private JWK with a kid.'
      );
    }

    const header = base64UrlJson({
      alg: 'ES256',
      kid: privateJwk.kid,
      typ: 'JWT',
    });
    const unsignedToken = `${header}.${payload}`;
    const signature = sign('sha256', Buffer.from(unsignedToken), {
      dsaEncoding: 'ieee-p1363',
      key: createPrivateKey({
        format: 'jwk',
        key: privateJwk,
      }),
    }).toString('base64url');

    return `${unsignedToken}.${signature}`;
  }

  if (!SUPABASE_JWT_SECRET) {
    throw new Error(
      'A Supabase application JWT signing key is required for protected data access.'
    );
  }

  const header = base64UrlJson({ alg: 'HS256', typ: 'JWT' });
  const unsignedToken = `${header}.${payload}`;
  const signature = createHmac('sha256', SUPABASE_JWT_SECRET)
    .update(unsignedToken)
    .digest('base64url');

  return `${unsignedToken}.${signature}`;
}

function buildRateLimitScope(request, loginId, purpose) {
  return createHash('sha256')
    .update(`${purpose}:${getClientIp(request)}:${normalizeLoginId(loginId)}`)
    .digest('hex');
}

async function loadRateLimit(scope) {
  const rows = await restRequest('auth_rate_limits', {
    searchParams: {
      limit: '1',
      scope: `eq.${scope}`,
      select: '*',
    },
  });

  return rows?.[0] ?? null;
}

async function checkRateLimit(scope) {
  try {
    const entry = await loadRateLimit(scope);

    if (!entry?.blocked_until) {
      return { allowed: true, retryAfterSeconds: 0 };
    }

    const retryAfterMs = new Date(entry.blocked_until).getTime() - Date.now();

    return {
      allowed: retryAfterMs <= 0,
      retryAfterSeconds: Math.max(0, Math.ceil(retryAfterMs / 1000)),
    };
  } catch (error) {
    console.warn('Persistent auth rate limit unavailable; Supabase limits remain active.', error);
    return { allowed: true, retryAfterSeconds: 0 };
  }
}

async function registerAuthFailure(scope) {
  try {
    const now = new Date();
    const current = await loadRateLimit(scope);
    const currentWindowStartedAt = current?.window_started_at
      ? new Date(current.window_started_at)
      : null;
    const isCurrentWindow =
      currentWindowStartedAt &&
      now.getTime() - currentWindowStartedAt.getTime() < RATE_LIMIT_WINDOW_MS;
    const failureCount = isCurrentWindow
      ? Number(current?.failure_count ?? 0) + 1
      : 1;
    const blockedUntil =
      failureCount >= RATE_LIMIT_MAX_FAILURES
        ? new Date(now.getTime() + RATE_LIMIT_WINDOW_MS).toISOString()
        : null;

    await restRequest('auth_rate_limits', {
      body: {
        blocked_until: blockedUntil,
        failure_count: failureCount,
        scope,
        updated_at: now.toISOString(),
        window_started_at: isCurrentWindow
          ? current.window_started_at
          : now.toISOString(),
      },
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      method: 'POST',
      searchParams: {
        on_conflict: 'scope',
      },
    });
  } catch (error) {
    console.warn('Unable to persist failed authentication attempt.', error);
  }
}

async function clearAuthFailures(scope) {
  try {
    await restRequest('auth_rate_limits', {
      method: 'DELETE',
      searchParams: {
        scope: `eq.${scope}`,
      },
    });
  } catch (error) {
    console.warn('Unable to clear authentication rate limit.', error);
  }
}

function getForwardedAuthHeaders(request) {
  const clientIp = getClientIp(request);

  return clientIp === 'unknown' ? {} : { 'Sb-Forwarded-For': clientIp };
}

function toPublicProfile(profile) {
  return {
    authUserId: profile.auth_user_id,
    contactEmail:
      typeof profile.metadata?.contactEmail === 'string'
        ? profile.metadata.contactEmail
        : null,
    firstName: profile.first_name,
    id: profile.id,
    institution: profile.institution ?? null,
    institutionId: profile.institution_id ?? null,
    isActive: profile.is_active !== false,
    lastName: profile.last_name,
    loginId: profile.login_id,
    mustChangePassword: profile.must_change_password,
    role: profile.role,
    updatedAt: profile.updated_at,
    updatedByProfileId: profile.updated_by_profile_id ?? null,
    version: Number(profile.version ?? 1),
  };
}

module.exports = {
  APPLICATION_SESSION_COOKIE_NAME,
  SUPABASE_ANON_KEY,
  SUPABASE_JWT_SECRET,
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_SIGNING_PRIVATE_JWK,
  SUPABASE_URL,
  authAdminRequest,
  authenticateApplicationSession,
  authenticateRequest,
  buildRateLimitScope,
  checkRateLimit,
  clearAuthFailures,
  clearApplicationSessionCookie,
  createApplicationSession,
  createSupabaseApplicationJwt,
  findApplicationSessionByToken,
  getAuthUser,
  getApplicationSessionToken,
  getForwardedAuthHeaders,
  getProfileByLoginId,
  getRequestBody,
  hashApplicationSessionToken,
  isConfigured,
  isApplicationJwtConfigured,
  isApplicationSessionConfigured,
  isMobileApplicationRequest,
  isValidEmail,
  logoutSupabaseAccessToken,
  normalizeEmail,
  normalizeLoginId,
  registerAuthFailure,
  requireAdmin,
  resolveApplicationSessionToken,
  restRequest,
  revokeApplicationSession,
  revokeAllApplicationSessions,
  sendJson,
  serviceHeaders,
  setApplicationSessionCookie,
  supabaseRequest,
  toPublicProfile,
  validatePassword,
};
