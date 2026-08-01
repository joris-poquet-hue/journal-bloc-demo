const {
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
  buildRateLimitScope,
  checkRateLimit,
  clearAuthFailures,
  createApplicationSession,
  getAuthUser,
  getForwardedAuthHeaders,
  getProfileByLoginId,
  getRequestBody,
  isApplicationSessionConfigured,
  isMobileApplicationRequest,
  logoutSupabaseAccessToken,
  normalizeLoginId,
  registerAuthFailure,
  sendJson,
  setApplicationSessionCookie,
  supabaseRequest,
  toPublicProfile,
} = require('../src/serverAuth.cjs');
const {
  isAccessKey,
  toPendingAuthPassword,
} = require('../src/accessKey.cjs');

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { error: 'Méthode non autorisée.' });
  }

  if (!isApplicationSessionConfigured()) {
    return sendJson(response, 503, {
      error: 'L’authentification n’est pas configurée sur ce déploiement.',
    });
  }

  let body;

  let transientAccessToken = null;

  try {
    body = await getRequestBody(request);
  } catch {
    return sendJson(response, 400, { error: 'Corps JSON invalide.' });
  }

  const loginId = normalizeLoginId(body?.loginId);
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!loginId || !password) {
    return sendJson(response, 401, { error: 'Identifiants incorrects.' });
  }

  const rateLimitScope = buildRateLimitScope(request, loginId, 'login');
  const rateLimit = await checkRateLimit(rateLimitScope);

  if (!rateLimit.allowed) {
    response.setHeader('Retry-After', String(rateLimit.retryAfterSeconds));
    return sendJson(response, 429, {
      error: 'Trop de tentatives de connexion. Réessayez plus tard.',
    });
  }

  try {
    const profile = await getProfileByLoginId(loginId);

    if (!profile?.auth_user_id) {
      await registerAuthFailure(rateLimitScope);
      return sendJson(response, 401, { error: 'Identifiants incorrects.' });
    }

    const user = await getAuthUser(profile.auth_user_id);

    if (!user?.email) {
      await registerAuthFailure(rateLimitScope);
      return sendJson(response, 401, { error: 'Identifiants incorrects.' });
    }

    const authPassword =
      profile.must_change_password && isAccessKey(password)
        ? toPendingAuthPassword(password)
        : password;
    const { payload, response: authResponse } = await supabaseRequest(
      `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        body: JSON.stringify({
          email: user.email,
          password: authPassword,
        }),
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          ...getForwardedAuthHeaders(request),
        },
        method: 'POST',
      }
    );

    if (!authResponse.ok || !payload?.access_token) {
      await registerAuthFailure(rateLimitScope);
      return sendJson(response, 401, { error: 'Identifiants incorrects.' });
    }

    transientAccessToken = payload.access_token;
    const applicationSession = await createApplicationSession(profile, request);
    setApplicationSessionCookie(response, applicationSession.token);
    await clearAuthFailures(rateLimitScope);

    return sendJson(response, 200, {
      ...(isMobileApplicationRequest(request)
        ? { mobileSessionToken: applicationSession.token }
        : {}),
      profile: toPublicProfile(profile),
    });
  } catch (error) {
    console.error('Supabase login failed.', error);
    await registerAuthFailure(rateLimitScope);
    return sendJson(response, 401, { error: 'Identifiants incorrects.' });
  } finally {
    await logoutSupabaseAccessToken(transientAccessToken).catch(() => null);
  }
};
