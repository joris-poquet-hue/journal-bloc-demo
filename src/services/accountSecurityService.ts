export type AccountSession = {
  clientKind: 'web' | 'mobile';
  createdAt: string;
  deviceLabel: string;
  id: string;
  isCurrent: boolean;
  lastSeenAt: string;
};

export type AccountSecurityStatus = {
  currentSessionId: string;
  sessions: AccountSession[];
};

async function accountSecurityRequest<T>(
  method: 'GET' | 'POST',
  body?: Record<string, unknown>
) {
  const response = await fetch('/api/account-security', {
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    method,
  });
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: string })
    | null;

  if (!response.ok) {
    throw new Error(
      payload?.error || 'L’opération de sécurité n’a pas pu être confirmée.'
    );
  }

  if (!payload) {
    throw new Error('Le serveur a renvoyé une réponse de sécurité incomplète.');
  }

  return payload;
}

export function loadAccountSecurityStatus() {
  return accountSecurityRequest<AccountSecurityStatus>('GET');
}

export function revokeAccountSession(sessionId: string) {
  return accountSecurityRequest<{
    revokedCurrentSession: boolean;
    success: true;
  }>('POST', {
    action: 'revoke-session',
    sessionId,
  });
}

export function revokeOtherAccountSessions() {
  return accountSecurityRequest<{ revokedCount: number; success: true }>(
    'POST',
    { action: 'revoke-other-sessions' }
  );
}
