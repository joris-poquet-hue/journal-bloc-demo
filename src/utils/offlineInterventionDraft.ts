import type { InterventionDraft } from '../types';

const DATABASE_NAME = 'monjdb-private-drafts';
const DATABASE_VERSION = 1;
const DRAFT_STORE = 'drafts';
const KEY_STORE = 'keys';
const DRAFT_SCHEMA_VERSION = 1;
const DRAFT_LIFETIME_MS = 72 * 60 * 60 * 1000;

type EncryptedDraftRecord = {
  ciphertext: string;
  expiresAt: string;
  id: string;
  iv: string;
  schemaVersion: number;
  updatedAt: string;
};

export type OfflineInterventionDraft = {
  draft: InterventionDraft;
  updatedAt: string;
};

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Stockage indisponible.'));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error('Stockage indisponible.'));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error('Stockage interrompu.'));
  });
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(DRAFT_STORE)) {
        database.createObjectStore(DRAFT_STORE, { keyPath: 'id' });
      }

      if (!database.objectStoreNames.contains(KEY_STORE)) {
        database.createObjectStore(KEY_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Stockage indisponible.'));
    request.onblocked = () => reject(new Error('Stockage temporairement verrouillé.'));
  });
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return window.btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = window.atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function getDraftId(profileId: string) {
  return `intervention:${profileId}`;
}

function getAdditionalData(profileId: string) {
  return new TextEncoder().encode(
    `monjdb:intervention-draft:${profileId}:v${DRAFT_SCHEMA_VERSION}`
  );
}

function isStorageAvailable() {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.indexedDB) &&
    typeof crypto !== 'undefined' &&
    Boolean(crypto.subtle)
  );
}

async function getOrCreateEncryptionKey(database: IDBDatabase, profileId: string) {
  const readTransaction = database.transaction(KEY_STORE, 'readonly');
  const existingKey = await requestResult<CryptoKey | undefined>(
    readTransaction.objectStore(KEY_STORE).get(profileId)
  );
  await transactionDone(readTransaction);

  if (existingKey) {
    return existingKey;
  }

  const key = await crypto.subtle.generateKey(
    { length: 256, name: 'AES-GCM' },
    false,
    ['decrypt', 'encrypt']
  );
  const writeTransaction = database.transaction(KEY_STORE, 'readwrite');
  writeTransaction.objectStore(KEY_STORE).put(key, profileId);
  await transactionDone(writeTransaction);
  return key;
}

export function isMeaningfulInterventionDraft(draft: InterventionDraft) {
  const hasContextValues = Array.isArray(draft.contextVariables)
    ? draft.contextVariables.length > 0
    : [
        ...Object.values(draft.contextVariables.patient),
        ...Object.entries(draft.contextVariables.history)
          .filter(([key]) => key !== 'abdominopelvicSurgeryDetails')
          .map(([, value]) => value),
        draft.contextVariables.history.abdominopelvicSurgeryDetails.trim(),
        ...Object.entries(draft.contextVariables.intraoperative)
          .filter(([key]) => key !== 'complicationDetails')
          .map(([, value]) => value),
        draft.contextVariables.intraoperative.complicationDetails.trim(),
      ].some((value) => value !== null && value !== '');

  return Boolean(
    draft.seniorId ||
      draft.procedure ||
      draft.indication ||
      draft.indicationComment.trim() ||
      draft.customIndication ||
      draft.approach ||
      draft.entryTechnique ||
      draft.laterality ||
      draft.context ||
      draft.role ||
      hasContextValues ||
      Object.values(draft.checklist).some((value) => value != null)
  );
}

export async function writeOfflineInterventionDraft(
  profileId: string,
  draft: InterventionDraft
) {
  if (!isStorageAvailable() || draft.internalId !== profileId) {
    throw new Error('La sauvegarde chiffrée locale n’est pas disponible.');
  }

  const database = await openDatabase();

  try {
    const key = await getOrCreateEncryptionKey(database, profileId);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const updatedAt = new Date();
    const plaintext = new TextEncoder().encode(JSON.stringify(draft));
    const ciphertext = await crypto.subtle.encrypt(
      {
        additionalData: getAdditionalData(profileId),
        iv,
        name: 'AES-GCM',
      },
      key,
      plaintext
    );
    const record: EncryptedDraftRecord = {
      ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
      expiresAt: new Date(updatedAt.getTime() + DRAFT_LIFETIME_MS).toISOString(),
      id: getDraftId(profileId),
      iv: bytesToBase64(iv),
      schemaVersion: DRAFT_SCHEMA_VERSION,
      updatedAt: updatedAt.toISOString(),
    };
    const transaction = database.transaction(DRAFT_STORE, 'readwrite');
    transaction.objectStore(DRAFT_STORE).put(record);
    await transactionDone(transaction);

    return record.updatedAt;
  } finally {
    database.close();
  }
}

export async function readOfflineInterventionDraft(
  profileId: string
): Promise<OfflineInterventionDraft | null> {
  if (!isStorageAvailable()) {
    return null;
  }

  const database = await openDatabase();

  try {
    const transaction = database.transaction([DRAFT_STORE, KEY_STORE], 'readonly');
    const draftRequest = transaction
      .objectStore(DRAFT_STORE)
      .get(getDraftId(profileId));
    const keyRequest = transaction.objectStore(KEY_STORE).get(profileId);
    const [record, key] = await Promise.all([
      requestResult<EncryptedDraftRecord | undefined>(draftRequest),
      requestResult<CryptoKey | undefined>(keyRequest),
    ]);
    await transactionDone(transaction);

    if (!record || !key || record.schemaVersion !== DRAFT_SCHEMA_VERSION) {
      return null;
    }

    if (new Date(record.expiresAt).getTime() <= Date.now()) {
      await clearOfflineInterventionDraft(profileId);
      return null;
    }

    const plaintext = await crypto.subtle.decrypt(
      {
        additionalData: getAdditionalData(profileId),
        iv: base64ToBytes(record.iv),
        name: 'AES-GCM',
      },
      key,
      base64ToBytes(record.ciphertext)
    );
    const draft = JSON.parse(new TextDecoder().decode(plaintext)) as InterventionDraft;

    if (
      !draft ||
      typeof draft !== 'object' ||
      draft.internalId !== profileId ||
      typeof draft.date !== 'string' ||
      typeof draft.indicationComment !== 'string' ||
      !draft.contextVariables ||
      !draft.checklist
    ) {
      await clearOfflineInterventionDraft(profileId);
      return null;
    }

    return { draft, updatedAt: record.updatedAt };
  } catch {
    await clearOfflineInterventionDraft(profileId).catch(() => undefined);
    return null;
  } finally {
    database.close();
  }
}

export async function clearOfflineInterventionDraft(profileId: string) {
  if (!isStorageAvailable()) {
    return;
  }

  const database = await openDatabase();

  try {
    const transaction = database.transaction(
      [DRAFT_STORE, KEY_STORE],
      'readwrite'
    );
    transaction.objectStore(DRAFT_STORE).delete(getDraftId(profileId));
    transaction.objectStore(KEY_STORE).delete(profileId);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export async function clearAllOfflineInterventionDrafts() {
  if (!isStorageAvailable()) {
    return;
  }

  const database = await openDatabase();

  try {
    const transaction = database.transaction(
      [DRAFT_STORE, KEY_STORE],
      'readwrite'
    );
    transaction.objectStore(DRAFT_STORE).clear();
    transaction.objectStore(KEY_STORE).clear();
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}
