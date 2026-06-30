import {
  createContext,
  type Dispatch,
  ReactNode,
  type SetStateAction,
  useContext,
  useEffect,
  useState,
} from 'react';

import {
  allChecklistSteps,
  defaultComplexityRating,
  getFixedContextForIntervention,
  getChecklistStepsForIntervention,
  getInternalByCredentials,
  getProcedureOptions,
  getSelectableSeniors,
  getSeniorByCredentials,
  getSeniorById,
  getSurgicalInterventionDefinitions,
  getSurgicalInterventionDefinition,
  internalProfiles as seededInternalProfiles,
  isApproachAllowedForIndication,
  isAdminCredentials,
  isSeededDemoInterventionId,
  normalizeComplexityRating,
  normalizeCredentialValue,
  seededSavedInterventions,
} from '../data/mockData';
import {
  AdminTrophyDefinition,
  AppScreen,
  ChecklistLevel,
  CreateInternalProfileInput,
  CreateInternalProfileResult,
  CreateSeniorProfileInput,
  CreateSeniorProfileResult,
  CreateSurgicalInterventionInput,
  CreateSurgicalInterventionResult,
  InterventionDraft,
  InterventionType,
  NotebookDocument,
  InternalProfile,
  NotebookNote,
  ObstetricJournalDraft,
  PreBlockContext,
  SavedObstetricGesture,
  SavedIntervention,
  Senior,
  SessionRole,
  SurgicalApproach,
  SurgicalInterventionDefinition,
  SummaryMode,
  UpdateInternalCredentialsInput,
  UpdateInternalCredentialsResult,
  UpdateInternalProfileSettingsInput,
  UpdateInternalProfileSettingsResult,
  UpdateSeniorCredentialsInput,
  UpdateSeniorCredentialsResult,
} from '../types';
import { ensureTrophyDefinitionShape } from '../utils/adminTrophies';
import { getTodayIsoDate } from '../utils/date';
import {
  buildSurgicalInterventionDefinitionFromInput,
  ensureSurgicalInterventionDefinitionShape,
} from '../utils/surgicalInterventions';
import { canSaveIntervention, getChecklistProgress, getMissingFormFields } from '../utils/validation';
import {
  clearPersistentStorageCredentials,
  isPersistentStorageConfigured,
  loadPersistentArray,
  savePersistentArray,
  setPersistentStorageCredentials,
} from '../services/persistentStorage';

type AppContextValue = {
  screen: AppScreen;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSenior: boolean;
  sessionRole: SessionRole | null;
  summaryMode: SummaryMode;
  preBlockContext: PreBlockContext;
  historyNavigationView: 'calendar' | 'progress' | null;
  internalProfiles: InternalProfile[];
  selectedInternal: InternalProfile | null;
  selectedSenior: Senior | null;
  draft: InterventionDraft;
  obstetricDraft: ObstetricJournalDraft;
  lastSavedIntervention: SavedIntervention | null;
  savedInterventions: SavedIntervention[];
  savedObstetricGestures: SavedObstetricGesture[];
  notebookDocuments: NotebookDocument[];
  customSurgicalInterventions: SurgicalInterventionDefinition[];
  customSeniors: Senior[];
  adminTrophies: AdminTrophyDefinition[];
  adminTrophyStorageWarning: string | null;
  passwordChangeChallenge: {
    loginId: string;
    role: 'internal' | 'senior';
    userLabel: string;
  } | null;
  selectableSeniors: Senior[];
  surgicalProcedureOptions: ReturnType<typeof getProcedureOptions>;
  formMissingFields: string[];
  checklistProgress: ReturnType<typeof getChecklistProgress>;
  login: (
    loginId: string,
    password: string
  ) => Promise<{
    message?: string;
    status: 'authenticated' | 'error' | 'password-change-required';
  }>;
  logout: () => void;
  cancelPasswordChangeChallenge: () => void;
  completePasswordChangeChallenge: (
    nextPassword: string,
    confirmPassword: string
  ) => {
    message: string;
    success: boolean;
  };
  goToSurgeryPortal: () => void;
  goToObstetricJournal: () => void;
  historyNavigationDate: string | null;
  clearHistoryNavigationDate: () => void;
  goToSurgeryHistory: (targetDate?: string, targetView?: 'calendar' | 'progress') => void;
  goToTrophies: () => void;
  goToProfile: () => void;
  goToNotebook: () => void;
  goToPreBlock: (context?: PreBlockContext) => void;
  goToForm: () => void;
  goToChecklist: () => void;
  goToSummary: () => void;
  backToForm: () => void;
  backToChecklist: () => void;
  backToWelcome: () => void;
  startNewIntervention: () => void;
  saveIntervention: () => SavedIntervention | null;
  saveObstetricGesture: () => SavedObstetricGesture | null;
  createInternalProfile: (
    input: CreateInternalProfileInput
  ) => CreateInternalProfileResult;
  updateInternalProfile: (
    profileId: string,
    input: CreateInternalProfileInput
  ) => CreateInternalProfileResult;
  updateInternalCredentials: (
    profileId: string,
    input: UpdateInternalCredentialsInput
  ) => UpdateInternalCredentialsResult;
  updateInternalProfileSettings: (
    profileId: string,
    input: UpdateInternalProfileSettingsInput
  ) => UpdateInternalProfileSettingsResult;
  createSeniorProfile: (
    input: CreateSeniorProfileInput
  ) => CreateSeniorProfileResult;
  updateSeniorProfile: (
    seniorId: string,
    input: CreateSeniorProfileInput
  ) => CreateSeniorProfileResult;
  updateSeniorCredentials: (
    seniorId: string,
    input: UpdateSeniorCredentialsInput
  ) => UpdateSeniorCredentialsResult;
  updateSeniorManagedInternals: (
    seniorId: string,
    internalIds: string[]
  ) => void;
  deleteSeniorProfile: (seniorId: string) => void;
  createSurgicalIntervention: (
    input: CreateSurgicalInterventionInput
  ) => CreateSurgicalInterventionResult;
  updateSurgicalIntervention: (
    interventionId: InterventionType,
    input: CreateSurgicalInterventionInput
  ) => CreateSurgicalInterventionResult;
  deleteCustomSurgicalIntervention: (interventionId: string) => void;
  deleteInternalProfile: (profileId: string) => void;
  deleteSavedInterventions: (ids: string[]) => void;
  setAdminTrophies: Dispatch<SetStateAction<AdminTrophyDefinition[]>>;
  updateNotebookDocument: (contentHtml: string) => void;
  clearNotebookDocument: () => void;
  updateSavedInterventionAutonomyScore: (
    interventionId: string,
    autonomyScore: number | null
  ) => void;
  updateDraftField: <K extends keyof InterventionDraft>(
    field: K,
    value: InterventionDraft[K]
  ) => void;
  updateObstetricDraftField: <K extends keyof ObstetricJournalDraft>(
    field: K,
    value: ObstetricJournalDraft[K]
  ) => void;
  setChecklistLevel: (stepId: string, level: ChecklistLevel) => void;
  setAllChecklistLevels: (level: ChecklistLevel) => void;
};

const AppContext = createContext<AppContextValue | undefined>(undefined);

const INTERNAL_PROFILES_STORAGE_KEY = 'journal-bord:internal-profiles:v4';
const SAVED_INTERVENTIONS_STORAGE_KEY = 'journal-bord:saved-interventions:v4';
const SAVED_OBSTETRIC_GESTURES_STORAGE_KEY =
  'journal-bord:saved-obstetric-gestures:v1';
const LEGACY_NOTEBOOK_NOTES_STORAGE_KEY = 'journal-bord:notebook-notes:v1';
const NOTEBOOK_DOCUMENTS_STORAGE_KEY = 'journal-bord:notebook-documents:v1';
const CUSTOM_SURGICAL_INTERVENTIONS_STORAGE_KEY =
  'journal-bord:custom-surgical-interventions:v1';
const CUSTOM_SENIORS_STORAGE_KEY = 'journal-bord:custom-seniors:v2';
const ADMIN_TROPHIES_STORAGE_KEY = 'journal-bord:admin-trophies:v1';
const SENIOR_LAST_LOGIN_STORAGE_KEY = 'journal-bord:senior-last-logins:v1';
const SENIOR_MANAGED_INTERNALS_STORAGE_KEY =
  'journal-bord:senior-managed-internals:v1';
const ACCOUNT_RESET_CUTOFF = Date.parse('2026-06-26T00:00:00.000Z');
const REMOVED_DEMO_PROFILE_IDS = new Set([
  'int-1',
  'int-2',
  'int-3',
  'int-jpoquet',
]);
const REMOVED_DEMO_LOGIN_IDS = new Set([
  'interne1',
  'interne2',
  'internetest',
  'jpoquet',
]);
const REMOVED_CUSTOM_SENIOR_NAMES = new Set(['ylan camby', 'dr vigoureux']);

type PasswordChangeChallengeState = {
  currentPassword: string;
  loginId: string;
  role: 'internal' | 'senior';
  userId: string;
  userLabel: string;
};

function isCreatedAfterAccountReset(createdAt: string | undefined) {
  if (!createdAt) {
    return false;
  }

  const timestamp = Date.parse(createdAt);

  return !Number.isNaN(timestamp) && timestamp >= ACCOUNT_RESET_CUTOFF;
}

function hydrateInternalProfile(profile: InternalProfile) {
  return {
    ...profile,
    avatarImageSrc: profile.avatarImageSrc ?? null,
    lastLoginAt: profile.lastLoginAt ?? null,
    mustChangePassword: profile.mustChangePassword ?? profile.lastLoginAt == null,
    achievementBadges: profile.achievementBadges ?? [],
    badgeMetrics: {
      primarySalpingectomyCount:
        profile.badgeMetrics?.primarySalpingectomyCount ?? 0,
      primaryColpocleisisCount:
        profile.badgeMetrics?.primaryColpocleisisCount ?? 0,
    },
    baselineStats: {
      totalInterventions: profile.baselineStats?.totalInterventions ?? 0,
      primaryOperatorCount:
        profile.baselineStats?.primaryOperatorCount ?? 0,
      primaryAssistantCount:
        profile.baselineStats?.primaryAssistantCount ?? 0,
    },
  };
}

function hydrateInternalProfiles(profiles: InternalProfile[]) {
  const hydratedProfiles = profiles.map(hydrateInternalProfile);
  const existingById = new Map(
    hydratedProfiles.map((profile) => [profile.id, profile])
  );
  const seededProfileIds = new Set(
    seededInternalProfiles.map((profile) => profile.id)
  );
  const refreshedSeedProfiles = seededInternalProfiles.map((profile) =>
    hydrateInternalProfile({
      ...profile,
      lastLoginAt: existingById.get(profile.id)?.lastLoginAt ?? profile.lastLoginAt,
    })
  );
  const customProfiles = hydratedProfiles.filter(
    (profile) =>
      !seededProfileIds.has(profile.id) &&
      !REMOVED_DEMO_PROFILE_IDS.has(profile.id) &&
      !REMOVED_DEMO_LOGIN_IDS.has(normalizeCredentialValue(profile.loginId)) &&
      isCreatedAfterAccountReset(profile.createdAt)
  );

  return [...refreshedSeedProfiles, ...customProfiles];
}

function hydrateCustomSeniors(customSeniors: Senior[]) {
  return customSeniors
    .filter(
      (senior) =>
        !REMOVED_CUSTOM_SENIOR_NAMES.has(
          normalizeCredentialValue(
            `${senior.firstName ?? ''} ${senior.lastName ?? ''}`
          )
        ) &&
        isCreatedAfterAccountReset(senior.createdAt) &&
        senior.loginId?.trim() &&
        senior.password?.trim()
    )
    .map((senior) => ({
      ...senior,
      firstName: senior.firstName.trim(),
      lastName: senior.lastName.trim(),
      loginId: senior.loginId?.trim(),
      mustChangePassword: senior.mustChangePassword ?? true,
      password: senior.password?.trim(),
      createdAt: senior.createdAt ?? new Date().toISOString(),
      isCustom: true,
      managedInternalIds: Array.isArray(senior.managedInternalIds)
        ? senior.managedInternalIds.filter((id) => typeof id === 'string')
        : [],
    }));
}

function loadStoredArray<T>(storageKey: string, fallbackValue: T[]) {
  if (typeof window === 'undefined') {
    return fallbackValue;
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey);

    if (!rawValue) {
      return fallbackValue;
    }

    const parsedValue = JSON.parse(rawValue);

    return Array.isArray(parsedValue) ? (parsedValue as T[]) : fallbackValue;
  } catch {
    return fallbackValue;
  }
}

function saveSeniorLastLogin(seniorId: string, lastLoginAt: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const rawValue = window.localStorage.getItem(SENIOR_LAST_LOGIN_STORAGE_KEY);
    const currentValue =
      rawValue != null ? (JSON.parse(rawValue) as Record<string, string>) : {};

    window.localStorage.setItem(
      SENIOR_LAST_LOGIN_STORAGE_KEY,
      JSON.stringify({
        ...currentValue,
        [seniorId]: lastLoginAt,
      })
    );
  } catch {
    // Ignore storage failures and keep authentication flow uninterrupted.
  }
}

function loadSeniorManagedInternalsMap() {
  if (typeof window === 'undefined') {
    return {} as Record<string, string[]>;
  }

  try {
    const rawValue = window.localStorage.getItem(
      SENIOR_MANAGED_INTERNALS_STORAGE_KEY
    );

    if (!rawValue) {
      return {} as Record<string, string[]>;
    }

    const parsedValue = JSON.parse(rawValue);

    if (!parsedValue || typeof parsedValue !== 'object') {
      return {} as Record<string, string[]>;
    }

    return Object.fromEntries(
      Object.entries(parsedValue).map(([seniorId, internalIds]) => [
        seniorId,
        Array.isArray(internalIds)
          ? internalIds.filter((id): id is string => typeof id === 'string')
          : [],
      ])
    );
  } catch {
    return {} as Record<string, string[]>;
  }
}

function escapeNotebookHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function migrateLegacyNotebookNotes(notes: NotebookNote[]): NotebookDocument[] {
  const notesByInternal = notes.reduce<Map<string, NotebookNote[]>>((acc, note) => {
    const currentNotes = acc.get(note.internalId) ?? [];
    currentNotes.push(note);
    acc.set(note.internalId, currentNotes);

    return acc;
  }, new Map());

  return Array.from(notesByInternal.entries()).map(([internalId, internalNotes]) => {
    const sortedNotes = [...internalNotes].sort((left, right) =>
      left.updatedAt.localeCompare(right.updatedAt)
    );
    const contentHtml = sortedNotes
      .map((note) =>
        `<section class="notebook-entry"><p>${escapeNotebookHtml(note.content).replace(
          /\n/g,
          '<br>'
        )}</p></section>`
      )
      .join('<hr class="notebook-separator">');

    return {
      internalId,
      contentHtml,
      updatedAt: sortedNotes[sortedNotes.length - 1]?.updatedAt ?? new Date().toISOString(),
    };
  });
}

function loadNotebookDocuments() {
  const storedDocuments = loadStoredArray<NotebookDocument>(
    NOTEBOOK_DOCUMENTS_STORAGE_KEY,
    []
  );

  if (storedDocuments.length > 0) {
    return storedDocuments;
  }

  return migrateLegacyNotebookNotes(
    loadStoredArray<NotebookNote>(LEGACY_NOTEBOOK_NOTES_STORAGE_KEY, [])
  );
}

function hydrateSavedIntervention(intervention: SavedIntervention) {
  return {
    ...intervention,
    customIndication: intervention.customIndication ?? null,
    autonomyScore: intervention.autonomyScore ?? null,
    complexity:
      normalizeComplexityRating(
        intervention.complexity as Parameters<typeof normalizeComplexityRating>[0]
      ) ?? defaultComplexityRating,
  };
}

function hydrateSavedInterventions(interventions: SavedIntervention[]) {
  const seededInterventionIds = new Set(
    seededSavedInterventions.map((intervention) => intervention.id)
  );
  const customInterventions = interventions
    .map(hydrateSavedIntervention)
    .filter(
      (intervention) =>
        !seededInterventionIds.has(intervention.id) &&
        !isSeededDemoInterventionId(intervention.id) &&
        !REMOVED_DEMO_PROFILE_IDS.has(intervention.internalId ?? '') &&
        isCreatedAfterAccountReset(intervention.savedAt)
    );

  return [
    ...seededSavedInterventions.map(hydrateSavedIntervention),
    ...customInterventions,
  ].sort((left, right) => right.savedAt.localeCompare(left.savedAt));
}

function hydrateSurgicalInterventionDefinitions(
  interventions: SurgicalInterventionDefinition[]
) {
  return interventions.map((intervention) =>
    ensureSurgicalInterventionDefinitionShape(intervention)
  );
}

function hydrateAdminTrophies(trophies: AdminTrophyDefinition[]) {
  return trophies.map((trophy) => ensureTrophyDefinitionShape(trophy));
}

function upsertSeniorRecord(currentSeniors: Senior[], senior: Senior) {
  const nextSeniors = currentSeniors.filter((item) => item.id !== senior.id);
  return [senior, ...nextSeniors];
}

const DEFAULT_CUSTOM_INTERVENTION_STEP_LABELS = [
  'Installation de la patiente',
  'Préparation du matériel et vérification de l’installation',
];

const LAPAROSCOPIC_CUSTOM_INTERVENTION_STEP_LABELS = [
  'Voie d’abord du pneumopéritoine',
  'Mise en place des trocarts',
  'Exsufflation et retrait des trocarts',
];
const PNEUMOPERITONEUM_ENTRY_STEP_LABEL = 'Voie d’abord du pneumopéritoine';

function getDefaultStepApproaches(
  stepLabel: string,
  allowedApproaches: SurgicalApproach[]
) {
  if (stepLabel === PNEUMOPERITONEUM_ENTRY_STEP_LABEL) {
    return allowedApproaches.filter((approach) =>
      approach === 'coelioscopie' ||
      approach === 'robot' ||
      approach === 'vnotes'
    );
  }

  return LAPAROSCOPIC_CUSTOM_INTERVENTION_STEP_LABELS.includes(stepLabel)
    ? allowedApproaches.filter((approach) =>
        approach === 'coelioscopie' || approach === 'robot'
      )
    : [];
}

function getStepApproachesFromInput(
  input: CreateSurgicalInterventionInput,
  stepLabel: string
) {
  const hasExplicitValue = Object.prototype.hasOwnProperty.call(
    input.stepApproachLabels,
    stepLabel
  );
  const candidateApproaches = hasExplicitValue
    ? input.stepApproachLabels[stepLabel] ?? []
    : getDefaultStepApproaches(stepLabel, input.allowedApproaches);

  return [...new Set(candidateApproaches)].filter((approach) =>
    input.allowedApproaches.includes(approach)
  );
}

function normalizeStepLabels(stepLabels: string[]) {
  const seenLabels = new Set<string>();

  return stepLabels
    .map((label) => label.trim())
    .filter((label) => {
      if (!label) {
        return false;
      }

      const normalizedLabel = label.toLocaleLowerCase('fr-FR');

      if (seenLabels.has(normalizedLabel)) {
        return false;
      }

      seenLabels.add(normalizedLabel);
      return true;
    });
}

function createEmptyChecklist() {
  return allChecklistSteps.reduce<Record<string, ChecklistLevel | null>>(
    (accumulator, step) => {
      accumulator[step.id] = null;
      return accumulator;
    },
    {}
  );
}

function createInitialDraft(internalId: string | null): InterventionDraft {
  return {
    date: getTodayIsoDate(),
    internalId,
    seniorId: null,
    procedure: null,
    indication: null,
    indicationComment: '',
    customIndication: null,
    approach: null,
    entryTechnique: null,
    laterality: null,
    context: null,
    complexity: defaultComplexityRating,
    role: null,
    checklist: createEmptyChecklist(),
  };
}

function createInitialObstetricDraft(
  internalId: string | null
): ObstetricJournalDraft {
  return {
    date: getTodayIsoDate(),
    internalId,
    seniorId: null,
    gesture: '',
    instrumentalExtraction: null,
    vacuumType: null,
    forcepsType: null,
    indication: '',
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<AppScreen>('welcome');
  const [historyNavigationDate, setHistoryNavigationDate] = useState<string | null>(
    null
  );
  const [historyNavigationView, setHistoryNavigationView] = useState<
    'calendar' | 'progress' | null
  >(null);
  const [sessionRole, setSessionRole] = useState<SessionRole | null>(null);
  const [summaryMode, setSummaryMode] = useState<SummaryMode>('review');
  const [preBlockContext, setPreBlockContext] =
    useState<PreBlockContext>('surgery');
  const [internalProfiles, setInternalProfiles] = useState<InternalProfile[]>(() =>
    hydrateInternalProfiles(
      loadStoredArray<InternalProfile>(
        INTERNAL_PROFILES_STORAGE_KEY,
        seededInternalProfiles
      )
    )
  );
  const [selectedInternalId, setSelectedInternalId] = useState<string | null>(null);
  const [selectedSeniorId, setSelectedSeniorId] = useState<string | null>(null);
  const [draft, setDraft] = useState<InterventionDraft>(createInitialDraft(null));
  const [obstetricDraft, setObstetricDraft] =
    useState<ObstetricJournalDraft>(createInitialObstetricDraft(null));
  const [lastSavedIntervention, setLastSavedIntervention] =
    useState<SavedIntervention | null>(null);
  const [savedInterventions, setSavedInterventions] = useState<SavedIntervention[]>(() =>
    hydrateSavedInterventions(
      loadStoredArray<SavedIntervention>(
        SAVED_INTERVENTIONS_STORAGE_KEY,
        seededSavedInterventions
      )
    )
  );
  const [savedObstetricGestures, setSavedObstetricGestures] = useState<
    SavedObstetricGesture[]
  >(() =>
    loadStoredArray<SavedObstetricGesture>(
      SAVED_OBSTETRIC_GESTURES_STORAGE_KEY,
      []
    )
  );
  const [notebookDocuments, setNotebookDocuments] =
    useState<NotebookDocument[]>(loadNotebookDocuments);
  const [customSurgicalInterventions, setCustomSurgicalInterventions] =
    useState<SurgicalInterventionDefinition[]>(() =>
      hydrateSurgicalInterventionDefinitions(
        loadStoredArray<SurgicalInterventionDefinition>(
          CUSTOM_SURGICAL_INTERVENTIONS_STORAGE_KEY,
          []
        )
      )
    );
  const [customSeniors, setCustomSeniors] = useState<Senior[]>(() =>
    hydrateCustomSeniors(
      loadStoredArray<Senior>(CUSTOM_SENIORS_STORAGE_KEY, [])
    )
  );
  const [adminTrophies, setAdminTrophies] = useState<AdminTrophyDefinition[]>(() =>
    hydrateAdminTrophies(
      loadStoredArray<AdminTrophyDefinition>(ADMIN_TROPHIES_STORAGE_KEY, [])
    )
  );
  const [adminTrophyStorageWarning, setAdminTrophyStorageWarning] = useState<
    string | null
  >(null);
  const [passwordChangeChallengeState, setPasswordChangeChallengeState] =
    useState<PasswordChangeChallengeState | null>(null);
  const [seniorManagedInternalsMap, setSeniorManagedInternalsMap] = useState<
    Record<string, string[]>
  >(loadSeniorManagedInternalsMap);
  const [canSavePersistentState, setCanSavePersistentState] = useState(false);
  const selectedInternal =
    internalProfiles.find((profile) => profile.id === selectedInternalId) ?? null;
  const selectableSeniors = getSelectableSeniors(customSeniors).map((senior) => ({
    ...senior,
    managedInternalIds:
      seniorManagedInternalsMap[senior.id] ?? senior.managedInternalIds ?? [],
  }));
  const selectedSenior =
    selectableSeniors.find((senior) => senior.id === selectedSeniorId) ?? null;
  const surgicalProcedureOptions = getProcedureOptions(customSurgicalInterventions);

  const formMissingFields = getMissingFormFields(
    draft,
    customSurgicalInterventions
  );
  const checklistProgress = getChecklistProgress(
    draft,
    customSurgicalInterventions
  );
  const isAuthenticated = sessionRole !== null;
  const isAdmin = sessionRole === 'admin';
  const isSenior = sessionRole === 'senior';

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      INTERNAL_PROFILES_STORAGE_KEY,
      JSON.stringify(internalProfiles)
    );

    if (canSavePersistentState) {
      void savePersistentArray('internal_profiles', internalProfiles);
    }
  }, [internalProfiles]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      SAVED_INTERVENTIONS_STORAGE_KEY,
      JSON.stringify(savedInterventions)
    );

    if (canSavePersistentState) {
      void savePersistentArray('saved_interventions', savedInterventions);
    }
  }, [savedInterventions]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      SAVED_OBSTETRIC_GESTURES_STORAGE_KEY,
      JSON.stringify(savedObstetricGestures)
    );

    if (canSavePersistentState) {
      void savePersistentArray(
        'saved_obstetric_gestures',
        savedObstetricGestures
      );
    }
  }, [savedObstetricGestures]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      NOTEBOOK_DOCUMENTS_STORAGE_KEY,
      JSON.stringify(notebookDocuments)
    );
  }, [notebookDocuments]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      CUSTOM_SURGICAL_INTERVENTIONS_STORAGE_KEY,
      JSON.stringify(customSurgicalInterventions)
    );

    if (canSavePersistentState) {
      void savePersistentArray(
        'custom_surgical_interventions',
        customSurgicalInterventions
      );
    }
  }, [customSurgicalInterventions]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      CUSTOM_SENIORS_STORAGE_KEY,
      JSON.stringify(customSeniors)
    );

    if (canSavePersistentState) {
      void savePersistentArray('custom_seniors', customSeniors);
    }
  }, [customSeniors]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(
        ADMIN_TROPHIES_STORAGE_KEY,
        JSON.stringify(adminTrophies)
      );
      setAdminTrophyStorageWarning(null);
    } catch (error) {
      console.warn('Admin trophies storage failed', error);
      setAdminTrophyStorageWarning(
        'Le trophée a bien été enregistré dans la session en cours, mais ses données sont trop volumineuses pour être sauvegardées localement. Réduis la taille des images si tu veux conserver cette configuration après rechargement.'
      );
    }

    if (canSavePersistentState) {
      void savePersistentArray('admin_trophies', adminTrophies);
    }
  }, [adminTrophies, canSavePersistentState]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      SENIOR_MANAGED_INTERNALS_STORAGE_KEY,
      JSON.stringify(seniorManagedInternalsMap)
    );
  }, [seniorManagedInternalsMap]);

  const loadPersistentState = async () => {
    if (!isPersistentStorageConfigured()) {
      return null;
    }

    const [
      persistentInternalProfiles,
      persistentSavedInterventions,
      persistentSavedObstetricGestures,
      persistentCustomSurgicalInterventions,
      persistentCustomSeniors,
      persistentAdminTrophies,
    ] = await Promise.all([
      loadPersistentArray<InternalProfile>('internal_profiles'),
      loadPersistentArray<SavedIntervention>('saved_interventions'),
      loadPersistentArray<SavedObstetricGesture>('saved_obstetric_gestures'),
      loadPersistentArray<SurgicalInterventionDefinition>(
        'custom_surgical_interventions'
      ),
      loadPersistentArray<Senior>('custom_seniors'),
      loadPersistentArray<AdminTrophyDefinition>('admin_trophies'),
    ]);

    if (
      !persistentInternalProfiles &&
      !persistentSavedInterventions &&
      !persistentSavedObstetricGestures &&
      !persistentCustomSurgicalInterventions &&
      !persistentCustomSeniors &&
      !persistentAdminTrophies
    ) {
      return null;
    }

    const nextInternalProfiles = persistentInternalProfiles
      ? hydrateInternalProfiles(persistentInternalProfiles)
      : internalProfiles;
    const nextSavedInterventions = persistentSavedInterventions
      ? hydrateSavedInterventions(persistentSavedInterventions)
      : savedInterventions;
    const nextSavedObstetricGestures =
      persistentSavedObstetricGestures ?? savedObstetricGestures;
    const nextCustomSurgicalInterventions =
      persistentCustomSurgicalInterventions
        ? hydrateSurgicalInterventionDefinitions(
            persistentCustomSurgicalInterventions
          )
        : customSurgicalInterventions;
    const nextCustomSeniors = persistentCustomSeniors
      ? hydrateCustomSeniors(persistentCustomSeniors)
      : customSeniors;
    const nextAdminTrophies = persistentAdminTrophies
      ? hydrateAdminTrophies(persistentAdminTrophies)
      : adminTrophies;

    if (persistentInternalProfiles) {
      setInternalProfiles(nextInternalProfiles);
    }

    if (persistentSavedInterventions) {
      setSavedInterventions(nextSavedInterventions);
    }

    if (persistentSavedObstetricGestures) {
      setSavedObstetricGestures(nextSavedObstetricGestures);
    }

    if (persistentCustomSurgicalInterventions) {
      setCustomSurgicalInterventions(nextCustomSurgicalInterventions);
    }

    if (persistentCustomSeniors) {
      setCustomSeniors(nextCustomSeniors);
    }

    if (persistentAdminTrophies) {
      setAdminTrophies(nextAdminTrophies);
    }

    setCanSavePersistentState(true);
    return {
      internalProfiles: nextInternalProfiles,
      savedInterventions: nextSavedInterventions,
      savedObstetricGestures: nextSavedObstetricGestures,
      customSurgicalInterventions: nextCustomSurgicalInterventions,
      customSeniors: nextCustomSeniors,
      adminTrophies: nextAdminTrophies,
    };
  };

  useEffect(() => {
    void loadPersistentState();
  }, []);

  const authenticateInternal = (profile: InternalProfile, lastLoginAt: string) => {
    setInternalProfiles((current) =>
      current.map((existingProfile) =>
        existingProfile.id === profile.id
          ? {
              ...existingProfile,
              lastLoginAt,
              mustChangePassword: false,
            }
          : existingProfile
      )
    );
    setPasswordChangeChallengeState(null);
    setSessionRole('internal');
    setSelectedInternalId(profile.id);
    setSelectedSeniorId(null);
    setDraft(createInitialDraft(profile.id));
    setObstetricDraft(createInitialObstetricDraft(profile.id));
    setLastSavedIntervention(null);
    setSummaryMode('review');
    setPreBlockContext('surgery');
    setScreen('welcome');
  };

  const authenticateSenior = (senior: Senior, lastLoginAt: string) => {
    saveSeniorLastLogin(senior.id, lastLoginAt);
    setPasswordChangeChallengeState(null);
    setSessionRole('senior');
    setSelectedInternalId(null);
    setSelectedSeniorId(senior.id);
    setDraft(createInitialDraft(null));
    setObstetricDraft(createInitialObstetricDraft(null));
    setLastSavedIntervention(null);
    setSummaryMode('review');
    setPreBlockContext('surgery');
    setScreen('admin');
  };

  const login = async (loginId: string, password: string) => {
    setPersistentStorageCredentials(loginId, password);
    setCanSavePersistentState(false);

    const persistentState = await loadPersistentState();
    const profilesForLogin =
      persistentState?.internalProfiles ?? internalProfiles;
    const seniorsForLogin =
      persistentState?.customSeniors ?? customSeniors;

    if (isAdminCredentials(loginId, password)) {
      setPasswordChangeChallengeState(null);
      setSessionRole('admin');
      setSelectedInternalId(null);
      setSelectedSeniorId(null);
      setDraft(createInitialDraft(null));
      setObstetricDraft(createInitialObstetricDraft(null));
      setLastSavedIntervention(null);
      setSummaryMode('review');
      setPreBlockContext('surgery');
      setScreen('admin');

      return { status: 'authenticated' } as const;
    }

    const senior = getSeniorByCredentials(loginId, password, seniorsForLogin);

    if (senior) {
      if (senior.mustChangePassword) {
        setPasswordChangeChallengeState({
          currentPassword: senior.password ?? '',
          loginId: senior.loginId ?? loginId.trim(),
          role: 'senior',
          userId: senior.id,
          userLabel: `${senior.firstName} ${senior.lastName}`.trim(),
        });
        setSessionRole(null);
        setSelectedInternalId(null);
        setSelectedSeniorId(null);
        setScreen('welcome');
        return { status: 'password-change-required' } as const;
      }

      authenticateSenior(senior, new Date().toISOString());
      return { status: 'authenticated' } as const;
    }

    const profile = getInternalByCredentials(
      loginId,
      password,
      profilesForLogin
    );

    if (!profile) {
      setPasswordChangeChallengeState(null);
      clearPersistentStorageCredentials();
      setCanSavePersistentState(false);
      return {
        message: 'Identifiant ou mot de passe incorrect.',
        status: 'error',
      } as const;
    }

    if (profile.mustChangePassword) {
      setPasswordChangeChallengeState({
        currentPassword: profile.password,
        loginId: profile.loginId,
        role: 'internal',
        userId: profile.id,
        userLabel: `${profile.firstName} ${profile.lastName}`.trim(),
      });
      setSessionRole(null);
      setSelectedInternalId(null);
      setSelectedSeniorId(null);
      setScreen('welcome');
      return { status: 'password-change-required' } as const;
    }

    authenticateInternal(profile, new Date().toISOString());
    return { status: 'authenticated' } as const;
  };

  const cancelPasswordChangeChallenge = () => {
    setPasswordChangeChallengeState(null);
    clearPersistentStorageCredentials();
    setCanSavePersistentState(false);
  };

  const completePasswordChangeChallenge = (
    nextPassword: string,
    confirmPassword: string
  ) => {
    const challenge = passwordChangeChallengeState;

    if (!challenge) {
      return {
        message: 'Aucun changement de mot de passe n’est en attente.',
        success: false,
      };
    }

    const sanitizedPassword = nextPassword.trim();
    const sanitizedConfirmation = confirmPassword.trim();

    if (sanitizedPassword.length < 4) {
      return {
        message: 'Le nouveau mot de passe doit contenir au moins 4 caractères.',
        success: false,
      };
    }

    if (sanitizedPassword !== sanitizedConfirmation) {
      return {
        message: 'La confirmation du nouveau mot de passe ne correspond pas.',
        success: false,
      };
    }

    if (sanitizedPassword === challenge.currentPassword.trim()) {
      return {
        message: 'Choisis un mot de passe différent du mot de passe temporaire.',
        success: false,
      };
    }

    const lastLoginAt = new Date().toISOString();

    if (challenge.role === 'internal') {
      const profile =
        internalProfiles.find((item) => item.id === challenge.userId) ?? null;

      if (!profile) {
        return {
          message: 'Ce profil interne est introuvable.',
          success: false,
        };
      }

      const updatedProfile: InternalProfile = {
        ...profile,
        lastLoginAt,
        mustChangePassword: false,
        password: sanitizedPassword,
      };

      setInternalProfiles((current) =>
        current.map((item) => (item.id === updatedProfile.id ? updatedProfile : item))
      );
      setPersistentStorageCredentials(updatedProfile.loginId, sanitizedPassword);
      setCanSavePersistentState(false);
      authenticateInternal(updatedProfile, lastLoginAt);

      return {
        message: 'Mot de passe mis à jour. Connexion en cours...',
        success: true,
      };
    }

    const senior =
      selectableSeniors.find((item) => item.id === challenge.userId) ?? null;

    if (!senior || !senior.loginId) {
      return {
        message: 'Ce compte senior est introuvable.',
        success: false,
      };
    }

    const updatedSenior: Senior = {
      ...senior,
      loginId: senior.loginId,
      mustChangePassword: false,
      password: sanitizedPassword,
    };

    setCustomSeniors((current) => upsertSeniorRecord(current, updatedSenior));
    setPersistentStorageCredentials(updatedSenior.loginId, sanitizedPassword);
    setCanSavePersistentState(false);
    authenticateSenior(updatedSenior, lastLoginAt);

    return {
      message: 'Mot de passe mis à jour. Connexion en cours...',
      success: true,
    };
  };

  const logout = () => {
    clearPersistentStorageCredentials();
    setCanSavePersistentState(false);
    setPasswordChangeChallengeState(null);
    setSessionRole(null);
    setSelectedInternalId(null);
    setSelectedSeniorId(null);
    setDraft(createInitialDraft(null));
    setObstetricDraft(createInitialObstetricDraft(null));
    setLastSavedIntervention(null);
    setSummaryMode('review');
    setPreBlockContext('surgery');
    setScreen('welcome');
  };

  const goToSurgeryPortal = () => {
    if (!selectedInternal) {
      return;
    }

    setScreen('welcome');
  };

  const goToObstetricJournal = () => {
    if (!selectedInternal) {
      return;
    }

    setScreen('welcome');
  };

  const goToForm = () => {
    if (!selectedInternal) {
      return;
    }

    setSummaryMode('review');
    setScreen('form');
  };

  const goToSurgeryHistory = (
    targetDate?: string,
    targetView: 'calendar' | 'progress' = 'calendar'
  ) => {
    if (!selectedInternal) {
      return;
    }

    setHistoryNavigationDate(targetDate ?? null);
    setHistoryNavigationView(targetView);
    setScreen('surgery-history');
  };

  const clearHistoryNavigationDate = () => {
    setHistoryNavigationDate(null);
    setHistoryNavigationView(null);
  };

  const goToTrophies = () => {
    if (!selectedInternal) {
      return;
    }

    setScreen('trophies');
  };

  const goToProfile = () => {
    if (!selectedInternal) {
      return;
    }

    setScreen('profile');
  };

  const goToNotebook = () => {
    if (!selectedInternal) {
      return;
    }

    setScreen('notebook');
  };

  const goToPreBlock = (context: PreBlockContext = 'surgery') => {
    setPreBlockContext(context);
    setScreen('preblock');
  };

  const goToChecklist = () => {
    if (formMissingFields.length > 0) {
      return;
    }
    setScreen('checklist');
  };

  const goToSummary = () => {
    const internalId = draft.internalId ?? selectedInternal?.id ?? null;

    if (
      !internalId ||
      !draft.seniorId ||
      !canSaveIntervention(draft, customSurgicalInterventions)
    ) {
      return;
    }

    setSummaryMode('review');
    setScreen('summary');
  };

  const backToForm = () => {
    setSummaryMode('review');
    setScreen('form');
  };

  const backToChecklist = () => {
    setSummaryMode('review');
    setScreen('checklist');
  };

  const backToWelcome = () => {
    setSummaryMode('review');
    setScreen(
      sessionRole === 'admin'
        ? 'admin'
        : 'welcome'
    );
  };

  const startNewIntervention = () => {
    setDraft(createInitialDraft(selectedInternal?.id ?? null));
    setSummaryMode('review');
    setScreen(selectedInternal ? 'form' : 'welcome');
  };

  const saveIntervention = () => {
    const internalId = draft.internalId ?? selectedInternal?.id ?? null;

    if (
      !internalId ||
      !draft.seniorId ||
      !canSaveIntervention(draft, customSurgicalInterventions)
    ) {
      return null;
    }

    const intervention: SavedIntervention = {
      ...draft,
      context:
        getFixedContextForIntervention(draft.procedure, draft.indication) ??
        draft.context,
      internalId,
      id: `${Date.now()}`,
      autonomyScore: null,
      savedAt: new Date().toISOString(),
    };

    setSavedInterventions((current) => [intervention, ...current]);
    setLastSavedIntervention(intervention);
    setDraft(createInitialDraft(internalId));
    setSummaryMode('review');
    setScreen('welcome');

    return intervention;
  };

  const saveObstetricGesture = () => {
    const internalId = obstetricDraft.internalId ?? selectedInternal?.id ?? null;
    const gesture = obstetricDraft.gesture.trim();
    const instrumentalExtraction =
      obstetricDraft.instrumentalExtraction?.trim() || null;
    const vacuumType = obstetricDraft.vacuumType?.trim() || null;
    const forcepsType = obstetricDraft.forcepsType?.trim() || null;
    const indication = obstetricDraft.indication.trim();

    if (!internalId || !obstetricDraft.date || !obstetricDraft.seniorId) {
      return null;
    }

    if (!gesture || !indication) {
      return null;
    }

    if (gesture === 'Extraction instrumentales' && !instrumentalExtraction) {
      return null;
    }

    if (instrumentalExtraction === 'Ventouse' && !vacuumType) {
      return null;
    }

    if (instrumentalExtraction === 'Forceps' && !forcepsType) {
      return null;
    }

    const savedGesture: SavedObstetricGesture = {
      ...obstetricDraft,
      internalId,
      gesture,
      instrumentalExtraction:
        gesture === 'Extraction instrumentales' ? instrumentalExtraction : null,
      vacuumType:
        gesture === 'Extraction instrumentales' &&
        instrumentalExtraction === 'Ventouse'
          ? vacuumType
          : null,
      forcepsType:
        gesture === 'Extraction instrumentales' &&
        instrumentalExtraction === 'Forceps'
          ? forcepsType
          : null,
      indication,
      id: `${Date.now()}`,
      savedAt: new Date().toISOString(),
    };

    setSavedObstetricGestures((current) => [savedGesture, ...current]);
    setObstetricDraft(createInitialObstetricDraft(internalId));
    setScreen('welcome');

    return savedGesture;
  };

  const createInternalProfile = (
    input: CreateInternalProfileInput
  ): CreateInternalProfileResult => {
    const sanitizedInput = {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      loginId: input.loginId.trim(),
      password: input.password.trim(),
      promotion: input.promotion.trim(),
      semester: input.semester.trim().toUpperCase(),
      currentRotation: input.currentRotation.trim(),
    };

    if (Object.values(sanitizedInput).some((value) => value.length === 0)) {
      return {
        success: false,
        message: 'Tous les champs du profil doivent être renseignés.',
      };
    }

    const normalizedLoginId = normalizeCredentialValue(sanitizedInput.loginId);
    const seniorLoginExists = getSelectableSeniors(customSeniors).some(
      (senior) =>
        senior.loginId &&
        normalizeCredentialValue(senior.loginId) === normalizedLoginId
    );

    if (
      seniorLoginExists ||
      internalProfiles.some(
        (profile) =>
          normalizeCredentialValue(profile.loginId) === normalizedLoginId
      )
    ) {
      return {
        success: false,
        message: 'Cet identifiant existe déjà. Choisis-en un autre.',
      };
    }

    const now = new Date().toISOString();
    const profile: InternalProfile = {
      id: `int-${Date.now()}`,
      firstName: sanitizedInput.firstName,
      lastName: sanitizedInput.lastName,
      loginId: sanitizedInput.loginId,
      mustChangePassword: true,
      password: sanitizedInput.password,
      promotion: sanitizedInput.promotion,
      semester: sanitizedInput.semester,
      currentRotation: sanitizedInput.currentRotation,
      avatarImageSrc: null,
      createdAt: now,
      lastLoginAt: null,
      achievementBadges: [],
      badgeMetrics: {
        primarySalpingectomyCount: 0,
        primaryColpocleisisCount: 0,
      },
      baselineStats: {
        totalInterventions: 0,
        primaryOperatorCount: 0,
        primaryAssistantCount: 0,
      },
    };

    setInternalProfiles((current) => [profile, ...current]);

    return {
      success: true,
      message: 'Le profil interne a bien été créé.',
      profile,
    };
  };

  const updateInternalProfile = (
    profileId: string,
    input: CreateInternalProfileInput
  ): CreateInternalProfileResult => {
    const existingProfile =
      internalProfiles.find((profile) => profile.id === profileId) ?? null;

    if (!existingProfile) {
      return {
        success: false,
        message: 'Ce profil interne est introuvable.',
      };
    }

    const sanitizedInput = {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      loginId: input.loginId.trim(),
      password: input.password.trim(),
      promotion: input.promotion.trim(),
      semester: input.semester.trim().toUpperCase(),
      currentRotation: input.currentRotation.trim(),
    };

    if (Object.values(sanitizedInput).some((value) => value.length === 0)) {
      return {
        success: false,
        message: 'Tous les champs du profil doivent être renseignés.',
      };
    }

    const normalizedLoginId = normalizeCredentialValue(sanitizedInput.loginId);
    const seniorLoginExists = getSelectableSeniors(customSeniors).some(
      (senior) =>
        senior.loginId &&
        normalizeCredentialValue(senior.loginId) === normalizedLoginId
    );

    if (
      seniorLoginExists ||
      internalProfiles.some(
        (profile) =>
          profile.id !== profileId &&
          normalizeCredentialValue(profile.loginId) === normalizedLoginId
      )
    ) {
      return {
        success: false,
        message: 'Cet identifiant existe déjà. Choisis-en un autre.',
      };
    }

    const updatedProfile: InternalProfile = {
      ...existingProfile,
      ...sanitizedInput,
      mustChangePassword:
        existingProfile.password !== sanitizedInput.password
          ? true
          : existingProfile.mustChangePassword ?? false,
    };

    setInternalProfiles((current) =>
      current.map((profile) =>
        profile.id === profileId ? updatedProfile : profile
      )
    );

    return {
      success: true,
      message: 'Le profil interne a bien été mis à jour.',
      profile: updatedProfile,
    };
  };

  const updateInternalCredentials = (
    profileId: string,
    input: UpdateInternalCredentialsInput
  ): UpdateInternalCredentialsResult => {
    const existingProfile =
      internalProfiles.find((profile) => profile.id === profileId) ?? null;

    if (!existingProfile) {
      return {
        success: false,
        message: 'Ce profil interne est introuvable.',
      };
    }

    const sanitizedInput = {
      loginId: input.loginId.trim(),
      password: input.password.trim(),
    };

    if (Object.values(sanitizedInput).some((value) => value.length === 0)) {
      return {
        success: false,
        message: 'L’identifiant et le mot de passe doivent être renseignés.',
      };
    }

    const normalizedLoginId = normalizeCredentialValue(sanitizedInput.loginId);
    const loginAlreadyExists =
      normalizedLoginId === 'admin' ||
      internalProfiles.some(
        (profile) =>
          profile.id !== profileId &&
          normalizeCredentialValue(profile.loginId) === normalizedLoginId
      ) ||
      getSelectableSeniors(customSeniors).some(
        (senior) =>
          senior.loginId &&
          normalizeCredentialValue(senior.loginId) === normalizedLoginId
      );

    if (loginAlreadyExists) {
      return {
        success: false,
        message: 'Cet identifiant existe déjà. Choisis-en un autre.',
      };
    }

    const updatedProfile: InternalProfile = {
      ...existingProfile,
      loginId: sanitizedInput.loginId,
      mustChangePassword:
        input.mustChangePassword ?? existingProfile.mustChangePassword ?? false,
      password: sanitizedInput.password,
    };

    setInternalProfiles((current) =>
      current.map((profile) =>
        profile.id === profileId ? updatedProfile : profile
      )
    );

    return {
      success: true,
      message: 'Les identifiants de l’interne ont bien été modifiés.',
      profile: updatedProfile,
    };
  };

  const updateInternalProfileSettings = (
    profileId: string,
    input: UpdateInternalProfileSettingsInput
  ): UpdateInternalProfileSettingsResult => {
    const existingProfile =
      internalProfiles.find((profile) => profile.id === profileId) ?? null;

    if (!existingProfile) {
      return {
        success: false,
        message: 'Ce profil interne est introuvable.',
      };
    }

    const hasTrainingUpdate =
      typeof input.semester === 'string' ||
      typeof input.currentRotation === 'string';
    const hasAvatarUpdate = Object.prototype.hasOwnProperty.call(
      input,
      'avatarImageSrc'
    );

    if (!hasTrainingUpdate && !hasAvatarUpdate) {
      return {
        success: false,
        message: 'Aucune modification du profil n’a été transmise.',
      };
    }

    const semester = hasTrainingUpdate
      ? input.semester?.trim().toUpperCase() ?? ''
      : existingProfile.semester;
    const currentRotation = hasTrainingUpdate
      ? input.currentRotation?.trim() ?? ''
      : existingProfile.currentRotation;

    if (hasTrainingUpdate && (!semester || !currentRotation)) {
      return {
        success: false,
        message: 'Le semestre et le stage doivent être renseignés.',
      };
    }

    const updatedProfile: InternalProfile = {
      ...existingProfile,
      semester,
      currentRotation,
      avatarImageSrc: hasAvatarUpdate
        ? input.avatarImageSrc ?? null
        : existingProfile.avatarImageSrc ?? null,
    };

    setInternalProfiles((current) =>
      current.map((profile) =>
        profile.id === profileId ? updatedProfile : profile
      )
    );

    return {
      success: true,
      message: hasTrainingUpdate
        ? 'Les informations de formation ont bien été mises à jour.'
        : 'La photo de profil a bien été mise à jour.',
      profile: updatedProfile,
    };
  };

  const createSeniorProfile = (
    input: CreateSeniorProfileInput
  ): CreateSeniorProfileResult => {
    const sanitizedInput = {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      loginId: input.loginId.trim(),
      password: input.password.trim(),
    };

    if (Object.values(sanitizedInput).some((value) => value.length === 0)) {
      return {
        success: false,
        message: 'Tous les champs du compte senior doivent être renseignés.',
      };
    }

    const normalizedLoginId = normalizeCredentialValue(sanitizedInput.loginId);
    const loginAlreadyExists =
      normalizedLoginId === 'admin' ||
      internalProfiles.some(
        (profile) =>
          normalizeCredentialValue(profile.loginId) === normalizedLoginId
      ) ||
      getSelectableSeniors(customSeniors).some(
        (senior) =>
          senior.loginId &&
          normalizeCredentialValue(senior.loginId) === normalizedLoginId
      );

    if (loginAlreadyExists) {
      return {
        success: false,
        message: 'Cet identifiant existe déjà. Choisis-en un autre.',
      };
    }

    const senior: Senior = {
      id: `sen-custom-${Date.now()}`,
      firstName: sanitizedInput.firstName,
      lastName: sanitizedInput.lastName,
      loginId: sanitizedInput.loginId,
      mustChangePassword: true,
      password: sanitizedInput.password,
      createdAt: new Date().toISOString(),
      isCustom: true,
    };

    setCustomSeniors((current) => [senior, ...current]);

    return {
      success: true,
      message: 'Le compte senior a bien été créé.',
      senior,
    };
  };

  const updateSeniorProfile = (
    seniorId: string,
    input: CreateSeniorProfileInput
  ): CreateSeniorProfileResult => {
    const existingSenior =
      selectableSeniors.find((senior) => senior.id === seniorId) ?? null;

    if (!existingSenior) {
      return {
        success: false,
        message: 'Ce compte senior est introuvable.',
      };
    }

    const sanitizedInput = {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      loginId: input.loginId.trim(),
      password: input.password.trim(),
    };

    if (Object.values(sanitizedInput).some((value) => value.length === 0)) {
      return {
        success: false,
        message: 'Tous les champs du compte senior doivent être renseignés.',
      };
    }

    const normalizedLoginId = normalizeCredentialValue(sanitizedInput.loginId);
    const loginAlreadyExists =
      normalizedLoginId === 'admin' ||
      internalProfiles.some(
        (profile) =>
          normalizeCredentialValue(profile.loginId) === normalizedLoginId
      ) ||
      getSelectableSeniors(customSeniors).some(
        (senior) =>
          senior.id !== seniorId &&
          senior.loginId &&
          normalizeCredentialValue(senior.loginId) === normalizedLoginId
      );

    if (loginAlreadyExists) {
      return {
        success: false,
        message: 'Cet identifiant existe déjà. Choisis-en un autre.',
      };
    }

    const updatedSenior: Senior = {
      ...existingSenior,
      ...sanitizedInput,
      mustChangePassword:
        existingSenior.password !== sanitizedInput.password
          ? true
          : existingSenior.mustChangePassword ?? false,
    };

    setCustomSeniors((current) => upsertSeniorRecord(current, updatedSenior));

    return {
      success: true,
      message: 'Le compte senior a bien été mis à jour.',
      senior: updatedSenior,
    };
  };

  const updateSeniorCredentials = (
    seniorId: string,
    input: UpdateSeniorCredentialsInput
  ): UpdateSeniorCredentialsResult => {
    const existingSenior =
      selectableSeniors.find((senior) => senior.id === seniorId) ?? null;

    if (!existingSenior) {
      return {
        success: false,
        message: 'Ce compte senior est introuvable.',
      };
    }

    const sanitizedInput = {
      loginId: input.loginId.trim(),
      password: input.password.trim(),
    };

    if (Object.values(sanitizedInput).some((value) => value.length === 0)) {
      return {
        success: false,
        message: 'L’identifiant et le mot de passe doivent être renseignés.',
      };
    }

    const normalizedLoginId = normalizeCredentialValue(sanitizedInput.loginId);
    const loginAlreadyExists =
      normalizedLoginId === 'admin' ||
      internalProfiles.some(
        (profile) =>
          normalizeCredentialValue(profile.loginId) === normalizedLoginId
      ) ||
      getSelectableSeniors(customSeniors).some(
        (senior) =>
          senior.id !== seniorId &&
          senior.loginId &&
          normalizeCredentialValue(senior.loginId) === normalizedLoginId
      );

    if (loginAlreadyExists) {
      return {
        success: false,
        message: 'Cet identifiant existe déjà. Choisis-en un autre.',
      };
    }

    const updatedSenior: Senior = {
      ...existingSenior,
      loginId: sanitizedInput.loginId,
      mustChangePassword:
        input.mustChangePassword ?? existingSenior.mustChangePassword ?? false,
      password: sanitizedInput.password,
    };

    setCustomSeniors((current) => upsertSeniorRecord(current, updatedSenior));

    return {
      success: true,
      message: 'Les identifiants du compte senior ont bien été modifiés.',
      senior: updatedSenior,
    };
  };

  const updateSeniorManagedInternals = (seniorId: string, internalIds: string[]) => {
    const sanitizedInternalIds = Array.from(
      new Set(
        internalIds.filter((internalId) =>
          internalProfiles.some((profile) => profile.id === internalId)
        )
      )
    );

    setSeniorManagedInternalsMap((current) => ({
      ...current,
      [seniorId]: sanitizedInternalIds,
    }));
  };

  const deleteSeniorProfile = (seniorId: string) => {
    setCustomSeniors((current) =>
      current.filter((senior) => senior.id !== seniorId)
    );
    setSeniorManagedInternalsMap((current) => {
      if (!(seniorId in current)) {
        return current;
      }

      const nextMap = { ...current };
      delete nextMap[seniorId];
      return nextMap;
    });
    setSelectedSeniorId((current) => (current === seniorId ? null : current));
  };

  const buildSurgicalInterventionDefinition = (
    input: CreateSurgicalInterventionInput,
    interventionId?: InterventionType
  ): CreateSurgicalInterventionResult => {
    const id = interventionId ?? (`custom-${Date.now()}` as InterventionType);
    const name = input.name.trim();

    if (!name) {
      return {
        success: false,
        message: 'Le nom de l’intervention doit être renseigné.',
      };
    }

    const normalizedName = name.toLocaleLowerCase('fr-FR');
    const nameAlreadyExists = getSurgicalInterventionDefinitions(
      customSurgicalInterventions
    ).some(
      (intervention) =>
        intervention.id !== id &&
        intervention.name.toLocaleLowerCase('fr-FR') === normalizedName
    );

    if (nameAlreadyExists) {
      return {
        success: false,
        message: 'Cette intervention existe déjà dans le journal.',
      };
    }

    const existingIntervention = customSurgicalInterventions.find(
      (intervention) => intervention.id === id
    );
    const intervention = ensureSurgicalInterventionDefinitionShape(
      buildSurgicalInterventionDefinitionFromInput(
        {
          ...input,
          name,
        },
        existingIntervention
          ? {
              ...existingIntervention,
              id,
            }
          : {
              id,
              name,
              indications: [],
              allowedApproaches: [],
              allowedEntryTechniques: [],
              requiresLaterality: false,
              checklistSteps: [],
              keyStepIds: [],
              isCustom: true,
              createdAt: new Date().toISOString(),
            }
      )
    );

    return {
      success: true,
      message: 'La définition de l’intervention est prête.',
      intervention,
    };
  };

  const createSurgicalIntervention = (
    input: CreateSurgicalInterventionInput
  ): CreateSurgicalInterventionResult => {
    const result = buildSurgicalInterventionDefinition(input);

    if (!result.success || !result.intervention) {
      return result;
    }

    const intervention = result.intervention;
    setCustomSurgicalInterventions((current) => [intervention, ...current]);

    return {
      success: true,
      message: 'La nouvelle intervention a bien été créée.',
      intervention,
    };
  };

  const updateSurgicalIntervention = (
    interventionId: InterventionType,
    input: CreateSurgicalInterventionInput
  ): CreateSurgicalInterventionResult => {
    const result = buildSurgicalInterventionDefinition(input, interventionId);

    if (!result.success || !result.intervention) {
      return result;
    }

    const intervention = result.intervention;
    setCustomSurgicalInterventions((current) => [
      intervention,
      ...current.filter((storedIntervention) => storedIntervention.id !== interventionId),
    ]);

    return {
      success: true,
      message: 'L’intervention a bien été mise à jour.',
      intervention,
    };
  };

  const deleteSavedInterventions = (ids: string[]) => {
    if (ids.length === 0) {
      return;
    }

    const selectedIds = new Set(ids);

    setSavedInterventions((current) =>
      current.filter((intervention) => !selectedIds.has(intervention.id))
    );
    setLastSavedIntervention((current) =>
      current && selectedIds.has(current.id) ? null : current
    );
  };

  const updateNotebookDocument = (contentHtml: string) => {
    if (!selectedInternal) {
      return;
    }

    const now = new Date().toISOString();

    setNotebookDocuments((current) => {
      const existingDocument = current.find(
        (document) => document.internalId === selectedInternal.id
      );

      if (!existingDocument) {
        return [
          {
            internalId: selectedInternal.id,
            contentHtml,
            updatedAt: now,
          },
          ...current,
        ];
      }

      return current.map((document) =>
        document.internalId === selectedInternal.id
          ? {
              ...document,
              contentHtml,
              updatedAt: now,
            }
          : document
      );
    });
  };

  const clearNotebookDocument = () => {
    if (!selectedInternal) {
      return;
    }

    updateNotebookDocument('');
  };

  const updateSavedInterventionAutonomyScore = (
    interventionId: string,
    autonomyScore: number | null
  ) => {
    setSavedInterventions((current) =>
      current.map((intervention) =>
        intervention.id === interventionId
          ? {
              ...intervention,
              autonomyScore,
            }
          : intervention
      )
    );
    setLastSavedIntervention((current) =>
      current?.id === interventionId
        ? {
            ...current,
            autonomyScore,
          }
        : current
    );
  };

  const deleteCustomSurgicalIntervention = (interventionId: string) => {
    setCustomSurgicalInterventions((current) =>
      current.filter((intervention) => intervention.id !== interventionId)
    );
    setDraft((current) =>
      current.procedure === interventionId
        ? createInitialDraft(current.internalId)
        : current
    );
  };

  const deleteInternalProfile = (profileId: string) => {
    if (!profileId) {
      return;
    }

    setInternalProfiles((current) =>
      current.filter((profile) => profile.id !== profileId)
    );
    setSavedInterventions((current) =>
      current.filter((intervention) => intervention.internalId !== profileId)
    );
    setSavedObstetricGestures((current) =>
      current.filter((gesture) => gesture.internalId !== profileId)
    );
    setNotebookDocuments((current) =>
      current.filter((document) => document.internalId !== profileId)
    );
    setLastSavedIntervention((current) =>
      current && current.internalId === profileId ? null : current
    );
    setSelectedInternalId((current) => (current === profileId ? null : current));
    setDraft((current) =>
      current.internalId === profileId ? createInitialDraft(null) : current
    );
    setObstetricDraft((current) =>
      current.internalId === profileId
        ? createInitialObstetricDraft(null)
        : current
    );
  };

  const updateDraftField = <K extends keyof InterventionDraft>(
    field: K,
    value: InterventionDraft[K]
  ) => {
    setDraft((current) => {
      const nextDraft: InterventionDraft = {
        ...current,
        [field]: value,
      };

      if (
        field === 'approach' &&
        value !== 'coelioscopie' &&
        value !== 'robot'
      ) {
        nextDraft.entryTechnique = null;
      }

      if (field === 'procedure') {
        nextDraft.indication = null;
        nextDraft.indicationComment = '';
        nextDraft.customIndication = null;
        nextDraft.approach = null;
        nextDraft.entryTechnique = null;
        nextDraft.laterality = null;
        nextDraft.checklist = createEmptyChecklist();
      }

      if (field === 'indication' && value !== 'geu') {
        nextDraft.checklist = createEmptyChecklist();
      }

      if (field === 'indication' && value !== 'autre') {
        nextDraft.indicationComment = '';
      }

      if (
        field === 'customIndication' &&
        typeof value === 'string' &&
        value.trim().length === 0
      ) {
        nextDraft.customIndication = null;
      }

      if (
        nextDraft.procedure === 'salpingectomie' &&
        nextDraft.approach &&
        !isApproachAllowedForIndication(
          nextDraft.approach,
          nextDraft.indication
        )
      ) {
        nextDraft.approach = null;
        nextDraft.entryTechnique = null;
      }

      const interventionDefinition = getSurgicalInterventionDefinition(
        nextDraft.procedure,
        customSurgicalInterventions
      );

      if (interventionDefinition?.isCustom) {
        if (
          nextDraft.customIndication &&
          !interventionDefinition.indications.includes(nextDraft.customIndication)
        ) {
          nextDraft.customIndication = null;
        }

        if (
          nextDraft.approach &&
          !interventionDefinition.allowedApproaches.includes(nextDraft.approach)
        ) {
          nextDraft.approach = null;
          nextDraft.entryTechnique = null;
        }

        if (
          nextDraft.entryTechnique &&
          !interventionDefinition.allowedEntryTechniques.includes(
            nextDraft.entryTechnique
          )
        ) {
          nextDraft.entryTechnique = null;
        }

        if (!interventionDefinition.requiresLaterality) {
          nextDraft.laterality = null;
        }
      }

      if (field === 'procedure' || field === 'indication') {
        nextDraft.context = getFixedContextForIntervention(
          nextDraft.procedure,
          nextDraft.indication
        );
      }

      return nextDraft;
    });
  };

  const updateObstetricDraftField = <K extends keyof ObstetricJournalDraft>(
    field: K,
    value: ObstetricJournalDraft[K]
  ) => {
    setObstetricDraft((current) => {
      const nextDraft: ObstetricJournalDraft = {
        ...current,
        [field]: value,
      };

      if (field === 'gesture' && value !== 'Extraction instrumentales') {
        nextDraft.instrumentalExtraction = null;
        nextDraft.vacuumType = null;
        nextDraft.forcepsType = null;
      }

      if (
        field === 'instrumentalExtraction' &&
        value !== 'Ventouse'
      ) {
        nextDraft.vacuumType = null;
      }

      if (
        field === 'instrumentalExtraction' &&
        value !== 'Forceps'
      ) {
        nextDraft.forcepsType = null;
      }

      return nextDraft;
    });
  };

  const setChecklistLevel = (stepId: string, level: ChecklistLevel) => {
    setDraft((current) => ({
      ...current,
      checklist: {
        ...current.checklist,
        [stepId]: level,
      },
    }));
  };

  const setAllChecklistLevels = (level: ChecklistLevel) => {
    setDraft((current) => ({
      ...current,
      checklist: (() => {
        const nextChecklist = createEmptyChecklist();
        const checklistSteps = getChecklistStepsForIntervention(
          current.procedure,
          current.indication,
          current.approach,
          current.entryTechnique,
          customSurgicalInterventions
        );

        checklistSteps.forEach((step) => {
          nextChecklist[step.id] = level;
        });

        return nextChecklist;
      })(),
    }));
  };

  return (
    <AppContext.Provider
      value={{
        screen,
        isAuthenticated,
        isAdmin,
        isSenior,
        sessionRole,
        summaryMode,
        preBlockContext,
        internalProfiles,
        selectedInternal,
        selectedSenior,
        draft,
        obstetricDraft,
        lastSavedIntervention,
        savedInterventions,
        savedObstetricGestures,
        notebookDocuments,
        customSurgicalInterventions,
        customSeniors,
        adminTrophies,
        adminTrophyStorageWarning,
        passwordChangeChallenge: passwordChangeChallengeState
          ? {
              loginId: passwordChangeChallengeState.loginId,
              role: passwordChangeChallengeState.role,
              userLabel: passwordChangeChallengeState.userLabel,
            }
          : null,
        selectableSeniors,
        surgicalProcedureOptions,
        formMissingFields,
        checklistProgress,
        historyNavigationDate,
        historyNavigationView,
        login,
        logout,
        cancelPasswordChangeChallenge,
        completePasswordChangeChallenge,
        goToSurgeryPortal,
        goToObstetricJournal,
        goToSurgeryHistory,
        clearHistoryNavigationDate,
        goToTrophies,
        goToProfile,
        goToNotebook,
        goToPreBlock,
        goToForm,
        goToChecklist,
        goToSummary,
        backToForm,
        backToChecklist,
        backToWelcome,
        startNewIntervention,
        saveIntervention,
        saveObstetricGesture,
        createInternalProfile,
        updateInternalProfile,
        updateInternalCredentials,
        updateInternalProfileSettings,
        createSeniorProfile,
        updateSeniorProfile,
        updateSeniorCredentials,
        updateSeniorManagedInternals,
        deleteSeniorProfile,
        createSurgicalIntervention,
        updateSurgicalIntervention,
        deleteCustomSurgicalIntervention,
        deleteInternalProfile,
        deleteSavedInterventions,
        setAdminTrophies,
        updateNotebookDocument,
        clearNotebookDocument,
        updateSavedInterventionAutonomyScore,
        updateDraftField,
        updateObstetricDraftField,
        setChecklistLevel,
        setAllChecklistLevels,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context = useContext(AppContext);

  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }

  return context;
}
