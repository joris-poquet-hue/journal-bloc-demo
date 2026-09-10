const {
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
  clearApplicationSessionCookie,
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
      const currentContactEmail = normalizeEmail(
        profile.metadata?.contactEmail
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

      const pendingPurpose = profile.metadata?.pendingEmailPurpose;
      const credentialOperation = profile.metadata?.credentialOperation;
      const preparedInitialSetup = Boolean(
        profile.must_change_password &&
          credentialOperation?.kind === 'initial_setup' &&
          (credentialOperation?.state === 'prepared' ||
            credentialOperation?.state === 'awaiting_email') &&
          credentialOperation?.id &&
          normalizeEmail(credentialOperation?.contactEmail) === confirmedEmail &&
          user.user_metadata?.initialSetupOperationId === credentialOperation.id
      );

      const pendingRequestRecordedAt = String(
        profile.metadata?.pendingEmailRequestedAt ?? ''
      ).trim();
      const hasExactPendingConfirmation = Boolean(
        pendingEmail &&
          pendingEmail === confirmedEmail &&
          (pendingPurpose === 'activation' || pendingPurpose === 'change') &&
          pendingRequestRecordedAt
      );
      const repeatsFinalizedConfirmation = Boolean(
        !pendingEmail && currentContactEmail === confirmedEmail
      );

      if (!hasExactPendingConfirmation && !repeatsFinalizedConfirmation) {
        return sendJson(response, 409, {
          error: 'Cette confirmation ne correspond à aucune demande en attente.',
        });
      }

      const completesActivation =
        profile.must_change_password &&
        (preparedInitialSetup ||
          (hasExactPendingConfirmation &&
            pendingPurpose === 'activation' &&
            !credentialOperation));

      if (profile.must_change_password && !completesActivation) {
        return sendJson(response, 409, {
          error:
            'Cette confirmation ne peut pas activer le compte. Reconnecte-toi avec la clé provisoire pour terminer la configuration sécurisée.',
        });
      }

      const purpose =
        completesActivation || pendingPurpose === 'activation'
          ? 'activation'
          : 'change';

      try {
        await restRequest('rpc/finalize_confirmed_email', {
          body: {
            p_confirmed_email: confirmedEmail,
            p_profile_id: profile.id,
            p_purpose: purpose,
          },
          method: 'POST',
        });

        await revokeAllApplicationSessions(
          profile.id,
          purpose === 'activation'
            ? 'Première connexion confirmée'
            : 'Adresse e-mail modifiée'
        );

        const finalizedProfile = await getProfileByAuthUserId(
          profile.auth_user_id
        );

        if (!finalizedProfile) {
          throw new Error('Profil introuvable après la confirmation e-mail.');
        }

        let applicationSession;

        try {
          applicationSession = await createApplicationSession(
            finalizedProfile,
            request,
            { authContext: 'standard' }
          );
          setApplicationSessionCookie(response, applicationSession.token);
        } catch (sessionError) {
          console.error(
            'Confirmed email finalized without a replacement session.',
            sessionError
          );
          clearApplicationSessionCookie(response);

          return sendJson(response, 200, {
            confirmationRecorded: true,
            message:
              'Adresse e-mail confirmée. Reconnecte-toi pour ouvrir une nouvelle session sécurisée.',
            requiresLogin: true,
            type: 'email_change',
          });
        }

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
