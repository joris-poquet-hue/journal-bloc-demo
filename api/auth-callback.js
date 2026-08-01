const {
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
  createApplicationSession,
  getForwardedAuthHeaders,
  getProfileByAuthUserId,
  getRequestBody,
  isApplicationSessionConfigured,
  isMobileApplicationRequest,
  logoutSupabaseAccessToken,
  sendJson,
  setApplicationSessionCookie,
  supabaseRequest,
  toPublicProfile,
} = require('../src/serverAuth.cjs');

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

  const accessToken = String(body?.accessToken ?? '').trim();
  const callbackType = String(body?.type ?? '').trim();

  if (!accessToken || callbackType !== 'recovery') {
    return sendJson(response, 400, { error: 'Réponse d’authentification invalide.' });
  }

  try {
    const { payload: user, response: userResponse } = await supabaseRequest(
      `${SUPABASE_URL}/auth/v1/user`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${accessToken}`,
          ...getForwardedAuthHeaders(request),
        },
      }
    );

    if (!userResponse.ok || !user?.id) {
      return sendJson(response, 401, { error: 'La réponse d’authentification a expiré.' });
    }

    transientAccessToken = accessToken;
    const profile = await getProfileByAuthUserId(user.id);

    if (!profile?.auth_user_id) {
      return sendJson(response, 401, { error: 'Profil introuvable.' });
    }

    const applicationSession = await createApplicationSession(profile, request, {
      authContext: 'recovery',
    });
    setApplicationSessionCookie(response, applicationSession.token);

    return sendJson(response, 200, {
      ...(isMobileApplicationRequest(request)
        ? { mobileSessionToken: applicationSession.token }
        : {}),
      profile: toPublicProfile(profile),
      type: 'recovery',
    });
  } catch (error) {
    console.error('Unable to exchange the authentication callback.', error);
    return sendJson(response, 400, {
      error: 'La réponse d’authentification n’a pas pu être traitée.',
    });
  } finally {
    await logoutSupabaseAccessToken(transientAccessToken).catch(() => null);
  }
};
