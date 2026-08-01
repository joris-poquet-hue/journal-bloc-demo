const {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  authenticateApplicationSession,
  clearApplicationSessionCookie,
  createSupabaseApplicationJwt,
  getRequestBody,
  isApplicationJwtConfigured,
  sendJson,
} = require('../src/serverAuth.cjs');

const EXPO_PUSH_TOKEN_PATTERN =
  /^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/;
const DEVICE_ID_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { error: 'Méthode non autorisée.' });
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !isApplicationJwtConfigured()) {
    return sendJson(response, 503, {
      error: 'Les notifications mobiles ne sont pas configurées.',
    });
  }

  try {
    const identity = await authenticateApplicationSession(request);

    if (!identity || identity.session.client_kind !== 'mobile') {
      clearApplicationSessionCookie(response);
      return sendJson(response, 401, {
        error: 'Une session mobile active est requise.',
      });
    }

    const body = await getRequestBody(request, 8 * 1024);
    const expoPushToken = String(body?.expoPushToken || '').trim();
    const deviceId = String(body?.deviceId || '').trim();
    const platform = String(body?.platform || '').trim();

    if (
      !EXPO_PUSH_TOKEN_PATTERN.test(expoPushToken) ||
      !DEVICE_ID_PATTERN.test(deviceId) ||
      !['ios', 'android'].includes(platform)
    ) {
      return sendJson(response, 400, {
        error: 'Les informations de notification sont invalides.',
      });
    }

    const jwt = createSupabaseApplicationJwt(identity);
    const upstreamResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/register_push_subscription`,
      {
        body: JSON.stringify({
          p_device_id: deviceId,
          p_expo_push_token: expoPushToken,
          p_platform: platform,
        }),
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${jwt}`,
          'Content-Type': 'application/json',
        },
        method: 'POST',
      }
    );

    if (!upstreamResponse.ok) {
      const payload = await upstreamResponse.json().catch(() => null);
      throw new Error(
        payload?.message || 'Impossible d’enregistrer cet appareil.'
      );
    }

    return sendJson(response, 200, { success: true });
  } catch (error) {
    console.error('Unable to register mobile push subscription.', error);
    return sendJson(response, 502, {
      error:
        error instanceof Error
          ? error.message
          : 'Impossible d’activer les notifications.',
    });
  }
};
