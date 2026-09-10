const {
  buildRateLimitScope,
  challengeAndVerifyAnyTotp,
  checkRateLimit,
  clearAuthFailures,
  createApplicationSession,
  getAuthUser,
  getProfileByLoginId,
  getRequestBody,
  isApplicationSessionConfigured,
  isMobileApplicationRequest,
  listMfaFactors,
  logoutSupabaseAccessToken,
  normalizeEmail,
  normalizeLoginId,
  registerAuthFailure,
  restRequest,
  revokeApplicationSession,
  sendJson,
  setApplicationSessionCookie,
  signInAuthUserWithPassword,
  toPublicProfile,
} = require('../src/serverAuth.cjs');
const { reportServerError } = require('../src/serverObservability.cjs');
const {
  isAccessKey,
  toPendingAuthPassword,
} = require('../src/accessKey.cjs');

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
  let createdApplicationSessionId = null;

  try {
    body = await getRequestBody(request);
  } catch {
    return sendJson(response, 400, { error: 'Corps JSON invalide.' });
  }

  const loginId = normalizeLoginId(body?.loginId);
  const password = typeof body?.password === 'string' ? body.password : '';
  const mfaCode = typeof body?.mfaCode === 'string' ? body.mfaCode.trim() : '';

  if (!loginId || !password) {
    return sendJson(response, 401, { error: 'Identifiants incorrects.' });
  }

  const rateLimitScope = buildRateLimitScope(request, loginId, 'login');
  const rateLimit = await checkRateLimit(rateLimitScope);

  if (!rateLimit.allowed) {
    response.setHeader('Retry-After', String(rateLimit.retryAfterSeconds));
    return sendJson(response, 429, {
      error: 'Trop de tentatives de connexion. Réessayez plus tard.',
    });
  }

  try {
    let profile = await getProfileByLoginId(loginId);

    if (!profile?.auth_user_id) {
      await registerAuthFailure(rateLimitScope);
      return sendJson(response, 401, { error: 'Identifiants incorrects.' });
    }

    const user = await getAuthUser(profile.auth_user_id);

    if (!user?.email) {
      await registerAuthFailure(rateLimitScope);
      return sendJson(response, 401, { error: 'Identifiants incorrects.' });
    }

    const usedProvisionalAccessKey =
      profile.must_change_password && isAccessKey(password);
    const authPassword = usedProvisionalAccessKey
      ? toPendingAuthPassword(password)
      : password;
    let payload;

    try {
      payload = await signInAuthUserWithPassword(
        user.email,
        authPassword,
        request
      );
    } catch {
      await registerAuthFailure(rateLimitScope);
      return sendJson(response, 401, { error: 'Identifiants incorrects.' });
    }

    transientAccessToken = payload.access_token;

    const lastInitialSetupOperationId = String(
      profile.metadata?.lastInitialSetupOperationId ?? ''
    ).trim();
    const hasResidualSetupAuthMetadata = Boolean(
      lastInitialSetupOperationId &&
        !profile.must_change_password &&
        (String(user.app_metadata?.pending_activation) === 'true' ||
          user.app_metadata?.provisionalCredentialOperationId ||
          user.user_metadata?.initialSetupOperationId ===
            lastInitialSetupOperationId ||
          user.user_metadata?.emailTemplatePurpose === 'activation')
    );

    if (hasResidualSetupAuthMetadata) {
      await restRequest(
        'rpc/repair_completed_initial_setup_auth_metadata',
        {
          body: {
            p_operation_id: lastInitialSetupOperationId,
            p_profile_id: profile.id,
          },
          method: 'POST',
        }
      ).catch((metadataError) => {
        reportServerError('auth.completed_setup_metadata_repair_failed', metadataError);
      });
    }

    const credentialOperation = profile.metadata?.credentialOperation;
    const pendingEmail = normalizeEmail(
      profile.metadata?.pendingContactEmail ||
        credentialOperation?.contactEmail
    );
    const pendingPurpose = profile.metadata?.pendingEmailPurpose;
    const authEmail = normalizeEmail(user.email);
    const authPendingEmail = normalizeEmail(user.email_change);
    const preparedInitialSetup = Boolean(
      !usedProvisionalAccessKey &&
        profile.must_change_password &&
        credentialOperation?.kind === 'initial_setup' &&
        (credentialOperation?.state === 'prepared' ||
          credentialOperation?.state === 'awaiting_email') &&
        credentialOperation?.id &&
        normalizeEmail(credentialOperation?.contactEmail) === pendingEmail &&
        user.user_metadata?.initialSetupOperationId === credentialOperation.id
    );
    const legacyInitialSetup = Boolean(
      !credentialOperation &&
        profile.must_change_password &&
        pendingPurpose === 'activation' &&
        profile.metadata?.pendingEmailRequestedAt
    );
    const confirmedInitialSetup = Boolean(
      !usedProvisionalAccessKey &&
        pendingEmail &&
        authEmail === pendingEmail &&
        !authPendingEmail &&
        (preparedInitialSetup || legacyInitialSetup)
    );

    if (confirmedInitialSetup) {
      await restRequest('rpc/finalize_confirmed_email', {
        body: {
          p_confirmed_email: authEmail,
          p_profile_id: profile.id,
          p_purpose: 'activation',
        },
        method: 'POST',
      });
      profile = await getProfileByLoginId(loginId);

      if (!profile || profile.must_change_password) {
        throw new Error('The confirmed account setup is still pending.');
      }
    } else if (!usedProvisionalAccessKey && profile.must_change_password) {
      await clearAuthFailures(rateLimitScope);
      return sendJson(response, 403, {
        error:
          'Confirme d’abord ton adresse e-mail avec le lien reçu pour activer ton compte.',
      });
    }

    let mfaVerified = false;

    if (!profile.must_change_password) {
      const verifiedTotpFactors = (await listMfaFactors(profile.auth_user_id))
        .filter(
          (factor) =>
            factor?.factor_type === 'totp' && factor?.status === 'verified'
        )
        .sort((left, right) =>
          String(right.updated_at ?? '').localeCompare(
            String(left.updated_at ?? '')
          )
        );

      if (verifiedTotpFactors.length > 0 && !mfaCode) {
        await clearAuthFailures(rateLimitScope);
        return sendJson(response, 202, {
          message:
            'Saisis le code à six chiffres de ton application d’authentification.',
          requiresMfa: true,
        });
      }

      if (verifiedTotpFactors.length > 0) {
        try {
          const verifiedFactor = await challengeAndVerifyAnyTotp(
            transientAccessToken,
            verifiedTotpFactors,
            mfaCode
          );
          transientAccessToken = verifiedFactor.session.access_token;
          mfaVerified = true;
        } catch {
          await registerAuthFailure(rateLimitScope);
          return sendJson(response, 401, {
            error: 'Le code de vérification est incorrect ou expiré.',
            requiresMfa: true,
          });
        }
      }
    }

    const applicationSession = await createApplicationSession(profile, request, {
      mfaVerified,
    });
    createdApplicationSessionId = applicationSession.session.id;

    const refreshedProfile = await getProfileByLoginId(loginId);

    if (
      !refreshedProfile?.auth_user_id ||
      refreshedProfile.auth_user_id !== profile.auth_user_id ||
      (usedProvisionalAccessKey && !refreshedProfile.must_change_password)
    ) {
      await revokeApplicationSession(
        applicationSession.session.id,
        'provisional_key_invalidated_during_login'
      );
      createdApplicationSessionId = null;
      await registerAuthFailure(rateLimitScope);
      return sendJson(response, 401, { error: 'Identifiants incorrects.' });
    }

    setApplicationSessionCookie(response, applicationSession.token);
    await clearAuthFailures(rateLimitScope);
    createdApplicationSessionId = null;

    return sendJson(response, 200, {
      ...(isMobileApplicationRequest(request)
        ? { mobileSessionToken: applicationSession.token }
        : {}),
      profile: toPublicProfile(refreshedProfile),
      security: {
        mfaVerified,
      },
    });
  } catch (error) {
    if (createdApplicationSessionId) {
      await revokeApplicationSession(
        createdApplicationSessionId,
        'login_failed_after_session_creation'
      ).catch(() => null);
    }

    reportServerError('auth.login_failed', error);
    await registerAuthFailure(rateLimitScope);
    return sendJson(response, 401, { error: 'Identifiants incorrects.' });
  } finally {
    await logoutSupabaseAccessToken(transientAccessToken).catch(() => null);
  }
};
