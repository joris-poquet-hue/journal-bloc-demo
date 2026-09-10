type SupabaseRequestOptions = {
  body?: unknown;
  headers?: Record<string, string>;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  searchParams?: Record<string, string | number | boolean | null | undefined>;
  signal?: AbortSignal;
};

export type SupabaseAuthUser = {
  email?: string;
  id: string;
};

export type SupabaseLoginProfile = {
  authUserId: string;
  avatarImageSrc: string | null;
  contactEmail: string | null;
  createdAt: string;
  firstName: string;
  id: string;
  institution: string | null;
  institutionId: string | null;
  isActive: boolean;
  lastName: string;
  lastLoginAt: string | null;
  loginCount: number;
  loginId: string;
  mustChangePassword: boolean;
  promotion: string | null;
  role: 'internal' | 'senior' | 'admin';
  semester: string | null;
  updatedAt: string;
  updatedByProfileId: string | null;
  version: number;
};

export type SupabaseAuthSession = {
  profile: SupabaseLoginProfile;
  user: SupabaseAuthUser;
};

export type MfaLoginChallenge = {
  message: string;
  requiresMfa: true;
};

export class SupabaseRestError extends Error {
  details: unknown;
  status: number;

  constructor(status: number, message: string, details: unknown) {
    super(message);
    this.name = 'SupabaseRestError';
    this.details = details;
    this.status = status;
  }
}

const APPLICATION_ACTIVITY_THROTTLE_MS = 60_000;
let activeSession: SupabaseAuthSession | null = null;
const sessionListeners = new Set<(active: boolean) => void>();

function notifySessionListeners() {
  sessionListeners.forEach((listener) => {
    try {
      listener(Boolean(activeSession));
    } catch (error) {
      console.warn('Unable to update an application session listener.', error);
    }
  });
}

function setActiveSession(session: SupabaseAuthSession | null) {
  activeSession = session;
  notifySessionListeners();
}

function expireApplicationSession() {
  setActiveSession(null);
  postNativeSessionMessage('MONJDB_SESSION_REVOKED');

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('monjdb:session-expired'));
  }
}

function toApplicationSession(
  profile: SupabaseLoginProfile
): SupabaseAuthSession {
  return {
    profile,
    user: {
      email: profile.contactEmail ?? undefined,
      id: profile.authUserId,
    },
  };
}

function postNativeSessionMessage(
  type: 'MONJDB_SESSION_CREATED' | 'MONJDB_SESSION_REVOKED',
  token?: string
) {
  if (typeof window === 'undefined') {
    return;
  }

  const nativeBridge = (
    window as typeof window & {
      ReactNativeWebView?: {
        postMessage: (message: string) => void;
      };
    }
  ).ReactNativeWebView;

  if (!nativeBridge) {
    return;
  }

  nativeBridge.postMessage(
    JSON.stringify({
      type,
      ...(token ? { token } : {}),
    })
  );
}

function getNativeApplicationHeaders(): Record<string, string> {
  if (typeof window === 'undefined') {
    return {};
  }

  return (
    window as typeof window & {
      __MONJDB_NATIVE_APP__?: boolean;
    }
  ).__MONJDB_NATIVE_APP__
    ? { 'X-Monjdb-Native-App': '1' }
    : {};
}

function buildSearchParams(
  searchParams: SupabaseRequestOptions['searchParams']
) {
  const params = new URLSearchParams();

  Object.entries(searchParams ?? {}).forEach(([key, value]) => {
    if (value !== null && value !== undefined) {
      params.set(key, String(value));
    }
  });

  return params;
}

async function parseErrorPayload(response: Response) {
  const payload = await response.json().catch(() => null);

  if (payload && typeof payload === 'object') {
    for (const key of ['message', 'msg', 'error_description', 'error']) {
      if (key in payload) {
        const message = String(payload[key as keyof typeof payload] || '').trim();

        if (message) {
          return { message, payload };
        }
      }
    }
  }

  return {
    message: `La requête au serveur a échoué avec le statut ${response.status}.`,
    payload,
  };
}

type ApplicationProfileResponse = {
  confirmationRecorded: false;
  message: string;
  profile: SupabaseLoginProfile;
  requiresLogin: false;
  session: SupabaseAuthSession;
  type?: string;
};

type ApplicationRequiresLoginResponse = {
  confirmationRecorded: boolean;
  message: string;
  profile: null;
  requiresLogin: true;
  session: null;
  type?: string;
};

function parseApplicationProfileResponse(
  response: Response
): Promise<ApplicationProfileResponse>;
function parseApplicationProfileResponse(
  response: Response,
  options: { allowRequiresLogin: true }
): Promise<ApplicationProfileResponse | ApplicationRequiresLoginResponse>;
async function parseApplicationProfileResponse(
  response: Response,
  options: { allowRequiresLogin?: boolean } = {}
): Promise<ApplicationProfileResponse | ApplicationRequiresLoginResponse> {
  const payload = (await response.json().catch(() => null)) as
    | {
        confirmationRecorded?: boolean;
        error?: string;
        message?: string;
        mobileSessionToken?: string;
        profile?: SupabaseLoginProfile;
        requiresLogin?: boolean;
        type?: string;
      }
    | null;

  if (!response.ok) {
    throw new SupabaseRestError(
      response.status,
      payload?.error ?? 'La session sécurisée n’a pas pu être créée.',
      payload
    );
  }

  if (payload?.requiresLogin === true) {
    if (!options.allowRequiresLogin) {
      throw new SupabaseRestError(
        response.status,
        payload.message ?? 'Une nouvelle connexion est requise.',
        payload
      );
    }

    setActiveSession(null);
    postNativeSessionMessage('MONJDB_SESSION_REVOKED');

    return {
      confirmationRecorded: payload.confirmationRecorded === true,
      message: payload.message ?? '',
      profile: null,
      requiresLogin: true,
      session: null,
      type: payload.type,
    };
  }

  if (!payload?.profile) {
    throw new SupabaseRestError(
      response.status,
      'La session sécurisée n’a pas pu être créée.',
      payload
    );
  }

  if (payload.mobileSessionToken) {
    postNativeSessionMessage(
      'MONJDB_SESSION_CREATED',
      payload.mobileSessionToken
    );
    payload.mobileSessionToken = undefined;
  }

  const session = toApplicationSession(payload.profile);
  setActiveSession(session);

  return {
    confirmationRecorded: false,
    message: payload.message ?? '',
    profile: payload.profile,
    requiresLogin: false,
    session,
    type: payload.type,
  };
}

export function isSupabaseClientConfigured() {
  return true;
}

// Compatibility shims: no Supabase bearer token is exposed to browser code.
export function getSupabaseAccessToken() {
  return null;
}

export function getSupabaseSession() {
  return activeSession;
}

export function setSupabaseAccessToken(token: string | null) {
  if (!token) {
    setActiveSession(null);
  }
}

export function setSupabaseSession(session: SupabaseAuthSession | null) {
  setActiveSession(session);
}

export async function signInWithSupabaseLoginId(
  loginId: string,
  password: string,
  mfaCode?: string
) {
  const response = await fetch('/api/auth-login', {
    body: JSON.stringify({ loginId, mfaCode, password }),
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...getNativeApplicationHeaders(),
    },
    method: 'POST',
  });

  if (response.status === 202) {
    const payload = (await response.json().catch(() => null)) as
      | { message?: string; requiresMfa?: boolean }
      | null;

    if (payload?.requiresMfa) {
      return {
        message:
          payload.message ??
          'Saisis le code de ton application d’authentification.',
        requiresMfa: true,
      } satisfies MfaLoginChallenge;
    }
  }

  return {
    ...(await parseApplicationProfileResponse(response)),
    requiresMfa: false as const,
  };
}

export async function restoreSupabaseSession() {
  if (typeof window === 'undefined') {
    return null;
  }

  const response = await fetch('/api/auth-session', {
    cache: 'no-store',
    credentials: 'same-origin',
    method: 'GET',
  });

  if (response.status === 401) {
    setActiveSession(null);
    return null;
  }

  return (await parseApplicationProfileResponse(response)).session;
}

export async function consumeSupabaseAuthCallback() {
  if (typeof window === 'undefined' || !window.location.hash) {
    return null;
  }

  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const accessToken = params.get('access_token');
  const callbackType = params.get('type');

  if (
    !accessToken ||
    (callbackType !== 'recovery' && callbackType !== 'email_change')
  ) {
    return null;
  }

  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}`
  );

  const response = await fetch('/api/auth-callback', {
    body: JSON.stringify({
      accessToken,
      type: callbackType,
    }),
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...getNativeApplicationHeaders(),
    },
    method: 'POST',
  });

  return parseApplicationProfileResponse(response, {
    allowRequiresLogin: true,
  });
}

export async function requestSupabasePasswordRecovery(loginId: string) {
  const response = await fetch('/api/auth-recovery', {
    body: JSON.stringify({ loginId }),
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  const payload = (await response.json().catch(() => null)) as
    | { error?: string; message?: string }
    | null;

  if (!response.ok) {
    throw new SupabaseRestError(
      response.status,
      payload?.error ?? 'Impossible de demander la réinitialisation.',
      payload
    );
  }

  return payload?.message ?? '';
}

export async function updateSupabasePassword(
  currentPassword: string | null,
  password: string,
  options: {
    completeSetupContactEmail?: string;
  } = {}
) {
  const response = await fetch('/api/auth-password', {
    body: JSON.stringify({
      action: options.completeSetupContactEmail
        ? 'complete-setup'
        : 'change-password',
      completeSetup: Boolean(options.completeSetupContactEmail),
      contactEmail: options.completeSetupContactEmail,
      currentPassword,
      password,
    }),
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...getNativeApplicationHeaders(),
    },
    method: 'POST',
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        error?: string;
        message?: string;
        mobileSessionToken?: string;
        pendingEmailConfirmation?: boolean;
        profile?: SupabaseLoginProfile;
        requiresLogin?: boolean;
        success?: boolean;
      }
    | null;

  if (!response.ok || !payload?.success) {
    throw new SupabaseRestError(
      response.status,
      payload?.error ?? 'Impossible de modifier le mot de passe.',
      payload
    );
  }

  const requiresLogin = payload.requiresLogin === true;

  if (requiresLogin) {
    setActiveSession(null);
    postNativeSessionMessage('MONJDB_SESSION_REVOKED');
  } else {
    if (!payload.profile) {
      throw new SupabaseRestError(
        response.status,
        'Le compte a été sécurisé, mais la nouvelle session est introuvable.',
        payload
      );
    }

    if (payload.mobileSessionToken) {
      postNativeSessionMessage(
        'MONJDB_SESSION_CREATED',
        payload.mobileSessionToken
      );
      payload.mobileSessionToken = undefined;
    }

    setActiveSession(toApplicationSession(payload.profile));
  }

  return {
    message: payload.message ?? '',
    pendingEmailConfirmation: payload.pendingEmailConfirmation === true,
    profile: payload.profile ?? null,
    requiresLogin,
  };
}

export async function requestSupabaseEmailChange(
  currentPassword: string,
  contactEmail: string
) {
  const response = await fetch('/api/auth-password', {
    body: JSON.stringify({
      action: 'change-email',
      contactEmail,
      currentPassword,
    }),
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });
  const payload = (await response.json().catch(() => null)) as
    | {
        error?: string;
        message?: string;
        pendingEmailConfirmation?: boolean;
        success?: boolean;
      }
    | null;

  if (!response.ok || !payload?.success) {
    throw new SupabaseRestError(
      response.status,
      payload?.error ?? 'Impossible de demander le changement d’adresse e-mail.',
      payload
    );
  }

  return {
    message: payload.message ?? '',
    pendingEmailConfirmation: payload.pendingEmailConfirmation === true,
  };
}

export async function signOutFromSupabase(
  options: { scope?: 'all' | 'current' } = {}
) {
  const response = await fetch('/api/auth-logout', {
    body: JSON.stringify({
      scope: options.scope ?? 'all',
    }),
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) {
    const { message, payload } = await parseErrorPayload(response);

    throw new SupabaseRestError(response.status, message, payload);
  }

  setActiveSession(null);
  postNativeSessionMessage('MONJDB_SESSION_REVOKED');
}

export async function supabaseRestRequest<T>(
  path: string,
  options: SupabaseRequestOptions = {}
): Promise<T> {
  const searchParams = buildSearchParams(options.searchParams);
  searchParams.set('path', path);
  const response = await fetch(`/api/backend?${searchParams.toString()}`, {
    body:
      options.body === undefined ? undefined : JSON.stringify(options.body),
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      ...(options.body === undefined
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...options.headers,
    },
    method: options.method ?? 'GET',
    signal: options.signal,
  });

  if (!response.ok) {
    const { message, payload } = await parseErrorPayload(response);

    if (response.status === 401) {
      expireApplicationSession();
    }

    throw new SupabaseRestError(response.status, message, payload);
  }

  if (response.status === 204) {
    return null as T;
  }

  return (await response.json()) as T;
}

export async function selectSupabaseRows<T>(
  table: string,
  options: {
    filters?: Record<string, string | number | boolean | null | undefined>;
    limit?: number;
    order?: string;
    select?: string;
    signal?: AbortSignal;
  } = {}
) {
  return supabaseRestRequest<T[]>(table, {
    searchParams: {
      limit: options.limit,
      order: options.order,
      select: options.select ?? '*',
      ...options.filters,
    },
    signal: options.signal,
  });
}

export function subscribeToBackendRealtime(
  _onChange: () => void,
  onStatus?: (status: string) => void
) {
  // Realtime JWTs are deliberately unavailable to browser JavaScript. Focus,
  // foreground and periodic reconciliation remain the automatic sync path.
  onStatus?.('SERVER_RECONCILIATION');
  return () => {};
}

export function startApplicationSessionActivityTracking(
  onExpired?: () => void
) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  let lastActivitySentAt = 0;
  let isStopped = false;

  const registerActivity = () => {
    const now = Date.now();

    if (
      isStopped ||
      !activeSession ||
      now - lastActivitySentAt < APPLICATION_ACTIVITY_THROTTLE_MS
    ) {
      return;
    }

    lastActivitySentAt = now;
    void fetch('/api/auth-session', {
      cache: 'no-store',
      credentials: 'same-origin',
      method: 'POST',
    }).then((response) => {
      if (response.status === 401) {
        expireApplicationSession();
        onExpired?.();
      }
    });
  };

  const activityEvents: (keyof WindowEventMap)[] = [
    'focus',
    'keydown',
    'pointerdown',
    'touchstart',
  ];

  activityEvents.forEach((eventName) => {
    window.addEventListener(eventName, registerActivity, { passive: true });
  });

  return () => {
    isStopped = true;
    activityEvents.forEach((eventName) => {
      window.removeEventListener(eventName, registerActivity);
    });
  };
}
