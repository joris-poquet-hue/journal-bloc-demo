const {
  authenticateApplicationSession,
  clearApplicationSessionCookie,
  findApplicationSessionByToken,
  getApplicationSessionToken,
  getRequestBody,
  isConfigured,
  revokeApplicationSession,
  revokeAllApplicationSessions,
  sendJson,
} = require('../src/serverAuth.cjs');
const {
  deactivatePushSubscriptionsForProfile,
} = require('../src/pushNotifications.cjs');

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { error: 'Méthode non autorisée.' });
  }

  clearApplicationSessionCookie(response);

  if (!isConfigured()) {
    return sendJson(response, 503, {
      error: 'L’authentification n’est pas configurée sur ce déploiement.',
    });
  }

  try {
    const body = await getRequestBody(request);
    const revokeScope = body?.scope === 'current' ? 'current' : 'all';
    const identity = await authenticateApplicationSession(request);

    const storedSession = identity
      ? null
      : await findApplicationSessionByToken(
          getApplicationSessionToken(request)
        );
    const profileId = identity?.profile?.id ?? storedSession?.profile_id;
    const sessionId = identity?.session?.session_id ?? storedSession?.id;

    if (revokeScope === 'current' && sessionId) {
      await revokeApplicationSession(sessionId, 'session_cleanup');
    } else if (revokeScope === 'all' && profileId) {
      await revokeAllApplicationSessions(
        profileId,
        'voluntary_logout'
      );
      await deactivatePushSubscriptionsForProfile(profileId);
    }

    return sendJson(response, 200, { scope: revokeScope, success: true });
  } catch (error) {
    console.error('Unable to revoke all application sessions.', error);
    return sendJson(response, 503, {
      error: 'La déconnexion globale n’a pas pu être confirmée.',
    });
  }
};
