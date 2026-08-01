import type { NotebookDocument } from '../types';

export const LEGACY_NOTEBOOK_DOCUMENTS_STORAGE_KEY =
  'journal-bord:notebook-documents:v1';

export const KNOWN_LEGACY_BUSINESS_STORAGE_KEYS = [
  'journal-bord:internal-profiles:v1',
  'journal-bord:internal-profiles:v2',
  'journal-bord:internal-profiles:v3',
  'journal-bord:internal-profiles:v4',
  'journal-bord:saved-interventions:v1',
  'journal-bord:saved-interventions:v2',
  'journal-bord:saved-interventions:v3',
  'journal-bord:saved-interventions:v4',
  'journal-bord:custom-surgical-interventions:v1',
  'journal-bord:custom-seniors:v1',
  'journal-bord:custom-seniors:v2',
  'journal-bord:admin-trophies:v1',
  'journal-bord:activity-log:v1',
  'journal-bord:admin-intervention-evaluations:v1',
  'journal-bord:test-feedback:v1',
  'journal-bord:supabase-session:v1',
] as const;

export const ALL_KNOWN_LEGACY_STORAGE_KEYS = [
  ...KNOWN_LEGACY_BUSINESS_STORAGE_KEYS,
  LEGACY_NOTEBOOK_DOCUMENTS_STORAGE_KEY,
] as const;

function isLegacyNotebookDocument(value: unknown): value is NotebookDocument {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const document = value as Partial<NotebookDocument>;

  return (
    typeof document.internalId === 'string' &&
    typeof document.contentHtml === 'string' &&
    typeof document.updatedAt === 'string'
  );
}

export function parseLegacyNotebookDocuments(
  rawValue: string | null
): NotebookDocument[] {
  if (!rawValue) {
    return [];
  }

  try {
    const parsedValue: unknown = JSON.parse(rawValue);

    return Array.isArray(parsedValue)
      ? parsedValue.filter(isLegacyNotebookDocument).map((document) => ({
          contentHtml: document.contentHtml,
          internalId: document.internalId,
          updatedAt: document.updatedAt,
          updatedByProfileId:
            typeof document.updatedByProfileId === 'string'
              ? document.updatedByProfileId
              : null,
          version:
            typeof document.version === 'number' ? document.version : undefined,
        }))
      : [];
  } catch {
    return [];
  }
}

export function cleanupKnownLegacyBusinessStorage() {
  if (typeof window === 'undefined') {
    return {
      notebookRecoveryPreserved: false,
      removedKeys: [] as string[],
    };
  }

  const removedKeys: string[] = [];

  KNOWN_LEGACY_BUSINESS_STORAGE_KEYS.forEach((storageKey) => {
    if (window.localStorage.getItem(storageKey) == null) {
      return;
    }

    window.localStorage.removeItem(storageKey);
    removedKeys.push(storageKey);
  });

  const notebookRawValue = window.localStorage.getItem(
    LEGACY_NOTEBOOK_DOCUMENTS_STORAGE_KEY
  );
  const recoverableNotebookDocuments =
    parseLegacyNotebookDocuments(notebookRawValue);

  if (notebookRawValue && recoverableNotebookDocuments.length === 0) {
    window.localStorage.removeItem(LEGACY_NOTEBOOK_DOCUMENTS_STORAGE_KEY);
    removedKeys.push(LEGACY_NOTEBOOK_DOCUMENTS_STORAGE_KEY);
  } else if (notebookRawValue) {
    window.localStorage.setItem(
      LEGACY_NOTEBOOK_DOCUMENTS_STORAGE_KEY,
      JSON.stringify(recoverableNotebookDocuments)
    );
  }

  return {
    notebookRecoveryPreserved: recoverableNotebookDocuments.length > 0,
    removedKeys,
  };
}

export function findLegacyNotebookRecovery(
  documents: NotebookDocument[],
  internalId: string,
  supabaseContentHtml: string
) {
  const candidate = documents
    .filter(
      (document) =>
        document.internalId === internalId &&
        document.contentHtml.trim().length > 0
    )
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];

  return candidate && candidate.contentHtml !== supabaseContentHtml
    ? candidate
    : null;
}

export function readLegacyNotebookRecovery(
  internalId: string,
  supabaseContentHtml: string
) {
  if (typeof window === 'undefined') {
    return null;
  }

  return findLegacyNotebookRecovery(
    parseLegacyNotebookDocuments(
      window.localStorage.getItem(LEGACY_NOTEBOOK_DOCUMENTS_STORAGE_KEY)
    ),
    internalId,
    supabaseContentHtml
  );
}

export function resolveLegacyNotebookRecovery(internalId: string) {
  if (typeof window === 'undefined') {
    return false;
  }

  const rawValue = window.localStorage.getItem(
    LEGACY_NOTEBOOK_DOCUMENTS_STORAGE_KEY
  );

  if (!rawValue) {
    return false;
  }

  const parsedValue: unknown = JSON.parse(rawValue);

  if (!Array.isArray(parsedValue)) {
    throw new Error('La copie locale historique est illisible.');
  }

  const validDocuments = parsedValue
    .filter(isLegacyNotebookDocument)
    .map((document) => ({
      contentHtml: document.contentHtml,
      internalId: document.internalId,
      updatedAt: document.updatedAt,
      updatedByProfileId:
        typeof document.updatedByProfileId === 'string'
          ? document.updatedByProfileId
          : null,
      version:
        typeof document.version === 'number' ? document.version : undefined,
    }));
  const hasInternalDocument = validDocuments.some(
    (document) => document.internalId === internalId
  );

  if (!hasInternalDocument) {
    return false;
  }

  const remainingDocuments = validDocuments.filter(
    (document) => document.internalId !== internalId
  );

  if (remainingDocuments.length > 0) {
    window.localStorage.setItem(
      LEGACY_NOTEBOOK_DOCUMENTS_STORAGE_KEY,
      JSON.stringify(remainingDocuments)
    );
  } else {
    window.localStorage.removeItem(LEGACY_NOTEBOOK_DOCUMENTS_STORAGE_KEY);
  }

  return true;
}
