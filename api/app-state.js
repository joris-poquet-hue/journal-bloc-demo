const ALLOWED_KEYS = new Set([
  'internal_profiles',
  'saved_interventions',
  'custom_surgical_interventions',
  'custom_seniors',
  'admin_trophies',
  'admin_evaluations',
  'test_feedback',
  'activity_log',
]);

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/\/$/, '');
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP_STATE_TABLE = 'app_state';
const ADMIN_LOGIN_ID = 'adminbeta';
const ADMIN_PASSWORD = 'Fred3132848002!';
const REMOVED_DEMO_PROFILE_IDS = new Set([
  'int-1',
  'int-2',
  'int-3',
  'int-test',
  'int-jpoquet',
]);
const REMOVED_DEMO_LOGIN_IDS = new Set([
  'interne1',
  'interne2',
  'internet',
  'internetest',
  'jpoquet',
]);
const REMOVED_CUSTOM_SENIOR_NAMES = new Set([
  'ylan camby',
  'dr vigoureux',
  'senior test',
]);
const SEEDED_INTERNAL_PROFILES = [];
const SENIORS = [];

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Cache-Control', 'no-store');
  response.end(JSON.stringify(payload));
}

function getSupabaseHeaders() {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  };
}

function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function normalizeCredentialValue(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function credentialsMatch(candidate, loginId, password) {
  return (
    normalizeCredentialValue(candidate.loginId) === loginId &&
    normalizeCredentialValue(candidate.password) === password
  );
}

function isRemovedDemoProfile(profile) {
  const profileLoginId = normalizeCredentialValue(profile.loginId);

  return (
    REMOVED_DEMO_PROFILE_IDS.has(profile.id) ||
    REMOVED_DEMO_LOGIN_IDS.has(profileLoginId)
  );
}

function isRemovedCustomSenior(senior) {
  const seniorName = normalizeCredentialValue(
    `${senior.firstName ?? ''} ${senior.lastName ?? ''}`
  );

  return REMOVED_CUSTOM_SENIOR_NAMES.has(seniorName);
}

function isSeededDemoInterventionId(interventionId) {
  return (
    String(interventionId ?? '').startsWith('seed-int2-') ||
    String(interventionId ?? '').startsWith('seed-int3-') ||
    String(interventionId ?? '').startsWith('seed-internet-')
  );
}

function sanitizeAppState(key, data) {
  if (!Array.isArray(data)) {
    return [];
  }

  if (key === 'internal_profiles') {
    return data.filter((profile) => !isRemovedDemoProfile(profile));
  }

  if (key === 'saved_interventions') {
    return data.filter(
      (intervention) =>
        !isSeededDemoInterventionId(intervention.id) &&
        !REMOVED_DEMO_PROFILE_IDS.has(intervention.internalId)
    );
  }

  if (key === 'custom_seniors') {
    return data.filter((senior) => !isRemovedCustomSenior(senior));
  }

  return data;
}

async function loadAppState(key) {
  const searchParams = new URLSearchParams({
    key: `eq.${key}`,
    select: 'data',
    limit: '1',
  });
  const supabaseResponse = await fetch(
    `${SUPABASE_URL}/rest/v1/${APP_STATE_TABLE}?${searchParams.toString()}`,
    {
      headers: getSupabaseHeaders(),
    }
  );

  if (!supabaseResponse.ok) {
    throw new Error(`Unable to load ${key}`);
  }

  const rows = await supabaseResponse.json();
  return Array.isArray(rows[0]?.data) ? rows[0].data : [];
}

async function isAuthorized(request) {
  const loginId = normalizeCredentialValue(request.headers['x-app-login-id']);
  const password = normalizeCredentialValue(request.headers['x-app-password']);

  if (!loginId || !password) {
    return false;
  }

  if (
    loginId === normalizeCredentialValue(ADMIN_LOGIN_ID) &&
    password === normalizeCredentialValue(ADMIN_PASSWORD)
  ) {
    return true;
  }

  if (SENIORS.some((senior) => credentialsMatch(senior, loginId, password))) {
    return true;
  }

  try {
    const [storedProfiles, customSeniors] = await Promise.all([
      loadAppState('internal_profiles'),
      loadAppState('custom_seniors'),
    ]);
    const profilesByLogin = new Map();

    if (
      customSeniors
        .filter((senior) => !isRemovedCustomSenior(senior))
        .some((senior) => credentialsMatch(senior, loginId, password))
    ) {
      return true;
    }

    [...SEEDED_INTERNAL_PROFILES, ...storedProfiles].forEach((profile) => {
      const profileLoginId = normalizeCredentialValue(profile.loginId);

      if (profileLoginId && !isRemovedDemoProfile(profile)) {
        profilesByLogin.set(profileLoginId, profile);
      }
    });

    return [...profilesByLogin.values()].some((profile) =>
      credentialsMatch(profile, loginId, password)
    );
  } catch {
    return SEEDED_INTERNAL_PROFILES.some((profile) =>
      credentialsMatch(profile, loginId, password)
    );
  }
}

function getBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';

    request.on('data', (chunk) => {
      body += chunk;
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

module.exports = async function handler(request, response) {
  if (!isConfigured()) {
    return sendJson(response, 503, {
      error: 'Persistent storage is not configured for this deployment.',
    });
  }

  if (!(await isAuthorized(request))) {
    return sendJson(response, 401, { error: 'Unauthorized.' });
  }

  if (request.method === 'GET') {
    const key = request.query?.key;

    if (!ALLOWED_KEYS.has(key)) {
      return sendJson(response, 400, { error: 'Invalid app state key.' });
    }

    let data;

    try {
      data = await loadAppState(key);
    } catch {
      return sendJson(response, 502, {
        error: 'Unable to load app state.',
      });
    }

    return sendJson(response, 200, {
      data: sanitizeAppState(key, data),
    });
  }

  if (request.method === 'POST') {
    let body;

    try {
      body = await getBody(request);
    } catch {
      return sendJson(response, 400, { error: 'Invalid JSON body.' });
    }

    if (!ALLOWED_KEYS.has(body.key) || !Array.isArray(body.data)) {
      return sendJson(response, 400, { error: 'Invalid app state payload.' });
    }

    const sanitizedData = sanitizeAppState(body.key, body.data);

    const supabaseResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/${APP_STATE_TABLE}?on_conflict=key`,
      {
        method: 'POST',
        headers: {
          ...getSupabaseHeaders(),
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          key: body.key,
          data: sanitizedData,
          updated_at: new Date().toISOString(),
        }),
      }
    );

    if (!supabaseResponse.ok) {
      return sendJson(response, supabaseResponse.status, {
        error: 'Unable to save app state.',
      });
    }

    return sendJson(response, 200, { ok: true });
  }

  response.setHeader('Allow', 'GET, POST');
  return sendJson(response, 405, { error: 'Method not allowed.' });
};
