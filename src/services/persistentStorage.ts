type PersistentArrayKey =
  | 'internal_profiles'
  | 'saved_interventions'
  | 'saved_obstetric_gestures'
  | 'custom_surgical_interventions'
  | 'custom_seniors'
  | 'admin_evaluations'
  | 'test_feedback'
  | 'activity_log';

type AppStateRow<T> = {
  data: T[];
};

const APP_STATE_API_PATH = '/api/app-state';

let persistentCredentials: { loginId: string; password: string } | null = null;

function getAuthHeaders(): Record<string, string> {
  if (!persistentCredentials) {
    return {};
  }

  return {
    'X-App-Login-Id': persistentCredentials.loginId,
    'X-App-Password': persistentCredentials.password,
  };
}

export function setPersistentStorageCredentials(
  loginId: string,
  password: string
) {
  persistentCredentials = {
    loginId,
    password,
  };
}

export function clearPersistentStorageCredentials() {
  persistentCredentials = null;
}

export function isPersistentStorageConfigured() {
  return typeof window !== 'undefined' && Boolean(persistentCredentials);
}

export async function loadPersistentArray<T>(
  key: PersistentArrayKey
): Promise<T[] | null> {
  if (!isPersistentStorageConfigured()) {
    return null;
  }

  try {
    const searchParams = new URLSearchParams({
      key,
    });
    const response = await fetch(
      `${APP_STATE_API_PATH}?${searchParams.toString()}`,
      {
        cache: 'no-store',
        headers: getAuthHeaders(),
      }
    );

    if (!response.ok) {
      throw new Error(`Supabase load failed with status ${response.status}`);
    }

    const row = (await response.json()) as AppStateRow<T>;
    const data = row.data;

    return Array.isArray(data) ? data : null;
  } catch (error) {
    console.warn(`Persistent storage load failed for ${key}`, error);
    return null;
  }
}

export async function savePersistentArray<T>(
  key: PersistentArrayKey,
  data: T[]
) {
  if (!isPersistentStorageConfigured()) {
    return;
  }

  try {
    const response = await fetch(APP_STATE_API_PATH, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
      },
      body: JSON.stringify({
        key,
        data,
      }),
    });

    if (!response.ok) {
      throw new Error(`Supabase save failed with status ${response.status}`);
    }
  } catch (error) {
    console.warn(`Persistent storage save failed for ${key}`, error);
  }
}
