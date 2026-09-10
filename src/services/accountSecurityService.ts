export type AccountSession = {
  clientKind: 'web' | 'mobile';
  createdAt: string;
  deviceLabel: string;
  id: string;
  isCurrent: boolean;
  lastSeenAt: string;
  mfaVerifiedAt: string | null;
};

export type AccountSecurityStatus = {
  currentSessionId: string;
  mfa: {
    enabled: boolean;
    requiredForRole: boolean;
  };
  sessions: AccountSession[];
};

export type MfaEnrollment = {
  factorId: string;
  qrCode: string | null;
  secret: string;
  uri: string | null;
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

export async function beginMfaEnrollment(currentPassword: string) {
  const result = await accountSecurityRequest<{
    enrollment: MfaEnrollment;
    success: true;
  }>('POST', {
    action: 'begin-mfa-enrollment',
    currentPassword,
  });

  return result.enrollment;
}

export function verifyMfaEnrollment(
  currentPassword: string,
  factorId: string,
  code: string
) {
  return accountSecurityRequest<{ success: true }>('POST', {
    action: 'verify-mfa-enrollment',
    code,
    currentPassword,
    factorId,
  });
}

export function disableMfa(currentPassword: string, code: string) {
  return accountSecurityRequest<{ success: true }>('POST', {
    action: 'disable-mfa',
    code,
    currentPassword,
  });
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
