const {
  getRequestBody,
  isConfigured,
  requireAdmin,
  sendJson,
  toPublicProfile,
} = require('../src/serverAuth.cjs');
const {
  changeAccountLifecycle,
} = require('../src/serverAccountLifecycle.cjs');

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

  let adminIdentity;

  try {
    adminIdentity = await requireAdmin(request);
  } catch (error) {
    console.error('Unable to verify administrator session.', error);
    return sendJson(response, 503, {
      error: 'Impossible de vérifier la session.',
    });
  }

  if (!adminIdentity) {
    return sendJson(response, 403, {
      error: 'Un accès Administrateur est requis.',
    });
  }

  let body;

  try {
    body = await getRequestBody(request);
  } catch {
    return sendJson(response, 400, { error: 'Corps JSON invalide.' });
  }

  const action = String(body?.action ?? '').trim();
  const expectedVersion = Number(body?.expectedVersion ?? 0);
  const profileId = String(body?.profileId ?? '').trim();

  if (!profileId) {
    return sendJson(response, 400, {
      error: 'L’identifiant du profil est obligatoire.',
    });
  }

  if (!['deactivate', 'reactivate'].includes(action)) {
    return sendJson(response, 400, {
      error: 'L’action de cycle de vie est invalide.',
    });
  }

  try {
    const targetActive = action === 'reactivate';
    const profile = await changeAccountLifecycle({
      adminIdentity,
      expectedVersion,
      profileId,
      targetActive,
    });

    return sendJson(response, 200, {
      action,
      profile: toPublicProfile(profile),
      success: true,
    });
  } catch (error) {
    console.error('Administrator account lifecycle operation failed.', error);
    return sendJson(response, error.status || 400, {
      error:
        error.message ||
        'Impossible de modifier l’état de ce compte.',
    });
  }
};
