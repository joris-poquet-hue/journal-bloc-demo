import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

import {
  allChecklistSteps,
  getFixedContextForIntervention,
  getChecklistStepsForIntervention,
  getInternalByCredentials,
  internalProfiles as seededInternalProfiles,
  isAdminCredentials,
  normalizeCredentialValue,
  seededSavedInterventions,
} from '../data/mockData';
import {
  AppScreen,
  ChecklistLevel,
  CreateInternalProfileInput,
  CreateInternalProfileResult,
  InterventionDraft,
  InternalProfile,
  SavedIntervention,
  SessionRole,
  SummaryMode,
} from '../types';
import { getTodayIsoDate } from '../utils/date';
import { canSaveIntervention, getChecklistProgress, getMissingFormFields } from '../utils/validation';

type AppContextValue = {
  screen: AppScreen;
  isAuthenticated: boolean;
  isAdmin: boolean;
  sessionRole: SessionRole | null;
  summaryMode: SummaryMode;
  internalProfiles: InternalProfile[];
  selectedInternal: InternalProfile | null;
  draft: InterventionDraft;
  lastSavedIntervention: SavedIntervention | null;
  savedInterventions: SavedIntervention[];
  formMissingFields: string[];
  checklistProgress: ReturnType<typeof getChecklistProgress>;
  login: (loginId: string, password: string) => boolean;
  logout: () => void;
  goToBadges: () => void;
  goToPreBlock: () => void;
  goToForm: () => void;
  goToChecklist: () => void;
  goToSummary: () => void;
  backToForm: () => void;
  backToWelcome: () => void;
  startNewIntervention: () => void;
  saveIntervention: () => SavedIntervention | null;
  createInternalProfile: (
    input: CreateInternalProfileInput
  ) => CreateInternalProfileResult;
  deleteInternalProfile: (profileId: string) => void;
  deleteSavedInterventions: (ids: string[]) => void;
  updateDraftField: <K extends keyof InterventionDraft>(
    field: K,
    value: InterventionDraft[K]
  ) => void;
  setChecklistLevel: (stepId: string, level: ChecklistLevel) => void;
  setAllChecklistLevels: (level: ChecklistLevel) => void;
};

const AppContext = createContext<AppContextValue | undefined>(undefined);

const INTERNAL_PROFILES_STORAGE_KEY = 'journal-bord:internal-profiles:v2';
const SAVED_INTERVENTIONS_STORAGE_KEY = 'journal-bord:saved-interventions:v2';

function hydrateInternalProfiles(profiles: InternalProfile[]) {
  return profiles.map((profile) => ({
    ...profile,
    lastLoginAt: profile.lastLoginAt ?? null,
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
    procedure: 'salpingectomie',
    indication: null,
    indicationComment: '',
    approach: null,
    entryTechnique: null,
    laterality: null,
    context: null,
    complexity: null,
    role: null,
    checklist: createEmptyChecklist(),
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [screen, setScreen] = useState<AppScreen>('welcome');
  const [sessionRole, setSessionRole] = useState<SessionRole | null>(null);
  const [summaryMode, setSummaryMode] = useState<SummaryMode>('review');
  const [internalProfiles, setInternalProfiles] = useState<InternalProfile[]>(() =>
    hydrateInternalProfiles(
      loadStoredArray<InternalProfile>(
        INTERNAL_PROFILES_STORAGE_KEY,
        seededInternalProfiles
      )
    )
  );
  const [selectedInternalId, setSelectedInternalId] = useState<string | null>(null);
  const [draft, setDraft] = useState<InterventionDraft>(createInitialDraft(null));
  const [lastSavedIntervention, setLastSavedIntervention] =
    useState<SavedIntervention | null>(null);
  const [savedInterventions, setSavedInterventions] = useState<SavedIntervention[]>(() =>
    loadStoredArray<SavedIntervention>(
      SAVED_INTERVENTIONS_STORAGE_KEY,
      seededSavedInterventions
    )
  );
  const selectedInternal =
    internalProfiles.find((profile) => profile.id === selectedInternalId) ?? null;

  const formMissingFields = getMissingFormFields(draft);
  const checklistProgress = getChecklistProgress(draft);
  const isAuthenticated = sessionRole !== null;
  const isAdmin = sessionRole === 'admin';

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      INTERNAL_PROFILES_STORAGE_KEY,
      JSON.stringify(internalProfiles)
    );
  }, [internalProfiles]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      SAVED_INTERVENTIONS_STORAGE_KEY,
      JSON.stringify(savedInterventions)
    );
  }, [savedInterventions]);

  const login = (loginId: string, password: string) => {
    if (isAdminCredentials(loginId, password)) {
      setSessionRole('admin');
      setSelectedInternalId(null);
      setDraft(createInitialDraft(null));
      setLastSavedIntervention(null);
      setSummaryMode('review');
      setScreen('admin');

      return true;
    }

    const profile = getInternalByCredentials(loginId, password, internalProfiles);

    if (!profile) {
      return false;
    }

    const lastLoginAt = new Date().toISOString();

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
    setSessionRole('internal');
    setSelectedInternalId(profile.id);
    setDraft(createInitialDraft(profile.id));
    setLastSavedIntervention(null);
    setSummaryMode('review');
    setScreen('welcome');

    return true;
  };

  const logout = () => {
    setSessionRole(null);
    setSelectedInternalId(null);
    setDraft(createInitialDraft(null));
    setLastSavedIntervention(null);
    setSummaryMode('review');
    setScreen('welcome');
  };

  const goToForm = () => {
    if (!selectedInternal) {
      return;
    }

    setSummaryMode('review');
    setScreen('form');
  };

  const goToBadges = () => {
    if (!selectedInternal) {
      return;
    }

    setScreen('badges');
  };

  const goToPreBlock = () => {
    setScreen('preblock');
  };

  const goToChecklist = () => {
    if (formMissingFields.length > 0) {
      return;
    }

    const checklistSteps = getChecklistStepsForIntervention(
      draft.procedure,
      draft.indication,
      draft.approach,
      draft.entryTechnique
    );

    if (checklistSteps.length === 0) {
      setSummaryMode('review');
      setScreen('summary');
      return;
    }

    setScreen('checklist');
  };

  const goToSummary = () => {
    const internalId = draft.internalId ?? selectedInternal?.id ?? null;

    if (!internalId || !draft.seniorId || !canSaveIntervention(draft)) {
      return;
    }

    setSummaryMode('review');
    setScreen('summary');
  };

  const backToForm = () => {
    setSummaryMode('review');
    setScreen('form');
  };

  const backToWelcome = () => {
    setSummaryMode('review');
    setScreen(sessionRole === 'admin' ? 'admin' : 'welcome');
  };

  const startNewIntervention = () => {
    setDraft(createInitialDraft(selectedInternal?.id ?? null));
    setSummaryMode('review');
    setScreen(selectedInternal ? 'form' : 'welcome');
  };

  const saveIntervention = () => {
    const internalId = draft.internalId ?? selectedInternal?.id ?? null;

    if (!internalId || !draft.seniorId || !canSaveIntervention(draft)) {
      return null;
    }

    const intervention: SavedIntervention = {
      ...draft,
      context:
        getFixedContextForIntervention(draft.procedure, draft.indication) ??
        draft.context,
      internalId,
      id: `${Date.now()}`,
      savedAt: new Date().toISOString(),
    };

    setSavedInterventions((current) => [intervention, ...current]);
    setLastSavedIntervention(intervention);
    setSummaryMode('confirmed');
    setScreen('summary');

    return intervention;
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

    if (
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
      password: sanitizedInput.password,
      promotion: sanitizedInput.promotion,
      semester: sanitizedInput.semester,
      currentRotation: sanitizedInput.currentRotation,
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
    setLastSavedIntervention((current) =>
      current && current.internalId === profileId ? null : current
    );
    setSelectedInternalId((current) => (current === profileId ? null : current));
    setDraft((current) =>
      current.internalId === profileId ? createInitialDraft(null) : current
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

      if (field === 'procedure' && value === 'colpoclesis') {
        nextDraft.indication = null;
        nextDraft.indicationComment = '';
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

      if (field === 'procedure' || field === 'indication') {
        nextDraft.context = getFixedContextForIntervention(
          nextDraft.procedure,
          nextDraft.indication
        );
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
          current.entryTechnique
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
        sessionRole,
        summaryMode,
        internalProfiles,
        selectedInternal,
        draft,
        lastSavedIntervention,
        savedInterventions,
        formMissingFields,
        checklistProgress,
        login,
        logout,
        goToBadges,
        goToPreBlock,
        goToForm,
        goToChecklist,
        goToSummary,
        backToForm,
        backToWelcome,
        startNewIntervention,
        saveIntervention,
        createInternalProfile,
        deleteInternalProfile,
        deleteSavedInterventions,
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
