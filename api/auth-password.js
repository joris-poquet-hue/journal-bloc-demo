const {
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
  authAdminRequest,
  authenticateRequest,
  buildRateLimitScope,
  checkRateLimit,
  clearAuthFailures,
  getForwardedAuthHeaders,
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

async function storePendingEmailConfirmation(profile, contactEmail, purpose) {
  const requestedAt = new Date().toISOString();

  await restRequest('profiles', {
    body: {
      metadata: {
        ...(profile.metadata ?? {}),
        pendingContactEmail: contactEmail,
        pendingEmailPurpose: purpose,
        pendingEmailRequestedAt: requestedAt,
      },
      updated_at: requestedAt,
    },
    headers: {
      Prefer: 'return=minimal',
    },
    method: 'PATCH',
    searchParams: {
      id: `eq.${profile.id}`,
    },
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

  if (action === 'change-email' && identity.profile.must_change_password) {
    return sendJson(response, 409, {
      error: 'Termine d’abord la confirmation de ta première adresse e-mail.',
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

    if (currentPassword) {
      const authenticationPassword =
        action === 'complete-setup' &&
        identity.profile.must_change_password &&
        isAccessKey(currentPassword)
          ? toPendingAuthPassword(currentPassword)
          : currentPassword;
      const { payload, response: authResponse } = await supabaseRequest(
        `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
        {
          body: JSON.stringify({
            email: identity.user.email,
            password: authenticationPassword,
          }),
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'Content-Type': 'application/json',
            ...getForwardedAuthHeaders(request),
          },
          method: 'POST',
        }
      );

      if (!authResponse.ok || !payload?.access_token) {
        await registerAuthFailure(rateLimitScope);
        return sendJson(response, 401, {
          error: 'Le mot de passe actuel est incorrect.',
        });
      }

      authenticatedAccessToken = payload.access_token;
      transientAccessTokens.add(payload.access_token);
    }

    if (requestsEmailConfirmation) {
      await requestConfirmedEmailChange(
        request,
        authenticatedAccessToken,
        action === 'complete-setup'
          ? { email: contactEmail, password }
          : { email: contactEmail }
      );

      const purpose = action === 'complete-setup' ? 'activation' : 'change';
      await storePendingEmailConfirmation(identity.profile, contactEmail, purpose);
      await recordEmailConfirmationRequest(identity.profile, purpose);
      await clearAuthFailures(rateLimitScope);

      return sendJson(response, 200, {
        message:
          purpose === 'activation'
            ? 'Un lien de confirmation vient d’être envoyé. Ouvre-le pour activer ton compte.'
            : 'Un lien de confirmation vient d’être envoyé à la nouvelle adresse. L’adresse actuelle reste active jusque-là.',
        pendingEmailConfirmation: true,
        profile: toPublicProfile(identity.profile),
        success: true,
      });
    }

    await authAdminRequest(
      `admin/users/${encodeURIComponent(identity.profile.auth_user_id)}`,
      {
        body: { password },
        method: 'PUT',
      }
    );

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
