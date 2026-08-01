const {
  authenticateApplicationSession,
  clearApplicationSessionCookie,
  isApplicationSessionConfigured,
  sendJson,
  setApplicationSessionCookie,
  toPublicProfile,
} = require('../src/serverAuth.cjs');

module.exports = async function handler(request, response) {
  if (!['GET', 'POST'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST');
    return sendJson(response, 405, { error: 'Méthode non autorisée.' });
  }

  if (!isApplicationSessionConfigured()) {
    return sendJson(response, 503, {
      error: 'L’authentification n’est pas configurée sur ce déploiement.',
    });
  }

  try {
    const identity = await authenticateApplicationSession(request, {
      touch: true,
    });

    if (!identity) {
      clearApplicationSessionCookie(response);
      return sendJson(response, 401, { error: 'Une authentification est requise.' });
    }

    setApplicationSessionCookie(response, identity.token);

    return sendJson(response, 200, {
      profile: toPublicProfile(identity.profile),
      sessionKind: identity.session.client_kind,
      success: true,
    });
  } catch (error) {
    console.error('Unable to restore the protected application session.', error);
    clearApplicationSessionCookie(response);
    return sendJson(response, 503, {
      error: 'Impossible de vérifier la session.',
    });
  }
};
