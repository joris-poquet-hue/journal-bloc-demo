import {
  createContext,
  type Dispatch,
  ReactNode,
  type SetStateAction,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  ADMIN_LOGIN_ID,
  formatDisplayName,
  formatSeniorDisplayName,
  getChoiceLabel,
  getChecklistStepsForIntervention,
  getProcedureOptions,
  getSelectableSeniors,
  getSurgicalInterventionDefinition,
  isApproachAllowedForIndication,
  normalizeCredentialValue,
} from '../data/mockData';
import {
  CHECKLIST_PREVIEW_INTERNAL,
  CHECKLIST_PREVIEW_INTERVENTION,
  CHECKLIST_PREVIEW_SENIOR,
  createChecklistPreviewDraft,
  isNativeAppShell,
  shouldEnableChecklistPreview,
} from './appContextPreview';
import {
  createActivityLogEntryId,
  createEmptyChecklist,
  createInitialDraft,
  createSavedInterventionId,
  evaluationsArrayToRecord,
  getAvailableApproachesForDraft,
  hydrateAdminTrophies,
  hydrateCustomSeniors,
  hydrateInternalProfile,
  hydrateInternalProfiles,
  hydrateNotebookDocuments,
  hydrateSavedInterventions,
  hydrateSurgicalInterventionDefinitions,
  isValidContactEmail,
  mergeRecordsById,
  sanitizeContactEmail,
  toBackendProfileFromLogin,
  toInternalProfile,
  toLocalActivityEntry,
  toLocalNotebookDocument,
  toLocalSavedIntervention,
  toSeniorProfile,
  upsertSeniorRecord,
} from './appContextModel';
import {
  ActivityAnalyticsEvent,
  ActivityLogEntry,
  AdminInterventionEvaluation,
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
  Institution,
  NotebookDocument,
  InternalProfile,
  SavedIntervention,
  Senior,
  SessionRole,
  SurgicalInterventionDefinition,
  SummaryMode,
  TrophyAward,
  UpdateInternalCredentialsInput,
  UpdateInternalCredentialsResult,
  UpdateInternalProfileSettingsInput,
  UpdateInternalProfileSettingsResult,
  UpdateSeniorCredentialsInput,
  UpdateSeniorCredentialsResult,
} from '../types';
import {
  buildSurgicalInterventionDefinitionFromInput,
  ensureSurgicalInterventionDefinitionShape,
} from '../utils/surgicalInterventions';
import { canSaveIntervention, getChecklistProgress, getMissingFormFields } from '../utils/validation';
import {
  archiveBackendInstitution,
  createBackendInstitution,
  createBackendInterventionWithEvaluationRequest,
  createBackendActivityLogEntry,
  deletePendingBackendIntervention,
  deleteBackendSurgicalDefinition,
  replaceBackendSeniorAssignments,
  saveBackendSurgicalDefinition,
  saveBackendTrophyDefinition,
  deleteBackendTrophyDefinition,
  completeBackendPasswordSetup,
  isDurableBackendConfigured,
  loadBackendBootstrapPayload,
  loadBackendProfileByAuthUserId,
  loadBackendTrophyAwards,
  deleteBackendUserNotification,
  markAllBackendUserNotificationsRead,
  markBackendTrophyNotificationCelebrated,
  markBackendUserNotificationRead,
  moveBackendProfileToInstitution,
  recordBackendProfileLogin,
  renameBackendInstitution,
  replaceOwnBackendSeniorAssignments,
  saveBackendEvaluation,
  upsertBackendNotebookDocument,
  updateOwnBackendProfileSettings,
} from '../services/backendRepository';
import {
  consumeSupabaseAuthCallback,
  requestSupabaseEmailChange,
  requestSupabasePasswordRecovery,
  restoreSupabaseSession,
  setSupabaseAccessToken,
  getSupabaseSession,
  signInWithSupabaseLoginId,
  signOutFromSupabase,
  startApplicationSessionActivityTracking,
  subscribeToBackendRealtime,
  updateSupabasePassword,
} from '../services/supabaseClient';
import type {
  BackendBootstrapPayload,
  BackendProfile,
  BackendUserNotification,
} from '../shared/backendTypes';
import {
  createAdminAccount,
  deactivateAdminAccount,
  regenerateAdminAccessKey,
  updateAdminAccount,
} from '../services/adminAccountService';
import { cleanupTrophyImages } from '../services/trophyImageStorage';
import { validatePasswordStrength } from '../utils/passwordPolicy';
import {
  createSerializedAsyncQueue,
  type SerializedAsyncQueue,
} from '../utils/serializedAsyncQueue';
import {
  ALL_KNOWN_LEGACY_STORAGE_KEYS,
  cleanupKnownLegacyBusinessStorage,
} from '../utils/legacyNotebookRecovery';
import {
  clearAllOfflineInterventionDrafts,
  clearOfflineInterventionDraft,
  isMeaningfulInterventionDraft,
  readOfflineInterventionDraft,
  writeOfflineInterventionDraft,
} from '../utils/offlineInterventionDraft';
import { sanitizeNotebookHtml } from '../utils/notebookHtml';

const TROPHY_TIER_RANK = {
  bronze: 0,
  silver: 1,
  gold: 2,
  diamond: 3,
} as const;

function getTrophyAwardKey(award: TrophyAward) {
  return `${award.profileId}:${award.trophyId}:${award.tier ?? 'bronze'}`;
}

type AppContextValue = {
  screen: AppScreen;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSenior: boolean;
  sessionRole: SessionRole | null;
  summaryMode: SummaryMode;
  historyNavigationView: 'calendar' | 'progress' | null;
  historyNavigationInterventionId: string | null;
  trophyNavigationId: string | null;
  internalProfiles: InternalProfile[];
  institutions: Institution[];
  selectedInternal: InternalProfile | null;
  selectedSenior: Senior | null;
  draft: InterventionDraft;
  offlineDraftRecovery: {
    draft: InterventionDraft;
    updatedAt: string;
  } | null;
  offlineDraftStatus: 'error' | 'idle' | 'loading' | 'saved' | 'saving';
  isOnline: boolean;
  lastSavedIntervention: SavedIntervention | null;
  savedInterventions: SavedIntervention[];
  activityLog: ActivityLogEntry[];
  notebookDocuments: NotebookDocument[];
  customSurgicalInterventions: SurgicalInterventionDefinition[];
  customSeniors: Senior[];
  adminEvaluations: Record<string, AdminInterventionEvaluation>;
  adminTrophies: AdminTrophyDefinition[];
  trophyAwards: TrophyAward[];
  userNotifications: BackendUserNotification[];
  trophyCelebration: {
    awardedAt: string;
    imageSrc: string | null;
    notificationId: string | null;
    tierLabel: string | null;
    title: string;
  } | null;
  adminTrophyStorageWarning: string | null;
  persistentSyncWarning: string | null;
  passwordChangeChallenge: {
    contactEmail: string;
    isFirstLogin: boolean;
    loginId: string;
    role: SessionRole;
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
    status:
      | 'authenticated'
      | 'error'
      | 'password-change-required';
  }>;
  logout: () => Promise<void>;
  recordActivity: (
    action: string,
    targetType: string,
    targetLabel: string,
    analyticsEvent?: ActivityAnalyticsEvent | null
  ) => void;
  startInterventionFormAnalyticsSession: () => void;
  registerInterventionFormInteraction: () => void;
  completeInterventionFormAnalyticsSession: (procedureLabel: string) => void;
  cancelInterventionFormAnalyticsSession: () => void;
  cancelPasswordChangeChallenge: () => void;
  completePasswordChangeChallenge: (
    contactEmail: string,
    currentPassword: string,
    nextPassword: string,
    confirmPassword: string
  ) => Promise<{
    message: string;
    requiresLogin?: boolean;
    success: boolean;
  }>;
  requestEmailChange: (
    contactEmail: string,
    currentPassword: string
  ) => Promise<{
    message: string;
    success: boolean;
  }>;
  requestPasswordRecovery: (loginId: string) => Promise<{
    message: string;
    success: boolean;
  }>;
  goToSurgeryPortal: () => void;
  historyNavigationDate: string | null;
  clearHistoryNavigationDate: () => void;
  clearTrophyNavigationId: () => void;
  goToSurgeryHistory: (
    targetDate?: string,
    targetView?: 'calendar' | 'progress',
    targetInterventionId?: string
  ) => void;
  goToTrophies: (targetTrophyId?: string) => void;
  goToProfile: () => void;
  goToNotebook: () => void;
  goToPreBlock: () => void;
  goToForm: () => void;
  goToContextVariables: () => void;
  goToSummary: () => void;
  backToForm: () => void;
  backToContextVariables: () => void;
  backToWelcome: () => void;
  startNewIntervention: () => void;
  restoreOfflineInterventionDraft: () => void;
  discardOfflineInterventionDraft: () => Promise<void>;
  saveIntervention: () => Promise<SavedIntervention | null>;
  refreshBackendData: () => Promise<void>;
  markUserNotificationRead: (notificationId: string) => Promise<void>;
  markAllUserNotificationsRead: () => Promise<void>;
  deleteUserNotification: (notificationId: string) => Promise<void>;
  createInstitution: (name: string) => Promise<Institution>;
  renameInstitution: (
    institutionId: string,
    name: string,
    expectedVersion: number
  ) => Promise<Institution>;
  archiveInstitution: (
    institutionId: string,
    expectedVersion: number
  ) => Promise<Institution>;
  createInternalProfile: (
    input: CreateInternalProfileInput
  ) => Promise<CreateInternalProfileResult>;
  updateInternalProfile: (
    profileId: string,
    input: CreateInternalProfileInput
  ) => Promise<CreateInternalProfileResult>;
  updateInternalCredentials: (
    profileId: string,
    input: UpdateInternalCredentialsInput
  ) => Promise<UpdateInternalCredentialsResult>;
  updateInternalProfileSettings: (
    profileId: string,
    input: UpdateInternalProfileSettingsInput
  ) => Promise<UpdateInternalProfileSettingsResult>;
  createSeniorProfile: (
    input: CreateSeniorProfileInput
  ) => Promise<CreateSeniorProfileResult>;
  regenerateAccessKey: (
    profileId: string,
    expectedVersion: number
  ) => Promise<{
    accessKey: string;
    auditWarning: string | null;
  }>;
  updateSeniorProfile: (
    seniorId: string,
    input: CreateSeniorProfileInput
  ) => Promise<CreateSeniorProfileResult>;
  updateSeniorCredentials: (
    seniorId: string,
    input: UpdateSeniorCredentialsInput
  ) => Promise<UpdateSeniorCredentialsResult>;
  updateSeniorManagedInternals: (
    seniorId: string,
    internalIds: string[]
  ) => Promise<void>;
  deactivateSeniorProfile: (seniorId: string) => Promise<void>;
  createSurgicalIntervention: (
    input: CreateSurgicalInterventionInput
  ) => Promise<CreateSurgicalInterventionResult>;
  updateSurgicalIntervention: (
    interventionId: InterventionType,
    input: CreateSurgicalInterventionInput
  ) => Promise<CreateSurgicalInterventionResult>;
  deleteCustomSurgicalIntervention: (interventionId: string) => Promise<void>;
  deactivateInternalProfile: (profileId: string) => Promise<void>;
  deletePendingIntervention: (interventionId: string) => Promise<void>;
  saveSeniorEvaluation: (
    evaluation: AdminInterventionEvaluation
  ) => Promise<void>;
  setAdminTrophies: Dispatch<SetStateAction<AdminTrophyDefinition[]>>;
  saveAdminTrophy: (
    trophy: AdminTrophyDefinition
  ) => Promise<AdminTrophyDefinition>;
  deleteAdminTrophy: (trophyId: string) => Promise<void>;
  dismissTrophyCelebration: () => void;
  updateNotebookDocument: (
    contentHtml: string,
    expectedVersion?: number
  ) => Promise<NotebookDocument>;
  clearNotebookDocument: (expectedVersion?: number) => Promise<NotebookDocument>;
  updateDraftField: <K extends keyof InterventionDraft>(
    field: K,
    value: InterventionDraft[K]
  ) => void;
  setChecklistLevel: (stepId: string, level: ChecklistLevel) => void;
  setAllChecklistLevels: (level: ChecklistLevel) => void;
};

const AppContext = createContext<AppContextValue | undefined>(undefined);

const BACKEND_REALTIME_DEBOUNCE_MS = 250;
const BACKEND_RECONCILIATION_INTERVAL_MS = 5_000;
const RESET_LOCAL_STATE_QUERY_PARAM = 'reset-local-state';
const RESERVED_ADMIN_LOGIN_IDS = new Set([
  'admin',
  normalizeCredentialValue(ADMIN_LOGIN_ID),
]);
type SyncIssueKey = 'activity_log' | 'notebook_documents';

const SYNC_ISSUE_MESSAGES: Record<SyncIssueKey, string> = {
  notebook_documents:
    'Le bloc-notes n’a pas été enregistré sur le serveur. Le contenu reste temporairement visible dans cette page ; vérifie la connexion puis réessaie.',
  activity_log:
    'Le journal d’activité n’a pas pu être enregistré sur le serveur. Vérifie la connexion avant de recharger.',
};

type PasswordChangeChallengeState = {
  contactEmail: string;
  loginId: string;
  reason: 'forced' | 'recovery';
  role: SessionRole;
  userId: string;
  userLabel: string;
};

export function AppProvider({ children }: { children: ReactNode }) {
  const isChecklistPreviewEnabled = shouldEnableChecklistPreview();

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      cleanupKnownLegacyBusinessStorage();
    } catch {
      // Le stockage local reste inactif même si le navigateur refuse le nettoyage.
    }

    const url = new URL(window.location.href);

    if (url.searchParams.get(RESET_LOCAL_STATE_QUERY_PARAM) !== '1') {
      return;
    }

    ALL_KNOWN_LEGACY_STORAGE_KEYS.forEach((storageKey) => {
      window.localStorage.removeItem(storageKey);
    });

    url.searchParams.delete(RESET_LOCAL_STATE_QUERY_PARAM);
    window.location.replace(url.toString());
  }, []);

  const [screen, setScreen] = useState<AppScreen>(
    isChecklistPreviewEnabled ? 'context-variables' : 'welcome'
  );
  const [historyNavigationDate, setHistoryNavigationDate] = useState<string | null>(
    null
  );
  const [historyNavigationView, setHistoryNavigationView] = useState<
    'calendar' | 'progress' | null
  >(null);
  const [historyNavigationInterventionId, setHistoryNavigationInterventionId] =
    useState<string | null>(null);
  const [trophyNavigationId, setTrophyNavigationId] = useState<string | null>(null);
  const [sessionRole, setSessionRole] = useState<SessionRole | null>(
    isChecklistPreviewEnabled ? 'internal' : null
  );
  const [summaryMode, setSummaryMode] = useState<SummaryMode>('review');
  const [internalProfiles, setInternalProfiles] = useState<InternalProfile[]>(() =>
    isChecklistPreviewEnabled
      ? hydrateInternalProfiles([CHECKLIST_PREVIEW_INTERNAL])
      : []
  );
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [selectedInternalId, setSelectedInternalId] = useState<string | null>(
    isChecklistPreviewEnabled ? CHECKLIST_PREVIEW_INTERNAL.id : null
  );
  const [selectedSeniorId, setSelectedSeniorId] = useState<string | null>(
    isChecklistPreviewEnabled ? CHECKLIST_PREVIEW_SENIOR.id : null
  );
  const [durableInternalProfileId, setDurableInternalProfileId] = useState<
    string | null
  >(null);
  const [activeAdminProfileId, setActiveAdminProfileId] = useState<string | null>(
    null
  );
  const [draft, setDraft] = useState<InterventionDraft>(
    isChecklistPreviewEnabled ? createChecklistPreviewDraft() : createInitialDraft(null)
  );
  const [offlineDraftRecovery, setOfflineDraftRecovery] = useState<{
    draft: InterventionDraft;
    updatedAt: string;
  } | null>(null);
  const [offlineDraftStatus, setOfflineDraftStatus] = useState<
    AppContextValue['offlineDraftStatus']
  >('idle');
  const [offlineDraftHydratedProfileId, setOfflineDraftHydratedProfileId] =
    useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === 'undefined' ? true : navigator.onLine
  );
  const [lastSavedIntervention, setLastSavedIntervention] =
    useState<SavedIntervention | null>(null);
  const [savedInterventions, setSavedInterventions] =
    useState<SavedIntervention[]>([]);
  const [notebookDocuments, setNotebookDocuments] =
    useState<NotebookDocument[]>([]);
  const [customSurgicalInterventions, setCustomSurgicalInterventions] =
    useState<SurgicalInterventionDefinition[]>(() =>
      isChecklistPreviewEnabled
        ? hydrateSurgicalInterventionDefinitions([CHECKLIST_PREVIEW_INTERVENTION])
        : []
    );
  const [customSeniors, setCustomSeniors] = useState<Senior[]>(() =>
    isChecklistPreviewEnabled
      ? hydrateCustomSeniors([CHECKLIST_PREVIEW_SENIOR])
      : []
  );
  const [adminEvaluations, setAdminEvaluations] =
    useState<Record<string, AdminInterventionEvaluation>>({});
  const [adminTrophies, setAdminTrophies] = useState<AdminTrophyDefinition[]>(() =>
    hydrateAdminTrophies([])
  );
  const [trophyAwards, setTrophyAwards] = useState<TrophyAward[]>([]);
  const [userNotifications, setUserNotifications] = useState<
    BackendUserNotification[]
  >([]);
  const [trophyCelebration, setTrophyCelebration] = useState<
    AppContextValue['trophyCelebration']
  >(null);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>([]);
  const [adminTrophyStorageWarning, setAdminTrophyStorageWarning] = useState<
    string | null
  >(null);
  const interventionFormAnalyticsSessionRef = useRef<{
    clickCount: number;
    sessionId: string;
    startedAt: string;
  } | null>(null);
  const pendingInterventionSaveRef = useRef<{
    draftSignature: string;
    intervention: SavedIntervention;
  } | null>(null);
  const offlineDraftWriteGenerationRef = useRef(0);
  const offlineDraftPendingWritesRef = useRef<Promise<unknown>>(Promise.resolve());
  const backendRefreshPromiseRef = useRef<Promise<void> | null>(null);
  const backendRefreshIdentityRef = useRef<string | null>(null);
  const activeBackendIdentityRef = useRef<string | null>(null);
  const notebookDocumentsRef = useRef(notebookDocuments);
  const notebookSaveGenerationRef = useRef(0);
  const notebookSaveQueueRef = useRef<SerializedAsyncQueue | null>(null);
  const knownTrophyAwardKeysRef = useRef<Set<string>>(new Set());
  const seenTrophyNotificationIdsRef = useRef<Set<string>>(new Set());
  const activeTrophyNotificationIdRef = useRef<string | null>(null);

  if (!notebookSaveQueueRef.current) {
    notebookSaveQueueRef.current = createSerializedAsyncQueue();
  }
  const [persistentSyncIssues, setPersistentSyncIssues] = useState<
    Partial<Record<SyncIssueKey, string>>
  >({});
  const [passwordChangeChallengeState, setPasswordChangeChallengeState] =
    useState<PasswordChangeChallengeState | null>(null);
  const [backendRefreshWarning, setBackendRefreshWarning] = useState<string | null>(
    null
  );
  const selectedInternal =
    internalProfiles.find((profile) => profile.id === selectedInternalId) ?? null;
  const selectableSeniors = getSelectableSeniors(customSeniors);
  const selectedSenior =
    selectableSeniors.find((senior) => senior.id === selectedSeniorId) ?? null;
  const surgicalProcedureOptions = getProcedureOptions(customSurgicalInterventions);

  useEffect(() => {
    const updateConnectionState = () => setIsOnline(navigator.onLine);

    window.addEventListener('online', updateConnectionState);
    window.addEventListener('offline', updateConnectionState);

    return () => {
      window.removeEventListener('online', updateConnectionState);
      window.removeEventListener('offline', updateConnectionState);
    };
  }, []);

  useEffect(() => {
    offlineDraftWriteGenerationRef.current += 1;
    setOfflineDraftRecovery(null);
    setOfflineDraftHydratedProfileId(null);

    if (sessionRole !== 'internal' || !durableInternalProfileId) {
      setOfflineDraftStatus('idle');
      return;
    }

    const profileId = durableInternalProfileId;
    let cancelled = false;
    setOfflineDraftStatus('loading');

    void readOfflineInterventionDraft(profileId)
      .then((recovery) => {
        if (cancelled) {
          return;
        }

        if (recovery && isMeaningfulInterventionDraft(recovery.draft)) {
          setOfflineDraftRecovery(recovery);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOfflineDraftStatus('error');
        }
      })
      .finally(() => {
        if (!cancelled) {
          setOfflineDraftHydratedProfileId(profileId);
          setOfflineDraftStatus((current) =>
            current === 'error' ? current : 'idle'
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [durableInternalProfileId, sessionRole]);

  useEffect(() => {
    if (
      sessionRole !== 'internal' ||
      !durableInternalProfileId ||
      offlineDraftHydratedProfileId !== durableInternalProfileId ||
      offlineDraftRecovery
    ) {
      return;
    }

    const profileId = durableInternalProfileId;
    const generation = offlineDraftWriteGenerationRef.current + 1;
    offlineDraftWriteGenerationRef.current = generation;
    const hasContent = isMeaningfulInterventionDraft(draft);

    if (hasContent) {
      setOfflineDraftStatus('saving');
    }

    const saveTimer = window.setTimeout(() => {
      const operation = offlineDraftPendingWritesRef.current
        .catch(() => undefined)
        .then(() =>
          hasContent
            ? writeOfflineInterventionDraft(profileId, draft)
            : clearOfflineInterventionDraft(profileId).then(() => null)
        );
      offlineDraftPendingWritesRef.current = operation;

      void operation
        .then(() => {
          if (generation === offlineDraftWriteGenerationRef.current) {
            setOfflineDraftStatus(hasContent ? 'saved' : 'idle');
          }
        })
        .catch(() => {
          if (generation === offlineDraftWriteGenerationRef.current) {
            setOfflineDraftStatus('error');
          }
        });
    }, 600);

    return () => window.clearTimeout(saveTimer);
  }, [
    draft,
    durableInternalProfileId,
    offlineDraftHydratedProfileId,
    offlineDraftRecovery,
    sessionRole,
  ]);

  const seedTrophyAwards = useCallback((nextAwards: TrophyAward[]) => {
    knownTrophyAwardKeysRef.current = new Set(
      nextAwards.map(getTrophyAwardKey)
    );
    setTrophyAwards(nextAwards);
  }, []);

  const reconcileTrophyAwards = useCallback(
    (
      nextAwards: TrophyAward[],
      activeInternalId: string,
      trophyDefinitions: AdminTrophyDefinition[],
      notifications: BackendUserNotification[] = []
    ) => {
    const previousKeys = knownTrophyAwardKeysRef.current;
    const newAwards = nextAwards
      .filter(
        (award) =>
          award.profileId === activeInternalId &&
          !previousKeys.has(getTrophyAwardKey(award))
      )
      .sort((left, right) => {
        return (
          TROPHY_TIER_RANK[right.tier ?? 'bronze'] -
            TROPHY_TIER_RANK[left.tier ?? 'bronze'] ||
          right.awardedAt.localeCompare(left.awardedAt)
        );
      });

    knownTrophyAwardKeysRef.current = new Set(
      nextAwards.map(getTrophyAwardKey)
    );
    setTrophyAwards(nextAwards);

    const latestAward = newAwards[0];

    if (!latestAward) {
      return;
    }

    const definition = trophyDefinitions.find(
      (trophy) => trophy.id === latestAward.trophyId
    );

    if (!definition) {
      return;
    }

    const tierLabel =
      latestAward.tier === 'silver'
        ? 'Argent'
        : latestAward.tier === 'gold'
          ? 'Or'
          : latestAward.tier === 'diamond'
            ? 'Diamant'
            : definition.format === 'levels'
              ? 'Bronze'
              : null;
    const imageSrc =
      definition.format === 'levels'
        ? definition.images[latestAward.tier ?? 'bronze']
        : definition.images.single;
    const notification =
      notifications.find(
        (candidate) =>
          candidate.kind === 'trophy_awarded' &&
          !candidate.celebratedAt &&
          candidate.trophyId === latestAward.trophyId &&
          (candidate.tier ?? 'bronze') ===
            (latestAward.tier ?? 'bronze') &&
          !seenTrophyNotificationIdsRef.current.has(candidate.id)
      ) ?? null;

    if (notification) {
      seenTrophyNotificationIdsRef.current.add(notification.id);
    }
    activeTrophyNotificationIdRef.current = notification?.id ?? null;

    setTrophyCelebration({
      awardedAt: latestAward.awardedAt,
      imageSrc,
      notificationId: notification?.id ?? null,
      tierLabel,
      title: definition.title,
    });
    },
    []
  );

  const dismissTrophyCelebration = useCallback(() => {
    const notificationId = activeTrophyNotificationIdRef.current;
    activeTrophyNotificationIdRef.current = null;
    setTrophyCelebration(null);

    if (notificationId) {
      void markBackendTrophyNotificationCelebrated(notificationId).catch((error) => {
        console.warn('Unable to mark the trophy celebration as shown.', error);
      });
    }
  }, []);

  const showLatestUnreadTrophyNotification = useCallback(
    (
      notifications: BackendUserNotification[],
      awards: TrophyAward[],
      definitions: AdminTrophyDefinition[]
    ) => {
      notifications.forEach((candidate) => {
        if (candidate.kind !== 'trophy_awarded' || candidate.celebratedAt) {
          return;
        }
        const hasAward = awards.some(
          (award) =>
            award.trophyId === candidate.trophyId &&
            (award.tier ?? 'bronze') === (candidate.tier ?? 'bronze')
        );
        const hasActiveDefinition = definitions.some(
          (definition) =>
            definition.id === candidate.trophyId &&
            definition.status === 'active'
        );

        if (
          !seenTrophyNotificationIdsRef.current.has(candidate.id) &&
          (!hasAward || !hasActiveDefinition)
        ) {
          seenTrophyNotificationIdsRef.current.add(candidate.id);
          void markBackendTrophyNotificationCelebrated(candidate.id).catch(() => {
            // A later refresh can retry without exposing an obsolete trophy.
          });
        }
      });

      const notification = notifications.find(
        (candidate) =>
          candidate.kind === 'trophy_awarded' &&
          !candidate.celebratedAt &&
          !seenTrophyNotificationIdsRef.current.has(candidate.id) &&
          awards.some(
            (award) =>
              award.trophyId === candidate.trophyId &&
              (award.tier ?? 'bronze') === (candidate.tier ?? 'bronze')
          )
      );

      if (!notification) {
        return;
      }

      const definition = definitions.find(
        (candidate) =>
          candidate.id === notification.trophyId &&
          candidate.status === 'active'
      );

      if (!definition) {
        return;
      }

      const tier = notification.tier ?? 'bronze';
      const imageSrc =
        definition.format === 'levels'
          ? definition.images[tier]
          : definition.images.single;
      const tierLabel =
        definition.format !== 'levels'
          ? null
          : tier === 'silver'
            ? 'Argent'
            : tier === 'gold'
              ? 'Or'
              : tier === 'diamond'
                ? 'Diamant'
                : 'Bronze';

      seenTrophyNotificationIdsRef.current.add(notification.id);
      activeTrophyNotificationIdRef.current = notification.id;
      setTrophyCelebration({
        awardedAt: notification.createdAt,
        imageSrc,
        notificationId: notification.id,
        tierLabel,
        title: definition.title,
      });
    },
    []
  );

  const formMissingFields = getMissingFormFields(
    draft,
    customSurgicalInterventions
  );
  const checklistProgress = getChecklistProgress(
    draft,
    customSurgicalInterventions
  );
  const persistentSyncWarning =
    backendRefreshWarning ?? Object.values(persistentSyncIssues)[0] ?? null;
  const isAuthenticated = sessionRole !== null;
  const isAdmin = sessionRole === 'admin';
  const isSenior = sessionRole === 'senior';

  const applyPersistentSyncStatus = (
    key: SyncIssueKey,
    isSaved: boolean
  ) => {
    setPersistentSyncIssues((current) => {
      if (isSaved) {
        if (!(key in current)) {
          return current;
        }

        const nextIssues = { ...current };
        delete nextIssues[key];
        return nextIssues;
      }

      return {
        ...current,
        [key]: SYNC_ISSUE_MESSAGES[key],
      };
    });
  };

  const appendActivityLogEntry = (
    actor: {
      id: string;
      label: string;
      role: SessionRole;
    },
    action: string,
    targetType: string,
    targetLabel: string,
    analyticsEvent?: ActivityAnalyticsEvent | null,
    createdAt?: string
  ) => {
    const timestamp = createdAt ?? new Date().toISOString();
    const entry: ActivityLogEntry = {
      id: createActivityLogEntryId(),
      actorId: actor.id,
      actorRole: actor.role,
      actorLabel: actor.label,
      action,
      targetType,
      targetLabel,
      createdAt: timestamp,
      updatedAt: timestamp,
      version: 1,
      analyticsEvent: analyticsEvent ?? null,
    };

    setActivityLog((current) => [entry, ...current].slice(0, 150));
    void createBackendActivityLogEntry({
      ...entry,
      profileId: actor.id,
      version: 1,
    })
      .then((savedEntry) => {
        if (!savedEntry) {
          return;
        }

        setActivityLog((current) =>
          current.map((storedEntry) =>
            storedEntry.id === entry.id
              ? toLocalActivityEntry(savedEntry)
              : storedEntry
          )
        );
        applyPersistentSyncStatus('activity_log', true);
      })
      .catch((error) => {
        console.warn('Durable backend activity sync failed', error);
        applyPersistentSyncStatus('activity_log', false);
      });
  };

  const getCurrentActivityActor = () => {
    if (sessionRole === 'internal' && selectedInternal) {
      return {
        id: selectedInternal.id,
        label: formatDisplayName(selectedInternal.firstName, selectedInternal.lastName),
        role: 'internal' as const,
      };
    }

    if (sessionRole === 'senior' && selectedSenior) {
      return {
        id: selectedSenior.id,
        label: formatSeniorDisplayName(selectedSenior),
        role: 'senior' as const,
      };
    }

    if (sessionRole === 'admin') {
      return {
        id: 'admin',
        label: 'Admin',
        role: 'admin' as const,
      };
    }

    return null;
  };

  const recordActivity = (
    action: string,
    targetType: string,
    targetLabel: string,
    analyticsEvent?: ActivityAnalyticsEvent | null
  ) => {
    const actor = getCurrentActivityActor();

    if (!actor) {
      return;
    }

    appendActivityLogEntry(
      actor,
      action,
      targetType,
      targetLabel,
      analyticsEvent
    );
  };

  const startInterventionFormAnalyticsSession = () => {
    interventionFormAnalyticsSessionRef.current = {
      clickCount: 1,
      sessionId: createSavedInterventionId(),
      startedAt: new Date().toISOString(),
    };
  };

  const registerInterventionFormInteraction = () => {
    const currentSession = interventionFormAnalyticsSessionRef.current;

    if (!currentSession) {
      return;
    }

    interventionFormAnalyticsSessionRef.current = {
      ...currentSession,
      clickCount: currentSession.clickCount + 1,
    };
  };

  const completeInterventionFormAnalyticsSession = (procedureLabel: string) => {
    const currentSession = interventionFormAnalyticsSessionRef.current;

    if (!currentSession) {
      return;
    }

    const completedAt = new Date().toISOString();
    const durationMs =
      new Date(completedAt).getTime() - new Date(currentSession.startedAt).getTime();

    interventionFormAnalyticsSessionRef.current = null;

    if (!Number.isNaN(durationMs) && durationMs >= 0) {
      recordActivity(
        'Mesure interne du formulaire intervention',
        'Analytics',
        procedureLabel,
        {
          clickCount: currentSession.clickCount,
          completedAt,
          durationMs,
          kind: 'intervention_form',
          sessionId: currentSession.sessionId,
        }
      );
    }
  };

  const cancelInterventionFormAnalyticsSession = () => {
    interventionFormAnalyticsSessionRef.current = null;
  };

  useEffect(() => {
    notebookDocumentsRef.current = notebookDocuments;
  }, [notebookDocuments]);

  const applyBackendBootstrapForInternal = (
    profile: InternalProfile,
    payload: BackendBootstrapPayload,
    previousTrophyAwards?: TrophyAward[]
  ) => {
    const backendDefinitions = payload.referenceData.surgicalInterventions;
    const backendSeniors = payload.referenceData.seniors;
    const backendInterventions = payload.userData.savedInterventions.map(
      (intervention) => toLocalSavedIntervention(intervention, profile.id)
    );
    const backendNotebookDocuments = payload.userData.notebookDocuments.map(
      (document) => toLocalNotebookDocument(document, profile.id)
    );
    const hydratedNotebookDocuments = hydrateNotebookDocuments(
      backendNotebookDocuments
    );
    const backendActivityLog = payload.userData.activityLog.map(
      toLocalActivityEntry
    );

    setCustomSurgicalInterventions(
      hydrateSurgicalInterventionDefinitions(backendDefinitions)
    );
    setInstitutions(payload.referenceData.institutions);
    setCustomSeniors(hydrateCustomSeniors(backendSeniors));
    setSavedInterventions(hydrateSavedInterventions(backendInterventions));
    notebookDocumentsRef.current = hydratedNotebookDocuments;
    setNotebookDocuments(hydratedNotebookDocuments);
    setActivityLog(
      backendActivityLog.sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt)
      )
    );
    setAdminEvaluations(
      evaluationsArrayToRecord(payload.userData.evaluations)
    );
    setAdminTrophies(
      hydrateAdminTrophies(payload.referenceData.trophyDefinitions)
    );
    setUserNotifications(payload.userData.userNotifications);
    if (previousTrophyAwards) {
      knownTrophyAwardKeysRef.current = new Set(
        previousTrophyAwards.map(getTrophyAwardKey)
      );
      reconcileTrophyAwards(
        payload.userData.trophyAwards,
        profile.id,
        payload.referenceData.trophyDefinitions,
        payload.userData.userNotifications
      );
    } else {
      seedTrophyAwards(payload.userData.trophyAwards);
      showLatestUnreadTrophyNotification(
        payload.userData.userNotifications,
        payload.userData.trophyAwards,
        payload.referenceData.trophyDefinitions
      );
    }
  };

  const authenticateInternal = (profile: InternalProfile, lastLoginAt: string) => {
    activeBackendIdentityRef.current = `internal:${profile.id}`;
    setInternalProfiles((current) =>
      current.map((existingProfile) =>
        existingProfile.id === profile.id
          ? {
              ...existingProfile,
              lastLoginAt,
            }
          : existingProfile
      )
    );
    setPasswordChangeChallengeState(null);
    setSessionRole('internal');
    setSelectedInternalId(profile.id);
    setSelectedSeniorId(null);
    setDurableInternalProfileId(profile.id);
    setActiveAdminProfileId(null);
    setDraft(createInitialDraft(profile.id));
    setLastSavedIntervention(null);
    setSummaryMode('review');
    setScreen('welcome');
  };

  const authenticateSenior = (senior: Senior, lastLoginAt: string) => {
    activeBackendIdentityRef.current = `senior:${senior.id}`;
    setCustomSeniors((current) =>
      current.map((existingSenior) =>
        existingSenior.id === senior.id
          ? {
              ...existingSenior,
              lastLoginAt,
            }
          : existingSenior
      )
    );
    setPasswordChangeChallengeState(null);
    setSessionRole('senior');
    setSelectedInternalId(null);
    setSelectedSeniorId(senior.id);
    setActiveAdminProfileId(null);
    setDraft(createInitialDraft(null));
    setLastSavedIntervention(null);
    setSummaryMode('review');
    setScreen('admin');
  };

  const authenticateAdmin = (profileId: string) => {
    activeBackendIdentityRef.current = `admin:${profileId}`;
    setPasswordChangeChallengeState(null);
    setSessionRole('admin');
    setSelectedInternalId(null);
    setSelectedSeniorId(null);
    setDurableInternalProfileId(null);
    setActiveAdminProfileId(profileId);
    setDraft(createInitialDraft(null));
    setLastSavedIntervention(null);
    setSummaryMode('review');
    setScreen('admin');
  };

  const activateBackendProfile = async (
    backendProfile: BackendProfile,
    options: {
      forcePasswordChangeReason?: 'forced' | 'recovery' | null;
      recordLogin?: boolean;
      skipPasswordChallenge?: boolean;
    } = {}
  ) => {
    if (backendProfile.role === 'admin' && isNativeAppShell()) {
      activeBackendIdentityRef.current = null;
      await signOutFromSupabase({ scope: 'current' });
      setSupabaseAccessToken(null);
      setPasswordChangeChallengeState(null);
      setSessionRole(null);
      setSelectedInternalId(null);
      setSelectedSeniorId(null);
      setScreen('welcome');
      return 'native-admin-blocked' as const;
    }

    const awardsBeforeLogin =
      options.recordLogin && backendProfile.role === 'internal'
        ? await loadBackendTrophyAwards([backendProfile.id])
        : undefined;

    if (options.recordLogin) {
      await recordBackendProfileLogin();
      backendProfile = {
        ...backendProfile,
        lastLoginAt: new Date().toISOString(),
        loginCount: backendProfile.loginCount + 1,
      };
    }

    const challengeReason =
      options.forcePasswordChangeReason ??
      (backendProfile.mustChangePassword ? 'forced' : null);

    if (challengeReason && !options.skipPasswordChallenge) {
      activeBackendIdentityRef.current = null;
      setPasswordChangeChallengeState({
        contactEmail:
          challengeReason === 'forced'
            ? backendProfile.contactEmail ?? ''
            : backendProfile.contactEmail ??
              getSupabaseSession()?.user.email ??
              '',
        loginId: backendProfile.loginId,
        reason: challengeReason,
        role: backendProfile.role,
        userId: backendProfile.id,
        userLabel: formatDisplayName(
          backendProfile.firstName,
          backendProfile.lastName
        ),
      });
      setSessionRole(null);
      setSelectedInternalId(null);
      setSelectedSeniorId(null);
      setScreen('welcome');
      return 'password-change-required' as const;
    }

    const lastLoginAt = backendProfile.lastLoginAt ?? new Date().toISOString();

    if (backendProfile.role === 'internal') {
      const profile = toInternalProfile(backendProfile);
      setInternalProfiles((current) => mergeRecordsById(current, [profile]));

      const payload = await loadBackendBootstrapPayload(
        backendProfile.id,
        undefined,
        backendProfile
      );

      if (!payload) {
        throw new Error('Aucune donnée Interne reçue du serveur.');
      }

      applyBackendBootstrapForInternal(profile, payload, awardsBeforeLogin);

      authenticateInternal(profile, lastLoginAt);
      return 'authenticated' as const;
    }

    if (backendProfile.role === 'senior') {
      let senior = toSeniorProfile(backendProfile);
      const payload = await loadBackendBootstrapPayload(
        backendProfile.id,
        undefined,
        backendProfile
      );

      if (!payload) {
        throw new Error('Aucune donnée Senior reçue du serveur.');
      }

      senior = {
        ...senior,
        managedInternalIds: payload.userData.managedInternalIds,
      };
      setCustomSurgicalInterventions(
        hydrateSurgicalInterventionDefinitions(
          payload.referenceData.surgicalInterventions
        )
      );
      setInstitutions(payload.referenceData.institutions);
      setSavedInterventions(
        hydrateSavedInterventions(payload.userData.savedInterventions)
      );
      setAdminEvaluations(
        evaluationsArrayToRecord(payload.userData.evaluations)
      );
      setAdminTrophies(
        hydrateAdminTrophies(payload.referenceData.trophyDefinitions)
      );
      seedTrophyAwards(payload.userData.trophyAwards);
      setActivityLog(payload.userData.activityLog.map(toLocalActivityEntry));
      setUserNotifications(payload.userData.userNotifications);

      const visibleInternals = payload.userData.directoryProfiles
        .filter((profile) => profile.role === 'internal')
        .map(toInternalProfile);

      setInternalProfiles(visibleInternals);

      setCustomSeniors([senior]);
      authenticateSenior(senior, lastLoginAt);
      return 'authenticated' as const;
    }

    const payload = await loadBackendBootstrapPayload(
      backendProfile.id,
      undefined,
      backendProfile
    );

    if (
      !payload ||
      payload.userData.profile.id !== backendProfile.id ||
      payload.userData.profile.role !== 'admin'
    ) {
      throw new Error(
        'Chargement complet de l’espace Administrateur impossible. La connexion a été refusée pour éviter un état partiel.'
      );
    }

    const durableInternals = payload.userData.directoryProfiles
      .filter((profile) => profile.role === 'internal')
      .map(toInternalProfile);
    const durableSeniors = payload.userData.directoryProfiles
      .filter((profile) => profile.role === 'senior')
      .map((profile) => ({
        ...toSeniorProfile(profile),
        managedInternalIds: payload.userData.seniorAssignments
          .filter(
            (assignment) => assignment.seniorProfileId === profile.id
          )
          .map((assignment) => assignment.internalProfileId),
      }));

    setInternalProfiles(durableInternals);
    setCustomSeniors(durableSeniors);

    setCustomSurgicalInterventions(
      hydrateSurgicalInterventionDefinitions(
        payload.referenceData.surgicalInterventions
      )
    );
    setInstitutions(payload.referenceData.institutions);
    setSavedInterventions(
      hydrateSavedInterventions(payload.userData.savedInterventions)
    );
    setNotebookDocuments(
      hydrateNotebookDocuments(payload.userData.notebookDocuments)
    );
    setAdminEvaluations(
      evaluationsArrayToRecord(payload.userData.evaluations)
    );
    setAdminTrophies(
      hydrateAdminTrophies(payload.referenceData.trophyDefinitions)
    );
    seedTrophyAwards(payload.userData.trophyAwards);
    setActivityLog(payload.userData.activityLog.map(toLocalActivityEntry));
    setUserNotifications([]);

    authenticateAdmin(backendProfile.id);
    return 'authenticated' as const;
  };

  const activateBackendProfileRef = useRef(activateBackendProfile);
  activateBackendProfileRef.current = activateBackendProfile;

  const refreshBackendData = useCallback(async () => {
    const activeProfileId =
      sessionRole === 'internal'
        ? durableInternalProfileId
        : sessionRole === 'senior'
          ? selectedSeniorId
          : sessionRole === 'admin'
            ? activeAdminProfileId
            : null;

    if (!activeProfileId) {
      return;
    }

    const refreshIdentity = `${sessionRole}:${activeProfileId}`;

    if (
      backendRefreshPromiseRef.current &&
      backendRefreshIdentityRef.current === refreshIdentity
    ) {
      return backendRefreshPromiseRef.current;
    }

    const refreshPromise = (async () => {
      if (sessionRole === 'internal') {
        const payload = await loadBackendBootstrapPayload(activeProfileId);

        if (!payload) {
          throw new Error('Aucune donnée Interne reçue du serveur.');
        }

        if (activeBackendIdentityRef.current !== refreshIdentity) {
          return;
        }

        const profile = toInternalProfile(payload.userData.profile);
        const backendInterventions = payload.userData.savedInterventions.map(
          (intervention) => toLocalSavedIntervention(intervention, profile.id)
        );
        const backendNotebookDocuments = payload.userData.notebookDocuments.map(
          (document) => toLocalNotebookDocument(document, profile.id)
        );
        const hydratedNotebookDocuments = hydrateNotebookDocuments(
          backendNotebookDocuments
        );

        setInternalProfiles([profile]);
        setCustomSurgicalInterventions(
          hydrateSurgicalInterventionDefinitions(
            payload.referenceData.surgicalInterventions
          )
        );
        setInstitutions(payload.referenceData.institutions);
        setCustomSeniors(hydrateCustomSeniors(payload.referenceData.seniors));
        setSavedInterventions(hydrateSavedInterventions(backendInterventions));
        notebookDocumentsRef.current = hydratedNotebookDocuments;
        setNotebookDocuments(hydratedNotebookDocuments);
        setAdminEvaluations(
          evaluationsArrayToRecord(payload.userData.evaluations)
        );
        setAdminTrophies(
          hydrateAdminTrophies(payload.referenceData.trophyDefinitions)
        );
        reconcileTrophyAwards(
          payload.userData.trophyAwards,
          profile.id,
          payload.referenceData.trophyDefinitions,
          payload.userData.userNotifications
        );
        setUserNotifications(payload.userData.userNotifications);
        setActivityLog(
          payload.userData.activityLog
            .map(toLocalActivityEntry)
            .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        );
      } else if (sessionRole === 'senior') {
        const payload = await loadBackendBootstrapPayload(activeProfileId);

        if (!payload) {
          throw new Error('Aucune donnée Senior reçue du serveur.');
        }

        if (activeBackendIdentityRef.current !== refreshIdentity) {
          return;
        }

        const senior = {
          ...toSeniorProfile(payload.userData.profile),
          managedInternalIds: payload.userData.managedInternalIds,
        };

        setInternalProfiles(
          payload.userData.directoryProfiles
            .filter((profile) => profile.role === 'internal')
            .map(toInternalProfile)
        );
        setCustomSeniors([senior]);
        setCustomSurgicalInterventions(
          hydrateSurgicalInterventionDefinitions(
            payload.referenceData.surgicalInterventions
          )
        );
        setInstitutions(payload.referenceData.institutions);
        setSavedInterventions(
          hydrateSavedInterventions(payload.userData.savedInterventions)
        );
        setAdminEvaluations(
          evaluationsArrayToRecord(payload.userData.evaluations)
        );
        setAdminTrophies(
          hydrateAdminTrophies(payload.referenceData.trophyDefinitions)
        );
        seedTrophyAwards(payload.userData.trophyAwards);
        setUserNotifications(payload.userData.userNotifications);
        setActivityLog(payload.userData.activityLog.map(toLocalActivityEntry));
      } else if (sessionRole === 'admin') {
        const payload = await loadBackendBootstrapPayload(activeProfileId);

        if (!payload || payload.userData.profile.role !== 'admin') {
          throw new Error(
            'L’actualisation complète de l’espace Administrateur a échoué.'
          );
        }

        if (activeBackendIdentityRef.current !== refreshIdentity) {
          return;
        }

        setInternalProfiles(
          payload.userData.directoryProfiles
            .filter((profile) => profile.role === 'internal')
            .map(toInternalProfile)
        );
        setCustomSeniors(
          payload.userData.directoryProfiles
            .filter((profile) => profile.role === 'senior')
            .map((profile) => ({
              ...toSeniorProfile(profile),
              managedInternalIds: payload.userData.seniorAssignments
                .filter(
                  (assignment) => assignment.seniorProfileId === profile.id
                )
                .map((assignment) => assignment.internalProfileId),
            }))
        );
        setInstitutions(payload.referenceData.institutions);
        setCustomSurgicalInterventions(
          hydrateSurgicalInterventionDefinitions(
            payload.referenceData.surgicalInterventions
          )
        );
        setSavedInterventions(
          hydrateSavedInterventions(payload.userData.savedInterventions)
        );
        setNotebookDocuments([]);
        setAdminEvaluations(
          evaluationsArrayToRecord(payload.userData.evaluations)
        );
        setAdminTrophies(
          hydrateAdminTrophies(payload.referenceData.trophyDefinitions)
        );
        seedTrophyAwards(payload.userData.trophyAwards);
        setActivityLog(payload.userData.activityLog.map(toLocalActivityEntry));
        setUserNotifications([]);
      }

      setBackendRefreshWarning(null);
    })();

    backendRefreshPromiseRef.current = refreshPromise;
    backendRefreshIdentityRef.current = refreshIdentity;

    try {
      await refreshPromise;
    } catch (error) {
      if (activeBackendIdentityRef.current === refreshIdentity) {
        setBackendRefreshWarning(
          'Les données n’ont pas pu être actualisées depuis le serveur. Vérifie la connexion puis réessaie.'
        );
      }
      throw error;
    } finally {
      if (backendRefreshPromiseRef.current === refreshPromise) {
        backendRefreshPromiseRef.current = null;
        backendRefreshIdentityRef.current = null;
      }
    }
  }, [
    activeAdminProfileId,
    durableInternalProfileId,
    reconcileTrophyAwards,
    selectedSeniorId,
    seedTrophyAwards,
    sessionRole,
  ]);

  const markUserNotificationRead = useCallback(
    async (notificationId: string) => {
      await markBackendUserNotificationRead(notificationId);
      const readAt = new Date().toISOString();
      setUserNotifications((current) =>
        current.flatMap((notification) => {
          if (notification.id !== notificationId) {
            return [notification];
          }

          return notification.deletionPolicy === 'on_read'
            ? []
            : [{ ...notification, readAt }];
        })
      );
    },
    []
  );

  const markAllUserNotificationsRead = useCallback(async () => {
    await markAllBackendUserNotificationsRead();
    const readAt = new Date().toISOString();
    setUserNotifications((current) =>
      current.flatMap((notification) => {
        if (notification.readAt) {
          return [notification];
        }

        return notification.deletionPolicy === 'on_read'
          ? []
          : [{ ...notification, readAt }];
      })
    );
  }, []);

  const deleteUserNotification = useCallback(
    async (notificationId: string) => {
      await deleteBackendUserNotification(notificationId);
      setUserNotifications((current) =>
        current.filter((notification) => notification.id !== notificationId)
      );
    },
    []
  );

  const login = async (loginId: string, password: string) => {
    activeBackendIdentityRef.current = null;
    setSupabaseAccessToken(null);
    setDurableInternalProfileId(null);
    setPersistentSyncIssues({});
    setBackendRefreshWarning(null);
    pendingInterventionSaveRef.current = null;

    if (!isDurableBackendConfigured()) {
      return {
        message: 'L’authentification sécurisée n’est pas configurée sur ce déploiement.',
        status: 'error',
      } as const;
    }

    try {
      const loginResult = await signInWithSupabaseLoginId(loginId, password);

      const { profile: loginProfile } = loginResult;

      if (loginProfile.mustChangePassword) {
        activeBackendIdentityRef.current = null;
        setPasswordChangeChallengeState({
          contactEmail: loginProfile.contactEmail ?? '',
          loginId: loginProfile.loginId,
          reason: 'forced',
          role: loginProfile.role,
          userId: loginProfile.id,
          userLabel: formatDisplayName(
            loginProfile.firstName,
            loginProfile.lastName
          ),
        });
        setSessionRole(null);
        setSelectedInternalId(null);
        setSelectedSeniorId(null);
        setScreen('welcome');
        return { status: 'password-change-required' } as const;
      }

      const backendProfile = toBackendProfileFromLogin(loginProfile);

      const status = await activateBackendProfile(backendProfile, {
        recordLogin: true,
      });

      if (status === 'native-admin-blocked') {
        return {
          message:
            "L'administration est disponible uniquement depuis la version web sur ordinateur.",
          status: 'error',
        } as const;
      }

      return { status } as const;
    } catch (error) {
      await signOutFromSupabase({ scope: 'current' }).catch(() => undefined);
      setSupabaseAccessToken(null);
      const status =
        typeof error === 'object' && error && 'status' in error
          ? Number(error.status)
          : 0;
      const authenticationErrorMessage =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : '';
      const isIncompleteAdminBootstrap =
        error instanceof Error &&
        error.message.startsWith(
          'Chargement complet de l’espace Administrateur impossible.'
        );

      return {
        message:
          isIncompleteAdminBootstrap
            ? error.message
            : status === 403
              ? authenticationErrorMessage ||
                'Confirme d’abord ton adresse e-mail avec le lien reçu pour activer ton compte.'
            : status === 429
            ? 'Trop de tentatives. Réessaie dans quelques minutes.'
            : status === 400 || status === 401
              ? 'Identifiant ou mot de passe incorrect.'
              : 'Connexion au service sécurisé impossible. Vérifie le réseau puis réessaie.',
        status: 'error',
      } as const;
    }
  };

  const cancelPasswordChangeChallenge = () => {
    setPasswordChangeChallengeState(null);
    void signOutFromSupabase({ scope: 'current' }).catch((error) => {
      console.warn('Unable to clean up the current application session.', error);
    });
    setPersistentSyncIssues({});
  };

  const completePasswordChangeChallenge = async (
    contactEmail: string,
    currentPassword: string,
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

    const sanitizedPassword = nextPassword;
    const sanitizedConfirmation = confirmPassword;
    const sanitizedContactEmail = sanitizeContactEmail(contactEmail);

    if (!sanitizedContactEmail) {
      return {
        message: 'Renseigne une adresse e-mail de contact.',
        success: false,
      };
    }

    if (!isValidContactEmail(sanitizedContactEmail)) {
      return {
        message: 'L’adresse e-mail renseignée n’est pas valide.',
        success: false,
      };
    }

    const passwordValidation = validatePasswordStrength(sanitizedPassword);

    if (!passwordValidation.isValid) {
      return {
        message: passwordValidation.message,
        success: false,
      };
    }

    if (sanitizedPassword !== sanitizedConfirmation) {
      return {
        message: 'La confirmation du nouveau mot de passe ne correspond pas.',
        success: false,
      };
    }

    try {
      if (challenge.reason === 'forced' && !currentPassword) {
        return {
          message:
            'La session de première connexion a expiré. Reconnecte-toi avec la clé provisoire.',
          success: false,
        };
      }

      if (challenge.reason === 'forced') {
        const confirmationRequest = await updateSupabasePassword(
          currentPassword,
          sanitizedPassword,
          {
            completeSetupContactEmail: sanitizedContactEmail,
          }
        );
        setPasswordChangeChallengeState(null);
        setPersistentSyncIssues({});

        setSupabaseAccessToken(null);
        return {
          message:
            confirmationRequest.message ||
            'Un lien de confirmation vient d’être envoyé. Ouvre-le pour activer ton compte et accéder à ton espace.',
          requiresLogin: true,
          success: true,
        };
      } else {
        await updateSupabasePassword(null, sanitizedPassword);
        await completeBackendPasswordSetup(sanitizedContactEmail);
      }

      const session = await restoreSupabaseSession();
      const backendProfile = session
        ? await loadBackendProfileByAuthUserId(session.user.id)
        : null;

      if (!backendProfile) {
        throw new Error('Profil introuvable après la modification du mot de passe.');
      }

      await activateBackendProfile(backendProfile, {
        skipPasswordChallenge: true,
      });

      return {
        message: 'Mot de passe mis à jour. Connexion en cours...',
        success: true,
      };
    } catch (error) {
      console.error('Unable to complete password setup.', error);
      const errorMessage =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : '';

      return {
        message:
          errorMessage ||
          'Le mot de passe n’a pas pu être mis à jour. Reconnecte-toi et réessaie.',
        success: false,
      };
    }
  };

  const requestEmailChange = async (
    contactEmail: string,
    currentPassword: string
  ) => {
    const sanitizedContactEmail = sanitizeContactEmail(contactEmail);

    if (!sanitizedContactEmail || !isValidContactEmail(sanitizedContactEmail)) {
      return {
        message: 'L’adresse e-mail renseignée n’est pas valide.',
        success: false,
      };
    }

    if (!currentPassword) {
      return {
        message: 'Renseigne ton mot de passe actuel.',
        success: false,
      };
    }

    try {
      const result = await requestSupabaseEmailChange(
        currentPassword,
        sanitizedContactEmail
      );

      return {
        message:
          result.message ||
          'Un lien de confirmation vient d’être envoyé à la nouvelle adresse.',
        success: true,
      };
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : 'Le changement d’adresse e-mail n’a pas pu être demandé.';

      return { message, success: false };
    }
  };

  const requestPasswordRecovery = async (loginId: string) => {
    try {
      const message = await requestSupabasePasswordRecovery(loginId);
      return { message, success: true };
    } catch (error) {
      const status =
        typeof error === 'object' && error && 'status' in error
          ? Number(error.status)
          : 0;

      return {
        message:
          status === 429
            ? 'Trop de demandes. Réessaie dans quelques minutes.'
            : 'La demande de réinitialisation n’a pas pu être envoyée.',
        success: false,
      };
    }
  };

  const logout = async () => {
    offlineDraftWriteGenerationRef.current += 1;
    await offlineDraftPendingWritesRef.current.catch(() => undefined);
    await clearAllOfflineInterventionDrafts().catch(() => undefined);
    await signOutFromSupabase();
    cancelInterventionFormAnalyticsSession();
    activeBackendIdentityRef.current = null;
    pendingInterventionSaveRef.current = null;
    notebookSaveGenerationRef.current += 1;
    notebookSaveQueueRef.current = createSerializedAsyncQueue();
    notebookDocumentsRef.current = [];
    setDurableInternalProfileId(null);
    setActiveAdminProfileId(null);
    setPersistentSyncIssues({});
    setBackendRefreshWarning(null);
    setPasswordChangeChallengeState(null);
    setSessionRole(null);
    setSelectedInternalId(null);
    setSelectedSeniorId(null);
    setDraft(createInitialDraft(null));
    setOfflineDraftRecovery(null);
    setOfflineDraftHydratedProfileId(null);
    setOfflineDraftStatus('idle');
    setLastSavedIntervention(null);
    setInternalProfiles([]);
    setInstitutions([]);
    setSavedInterventions([]);
    setNotebookDocuments([]);
    setCustomSurgicalInterventions([]);
    setCustomSeniors([]);
    setAdminEvaluations({});
    setAdminTrophies([]);
    setTrophyAwards([]);
    setUserNotifications([]);
    knownTrophyAwardKeysRef.current = new Set();
    seenTrophyNotificationIdsRef.current = new Set();
    activeTrophyNotificationIdRef.current = null;
    setTrophyCelebration(null);
    setActivityLog([]);
    setAdminTrophyStorageWarning(null);
    setSummaryMode('review');
    setScreen('welcome');
  };

  useEffect(() => {
    const handleExpiredSession = () => {
      window.location.reload();
    };
    const stopActivityTracking = startApplicationSessionActivityTracking();

    window.addEventListener('monjdb:session-expired', handleExpiredSession);

    return () => {
      stopActivityTracking();
      window.removeEventListener(
        'monjdb:session-expired',
        handleExpiredSession
      );
    };
  }, []);

  useEffect(() => {
    if (isChecklistPreviewEnabled || !isDurableBackendConfigured()) {
      return;
    }

    let isCancelled = false;

    const restoreAuthentication = async () => {
      try {
        const callback = await consumeSupabaseAuthCallback();

        if (callback?.requiresLogin) {
          return;
        }

        const session = callback?.session ?? (await restoreSupabaseSession());

        if (!session || isCancelled) {
          return;
        }

        const backendProfile = await loadBackendProfileByAuthUserId(session.user.id);

        if (!backendProfile || isCancelled) {
          await signOutFromSupabase({ scope: 'current' });
          return;
        }

        await activateBackendProfileRef.current(backendProfile, {
          forcePasswordChangeReason:
            callback?.type === 'recovery' ? 'recovery' : null,
          recordLogin: false,
        });
      } catch (error) {
        console.warn('Unable to restore the application session.', error);
        await signOutFromSupabase({ scope: 'current' }).catch(() => undefined);
      }
    };

    void restoreAuthentication();

    return () => {
      isCancelled = true;
    };
  }, [isChecklistPreviewEnabled]);

  useEffect(() => {
    if (
      (sessionRole !== 'internal' && sessionRole !== 'senior') ||
      !isDurableBackendConfigured()
    ) {
      return;
    }

    let realtimeRefreshTimer: ReturnType<typeof setTimeout> | null = null;

    const runReferenceRefresh = () => {
      void refreshBackendData().catch((error) => {
        console.warn('Unable to reconcile authenticated server data.', error);
      });
    };
    const scheduleRealtimeRefresh = () => {
      if (realtimeRefreshTimer) {
        clearTimeout(realtimeRefreshTimer);
      }

      realtimeRefreshTimer = window.setTimeout(
        runReferenceRefresh,
        BACKEND_REALTIME_DEBOUNCE_MS
      );
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        runReferenceRefresh();
      }
    };
    const unsubscribeRealtime = subscribeToBackendRealtime(
      scheduleRealtimeRefresh,
      (status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn(`Synchronisation en temps réel indisponible (${status}).`);
        }
      }
    );
    const reconciliationInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        runReferenceRefresh();
      }
    }, BACKEND_RECONCILIATION_INTERVAL_MS);

    window.addEventListener('focus', runReferenceRefresh);
    window.addEventListener('online', runReferenceRefresh);
    window.addEventListener('monjdb:app-foreground', runReferenceRefresh);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      unsubscribeRealtime();
      window.clearInterval(reconciliationInterval);

      if (realtimeRefreshTimer) {
        clearTimeout(realtimeRefreshTimer);
      }

      window.removeEventListener('focus', runReferenceRefresh);
      window.removeEventListener('online', runReferenceRefresh);
      window.removeEventListener('monjdb:app-foreground', runReferenceRefresh);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [refreshBackendData, sessionRole]);

  const goToSurgeryPortal = () => {
    if (!selectedInternal) {
      return;
    }

    setScreen('welcome');
  };

  const goToForm = () => {
    if (!selectedInternal) {
      return;
    }

    startInterventionFormAnalyticsSession();
    setDraft(createInitialDraft(selectedInternal.id));
    setSummaryMode('review');
    setScreen('form');
  };

  const goToSurgeryHistory = (
    targetDate?: string,
    targetView: 'calendar' | 'progress' = 'calendar',
    targetInterventionId?: string
  ) => {
    if (!selectedInternal) {
      return;
    }

    recordActivity(
      'Consultation de ses statistiques opératoires',
      'Statistiques',
      targetView === 'progress' ? 'Progression pédagogique' : 'Historique opératoire'
    );
    setHistoryNavigationDate(targetDate ?? null);
    setHistoryNavigationView(targetView);
    setHistoryNavigationInterventionId(targetInterventionId ?? null);
    setScreen('surgery-history');
  };

  const clearHistoryNavigationDate = () => {
    setHistoryNavigationDate(null);
    setHistoryNavigationView(null);
    setHistoryNavigationInterventionId(null);
  };

  const clearTrophyNavigationId = () => {
    setTrophyNavigationId(null);
  };

  const goToTrophies = (targetTrophyId?: string) => {
    if (!selectedInternal) {
      return;
    }

    recordActivity('Consultation de ses trophées', 'Trophées', 'Mes trophées');
    setTrophyNavigationId(targetTrophyId ?? null);
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

    recordActivity('Consultation de son bloc-notes', 'Bloc-notes', 'Notes personnelles');
    setScreen('notebook');
  };

  const goToPreBlock = () => {
    setScreen('preblock');
  };

  const goToContextVariables = () => {
    if (formMissingFields.length > 0) {
      return;
    }
    setScreen('context-variables');
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

  const backToContextVariables = () => {
    setSummaryMode('review');
    setScreen('context-variables');
  };

  const backToWelcome = () => {
    cancelInterventionFormAnalyticsSession();
    setSummaryMode('review');
    setScreen(
      sessionRole === 'admin'
        ? 'admin'
        : 'welcome'
    );
  };

  const startNewIntervention = () => {
    const internalId = durableInternalProfileId;

    offlineDraftWriteGenerationRef.current += 1;
    setOfflineDraftRecovery(null);
    if (internalId) {
      void offlineDraftPendingWritesRef.current
        .catch(() => undefined)
        .then(() => clearOfflineInterventionDraft(internalId))
        .catch(() => setOfflineDraftStatus('error'));
    }
    startInterventionFormAnalyticsSession();
    setDraft(createInitialDraft(selectedInternal?.id ?? null));
    setSummaryMode('review');
    setScreen(selectedInternal ? 'form' : 'welcome');
  };

  const restoreOfflineInterventionDraft = () => {
    if (
      !offlineDraftRecovery ||
      offlineDraftRecovery.draft.internalId !== durableInternalProfileId
    ) {
      return;
    }

    startInterventionFormAnalyticsSession();
    setDraft(offlineDraftRecovery.draft);
    setOfflineDraftRecovery(null);
    setOfflineDraftStatus('saved');
    setSummaryMode('review');
    setScreen('form');
  };

  const discardOfflineInterventionDraft = async () => {
    const internalId = durableInternalProfileId;

    offlineDraftWriteGenerationRef.current += 1;
    setOfflineDraftRecovery(null);
    if (internalId) {
      await offlineDraftPendingWritesRef.current.catch(() => undefined);
      await clearOfflineInterventionDraft(internalId);
    }
    setOfflineDraftStatus('idle');
  };

  const saveIntervention = async () => {
    const internalId = durableInternalProfileId;

    if (
      sessionRole !== 'internal' ||
      !internalId ||
      !draft.seniorId ||
      !canSaveIntervention(draft, customSurgicalInterventions)
    ) {
      return null;
    }

    const checklist: Record<string, ChecklistLevel | null> = {};
    const draftSignature = JSON.stringify({
      ...draft,
      checklist,
      internalId,
    });
    const pendingSave = pendingInterventionSaveRef.current;
    const intervention: SavedIntervention =
      pendingSave?.draftSignature === draftSignature
        ? pendingSave.intervention
        : {
            ...draft,
            checklist,
            clientMutationId: `web-${createSavedInterventionId()}`,
            internalId,
            id: createSavedInterventionId(),
            procedure: draft.procedure as InterventionType,
            autonomyScore: null,
            savedAt: new Date().toISOString(),
          };

    pendingInterventionSaveRef.current = {
      draftSignature,
      intervention,
    };

    if (!intervention.clientMutationId) {
      throw new Error('La tentative d’enregistrement ne possède pas d’identifiant.');
    }

    const savedIntervention = await createBackendInterventionWithEvaluationRequest({
      ...intervention,
      clientMutationId: intervention.clientMutationId,
      createdByProfileId: internalId,
      deletedAt: null,
      updatedAt: intervention.savedAt,
      updatedByProfileId: null,
      version: 0,
    });
    const confirmedIntervention = toLocalSavedIntervention(
      savedIntervention,
      internalId
    );

    pendingInterventionSaveRef.current = null;
    setBackendRefreshWarning(null);
    setSavedInterventions((current) =>
      hydrateSavedInterventions([
        confirmedIntervention,
        ...current.filter((item) => item.id !== confirmedIntervention.id),
      ])
    );
    setLastSavedIntervention(confirmedIntervention);
    offlineDraftWriteGenerationRef.current += 1;
    setOfflineDraftRecovery(null);
    await offlineDraftPendingWritesRef.current.catch(() => undefined);
    await clearOfflineInterventionDraft(internalId).catch(() => undefined);
    setDraft(createInitialDraft(internalId));
    setSummaryMode('review');
    setScreen('welcome');
    completeInterventionFormAnalyticsSession(
      getChoiceLabel(surgicalProcedureOptions, confirmedIntervention.procedure)
    );
    await refreshBackendData().catch((error) => {
      console.warn(
        'Unable to refresh trophy awards after the intervention was saved.',
        error
      );
    });

    return confirmedIntervention;
  };

  const createInstitution = async (name: string) => {
    const institution = await createBackendInstitution(name.trim());
    setInstitutions((current) =>
      [...current, institution].sort((left, right) =>
        left.name.localeCompare(right.name, 'fr')
      )
    );
    return institution;
  };

  const renameInstitution = async (
    institutionId: string,
    name: string,
    expectedVersion: number
  ) => {
    const institution = await renameBackendInstitution(
      institutionId,
      name.trim(),
      expectedVersion
    );
    setInstitutions((current) =>
      current
        .map((candidate) =>
          candidate.id === institution.id ? institution : candidate
        )
        .sort((left, right) => left.name.localeCompare(right.name, 'fr'))
    );
    setInternalProfiles((current) =>
      current.map((profile) =>
        profile.institutionId === institution.id
          ? {
              ...profile,
              institution: institution.name,
              version: (profile.version ?? 0) + 1,
            }
          : profile
      )
    );
    setCustomSeniors((current) =>
      current.map((senior) =>
        senior.institutionId === institution.id
          ? {
              ...senior,
              institution: institution.name,
              version: (senior.version ?? 0) + 1,
            }
          : senior
      )
    );
    return institution;
  };

  const archiveInstitution = async (
    institutionId: string,
    expectedVersion: number
  ) => {
    const institution = await archiveBackendInstitution(
      institutionId,
      expectedVersion
    );
    setInstitutions((current) =>
      current.map((candidate) =>
        candidate.id === institution.id ? institution : candidate
      )
    );
    return institution;
  };

  const createInternalProfile = async (
    input: CreateInternalProfileInput
  ): Promise<CreateInternalProfileResult> => {
    const sanitizedInput = {
      firstName: input.firstName.trim(),
      institutionId: input.institutionId.trim(),
      lastName: input.lastName.trim(),
      loginId: input.loginId.trim(),
      promotion: input.promotion.trim(),
      semester: input.semester.trim().toUpperCase(),
    };

    if (Object.values(sanitizedInput).some((value) => value.length === 0)) {
      return {
        success: false,
        message: 'Tous les champs du profil doivent être renseignés.',
      };
    }

    const selectedInstitution = institutions.find(
      (institution) =>
        institution.id === sanitizedInput.institutionId &&
        institution.status === 'active'
    );

    if (!selectedInstitution) {
      return {
        success: false,
        message: 'Sélectionne un établissement actif dans la liste officielle.',
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

    try {
      const accountResult = await createAdminAccount({
        ...sanitizedInput,
        role: 'internal',
      });
      const account = accountResult.profile;
      const profile = hydrateInternalProfile({
        avatarImageSrc: null,
        baselineStats: {
          primaryAssistantCount: 0,
          primaryOperatorCount: 0,
          totalInterventions: 0,
        },
        contactEmail: account.contactEmail,
        createdAt: new Date().toISOString(),
        firstName: account.firstName,
        id: account.id,
        institution: selectedInstitution.name,
        institutionId: selectedInstitution.id,
        isActive: account.isActive,
        lastLoginAt: null,
        lastName: account.lastName,
        loginCount: 0,
        loginId: account.loginId,
        mustChangePassword: true,
        promotion: sanitizedInput.promotion,
        semester: sanitizedInput.semester,
        updatedAt: account.updatedAt,
        updatedByProfileId: account.updatedByProfileId,
        version: account.version,
      });

      setInternalProfiles((current) => [profile, ...current]);
      return {
        accessKey: accountResult.accessKey ?? undefined,
        success: true,
        message:
          'Le profil interne a été créé. Copiez maintenant sa clé d’accès provisoire.',
        profile,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Création impossible.',
      };
    }
  };

  const updateInternalProfile = async (
    profileId: string,
    input: CreateInternalProfileInput
  ): Promise<CreateInternalProfileResult> => {
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
      institutionId: input.institutionId.trim(),
      lastName: input.lastName.trim(),
      loginId: input.loginId.trim(),
      promotion: input.promotion.trim(),
      semester: input.semester.trim().toUpperCase(),
    };

    const requiredValues = [
      sanitizedInput.firstName,
      sanitizedInput.lastName,
      sanitizedInput.loginId,
      sanitizedInput.institutionId,
      sanitizedInput.promotion,
      sanitizedInput.semester,
    ];

    if (requiredValues.some((value) => value.length === 0)) {
      return {
        success: false,
        message: 'Tous les champs du profil doivent être renseignés.',
      };
    }

    const selectedInstitution = institutions.find(
      (institution) =>
        institution.id === sanitizedInput.institutionId &&
        institution.status === 'active'
    );

    if (!selectedInstitution) {
      return {
        success: false,
        message: 'Sélectionne un établissement actif dans la liste officielle.',
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

    try {
      const movedProfile =
        existingProfile.institutionId !== selectedInstitution.id
          ? await moveBackendProfileToInstitution(
              profileId,
              selectedInstitution.id,
              existingProfile.version ?? 0
            )
          : null;
      const accountResult = await updateAdminAccount({
        ...sanitizedInput,
        expectedVersion: movedProfile?.version ?? existingProfile.version,
        profileId,
        role: 'internal',
      });
      const account = accountResult.profile;
      const updatedProfile: InternalProfile = {
        ...existingProfile,
        contactEmail: account.contactEmail,
        firstName: account.firstName,
        institution: selectedInstitution.name,
        institutionId: selectedInstitution.id,
        lastName: account.lastName,
        loginId: account.loginId,
        mustChangePassword: account.mustChangePassword,
        promotion: sanitizedInput.promotion,
        semester: sanitizedInput.semester,
        updatedAt: account.updatedAt,
        updatedByProfileId: account.updatedByProfileId,
        version: account.version,
      };

      setInternalProfiles((current) =>
        current.map((profile) =>
          profile.id === profileId ? updatedProfile : profile
        )
      );
      return {
        success: true,
        message: 'Le profil interne et son compte Auth ont bien été mis à jour.',
        profile: updatedProfile,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Mise à jour impossible.',
      };
    }
  };

  const updateInternalCredentials = async (
    profileId: string,
    input: UpdateInternalCredentialsInput
  ): Promise<UpdateInternalCredentialsResult> => {
    const existingProfile =
      internalProfiles.find((profile) => profile.id === profileId) ?? null;

    if (!existingProfile) {
      return {
        success: false,
        message: 'Ce profil interne est introuvable.',
      };
    }

    if (sessionRole !== 'internal' || selectedInternal?.id !== profileId) {
      return {
        success: false,
        message: 'Cette modification nécessite la session de l’interne concerné.',
      };
    }

    const passwordValidation = validatePasswordStrength(input.password);

    if (!passwordValidation.isValid) {
      return { success: false, message: passwordValidation.message };
    }

    try {
      await updateSupabasePassword(input.currentPassword ?? null, input.password);
      return {
        success: true,
        message: 'Le mot de passe a bien été modifié.',
        profile: existingProfile,
      };
    } catch {
      return {
        success: false,
        message: 'Le mot de passe actuel est incorrect ou la session a expiré.',
      };
    }
  };

  const updateInternalProfileSettings = async (
    profileId: string,
    input: UpdateInternalProfileSettingsInput
  ): Promise<UpdateInternalProfileSettingsResult> => {
    const existingProfile =
      internalProfiles.find((profile) => profile.id === profileId) ?? null;

    if (!existingProfile) {
      return {
        success: false,
        message: 'Ce profil interne est introuvable.',
      };
    }

    const hasSemesterUpdate = typeof input.semester === 'string';
    const hasAvatarUpdate = Object.prototype.hasOwnProperty.call(
      input,
      'avatarImageSrc'
    );

    if (!hasSemesterUpdate && !hasAvatarUpdate) {
      return {
        success: false,
        message: 'Aucune modification du profil n’a été transmise.',
      };
    }

    const semester = hasSemesterUpdate
      ? input.semester?.trim().toUpperCase() ?? ''
      : existingProfile.semester;

    if (hasSemesterUpdate && !semester) {
      return {
        success: false,
        message: 'Le semestre doit être renseigné.',
      };
    }

    if (!existingProfile.version) {
      return {
        success: false,
        message: 'Rechargez les données avant de modifier le profil.',
      };
    }

    try {
      const backendProfile = await updateOwnBackendProfileSettings({
        avatarImageSrc: hasAvatarUpdate
          ? input.avatarImageSrc ?? null
          : existingProfile.avatarImageSrc ?? null,
        expectedVersion: existingProfile.version,
        semester,
        updateAvatar: hasAvatarUpdate,
        updateSemester: hasSemesterUpdate,
      });
      const updatedProfile: InternalProfile = {
        ...existingProfile,
        ...toInternalProfile(backendProfile),
        baselineStats: existingProfile.baselineStats,
        loginCount: existingProfile.loginCount,
      };

      setInternalProfiles((current) =>
        current.map((profile) =>
          profile.id === profileId ? updatedProfile : profile
        )
      );

      return {
        success: true,
        message: hasSemesterUpdate
          ? 'Le semestre a bien été mis à jour.'
          : input.avatarImageSrc
            ? 'La photo de profil a bien été mise à jour.'
            : 'La photo de profil a bien été supprimée.',
        profile: updatedProfile,
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error ? error.message : 'Mise à jour impossible.',
      };
    }
  };

  const createSeniorProfile = async (
    input: CreateSeniorProfileInput
  ): Promise<CreateSeniorProfileResult> => {
    const sanitizedInput = {
      firstName: input.firstName.trim(),
      institutionId: input.institutionId.trim(),
      lastName: input.lastName.trim(),
      loginId: input.loginId.trim(),
    };

    if (Object.values(sanitizedInput).some((value) => value.length === 0)) {
      return {
        success: false,
        message: 'Tous les champs du compte senior doivent être renseignés.',
      };
    }

    const selectedInstitution = institutions.find(
      (institution) =>
        institution.id === sanitizedInput.institutionId &&
        institution.status === 'active'
    );

    if (!selectedInstitution) {
      return {
        success: false,
        message: 'Sélectionne un établissement actif dans la liste officielle.',
      };
    }

    const normalizedLoginId = normalizeCredentialValue(sanitizedInput.loginId);
    const loginAlreadyExists =
      RESERVED_ADMIN_LOGIN_IDS.has(normalizedLoginId) ||
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

    try {
      const accountResult = await createAdminAccount({
        ...sanitizedInput,
        role: 'senior',
      });
      const account = accountResult.profile;
      const senior: Senior = {
        contactEmail: account.contactEmail,
        createdAt: new Date().toISOString(),
        firstName: account.firstName,
        id: account.id,
        institution: selectedInstitution.name,
        institutionId: selectedInstitution.id,
        isActive: account.isActive,
        isCustom: true,
        lastLoginAt: null,
        lastName: account.lastName,
        loginId: account.loginId,
        managedInternalIds: [],
        mustChangePassword: true,
        updatedAt: account.updatedAt,
        updatedByProfileId: account.updatedByProfileId,
        version: account.version,
      };

      setCustomSeniors((current) => [senior, ...current]);
      return {
        accessKey: accountResult.accessKey ?? undefined,
        success: true,
        message:
          'Le compte senior a été créé. Copiez maintenant sa clé d’accès provisoire.',
        senior,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Création impossible.',
      };
    }
  };

  const updateSeniorProfile = async (
    seniorId: string,
    input: CreateSeniorProfileInput
  ): Promise<CreateSeniorProfileResult> => {
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
      institutionId: input.institutionId.trim(),
      lastName: input.lastName.trim(),
      loginId: input.loginId.trim(),
    };

    const requiredValues = [
      sanitizedInput.firstName,
      sanitizedInput.lastName,
      sanitizedInput.loginId,
      sanitizedInput.institutionId,
    ];

    if (requiredValues.some((value) => value.length === 0)) {
      return {
        success: false,
        message: 'Tous les champs du compte senior doivent être renseignés.',
      };
    }

    const selectedInstitution = institutions.find(
      (institution) =>
        institution.id === sanitizedInput.institutionId &&
        institution.status === 'active'
    );

    if (!selectedInstitution) {
      return {
        success: false,
        message: 'Sélectionne un établissement actif dans la liste officielle.',
      };
    }

    const normalizedLoginId = normalizeCredentialValue(sanitizedInput.loginId);
    const loginAlreadyExists =
      RESERVED_ADMIN_LOGIN_IDS.has(normalizedLoginId) ||
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

    try {
      const movedProfile =
        existingSenior.institutionId !== selectedInstitution.id
          ? await moveBackendProfileToInstitution(
              seniorId,
              selectedInstitution.id,
              existingSenior.version ?? 0
            )
          : null;
      const accountResult = await updateAdminAccount({
        ...sanitizedInput,
        expectedVersion: movedProfile?.version ?? existingSenior.version,
        profileId: seniorId,
        role: 'senior',
      });
      const account = accountResult.profile;
      const updatedSenior: Senior = {
        ...existingSenior,
        contactEmail: account.contactEmail,
        firstName: account.firstName,
        institution: selectedInstitution.name,
        institutionId: selectedInstitution.id,
        lastName: account.lastName,
        loginId: account.loginId,
        mustChangePassword: account.mustChangePassword,
        updatedAt: account.updatedAt,
        updatedByProfileId: account.updatedByProfileId,
        version: account.version,
      };

      setCustomSeniors((current) => upsertSeniorRecord(current, updatedSenior));
      return {
        success: true,
        message: 'Le compte senior et son accès Auth ont bien été mis à jour.',
        senior: updatedSenior,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Mise à jour impossible.',
      };
    }
  };

  const updateSeniorCredentials = async (
    seniorId: string,
    input: UpdateSeniorCredentialsInput
  ): Promise<UpdateSeniorCredentialsResult> => {
    const existingSenior =
      selectableSeniors.find((senior) => senior.id === seniorId) ?? null;

    if (!existingSenior) {
      return {
        success: false,
        message: 'Ce compte senior est introuvable.',
      };
    }

    const passwordValidation = validatePasswordStrength(input.password);

    if (!passwordValidation.isValid) {
      return { success: false, message: passwordValidation.message };
    }

    if (sessionRole === 'senior' && selectedSenior?.id === seniorId) {
      try {
        await updateSupabasePassword(input.currentPassword ?? null, input.password);
        return {
          success: true,
          message: 'Le mot de passe a bien été modifié.',
          senior: existingSenior,
        };
      } catch {
        return {
          success: false,
          message: 'Le mot de passe actuel est incorrect ou la session a expiré.',
        };
      }
    }

    return {
      success: false,
      message:
        existingSenior.mustChangePassword
          ? 'Régénérez la clé d’accès depuis la gestion des profils.'
          : 'Le senior gère son mot de passe ou utilise la récupération par e-mail.',
    };
  };

  const updateSeniorManagedInternals = async (
    seniorId: string,
    internalIds: string[]
  ) => {
    if (sessionRole !== 'admin' && sessionRole !== 'senior') {
      throw new Error('La session ne permet pas de modifier cette sélection.');
    }

    if (sessionRole === 'senior' && selectedSeniorId !== seniorId) {
      throw new Error('Un senior peut modifier uniquement sa propre sélection.');
    }

    const sanitizedInternalIds = Array.from(
      new Set(
        internalIds.filter((internalId) =>
          internalProfiles.some((profile) => profile.id === internalId)
        )
      )
    );

    let savedInternalIds =
      sessionRole === 'senior'
        ? await replaceOwnBackendSeniorAssignments(sanitizedInternalIds)
        : await replaceBackendSeniorAssignments(seniorId, sanitizedInternalIds);

    if (sessionRole === 'senior') {
      const refreshedPayload = await loadBackendBootstrapPayload(seniorId);

      if (refreshedPayload) {
        savedInternalIds = refreshedPayload.userData.managedInternalIds;
        setSavedInterventions(
          hydrateSavedInterventions(refreshedPayload.userData.savedInterventions)
        );
        setAdminEvaluations(
          evaluationsArrayToRecord(refreshedPayload.userData.evaluations)
        );
        setActivityLog(
          refreshedPayload.userData.activityLog.map(toLocalActivityEntry)
        );
      }
    }

    setCustomSeniors((current) =>
      current.map((senior) =>
        senior.id === seniorId
          ? {
              ...senior,
              managedInternalIds: savedInternalIds,
            }
          : senior
      )
    );
  };

  const regenerateAccessKey = async (
    profileId: string,
    expectedVersion: number
  ) => {
    if (sessionRole !== 'admin') {
      throw new Error('Cette opération nécessite une session administrateur.');
    }

    const result = await regenerateAdminAccessKey(profileId, expectedVersion);

    return {
      accessKey: result.accessKey,
      auditWarning: result.auditWarning,
    };
  };

  const deactivateSeniorProfile = async (seniorId: string) => {
    const senior = selectableSeniors.find((item) => item.id === seniorId);

    if (!senior?.version) {
      throw new Error('Rechargez les données avant de désactiver ce compte.');
    }

    await deactivateAdminAccount(seniorId, senior.version);
    setCustomSeniors((current) =>
      current.filter((senior) => senior.id !== seniorId)
    );
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
    const nameAlreadyExists = customSurgicalInterventions.some(
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
    const intervention = {
      ...ensureSurgicalInterventionDefinitionShape(
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
      ),
      ownerProfileId: existingIntervention?.ownerProfileId ?? null,
      updatedByProfileId: existingIntervention?.updatedByProfileId ?? null,
      version: existingIntervention?.version,
    };

    return {
      success: true,
      message: 'La définition de l’intervention est prête.',
      intervention,
    };
  };

  const createSurgicalIntervention = async (
    input: CreateSurgicalInterventionInput
  ): Promise<CreateSurgicalInterventionResult> => {
    const result = buildSurgicalInterventionDefinition(input);

    if (!result.success || !result.intervention) {
      return result;
    }

    try {
      const intervention = await saveBackendSurgicalDefinition(
        result.intervention
      );

      if (!intervention) {
        throw new Error('La définition n’a pas été retournée par le serveur.');
      }

      setCustomSurgicalInterventions((current) => [intervention, ...current]);

      return {
        success: true,
        message: 'La nouvelle intervention a bien été créée.',
        intervention,
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error ? error.message : 'Création impossible.',
      };
    }
  };

  const updateSurgicalIntervention = async (
    interventionId: InterventionType,
    input: CreateSurgicalInterventionInput
  ): Promise<CreateSurgicalInterventionResult> => {
    const result = buildSurgicalInterventionDefinition(input, interventionId);

    if (!result.success || !result.intervention) {
      return result;
    }

    try {
      const intervention = await saveBackendSurgicalDefinition(
        result.intervention
      );

      if (!intervention) {
        throw new Error('La définition n’a pas été retournée par le serveur.');
      }

      setCustomSurgicalInterventions((current) => [
        intervention,
        ...current.filter(
          (storedIntervention) => storedIntervention.id !== interventionId
        ),
      ]);

      return {
        success: true,
        message: 'L’intervention a bien été mise à jour.',
        intervention,
      };
    } catch (error) {
      return {
        success: false,
        message:
          error instanceof Error ? error.message : 'Mise à jour impossible.',
      };
    }
  };

  const deletePendingIntervention = async (interventionId: string) => {
    if (sessionRole !== 'internal' || !selectedInternal) {
      throw new Error(
        'Seul l’Interne propriétaire peut supprimer cette intervention.'
      );
    }

    const intervention = savedInterventions.find(
      (item) => item.id === interventionId
    );

    if (!intervention || intervention.internalId !== selectedInternal.id) {
      throw new Error('Cette intervention ne vous appartient pas.');
    }

    if (adminEvaluations[interventionId]) {
      throw new Error(
        'Cette intervention est déjà évaluée et ne peut plus être supprimée.'
      );
    }

    if (!intervention.version) {
      throw new Error(
        'Rechargez les données avant de supprimer cette intervention.'
      );
    }

    await deletePendingBackendIntervention(
      intervention.id,
      intervention.version
    );

    setSavedInterventions((current) =>
      current.filter((storedIntervention) => storedIntervention.id !== interventionId)
    );
    setAdminEvaluations((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([storedInterventionId]) =>
          storedInterventionId !== interventionId
        )
      )
    );
    setLastSavedIntervention((current) =>
      current?.id === interventionId ? null : current
    );
  };

  const updateNotebookDocument = (
    contentHtml: string,
    expectedVersion?: number
  ): Promise<NotebookDocument> => {
    const sanitizedContentHtml = sanitizeNotebookHtml(contentHtml);
    const internalId = selectedInternal?.id ?? null;
    const profileId = durableInternalProfileId;

    if (
      sessionRole !== 'internal' ||
      !internalId ||
      !profileId ||
      internalId !== profileId
    ) {
      return Promise.reject(
        new Error('La session Interne doit être active pour enregistrer le bloc-notes.')
      );
    }

    const expectedIdentity = `internal:${profileId}`;
    const saveGeneration = notebookSaveGenerationRef.current;
    const saveQueue = notebookSaveQueueRef.current ?? createSerializedAsyncQueue();
    notebookSaveQueueRef.current = saveQueue;

    return saveQueue
      .enqueue(async () => {
        if (
          saveGeneration !== notebookSaveGenerationRef.current ||
          activeBackendIdentityRef.current !== expectedIdentity
        ) {
          throw new Error('La session a changé avant la sauvegarde du bloc-notes.');
        }

        const existingDocument = notebookDocumentsRef.current.find(
          (document) => document.internalId === internalId
        );
        const currentVersion = existingDocument?.version ?? 0;

        if (
          expectedVersion !== undefined &&
          currentVersion !== expectedVersion
        ) {
          throw new Error(
            'Une version plus récente du bloc-notes existe sur le serveur.'
          );
        }

        const savedDocument = await upsertBackendNotebookDocument({
          contentHtml: sanitizedContentHtml,
          internalId,
          profileId,
          updatedAt: new Date().toISOString(),
          updatedByProfileId: existingDocument?.updatedByProfileId ?? null,
          version: expectedVersion ?? currentVersion,
        });

        if (!savedDocument) {
          throw new Error('Le serveur n’a pas confirmé la sauvegarde du bloc-notes.');
        }

        const confirmedDocument = toLocalNotebookDocument(
          savedDocument,
          internalId
        );

        if (
          saveGeneration !== notebookSaveGenerationRef.current ||
          activeBackendIdentityRef.current !== expectedIdentity
        ) {
          throw new Error('La session a changé pendant la sauvegarde du bloc-notes.');
        }

        const latestKnownDocument = notebookDocumentsRef.current.find(
          (document) => document.internalId === internalId
        );

        if (
          latestKnownDocument &&
          (latestKnownDocument.version ?? 0) >
            (confirmedDocument.version ?? 0)
        ) {
          throw new Error(
            'Une version plus récente du bloc-notes existe sur le serveur.'
          );
        }

        const nextDocuments = [
          confirmedDocument,
          ...notebookDocumentsRef.current.filter(
            (document) => document.internalId !== internalId
          ),
        ];
        notebookDocumentsRef.current = nextDocuments;
        setNotebookDocuments(nextDocuments);
        applyPersistentSyncStatus('notebook_documents', true);
        return confirmedDocument;
      })
      .catch((error) => {
        if (
          saveGeneration === notebookSaveGenerationRef.current &&
          activeBackendIdentityRef.current === expectedIdentity
        ) {
          console.warn('Durable backend notebook save failed', error);
          applyPersistentSyncStatus('notebook_documents', false);
        }
        throw error;
      });
  };

  const clearNotebookDocument = (expectedVersion?: number) =>
    updateNotebookDocument('', expectedVersion);

  const deleteCustomSurgicalIntervention = async (interventionId: string) => {
    const intervention = customSurgicalInterventions.find(
      (item) => item.id === interventionId
    );

    if (!intervention?.version) {
      throw new Error('Rechargez les données avant de supprimer cette définition.');
    }

    await deleteBackendSurgicalDefinition(interventionId, intervention.version);
    setCustomSurgicalInterventions((current) =>
      current.filter((intervention) => intervention.id !== interventionId)
    );
    setDraft((current) =>
      current.procedure === interventionId
        ? createInitialDraft(current.internalId)
        : current
    );
  };

  const cleanupUnusedAdminTrophyImages = async (trophyId: string) => {
    try {
      await cleanupTrophyImages(trophyId);
      setAdminTrophyStorageWarning(null);
    } catch (error) {
      console.warn('Unable to clean up unused trophy images.', error);
      setAdminTrophyStorageWarning(
        'La modification a bien été enregistrée, mais certaines anciennes images n’ont pas pu être nettoyées.'
      );
    }
  };

  const saveAdminTrophy = async (trophy: AdminTrophyDefinition) => {
    const savedTrophy = await saveBackendTrophyDefinition(trophy);

    if (!savedTrophy) {
      throw new Error('Le trophée n’a pas été retourné par le serveur.');
    }

    setAdminTrophies((current) => [
      savedTrophy,
      ...current.filter((item) => item.id !== savedTrophy.id),
    ]);
    await cleanupUnusedAdminTrophyImages(savedTrophy.id);

    if (savedTrophy.status !== 'draft') {
      await refreshBackendData();
    }

    return savedTrophy;
  };

  const deleteAdminTrophy = async (trophyId: string) => {
    const trophy = adminTrophies.find((item) => item.id === trophyId);

    if (!trophy?.version) {
      throw new Error('Rechargez les données avant de supprimer ce trophée.');
    }

    await deleteBackendTrophyDefinition(trophyId, trophy.version);
    await cleanupUnusedAdminTrophyImages(trophyId);
    setAdminTrophies((current) =>
      current.filter((item) => item.id !== trophyId)
    );
  };

  const deactivateInternalProfile = async (profileId: string) => {
    if (!profileId) {
      return;
    }

    const profile = internalProfiles.find((item) => item.id === profileId);

    if (!profile?.version) {
      throw new Error('Rechargez les données avant de désactiver ce compte.');
    }

    await deactivateAdminAccount(profileId, profile.version);
    setInternalProfiles((current) =>
      current.filter((profile) => profile.id !== profileId)
    );
    setSavedInterventions((current) =>
      current.filter((intervention) => intervention.internalId !== profileId)
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
  };

  const saveSeniorEvaluation = async (
    evaluation: AdminInterventionEvaluation
  ) => {
    if (sessionRole !== 'senior' || !selectedSeniorId) {
      throw new Error('Seul le Senior désigné peut valider cette évaluation.');
    }

    const intervention = savedInterventions.find(
      (item) => item.id === evaluation.interventionId
    );

    if (!intervention?.version) {
      throw new Error(
        'Rechargez les données avant d’enregistrer cette évaluation.'
      );
    }

    if (intervention.seniorId !== selectedSeniorId) {
      throw new Error('Cette intervention est attribuée à un autre Senior.');
    }

    const saved = await saveBackendEvaluation(
      evaluation,
      intervention.version
    );

    setAdminEvaluations((current) => ({
      ...current,
      [evaluation.interventionId]: saved.evaluation,
    }));
    setSavedInterventions((current) =>
      current.map((storedIntervention) =>
        storedIntervention.id === saved.intervention.id
          ? {
              ...saved.intervention,
              internalId: storedIntervention.internalId,
            }
          : storedIntervention
      )
    );
    setLastSavedIntervention((current) =>
      current?.id === saved.intervention.id
        ? {
            ...saved.intervention,
            internalId: current.internalId,
          }
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

      if (
        !nextDraft.approach &&
        (field === 'procedure' ||
          field === 'indication' ||
          field === 'customIndication')
      ) {
        const availableApproaches = getAvailableApproachesForDraft(
          nextDraft,
          interventionDefinition
        );

        if (availableApproaches.length === 1) {
          nextDraft.approach = availableApproaches[0];

          if (
            nextDraft.approach !== 'coelioscopie' &&
            nextDraft.approach !== 'robot'
          ) {
            nextDraft.entryTechnique = null;
          }
        }
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
        internalProfiles,
        institutions,
        selectedInternal,
        selectedSenior,
        draft,
        offlineDraftRecovery,
        offlineDraftStatus,
        isOnline,
        lastSavedIntervention,
        savedInterventions,
        activityLog,
        notebookDocuments,
        customSurgicalInterventions,
        customSeniors,
        adminEvaluations,
        adminTrophies,
        trophyAwards,
        userNotifications,
        trophyCelebration,
        adminTrophyStorageWarning,
        persistentSyncWarning,
        passwordChangeChallenge: passwordChangeChallengeState
          ? {
              contactEmail: passwordChangeChallengeState.contactEmail,
              isFirstLogin: passwordChangeChallengeState.reason === 'forced',
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
        historyNavigationInterventionId,
        trophyNavigationId,
        login,
        logout,
        recordActivity,
        startInterventionFormAnalyticsSession,
        registerInterventionFormInteraction,
        completeInterventionFormAnalyticsSession,
        cancelInterventionFormAnalyticsSession,
        cancelPasswordChangeChallenge,
        completePasswordChangeChallenge,
        requestEmailChange,
        requestPasswordRecovery,
        goToSurgeryPortal,
        goToSurgeryHistory,
        clearHistoryNavigationDate,
        clearTrophyNavigationId,
        goToTrophies,
        goToProfile,
        goToNotebook,
        goToPreBlock,
        goToForm,
        goToContextVariables,
        goToSummary,
        backToForm,
        backToContextVariables,
        backToWelcome,
        startNewIntervention,
        restoreOfflineInterventionDraft,
        discardOfflineInterventionDraft,
        saveIntervention,
        refreshBackendData,
        markUserNotificationRead,
        markAllUserNotificationsRead,
        deleteUserNotification,
        createInstitution,
        renameInstitution,
        archiveInstitution,
        createInternalProfile,
        updateInternalProfile,
        updateInternalCredentials,
        updateInternalProfileSettings,
        createSeniorProfile,
        regenerateAccessKey,
        updateSeniorProfile,
        updateSeniorCredentials,
        updateSeniorManagedInternals,
        deactivateSeniorProfile,
        createSurgicalIntervention,
        updateSurgicalIntervention,
        deleteCustomSurgicalIntervention,
        deactivateInternalProfile,
        deletePendingIntervention,
        saveSeniorEvaluation,
        setAdminTrophies,
        saveAdminTrophy,
        deleteAdminTrophy,
        dismissTrophyCelebration,
        updateNotebookDocument,
        clearNotebookDocument,
        updateDraftField,
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
