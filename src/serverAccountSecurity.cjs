const {
  authAdminRequest,
  authenticateBusinessApplicationSession,
  challengeAndVerifyAnyTotp,
  challengeAndVerifyTotp,
  clearApplicationSessionCookie,
  getAuthUser,
  getRequestBody,
  listMfaFactors,
  logoutSupabaseAccessToken,
  restRequest,
  revokeApplicationSession,
  sendJson,
  signInAuthUserWithPassword,
  userAuthRequest,
} = require('./serverAuth.cjs');
const {
  reportServerError,
  writeOperationalLog,
} = require('./serverObservability.cjs');

const MFA_FRIENDLY_NAME = 'Mon Journal de Bloc';

function toPublicSession(session, currentSessionId) {
  return {
    clientKind: session.client_kind,
    createdAt: session.created_at,
    deviceLabel:
      session.device_label ||
      (session.client_kind === 'mobile' ? 'Application mobile' : 'Navigateur web'),
    id: session.id,
    isCurrent: session.id === currentSessionId,
    lastSeenAt: session.last_seen_at,
    mfaVerifiedAt: session.mfa_verified_at ?? null,
  };
}

function toQrCodeDataUrl(qrCode) {
  const value = String(qrCode ?? '').trim();

  if (!value) {
    return null;
  }

  return value.startsWith('data:image/')
    ? value
    : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}`;
}

async function getSecurityStatus(identity) {
  const [sessions, factors] = await Promise.all([
    restRequest('application_sessions', {
      searchParams: {
        order: 'last_seen_at.desc',
        profile_id: `eq.${identity.profile.id}`,
        revoked_at: 'is.null',
        select:
          'id,client_kind,device_label,mfa_verified_at,created_at,last_seen_at',
      },
    }),
    listMfaFactors(identity.profile.auth_user_id),
  ]);
  const verifiedTotpFactors = factors.filter(
    (factor) => factor?.factor_type === 'totp' && factor?.status === 'verified'
  );

  return {
    currentSessionId: identity.session.session_id,
    mfa: {
      enabled: verifiedTotpFactors.length > 0,
      requiredForRole:
        identity.profile.role === 'admin' || identity.profile.role === 'senior',
    },
    sessions: sessions.map((session) =>
      toPublicSession(session, identity.session.session_id)
    ),
  };
}

async function reauthenticate(identity, password, request) {
  if (typeof password !== 'string' || password.length === 0) {
    const error = new Error('Le mot de passe actuel est requis.');
    error.status = 400;
    throw error;
  }

  const user = await getAuthUser(identity.profile.auth_user_id);

  if (!user?.email) {
    const error = new Error('Le compte de connexion est introuvable.');
    error.status = 404;
    throw error;
  }

  return signInAuthUserWithPassword(user.email, password, request);
}

module.exports = async function handler(request, response) {
  if (!['GET', 'POST'].includes(request.method)) {
    response.setHeader('Allow', 'GET, POST');
    return sendJson(response, 405, { error: 'Méthode non autorisée.' });
  }

  let identity;

  try {
    identity = await authenticateBusinessApplicationSession(request, {
      touch: true,
    });
  } catch (error) {
    reportServerError('account_security.session_verification_failed', error);
    return sendJson(response, 503, {
      error: 'Impossible de vérifier la session.',
    });
  }

  if (!identity) {
    clearApplicationSessionCookie(response);
    return sendJson(response, 401, { error: 'Une authentification est requise.' });
  }

  if (request.method === 'GET') {
    try {
      return sendJson(response, 200, await getSecurityStatus(identity));
    } catch (error) {
      reportServerError('account_security.status_load_failed', error);
      return sendJson(response, 503, {
        error: 'Impossible de charger la sécurité du compte.',
      });
    }
  }

  let body;

  try {
    body = await getRequestBody(request);
  } catch {
    return sendJson(response, 400, { error: 'Corps JSON invalide.' });
  }

  const action = String(body?.action ?? '');
  let transientAccessToken = null;

  try {
    if (action === 'revoke-session') {
      const sessionId = String(body?.sessionId ?? '');
      const sessions = await restRequest('application_sessions', {
        searchParams: {
          id: `eq.${sessionId}`,
          limit: '1',
          profile_id: `eq.${identity.profile.id}`,
          revoked_at: 'is.null',
          select: 'id',
        },
      });

      if (!sessions[0]?.id) {
        return sendJson(response, 404, { error: 'Session active introuvable.' });
      }

      await revokeApplicationSession(sessionId, 'revoked_by_account_owner');

      if (sessionId === identity.session.session_id) {
        clearApplicationSessionCookie(response);
      }

      writeOperationalLog('info', 'account_security.session_revoked', {
        revokedCurrentSession: sessionId === identity.session.session_id,
        role: identity.profile.role,
      });

      return sendJson(response, 200, {
        revokedCurrentSession: sessionId === identity.session.session_id,
        success: true,
      });
    }

    if (action === 'revoke-other-sessions') {
      const revokedCount = await restRequest(
        'rpc/revoke_other_application_sessions',
        {
          body: {
            p_current_session_id: identity.session.session_id,
            p_profile_id: identity.profile.id,
            p_reason: 'revoked_by_account_owner',
          },
          method: 'POST',
        }
      );

      writeOperationalLog('info', 'account_security.other_sessions_revoked', {
        revokedCount: Number(revokedCount ?? 0),
        role: identity.profile.role,
      });

      return sendJson(response, 200, {
        revokedCount: Number(revokedCount ?? 0),
        success: true,
      });
    }

    if (action === 'begin-mfa-enrollment') {
      const authSession = await reauthenticate(
        identity,
        body?.currentPassword,
        request
      );
      transientAccessToken = authSession.access_token;
      const existingFactors = await listMfaFactors(identity.profile.auth_user_id);

      if (
        existingFactors.some(
          (factor) =>
            factor?.factor_type === 'totp' && factor?.status === 'verified'
        )
      ) {
        return sendJson(response, 409, {
          error: 'La double authentification est déjà active.',
        });
      }

      await Promise.all(
        existingFactors
          .filter(
            (factor) =>
              factor?.factor_type === 'totp' && factor?.status === 'unverified'
          )
          .map((factor) =>
            authAdminRequest(
              `admin/users/${encodeURIComponent(
                identity.profile.auth_user_id
              )}/factors/${encodeURIComponent(factor.id)}`,
              { method: 'DELETE' }
            )
          )
      );

      const factor = await userAuthRequest(transientAccessToken, 'factors', {
        body: {
          factor_type: 'totp',
          friendly_name: MFA_FRIENDLY_NAME,
          issuer: MFA_FRIENDLY_NAME,
        },
        method: 'POST',
      });

      if (!factor?.id || !factor?.totp?.secret) {
        throw new Error('The authentication factor could not be created.');
      }

      return sendJson(response, 200, {
        enrollment: {
          factorId: factor.id,
          qrCode: toQrCodeDataUrl(factor.totp.qr_code),
          secret: factor.totp.secret,
          uri: factor.totp.uri ?? null,
        },
        success: true,
      });
    }

    if (action === 'verify-mfa-enrollment') {
      const factorId = String(body?.factorId ?? '');
      const factors = await listMfaFactors(identity.profile.auth_user_id);
      const factor = factors.find(
        (candidate) =>
          candidate?.id === factorId &&
          candidate?.factor_type === 'totp' &&
          candidate?.status === 'unverified'
      );

      if (!factor) {
        return sendJson(response, 404, {
          error: 'Configuration de double authentification introuvable.',
        });
      }

      const authSession = await reauthenticate(
        identity,
        body?.currentPassword,
        request
      );
      transientAccessToken = authSession.access_token;
      const verifiedSession = await challengeAndVerifyTotp(
        transientAccessToken,
        factor.id,
        body?.code
      );
      transientAccessToken = verifiedSession.access_token;

      await Promise.all([
        restRequest('application_sessions', {
          body: { mfa_verified_at: new Date().toISOString() },
          headers: { Prefer: 'return=minimal' },
          method: 'PATCH',
          searchParams: { id: `eq.${identity.session.session_id}` },
        }),
        restRequest('rpc/revoke_other_application_sessions', {
          body: {
            p_current_session_id: identity.session.session_id,
            p_profile_id: identity.profile.id,
            p_reason: 'mfa_enabled',
          },
          method: 'POST',
        }),
      ]);

      writeOperationalLog('info', 'account_security.mfa_enabled', {
        role: identity.profile.role,
      });

      return sendJson(response, 200, { success: true });
    }

    if (action === 'disable-mfa') {
      const factors = await listMfaFactors(identity.profile.auth_user_id);
      const verifiedFactors = factors.filter(
        (candidate) =>
          candidate?.factor_type === 'totp' && candidate?.status === 'verified'
      );

      if (verifiedFactors.length === 0) {
        return sendJson(response, 409, {
          error: 'La double authentification n’est pas active.',
        });
      }

      const authSession = await reauthenticate(
        identity,
        body?.currentPassword,
        request
      );
      transientAccessToken = authSession.access_token;
      const verifiedFactor = await challengeAndVerifyAnyTotp(
        transientAccessToken,
        verifiedFactors,
        body?.code
      );
      transientAccessToken = verifiedFactor.session.access_token;
      await Promise.all(
        verifiedFactors.map((candidate) =>
          userAuthRequest(
            transientAccessToken,
            `factors/${encodeURIComponent(candidate.id)}`,
            { method: 'DELETE' }
          )
        )
      );
      await Promise.all([
        restRequest('application_sessions', {
          body: { mfa_verified_at: null },
          headers: { Prefer: 'return=minimal' },
          method: 'PATCH',
          searchParams: { id: `eq.${identity.session.session_id}` },
        }),
        restRequest('rpc/revoke_other_application_sessions', {
          body: {
            p_current_session_id: identity.session.session_id,
            p_profile_id: identity.profile.id,
            p_reason: 'mfa_disabled',
          },
          method: 'POST',
        }),
      ]);

      writeOperationalLog('info', 'account_security.mfa_disabled', {
        role: identity.profile.role,
      });

      return sendJson(response, 200, { success: true });
    }

    return sendJson(response, 400, { error: 'Action de sécurité invalide.' });
  } catch (error) {
    const status = Number(error?.status);

    reportServerError('account_security.operation_failed', error, {
      action: /^[a-z-]{1,40}$/.test(action) ? action : 'invalid',
    });
    return sendJson(
      response,
      status === 401 || status === 400 ? status : 503,
      {
        error:
          status === 401
            ? 'Le mot de passe ou le code de vérification est incorrect.'
            : error?.message === 'Le mot de passe actuel est requis.'
              ? error.message
              : 'L’opération de sécurité n’a pas pu être confirmée.',
      }
    );
  } finally {
    await logoutSupabaseAccessToken(transientAccessToken).catch(() => null);
  }
};
