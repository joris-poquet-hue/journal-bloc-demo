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
    console.error('Unable to verify the password-change session.', error);
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

  const currentPassword =
    typeof body?.currentPassword === 'string' ? body.currentPassword : '';
  const password = typeof body?.password === 'string' ? body.password : '';
  const completeSetup = body?.completeSetup === true;
  const contactEmail = normalizeEmail(body?.contactEmail);
  const confirmContactEmail = normalizeEmail(body?.confirmContactEmail);
  const passwordError = validatePassword(password);
  const isRecoverySession = identity.session?.auth_context === 'recovery';

  if (!currentPassword && !isRecoverySession) {
    return sendJson(response, 400, { error: 'Le mot de passe actuel est obligatoire.' });
  }

  if (passwordError) {
    return sendJson(response, 400, { error: passwordError });
  }

  if (currentPassword && currentPassword === password) {
    return sendJson(response, 400, {
      error: 'Le nouveau mot de passe doit être différent du mot de passe actuel.',
    });
  }

  if (completeSetup) {
    if (!isValidEmail(contactEmail)) {
      return sendJson(response, 400, {
        error: 'L’adresse e-mail renseignée n’est pas valide.',
      });
    }

    if (contactEmail !== confirmContactEmail) {
      return sendJson(response, 400, {
        error: 'Les deux adresses e-mail ne correspondent pas.',
      });
    }
  }

  const rateLimitScope = buildRateLimitScope(
    request,
    identity.profile.login_id,
    'password-change'
  );
  const rateLimit = await checkRateLimit(rateLimitScope);

  if (!rateLimit.allowed) {
    response.setHeader('Retry-After', String(rateLimit.retryAfterSeconds));
    return sendJson(response, 429, {
      error: 'Trop de tentatives. Réessayez dans quelques minutes.',
    });
  }

  try {
    if (currentPassword) {
      const authenticationPassword =
        completeSetup &&
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

      transientAccessTokens.add(payload.access_token);
    }

    await authAdminRequest(
      `admin/users/${encodeURIComponent(identity.profile.auth_user_id)}`,
      {
        body: completeSetup
          ? {
              app_metadata: {
                ...(identity.user.app_metadata ?? {}),
                pending_activation: false,
              },
              email: contactEmail,
              email_confirm: true,
              password,
            }
          : { password },
        method: 'PUT',
      }
    );

    if (completeSetup) {
      await restRequest('profiles', {
        body: {
          metadata: {
            ...(identity.profile.metadata ?? {}),
            contactEmail,
          },
          must_change_password: false,
          updated_at: new Date().toISOString(),
        },
        headers: {
          Prefer: 'return=minimal',
        },
        method: 'PATCH',
        searchParams: {
          id: `eq.${identity.profile.id}`,
        },
      });

      await restRequest('activity_log', {
        body: {
          action: 'Première connexion finalisée',
          actor_label:
            `${identity.profile.first_name} ${identity.profile.last_name}`.trim(),
          actor_role: identity.profile.role,
          created_by_profile_id: identity.profile.id,
          profile_id: identity.profile.id,
          target_label: identity.profile.login_id,
          target_type: 'Compte utilisateur',
        },
        headers: {
          Prefer: 'return=minimal',
        },
        method: 'POST',
      });
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
          email: completeSetup ? contactEmail : identity.user.email,
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
      profile: toPublicProfile({
        ...identity.profile,
        metadata: completeSetup
          ? {
              ...(identity.profile.metadata ?? {}),
              contactEmail,
            }
          : identity.profile.metadata,
        must_change_password: completeSetup
          ? false
          : identity.profile.must_change_password,
      }),
      success: true,
    });
  } catch (error) {
    console.error('Password change failed.', error);
    await registerAuthFailure(rateLimitScope);
    return sendJson(response, error.status || 400, {
      error: error.message || 'Impossible de modifier le mot de passe.',
    });
  } finally {
    await Promise.all(
      [...transientAccessTokens].map((accessToken) =>
        logoutSupabaseAccessToken(accessToken).catch(() => null)
      )
    );
  }
};
