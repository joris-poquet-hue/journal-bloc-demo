const {
  authenticateApplicationSession,
  clearApplicationSessionCookie,
  isApplicationSessionConfigured,
  setApplicationSessionCookie,
} = require('../src/serverAuth.cjs');

module.exports = async function handler(request, response) {
  if (request.method !== 'GET') {
    response.statusCode = 405;
    response.setHeader('Allow', 'GET');
    response.end('Méthode non autorisée.');
    return;
  }

  if (!isApplicationSessionConfigured()) {
    response.statusCode = 503;
    response.end('L’authentification n’est pas configurée.');
    return;
  }

  try {
    const identity = await authenticateApplicationSession(request, {
      touch: true,
    });

    if (!identity || identity.session.client_kind !== 'mobile') {
      clearApplicationSessionCookie(response);
      response.statusCode = 401;
      response.end('Une authentification mobile est requise.');
      return;
    }

    setApplicationSessionCookie(response, identity.token);
    response.statusCode = 302;
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Location', '/?native-app=1');
    response.end();
  } catch (error) {
    console.error('Unable to bootstrap the mobile WebView session.', error);
    clearApplicationSessionCookie(response);
    response.statusCode = 503;
    response.end('Impossible de restaurer la session mobile.');
  }
};
