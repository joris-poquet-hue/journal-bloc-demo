const {
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
  buildRateLimitScope,
  checkRateLimit,
  getAuthUser,
  getForwardedAuthHeaders,
  getProfileByLoginId,
  getRequestBody,
  isConfigured,
  normalizeLoginId,
  registerAuthFailure,
  sendJson,
  supabaseRequest,
} = require('../src/serverAuth.cjs');

const GENERIC_MESSAGE =
  'Si ce compte existe, un lien de réinitialisation a été envoyé à son adresse e-mail.';

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { error: 'Méthode non autorisée.' });
  }

  if (!isConfigured()) {
    return sendJson(response, 503, {
      error: 'L’authentification n’est pas configurée sur ce déploiement.',
    });
  }

  let body;

  try {
    body = await getRequestBody(request);
  } catch {
    return sendJson(response, 400, { error: 'Corps JSON invalide.' });
  }

  const loginId = normalizeLoginId(body?.loginId);

  if (!loginId) {
    return sendJson(response, 200, { message: GENERIC_MESSAGE, ok: true });
  }

  const scope = buildRateLimitScope(request, loginId, 'recovery');
  const rateLimit = await checkRateLimit(scope);

  if (!rateLimit.allowed) {
    response.setHeader('Retry-After', String(rateLimit.retryAfterSeconds));
    return sendJson(response, 429, {
      error: 'Trop de demandes de récupération. Réessayez plus tard.',
    });
  }

  try {
    const profile = await getProfileByLoginId(loginId);

    if (profile?.auth_user_id) {
      const user = await getAuthUser(profile.auth_user_id);

      if (user?.email) {
        const redirectTo = process.env.SUPABASE_AUTH_REDIRECT_TO;
        const searchParams = new URLSearchParams();

        if (redirectTo) {
          searchParams.set('redirect_to', redirectTo);
        }

        await supabaseRequest(
          `${SUPABASE_URL}/auth/v1/recover${
            searchParams.toString() ? `?${searchParams.toString()}` : ''
          }`,
          {
            body: JSON.stringify({ email: user.email }),
            headers: {
              apikey: SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
              'Content-Type': 'application/json',
              ...getForwardedAuthHeaders(request),
            },
            method: 'POST',
          }
        );
      }
    }
  } catch (error) {
    console.warn('Password recovery request failed.', error);
  }

  await registerAuthFailure(scope);

  return sendJson(response, 200, { message: GENERIC_MESSAGE, ok: true });
};
