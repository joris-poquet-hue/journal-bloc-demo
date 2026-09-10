import type { SessionRole } from '../types';
import { getSupabaseSession, SupabaseRestError } from './supabaseClient';

export type AdminAccountPayload = {
  expectedVersion?: number;
  firstName: string;
  institutionId?: string;
  lastName: string;
  loginId: string;
  profileId?: string;
  promotion?: string;
  role: SessionRole;
  semester?: string;
};

export type AdminAccountProfile = {
  authUserId: string | null;
  contactEmail: string | null;
  firstName: string;
  id: string;
  institution: string | null;
  institutionId: string | null;
  lastName: string;
  loginId: string;
  mustChangePassword: boolean;
  role: SessionRole;
  isActive: boolean;
  updatedAt: string;
  updatedByProfileId: string | null;
  version: number;
};

const ACCESS_KEY_OPERATION_STORAGE_PREFIX =
  'monjdb:provisional-access-key-operation:';
const pendingAccessKeyOperations = new Map<
  string,
  { expectedVersion: number; operationId: string }
>();
const ACCESS_KEY_OPERATION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function createAccessKeyOperationId() {
  if (typeof crypto === 'undefined' || !('randomUUID' in crypto)) {
    throw new Error('Le navigateur ne permet pas de sécuriser cette rotation.');
  }

  return crypto.randomUUID();
}

function getAccessKeyOperation(profileId: string, expectedVersion: number) {
  const storageKey = `${ACCESS_KEY_OPERATION_STORAGE_PREFIX}${profileId}`;
  const inMemory = pendingAccessKeyOperations.get(profileId);

  if (
    inMemory &&
    ACCESS_KEY_OPERATION_ID_PATTERN.test(inMemory.operationId)
  ) {
    return inMemory.operationId;
  }

  try {
    const stored = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as
      | { expectedVersion?: number; operationId?: string }
      | null;

    if (
      typeof stored?.operationId === 'string' &&
      ACCESS_KEY_OPERATION_ID_PATTERN.test(stored.operationId)
    ) {
      pendingAccessKeyOperations.set(profileId, {
        expectedVersion,
        operationId: stored.operationId,
      });
      return stored.operationId;
    }
  } catch {
    // A blocked sessionStorage must not prevent an in-memory retry.
  }

  const operationId = createAccessKeyOperationId();
  const operation = { expectedVersion, operationId };
  pendingAccessKeyOperations.set(profileId, operation);

  try {
    sessionStorage.setItem(storageKey, JSON.stringify(operation));
  } catch {
    // The in-memory copy still covers retries during this page lifetime.
  }

  return operationId;
}

function clearAccessKeyOperation(profileId: string, operationId: string) {
  if (pendingAccessKeyOperations.get(profileId)?.operationId === operationId) {
    pendingAccessKeyOperations.delete(profileId);
  }

  try {
    const storageKey = `${ACCESS_KEY_OPERATION_STORAGE_PREFIX}${profileId}`;
    const stored = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null') as
      | { operationId?: string }
      | null;

    if (stored?.operationId === operationId) {
      sessionStorage.removeItem(storageKey);
    }
  } catch {
    // Nothing else is required after a successful server response.
  }
}

async function saveAdminAccount(
  payload: AdminAccountPayload,
  method: 'POST' | 'PATCH'
) {
  if (!getSupabaseSession()) {
    throw new Error('La session administrateur a expiré. Reconnectez-vous.');
  }

  const response = await fetch('/api/admin-users', {
    body: JSON.stringify(payload),
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    method,
  });
  const result = (await response.json().catch(() => null)) as
    | {
        accessKey?: string;
        error?: string;
        profile?: AdminAccountProfile;
      }
    | null;

  if (!response.ok || !result?.profile) {
    throw new SupabaseRestError(
      response.status,
      result?.error ?? 'Impossible d’enregistrer ce compte.',
      result
    );
  }

  return {
    accessKey: result.accessKey ?? null,
    profile: result.profile,
  };
}

export function createAdminAccount(payload: AdminAccountPayload) {
  return saveAdminAccount(payload, 'POST');
}

export function updateAdminAccount(payload: AdminAccountPayload) {
  return saveAdminAccount(payload, 'PATCH');
}

export async function regenerateAdminAccessKey(
  profileId: string,
  expectedVersion: number
) {
  if (!getSupabaseSession()) {
    throw new Error('La session administrateur a expiré. Reconnectez-vous.');
  }

  const operationId = getAccessKeyOperation(profileId, expectedVersion);
  const response = await fetch('/api/admin-access-key', {
    body: JSON.stringify({ expectedVersion, operationId, profileId }),
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  const result = (await response.json().catch(() => null)) as
    | {
        accessKey?: string;
        auditWarning?: string;
        error?: string;
        profile?: AdminAccountProfile;
        resetOperation?: boolean;
      }
    | null;

  if (!response.ok || !result?.accessKey || !result.profile) {
    if (result?.resetOperation === true) {
      clearAccessKeyOperation(profileId, operationId);
    }

    throw new SupabaseRestError(
      response.status,
      result?.error ?? 'Impossible de régénérer cette clé d’accès.',
      result
    );
  }

  clearAccessKeyOperation(profileId, operationId);

  return {
    accessKey: result.accessKey,
    auditWarning: result.auditWarning ?? null,
    profile: result.profile,
  };
}

async function changeAdminAccountLifecycle(
  profileId: string,
  expectedVersion: number,
  action: 'deactivate' | 'reactivate'
) {
  if (!getSupabaseSession()) {
    throw new Error('La session administrateur a expiré. Reconnectez-vous.');
  }

  const response = await fetch('/api/admin-users', {
    body: JSON.stringify({ action, expectedVersion, profileId }),
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    method: 'PUT',
  });
  const result = (await response.json().catch(() => null)) as
    | { error?: string; profile?: AdminAccountProfile; success?: boolean }
    | null;

  if (!response.ok || !result?.success || !result.profile) {
    throw new SupabaseRestError(
      response.status,
      result?.error ??
        (action === 'reactivate'
          ? 'Impossible de réactiver ce compte.'
          : 'Impossible de désactiver ce compte.'),
      result
    );
  }

  return result.profile;
}

export function deactivateAdminAccount(
  profileId: string,
  expectedVersion: number
) {
  return changeAdminAccountLifecycle(profileId, expectedVersion, 'deactivate');
}

export function reactivateAdminAccount(
  profileId: string,
  expectedVersion: number
) {
  return changeAdminAccountLifecycle(profileId, expectedVersion, 'reactivate');
}

export async function deleteAdminAccountPermanently(
  profileId: string,
  expectedVersion: number,
  confirmationLogin: string
) {
  if (!getSupabaseSession()) {
    throw new Error('La session administrateur a expiré. Reconnectez-vous.');
  }

  const response = await fetch('/api/admin-users', {
    body: JSON.stringify({
      action: 'delete_permanently',
      confirmationLogin,
      expectedVersion,
      profileId,
    }),
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  const result = (await response.json().catch(() => null)) as
    | {
        deletedProfileId?: string;
        error?: string;
        success?: boolean;
      }
    | null;

  if (
    !response.ok ||
    result?.success !== true ||
    result.deletedProfileId !== profileId
  ) {
    throw new SupabaseRestError(
      response.status,
      result?.error ??
        (response.ok && result?.success === true
          ? 'La confirmation de suppression reçue est incohérente.'
          : 'Impossible de supprimer définitivement ce compte.'),
      result
    );
  }

  return {
    deletedProfileId: result.deletedProfileId,
  };
}
