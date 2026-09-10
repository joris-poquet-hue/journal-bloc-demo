const {
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
  authAdminRequest,
  getAuthUser,
  getForwardedAuthHeaders,
  getRequestBody,
  isConfigured,
  logoutSupabaseAccessToken,
  requireAdmin,
  restRequest,
  sendJson,
  supabaseRequest,
  toPublicProfile,
} = require('../src/serverAuth.cjs');
const {
  deriveAccessKey,
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
  const requestedOperationId = String(body?.operationId ?? '')
    .trim()
    .toLowerCase();

  if (
    !profileId ||
    !Number.isInteger(expectedVersion) ||
    expectedVersion < 1 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      requestedOperationId
    )
  ) {
    return sendJson(response, 400, {
      error: 'Le profil, sa version et l’opération de rotation sont obligatoires.',
    });
  }

  let transientAccessToken = null;

  try {
    let profile = await findProfile(profileId);

    if (!profile?.auth_user_id || profile.is_active === false) {
      return sendJson(response, 404, { error: 'Ce compte actif est introuvable.' });
    }

    if (!profile.must_change_password) {
      return sendJson(response, 409, {
        error:
          'Ce compte est déjà activé. Utilisez la récupération de mot de passe.',
      });
    }

    const accessKeySecret = String(
      process.env.PROVISIONAL_ACCESS_KEY_SECRET ?? ''
    );

    if (Buffer.byteLength(accessKeySecret, 'utf8') < 32) {
      return sendJson(response, 503, {
        error:
          'La rotation sécurisée des clés provisoires n’est pas configurée sur ce déploiement.',
      });
    }

    let currentAuthUser = await getAuthUser(profile.auth_user_id);

    if (!currentAuthUser?.email) {
      return sendJson(response, 409, {
        error: 'L’identité Auth de ce profil est incomplète.',
      });
    }

    const preparedRotationPayload = await restRequest(
      'rpc/begin_provisional_access_key_rotation',
      {
        body: {
          p_actor_profile_id: adminIdentity.profile.id,
          p_expected_version: expectedVersion,
          p_operation_id: requestedOperationId,
          p_profile_id: profile.id,
          p_started_at: new Date().toISOString(),
        },
        method: 'POST',
      }
    );
    const preparedRotation = Array.isArray(preparedRotationPayload)
      ? preparedRotationPayload[0]
      : preparedRotationPayload;
    const operationId = String(
      preparedRotation?.operationId ?? ''
    ).trim();
    const alreadyFinalized = preparedRotation?.alreadyFinalized === true;
    const alreadyPrepared = preparedRotation?.alreadyPrepared === true;

    if (!operationId || operationId !== requestedOperationId) {
      const error = new Error('La rotation sécurisée de la clé n’a pas pu être réservée.');
      error.status = 409;
      throw error;
    }

    const accessKey = deriveAccessKey(
      operationId,
      accessKeySecret
    );
    const authPassword = toPendingAuthPassword(accessKey);

    if (!alreadyFinalized && alreadyPrepared) {
      currentAuthUser = await getAuthUser(profile.auth_user_id);
      const existingAuthOperationId = String(
        currentAuthUser?.app_metadata?.provisionalCredentialOperationId ?? ''
      ).trim();

      if (existingAuthOperationId !== operationId) {
        if (!existingAuthOperationId) {
          try {
            await restRequest(
              'rpc/cancel_stale_provisional_access_key_rotation',
              {
                body: {
                  p_actor_profile_id: adminIdentity.profile.id,
                  p_operation_id: operationId,
                  p_profile_id: profile.id,
                },
                method: 'POST',
              }
            );

            return sendJson(response, 409, {
              error:
                'La rotation interrompue a été libérée. Relance la génération de la clé.',
              resetOperation: true,
            });
          } catch {
            return sendJson(response, 409, {
              error:
                'Une rotation de clé est déjà en cours. Réessaie dans quelques instants.',
            });
          }
        }

        return sendJson(response, 409, {
          error: 'Une autre mutation des identifiants est déjà en cours.',
        });
      }
    }

    if (!alreadyFinalized && !alreadyPrepared) {
      const rotatedUserMetadata = {
        ...(currentAuthUser?.user_metadata ?? {}),
      };

      delete rotatedUserMetadata.emailTemplatePurpose;
      delete rotatedUserMetadata.initialSetupOperationId;

      try {
        await authAdminRequest(
          `admin/users/${encodeURIComponent(profile.auth_user_id)}`,
          {
            body: {
              app_metadata: {
                ...(currentAuthUser?.app_metadata ?? {}),
                pending_activation: true,
                provisionalCredentialOperationId: operationId,
              },
              password: authPassword,
              user_metadata: rotatedUserMetadata,
            },
            method: 'PUT',
          }
        );
      } catch (authUpdateError) {
        const reconciledAuthUser = await getAuthUser(
          profile.auth_user_id
        ).catch(() => null);

        if (
          reconciledAuthUser?.app_metadata
            ?.provisionalCredentialOperationId !== operationId
        ) {
          throw authUpdateError;
        }
      }
    }

    const { payload: verifiedKey, response: verifiedKeyResponse } =
      await supabaseRequest(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        body: JSON.stringify({
          email: currentAuthUser.email,
          password: authPassword,
        }),
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          ...getForwardedAuthHeaders(request),
        },
        method: 'POST',
      });

    if (!verifiedKeyResponse.ok || !verifiedKey?.access_token) {
      const error = new Error('La nouvelle clé n’a pas pu être vérifiée.');
      error.status = 409;
      throw error;
    }

    transientAccessToken = verifiedKey.access_token;

    if (!alreadyFinalized) {
      try {
        await restRequest('rpc/complete_provisional_access_key_rotation', {
          body: {
            p_actor_profile_id: adminIdentity.profile.id,
            p_operation_id: operationId,
            p_profile_id: profile.id,
          },
          method: 'POST',
        });
      } catch (finalizationError) {
        const reconciledProfile = await findProfile(profile.id);

        if (
          reconciledProfile?.metadata?.lastAccessKeyOperationId !== operationId
        ) {
          throw finalizationError;
        }
      }
    }

    profile = await findProfile(profile.id);

    if (!profile) {
      throw new Error('Le profil est introuvable après la rotation de clé.');
    }

    return sendJson(response, 200, {
      accessKey,
      profile: toPublicProfile(profile),
    });
  } catch (error) {
    console.error('Access-key regeneration failed.', error);
    return sendJson(response, error.status || 400, {
      error: error.message || 'Impossible de régénérer cette clé d’accès.',
    });
  } finally {
    await logoutSupabaseAccessToken(transientAccessToken).catch(() => null);
  }
};
