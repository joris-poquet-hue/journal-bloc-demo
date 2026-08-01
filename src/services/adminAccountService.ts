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

  const response = await fetch('/api/admin-access-key', {
    body: JSON.stringify({ expectedVersion, profileId }),
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
      }
    | null;

  if (!response.ok || !result?.accessKey || !result.profile) {
    throw new SupabaseRestError(
      response.status,
      result?.error ?? 'Impossible de régénérer cette clé d’accès.',
      result
    );
  }

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
