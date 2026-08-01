const {
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
  authAdminRequest,
  createApplicationSession,
  getForwardedAuthHeaders,
  getProfileByAuthUserId,
  getRequestBody,
  isApplicationSessionConfigured,
  isMobileApplicationRequest,
  logoutSupabaseAccessToken,
  normalizeEmail,
  restRequest,
  revokeAllApplicationSessions,
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

  if (
    !accessToken ||
    (callbackType !== 'recovery' && callbackType !== 'email_change')
  ) {
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

    if (callbackType === 'email_change') {
      const confirmedEmail = normalizeEmail(user.email);
      const pendingEmail = normalizeEmail(
        profile.metadata?.pendingContactEmail
      );

      if (!confirmedEmail) {
        return sendJson(response, 400, {
          error: 'L’adresse e-mail confirmée est introuvable.',
        });
      }

      if (pendingEmail && confirmedEmail !== pendingEmail) {
        return sendJson(response, 409, {
          error:
            'La nouvelle adresse n’est pas encore confirmée. Ouvre le lien reçu sur cette nouvelle adresse.',
        });
      }

      const purpose =
        profile.metadata?.pendingEmailPurpose === 'activation' ||
        profile.must_change_password
          ? 'activation'
          : 'change';
      const confirmedMetadata = {
        ...(profile.metadata ?? {}),
        contactEmail: confirmedEmail,
      };

      delete confirmedMetadata.pendingContactEmail;
      delete confirmedMetadata.pendingEmailPurpose;
      delete confirmedMetadata.pendingEmailRequestedAt;

      let activationFlagUpdated = false;
      let emailLifecycleFinalized = false;

      try {
        if (purpose === 'activation') {
          await authAdminRequest(
            `admin/users/${encodeURIComponent(profile.auth_user_id)}`,
            {
              body: {
                app_metadata: {
                  ...(user.app_metadata ?? {}),
                  pending_activation: false,
                },
              },
              method: 'PUT',
            }
          );
          activationFlagUpdated = true;
        }

        await restRequest('rpc/finalize_confirmed_email', {
          body: {
            p_confirmed_email: confirmedEmail,
            p_profile_id: profile.id,
            p_purpose: purpose,
          },
          method: 'POST',
        });
        emailLifecycleFinalized = true;

        await revokeAllApplicationSessions(
          profile.id,
          purpose === 'activation'
            ? 'Première connexion confirmée'
            : 'Adresse e-mail modifiée'
        );

        const finalizedProfile = {
          ...profile,
          metadata: confirmedMetadata,
          must_change_password:
            purpose === 'activation' ? false : profile.must_change_password,
          updated_at: new Date().toISOString(),
        };
        const applicationSession = await createApplicationSession(
          finalizedProfile,
          request,
          { authContext: 'standard' }
        );
        setApplicationSessionCookie(response, applicationSession.token);

        return sendJson(response, 200, {
          ...(isMobileApplicationRequest(request)
            ? { mobileSessionToken: applicationSession.token }
            : {}),
          message:
            purpose === 'activation'
              ? 'Adresse confirmée. Ton compte est maintenant actif.'
              : 'Nouvelle adresse confirmée et enregistrée.',
          profile: toPublicProfile(finalizedProfile),
          type: 'email_change',
        });
      } catch (error) {
        if (activationFlagUpdated && !emailLifecycleFinalized) {
          await authAdminRequest(
            `admin/users/${encodeURIComponent(profile.auth_user_id)}`,
            {
              body: {
                app_metadata: {
                  ...(user.app_metadata ?? {}),
                  pending_activation: true,
                },
              },
              method: 'PUT',
            }
          ).catch(() => null);
        }

        throw error;
      }
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
