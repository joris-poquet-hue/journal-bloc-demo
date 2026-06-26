import { FormEvent, useEffect, useMemo, useState } from 'react';

import { ProgressBadgeCard } from '../components/ProgressBadgeCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { SectionCard } from '../components/SectionCard';
import { useAppContext } from '../context/AppContext';
import {
  approachOptions,
  badgeCatalog,
  checklistLevelOptions,
  contextOptions,
  entryTechniqueOptions,
  formatComplexityRating,
  formatDisplayName,
  formatSeniorDisplayName,
  getChecklistStepsForIntervention,
  getChoiceLabel,
  getInternalById,
  getProgressBadgesForInternal,
  getSurgicalInterventionDefinition,
  getSurgicalInterventionDefinitions,
  hydrateAdminInterventionEvaluations,
  indicationOptions,
  roleOptions,
} from '../data/mockData';
import {
  CreateInternalProfileInput,
  CreateSeniorProfileInput,
  CreateSurgicalInterventionInput,
  EntryTechnique,
  ChecklistLevel,
  AdminCategoryDifficultyRating,
  AdminInterventionEvaluation,
  AdminPerformanceRating,
  ActivityLogEntry,
  InternalProfile,
  InterventionType,
  SavedIntervention,
  Senior,
  SurgicalApproach,
  SurgicalInterventionDefinition,
  TestFeedback,
  UpdateInternalCredentialsInput,
  UpdateSeniorCredentialsInput,
} from '../types';
import { formatIsoDate } from '../utils/date';
import { calculateAutonomyScore } from '../utils/autonomyScore';
import { downloadInterventionsCsv } from '../utils/export';
import {
  loadPersistentArray,
  savePersistentArray,
} from '../services/persistentStorage';

type AdminView = 'home' | 'badges' | 'profile' | 'profiles' | 'interventions';
type FeedbackState =
  | {
      kind: 'success' | 'error';
      message: string;
    }
  | null;

function FeedbackMessage({ feedback }: { feedback: FeedbackState }) {
  if (!feedback) {
    return null;
  }

  return (
    <p
      className={feedback.kind === 'success' ? 'auth-success' : 'auth-error'}
    >
      {feedback.message}
    </p>
  );
}

type AdminInterventionFilters = {
  internalId: string;
  procedure: 'all' | InterventionType;
  dateFrom: string;
  dateTo: string;
};

const EMPTY_CREATE_FORM: CreateInternalProfileInput = {
  firstName: '',
  lastName: '',
  loginId: '',
  password: '',
  promotion: '',
  semester: '',
  currentRotation: '',
};

const EMPTY_UPDATE_INTERNAL_CREDENTIALS_FORM: UpdateInternalCredentialsInput = {
  loginId: '',
  password: '',
};

const EMPTY_CREATE_SENIOR_FORM: CreateSeniorProfileInput = {
  firstName: '',
  lastName: '',
  loginId: '',
  password: '',
};

const EMPTY_UPDATE_SENIOR_CREDENTIALS_FORM: UpdateSeniorCredentialsInput = {
  loginId: '',
  password: '',
};

const EMPTY_INTERVENTION_FILTERS: AdminInterventionFilters = {
  internalId: 'all',
  procedure: 'all',
  dateFrom: '',
  dateTo: '',
};

const ADMIN_EVALUATIONS_STORAGE_KEY =
  'journal-bord:admin-intervention-evaluations:v1';
const TEST_FEEDBACK_STORAGE_KEY = 'journal-bord:test-feedback:v1';
const ACTIVITY_LOG_STORAGE_KEY = 'journal-bord:activity-log:v1';

const EMPTY_SURGICAL_INTERVENTION_FORM: CreateSurgicalInterventionInput = {
  name: '',
  indications: [''],
  allowedApproaches: [],
  allowedEntryTechniques: [],
  requiresLaterality: false,
  customChecklistSteps: [''],
  keyStepLabels: [],
  stepOrderLabels: [],
  stepApproachLabels: {},
};

const ROTATION_SUGGESTIONS = [
  'Chirurgie',
  'DAN',
  'Pool obstétrical',
  'UGOMPS',
];

const PROMOTION_OPTIONS = [
  'Promo 2020',
  'Promo 2021',
  'Promo 2022',
  'Promo 2023',
  'Promo 2024',
  'Promo 2025',
];

const SEMESTER_OPTIONS = Array.from({ length: 12 }, (_, index) => `S${index + 1}`);
const DEFAULT_NEW_INTERVENTION_STEP_LABELS = [
  'Installation de la patiente',
  'Préparation du matériel et vérification de l’installation',
];
const LAPAROSCOPIC_NEW_INTERVENTION_STEP_LABELS = [
  'Voie d’abord du pneumopéritoine',
  'Mise en place des trocarts',
  'Exsufflation et retrait des trocarts',
];
const PNEUMOPERITONEUM_ENTRY_STEP_LABEL = 'Voie d’abord du pneumopéritoine';

const ADMIN_PERFORMANCE_OPTIONS: Array<{
  value: AdminPerformanceRating;
  label: string;
  description: string;
}> = [
  {
    value: '1',
    label: '1 · Interne non préparé',
    description:
      'L’interne n’était pas suffisamment préparé pour l’intervention.',
  },
  {
    value: '2',
    label: '2 · Connaissance insuffisante de la procédure',
    description:
      'L’interne ne connaissait pas suffisamment les étapes ou les principes de l’intervention.',
  },
  {
    value: '3',
    label: '3 · Performance intermédiaire',
    description:
      'L’interne a réalisé une partie de l’intervention avec un niveau correct, mais nécessite encore un accompagnement important.',
  },
  {
    value: '4',
    label: '4 · Performance compatible avec une future autonomie supervisée',
    description:
      'La performance est compatible avec une progression vers une pratique autonome supervisée.',
  },
  {
    value: '5',
    label: '5 · Performance exceptionnelle',
    description:
      'La performance est nettement supérieure à celle attendue pour le niveau de formation.',
  },
];

const ADMIN_CATEGORY_DIFFICULTY_OPTIONS: Array<{
  value: AdminCategoryDifficultyRating;
  label: string;
  description: string;
}> = [
  {
    value: '1',
    label: '1 · Intervention simple',
    description:
      'Intervention techniquement simple par rapport aux autres interventions du même type.',
  },
  {
    value: '2',
    label: '2 · Intervention de difficulté intermédiaire',
    description:
      'Intervention de difficulté habituelle ou modérée par rapport aux autres interventions du même type.',
  },
  {
    value: '3',
    label: '3 · Intervention difficile',
    description:
      'Intervention techniquement difficile par rapport aux autres interventions du même type.',
  },
];

function getSemesterTone(semester: string) {
  const semesterNumber = Number(semester.replace('S', ''));

  if (semesterNumber >= 1 && semesterNumber <= 2) {
    return 'blue';
  }

  if (semesterNumber >= 3 && semesterNumber <= 8) {
    return 'green';
  }

  return 'gold';
}

function getTierRank(tier: 'diamond' | 'gold' | 'silver' | 'bronze') {
  if (tier === 'diamond') {
    return 4;
  }

  if (tier === 'gold') {
    return 3;
  }

  if (tier === 'silver') {
    return 2;
  }

  return 1;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Jamais connecté';
  }

  return new Date(value).toLocaleString('fr-FR');
}

function normalizeLabels(labels: string[]) {
  const seenLabels = new Set<string>();

  return labels
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

function getAutomaticChecklistStepLabels(approaches: SurgicalApproach[]) {
  const needsEntryTechnique =
    approaches.includes('coelioscopie') || approaches.includes('robot');

  return [
    ...DEFAULT_NEW_INTERVENTION_STEP_LABELS,
    ...(needsEntryTechnique ? LAPAROSCOPIC_NEW_INTERVENTION_STEP_LABELS : []),
  ];
}

function getDefaultStepApproachLabels(
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

  return LAPAROSCOPIC_NEW_INTERVENTION_STEP_LABELS.includes(stepLabel)
    ? allowedApproaches.filter((approach) =>
        approach === 'coelioscopie' || approach === 'robot'
      )
    : [];
}

function getStepApproachLabels(
  stepLabel: string,
  form: CreateSurgicalInterventionInput
) {
  const hasExplicitValue = Object.prototype.hasOwnProperty.call(
    form.stepApproachLabels,
    stepLabel
  );

  return hasExplicitValue
    ? form.stepApproachLabels[stepLabel] ?? []
    : getDefaultStepApproachLabels(stepLabel, form.allowedApproaches);
}

function getOrderedChecklistLabels(
  availableLabels: string[],
  requestedOrderLabels: string[]
) {
  const normalizedAvailableLabels = normalizeLabels(availableLabels);
  const normalizedRequestedLabels = normalizeLabels(requestedOrderLabels);

  return [
    ...normalizedRequestedLabels.filter((label) =>
      normalizedAvailableLabels.includes(label)
    ),
    ...normalizedAvailableLabels.filter(
      (label) => !normalizedRequestedLabels.includes(label)
    ),
  ];
}

function getInterventionKeyStepLabels(
  intervention: SurgicalInterventionDefinition
) {
  const keyStepIds = new Set(intervention.keyStepIds);

  return intervention.checklistSteps
    .filter((step) => keyStepIds.has(step.id))
    .map((step) => step.label);
}

function loadStoredAdminEvaluations() {
  if (typeof window === 'undefined') {
    return hydrateAdminInterventionEvaluations();
  }

  try {
    const rawValue = window.localStorage.getItem(ADMIN_EVALUATIONS_STORAGE_KEY);

    if (!rawValue) {
      return hydrateAdminInterventionEvaluations();
    }

    const parsedValue = JSON.parse(rawValue);

    return parsedValue && typeof parsedValue === 'object'
      ? hydrateAdminInterventionEvaluations(
          parsedValue as Record<string, AdminInterventionEvaluation>
        )
      : hydrateAdminInterventionEvaluations();
  } catch {
    return hydrateAdminInterventionEvaluations();
  }
}

function loadStoredArray<T>(storageKey: string, fallbackValue: T[] = []) {
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

function evaluationsArrayToRecord(evaluations: AdminInterventionEvaluation[]) {
  return Object.fromEntries(
    evaluations.map((evaluation) => [evaluation.interventionId, evaluation])
  ) as Record<string, AdminInterventionEvaluation>;
}

function evaluationsRecordToArray(
  evaluations: Record<string, AdminInterventionEvaluation>
) {
  return Object.values(evaluations);
}

function getInterventionIndicationLabel(intervention: SavedIntervention) {
  if (intervention.customIndication?.trim()) {
    return intervention.customIndication.trim();
  }

  if (
    intervention.indication === 'autre' &&
    intervention.indicationComment.trim()
  ) {
    return intervention.indicationComment.trim();
  }

  return getChoiceLabel(indicationOptions, intervention.indication, '');
}

function formatKeyStepScore(score: number | null) {
  if (score == null) {
    return 'Non calculable';
  }

  return `${score.toFixed(1).replace('.', ',')} / 4`;
}

function getChecklistLevelLabel(level: ChecklistLevel) {
  const label = getChoiceLabel(checklistLevelOptions, level, level);
  const description =
    checklistLevelOptions.find((option) => option.value === level)?.description ?? '';

  return description ? `${label} · ${description}` : label;
}

function hasCompleteAdminEvaluation(
  evaluation: AdminInterventionEvaluation | undefined
) {
  return Boolean(evaluation?.globalPerformance && evaluation.categoryDifficulty);
}

function sortEarnedBadges(profile: InternalProfile, savedInterventions: ReturnType<typeof useAppContext>['savedInterventions']) {
  return getProgressBadgesForInternal(profile, savedInterventions)
    .filter((badge) => badge.isEarned)
    .sort((left, right) => {
      const tierDifference = getTierRank(right.tier) - getTierRank(left.tier);

      if (tierDifference !== 0) {
        return tierDifference;
      }

      return (right.awardedAt ?? '').localeCompare(left.awardedAt ?? '');
    });
}

export function AdminScreen() {
  const {
    createInternalProfile,
    createSeniorProfile,
    createSurgicalIntervention,
    customSeniors,
    customSurgicalInterventions,
    deleteCustomSurgicalIntervention,
    deleteInternalProfile,
    deleteSeniorProfile,
    deleteSavedInterventions,
    internalProfiles,
    isAdmin,
    isSenior,
    logout,
    savedInterventions,
    selectableSeniors,
    selectedSenior,
    surgicalProcedureOptions,
    updateInternalCredentials,
    updateSeniorCredentials,
    updateSurgicalIntervention,
    updateSavedInterventionAutonomyScore,
  } = useAppContext();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [view, setView] = useState<AdminView>('home');
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [createForm, setCreateForm] =
    useState<CreateInternalProfileInput>(EMPTY_CREATE_FORM);
  const [editingInternalCredentialsProfileId, setEditingInternalCredentialsProfileId] =
    useState<string | null>(null);
  const [editInternalCredentialsForm, setEditInternalCredentialsForm] =
    useState<UpdateInternalCredentialsInput>(
      EMPTY_UPDATE_INTERNAL_CREDENTIALS_FORM
    );
  const [createSeniorForm, setCreateSeniorForm] =
    useState<CreateSeniorProfileInput>(EMPTY_CREATE_SENIOR_FORM);
  const [editingSeniorId, setEditingSeniorId] = useState<string | null>(null);
  const [editSeniorCredentialsForm, setEditSeniorCredentialsForm] =
    useState<UpdateSeniorCredentialsInput>(
      EMPTY_UPDATE_SENIOR_CREDENTIALS_FORM
    );
  const [surgicalInterventionForm, setSurgicalInterventionForm] =
    useState<CreateSurgicalInterventionInput>(EMPTY_SURGICAL_INTERVENTION_FORM);
  const [interventionFilters, setInterventionFilters] =
    useState<AdminInterventionFilters>(EMPTY_INTERVENTION_FILTERS);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [internalCredentialsFeedback, setInternalCredentialsFeedback] =
    useState<FeedbackState>(null);
  const [seniorFeedback, setSeniorFeedback] = useState<FeedbackState>(null);
  const [seniorAccountFeedback, setSeniorAccountFeedback] =
    useState<FeedbackState>(null);
  const [surgicalInterventionFeedback, setSurgicalInterventionFeedback] =
    useState<FeedbackState>(null);
  const [profileToDelete, setProfileToDelete] = useState<InternalProfile | null>(null);
  const [showSurgicalInterventionList, setShowSurgicalInterventionList] =
    useState(false);
  const [editingSurgicalInterventionId, setEditingSurgicalInterventionId] =
    useState<InterventionType | null>(null);
  const [draggedStepLabel, setDraggedStepLabel] = useState<string | null>(null);
  const [selectedEvaluationInterventionId, setSelectedEvaluationInterventionId] =
    useState<string | null>(null);
  const [adminEvaluations, setAdminEvaluations] =
    useState<Record<string, AdminInterventionEvaluation>>(
      loadStoredAdminEvaluations
    );
  const [hasLoadedPersistentAdminEvaluations, setHasLoadedPersistentAdminEvaluations] =
    useState(false);
  const [testFeedbackItems, setTestFeedbackItems] = useState<TestFeedback[]>(() =>
    loadStoredArray<TestFeedback>(TEST_FEEDBACK_STORAGE_KEY)
  );
  const [hasLoadedPersistentTestFeedback, setHasLoadedPersistentTestFeedback] =
    useState(false);
  const [testFeedbackMessage, setTestFeedbackMessage] = useState('');
  const [testFeedbackStatus, setTestFeedbackStatus] =
    useState<FeedbackState>(null);
  const [activityLog, setActivityLog] = useState<ActivityLogEntry[]>(() =>
    loadStoredArray<ActivityLogEntry>(ACTIVITY_LOG_STORAGE_KEY)
  );
  const [hasLoadedPersistentActivityLog, setHasLoadedPersistentActivityLog] =
    useState(false);
  const [evaluationFeedback, setEvaluationFeedback] =
    useState<FeedbackState>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadPersistentAdminEvaluations() {
      const persistentEvaluations =
        await loadPersistentArray<AdminInterventionEvaluation>(
          'admin_evaluations'
        );

      if (isCancelled) {
        return;
      }

      if (persistentEvaluations) {
        setAdminEvaluations(
          hydrateAdminInterventionEvaluations(
            evaluationsArrayToRecord(persistentEvaluations)
          )
        );
      }

      setHasLoadedPersistentAdminEvaluations(true);
    }

    void loadPersistentAdminEvaluations();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      ADMIN_EVALUATIONS_STORAGE_KEY,
      JSON.stringify(adminEvaluations)
    );

    if (hasLoadedPersistentAdminEvaluations) {
      void savePersistentArray(
        'admin_evaluations',
        evaluationsRecordToArray(adminEvaluations)
      );
    }
  }, [adminEvaluations, hasLoadedPersistentAdminEvaluations]);

  useEffect(() => {
    let isCancelled = false;

    async function loadPersistentTestFeedback() {
      const persistentFeedback =
        await loadPersistentArray<TestFeedback>('test_feedback');

      if (isCancelled) {
        return;
      }

      if (persistentFeedback) {
        setTestFeedbackItems(persistentFeedback);
      }

      setHasLoadedPersistentTestFeedback(true);
    }

    void loadPersistentTestFeedback();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      TEST_FEEDBACK_STORAGE_KEY,
      JSON.stringify(testFeedbackItems)
    );

    if (hasLoadedPersistentTestFeedback) {
      void savePersistentArray('test_feedback', testFeedbackItems);
    }
  }, [testFeedbackItems, hasLoadedPersistentTestFeedback]);

  useEffect(() => {
    let isCancelled = false;

    async function loadPersistentActivityLog() {
      const persistentActivity =
        await loadPersistentArray<ActivityLogEntry>('activity_log');

      if (isCancelled) {
        return;
      }

      if (persistentActivity) {
        setActivityLog(persistentActivity);
      }

      setHasLoadedPersistentActivityLog(true);
    }

    void loadPersistentActivityLog();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      ACTIVITY_LOG_STORAGE_KEY,
      JSON.stringify(activityLog)
    );

    if (hasLoadedPersistentActivityLog) {
      void savePersistentArray('activity_log', activityLog.slice(0, 150));
    }
  }, [activityLog, hasLoadedPersistentActivityLog]);

  const sortedInterventions = useMemo(
    () =>
      [...savedInterventions].sort((left, right) =>
        right.savedAt.localeCompare(left.savedAt)
      ),
    [savedInterventions]
  );
  const interventionsToEvaluate = useMemo(() => {
    if (isSenior) {
      return selectedSenior
        ? sortedInterventions.filter(
            (intervention) => intervention.seniorId === selectedSenior.id
          )
        : [];
    }

    return sortedInterventions;
  }, [isSenior, selectedSenior, sortedInterventions]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const filteredInterventions = useMemo(
    () =>
      sortedInterventions.filter((intervention) => {
        if (
          interventionFilters.internalId !== 'all' &&
          intervention.internalId !== interventionFilters.internalId
        ) {
          return false;
        }

        if (
          interventionFilters.procedure !== 'all' &&
          intervention.procedure !== interventionFilters.procedure
        ) {
          return false;
        }

        if (
          interventionFilters.dateFrom &&
          intervention.date < interventionFilters.dateFrom
        ) {
          return false;
        }

        if (
          interventionFilters.dateTo &&
          intervention.date > interventionFilters.dateTo
        ) {
          return false;
        }

        return true;
      }),
    [interventionFilters, sortedInterventions]
  );
  const selectedInterventions = useMemo(
    () => filteredInterventions.filter((intervention) => selectedSet.has(intervention.id)),
    [filteredInterventions, selectedSet]
  );
  const allSelected =
    filteredInterventions.length > 0 &&
    filteredInterventions.every((intervention) => selectedSet.has(intervention.id));
  const hasActiveInterventionFilters = useMemo(
    () =>
      interventionFilters.internalId !== 'all' ||
      interventionFilters.procedure !== 'all' ||
      interventionFilters.dateFrom !== '' ||
      interventionFilters.dateTo !== '',
    [interventionFilters]
  );
  const filteredCountLabel = useMemo(() => {
    if (!hasActiveInterventionFilters) {
      return `${filteredInterventions.length} intervention(s) enregistrée(s)`;
    }

    return `${filteredInterventions.length} intervention(s) affichée(s) sur ${sortedInterventions.length}`;
  }, [filteredInterventions.length, hasActiveInterventionFilters, sortedInterventions.length]);
  const badgeStats = useMemo(
    () =>
      [...badgeCatalog]
        .map((badge) => {
          const obtainedCount = internalProfiles.filter((profile) =>
            getProgressBadgesForInternal(profile, savedInterventions).some(
              (progressBadge) =>
                progressBadge.metricKey === badge.metricKey &&
                progressBadge.target === badge.target &&
                progressBadge.isEarned
            )
          ).length;

          return {
            ...badge,
            obtainedCount,
          };
        })
        .sort((left, right) => {
          const tierDifference = getTierRank(right.tier) - getTierRank(left.tier);

          if (tierDifference !== 0) {
            return tierDifference;
          }

          return left.title.localeCompare(right.title, 'fr');
        }),
    [internalProfiles, savedInterventions]
  );

  const profilesForAdminList = useMemo(
    () =>
      [...internalProfiles].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt)
      ),
    [internalProfiles]
  );

  const surgicalInterventionDefinitions = useMemo(
    () => getSurgicalInterventionDefinitions(customSurgicalInterventions),
    [customSurgicalInterventions]
  );

  const selectedProfile =
    internalProfiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const selectedProfileInterventions = useMemo(
    () =>
      selectedProfile
        ? sortedInterventions.filter(
            (intervention) => intervention.internalId === selectedProfile.id
          )
        : [],
    [selectedProfile, sortedInterventions]
  );
  const selectedProfileEarnedBadges = useMemo(
    () => (selectedProfile ? sortEarnedBadges(selectedProfile, savedInterventions) : []),
    [savedInterventions, selectedProfile]
  );

  const selectedProfileStats = useMemo(() => {
    if (!selectedProfile) {
      return null;
    }

    return {
      recordedInterventionsCount: selectedProfileInterventions.length,
      earnedBadgesCount: selectedProfileEarnedBadges.length,
    };
  }, [selectedProfile, selectedProfileEarnedBadges.length, selectedProfileInterventions]);
  const customInterventionNeedsEntryTechnique =
    surgicalInterventionForm.allowedApproaches.includes('coelioscopie') ||
    surgicalInterventionForm.allowedApproaches.includes('robot');
  const automaticChecklistStepLabels = getAutomaticChecklistStepLabels(
    surgicalInterventionForm.allowedApproaches
  );
  const previewChecklistStepLabels = getOrderedChecklistLabels([
    ...automaticChecklistStepLabels,
    ...surgicalInterventionForm.customChecklistSteps,
  ], surgicalInterventionForm.stepOrderLabels);
  const isEditingSurgicalIntervention = editingSurgicalInterventionId !== null;
  const selectedEvaluationIntervention =
    sortedInterventions.find(
      (intervention) =>
        intervention.id === selectedEvaluationInterventionId &&
        (!isSenior || intervention.seniorId === selectedSenior?.id)
    ) ?? null;
  const selectedEvaluationInternal = selectedEvaluationIntervention
    ? getInternalById(selectedEvaluationIntervention.internalId, internalProfiles)
    : null;
  const selectedEvaluationDefinition = selectedEvaluationIntervention
    ? getSurgicalInterventionDefinition(
        selectedEvaluationIntervention.procedure,
        customSurgicalInterventions
      )
    : undefined;
  const selectedEvaluationChecklistSteps = selectedEvaluationIntervention
    ? getChecklistStepsForIntervention(
        selectedEvaluationIntervention.procedure,
        selectedEvaluationIntervention.indication,
        selectedEvaluationIntervention.approach,
        selectedEvaluationIntervention.entryTechnique,
        customSurgicalInterventions
      )
    : [];
  const selectedEvaluation =
    selectedEvaluationInterventionId != null
      ? adminEvaluations[selectedEvaluationInterventionId]
      : undefined;
  const selectedEvaluationAutonomyRows = useMemo(() => {
    if (!selectedEvaluationIntervention) {
      return [];
    }

    const baseLevels: ChecklistLevel[] = ['0', '1', '2', '3', '4'];
    const hasNonApplicableStep = selectedEvaluationChecklistSteps.some(
      (step) => selectedEvaluationIntervention.checklist[step.id] === 'NA'
    );
    const levels = hasNonApplicableStep
      ? (['NA', ...baseLevels] as ChecklistLevel[])
      : baseLevels;

    return levels.map((level) => ({
      level,
      steps: selectedEvaluationChecklistSteps.filter(
        (step) => selectedEvaluationIntervention.checklist[step.id] === level
      ),
    }));
  }, [selectedEvaluationChecklistSteps, selectedEvaluationIntervention]);
  const selectedEvaluationKeyStepScore = useMemo(() => {
    if (!selectedEvaluationIntervention || !selectedEvaluationDefinition) {
      return null;
    }

    const keyStepIdSet = new Set(selectedEvaluationDefinition.keyStepIds);
    const keyScores = selectedEvaluationChecklistSteps
      .filter((step) => keyStepIdSet.has(step.id))
      .map((step) => selectedEvaluationIntervention.checklist[step.id])
      .filter((level): level is '0' | '1' | '2' | '3' | '4' =>
        ['0', '1', '2', '3', '4'].includes(level ?? '')
      )
      .map((level) => Number(level));

    if (keyScores.length === 0) {
      return null;
    }

    return (
      keyScores.reduce((total, score) => total + score, 0) / keyScores.length
    );
  }, [
    selectedEvaluationChecklistSteps,
    selectedEvaluationDefinition,
    selectedEvaluationIntervention,
  ]);

  const getCurrentActor = () => {
    if (isSenior && selectedSenior) {
      return {
        role: 'senior' as const,
        label: formatSeniorDisplayName(selectedSenior),
      };
    }

    return {
      role: 'admin' as const,
      label: 'Admin',
    };
  };

  const addActivityLogEntry = (
    action: string,
    targetType: string,
    targetLabel: string
  ) => {
    const actor = getCurrentActor();

    setActivityLog((current) => [
      {
        id: `activity-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        actorRole: actor.role,
        actorLabel: actor.label,
        action,
        targetType,
        targetLabel,
        createdAt: new Date().toISOString(),
      },
      ...current,
    ].slice(0, 150));
  };

  const handleSubmitTestFeedback = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const message = testFeedbackMessage.trim();

    if (!message) {
      setTestFeedbackStatus({
        kind: 'error',
        message: 'Ajoute une remarque avant de l’envoyer.',
      });
      return;
    }

    const actor = getCurrentActor();

    setTestFeedbackItems((current) => [
      {
        id: `feedback-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        message,
        authorRole: actor.role,
        authorLabel: actor.label,
        createdAt: new Date().toISOString(),
      },
      ...current,
    ]);
    addActivityLogEntry('Remarque de test envoyée', 'Remarque', message);
    setTestFeedbackMessage('');
    setTestFeedbackStatus({
      kind: 'success',
      message: 'Remarque enregistrée. Merci, c’est exactement le carburant du pilote.',
    });
  };

  const toggleSelection = (interventionId: string) => {
    setSelectedIds((current) =>
      current.includes(interventionId)
        ? current.filter((id) => id !== interventionId)
        : [...current, interventionId]
    );
  };

  const toggleSelectAll = () => {
    const filteredIds = filteredInterventions.map((intervention) => intervention.id);

    setSelectedIds((current) => {
      if (allSelected) {
        return current.filter((id) => !filteredIds.includes(id));
      }

      return [...new Set([...current, ...filteredIds])];
    });
  };

  const openEvaluationTool = (interventionId: string) => {
    setSelectedEvaluationInterventionId(interventionId);
    setEvaluationFeedback(null);
  };

  const updateAdminEvaluation = (
    field: 'globalPerformance' | 'categoryDifficulty',
    value: AdminPerformanceRating | AdminCategoryDifficultyRating
  ) => {
    if (!selectedEvaluationIntervention) {
      return;
    }

    const timestamp = new Date().toISOString();

    setAdminEvaluations((current) => {
      const currentEvaluation = current[selectedEvaluationIntervention.id] ?? {
        interventionId: selectedEvaluationIntervention.id,
        globalPerformance: null,
        categoryDifficulty: null,
        updatedAt: null,
      };
      const nextEvaluation = {
        ...currentEvaluation,
        [field]: value,
        updatedAt: timestamp,
      };
      const nextAutonomyScore = calculateAutonomyScore(
        selectedEvaluationIntervention,
        customSurgicalInterventions,
        nextEvaluation
      );

      updateSavedInterventionAutonomyScore(
        selectedEvaluationIntervention.id,
        nextAutonomyScore
      );

      return {
        ...current,
        [selectedEvaluationIntervention.id]: nextEvaluation,
      };
    });
    setEvaluationFeedback({
      kind: 'success',
      message: 'Évaluation administrateur enregistrée.',
    });
  };

  const handleCreateFieldChange = (
    field: keyof CreateInternalProfileInput,
    value: string
  ) => {
    setCreateForm((current) => ({
      ...current,
      [field]: value,
    }));
    setFeedback(null);
  };

  const handleCreateSeniorFieldChange = (
    field: keyof CreateSeniorProfileInput,
    value: string
  ) => {
    setCreateSeniorForm((current) => ({
      ...current,
      [field]: value,
    }));
    setSeniorFeedback(null);
  };

  const startSeniorCredentialsEdition = (senior: Senior) => {
    setEditingSeniorId(senior.id);
    setEditSeniorCredentialsForm({
      loginId: senior.loginId ?? '',
      password: senior.password ?? '',
    });
    setSeniorAccountFeedback(null);
  };

  const handleEditSeniorCredentialsFieldChange = (
    field: keyof UpdateSeniorCredentialsInput,
    value: string
  ) => {
    setEditSeniorCredentialsForm((current) => ({
      ...current,
      [field]: value,
    }));
    setSeniorAccountFeedback(null);
  };

  const toggleSurgicalApproach = (approach: SurgicalApproach) => {
    setSurgicalInterventionForm((current) => {
      const allowedApproaches = current.allowedApproaches.includes(approach)
        ? current.allowedApproaches.filter((value) => value !== approach)
        : [...current.allowedApproaches, approach];
      const needsEntryTechnique =
        allowedApproaches.includes('coelioscopie') ||
        allowedApproaches.includes('robot');

      return {
        ...current,
        allowedApproaches,
        allowedEntryTechniques: needsEntryTechnique
          ? current.allowedEntryTechniques
          : [],
        stepApproachLabels: Object.fromEntries(
          Object.entries(current.stepApproachLabels).map(
            ([stepLabel, approaches]) => [
              stepLabel,
              approaches.filter((value) => allowedApproaches.includes(value)),
            ]
          )
        ),
      };
    });
    setSurgicalInterventionFeedback(null);
  };

  const toggleEntryTechnique = (entryTechnique: EntryTechnique) => {
    setSurgicalInterventionForm((current) => ({
      ...current,
      allowedEntryTechniques: current.allowedEntryTechniques.includes(entryTechnique)
        ? current.allowedEntryTechniques.filter((value) => value !== entryTechnique)
        : [...current.allowedEntryTechniques, entryTechnique],
    }));
    setSurgicalInterventionFeedback(null);
  };

  const updateSurgicalIndication = (index: number, value: string) => {
    setSurgicalInterventionForm((current) => ({
      ...current,
      indications: current.indications.map((indication, indicationIndex) =>
        indicationIndex === index ? value : indication
      ),
    }));
    setSurgicalInterventionFeedback(null);
  };

  const addSurgicalIndication = () => {
    setSurgicalInterventionForm((current) => ({
      ...current,
      indications: [...current.indications, ''],
    }));
  };

  const removeSurgicalIndication = (index: number) => {
    setSurgicalInterventionForm((current) => ({
      ...current,
      indications:
        current.indications.length === 1
          ? ['']
          : current.indications.filter(
              (_indication, indicationIndex) => indicationIndex !== index
            ),
    }));
    setSurgicalInterventionFeedback(null);
  };

  const updateCustomChecklistStep = (index: number, value: string) => {
    setSurgicalInterventionForm((current) => ({
      ...current,
      customChecklistSteps: current.customChecklistSteps.map((step, stepIndex) =>
        stepIndex === index ? value : step
      ),
      stepApproachLabels: (() => {
        const previousLabel = current.customChecklistSteps[index]?.trim();
        const nextLabel = value.trim();

        if (
          !previousLabel ||
          !nextLabel ||
          previousLabel === nextLabel ||
          !Object.prototype.hasOwnProperty.call(
            current.stepApproachLabels,
            previousLabel
          )
        ) {
          return current.stepApproachLabels;
        }

        const nextStepApproachLabels = { ...current.stepApproachLabels };
        nextStepApproachLabels[nextLabel] = nextStepApproachLabels[previousLabel];
        delete nextStepApproachLabels[previousLabel];

        return nextStepApproachLabels;
      })(),
    }));
    setSurgicalInterventionFeedback(null);
  };

  const moveChecklistStepLabel = (sourceLabel: string, targetLabel: string) => {
    if (sourceLabel === targetLabel) {
      return;
    }

    setSurgicalInterventionForm((current) => {
      const currentStepLabels = getOrderedChecklistLabels(
        [
          ...getAutomaticChecklistStepLabels(current.allowedApproaches),
          ...current.customChecklistSteps,
        ],
        current.stepOrderLabels
      );
      const sourceIndex = currentStepLabels.indexOf(sourceLabel);
      const targetIndex = currentStepLabels.indexOf(targetLabel);

      if (sourceIndex === -1 || targetIndex === -1) {
        return current;
      }

      const nextStepLabels = [...currentStepLabels];
      const [movedLabel] = nextStepLabels.splice(sourceIndex, 1);
      nextStepLabels.splice(targetIndex, 0, movedLabel);

      return {
        ...current,
        stepOrderLabels: nextStepLabels,
      };
    });
    setSurgicalInterventionFeedback(null);
  };

  const addCustomChecklistStep = () => {
    setSurgicalInterventionForm((current) => ({
      ...current,
      customChecklistSteps: [...current.customChecklistSteps, ''],
    }));
  };

  const removeCustomChecklistStep = (index: number) => {
    setSurgicalInterventionForm((current) => {
      const removedStepLabel = current.customChecklistSteps[index]?.trim();
      const nextStepApproachLabels = { ...current.stepApproachLabels };

      if (removedStepLabel) {
        delete nextStepApproachLabels[removedStepLabel];
      }

      return {
        ...current,
        customChecklistSteps: current.customChecklistSteps.filter(
          (_step, stepIndex) => stepIndex !== index
        ),
        keyStepLabels: removedStepLabel
          ? current.keyStepLabels.filter((label) => label !== removedStepLabel)
          : current.keyStepLabels,
        stepOrderLabels: removedStepLabel
          ? current.stepOrderLabels.filter((label) => label !== removedStepLabel)
          : current.stepOrderLabels,
        stepApproachLabels: nextStepApproachLabels,
      };
    });
  };

  const toggleKeyStepLabel = (label: string) => {
    setSurgicalInterventionForm((current) => ({
      ...current,
      keyStepLabels: current.keyStepLabels.includes(label)
        ? current.keyStepLabels.filter((value) => value !== label)
        : [...current.keyStepLabels, label],
    }));
    setSurgicalInterventionFeedback(null);
  };

  const setStepApplicableToAllApproaches = (label: string) => {
    setSurgicalInterventionForm((current) => ({
      ...current,
      stepApproachLabels: {
        ...current.stepApproachLabels,
        [label]: [],
      },
    }));
    setSurgicalInterventionFeedback(null);
  };

  const toggleStepApplicableApproach = (
    label: string,
    approach: SurgicalApproach
  ) => {
    setSurgicalInterventionForm((current) => {
      const currentApproaches = getStepApproachLabels(label, current);
      const nextApproaches = currentApproaches.includes(approach)
        ? currentApproaches.filter((value) => value !== approach)
        : [...currentApproaches, approach];
      const normalizedApproaches = nextApproaches.filter((value) =>
        current.allowedApproaches.includes(value)
      );

      return {
        ...current,
        stepApproachLabels: {
          ...current.stepApproachLabels,
          [label]: normalizedApproaches,
        },
      };
    });
    setSurgicalInterventionFeedback(null);
  };

  const handleEditSurgicalIntervention = (
    intervention: SurgicalInterventionDefinition
  ) => {
    const stepLabels = intervention.checklistSteps.map((step) => step.label);
    const automaticStepLabelsForIntervention = getAutomaticChecklistStepLabels(
      intervention.allowedApproaches
    );
    const automaticStepLabelSet = new Set(automaticStepLabelsForIntervention);
    const editableStepLabels = stepLabels.filter(
      (stepLabel) => !automaticStepLabelSet.has(stepLabel)
    );

    setSurgicalInterventionForm({
      name: intervention.name,
      indications: intervention.indications.length ? intervention.indications : [''],
      allowedApproaches: intervention.allowedApproaches,
      allowedEntryTechniques: intervention.allowedEntryTechniques,
      requiresLaterality: intervention.requiresLaterality,
      customChecklistSteps: editableStepLabels.length ? editableStepLabels : [''],
      keyStepLabels: getInterventionKeyStepLabels(intervention),
      stepOrderLabels: stepLabels,
      stepApproachLabels: Object.fromEntries(
        intervention.checklistSteps.map((step) => [
          step.label,
          step.applicableApproaches ?? [],
        ])
      ),
    });
    setEditingSurgicalInterventionId(intervention.id);
    setShowSurgicalInterventionList(false);
    setSurgicalInterventionFeedback({
      kind: 'success',
      message: `${intervention.name} est prête à être modifiée.`,
    });
  };

  const cancelSurgicalInterventionEdition = () => {
    setSurgicalInterventionForm(EMPTY_SURGICAL_INTERVENTION_FORM);
    setEditingSurgicalInterventionId(null);
    setSurgicalInterventionFeedback(null);
  };

  const handleCreateProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const result = createInternalProfile(createForm);

    setFeedback({
      kind: result.success ? 'success' : 'error',
      message: result.success && result.profile
        ? `${result.message} Identifiant : ${result.profile.loginId} · Mot de passe : ${result.profile.password}`
        : result.message,
    });

    if (!result.success) {
      return;
    }

    setCreateForm(EMPTY_CREATE_FORM);
  };

  const handleCreateSeniorProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSeniorAccountFeedback(null);

    const result = createSeniorProfile(createSeniorForm);

    setSeniorFeedback({
      kind: result.success ? 'success' : 'error',
      message: result.success && result.senior
        ? `${result.message} Identifiant : ${result.senior.loginId} · Mot de passe : ${result.senior.password}`
        : result.message,
    });

    if (!result.success) {
      return;
    }

    setCreateSeniorForm(EMPTY_CREATE_SENIOR_FORM);
  };

  const handleUpdateSeniorCredentials = (
    event: FormEvent<HTMLFormElement>,
    seniorId: string
  ) => {
    event.preventDefault();
    setSeniorFeedback(null);

    const result = updateSeniorCredentials(
      seniorId,
      editSeniorCredentialsForm
    );

    setSeniorAccountFeedback({
      kind: result.success ? 'success' : 'error',
      message: result.success && result.senior
        ? `${result.message} Identifiant : ${result.senior.loginId} · Mot de passe : ${result.senior.password}`
        : result.message,
    });

    if (!result.success) {
      return;
    }

    setEditingSeniorId(null);
    setEditSeniorCredentialsForm(EMPTY_UPDATE_SENIOR_CREDENTIALS_FORM);
  };

  const handleDeleteSeniorProfile = (senior: Senior) => {
    const seniorLabel = formatSeniorDisplayName(senior);
    const confirmed = window.confirm(
      `Supprimer le compte senior ${seniorLabel} ?`
    );

    if (!confirmed) {
      return;
    }

    deleteSeniorProfile(senior.id);
    setEditingSeniorId((current) => (current === senior.id ? null : current));
    setEditSeniorCredentialsForm(EMPTY_UPDATE_SENIOR_CREDENTIALS_FORM);
    setSeniorFeedback(null);
    setSeniorAccountFeedback({
      kind: 'success',
      message: `Le compte senior ${seniorLabel} a été supprimé.`,
    });
  };

  const handleCreateSurgicalIntervention = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const validKeyStepLabels = surgicalInterventionForm.keyStepLabels.filter((label) =>
      previewChecklistStepLabels.includes(label)
    );
    const payload = {
      ...surgicalInterventionForm,
      indications: normalizeLabels(surgicalInterventionForm.indications),
      customChecklistSteps: normalizeLabels(
        surgicalInterventionForm.customChecklistSteps
      ),
      keyStepLabels: validKeyStepLabels,
      stepOrderLabels: previewChecklistStepLabels,
    };
    const result =
      editingSurgicalInterventionId !== null
        ? updateSurgicalIntervention(editingSurgicalInterventionId, payload)
        : createSurgicalIntervention(payload);

    setSurgicalInterventionFeedback({
      kind: result.success ? 'success' : 'error',
      message: result.message,
    });

    if (!result.success) {
      return;
    }

    setSurgicalInterventionForm(EMPTY_SURGICAL_INTERVENTION_FORM);
    setEditingSurgicalInterventionId(null);
    setShowSurgicalInterventionList(true);
  };

  const handleInterventionFilterChange = (
    field: keyof AdminInterventionFilters,
    value: string
  ) => {
    setInterventionFilters((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleExport = () => {
    downloadInterventionsCsv(
      selectedInterventions,
      internalProfiles,
      customSurgicalInterventions,
      adminEvaluations,
      selectableSeniors
    );
  };

  const handleSelectedProfileExport = () => {
    downloadInterventionsCsv(
      selectedProfileInterventions,
      internalProfiles,
      customSurgicalInterventions,
      adminEvaluations,
      selectableSeniors
    );
  };

  const handleDelete = () => {
    if (selectedInterventions.length === 0) {
      return;
    }

    const confirmed = window.confirm(
      `Supprimer ${selectedInterventions.length} intervention(s) du journal administrateur ?`
    );

    if (!confirmed) {
      return;
    }

    deleteSavedInterventions(selectedInterventions.map((intervention) => intervention.id));
    setSelectedIds((current) =>
      current.filter(
        (id) => !selectedInterventions.some((intervention) => intervention.id === id)
      )
    );
  };

  const handleConfirmProfileDeletion = () => {
    if (!profileToDelete) {
      return;
    }

    deleteInternalProfile(profileToDelete.id);
      setFeedback({
        kind: 'success',
        message: `Le profil ${formatDisplayName(profileToDelete.firstName, profileToDelete.lastName)} a été supprimé.`,
      });
    setProfileToDelete(null);
  };

  if (selectedEvaluationInterventionId && !selectedEvaluationIntervention) {
    return (
      <ScreenContainer
        eyebrow={isSenior ? 'Senior' : 'Administration'}
        title="Intervention introuvable"
        subtitle="Cette intervention n’est plus disponible dans le journal."
        frameWidth="wide"
      >
        <PrimaryButton
          label={isSenior ? 'Retour à l’espace senior' : 'Retour à l’espace administrateur'}
          onPress={() => setSelectedEvaluationInterventionId(null)}
          variant="secondary"
        />
      </ScreenContainer>
    );
  }

  if (selectedEvaluationIntervention) {
    const indicationLabel = getInterventionIndicationLabel(
      selectedEvaluationIntervention
    );
    const procedureLabel = getChoiceLabel(
      surgicalProcedureOptions,
      selectedEvaluationIntervention.procedure
    );
    const priorAutonomyScores = sortedInterventions
      .filter(
        (intervention) =>
          intervention.id !== selectedEvaluationIntervention.id &&
          intervention.internalId === selectedEvaluationIntervention.internalId &&
          intervention.procedure === selectedEvaluationIntervention.procedure &&
          intervention.savedAt < selectedEvaluationIntervention.savedAt
      )
      .map(
        (intervention) =>
          calculateAutonomyScore(
            intervention,
            customSurgicalInterventions,
            adminEvaluations[intervention.id]
          ) ?? intervention.autonomyScore
      )
      .filter((score): score is number => score != null);
    const priorAutonomyAverage =
      priorAutonomyScores.length === 0
        ? null
        : Math.round(
            priorAutonomyScores.reduce((total, score) => total + score, 0) /
              priorAutonomyScores.length
          );
    const hasCompleteEvaluation = hasCompleteAdminEvaluation(selectedEvaluation);

    return (
      <ScreenContainer
        eyebrow={isSenior ? 'Évaluation senior' : 'Évaluation administrateur'}
        title="Évaluer l’interne"
        subtitle={
          selectedEvaluationInternal
            ? `${formatDisplayName(
                selectedEvaluationInternal.firstName,
                selectedEvaluationInternal.lastName
              )} · ${formatIsoDate(selectedEvaluationIntervention.date)}`
            : formatIsoDate(selectedEvaluationIntervention.date)
        }
        frameWidth="wide"
      >
        <SectionCard
          title="Journal de l’interne"
          description="Résumé de l’intervention renseignée dans le journal."
        >
          <div className="info-grid">
            <div className="info-block">
              <span className="info-block__label">Intervention</span>
              <strong className="info-block__value">{procedureLabel}</strong>
            </div>
            <div className="info-block">
              <span className="info-block__label">Indication</span>
              <strong className="info-block__value">
                {indicationLabel || 'Non renseignée'}
              </strong>
            </div>
            {selectedEvaluationIntervention.approach ? (
              <div className="info-block">
                <span className="info-block__label">Voie d’abord</span>
                <strong className="info-block__value">
                  {getChoiceLabel(
                    approachOptions,
                    selectedEvaluationIntervention.approach
                  )}
                </strong>
              </div>
            ) : null}
            <div className="info-block">
              <span className="info-block__label">
                Difficulté ressentie
              </span>
              <strong className="info-block__value">
                {formatComplexityRating(selectedEvaluationIntervention.complexity)}
              </strong>
            </div>
            <div className="info-block">
              <span className="info-block__label">Rôle global</span>
              <strong className="info-block__value">
                {getChoiceLabel(roleOptions, selectedEvaluationIntervention.role)}
              </strong>
            </div>
            <div className="info-block">
              <span className="info-block__label">Autonomie préalable (%)</span>
              <strong className="info-block__value">
                {priorAutonomyAverage == null
                  ? 'Non calculable'
                  : `${priorAutonomyAverage} %`}
              </strong>
              {priorAutonomyAverage == null ? (
                <span className="info-block__helper">
                  Aucune intervention antérieure évaluée
                </span>
              ) : null}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Répartition des niveaux d’autonomie">
          <div className="validation-box">
            <strong>
              Score sur temps opératoires clés :{' '}
              {formatKeyStepScore(selectedEvaluationKeyStepScore)}
            </strong>
            <span>
              Calculé uniquement avec les temps opératoires clés définis pour cette intervention.
            </span>
          </div>
          <div className="admin-evaluation-table-wrapper">
            <table className="admin-evaluation-table">
              <thead>
                <tr>
                  <th>Niveau d’autonomie</th>
                  <th>Temps opératoires concernés</th>
                </tr>
              </thead>
              <tbody>
                {selectedEvaluationAutonomyRows.map((row) => (
                  <tr key={row.level}>
                    <td>{getChecklistLevelLabel(row.level)}</td>
                    <td>
                      {row.steps.length
                        ? row.steps.map((step) => step.label).join(', ')
                        : 'Aucun temps opératoire'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="Évaluation senior / administrateur">
          <div className="field-stack">
            <span className="field-stack__label">
              Performance chirurgicale globale
            </span>
            <div className="admin-rating-grid">
              {ADMIN_PERFORMANCE_OPTIONS.map((option) => (
                <button
                  className={`admin-rating-card ${
                    selectedEvaluation?.globalPerformance === option.value
                      ? 'admin-rating-card--selected'
                      : ''
                  }`}
                  key={option.value}
                  onClick={() =>
                    updateAdminEvaluation('globalPerformance', option.value)
                  }
                  type="button"
                >
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="field-stack">
            <span className="field-stack__label">
              Difficulté chirurgicale intra-catégorie
            </span>
            <p className="field-helper">
              La difficulté chirurgicale intra-catégorie correspond à la difficulté de cette intervention comparée à d’autres interventions du même type.
            </p>
            <div className="admin-rating-grid">
              {ADMIN_CATEGORY_DIFFICULTY_OPTIONS.map((option) => (
                <button
                  className={`admin-rating-card ${
                    selectedEvaluation?.categoryDifficulty === option.value
                      ? 'admin-rating-card--selected'
                      : ''
                  }`}
                  key={option.value}
                  onClick={() =>
                    updateAdminEvaluation('categoryDifficulty', option.value)
                  }
                  type="button"
                >
                  <strong>{option.label}</strong>
                  <span>{option.description}</span>
                </button>
              ))}
            </div>
          </div>

          {evaluationFeedback ? (
            <p
              className={
                evaluationFeedback.kind === 'success'
                  ? 'auth-success'
                  : 'auth-error'
              }
            >
              {evaluationFeedback.message}
            </p>
          ) : null}

          {hasCompleteEvaluation ? (
            <div className="validation-box">
              <strong>Évaluation complète</strong>
              <span>
                Dernière mise à jour :{' '}
                {selectedEvaluation?.updatedAt
                  ? new Date(selectedEvaluation.updatedAt).toLocaleString('fr-FR')
                  : 'Non renseignée'}
              </span>
            </div>
          ) : null}
        </SectionCard>

        <div className="action-stack">
          <PrimaryButton
            label={isSenior ? 'Retour à l’espace senior' : 'Retour à l’espace administrateur'}
            onPress={() => {
              setSelectedEvaluationInterventionId(null);
              setEvaluationFeedback(null);
            }}
            variant="secondary"
          />
        </div>
      </ScreenContainer>
    );
  }

  if (
    (isAdmin || isSenior) &&
    view === 'profile' &&
    selectedProfile &&
    selectedProfileStats
  ) {
    return (
      <ScreenContainer
        eyebrow={isSenior ? 'Senior' : 'Administration'}
        title={formatDisplayName(selectedProfile.firstName, selectedProfile.lastName)}
        subtitle={`${selectedProfile.promotion} · ${selectedProfile.semester} · ${selectedProfile.currentRotation}`}
        frameWidth="wide"
      >
        <SectionCard title="Informations du profil">
          <div className="admin-profile-detail__credentials">
            <div className="info-block">
              <span className="info-block__label">Identifiant</span>
              <strong className="info-block__value">{selectedProfile.loginId}</strong>
            </div>
            <div className="info-block">
              <span className="info-block__label">Mot de passe</span>
              <strong className="info-block__value">{selectedProfile.password}</strong>
            </div>
            <div className="info-block">
              <span className="info-block__label">Créé le</span>
              <strong className="info-block__value">
                {formatDateTime(selectedProfile.createdAt)}
              </strong>
            </div>
            <div className="info-block">
              <span className="info-block__label">Dernière connexion</span>
              <strong className="info-block__value">
                {formatDateTime(selectedProfile.lastLoginAt)}
              </strong>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Vue d’ensemble">
          <div className="info-grid">
            <div className="info-block">
              <span className="info-block__label">Trophées acquis</span>
              <strong className="info-block__value">
                {selectedProfileStats.earnedBadgesCount}
              </strong>
            </div>
            <div className="info-block">
              <span className="info-block__label">Interventions enregistrées</span>
              <strong className="info-block__value">
                {selectedProfileStats.recordedInterventionsCount}
              </strong>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Interventions enregistrées"
        >
          <div className="admin-toolbar">
            <div className="admin-toolbar__actions">
              <button
                className="mini-button mini-button--secondary"
                disabled={selectedProfileInterventions.length === 0}
                onClick={handleSelectedProfileExport}
                type="button"
              >
                Exporter en CSV
              </button>
            </div>
          </div>
          {selectedProfileInterventions.length ? (
            <div className="admin-list admin-list--scroll">
              {selectedProfileInterventions.map((intervention) => {
                const senior =
                  selectableSeniors.find((item) => item.id === intervention.seniorId) ??
                  null;
                const evaluation = adminEvaluations[intervention.id];

                return (
                  <article key={intervention.id} className="admin-item">
                    <div className="admin-item__header">
                      <strong>
                        {getChoiceLabel(
                          surgicalProcedureOptions,
                          intervention.procedure
                        )}
                      </strong>
                      {hasCompleteAdminEvaluation(evaluation) ? (
                        <span className="admin-status-pill">Évaluée</span>
                      ) : null}
                    </div>
                    <span>Date du bloc : {formatIsoDate(intervention.date)}</span>
                    <span>
                      Enregistrée le : {new Date(intervention.savedAt).toLocaleString('fr-FR')}
                    </span>
                    <span>
                      Senior :{' '}
                      {senior
                        ? formatSeniorDisplayName(senior)
                        : 'Non renseigné'}
                    </span>
                    <span>
                      Rôle : {getChoiceLabel(roleOptions, intervention.role)}
                    </span>
                    <button
                      className="mini-button mini-button--secondary"
                      onClick={() => openEvaluationTool(intervention.id)}
                      type="button"
                    >
                      Évaluer l’interne
                    </button>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="validation-box">
              <strong>Aucune intervention enregistrée dans l’application</strong>
              <span>Les futures saisies de cet interne apparaîtront ici.</span>
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Trophées acquis"
          description={`${selectedProfileEarnedBadges.length} trophée(s) obtenu(s).`}
        >
          {selectedProfileEarnedBadges.length ? (
            <div className="badge-grid">
              {selectedProfileEarnedBadges.map((badge) => (
                <ProgressBadgeCard key={badge.id} badge={badge} />
              ))}
            </div>
          ) : (
            <div className="validation-box">
              <strong>Aucun trophée acquis pour l’instant</strong>
              <span>Les futurs trophées obtenus par cet interne apparaîtront ici.</span>
            </div>
          )}
        </SectionCard>

        <div className="action-stack">
          <PrimaryButton
            label="Retour à la liste des profils"
            onPress={() => {
              setSelectedProfileId(null);
              setView('home');
            }}
            variant="secondary"
          />
        </div>
      </ScreenContainer>
    );
  }

  if ((isAdmin || isSenior) && view === 'profiles') {
    return (
      <ScreenContainer
        eyebrow={isSenior ? 'Senior' : 'Administration'}
        title="Administration profil"
        subtitle="Création et consultation des profils internes et comptes seniors."
        frameWidth="wide"
      >
        <SectionCard
          title="Créer un nouvel interne"
        >
          <form className="admin-create-form" onSubmit={handleCreateProfile}>
            <div className="admin-create-form__grid">
              <label className="field-stack">
                <span className="field-stack__label">Prénom</span>
                <input
                  className="field-input"
                  onChange={(event) =>
                    handleCreateFieldChange('firstName', event.target.value)
                  }
                  type="text"
                  value={createForm.firstName}
                />
              </label>

              <label className="field-stack">
                <span className="field-stack__label">Nom</span>
                <input
                  className="field-input"
                  onChange={(event) =>
                    handleCreateFieldChange('lastName', event.target.value)
                  }
                  type="text"
                  value={createForm.lastName}
                />
              </label>

              <label className="field-stack">
                <span className="field-stack__label">Identifiant</span>
                <input
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="field-input"
                  onChange={(event) =>
                    handleCreateFieldChange('loginId', event.target.value)
                  }
                  type="text"
                  value={createForm.loginId}
                />
              </label>

              <label className="field-stack">
                <span className="field-stack__label">Mot de passe</span>
                <input
                  autoCapitalize="none"
                  autoCorrect="off"
                  className="field-input"
                  onChange={(event) =>
                    handleCreateFieldChange('password', event.target.value)
                  }
                  type="text"
                  value={createForm.password}
                />
              </label>

              <label className="field-stack">
                <span className="field-stack__label">Promotion</span>
                <select
                  className="field-input"
                  onChange={(event) =>
                    handleCreateFieldChange('promotion', event.target.value)
                  }
                  value={createForm.promotion}
                >
                  <option value="">Sélectionner une promotion</option>
                  {PROMOTION_OPTIONS.map((promotion) => (
                    <option key={promotion} value={promotion}>
                      {promotion}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-stack">
                <span className="field-stack__label">Semestre</span>
                <select
                  className="field-input"
                  onChange={(event) =>
                    handleCreateFieldChange('semester', event.target.value)
                  }
                  value={createForm.semester}
                >
                  <option value="">Sélectionner un semestre</option>
                  {SEMESTER_OPTIONS.map((semester) => (
                    <option key={semester} value={semester}>
                      {semester}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field-stack admin-create-form__field--full">
                <span className="field-stack__label">Stage actuel</span>
                <input
                  className="field-input"
                  list="rotation-suggestions"
                  onChange={(event) =>
                    handleCreateFieldChange('currentRotation', event.target.value)
                  }
                  type="text"
                  value={createForm.currentRotation}
                />
                <datalist id="rotation-suggestions">
                  {ROTATION_SUGGESTIONS.map((rotation) => (
                    <option key={rotation} value={rotation} />
                  ))}
                </datalist>
              </label>
            </div>

            {feedback ? (
              <p className={feedback.kind === 'success' ? 'auth-success' : 'auth-error'}>
                {feedback.message}
              </p>
            ) : null}

            <button className="app-button app-button--primary" type="submit">
              Créer le profil
            </button>
          </form>
        </SectionCard>

        {isAdmin ? (
          <SectionCard title="Créer un compte senior">
            <form className="admin-create-form" onSubmit={handleCreateSeniorProfile}>
              <div className="admin-create-form__grid">
                <label className="field-stack">
                  <span className="field-stack__label">Prénom</span>
                  <input
                    className="field-input"
                    onChange={(event) =>
                      handleCreateSeniorFieldChange('firstName', event.target.value)
                    }
                    type="text"
                    value={createSeniorForm.firstName}
                  />
                </label>

                <label className="field-stack">
                  <span className="field-stack__label">Nom</span>
                  <input
                    className="field-input"
                    onChange={(event) =>
                      handleCreateSeniorFieldChange('lastName', event.target.value)
                    }
                    type="text"
                    value={createSeniorForm.lastName}
                  />
                </label>

                <label className="field-stack">
                  <span className="field-stack__label">Identifiant</span>
                  <input
                    autoCapitalize="none"
                    autoCorrect="off"
                    className="field-input"
                    onChange={(event) =>
                      handleCreateSeniorFieldChange('loginId', event.target.value)
                    }
                    type="text"
                    value={createSeniorForm.loginId}
                  />
                </label>

                <label className="field-stack">
                  <span className="field-stack__label">Mot de passe</span>
                  <input
                    autoCapitalize="none"
                    autoCorrect="off"
                    className="field-input"
                    onChange={(event) =>
                      handleCreateSeniorFieldChange('password', event.target.value)
                    }
                    type="text"
                    value={createSeniorForm.password}
                  />
                </label>
              </div>

              <FeedbackMessage feedback={seniorFeedback} />

              <button className="app-button app-button--primary" type="submit">
                Créer le compte senior
              </button>
            </form>
          </SectionCard>
        ) : null}

        {isAdmin && customSeniors.length ? (
          <SectionCard title="Comptes seniors créés">
            <FeedbackMessage feedback={seniorAccountFeedback} />

            <div className="admin-profile-list">
              {customSeniors.map((senior) => (
                <article
                  key={senior.id}
                  className="profile-card profile-card--static"
                >
                  <div className="profile-card__header">
                    <strong className="profile-card__name-tag">
                      {formatSeniorDisplayName(senior)}
                    </strong>
                  </div>
                  <div className="profile-card__meta">
                    <span>Identifiant : {senior.loginId}</span>
                    <span>Mot de passe : {senior.password}</span>
                  </div>
                  {editingSeniorId === senior.id ? (
                    <form
                      className="admin-create-form"
                      onSubmit={(event) =>
                        handleUpdateSeniorCredentials(event, senior.id)
                      }
                    >
                      <div className="admin-create-form__grid">
                        <label className="field-stack">
                          <span className="field-stack__label">Identifiant</span>
                          <input
                            autoCapitalize="none"
                            autoCorrect="off"
                            className="field-input"
                            onChange={(event) =>
                              handleEditSeniorCredentialsFieldChange(
                                'loginId',
                                event.target.value
                              )
                            }
                            type="text"
                            value={editSeniorCredentialsForm.loginId}
                          />
                        </label>

                        <label className="field-stack">
                          <span className="field-stack__label">Mot de passe</span>
                          <input
                            autoCapitalize="none"
                            autoCorrect="off"
                            className="field-input"
                            onChange={(event) =>
                              handleEditSeniorCredentialsFieldChange(
                                'password',
                                event.target.value
                              )
                            }
                            type="text"
                            value={editSeniorCredentialsForm.password}
                          />
                        </label>
                      </div>

                      <div className="admin-profile-card__actions">
                        <button
                          className="mini-button mini-button--secondary"
                          type="submit"
                        >
                          Enregistrer les identifiants
                        </button>
                        <button
                          className="mini-button"
                          onClick={() => {
                            setEditingSeniorId(null);
                            setEditSeniorCredentialsForm(
                              EMPTY_UPDATE_SENIOR_CREDENTIALS_FORM
                            );
                          }}
                          type="button"
                        >
                          Annuler
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="admin-profile-card__actions">
                      <button
                        className="mini-button mini-button--secondary"
                        onClick={() => startSeniorCredentialsEdition(senior)}
                        type="button"
                      >
                        Modifier identifiant / mot de passe
                      </button>
                      <button
                        className="mini-button mini-button--danger"
                        onClick={() => handleDeleteSeniorProfile(senior)}
                        type="button"
                      >
                        Supprimer le compte senior
                      </button>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </SectionCard>
        ) : null}

        <SectionCard title="Profils internes">
          <div className="admin-profile-list">
            {profilesForAdminList.map((profile) => (
              <article
                key={profile.id}
                className={`profile-card profile-card--${getSemesterTone(profile.semester)} profile-card--static`}
              >
                <div className="profile-card__header">
                  <strong
                    className={`profile-card__name-tag profile-card__name-tag--${getSemesterTone(
                      profile.semester
                    )}`}
                  >
                    {formatDisplayName(profile.firstName, profile.lastName)}
                  </strong>
                  <span className="profile-card__badge">{profile.semester}</span>
                </div>
                <div className="profile-card__meta">
                  <span>{profile.promotion}</span>
                  <span>{profile.currentRotation}</span>
                  <span>Identifiant : {profile.loginId}</span>
                  <span>Mot de passe : {profile.password}</span>
                </div>
                <div className="admin-profile-card__actions">
                  <button
                    className="mini-button mini-button--secondary"
                    onClick={() => {
                      setSelectedProfileId(profile.id);
                      setView('profile');
                    }}
                    type="button"
                  >
                    Voir les statistiques
                  </button>
                  {isAdmin ? (
                    <button
                      className="mini-button mini-button--danger"
                      onClick={() => setProfileToDelete(profile)}
                      type="button"
                    >
                      Supprimer le profil
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        </SectionCard>

        <div className="action-stack">
          <PrimaryButton
            label={isSenior ? 'Retour à l’espace senior' : 'Retour à l’espace administrateur'}
            onPress={() => setView('home')}
            variant="secondary"
          />
        </div>
      </ScreenContainer>
    );
  }

  if (view === 'interventions') {
    return (
      <ScreenContainer
        eyebrow="Administration"
        title="Création intervention"
        subtitle="Création et modification des interventions disponibles dans le journal."
        frameWidth="wide"
      >
        <SectionCard title="Créer une nouvelle intervention">
          <form
            className="admin-create-form"
            onSubmit={handleCreateSurgicalIntervention}
          >
            <label className="field-stack">
              <span className="field-stack__label">Nom de l’intervention</span>
              <input
                className="field-input"
                onChange={(event) => {
                  setSurgicalInterventionForm((current) => ({
                    ...current,
                    name: event.target.value,
                  }));
                  setSurgicalInterventionFeedback(null);
                }}
                type="text"
                value={surgicalInterventionForm.name}
              />
            </label>

            <div className="field-stack">
              <span className="field-stack__label">Indication</span>
              <div className="admin-step-editor">
                {surgicalInterventionForm.indications.map((indication, index) => (
                  <div className="admin-step-editor__row" key={index}>
                    <input
                      className="field-input"
                      onChange={(event) =>
                        updateSurgicalIndication(index, event.target.value)
                      }
                      placeholder="Nouvelle indication possible"
                      type="text"
                      value={indication}
                    />
                    <button
                      className="mini-button mini-button--secondary"
                      onClick={() => removeSurgicalIndication(index)}
                      type="button"
                    >
                      Retirer
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="mini-button mini-button--secondary"
                onClick={addSurgicalIndication}
                type="button"
              >
                Ajouter une indication
              </button>
            </div>

            <label className="admin-checkbox-card admin-checkbox-card--single">
              <input
                checked={surgicalInterventionForm.requiresLaterality}
                onChange={(event) =>
                  setSurgicalInterventionForm((current) => ({
                    ...current,
                    requiresLaterality: event.target.checked,
                  }))
                }
                type="checkbox"
              />
              <span className="admin-checkbox-card__plain-label">
                Cette intervention nécessite de préciser la latéralité
              </span>
            </label>

            {surgicalInterventionForm.requiresLaterality ? (
              <div className="validation-box">
                <strong>Latéralité activée</strong>
                <span>Options proposées dans le journal : droite, gauche, bilatérale.</span>
              </div>
            ) : null}

            <div className="field-stack">
              <span className="field-stack__label">Voies d’abord possibles</span>
              <div className="admin-checkbox-grid">
                {approachOptions.map((approach) => (
                  <label className="admin-checkbox-card" key={approach.value}>
                    <input
                      checked={surgicalInterventionForm.allowedApproaches.includes(
                        approach.value
                      )}
                      onChange={() => toggleSurgicalApproach(approach.value)}
                      type="checkbox"
                    />
                    <span>{approach.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {customInterventionNeedsEntryTechnique ? (
              <div className="field-stack">
                <span className="field-stack__label">Technique d’entrée</span>
                <div className="admin-checkbox-grid">
                  {entryTechniqueOptions.map((entryTechnique) => (
                    <label
                      className="admin-checkbox-card"
                      key={entryTechnique.value}
                    >
                      <input
                        checked={surgicalInterventionForm.allowedEntryTechniques.includes(
                          entryTechnique.value
                        )}
                        onChange={() => toggleEntryTechnique(entryTechnique.value)}
                        type="checkbox"
                      />
                      <span>{entryTechnique.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="field-stack">
              <span className="field-stack__label">Temps opératoires spécifiques à ajouter</span>
              <div className="admin-step-editor">
                {surgicalInterventionForm.customChecklistSteps.map((step, index) => (
                  <div className="admin-step-editor__row" key={index}>
                    <input
                      className="field-input"
                      onChange={(event) =>
                        updateCustomChecklistStep(index, event.target.value)
                      }
                      placeholder="Nouveau temps opératoire"
                      type="text"
                      value={step}
                    />
                    <button
                      className="mini-button mini-button--secondary"
                      disabled={surgicalInterventionForm.customChecklistSteps.length === 1}
                      onClick={() => removeCustomChecklistStep(index)}
                      type="button"
                    >
                      Retirer
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="mini-button mini-button--secondary"
                onClick={addCustomChecklistStep}
                type="button"
              >
                Ajouter un temps opératoire
              </button>
            </div>

            <div className="field-stack">
              <span className="field-stack__label">Temps opératoire</span>
              <div className="admin-step-order-list">
                {previewChecklistStepLabels.map((stepLabel, index) => (
                  <article
                    className="admin-step-order-item"
                    draggable
                    key={stepLabel}
                    onDragOver={(event) => event.preventDefault()}
                    onDragStart={() => setDraggedStepLabel(stepLabel)}
                    onDrop={() => {
                      if (draggedStepLabel) {
                        moveChecklistStepLabel(draggedStepLabel, stepLabel);
                      }
                      setDraggedStepLabel(null);
                    }}
                  >
                    <span className="admin-step-order-item__index">
                      Temps {index + 1}
                    </span>
                    <div className="admin-step-order-item__content">
                      <strong>{stepLabel}</strong>
                      <div className="admin-step-order-item__controls">
                        <label className="admin-step-order-item__key">
                          <input
                            checked={surgicalInterventionForm.keyStepLabels.includes(
                              stepLabel
                            )}
                            onChange={() => toggleKeyStepLabel(stepLabel)}
                            type="checkbox"
                          />
                          <span>Temps opératoire clé</span>
                        </label>
                        {surgicalInterventionForm.allowedApproaches.length > 0 ? (
                          <div className="admin-step-applicability">
                            <span className="admin-step-applicability__label">
                              Applicable pour
                            </span>
                            <div className="admin-step-applicability__options">
                              {(() => {
                                const selectedApproaches = getStepApproachLabels(
                                  stepLabel,
                                  surgicalInterventionForm
                                );

                                return (
                                  <>
                                    <button
                                      className={`admin-step-applicability__all ${
                                        selectedApproaches.length === 0
                                          ? 'admin-step-applicability__all--selected'
                                          : ''
                                      }`}
                                      onClick={() =>
                                        setStepApplicableToAllApproaches(stepLabel)
                                      }
                                      type="button"
                                    >
                                      Toutes les voies
                                    </button>
                                    {surgicalInterventionForm.allowedApproaches.map(
                                      (approach) => (
                                        <label
                                          className={`admin-step-applicability__choice ${
                                            selectedApproaches.includes(approach)
                                              ? 'admin-step-applicability__choice--selected'
                                              : ''
                                          }`}
                                          key={approach}
                                        >
                                          <input
                                            checked={selectedApproaches.includes(
                                              approach
                                            )}
                                            onChange={() =>
                                              toggleStepApplicableApproach(
                                                stepLabel,
                                                approach
                                              )
                                            }
                                            type="checkbox"
                                          />
                                          <span>
                                            {getChoiceLabel(
                                              approachOptions,
                                              approach
                                            )}
                                          </span>
                                        </label>
                                      )
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <FeedbackMessage feedback={surgicalInterventionFeedback} />

            <div className="admin-form-actions">
              <button className="app-button app-button--primary" type="submit">
                {isEditingSurgicalIntervention
                  ? 'Enregistrer les modifications'
                  : 'Créer l’intervention'}
              </button>
              <button
                className="app-button app-button--secondary"
                onClick={() =>
                  setShowSurgicalInterventionList((current) => !current)
                }
                type="button"
              >
                Voir les interventions
              </button>
              {isEditingSurgicalIntervention ? (
                <button
                  className="app-button app-button--secondary"
                  onClick={cancelSurgicalInterventionEdition}
                  type="button"
                >
                  Annuler la modification
                </button>
              ) : null}
            </div>

            {showSurgicalInterventionList ? (
              <div className="admin-created-interventions">
                {surgicalInterventionDefinitions.map((intervention) => {
                  const storedDefinition = customSurgicalInterventions.find(
                    (storedIntervention) => storedIntervention.id === intervention.id
                  );
                  const isBuiltInIntervention =
                    intervention.id === 'salpingectomie' ||
                    intervention.id === 'colpoclesis';

                  return (
                    <article
                      className="admin-created-intervention"
                      key={intervention.id}
                    >
                      <div className="admin-created-intervention__header">
                        <strong>{intervention.name}</strong>
                      </div>
                      <span>{intervention.checklistSteps.length} étape(s)</span>
                      <span>{intervention.keyStepIds.length} temps opératoire(s) clé(s)</span>
                      {intervention.indications.length ? (
                        <span>
                          Indications : {intervention.indications.join(', ')}
                        </span>
                      ) : null}
                      <div className="admin-created-intervention__actions">
                        <button
                          className="mini-button mini-button--secondary"
                          onClick={() => handleEditSurgicalIntervention(intervention)}
                          type="button"
                        >
                          Modifier
                        </button>
                        {storedDefinition ? (
                          <button
                            className="mini-button mini-button--danger"
                            onClick={() =>
                              deleteCustomSurgicalIntervention(intervention.id)
                            }
                            type="button"
                          >
                            {isBuiltInIntervention ? 'Réinitialiser' : 'Supprimer'}
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}
          </form>
        </SectionCard>

        <div className="action-stack">
          <PrimaryButton
            label={isSenior ? 'Retour à l’espace senior' : 'Retour à l’espace administrateur'}
            onPress={() => setView('home')}
            variant="secondary"
          />
        </div>
      </ScreenContainer>
    );
  }

  if (isAdmin && view === 'badges') {
    return (
      <ScreenContainer
        eyebrow="Administration"
        title="Catalogue des trophées"
        subtitle="Vue d’ensemble de tous les trophées potentiellement obtenables."
        frameWidth="wide"
      >
        <SectionCard title="Catalogue">
          <div className="admin-badge-table-wrapper">
            <table className="admin-badge-table">
              <thead>
                <tr>
                  <th>Trophée</th>
                  <th>Nom</th>
                  <th>Condition d’obtention</th>
                  <th>Trophée à débloquer avant</th>
                  <th>Internes ayant obtenu</th>
                </tr>
              </thead>
              <tbody>
                {badgeStats.map((badge) => (
                  <tr key={badge.id}>
                    <td>
                      <img
                        alt={badge.title}
                        className="admin-badge-table__image"
                        src={badge.imageSrc}
                      />
                    </td>
                    <td>{badge.title}</td>
                    <td>{badge.criteria}</td>
                    <td>{badge.prerequisiteTitle ?? 'Aucun'}</td>
                    <td>{badge.obtainedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <div className="action-stack">
          <PrimaryButton
            label="Retour aux données administrateur"
            onPress={() => setView('home')}
            variant="secondary"
          />
        </div>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      eyebrow={isSenior ? 'Senior' : 'Administration'}
      title={isSenior ? 'Espace senior' : 'Espace administrateur'}
      frameWidth="wide"
    >
      <SectionCard
        title={isSenior ? 'Accès senior' : 'Accès administrateur'}
        description={
          isSenior && selectedSenior
            ? `Connecté : ${formatDisplayName(
                selectedSenior.firstName,
                selectedSenior.lastName
              )}.`
            : 'Cet espace centralise la création de profils et la consultation des données.'
        }
      >
        {isAdmin || isSenior ? (
          <PrimaryButton
            label="Administration profil"
            onPress={() => setView('profiles')}
            variant="secondary"
          />
        ) : null}
        <PrimaryButton
          label="Ouvrir outil de création des interventions"
          onPress={() => setView('interventions')}
          variant="secondary"
        />
        {isAdmin ? (
          <PrimaryButton
            label="Ouvrir catalogue des trophées"
            onPress={() => setView('badges')}
            variant="secondary"
          />
        ) : null}
        <PrimaryButton
          label="Se déconnecter"
          onPress={logout}
          variant="danger"
        />
      </SectionCard>

      <SectionCard
        title="Interventions à évaluer"
        description={
          isSenior
            ? 'Seules les interventions attribuées au senior connecté apparaissent ici.'
            : 'Chaque intervention ajoutée par un interne apparaît ici.'
        }
      >
        {interventionsToEvaluate.length ? (
          <div className="admin-list admin-list--scroll">
            {interventionsToEvaluate.map((intervention) => {
              const internal = getInternalById(
                intervention.internalId,
                internalProfiles
              );
              const senior =
                selectableSeniors.find((item) => item.id === intervention.seniorId) ??
                null;
              const evaluation = adminEvaluations[intervention.id];

              return (
                <article className="admin-item" key={intervention.id}>
                  <div className="admin-item__header">
                    <strong>
                      {getChoiceLabel(
                        surgicalProcedureOptions,
                        intervention.procedure
                      )}
                    </strong>
                    {hasCompleteAdminEvaluation(evaluation) ? (
                      <span className="admin-status-pill">Évaluée</span>
                    ) : null}
                  </div>
                  <span>
                    Interne :{' '}
                    {internal
                      ? formatDisplayName(internal.firstName, internal.lastName)
                      : 'Interne non retrouvé'}
                  </span>
                  <span>Date du bloc : {formatIsoDate(intervention.date)}</span>
                  <span>
                    Senior :{' '}
                    {senior
                      ? formatSeniorDisplayName(senior)
                      : 'Non renseigné'}
                  </span>
                  <span>
                    Rôle : {getChoiceLabel(roleOptions, intervention.role)}
                  </span>
                  <button
                    className="mini-button mini-button--secondary"
                    onClick={() => openEvaluationTool(intervention.id)}
                    type="button"
                  >
                    Évaluer l’interne
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="validation-box">
            <strong>Aucune intervention à évaluer</strong>
            <span>
              {isSenior
                ? 'Les interventions attribuées à ce senior apparaîtront ici.'
                : 'Les interventions ajoutées par les internes apparaîtront ici.'}
            </span>
          </div>
        )}
      </SectionCard>

      {false ? (
      <SectionCard title="Créer une nouvelle intervention">
        <form
          className="admin-create-form"
          onSubmit={handleCreateSurgicalIntervention}
        >
          <label className="field-stack">
            <span className="field-stack__label">Nom de l’intervention</span>
            <input
              className="field-input"
              onChange={(event) => {
                setSurgicalInterventionForm((current) => ({
                  ...current,
                  name: event.target.value,
                }));
                setSurgicalInterventionFeedback(null);
              }}
              type="text"
              value={surgicalInterventionForm.name}
            />
          </label>

          <div className="field-stack">
            <span className="field-stack__label">Indication</span>
            <div className="admin-step-editor">
              {surgicalInterventionForm.indications.map((indication, index) => (
                <div className="admin-step-editor__row" key={index}>
                  <input
                    className="field-input"
                    onChange={(event) =>
                      updateSurgicalIndication(index, event.target.value)
                    }
                    placeholder="Nouvelle indication possible"
                    type="text"
                    value={indication}
                  />
                  <button
                    className="mini-button mini-button--secondary"
                    onClick={() => removeSurgicalIndication(index)}
                    type="button"
                  >
                    Retirer
                  </button>
                </div>
              ))}
            </div>
            <button
              className="mini-button mini-button--secondary"
              onClick={addSurgicalIndication}
              type="button"
            >
              Ajouter une indication
            </button>
          </div>

          <label className="admin-checkbox-card admin-checkbox-card--single">
            <input
              checked={surgicalInterventionForm.requiresLaterality}
              onChange={(event) =>
                setSurgicalInterventionForm((current) => ({
                  ...current,
                  requiresLaterality: event.target.checked,
                }))
              }
              type="checkbox"
            />
            <span className="admin-checkbox-card__plain-label">
              Cette intervention nécessite de préciser la latéralité
            </span>
          </label>

          {surgicalInterventionForm.requiresLaterality ? (
            <div className="validation-box">
              <strong>Latéralité activée</strong>
              <span>Options proposées dans le journal : droite, gauche, bilatérale.</span>
            </div>
          ) : null}

          <div className="field-stack">
            <span className="field-stack__label">Voies d’abord possibles</span>
            <div className="admin-checkbox-grid">
              {approachOptions.map((approach) => (
                <label className="admin-checkbox-card" key={approach.value}>
                  <input
                    checked={surgicalInterventionForm.allowedApproaches.includes(
                      approach.value
                    )}
                    onChange={() => toggleSurgicalApproach(approach.value)}
                    type="checkbox"
                  />
                  <span>{approach.label}</span>
                </label>
              ))}
            </div>
          </div>

          {customInterventionNeedsEntryTechnique ? (
            <div className="field-stack">
              <span className="field-stack__label">Technique d’entrée</span>
              <div className="admin-checkbox-grid">
                {entryTechniqueOptions.map((entryTechnique) => (
                  <label
                    className="admin-checkbox-card"
                    key={entryTechnique.value}
                  >
                    <input
                      checked={surgicalInterventionForm.allowedEntryTechniques.includes(
                        entryTechnique.value
                      )}
                      onChange={() => toggleEntryTechnique(entryTechnique.value)}
                      type="checkbox"
                    />
                    <span>{entryTechnique.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          <div className="field-stack">
            <span className="field-stack__label">Temps opératoires spécifiques à ajouter</span>
            <div className="admin-step-editor">
              {surgicalInterventionForm.customChecklistSteps.map((step, index) => (
                <div className="admin-step-editor__row" key={index}>
                  <input
                    className="field-input"
                    onChange={(event) =>
                      updateCustomChecklistStep(index, event.target.value)
                    }
                    placeholder="Nouveau temps opératoire"
                    type="text"
                    value={step}
                  />
                  <button
                    className="mini-button mini-button--secondary"
                    disabled={surgicalInterventionForm.customChecklistSteps.length === 1}
                    onClick={() => removeCustomChecklistStep(index)}
                    type="button"
                  >
                    Retirer
                  </button>
                </div>
              ))}
            </div>
            <button
              className="mini-button mini-button--secondary"
              onClick={addCustomChecklistStep}
              type="button"
            >
              Ajouter un temps opératoire
            </button>
          </div>

          <div className="field-stack">
            <span className="field-stack__label">Temps opératoire</span>
            <div className="admin-step-order-list">
              {previewChecklistStepLabels.map((stepLabel, index) => (
                <article
                  className="admin-step-order-item"
                  draggable
                  key={stepLabel}
                  onDragOver={(event) => event.preventDefault()}
                  onDragStart={() => setDraggedStepLabel(stepLabel)}
                  onDrop={() => {
                    if (draggedStepLabel) {
                      moveChecklistStepLabel(draggedStepLabel, stepLabel);
                    }
                    setDraggedStepLabel(null);
                  }}
                >
                  <span className="admin-step-order-item__index">
                    Temps {index + 1}
                  </span>
                  <div className="admin-step-order-item__content">
                    <strong>{stepLabel}</strong>
                    <div className="admin-step-order-item__controls">
                      <label className="admin-step-order-item__key">
                        <input
                          checked={surgicalInterventionForm.keyStepLabels.includes(
                            stepLabel
                          )}
                          onChange={() => toggleKeyStepLabel(stepLabel)}
                          type="checkbox"
                        />
                        <span>Temps opératoire clé</span>
                      </label>
                      {surgicalInterventionForm.allowedApproaches.length > 0 ? (
                        <div className="admin-step-applicability">
                          <span className="admin-step-applicability__label">
                            Applicable pour
                          </span>
                          <div className="admin-step-applicability__options">
                            {(() => {
                              const selectedApproaches = getStepApproachLabels(
                                stepLabel,
                                surgicalInterventionForm
                              );

                              return (
                                <>
                                  <button
                                    className={`admin-step-applicability__all ${
                                      selectedApproaches.length === 0
                                        ? 'admin-step-applicability__all--selected'
                                        : ''
                                    }`}
                                    onClick={() =>
                                      setStepApplicableToAllApproaches(stepLabel)
                                    }
                                    type="button"
                                  >
                                    Toutes les voies
                                  </button>
                                  {surgicalInterventionForm.allowedApproaches.map(
                                    (approach) => (
                                      <label
                                        className={`admin-step-applicability__choice ${
                                          selectedApproaches.includes(approach)
                                            ? 'admin-step-applicability__choice--selected'
                                            : ''
                                        }`}
                                        key={approach}
                                      >
                                        <input
                                          checked={selectedApproaches.includes(
                                            approach
                                          )}
                                          onChange={() =>
                                            toggleStepApplicableApproach(
                                              stepLabel,
                                              approach
                                            )
                                          }
                                          type="checkbox"
                                        />
                                        <span>
                                          {getChoiceLabel(
                                            approachOptions,
                                            approach
                                          )}
                                        </span>
                                      </label>
                                    )
                                  )}
                                </>
                              );
                            })()}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <FeedbackMessage feedback={surgicalInterventionFeedback} />

          <div className="admin-form-actions">
            <button className="app-button app-button--primary" type="submit">
              {isEditingSurgicalIntervention
                ? 'Enregistrer les modifications'
                : 'Créer l’intervention'}
            </button>
            <button
              className="app-button app-button--secondary"
              onClick={() =>
                setShowSurgicalInterventionList((current) => !current)
              }
              type="button"
            >
              Voir les interventions
            </button>
            {isEditingSurgicalIntervention ? (
              <button
                className="app-button app-button--secondary"
                onClick={cancelSurgicalInterventionEdition}
                type="button"
              >
                Annuler la modification
              </button>
            ) : null}
          </div>

          {showSurgicalInterventionList ? (
            <div className="admin-created-interventions">
              {surgicalInterventionDefinitions.map((intervention) => {
                const storedDefinition = customSurgicalInterventions.find(
                  (storedIntervention) => storedIntervention.id === intervention.id
                );
                const isBuiltInIntervention =
                  intervention.id === 'salpingectomie' ||
                  intervention.id === 'colpoclesis';

                return (
                  <article
                    className="admin-created-intervention"
                    key={intervention.id}
                  >
                    <div className="admin-created-intervention__header">
                      <strong>{intervention.name}</strong>
                    </div>
                    <span>{intervention.checklistSteps.length} étape(s)</span>
                    <span>{intervention.keyStepIds.length} temps opératoire(s) clé(s)</span>
                    {intervention.indications.length ? (
                      <span>
                        Indications : {intervention.indications.join(', ')}
                      </span>
                    ) : null}
                    <div className="admin-created-intervention__actions">
                      <button
                        className="mini-button mini-button--secondary"
                        onClick={() => handleEditSurgicalIntervention(intervention)}
                        type="button"
                      >
                        Modifier
                      </button>
                      {storedDefinition ? (
                        <button
                          className="mini-button mini-button--danger"
                          onClick={() =>
                            deleteCustomSurgicalIntervention(intervention.id)
                          }
                          type="button"
                        >
                          {isBuiltInIntervention ? 'Réinitialiser' : 'Supprimer'}
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : null}
        </form>
      </SectionCard>
      ) : null}

          {false ? (
          <SectionCard title="Profils internes">
            <div className="admin-profile-list">
              {profilesForAdminList.map((profile) => (
                <article
                  key={profile.id}
                  className={`profile-card profile-card--${getSemesterTone(profile.semester)} profile-card--static`}
                >
                  <div className="profile-card__header">
                    <strong
                      className={`profile-card__name-tag profile-card__name-tag--${getSemesterTone(
                        profile.semester
                      )}`}
                    >
                      {formatDisplayName(profile.firstName, profile.lastName)}
                    </strong>
                    <span className="profile-card__badge">{profile.semester}</span>
                  </div>
                  <div className="profile-card__meta">
                    <span>{profile.promotion}</span>
                    <span>{profile.currentRotation}</span>
                    <span>Identifiant : {profile.loginId}</span>
                    <span>Mot de passe : {profile.password}</span>
                  </div>
                  <div className="admin-profile-card__actions">
                    <button
                      className="mini-button mini-button--secondary"
                      onClick={() => {
                        setSelectedProfileId(profile.id);
                        setView('profile');
                      }}
                      type="button"
                    >
                      Voir les statistiques
                    </button>
                    <button
                      className="mini-button mini-button--danger"
                      onClick={() => setProfileToDelete(profile)}
                      type="button"
                    >
                      Supprimer le profil
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </SectionCard>
          ) : null}

          {isAdmin ? (
          <SectionCard
            title="Interventions enregistrées"
            description={`${filteredCountLabel} · export CSV compatible Excel.`}
          >
            {sortedInterventions.length === 0 ? (
              <div className="validation-box">
                <strong>Aucune intervention enregistrée</strong>
                <span>Les saisies réalisées par les internes apparaîtront ici.</span>
              </div>
            ) : (
              <>
                <div className="admin-filter-grid">
                  <label className="field-stack">
                    <span className="field-stack__label">Interne</span>
                    <select
                      className="field-input"
                      onChange={(event) =>
                        handleInterventionFilterChange('internalId', event.target.value)
                      }
                      value={interventionFilters.internalId}
                    >
                      <option value="all">Tous les internes</option>
                      {profilesForAdminList.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {formatDisplayName(profile.firstName, profile.lastName)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field-stack">
                    <span className="field-stack__label">Intervention</span>
                    <select
                      className="field-input"
                      onChange={(event) =>
                        handleInterventionFilterChange('procedure', event.target.value)
                      }
                      value={interventionFilters.procedure}
                    >
                      <option value="all">Toutes les interventions</option>
                      {surgicalProcedureOptions.map((procedure) => (
                        <option key={procedure.value} value={procedure.value}>
                          {procedure.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="field-stack">
                    <span className="field-stack__label">Date du bloc à partir du</span>
                    <input
                      className="field-input"
                      onChange={(event) =>
                        handleInterventionFilterChange('dateFrom', event.target.value)
                      }
                      type="date"
                      value={interventionFilters.dateFrom}
                    />
                  </label>

                  <label className="field-stack">
                    <span className="field-stack__label">Date du bloc jusqu’au</span>
                    <input
                      className="field-input"
                      onChange={(event) =>
                        handleInterventionFilterChange('dateTo', event.target.value)
                      }
                      type="date"
                      value={interventionFilters.dateTo}
                    />
                  </label>
                </div>

                <div className="admin-toolbar">
                  <span className="admin-toolbar__status">
                    {selectedInterventions.length === 0
                      ? 'Aucune intervention sélectionnée'
                      : `${selectedInterventions.length} intervention(s) sélectionnée(s)`}
                  </span>
                  <div className="admin-toolbar__actions">
                    {hasActiveInterventionFilters ? (
                      <button
                        className="mini-button mini-button--secondary"
                        onClick={() => setInterventionFilters(EMPTY_INTERVENTION_FILTERS)}
                        type="button"
                      >
                        Réinitialiser les filtres
                      </button>
                    ) : null}
                    <button
                      className="mini-button mini-button--secondary"
                      onClick={toggleSelectAll}
                      type="button"
                      disabled={filteredInterventions.length === 0}
                    >
                      {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                    </button>
                    <button
                      className="mini-button mini-button--secondary"
                      disabled={selectedIds.length === 0}
                      onClick={handleExport}
                      type="button"
                    >
                      Exporter en CSV
                    </button>
                    <button
                      className="mini-button mini-button--danger"
                      disabled={selectedIds.length === 0}
                      onClick={handleDelete}
                      type="button"
                    >
                      Supprimer la sélection
                    </button>
                  </div>
                </div>

                {filteredInterventions.length ? (
                  <div className="admin-list admin-list--scroll">
                    {filteredInterventions.map((intervention) => {
                      const internal = getInternalById(
                        intervention.internalId,
                        internalProfiles
                      );
                      const senior =
                        selectableSeniors.find(
                          (item) => item.id === intervention.seniorId
                        ) ?? null;
                      const isSelected = selectedSet.has(intervention.id);
                      const evaluation = adminEvaluations[intervention.id];

                      return (
                        <article
                          key={intervention.id}
                          className={`admin-item ${isSelected ? 'admin-item--selected' : ''}`}
                        >
                          <label className="admin-item__checkbox-row">
                            <input
                              checked={isSelected}
                              onChange={() => toggleSelection(intervention.id)}
                              type="checkbox"
                            />
                            <span className="admin-item__checkbox-label">
                              Sélectionner pour export ou suppression
                            </span>
                          </label>
                          <div className="admin-item__header">
                            <strong>
                              {internal
                                ? formatDisplayName(internal.firstName, internal.lastName)
                                : 'Interne non retrouvée'}
                            </strong>
                            {hasCompleteAdminEvaluation(evaluation) ? (
                              <span className="admin-status-pill">Évaluée</span>
                            ) : null}
                          </div>
                          <span>Date du bloc : {formatIsoDate(intervention.date)}</span>
                          <span>
                            Enregistrée le :{' '}
                            {new Date(intervention.savedAt).toLocaleString('fr-FR')}
                          </span>
                          <span>
                            Senior :{' '}
                            {senior
                              ? formatSeniorDisplayName(senior)
                              : 'Non renseigné'}
                          </span>
                          <span>
                            Intervention :{' '}
                            {getChoiceLabel(
                              surgicalProcedureOptions,
                              intervention.procedure
                            )}
                          </span>
                          <span>
                            Voie d’abord :{' '}
                            {getChoiceLabel(approachOptions, intervention.approach)}
                          </span>
                          <span>
                            Contexte : {getChoiceLabel(contextOptions, intervention.context)}
                          </span>
                          <span>
                            Rôle : {getChoiceLabel(roleOptions, intervention.role)}
                          </span>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="validation-box">
                    <strong>Aucune intervention ne correspond aux filtres</strong>
                    <span>Modifie les filtres pour afficher ou exporter d’autres données.</span>
                  </div>
                )}
              </>
            )}
          </SectionCard>
          ) : null}
      {profileToDelete ? (
        <div
          aria-modal="true"
          className="confirm-modal"
          onClick={() => setProfileToDelete(null)}
          role="dialog"
        >
          <div
            className="confirm-modal__content"
            onClick={(event) => event.stopPropagation()}
          >
            <h2>Supprimer ce profil ?</h2>
              <p>
                Le profil sera supprimé ainsi que les données qui y sont rattachées.
              </p>
            <div className="confirm-modal__actions">
              <button
                className="mini-button mini-button--secondary"
                onClick={() => setProfileToDelete(null)}
                type="button"
              >
                Annuler
              </button>
              <button
                className="mini-button mini-button--danger"
                onClick={handleConfirmProfileDeletion}
                type="button"
              >
                Confirmer la suppression
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ScreenContainer>
  );
}
