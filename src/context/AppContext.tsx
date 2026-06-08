import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

import {
  allChecklistSteps,
  defaultComplexityRating,
  getFixedContextForIntervention,
  getChecklistStepsForIntervention,
  getInternalByCredentials,
  getProcedureOptions,
  getSeniorByCredentials,
  getSeniorById,
  getSurgicalInterventionDefinitions,
  getSurgicalInterventionDefinition,
  internalProfiles as seededInternalProfiles,
  isApproachAllowedForIndication,
  isAdminCredentials,
  normalizeComplexityRating,
  normalizeCredentialValue,
  seededSavedInterventions,
} from '../data/mockData';
import {
  AppScreen,
  ChecklistLevel,
  CreateInternalProfileInput,
  CreateInternalProfileResult,
  CreateSurgicalInterventionInput,
  CreateSurgicalInterventionResult,
  InterventionDraft,
  InterventionType,
  InternalProfile,
  ObstetricJournalDraft,
  PreBlockContext,
  SavedObstetricGesture,
  SavedIntervention,
  Senior,
  SessionRole,
  SurgicalInterventionDefinition,
  SummaryMode,
} from '../types';
import { getTodayIsoDate } from '../utils/date';
import { canSaveIntervention, getChecklistProgress, getMissingFormFields } from '../utils/validation';

type AppContextValue = {
  screen: AppScreen;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isSenior: boolean;
  sessionRole: SessionRole | null;
  summaryMode: SummaryMode;
  preBlockContext: PreBlockContext;
  internalProfiles: InternalProfile[];
  selectedInternal: InternalProfile | null;
  selectedSenior: Senior | null;
  draft: InterventionDraft;
  obstetricDraft: ObstetricJournalDraft;
  lastSavedIntervention: SavedIntervention | null;
  savedInterventions: SavedIntervention[];
  savedObstetricGestures: SavedObstetricGesture[];
  customSurgicalInterventions: SurgicalInterventionDefinition[];
  surgicalProcedureOptions: ReturnType<typeof getProcedureOptions>;
  formMissingFields: string[];
  checklistProgress: ReturnType<typeof getChecklistProgress>;
  login: (loginId: string, password: string) => boolean;
  logout: () => void;
  goToPortalSelection: () => void;
  goToSurgeryPortal: () => void;
  goToObstetricPortal: () => void;
  goToObstetricJournal: () => void;
  goToSurgeryHistory: () => void;
  goToBadges: () => void;
  goToPreBlock: (context?: PreBlockContext) => void;
  goToForm: () => void;
  goToChecklist: () => void;
  goToSummary: () => void;
  backToForm: () => void;
  backToWelcome: () => void;
  startNewIntervention: () => void;
  saveIntervention: () => SavedIntervention | null;
  saveObstetricGesture: () => SavedObstetricGesture | null;
  createInternalProfile: (
    input: CreateInternalProfileInput
  ) => CreateInternalProfileResult;
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

const INTERNAL_PROFILES_STORAGE_KEY = 'journal-bord:internal-profiles:v3';
const SAVED_INTERVENTIONS_STORAGE_KEY = 'journal-bord:saved-interventions:v3';
const SAVED_OBSTETRIC_GESTURES_STORAGE_KEY =
  'journal-bord:saved-obstetric-gestures:v1';
const CUSTOM_SURGICAL_INTERVENTIONS_STORAGE_KEY =
  'journal-bord:custom-surgical-interventions:v1';

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

function hydrateSavedInterventions(interventions: SavedIntervention[]) {
  return interventions.map((intervention) => ({
    ...intervention,
    customIndication: intervention.customIndication ?? null,
    autonomyScore: intervention.autonomyScore ?? null,
    complexity:
      normalizeComplexityRating(
        intervention.complexity as Parameters<typeof normalizeComplexityRating>[0]
      ) ?? defaultComplexityRating,
  }));
}

function hydrateSurgicalInterventionDefinitions(
  interventions: SurgicalInterventionDefinition[]
) {
  return interventions.map((intervention) => ({
    ...intervention,
    indications: intervention.indications ?? [],
    allowedApproaches: intervention.allowedApproaches ?? [],
    allowedEntryTechniques: intervention.allowedEntryTechniques ?? [],
    checklistSteps: intervention.checklistSteps ?? [],
    keyStepIds: intervention.keyStepIds ?? [],
  }));
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
    procedure: 'salpingectomie',
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
  const [customSurgicalInterventions, setCustomSurgicalInterventions] =
    useState<SurgicalInterventionDefinition[]>(() =>
      hydrateSurgicalInterventionDefinitions(
        loadStoredArray<SurgicalInterventionDefinition>(
          CUSTOM_SURGICAL_INTERVENTIONS_STORAGE_KEY,
          []
        )
      )
    );
  const selectedInternal =
    internalProfiles.find((profile) => profile.id === selectedInternalId) ?? null;
  const selectedSenior = getSeniorById(selectedSeniorId);
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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      SAVED_OBSTETRIC_GESTURES_STORAGE_KEY,
      JSON.stringify(savedObstetricGestures)
    );
  }, [savedObstetricGestures]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      CUSTOM_SURGICAL_INTERVENTIONS_STORAGE_KEY,
      JSON.stringify(customSurgicalInterventions)
    );
  }, [customSurgicalInterventions]);

  const login = (loginId: string, password: string) => {
    if (isAdminCredentials(loginId, password)) {
      setSessionRole('admin');
      setSelectedInternalId(null);
      setSelectedSeniorId(null);
      setDraft(createInitialDraft(null));
      setObstetricDraft(createInitialObstetricDraft(null));
      setLastSavedIntervention(null);
      setSummaryMode('review');
      setPreBlockContext('surgery');
      setScreen('admin');

      return true;
    }

    const senior = getSeniorByCredentials(loginId, password);

    if (senior) {
      setSessionRole('senior');
      setSelectedInternalId(null);
      setSelectedSeniorId(senior.id);
      setDraft(createInitialDraft(null));
      setObstetricDraft(createInitialObstetricDraft(null));
      setLastSavedIntervention(null);
      setSummaryMode('review');
      setPreBlockContext('surgery');
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
    setSelectedSeniorId(null);
    setDraft(createInitialDraft(profile.id));
    setObstetricDraft(createInitialObstetricDraft(profile.id));
    setLastSavedIntervention(null);
    setSummaryMode('review');
    setPreBlockContext('surgery');
    setScreen('portal-selection');

    return true;
  };

  const logout = () => {
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

  const goToPortalSelection = () => {
    if (!selectedInternal) {
      return;
    }

    setScreen('portal-selection');
  };

  const goToSurgeryPortal = () => {
    if (!selectedInternal) {
      return;
    }

    setScreen('welcome');
  };

  const goToObstetricPortal = () => {
    if (!selectedInternal) {
      return;
    }

    setScreen('obstetric-portal');
  };

  const goToObstetricJournal = () => {
    if (!selectedInternal) {
      return;
    }

    setObstetricDraft((current) => ({
      ...current,
      internalId: selectedInternal.id,
      date: current.date || getTodayIsoDate(),
    }));
    setScreen('obstetric-journal');
  };

  const goToForm = () => {
    if (!selectedInternal) {
      return;
    }

    setSummaryMode('review');
    setScreen('form');
  };

  const goToSurgeryHistory = () => {
    if (!selectedInternal) {
      return;
    }

    setScreen('surgery-history');
  };

  const goToBadges = () => {
    if (!selectedInternal) {
      return;
    }

    setScreen('badges');
  };

  const goToPreBlock = (context: PreBlockContext = 'surgery') => {
    setPreBlockContext(context);
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
      draft.entryTechnique,
      customSurgicalInterventions
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

  const backToWelcome = () => {
    setSummaryMode('review');
    setScreen(
      sessionRole === 'admin'
        ? 'admin'
        : preBlockContext === 'obstetric'
          ? 'obstetric-portal'
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
    setSummaryMode('confirmed');
    setScreen('summary');

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
    setScreen('obstetric-portal');

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

    const needsEntryTechnique =
      input.allowedApproaches.includes('coelioscopie') ||
      input.allowedApproaches.includes('robot');

    if (needsEntryTechnique && input.allowedEntryTechniques.length === 0) {
      return {
        success: false,
        message:
          'Sélectionne au moins une technique d’entrée pour la cœlioscopie ou le robot.',
      };
    }

    const automaticStepLabels = [
      ...DEFAULT_CUSTOM_INTERVENTION_STEP_LABELS,
      ...(needsEntryTechnique ? LAPAROSCOPIC_CUSTOM_INTERVENTION_STEP_LABELS : []),
    ];
    const availableStepLabels = normalizeStepLabels([
      ...automaticStepLabels,
      ...input.customChecklistSteps,
    ]);
    const orderedInputStepLabels = normalizeStepLabels(input.stepOrderLabels);
    const allStepLabels = [
      ...orderedInputStepLabels.filter((label) =>
        availableStepLabels.includes(label)
      ),
      ...availableStepLabels.filter(
        (label) => !orderedInputStepLabels.includes(label)
      ),
    ];

    if (allStepLabels.length === 0) {
      return {
        success: false,
        message: 'Ajoute au moins une étape de checklist.',
      };
    }

    const keyStepLabels = normalizeStepLabels(input.keyStepLabels).filter((label) =>
      allStepLabels.includes(label)
    );

    if (keyStepLabels.length === 0) {
      return {
        success: false,
        message: 'Sélectionne au moins une étape clé de l’intervention.',
      };
    }

    const checklistSteps = allStepLabels.map((label, index) => ({
      id: `${id}-step-${index + 1}`,
      label,
    }));
    const keyStepIds = checklistSteps
      .filter((step) => keyStepLabels.includes(step.label))
      .map((step) => step.id);

    const existingIntervention = customSurgicalInterventions.find(
      (intervention) => intervention.id === id
    );

    const intervention: SurgicalInterventionDefinition = {
      id,
      name,
      indications: normalizeStepLabels(input.indications),
      allowedApproaches: [...new Set(input.allowedApproaches)],
      allowedEntryTechniques: needsEntryTechnique
        ? [...new Set(input.allowedEntryTechniques)]
        : [],
      requiresLaterality: input.requiresLaterality,
      checklistSteps,
      keyStepIds,
      isCustom: true,
      createdAt: existingIntervention?.createdAt ?? new Date().toISOString(),
    };

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
        customSurgicalInterventions,
        surgicalProcedureOptions,
        formMissingFields,
        checklistProgress,
        login,
        logout,
        goToPortalSelection,
        goToSurgeryPortal,
        goToObstetricPortal,
        goToObstetricJournal,
        goToSurgeryHistory,
        goToBadges,
        goToPreBlock,
        goToForm,
        goToChecklist,
        goToSummary,
        backToForm,
        backToWelcome,
        startNewIntervention,
        saveIntervention,
        saveObstetricGesture,
        createInternalProfile,
        createSurgicalIntervention,
        updateSurgicalIntervention,
        deleteCustomSurgicalIntervention,
        deleteInternalProfile,
        deleteSavedInterventions,
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
