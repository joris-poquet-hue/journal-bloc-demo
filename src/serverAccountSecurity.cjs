const {
  authenticateBusinessApplicationSession,
  clearApplicationSessionCookie,
  getRequestBody,
  restRequest,
  revokeApplicationSession,
  sendJson,
} = require('./serverAuth.cjs');
const {
  reportServerError,
  writeOperationalLog,
} = require('./serverObservability.cjs');

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
  };
}

async function getSecurityStatus(identity) {
  const sessions = await restRequest('application_sessions', {
    searchParams: {
      order: 'last_seen_at.desc',
      profile_id: `eq.${identity.profile.id}`,
      revoked_at: 'is.null',
      select: 'id,client_kind,device_label,created_at,last_seen_at',
    },
  });

  return {
    currentSessionId: identity.session.session_id,
    sessions: sessions.map((session) =>
      toPublicSession(session, identity.session.session_id)
    ),
  };
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

    return sendJson(response, 400, { error: 'Action de sécurité invalide.' });
  } catch (error) {
    reportServerError('account_security.operation_failed', error, {
      action: /^[a-z-]{1,40}$/.test(action) ? action : 'invalid',
    });
    return sendJson(response, 503, {
      error: 'L’opération de sécurité n’a pas pu être confirmée.',
    });
  }
};
