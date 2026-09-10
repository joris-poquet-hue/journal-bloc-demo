const {
  authenticateBusinessApplicationSession,
  getRequestBody,
  sendJson,
} = require('./serverAuth.cjs');
const { writeOperationalLog } = require('./serverObservability.cjs');

const ALLOWED_KINDS = new Set([
  'client-error',
  'unhandled-rejection',
  'web-vital',
]);
const ALLOWED_METRICS = new Set(['CLS', 'INP', 'LCP']);

module.exports = async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return sendJson(response, 405, { error: 'Méthode non autorisée.' });
  }

  const identity = await authenticateBusinessApplicationSession(request, {
    touch: false,
  }).catch(() => null);

  if (!identity) {
    return sendJson(response, 204, null);
  }

  const body = await getRequestBody(request).catch(() => null);
  const kind = String(body?.kind ?? '');
  const metric = String(body?.metric ?? '');
  const value = Number(body?.value);

  if (
    !ALLOWED_KINDS.has(kind) ||
    (kind === 'web-vital' &&
      (!ALLOWED_METRICS.has(metric) || !Number.isFinite(value) || value < 0))
  ) {
    return sendJson(response, 400, { error: 'Événement invalide.' });
  }

  writeOperationalLog(
    kind === 'web-vital' ? 'info' : 'error',
    `client.${kind}`,
    {
      clientKind: identity.session.client_kind,
      metric: kind === 'web-vital' ? metric : undefined,
      role: identity.profile.role,
      value:
        kind === 'web-vital'
          ? Math.round(value * 1000) / 1000
          : undefined,
    }
  );
  return sendJson(response, 204, null);
};
