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
const {
  dispatchPendingPushNotifications,
} = require('../src/pushNotifications.cjs');

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PATCH', 'DELETE']);
const MAX_JSON_BODY_BYTES = 2 * 1024 * 1024;

function getProxyTarget(request) {
  const requestUrl = new URL(request.url, 'https://project1.invalid');
  const path = requestUrl.searchParams.get('path') ?? '';

  if (!/^(?:[a-z][a-z0-9_]*|rpc\/[a-z][a-z0-9_]*)$/.test(path)) {
    return null;
  }

  requestUrl.searchParams.delete('path');

  return {
    path,
    query: requestUrl.searchParams.toString(),
  };
}

module.exports = async function handler(request, response) {
  if (!ALLOWED_METHODS.has(request.method)) {
    response.setHeader('Allow', [...ALLOWED_METHODS].join(', '));
    return sendJson(response, 405, { error: 'Méthode non autorisée.' });
  }

  if (
    !SUPABASE_URL ||
    !SUPABASE_ANON_KEY ||
    !isApplicationJwtConfigured()
  ) {
    return sendJson(response, 503, {
      error: 'L’accès sécurisé aux données n’est pas configuré.',
    });
  }

  const target = getProxyTarget(request);

  if (!target) {
    return sendJson(response, 400, { error: 'Chemin d’accès aux données invalide.' });
  }

  try {
    const identity = await authenticateApplicationSession(request);

    if (!identity) {
      clearApplicationSessionCookie(response);
      return sendJson(response, 401, { error: 'Une authentification est requise.' });
    }

    const body =
      request.method === 'GET' || request.method === 'DELETE'
        ? undefined
        : await getRequestBody(request, MAX_JSON_BODY_BYTES);
    const jwt = createSupabaseApplicationJwt(identity);
    const upstreamResponse = await fetch(
      `${SUPABASE_URL}/rest/v1/${target.path}${
        target.query ? `?${target.query}` : ''
      }`,
      {
        body: body === undefined ? undefined : JSON.stringify(body),
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${jwt}`,
          ...(body === undefined
            ? {}
            : { 'Content-Type': 'application/json' }),
          ...(request.headers.accept
            ? { Accept: String(request.headers.accept) }
            : {}),
          ...(request.headers.prefer
            ? { Prefer: String(request.headers.prefer) }
            : {}),
        },
        method: request.method,
      }
    );
    const responseBody = Buffer.from(await upstreamResponse.arrayBuffer());

    response.statusCode = upstreamResponse.status;
    response.setHeader('Cache-Control', 'no-store');

    for (const headerName of [
      'content-range',
      'content-type',
      'location',
      'preference-applied',
    ]) {
      const headerValue = upstreamResponse.headers.get(headerName);

      if (headerValue) {
        response.setHeader(headerName, headerValue);
      }
    }

    if (
      upstreamResponse.ok &&
      ['POST', 'PATCH', 'DELETE'].includes(request.method)
    ) {
      await dispatchPendingPushNotifications().catch((error) => {
        console.warn(
          'Push notification dispatch deferred.',
          error instanceof Error ? error.message : 'Unknown push error'
        );
      });
    }

    response.end(responseBody);
  } catch (error) {
    console.error('Protected backend proxy failed.', error);
    return sendJson(response, 502, {
      error: error.message || 'Impossible de joindre Supabase.',
    });
  }
};
