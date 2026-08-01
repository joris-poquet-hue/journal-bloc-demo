const {
  authAdminRequest,
  getAuthUser,
  getRequestBody,
  isConfigured,
  requireAdmin,
  restRequest,
  sendJson,
  toPublicProfile,
} = require('../src/serverAuth.cjs');
const {
  generateAccessKey,
  toPendingAuthPassword,
} = require('../src/accessKey.cjs');

async function findProfile(profileId) {
  const rows = await restRequest('profiles', {
    searchParams: {
      id: `eq.${profileId}`,
      limit: '1',
      select: '*',
    },
  });

  return rows?.[0] ?? null;
}

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
    return sendJson(response, 503, { error: 'Impossible de vérifier la session.' });
  }

  if (!adminIdentity) {
    return sendJson(response, 403, { error: 'Un accès Administrateur est requis.' });
  }

  let body;

  try {
    body = await getRequestBody(request);
  } catch {
    return sendJson(response, 400, { error: 'Corps JSON invalide.' });
  }

  const profileId = String(body?.profileId ?? '').trim();
  const expectedVersion = Number(body?.expectedVersion ?? 0);

  if (!profileId || !Number.isInteger(expectedVersion) || expectedVersion < 1) {
    return sendJson(response, 400, {
      error: 'Le profil et sa version actuelle sont obligatoires.',
    });
  }

  try {
    const profile = await findProfile(profileId);

    if (!profile?.auth_user_id || profile.is_active === false) {
      return sendJson(response, 404, { error: 'Ce compte actif est introuvable.' });
    }

    if (Number(profile.version ?? 0) !== expectedVersion) {
      return sendJson(response, 409, {
        error: 'Ce profil a été modifié. Rechargez les données puis réessayez.',
      });
    }

    if (!profile.must_change_password) {
      return sendJson(response, 409, {
        error:
          'Ce compte est déjà activé. Utilisez la récupération de mot de passe.',
      });
    }

    const accessKey = generateAccessKey();
    const currentAuthUser = await getAuthUser(profile.auth_user_id);

    await authAdminRequest(
      `admin/users/${encodeURIComponent(profile.auth_user_id)}`,
      {
        body: {
          app_metadata: {
            ...(currentAuthUser?.app_metadata ?? {}),
            pending_activation: true,
          },
          password: toPendingAuthPassword(accessKey),
        },
        method: 'PUT',
      }
    );

    let auditWarning = null;

    try {
      await restRequest('activity_log', {
        body: {
          action: 'Clé d’accès provisoire régénérée',
          actor_label:
            `${adminIdentity.profile.first_name} ${adminIdentity.profile.last_name}`.trim(),
          actor_role: adminIdentity.profile.role,
          created_by_profile_id: adminIdentity.profile.id,
          profile_id: adminIdentity.profile.id,
          target_label: `${profile.first_name} ${profile.last_name}`.trim(),
          target_type: 'Compte utilisateur',
        },
        headers: {
          Prefer: 'return=minimal',
        },
        method: 'POST',
      });
    } catch (error) {
      console.error('Unable to audit access-key regeneration.', error);
      auditWarning =
        'La clé a été régénérée, mais sa trace d’audit doit être vérifiée.';
    }

    return sendJson(response, 200, {
      accessKey,
      ...(auditWarning ? { auditWarning } : {}),
      profile: toPublicProfile(profile),
    });
  } catch (error) {
    console.error('Access-key regeneration failed.', error);
    return sendJson(response, error.status || 400, {
      error: error.message || 'Impossible de régénérer cette clé d’accès.',
    });
  }
};
