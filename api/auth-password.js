const {
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
  authAdminRequest,
  authenticateRequest,
  buildRateLimitScope,
  checkRateLimit,
  clearApplicationSessionCookie,
  clearAuthFailures,
  getForwardedAuthHeaders,
  getAuthUser,
  getRequestBody,
  isConfigured,
  isValidEmail,
  logoutSupabaseAccessToken,
  normalizeEmail,
  registerAuthFailure,
  restRequest,
  sendJson,
  supabaseRequest,
  toPublicProfile,
  validatePassword,
} = require('../src/serverAuth.cjs');
const {
  isAccessKey,
  toPendingAuthPassword,
} = require('../src/accessKey.cjs');

const DEFAULT_AUTH_REDIRECT_URL = 'https://monjournaldebloc.fr/';

function getAuthErrorMessage(payload, fallback) {
  return (
    payload?.msg ||
    payload?.error_description ||
    payload?.error ||
    payload?.message ||
    fallback
  );
}

function getAuthRedirectUrl() {
  return String(
    process.env.SUPABASE_AUTH_REDIRECT_TO || DEFAULT_AUTH_REDIRECT_URL
  ).trim();
}

async function requestConfirmedEmailChange(request, accessToken, input) {
  const redirectTo = getAuthRedirectUrl();
  const { payload, response } = await supabaseRequest(
    `${SUPABASE_URL}/auth/v1/user?redirect_to=${encodeURIComponent(redirectTo)}`,
    {
      body: JSON.stringify(input),
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        ...getForwardedAuthHeaders(request),
      },
      method: 'PUT',
    }
  );

  if (!response.ok) {
    throw Object.assign(
      new Error(
        getAuthErrorMessage(
          payload,
          'Impossible d’envoyer le lien de confirmation à cette adresse.'
        )
      ),
      { status: response.status }
    );
  }
}

async function requestPasswordGrant(request, email, password) {
  return supabaseRequest(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    body: JSON.stringify({ email, password }),
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...getForwardedAuthHeaders(request),
    },
    method: 'POST',
  });
}

function getRpcObject(payload) {
  return Array.isArray(payload) ? payload[0] ?? null : payload;
}

async function storePendingEmailConfirmation(profile, contactEmail, purpose) {
  const requestedAt = new Date().toISOString();

  await restRequest('rpc/store_pending_email_confirmation', {
    body: {
      p_contact_email: contactEmail,
      p_profile_id: profile.id,
      p_purpose: purpose,
      p_requested_at: requestedAt,
    },
    method: 'POST',
  });
}

async function recordEmailConfirmationRequest(profile, purpose) {
  await restRequest('activity_log', {
    body: {
      action:
        purpose === 'activation'
          ? 'Confirmation e-mail de première connexion demandée'
          : 'Confirmation de la nouvelle adresse e-mail demandée',
      actor_label: `${profile.first_name} ${profile.last_name}`.trim(),
      actor_role: profile.role,
      created_by_profile_id: profile.id,
      profile_id: profile.id,
      target_label: profile.login_id,
      target_type: 'Compte utilisateur',
    },
    headers: {
      Prefer: 'return=minimal',
    },
    method: 'POST',
  });
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

  let identity;
  const transientAccessTokens = new Set();

  try {
    identity = await authenticateRequest(request);
  } catch (error) {
    console.error('Unable to verify the credential-change session.', error);
    return sendJson(response, 503, { error: 'Impossible de vérifier la session.' });
  }

  if (!identity?.user?.email || !identity?.profile?.auth_user_id) {
    return sendJson(response, 401, { error: 'Une authentification est requise.' });
  }

  let body;

  try {
    body = await getRequestBody(request);
  } catch {
    return sendJson(response, 400, { error: 'Corps JSON invalide.' });
  }

  const action =
    body?.action === 'change-email'
      ? 'change-email'
      : body?.completeSetup === true
        ? 'complete-setup'
        : 'change-password';
  const currentPassword =
    typeof body?.currentPassword === 'string' ? body.currentPassword : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const contactEmail = normalizeEmail(body?.contactEmail);
  const isRecoverySession = identity.session?.auth_context === 'recovery';
  const changesPassword = action !== 'change-email';
  const requestsEmailConfirmation = action !== 'change-password';

  if (!currentPassword && (!isRecoverySession || action !== 'change-password')) {
    return sendJson(response, 400, { error: 'Le mot de passe actuel est obligatoire.' });
  }

  if (changesPassword) {
    const passwordError = validatePassword(password);

    if (passwordError) {
      return sendJson(response, 400, { error: passwordError });
    }

    if (currentPassword && currentPassword === password) {
      return sendJson(response, 400, {
        error: 'Le nouveau mot de passe doit être différent du mot de passe actuel.',
      });
    }
  }

  if (requestsEmailConfirmation && !isValidEmail(contactEmail)) {
    return sendJson(response, 400, {
      error: 'L’adresse e-mail renseignée n’est pas valide.',
    });
  }

  if (action === 'complete-setup' && !identity.profile.must_change_password) {
    return sendJson(response, 409, {
      error: 'Ce compte a déjà terminé sa première connexion.',
    });
  }

  if (identity.profile.must_change_password && action !== 'complete-setup') {
    return sendJson(response, 409, {
      error:
        'Termine d’abord la première connexion avec ta clé provisoire et ton nouveau mot de passe.',
    });
  }

  if (
    action === 'change-email' &&
    contactEmail === normalizeEmail(identity.profile.metadata?.contactEmail)
  ) {
    return sendJson(response, 400, {
      error: 'La nouvelle adresse e-mail doit être différente de l’adresse actuelle.',
    });
  }

  const rateLimitScope = buildRateLimitScope(
    request,
    identity.profile.login_id,
    requestsEmailConfirmation ? 'email-change' : 'password-change'
  );
  const rateLimit = await checkRateLimit(rateLimitScope);

  if (!rateLimit.allowed) {
    response.setHeader('Retry-After', String(rateLimit.retryAfterSeconds));
    return sendJson(response, 429, {
      error: 'Trop de tentatives. Réessayez dans quelques minutes.',
    });
  }

  try {
    let authenticatedAccessToken = null;
    let verifiedAuthPassword = null;
    let passwordAlreadyRotated = false;

    if (currentPassword) {
      const authenticationPassword =
        action === 'complete-setup' &&
        identity.profile.must_change_password &&
        isAccessKey(currentPassword)
          ? toPendingAuthPassword(currentPassword)
          : currentPassword;
      let { payload, response: authResponse } = await requestPasswordGrant(
        request,
        identity.user.email,
        authenticationPassword
      );

      if (
        (!authResponse.ok || !payload?.access_token) &&
        action === 'complete-setup'
      ) {
        const resumedGrant = await requestPasswordGrant(
          request,
          identity.user.email,
          password
        );
        payload = resumedGrant.payload;
        authResponse = resumedGrant.response;
        passwordAlreadyRotated = Boolean(
          authResponse.ok && payload?.access_token
        );
      }

      if (!authResponse.ok || !payload?.access_token) {
        await registerAuthFailure(rateLimitScope);
        return sendJson(response, 401, {
          error: 'Le mot de passe actuel est incorrect.',
        });
      }

      authenticatedAccessToken = payload.access_token;
      verifiedAuthPassword = passwordAlreadyRotated
        ? password
        : authenticationPassword;
      transientAccessTokens.add(payload.access_token);
    }

    if (action === 'complete-setup') {
      const purpose = 'activation';
      const setupStartedAt = new Date().toISOString();
      const preparedSetup = getRpcObject(
        await restRequest('rpc/begin_initial_account_setup', {
          body: {
            p_contact_email: contactEmail,
            p_current_session_id: identity.session.session_id,
            p_expected_version: identity.profile.version,
            p_profile_id: identity.profile.id,
            p_started_at: setupStartedAt,
          },
          method: 'POST',
        })
      );
      const operationId = String(preparedSetup?.operationId ?? '').trim();

      if (!operationId) {
        throw Object.assign(
          new Error('La réservation de première connexion a échoué.'),
          { status: 409 }
        );
      }

      let currentAuthUser = await getAuthUser(identity.profile.auth_user_id);
      let authOperationMatches =
        currentAuthUser?.user_metadata?.initialSetupOperationId === operationId;

      if (!passwordAlreadyRotated || !authOperationMatches) {
        try {
          await requestConfirmedEmailChange(request, authenticatedAccessToken, {
            current_password: verifiedAuthPassword,
            data: {
              emailTemplatePurpose: purpose,
              initialSetupOperationId: operationId,
            },
            email: contactEmail,
            ...(passwordAlreadyRotated ? {} : { password }),
          });
        } catch (emailChangeError) {
          currentAuthUser = await getAuthUser(
            identity.profile.auth_user_id
          ).catch(() => null);
          authOperationMatches =
            currentAuthUser?.user_metadata?.initialSetupOperationId ===
            operationId;

          if (!authOperationMatches) {
            const status = Number(emailChangeError?.status ?? 0);
            const authMarkerIsConfirmedAbsent = Boolean(
              currentAuthUser &&
                !currentAuthUser.user_metadata?.initialSetupOperationId
            );

            if (
              status >= 400 &&
              status < 500 &&
              status !== 408 &&
              status !== 499 &&
              authMarkerIsConfirmedAbsent
            ) {
              await restRequest('rpc/cancel_initial_account_setup', {
                body: {
                  p_current_session_id: identity.session.session_id,
                  p_operation_id: operationId,
                  p_profile_id: identity.profile.id,
                },
                method: 'POST',
              }).catch((cancellationError) => {
                console.error(
                  'Definitive Auth rejection left an initial setup reservation that could not be cancelled.',
                  cancellationError
                );
              });
            }

            throw emailChangeError;
          }
        }
      }

      currentAuthUser = await getAuthUser(identity.profile.auth_user_id);
      authOperationMatches =
        currentAuthUser?.user_metadata?.initialSetupOperationId === operationId;

      if (!authOperationMatches || !currentAuthUser?.email) {
        throw Object.assign(
          new Error('La rotation Auth ne correspond pas à la demande préparée.'),
          { status: 409 }
        );
      }

      const {
        payload: verifiedPasswordPayload,
        response: verifiedPasswordResponse,
      } = await requestPasswordGrant(
        request,
        currentAuthUser.email,
        password
      );

      if (!verifiedPasswordResponse.ok || !verifiedPasswordPayload?.access_token) {
        throw Object.assign(
          new Error(
            'Le nouveau mot de passe n’a pas pu être vérifié. Reconnecte-toi puis réessaie.'
          ),
          { status: 409 }
        );
      }

      transientAccessTokens.add(verifiedPasswordPayload.access_token);

      const pendingConfirmation = getRpcObject(
        await restRequest('rpc/await_initial_account_email_confirmation', {
          body: {
            p_current_session_id: identity.session.session_id,
            p_operation_id: operationId,
            p_profile_id: identity.profile.id,
          },
          method: 'POST',
        })
      );

      if (pendingConfirmation?.confirmationPending !== true) {
        throw Object.assign(
          new Error(
            'Le compte n’a pas pu être placé en attente de confirmation e-mail.'
          ),
          { status: 409 }
        );
      }

      await clearAuthFailures(rateLimitScope);
      clearApplicationSessionCookie(response);

      return sendJson(response, 200, {
        message:
          'Un lien de confirmation vient d’être envoyé. Ouvre-le pour activer ton compte et accéder à ton espace.',
        pendingEmailConfirmation: true,
        profile: toPublicProfile(identity.profile),
        requiresLogin: true,
        success: true,
      });
    }

    if (action === 'change-email') {
      const purpose = 'change';

      await requestConfirmedEmailChange(request, authenticatedAccessToken, {
        data: { emailTemplatePurpose: purpose },
        email: contactEmail,
      });

      await storePendingEmailConfirmation(identity.profile, contactEmail, purpose);
      await recordEmailConfirmationRequest(identity.profile, purpose);
      await clearAuthFailures(rateLimitScope);

      return sendJson(response, 200, {
        message:
          'Un lien de confirmation vient d’être envoyé à la nouvelle adresse. L’adresse actuelle reste active jusque-là.',
        pendingEmailConfirmation: true,
        profile: toPublicProfile(identity.profile),
        success: true,
      });
    }

    if (authenticatedAccessToken) {
      const { payload, response: passwordResponse } = await supabaseRequest(
        `${SUPABASE_URL}/auth/v1/user`,
        {
          body: JSON.stringify({
            current_password: verifiedAuthPassword || undefined,
            password,
          }),
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${authenticatedAccessToken}`,
            'Content-Type': 'application/json',
            ...getForwardedAuthHeaders(request),
          },
          method: 'PUT',
        }
      );

      if (!passwordResponse.ok) {
        throw Object.assign(
          new Error(
            getAuthErrorMessage(
              payload,
              'Impossible de modifier le mot de passe.'
            )
          ),
          { status: passwordResponse.status }
        );
      }
    } else {
      await authAdminRequest(
        `admin/users/${encodeURIComponent(identity.profile.auth_user_id)}`,
        {
          body: { password },
          method: 'PUT',
        }
      );
    }

    if (isRecoverySession) {
      await restRequest('application_sessions', {
        body: {
          auth_context: 'standard',
        },
        headers: {
          Prefer: 'return=minimal',
        },
        method: 'PATCH',
        searchParams: {
          id: `eq.${identity.session.session_id}`,
        },
      });
    }

    const { payload: refreshedSession, response: refreshedAuthResponse } =
      await supabaseRequest(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        body: JSON.stringify({
          email: identity.user.email,
          password,
        }),
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          ...getForwardedAuthHeaders(request),
        },
        method: 'POST',
      });

    if (!refreshedAuthResponse.ok || !refreshedSession?.access_token) {
      throw Object.assign(
        new Error(
          'Le mot de passe a été modifié. Reconnecte-toi avec ton nouveau mot de passe.'
        ),
        { status: 409 }
      );
    }

    transientAccessTokens.add(refreshedSession.access_token);
    await clearAuthFailures(rateLimitScope);

    return sendJson(response, 200, {
      profile: toPublicProfile(identity.profile),
      success: true,
    });
  } catch (error) {
    console.error('Credential change failed.', error);
    await registerAuthFailure(rateLimitScope);
    return sendJson(response, error.status || 400, {
      error: error.message || 'Impossible de modifier les informations du compte.',
    });
  } finally {
    await Promise.all(
      [...transientAccessTokens].map((accessToken) =>
        logoutSupabaseAccessToken(accessToken).catch(() => null)
      )
    );
  }
};
