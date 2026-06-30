import {
  BarChart3,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  Info,
  LogOut,
  Pencil,
  Settings,
  Search,
  Star,
  Trophy,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { FormEvent, Fragment, ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import {
  ApproachIcon,
  getInterventionApproachLabel,
} from '../components/ApproachIcon';
import { InternalAvatar } from '../components/InternalAvatar';
import { ProgressBadgeCard } from '../components/ProgressBadgeCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { SectionCard } from '../components/SectionCard';
import { AdminInterventionsManager } from '../components/AdminInterventionsManager';
import { useAppContext } from '../context/AppContext';
import {
  allChecklistSteps,
  approachOptions,
  checklistLevelOptions,
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
  AdminTrophyDefinition,
  ActivityLogEntry,
  InternalProfile,
  InterventionType,
  SavedIntervention,
  Senior,
  SurgicalApproach,
  SurgicalInterventionDefinition,
  TestFeedback,
  TrophyCondition,
  TrophyConditionType,
  TrophyLevelDefinition,
  TrophyOperativeScope,
  TrophyStatus,
  TrophyTrackedStatus,
  TrophyType,
  TrophyVisibility,
  UpdateInternalCredentialsInput,
  UpdateSeniorCredentialsResult,
  UpdateSeniorCredentialsInput,
} from '../types';
import { formatIsoDate } from '../utils/date';
import { calculateAutonomyScore } from '../utils/autonomyScore';
import { useScrollResetOnChange } from '../utils/useScrollResetOnChange';
import {
  buildConditionSummary,
  buildTrophyRuleSummary,
  cloneTrophyDefinition,
  countProfilesWithTrophy,
  createDefaultTrophyLevels,
  createEmptyTrophyCondition,
  createEmptyTrophyDefinition,
  ensureTrophyDefinitionShape,
  getTrophyPreviewImage,
  getUnlockedTrophyTierForProfile,
  validateTrophyDefinition,
} from '../utils/adminTrophies';
import { downloadInterventionsExcel } from '../utils/export';
import {
  loadPersistentArray,
  savePersistentArray,
} from '../services/persistentStorage';
import { uploadTrophyImage } from '../services/trophyImageStorage';

type AdminView =
  | 'home'
  | 'trophies'
  | 'trophy-create-type'
  | 'trophy-editor'
  | 'history'
  | 'connections'
  | 'account'
  | 'profile'
  | 'profiles'
  | 'interventions';
type FeedbackState =
  | {
      kind: 'success' | 'error';
      message: string;
    }
  | null;

type AdminActivityRange = 'day' | 'week' | 'month';
type AdminInterventionStatusFilter = 'all' | 'evaluated' | 'pending';
type AdminUserConnection = {
  id: string;
  actorRole: 'internal' | 'senior';
  name: string;
  role: 'Interne' | 'Senior';
  lastLoginAt: string;
};
type AdminTrophyFilter =
  | 'all'
  | 'operatoire'
  | 'special'
  | 'draft'
  | 'active'
  | 'inactive';
type AdminTrophyCardItem = AdminTrophyDefinition & {
  obtainedCount: number;
  unlockedTier: ReturnType<typeof getUnlockedTrophyTierForProfile>;
  ruleSummary: string;
};
type TrophyFormFeedback = {
  kind: 'success' | 'error';
  message: string;
} | null;
type TrophyImageKey = keyof AdminTrophyDefinition['images'];
type AdminProfileViewSource = 'profiles' | 'history';
type ProfileAccountTab = 'internal' | 'senior';
type ProfileStatsTab = 'history' | 'progress';
type ProfileHistoryStatusFilter = 'all' | 'evaluated' | 'pending';
type ProfileProgressPeriod = '3m' | '6m' | '12m' | 'all';
type OperativeBucketId =
  | 'installation'
  | 'ouverture'
  | 'exposition'
  | 'gestes'
  | 'hemostase'
  | 'fermeture'
  | 'autres';
type ProfileHistoryCardStatus = Exclude<ProfileHistoryStatusFilter, 'all'>;

const MASKED_PASSWORD = '••••••••';
const PROFILE_HISTORY_PAGE_SIZE_OPTIONS = [4, 8, 12];

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
  seniorId: string;
  procedure: 'all' | InterventionType;
  approach: 'all' | SurgicalApproach;
  status: AdminInterventionStatusFilter;
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
  seniorId: 'all',
  procedure: 'all',
  approach: 'all',
  status: 'all',
  dateFrom: '',
  dateTo: '',
};

const ADMIN_EVALUATIONS_STORAGE_KEY =
  'journal-bord:admin-intervention-evaluations:v1';
const TEST_FEEDBACK_STORAGE_KEY = 'journal-bord:test-feedback:v1';

const ADMIN_ACTIVITY_RANGE_OPTIONS: Array<{
  value: AdminActivityRange;
  label: string;
}> = [
  { value: 'day', label: 'Jour' },
  { value: 'month', label: 'Mois' },
];

const ADMIN_TROPHY_FILTER_OPTIONS: Array<{
  value: AdminTrophyFilter;
  label: string;
}> = [
  { value: 'all', label: 'Tous' },
  { value: 'operatoire', label: 'Opératoires' },
  { value: 'special', label: 'Spéciaux' },
  { value: 'draft', label: 'Brouillons' },
  { value: 'active', label: 'Actifs' },
  { value: 'inactive', label: 'Inactifs' },
];

const TROPHY_VISIBILITY_OPTIONS: Array<{
  value: TrophyVisibility;
  label: string;
  description: string;
}> = [
  {
    value: 'visible',
    label: 'Progression visible',
    description: "L’interne voit sa progression",
  },
  {
    value: 'surprise',
    label: 'Trophée surprise',
    description: 'Le trophée reste caché',
  },
];

const TROPHY_CONDITION_OPTIONS: Array<{
  value: TrophyConditionType;
  label: string;
}> = [
  { value: 'first_recorded', label: 'Première intervention enregistrée' },
  { value: 'total_recorded', label: 'Nombre total d’interventions enregistrées' },
  { value: 'total_evaluated', label: 'Nombre total d’interventions évaluées' },
  {
    value: 'procedure_count',
    label: 'Nombre d’interventions selon une intervention précise',
  },
  {
    value: 'approach_count',
    label: 'Nombre d’interventions selon une voie d’abord',
  },
  {
    value: 'recording_time_range',
    label: 'Nombre d’interventions selon une plage horaire d’enregistrement',
  },
  { value: 'average_autonomy', label: 'Autonomie moyenne minimale' },
  {
    value: 'cross_procedure_autonomy',
    label: 'Autonomie moyenne minimale sur plusieurs types d’interventions',
  },
  {
    value: 'distinct_procedures',
    label: 'Nombre minimal de types d’interventions différents',
  },
  { value: 'role', label: 'Rôle de l’interne' },
  { value: 'intervention_status', label: 'Statut de l’intervention' },
];

const TROPHY_STATUS_LABELS: Record<TrophyStatus, string> = {
  draft: 'Brouillon',
  active: 'Actif',
  inactive: 'Inactif',
};

const TROPHY_FORMAT_LABELS: Record<AdminTrophyDefinition['format'], string> = {
  levels: 'À niveaux',
  unique: 'Unique',
};

const TROPHY_TYPE_LABELS: Record<TrophyType, string> = {
  operatoire: 'Trophée opératoire',
  special: 'Trophée spécial',
};

const TROPHY_VISIBILITY_LABELS: Record<TrophyVisibility, string> = {
  visible: 'Progression visible',
  surprise: 'Trophée surprise',
};

const TROPHY_VISIBILITY_DESCRIPTIONS: Record<TrophyVisibility, string> = {
  visible: "L’interne voit sa progression côté interne.",
  surprise: "Le trophée reste caché avant son obtention.",
};

const TROPHY_OPERATIVE_SCOPE_OPTIONS: Array<{
  value: TrophyOperativeScope;
  label: string;
}> = [
  { value: 'procedure', label: 'Intervention' },
  { value: 'approach', label: 'Voie d’abord' },
];

const TROPHY_STATUS_CLASSNAMES: Record<TrophyStatus, string> = {
  draft: 'admin-status-pill admin-status-pill--draft',
  active: 'admin-status-pill admin-status-pill--active',
  inactive: 'admin-status-pill admin-status-pill--inactive',
};

const TROPHY_IMAGE_FIELDS: Array<{
  key: keyof AdminTrophyDefinition['images'];
  label: string;
}> = [
  { key: 'single', label: 'Image principale' },
  { key: 'bronze', label: 'Bronze' },
  { key: 'silver', label: 'Argent' },
  { key: 'gold', label: 'Or' },
  { key: 'diamond', label: 'Diamant' },
];

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

const SENIOR_PERFORMANCE_SHORT_LABELS: Record<AdminPerformanceRating, string> = {
  '1': 'Interne non préparé',
  '2': 'Connaissance insuffisante',
  '3': 'Performance intermédiaire',
  '4': 'Compatible autonomie supervisée',
  '5': 'Performance exceptionnelle',
};

const SENIOR_DIFFICULTY_SHORT_LABELS: Record<AdminCategoryDifficultyRating, string> = {
  '1': 'Simple',
  '2': 'Intermédiaire',
  '3': 'Difficile',
};

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

function getProfileInitials(profile: { firstName: string; lastName: string }) {
  return `${profile.firstName.trim().charAt(0)}${profile.lastName.trim().charAt(0)}`
    .trim()
    .toUpperCase();
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

function getChecklistLevelLabel(level: ChecklistLevel) {
  const label = getChoiceLabel(checklistLevelOptions, level, level);
  const description =
    checklistLevelOptions.find((option) => option.value === level)?.description ?? '';

  return description ? `${label} · ${description}` : label;
}

function getChecklistLevelDescription(level: ChecklistLevel | null | undefined) {
  if (!level) {
    return 'Non renseigné';
  }

  return (
    checklistLevelOptions.find((option) => option.value === level)?.description ??
    level
  );
}

function getChecklistLevelBadgeLabel(level: ChecklistLevel | null | undefined) {
  if (!level) {
    return 'Non renseigné';
  }

  return level === 'NA' ? 'NA' : `Niveau ${level}`;
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

function averageNumbers(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

function roundPercentage(value: number | null) {
  return value == null ? null : Math.round(value);
}

function generateTemporaryPassword(seed: string) {
  const normalizedSeed = seed
    .toLocaleLowerCase('fr-FR')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 6) || 'bloclog';
  const dayLabel = new Date().getDate().toString().padStart(2, '0');

  return `${normalizedSeed}${dayLabel}!`;
}

function getProfileHistoryStatus(
  evaluation: AdminInterventionEvaluation | undefined
): ProfileHistoryCardStatus {
  return hasCompleteAdminEvaluation(evaluation) ? 'evaluated' : 'pending';
}

function getProfileHistoryStatusLabel(status: ProfileHistoryCardStatus) {
  return status === 'evaluated' ? 'Évaluée' : 'En attente';
}

function getProfileHistoryStatusClassName(status: ProfileHistoryCardStatus) {
  return status === 'evaluated'
    ? 'admin-profile-history-card__status admin-profile-history-card__status--evaluated'
    : 'admin-profile-history-card__status admin-profile-history-card__status--pending';
}

function getChecklistLevelNumericValue(level: ChecklistLevel | null | undefined) {
  if (!level || level === 'NA') {
    return null;
  }

  return Number(level);
}

function getOperativeBucketId(stepLabel: string): OperativeBucketId {
  const normalizedLabel = stepLabel.toLocaleLowerCase('fr-FR');

  if (
    normalizedLabel.includes('installation') ||
    normalizedLabel.includes('matériel') ||
    normalizedLabel.includes('materiel')
  ) {
    return 'installation';
  }

  if (
    normalizedLabel.includes('voie d’abord') ||
    normalizedLabel.includes("voie d'abord") ||
    normalizedLabel.includes('trocart') ||
    normalizedLabel.includes('incision')
  ) {
    return 'ouverture';
  }

  if (
    normalizedLabel.includes('exposition') ||
    normalizedLabel.includes('exploration') ||
    normalizedLabel.includes('dissection')
  ) {
    return 'exposition';
  }

  if (
    normalizedLabel.includes('geste') ||
    normalizedLabel.includes('section') ||
    normalizedLabel.includes('coagulation') ||
    normalizedLabel.includes('suture') ||
    normalizedLabel.includes('colpectomie') ||
    normalizedLabel.includes('colporraphie') ||
    normalizedLabel.includes('extraction')
  ) {
    return 'gestes';
  }

  if (normalizedLabel.includes('hémostase') || normalizedLabel.includes('hemostase')) {
    return 'hemostase';
  }

  if (normalizedLabel.includes('fermeture') || normalizedLabel.includes('retrait')) {
    return 'fermeture';
  }

  return 'autres';
}

function getOperativeBucketLabel(bucketId: OperativeBucketId) {
  const labels: Record<OperativeBucketId, string> = {
    installation: 'Installation',
    ouverture: 'Ouverture',
    exposition: 'Exposition',
    gestes: 'Gestes principaux',
    hemostase: 'Hémostase',
    fermeture: 'Fermeture',
    autres: 'Autres étapes',
  };

  return labels[bucketId];
}

function getOperativeBucketOrder(bucketId: OperativeBucketId) {
  const order: Record<OperativeBucketId, number> = {
    installation: 1,
    ouverture: 2,
    exposition: 3,
    gestes: 4,
    hemostase: 5,
    fermeture: 6,
    autres: 7,
  };

  return order[bucketId];
}

function parseIsoDateValue(value: string) {
  const [year, month, day] = value.split('-').map(Number);

  return new Date(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0, 0);
}

function startOfWeek(value: Date) {
  const nextDate = new Date(value);
  const day = nextDate.getDay();
  const diff = day === 0 ? -6 : 1 - day;

  nextDate.setDate(nextDate.getDate() + diff);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function endOfWeek(value: Date) {
  const nextDate = startOfWeek(value);

  nextDate.setDate(nextDate.getDate() + 6);
  nextDate.setHours(23, 59, 59, 999);
  return nextDate;
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth() + 1, 0, 23, 59, 59, 999);
}

function addDays(value: Date, amount: number) {
  const nextDate = new Date(value);

  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

function addMonths(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1, 12, 0, 0, 0);
}

function isSameCalendarDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatAdminConnectionTimestamp(value: string) {
  const targetDate = new Date(value);
  const today = new Date();
  const yesterday = addDays(today, -1);
  const timeLabel = targetDate.toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  if (isSameCalendarDay(targetDate, today)) {
    return `Aujourd’hui à ${timeLabel}`;
  }

  if (isSameCalendarDay(targetDate, yesterday)) {
    return `Hier à ${timeLabel}`;
  }

  return `${targetDate.toLocaleDateString('fr-FR')} à ${timeLabel}`;
}

function formatActivityLogEntrySummary(entry: ActivityLogEntry) {
  return entry.targetLabel
    ? `${entry.action} · ${entry.targetLabel}`
    : entry.action;
}

function parseOptionalNumber(value: string) {
  if (value.trim() === '') {
    return null;
  }

  const numericValue = Number(value);

  return Number.isNaN(numericValue) ? null : numericValue;
}

function formatObtainedCountLabel(count: number) {
  return `Obtenu par ${count} interne${count > 1 ? 's' : ''}`;
}

type AdminActivityBucket = {
  id: string;
  label: string;
  recordedCount: number;
  evaluatedCount: number;
};

function buildAdminActivityBuckets(
  savedInterventions: SavedIntervention[],
  adminEvaluations: Record<string, AdminInterventionEvaluation>,
  range: AdminActivityRange
) {
  const today = new Date();
  const latestInterventionDate = savedInterventions.reduce<Date>(
    (latest, intervention) => {
      const currentDate = parseIsoDateValue(intervention.date);

      return currentDate > latest ? currentDate : latest;
    },
    today
  );
  const referenceDate = latestInterventionDate > today ? latestInterventionDate : today;
  const bucketBlueprints =
    range === 'day'
      ? Array.from({ length: 7 }, (_, index) => {
          const date = addDays(referenceDate, index - 6);
          const start = new Date(date);

          start.setHours(0, 0, 0, 0);

          const end = new Date(date);

          end.setHours(23, 59, 59, 999);

          return {
            id: date.toISOString(),
            label: date.toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'short',
            }),
            start,
            end,
          };
        })
      : range === 'week'
        ? Array.from({ length: 8 }, (_, index) => {
            const weekStart = startOfWeek(addDays(referenceDate, (index - 7) * 7));
            const weekEnd = endOfWeek(weekStart);

            return {
              id: weekStart.toISOString(),
              label: `${weekStart.toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'short',
              })} - ${weekEnd.toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'short',
              })}`,
              start: weekStart,
              end: weekEnd,
            };
          })
        : Array.from({ length: 6 }, (_, index) => {
            const monthDate = addMonths(referenceDate, index - 5);
            const monthStart = startOfMonth(monthDate);
            const monthEnd = endOfMonth(monthDate);

            return {
              id: monthStart.toISOString(),
              label: monthStart.toLocaleDateString('fr-FR', {
                month: 'short',
                year: 'numeric',
              }),
              start: monthStart,
              end: monthEnd,
            };
          });

  return bucketBlueprints.map((bucket) => {
    const counters = savedInterventions.reduce(
      (current, intervention) => {
        const interventionDate = parseIsoDateValue(intervention.date);

        if (interventionDate < bucket.start || interventionDate > bucket.end) {
          return current;
        }

        return {
          recordedCount: current.recordedCount + 1,
          evaluatedCount:
            current.evaluatedCount +
            (hasCompleteAdminEvaluation(adminEvaluations[intervention.id]) ? 1 : 0),
        };
      },
      { recordedCount: 0, evaluatedCount: 0 }
    );

    return {
      id: bucket.id,
      label: bucket.label,
      ...counters,
    };
  });
}

function AdminPageShell({
  title,
  subtitle,
  children,
  backLabel,
  onBack,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  backLabel?: string;
  onBack?: () => void;
}) {
  return (
    <ScreenContainer
      bodyClassName="admin-workspace__body"
      frameClassName="admin-workspace__frame"
      frameWidth="wide"
      heroClassName="admin-workspace__hero"
      heroTop={
        onBack ? (
          <button className="admin-breadcrumb-button" onClick={onBack} type="button">
            <ChevronLeft aria-hidden="true" />
            <span>{backLabel ?? 'Retour'}</span>
          </button>
        ) : undefined
      }
      hideBrandmark
      shellClassName="admin-workspace"
      subtitle={subtitle}
      title={title}
    >
      {children}
    </ScreenContainer>
  );
}

type SeniorPopulationFilter = 'recent' | 'mine' | 'all';
type SeniorInterventionFilterOption = {
  key: string;
  label: string;
  procedure: InterventionType;
  approach: SurgicalApproach | null;
};
type SeniorAutonomyPoint = {
  id: string;
  index: number;
  score: number;
};
type SeniorStepStat = {
  id: string;
  label: string;
  score: number;
  sampleSize: number;
  tone: 'positive' | 'warning' | 'critical';
};

const SENIOR_POPULATION_OPTIONS: Array<{
  value: SeniorPopulationFilter;
  label: string;
}> = [
  {
    value: 'recent',
    label: 'Internes avec relations récentes',
  },
  {
    value: 'mine',
    label: 'Mes internes',
  },
  {
    value: 'all',
    label: 'Tous les internes',
  },
];

const SENIOR_FALLBACK_INTERVENTION_OPTION: SeniorInterventionFilterOption = {
  key: 'salpingectomie::coelioscopie',
  label: 'Salpingectomie cœlioscopique',
  procedure: 'salpingectomie',
  approach: 'coelioscopie',
};

const SENIOR_FALLBACK_AUTONOMY_SERIES: SeniorAutonomyPoint[] = [
  { id: 'fallback-1', index: 1, score: 25 },
  { id: 'fallback-3', index: 3, score: 35 },
  { id: 'fallback-5', index: 5, score: 45 },
  { id: 'fallback-8', index: 8, score: 58 },
  { id: 'fallback-10', index: 10, score: 66 },
  { id: 'fallback-13', index: 13, score: 72 },
  { id: 'fallback-16', index: 16, score: 78 },
  { id: 'fallback-20', index: 20, score: 85 },
  { id: 'fallback-24', index: 24, score: 92 },
];

const SENIOR_FALLBACK_STEP_STATS: SeniorStepStat[] = [
  {
    id: 'installation',
    label: 'Installation de la patiente',
    score: 100,
    sampleSize: 24,
    tone: 'positive',
  },
  {
    id: 'materiel',
    label: 'Préparation du matériel',
    score: 95,
    sampleSize: 24,
    tone: 'positive',
  },
  {
    id: 'voie-abord',
    label: 'Voie d’abord',
    score: 100,
    sampleSize: 24,
    tone: 'positive',
  },
  {
    id: 'exposition',
    label: 'Exposition des annexes',
    score: 72,
    sampleSize: 18,
    tone: 'warning',
  },
  {
    id: 'mesosalpinx',
    label: 'Section du mésosalpinx',
    score: 65,
    sampleSize: 15,
    tone: 'warning',
  },
  {
    id: 'hemostase',
    label: 'Contrôle de l’hémostase',
    score: 55,
    sampleSize: 6,
    tone: 'warning',
  },
  {
    id: 'extraction',
    label: 'Extraction de la pièce',
    score: 80,
    sampleSize: 20,
    tone: 'positive',
  },
  {
    id: 'fermeture',
    label: 'Fermeture de la voie d’abord',
    score: 90,
    sampleSize: 22,
    tone: 'positive',
  },
];

const SENIOR_CHECKLIST_LEVELS = new Set<ChecklistLevel>(['0', '1', '2', '3', '4']);

const SENIOR_CHECKLIST_STEP_META = new Map(
  allChecklistSteps.map((step, index) => [
    step.id,
    {
      label: step.label,
      order: index,
    },
  ])
);

function formatSeniorStepFallbackLabel(stepId: string) {
  return stepId
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatLongFrenchDate(value: string) {
  if (!value) {
    return 'Date non renseignée';
  }

  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`));
}

function getSeniorSemesterTone(semester: string) {
  const semesterNumber = Number(semester.replace('S', ''));

  if (semesterNumber >= 1 && semesterNumber <= 2) {
    return 'blue';
  }

  if (semesterNumber >= 3 && semesterNumber <= 8) {
    return 'green';
  }

  return 'violet';
}

function getSeniorStepTone(score: number): SeniorStepStat['tone'] {
  if (score >= 75) {
    return 'positive';
  }

  if (score >= 50) {
    return 'warning';
  }

  return 'critical';
}

function getSeniorProcedureApproachSuffix(
  procedure: InterventionType,
  approach: SurgicalApproach | null
) {
  if (approach === 'coelioscopie') {
    return 'cœlioscopique';
  }

  if (approach === 'robot') {
    return 'robot-assistée';
  }

  if (approach === 'hysteroscopie') {
    return 'hystéroscopique';
  }

  if (approach === 'laparotomie') {
    return 'par laparotomie';
  }

  if (approach === 'vnotes') {
    return 'vNOTES';
  }

  if (procedure === 'colpoclesis') {
    return 'par voie basse';
  }

  return '';
}

function formatSeniorInterventionLabel(
  procedureLabel: string,
  procedure: InterventionType,
  approach: SurgicalApproach | null
) {
  const suffix = getSeniorProcedureApproachSuffix(procedure, approach);

  return suffix ? `${procedureLabel} ${suffix}` : procedureLabel;
}

function buildSeniorInterventionOptions(
  interventions: SavedIntervention[],
  surgicalProcedureOptions: ReturnType<typeof useAppContext>['surgicalProcedureOptions']
) {
  const optionsMap = new Map<string, SeniorInterventionFilterOption>();
  optionsMap.set(
    SENIOR_FALLBACK_INTERVENTION_OPTION.key,
    SENIOR_FALLBACK_INTERVENTION_OPTION
  );

  interventions.forEach((intervention) => {
    const key = `${intervention.procedure}::${intervention.approach ?? 'none'}`;
    const procedureLabel = getChoiceLabel(
      surgicalProcedureOptions,
      intervention.procedure
    );
    const label = formatSeniorInterventionLabel(
      procedureLabel,
      intervention.procedure,
      intervention.approach
    );

    if (optionsMap.has(key)) {
      return;
    }

    optionsMap.set(key, {
      key,
      label,
      procedure: intervention.procedure,
      approach: intervention.approach,
    });
  });

  return Array.from(optionsMap.values()).sort((left, right) => {
    if (left.key === SENIOR_FALLBACK_INTERVENTION_OPTION.key) {
      return -1;
    }

    if (right.key === SENIOR_FALLBACK_INTERVENTION_OPTION.key) {
      return 1;
    }

    return left.label.localeCompare(right.label, 'fr-FR', {
      sensitivity: 'base',
    });
  });
}

function matchesSeniorInterventionOption(
  intervention: SavedIntervention,
  option: SeniorInterventionFilterOption
) {
  return (
    intervention.procedure === option.procedure &&
    (option.approach == null
      ? intervention.approach == null
      : intervention.approach === option.approach)
  );
}

function buildFallbackAutonomySeries(totalCount: number) {
  if (totalCount <= 0 || totalCount === 24) {
    return SENIOR_FALLBACK_AUTONOMY_SERIES;
  }

  const usedIndexes = new Set<number>();

  return SENIOR_FALLBACK_AUTONOMY_SERIES.map((point, index) => {
    let scaledIndex = Math.max(
      1,
      Math.min(totalCount, Math.round((point.index / 24) * totalCount))
    );

    while (usedIndexes.has(scaledIndex) && scaledIndex < totalCount) {
      scaledIndex += 1;
    }

    while (usedIndexes.has(scaledIndex) && scaledIndex > 1) {
      scaledIndex -= 1;
    }

    usedIndexes.add(scaledIndex);

    return {
      id: `fallback-series-${index}`,
      index: scaledIndex,
      score: point.score,
    };
  }).sort((left, right) => left.index - right.index);
}

function buildSeniorAutonomySeries(
  interventions: SavedIntervention[],
  evaluations: Record<string, AdminInterventionEvaluation>,
  customSurgicalInterventions: SurgicalInterventionDefinition[]
) {
  const scoredSeries = [...interventions]
    .sort((left, right) => left.savedAt.localeCompare(right.savedAt))
    .map((intervention, index) => {
      const computedScore =
        calculateAutonomyScore(
          intervention,
          customSurgicalInterventions,
          evaluations[intervention.id]
        ) ?? intervention.autonomyScore;

      return computedScore == null
        ? null
        : {
            id: intervention.id,
            index: index + 1,
            score: Math.round(computedScore),
          };
    })
    .filter((point): point is SeniorAutonomyPoint => point != null);

  if (scoredSeries.length >= 2) {
    return scoredSeries;
  }

  if (scoredSeries.length === 1 && interventions.length <= 1) {
    return scoredSeries;
  }

  return buildFallbackAutonomySeries(
    interventions.length > 0 ? interventions.length : 24
  );
}

function buildSeniorStepStats(
  interventions: SavedIntervention[],
  customSurgicalInterventions: SurgicalInterventionDefinition[]
) {
  if (!interventions.length) {
    return SENIOR_FALLBACK_STEP_STATS;
  }

  const aggregates = new Map<
    string,
    {
      label: string;
      total: number;
      count: number;
      order: number;
    }
  >();

  interventions.forEach((intervention) => {
    const definedStepMeta = new Map(
      getChecklistStepsForIntervention(
        intervention.procedure,
        intervention.indication,
        intervention.approach,
        intervention.entryTechnique,
        customSurgicalInterventions
      ).map((step, index) => {
        const fallbackMeta = SENIOR_CHECKLIST_STEP_META.get(step.id);

        return [
          step.id,
          {
            label: step.label,
            order: fallbackMeta?.order ?? index,
          },
        ];
      })
    );

    Object.entries(intervention.checklist).forEach(([stepId, level]) => {
      if (!level || !SENIOR_CHECKLIST_LEVELS.has(level)) {
        return;
      }

      const stepMeta =
        definedStepMeta.get(stepId) ??
        SENIOR_CHECKLIST_STEP_META.get(stepId) ?? {
          label: formatSeniorStepFallbackLabel(stepId),
          order: Number.MAX_SAFE_INTEGER,
        };

      const current = aggregates.get(stepId) ?? {
        label: stepMeta.label,
        total: 0,
        count: 0,
        order: stepMeta.order,
      };

      current.total += (Number(level) / 4) * 100;
      current.count += 1;
      current.order = Math.min(current.order, stepMeta.order);

      if (!current.label && stepMeta.label) {
        current.label = stepMeta.label;
      }

      aggregates.set(stepId, current);
    });
  });

  const rows = Array.from(aggregates.entries())
    .sort((left, right) => {
      const orderDifference = left[1].order - right[1].order;

      if (orderDifference !== 0) {
        return orderDifference;
      }

      return left[1].label.localeCompare(right[1].label, 'fr-FR', {
        sensitivity: 'base',
      });
    })
    .map(([id, aggregate]) => {
      const score = Math.round(aggregate.total / aggregate.count);

      return {
        id,
        label: aggregate.label,
        score,
        sampleSize: aggregate.count,
        tone: getSeniorStepTone(score),
      };
    })
    .filter((row) => row.sampleSize > 0)
    .slice(0, 8);

  return rows.length ? rows : SENIOR_FALLBACK_STEP_STATS;
}

function buildSeniorXAxisTicks(maxIndex: number) {
  if (maxIndex <= 0) {
    return [];
  }

  const ticks = new Set<number>();

  if (maxIndex < 20) {
    for (let value = 1; value <= maxIndex; value += 1) {
      ticks.add(value);
    }

    return Array.from(ticks);
  }

  if (maxIndex < 30) {
    ticks.add(1);

    for (let value = 2; value <= maxIndex; value += 2) {
      ticks.add(value);
    }

    ticks.add(maxIndex);

    return Array.from(ticks).sort((left, right) => left - right);
  }

  ticks.add(1);

  for (let value = 5; value <= maxIndex; value += 5) {
    ticks.add(value);
  }

  ticks.add(maxIndex);

  return Array.from(ticks).sort((left, right) => left - right);
}

export function AdminScreen() {
  const {
    adminEvaluations,
    createInternalProfile,
    createSeniorProfile,
    createSurgicalIntervention,
    customSeniors,
    customSurgicalInterventions,
    deleteCustomSurgicalIntervention,
    deleteInternalProfile,
    deleteSeniorProfile,
    deleteSavedInterventions,
    activityLog,
    adminTrophies,
    adminTrophyStorageWarning: trophyStorageWarning,
    internalProfiles,
    isAdmin,
    isSenior,
    logout,
    recordActivity,
    savedInterventions,
    setAdminEvaluations,
    setAdminTrophies,
    selectableSeniors,
    selectedSenior,
    surgicalProcedureOptions,
    updateInternalProfile,
    updateInternalCredentials,
    updateSeniorProfile,
    updateSeniorManagedInternals,
    updateSeniorCredentials,
    updateSurgicalIntervention,
    updateSavedInterventionAutonomyScore,
  } = useAppContext();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [view, setView] = useState<AdminView>('home');
  const [activityRange, setActivityRange] = useState<AdminActivityRange>('day');
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [selectedProfileViewSource, setSelectedProfileViewSource] =
    useState<AdminProfileViewSource>('profiles');
  const [profilesTab, setProfilesTab] = useState<ProfileAccountTab>('internal');
  const [profileEditorType, setProfileEditorType] =
    useState<ProfileAccountTab>('internal');
  const [profileSearch, setProfileSearch] = useState('');
  const [editingInternalProfileId, setEditingInternalProfileId] =
    useState<string | null>(null);
  const [profileStatsTab, setProfileStatsTab] = useState<ProfileStatsTab>('history');
  const [profileHistorySearch, setProfileHistorySearch] = useState('');
  const [profileHistorySeniorFilter, setProfileHistorySeniorFilter] = useState('all');
  const [profileHistoryStatusFilter, setProfileHistoryStatusFilter] =
    useState<ProfileHistoryStatusFilter>('all');
  const [profileHistoryDateFrom, setProfileHistoryDateFrom] = useState('');
  const [profileHistoryDateTo, setProfileHistoryDateTo] = useState('');
  const [profileHistoryPage, setProfileHistoryPage] = useState(1);
  const [profileHistoryPageSize, setProfileHistoryPageSize] = useState(
    PROFILE_HISTORY_PAGE_SIZE_OPTIONS[0]
  );
  const [profileProgressKey, setProfileProgressKey] = useState('');
  const [profileProgressPeriod, setProfileProgressPeriod] =
    useState<ProfileProgressPeriod>('12m');
  const [expandedHistoryInterventionId, setExpandedHistoryInterventionId] =
    useState<string | null>(null);
  const [trophyFilter, setTrophyFilter] = useState<AdminTrophyFilter>('all');
  const [trophySearch, setTrophySearch] = useState('');
  const [selectedTrophyId, setSelectedTrophyId] = useState<string | null>(null);
  const [trophyDraft, setTrophyDraft] = useState<AdminTrophyDefinition | null>(null);
  const [trophyFormFeedback, setTrophyFormFeedback] =
    useState<TrophyFormFeedback>(null);
  const [trophyValidationErrors, setTrophyValidationErrors] = useState<string[]>([]);
  const [uploadingTrophyImageKeys, setUploadingTrophyImageKeys] = useState<
    TrophyImageKey[]
  >([]);
  const [isSavingTrophy, setIsSavingTrophy] = useState(false);
  const hasAttemptedLegacyTrophyImageMigrationRef = useRef(false);
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
  useScrollResetOnChange([view]);
  const [showSurgicalInterventionList, setShowSurgicalInterventionList] =
    useState(false);
  const [editingSurgicalInterventionId, setEditingSurgicalInterventionId] =
    useState<InterventionType | null>(null);
  const [draggedStepLabel, setDraggedStepLabel] = useState<string | null>(null);
  const [selectedEvaluationInterventionId, setSelectedEvaluationInterventionId] =
    useState<string | null>(null);
  const [testFeedbackItems, setTestFeedbackItems] = useState<TestFeedback[]>(() =>
    loadStoredArray<TestFeedback>(TEST_FEEDBACK_STORAGE_KEY)
  );
  const [hasLoadedPersistentTestFeedback, setHasLoadedPersistentTestFeedback] =
    useState(false);
  const [testFeedbackMessage, setTestFeedbackMessage] = useState('');
  const [testFeedbackStatus, setTestFeedbackStatus] =
    useState<FeedbackState>(null);
  const [evaluationFeedback, setEvaluationFeedback] =
    useState<FeedbackState>(null);
  const [evaluationDraft, setEvaluationDraft] = useState<{
    globalPerformance: AdminPerformanceRating | null;
    categoryDifficulty: AdminCategoryDifficultyRating | null;
    seniorComment: string;
  }>({
    globalPerformance: null,
    categoryDifficulty: null,
    seniorComment: '',
  });
  const [isAutoEvaluationOpen, setIsAutoEvaluationOpen] = useState(false);

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
      void (async () => {
        const isSaved = await savePersistentArray('test_feedback', testFeedbackItems);

        if (!isSaved) {
          setTestFeedbackStatus({
            kind: 'error',
            message:
              'Les remarques de test sont bien visibles sur cet appareil, mais la synchronisation serveur a echoue. Verifie la connexion avant de recharger.',
          });
        }
      })();
    }
  }, [testFeedbackItems, hasLoadedPersistentTestFeedback]);

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
          interventionFilters.seniorId !== 'all' &&
          intervention.seniorId !== interventionFilters.seniorId
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
          interventionFilters.approach !== 'all' &&
          intervention.approach !== interventionFilters.approach
        ) {
          return false;
        }

        if (
          interventionFilters.status === 'evaluated' &&
          !hasCompleteAdminEvaluation(adminEvaluations[intervention.id])
        ) {
          return false;
        }

        if (
          interventionFilters.status === 'pending' &&
          hasCompleteAdminEvaluation(adminEvaluations[intervention.id])
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
    [adminEvaluations, interventionFilters, sortedInterventions]
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
      interventionFilters.seniorId !== 'all' ||
      interventionFilters.procedure !== 'all' ||
      interventionFilters.approach !== 'all' ||
      interventionFilters.status !== 'all' ||
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
  const filteredInterventionsEvaluatedCount = useMemo(
    () =>
      filteredInterventions.filter((intervention) =>
        hasCompleteAdminEvaluation(adminEvaluations[intervention.id])
      ).length,
    [adminEvaluations, filteredInterventions]
  );
  const filteredInterventionsPendingCount =
    filteredInterventions.length - filteredInterventionsEvaluatedCount;
  const trophyCards = useMemo<AdminTrophyCardItem[]>(
    () =>
      adminTrophies.map((trophy) => {
        const obtainedCount = countProfilesWithTrophy(
          trophy,
          internalProfiles,
          savedInterventions,
          adminEvaluations
        );
        const previewProfile = internalProfiles[0] ?? null;

        return {
          ...trophy,
          obtainedCount,
          unlockedTier: previewProfile
            ? getUnlockedTrophyTierForProfile(
                trophy,
                previewProfile,
                savedInterventions,
                adminEvaluations
              )
            : null,
          ruleSummary: buildTrophyRuleSummary(trophy),
        };
      }),
    [adminEvaluations, adminTrophies, internalProfiles, savedInterventions]
  );
  const activityBuckets = useMemo(
    () => buildAdminActivityBuckets(sortedInterventions, adminEvaluations, activityRange),
    [activityRange, adminEvaluations, sortedInterventions]
  );
  useEffect(() => {
    if (activityRange === 'week') {
      setActivityRange('day');
    }
  }, [activityRange]);

  const activityTotals = useMemo(() => {
    const totalRecorded = activityBuckets.reduce(
      (total, bucket) => total + bucket.recordedCount,
      0
    );
    const totalEvaluated = activityBuckets.reduce(
      (total, bucket) => total + bucket.evaluatedCount,
      0
    );
    const totalPending = Math.max(0, totalRecorded - totalEvaluated);

    return {
      totalRecorded,
      totalEvaluated,
      totalPending,
      evaluationRate:
        totalRecorded > 0 ? Math.round((totalEvaluated / totalRecorded) * 100) : 0,
      chartMax: Math.max(
        ...activityBuckets.flatMap((bucket) => [
          bucket.recordedCount,
          bucket.evaluatedCount,
        ]),
        1
      ),
    };
  }, [activityBuckets]);
  const userConnections = useMemo(() => {
    const internalConnections: AdminUserConnection[] = internalProfiles
      .filter((profile) => profile.lastLoginAt)
      .map((profile) => ({
        actorRole: 'internal',
        id: profile.id,
        name: formatDisplayName(profile.firstName, profile.lastName),
        role: 'Interne',
        lastLoginAt: profile.lastLoginAt as string,
      }));
    const seniorConnections: AdminUserConnection[] = selectableSeniors
      .filter(
        (senior) =>
          senior.id !== 'sen-other' &&
          senior.lastLoginAt != null
      )
      .map((senior) => ({
        actorRole: 'senior',
        id: senior.id,
        name: formatSeniorDisplayName(senior),
        role: 'Senior',
        lastLoginAt: senior.lastLoginAt as string,
      }));

    return [...internalConnections, ...seniorConnections].sort((left, right) =>
      right.lastLoginAt.localeCompare(left.lastLoginAt)
    );
  }, [internalProfiles, selectableSeniors]);
  const recentUserConnections = useMemo(() => {
    const now = Date.now();
    const fortyEightHoursInMs = 48 * 60 * 60 * 1000;

    return userConnections.filter((connection) => {
      const timestamp = new Date(connection.lastLoginAt).getTime();

      return !Number.isNaN(timestamp) && now - timestamp <= fortyEightHoursInMs;
    });
  }, [userConnections]);
  const recentActivitiesByActor = useMemo(() => {
    return activityLog.reduce<Record<string, ActivityLogEntry[]>>((accumulator, entry) => {
      if (!entry.actorId || entry.actorRole === 'admin') {
        return accumulator;
      }

      const actorKey = `${entry.actorRole}:${entry.actorId}`;
      const currentEntries = accumulator[actorKey] ?? [];

      currentEntries.push(entry);
      accumulator[actorKey] = currentEntries;

      return accumulator;
    }, {});
  }, [activityLog]);
  const customSeniorAccounts = useMemo(
    () => customSeniors.filter((senior) => senior.isCustom),
    [customSeniors]
  );
  const getConnectionActivities = (connection: AdminUserConnection) =>
    (recentActivitiesByActor[`${connection.actorRole}:${connection.id}`] ?? [])
      .filter((entry) => entry.createdAt >= connection.lastLoginAt)
      .slice(0, 3);
  const filteredAdminTrophies = useMemo(() => {
    const normalizedSearch = trophySearch.trim().toLocaleLowerCase('fr-FR');

    return trophyCards.filter((trophy) => {
      if (trophyFilter === 'operatoire' && trophy.type !== 'operatoire') {
        return false;
      }

      if (trophyFilter === 'special' && trophy.type !== 'special') {
        return false;
      }

      if (
        (trophyFilter === 'draft' ||
          trophyFilter === 'active' ||
          trophyFilter === 'inactive') &&
        trophy.status !== trophyFilter
      ) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      return (
        trophy.title.toLocaleLowerCase('fr-FR').includes(normalizedSearch) ||
        trophy.description.toLocaleLowerCase('fr-FR').includes(normalizedSearch) ||
        trophy.ruleSummary.toLocaleLowerCase('fr-FR').includes(normalizedSearch)
      );
    });
  }, [trophyCards, trophyFilter, trophySearch]);
  const selectedTrophy =
    trophyCards.find((trophy) => trophy.id === selectedTrophyId) ??
    filteredAdminTrophies[0] ??
    trophyCards[0] ??
    null;

  const profilesForAdminList = useMemo(
    () =>
      [...internalProfiles].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt)
      ),
    [internalProfiles]
  );
  const seniorProfilesForAdminList = useMemo(
    () =>
      [...customSeniorAccounts].sort((left, right) =>
        (right.createdAt ?? '').localeCompare(left.createdAt ?? '')
      ),
    [customSeniorAccounts]
  );
  const allSeniorProfilesForAdminList = useMemo(
    () =>
      selectableSeniors
        .filter((senior) => senior.id !== 'sen-other')
        .sort((left, right) =>
          (right.createdAt ?? '').localeCompare(left.createdAt ?? '')
        ),
    [selectableSeniors]
  );
  const activeProfilesSearch = profileSearch.trim().toLocaleLowerCase('fr-FR');
  const filteredInternalProfiles = useMemo(
    () =>
      profilesForAdminList.filter((profile) => {
        if (!activeProfilesSearch) {
          return true;
        }

        return [
          formatDisplayName(profile.firstName, profile.lastName),
          profile.loginId,
          profile.promotion,
          profile.currentRotation,
          profile.semester,
        ]
          .join(' ')
          .toLocaleLowerCase('fr-FR')
          .includes(activeProfilesSearch);
      }),
    [activeProfilesSearch, profilesForAdminList]
  );
  const filteredSeniorProfiles = useMemo(
    () =>
      allSeniorProfilesForAdminList.filter((senior) => {
        if (!activeProfilesSearch) {
          return true;
        }

        return [
          formatSeniorDisplayName(senior),
          senior.loginId ?? '',
        ]
          .join(' ')
          .toLocaleLowerCase('fr-FR')
          .includes(activeProfilesSearch);
      }),
    [activeProfilesSearch, allSeniorProfilesForAdminList]
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
      earnedBadgesCount:
        selectedProfileEarnedBadges.length ||
        selectedProfile.achievementBadges?.length ||
        0,
    };
  }, [selectedProfile, selectedProfileEarnedBadges.length, selectedProfileInterventions]);
  const selectedProfileDisplayName = selectedProfile
    ? formatDisplayName(selectedProfile.firstName, selectedProfile.lastName)
    : '';
  const selectedProfileHistoryRows = useMemo(() => {
    if (!selectedProfile) {
      return [];
    }

    const searchValue = profileHistorySearch.trim().toLocaleLowerCase('fr-FR');

    return selectedProfileInterventions.filter((intervention) => {
      const evaluation = adminEvaluations[intervention.id];
      const status = getProfileHistoryStatus(evaluation);
      const senior = selectableSeniors.find(
        (seniorItem) => seniorItem.id === intervention.seniorId
      );
      const searchHaystack = [
        getChoiceLabel(surgicalProcedureOptions, intervention.procedure),
        getInterventionApproachLabel(intervention),
        getInterventionIndicationLabel(intervention),
        senior ? formatSeniorDisplayName(senior) : '',
      ]
        .join(' ')
        .toLocaleLowerCase('fr-FR');

      if (searchValue && !searchHaystack.includes(searchValue)) {
        return false;
      }

      if (
        profileHistorySeniorFilter !== 'all' &&
        intervention.seniorId !== profileHistorySeniorFilter
      ) {
        return false;
      }

      if (
        profileHistoryStatusFilter !== 'all' &&
        status !== profileHistoryStatusFilter
      ) {
        return false;
      }

      if (profileHistoryDateFrom && intervention.date < profileHistoryDateFrom) {
        return false;
      }

      if (profileHistoryDateTo && intervention.date > profileHistoryDateTo) {
        return false;
      }

      return true;
    });
  }, [
    adminEvaluations,
    profileHistoryDateFrom,
    profileHistoryDateTo,
    profileHistorySearch,
    profileHistorySeniorFilter,
    profileHistoryStatusFilter,
    selectableSeniors,
    selectedProfile,
    selectedProfileInterventions,
    surgicalProcedureOptions,
  ]);
  const selectedProfileEvaluatedInterventions = useMemo(
    () =>
      selectedProfileInterventions.filter(
        (intervention) =>
          getProfileHistoryStatus(adminEvaluations[intervention.id]) === 'evaluated' &&
          intervention.autonomyScore != null
      ),
    [adminEvaluations, selectedProfileInterventions]
  );
  const selectedProfileEvaluationRate = useMemo(() => {
    if (!selectedProfileInterventions.length) {
      return 0;
    }

    return Math.round(
      (selectedProfileEvaluatedInterventions.length /
        selectedProfileInterventions.length) *
        100
    );
  }, [selectedProfileEvaluatedInterventions.length, selectedProfileInterventions.length]);
  const paginatedProfileHistoryRows = useMemo(() => {
    const pageStart = (profileHistoryPage - 1) * profileHistoryPageSize;

    return selectedProfileHistoryRows.slice(
      pageStart,
      pageStart + profileHistoryPageSize
    );
  }, [profileHistoryPage, profileHistoryPageSize, selectedProfileHistoryRows]);
  const profileHistoryPageCount = Math.max(
    1,
    Math.ceil(selectedProfileHistoryRows.length / profileHistoryPageSize)
  );
  const selectedProfileProgressOptions = useMemo(() => {
    const groupedOptions = selectedProfileInterventions.reduce<
      Array<{
        key: string;
        label: string;
      }>
    >((options, intervention) => {
      const key = `${intervention.procedure}::${intervention.approach ?? 'all'}`;

      if (options.some((option) => option.key === key)) {
        return options;
      }

      const procedureLabel = getChoiceLabel(
        surgicalProcedureOptions,
        intervention.procedure
      );
      const approachLabel = getInterventionApproachLabel(intervention);

      options.push({
        key,
        label: `${procedureLabel} · ${approachLabel}`,
      });

      return options;
    }, []);

    return groupedOptions;
  }, [selectedProfileInterventions, surgicalProcedureOptions]);
  const selectedProfileProgressInterventions = useMemo(() => {
    const now = new Date();
    const periodStart =
      profileProgressPeriod === 'all'
        ? null
        : addMonths(
            new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0),
            profileProgressPeriod === '3m'
              ? -2
              : profileProgressPeriod === '6m'
                ? -5
                : -11
          );

    return selectedProfileInterventions
      .filter((intervention) => {
        if (profileProgressKey) {
          const interventionKey = `${intervention.procedure}::${intervention.approach ?? 'all'}`;

          if (interventionKey !== profileProgressKey) {
            return false;
          }
        }

        if (!periodStart) {
          return true;
        }

        return parseIsoDateValue(intervention.date) >= periodStart;
      })
      .sort((left, right) => left.date.localeCompare(right.date));
  }, [profileProgressKey, profileProgressPeriod, selectedProfileInterventions]);
  const selectedProfileProgressSeries = useMemo(
    () =>
      selectedProfileProgressInterventions
        .filter(
          (intervention) =>
            getProfileHistoryStatus(adminEvaluations[intervention.id]) === 'evaluated' &&
            intervention.autonomyScore != null
        )
        .map((intervention, index) => ({
          id: intervention.id,
          date: intervention.date,
          index: index + 1,
          score: Math.round(intervention.autonomyScore ?? 0),
        })),
    [adminEvaluations, selectedProfileProgressInterventions]
  );
  const selectedProfileLastRecordedAt = useMemo(() => {
    const latestIntervention = [...selectedProfileProgressInterventions].sort((left, right) =>
      (right.savedAt ?? '').localeCompare(left.savedAt ?? '')
    )[0];

    return latestIntervention?.savedAt ?? null;
  }, [selectedProfileProgressInterventions]);
  const selectedProfileStepRows = useMemo(() => {
    const bucketStats = selectedProfileProgressInterventions.reduce<
      Record<OperativeBucketId, { label: string; values: number[] }>
    >(
      (accumulator, intervention) => {
        const checklistSteps = getChecklistStepsForIntervention(
          intervention.procedure,
          intervention.indication,
          intervention.approach,
          intervention.entryTechnique,
          customSurgicalInterventions
        );

        checklistSteps.forEach((step) => {
          const numericValue = getChecklistLevelNumericValue(
            intervention.checklist[step.id]
          );

          if (numericValue == null) {
            return;
          }

          const bucketId = getOperativeBucketId(step.label);

          accumulator[bucketId].values.push(Math.round((numericValue / 4) * 100));
        });

        return accumulator;
      },
      {
        installation: { label: getOperativeBucketLabel('installation'), values: [] },
        ouverture: { label: getOperativeBucketLabel('ouverture'), values: [] },
        exposition: { label: getOperativeBucketLabel('exposition'), values: [] },
        gestes: { label: getOperativeBucketLabel('gestes'), values: [] },
        hemostase: { label: getOperativeBucketLabel('hemostase'), values: [] },
        fermeture: { label: getOperativeBucketLabel('fermeture'), values: [] },
        autres: { label: getOperativeBucketLabel('autres'), values: [] },
      }
    );

    return (Object.entries(bucketStats) as Array<
      [OperativeBucketId, { label: string; values: number[] }]
    >)
      .filter(([, value]) => value.values.length > 0)
      .map(([bucketId, value]) => ({
        id: bucketId,
        label: value.label,
        score: Math.round(averageNumbers(value.values) ?? 0),
        sampleSize: value.values.length,
        tone: getSeniorStepTone(Math.round(averageNumbers(value.values) ?? 0)),
      }))
      .sort(
        (left, right) =>
          getOperativeBucketOrder(left.id) - getOperativeBucketOrder(right.id)
      );
  }, [customSurgicalInterventions, selectedProfileProgressInterventions]);
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

  useEffect(() => {
    if (!selectedEvaluationInterventionId) {
      return;
    }

    setEvaluationDraft({
      globalPerformance: selectedEvaluation?.globalPerformance ?? null,
      categoryDifficulty: selectedEvaluation?.categoryDifficulty ?? null,
      seniorComment: selectedEvaluation?.seniorComment ?? '',
    });
    setIsAutoEvaluationOpen(false);
  }, [
    selectedEvaluation?.categoryDifficulty,
    selectedEvaluation?.globalPerformance,
    selectedEvaluation?.seniorComment,
    selectedEvaluationInterventionId,
  ]);

  useEffect(() => {
    setProfileHistoryPage(1);
  }, [
    profileHistoryDateFrom,
    profileHistoryDateTo,
    profileHistorySearch,
    profileHistorySeniorFilter,
    profileHistoryStatusFilter,
    selectedProfileId,
  ]);

  useEffect(() => {
    if (profileHistoryPage > profileHistoryPageCount) {
      setProfileHistoryPage(profileHistoryPageCount);
    }
  }, [profileHistoryPage, profileHistoryPageCount]);

  useEffect(() => {
    setExpandedHistoryInterventionId(null);
  }, [profileHistoryPage, selectedProfileId, profileStatsTab]);

  useEffect(() => {
    if (
      profileProgressKey &&
      !selectedProfileProgressOptions.some((option) => option.key === profileProgressKey)
    ) {
      setProfileProgressKey(selectedProfileProgressOptions[0]?.key ?? '');
      return;
    }

    if (!profileProgressKey && selectedProfileProgressOptions.length > 0) {
      setProfileProgressKey(selectedProfileProgressOptions[0].key);
    }
  }, [profileProgressKey, selectedProfileProgressOptions]);

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

  const openProfileStats = (
    profile: InternalProfile,
    source: AdminProfileViewSource
  ) => {
    setSelectedProfileId(profile.id);
    setSelectedProfileViewSource(source);
    setView('profile');
    recordActivity(
      'Consultation des statistiques d’un interne',
      'Interne',
      formatDisplayName(profile.firstName, profile.lastName)
    );
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
    recordActivity('Remarque de test envoyée', 'Remarque', message);
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
    if (!isSenior) {
      return;
    }

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
        seniorComment: '',
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

  const handleValidateSeniorEvaluation = () => {
    if (!selectedEvaluationIntervention) {
      return;
    }

    if (!evaluationDraft.globalPerformance || !evaluationDraft.categoryDifficulty) {
      setEvaluationFeedback({
        kind: 'error',
        message: 'Sélectionnez une performance et une difficulté avant de valider.',
      });
      return;
    }

    const timestamp = new Date().toISOString();
    const nextEvaluation: AdminInterventionEvaluation = {
      interventionId: selectedEvaluationIntervention.id,
      globalPerformance: evaluationDraft.globalPerformance,
      categoryDifficulty: evaluationDraft.categoryDifficulty,
      seniorComment: evaluationDraft.seniorComment.trim(),
      updatedAt: timestamp,
    };
    const nextAutonomyScore = calculateAutonomyScore(
      selectedEvaluationIntervention,
      customSurgicalInterventions,
      nextEvaluation
    );

    setAdminEvaluations((current) => ({
      ...current,
      [selectedEvaluationIntervention.id]: nextEvaluation,
    }));
    updateSavedInterventionAutonomyScore(
      selectedEvaluationIntervention.id,
      nextAutonomyScore
    );
    setEvaluationFeedback({
      kind: 'success',
      message: 'Évaluation senior validée.',
    });
    if (selectedEvaluationInternal) {
      recordActivity(
        'Évaluation d’un interne validée',
        'Interne',
        formatDisplayName(
          selectedEvaluationInternal.firstName,
          selectedEvaluationInternal.lastName
        )
      );
    }
    setSelectedEvaluationInterventionId(null);
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

  const resetInternalEditor = () => {
    setEditingInternalProfileId(null);
    setCreateForm(EMPTY_CREATE_FORM);
    setFeedback(null);
  };

  const resetSeniorEditor = () => {
    setEditingSeniorId(null);
    setCreateSeniorForm(EMPTY_CREATE_SENIOR_FORM);
    setSeniorFeedback(null);
  };

  const openProfileEditor = (type: ProfileAccountTab) => {
    setProfileEditorType(type);
    setProfilesTab(type);

    if (type === 'internal') {
      resetSeniorEditor();
      resetInternalEditor();
      return;
    }

    resetInternalEditor();
    resetSeniorEditor();
  };

  const startInternalEdition = (profile: InternalProfile) => {
    setProfilesTab('internal');
    setProfileEditorType('internal');
    setEditingSeniorId(null);
    setCreateForm({
      firstName: profile.firstName,
      lastName: profile.lastName,
      loginId: profile.loginId,
      password: profile.password,
      promotion: profile.promotion,
      semester: profile.semester,
      currentRotation: profile.currentRotation,
    });
    setEditingInternalProfileId(profile.id);
    setFeedback(null);
  };

  const startSeniorEdition = (senior: Senior) => {
    setProfilesTab('senior');
    setProfileEditorType('senior');
    setEditingInternalProfileId(null);
    setCreateSeniorForm({
      firstName: senior.firstName,
      lastName: senior.lastName,
      loginId: senior.loginId ?? '',
      password: senior.password ?? '',
    });
    setEditingSeniorId(senior.id);
    setSeniorFeedback(null);
    setSeniorAccountFeedback(null);
  };

  const startSeniorCredentialsEdition = (senior: Senior) => {
    startSeniorEdition(senior);
    setCreateSeniorForm((current) => ({
      ...current,
      password: '',
    }));
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

    const result =
      editingInternalProfileId != null
        ? updateInternalProfile(editingInternalProfileId, createForm)
        : createInternalProfile(createForm);

    setFeedback({
      kind: result.success ? 'success' : 'error',
      message: result.success && result.profile
        ? `${result.message} Identifiant : ${result.profile.loginId} · Mot de passe : ${result.profile.password}`
        : result.message,
    });

    if (!result.success) {
      return;
    }

    setEditingInternalProfileId(null);
    setCreateForm(EMPTY_CREATE_FORM);
  };

  const handleCreateSeniorProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSeniorAccountFeedback(null);

    const result =
      editingSeniorId != null
        ? updateSeniorProfile(editingSeniorId, createSeniorForm)
        : createSeniorProfile(createSeniorForm);

    setSeniorFeedback({
      kind: result.success ? 'success' : 'error',
      message: result.success && result.senior
        ? `${result.message} Identifiant : ${result.senior.loginId} · Mot de passe : ${result.senior.password}`
        : result.message,
    });

    if (!result.success) {
      return;
    }

    setEditingSeniorId(null);
    setCreateSeniorForm(EMPTY_CREATE_SENIOR_FORM);
  };

  const handlePrepareInternalPasswordReset = (profile: InternalProfile) => {
    startInternalEdition(profile);
    setCreateForm((current) => ({
      ...current,
      password: '',
    }));
    setFeedback({
      kind: 'success',
      message:
        'Saisissez un nouveau mot de passe temporaire dans le panneau de droite puis enregistrez la modification.',
    });
  };

  const handlePrepareSeniorPasswordReset = (senior: Senior) => {
    startSeniorEdition(senior);
    setCreateSeniorForm((current) => ({
      ...current,
      password: '',
    }));
    setSeniorFeedback({
      kind: 'success',
      message:
        'Saisissez un nouveau mot de passe temporaire dans le panneau de droite puis enregistrez la modification.',
    });
  };

  const handleUpdateSeniorCredentials = (
    event: FormEvent<HTMLFormElement>,
    seniorId: string
  ) => {
    event.preventDefault();
    setSeniorFeedback(null);

    const result = updateSeniorCredentials(
      seniorId,
      {
        ...editSeniorCredentialsForm,
        mustChangePassword: true,
      }
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

  const handleAdminSupportClick = () => {
    if (typeof window !== 'undefined') {
      window.location.href =
        'mailto:support@chu-nantes.fr?subject=Support%20espace%20administrateur';
    }
  };

  const handleCreateTrophy = () => {
    setTrophyDraft(null);
    setTrophyFormFeedback(null);
    setTrophyValidationErrors([]);
    setView('trophy-create-type');
  };

  const handleStartTrophyCreation = (type: TrophyType) => {
    const nextDraft = createEmptyTrophyDefinition(type);

    setTrophyDraft(nextDraft);
    setSelectedTrophyId(nextDraft.id);
    setTrophyFormFeedback(null);
    setTrophyValidationErrors([]);
    setView('trophy-editor');
  };

  const handleEditTrophy = (trophyId: string) => {
    const existingTrophy =
      adminTrophies.find((trophy) => trophy.id === trophyId) ?? null;

    if (!existingTrophy) {
      return;
    }

    setTrophyDraft(ensureTrophyDefinitionShape(existingTrophy));
    setSelectedTrophyId(trophyId);
    setTrophyFormFeedback(null);
    setTrophyValidationErrors([]);
    setView('trophy-editor');
  };

  const handleDuplicateTrophy = (trophy: AdminTrophyDefinition) => {
    const duplicate = cloneTrophyDefinition(trophy);

    setTrophyDraft(duplicate);
    setSelectedTrophyId(duplicate.id);
    setTrophyFormFeedback({
      kind: 'success',
      message: 'Une copie brouillon a été préparée. Vous pouvez la modifier avant enregistrement.',
    });
    setTrophyValidationErrors([]);
    setView('trophy-editor');
  };

  const handleDeleteTrophy = (trophyId: string) => {
    const confirmed = window.confirm('Supprimer ce trophée ?');

    if (!confirmed) {
      return;
    }

    setAdminTrophies((current) => current.filter((trophy) => trophy.id !== trophyId));
    setSelectedTrophyId((current) => (current === trophyId ? null : current));
    if (trophyDraft?.id === trophyId) {
      setTrophyDraft(null);
      setView('trophies');
    }
  };

  const handleTrophyStatusToggle = (trophyId: string) => {
    setAdminTrophies((current) =>
      current.map((trophy) =>
        trophy.id === trophyId
          ? {
              ...trophy,
              status:
                trophy.status === 'active'
                  ? 'inactive'
                  : trophy.status === 'inactive'
                    ? 'active'
                    : 'active',
              updatedAt: new Date().toISOString(),
            }
          : trophy
      )
    );
  };

  const updateTrophyDraft = (
    updater: (current: AdminTrophyDefinition) => AdminTrophyDefinition
  ) => {
    setTrophyDraft((current) => {
      if (!current) {
        return current;
      }

      return updater(current);
    });
    setTrophyFormFeedback(null);
  };

  const handleTrophyDraftFieldChange = (
    field: keyof AdminTrophyDefinition,
    value: string
  ) => {
    updateTrophyDraft((current) => {
      const nextDraft = {
        ...current,
        [field]: value,
        updatedAt: new Date().toISOString(),
      };

      if (field === 'type') {
        const nextType = value as TrophyType;

        nextDraft.format = nextType === 'operatoire' ? 'levels' : 'unique';
        nextDraft.visibility = nextType === 'operatoire' ? 'visible' : 'surprise';
        nextDraft.conditions =
          nextType === 'operatoire'
            ? nextDraft.conditions
            : nextDraft.conditions.length
              ? nextDraft.conditions
              : [createEmptyTrophyCondition('total_recorded')];
        nextDraft.levels =
          nextType === 'operatoire' ? createDefaultTrophyLevels() : [];
      }

      if (field === 'format') {
        nextDraft.levels =
          value === 'levels' ? createDefaultTrophyLevels() : [];
      }

      if (field === 'visibility') {
        nextDraft.visibility = value as TrophyVisibility;
      }

      if (field === 'operativeScope') {
        nextDraft.operativeScope = value as TrophyOperativeScope;

        if (value === 'approach') {
          nextDraft.associatedProcedure = '';
        }
      }

      if (field === 'trackedInterventionStatus') {
        nextDraft.trackedInterventionStatus = value as TrophyTrackedStatus;
        nextDraft.levels = nextDraft.levels.map((level) => ({
          ...level,
          trackedStatus: value as TrophyTrackedStatus,
        }));
      }

      return nextDraft;
    });
  };

  const handleTrophyConditionFieldChange = (
    conditionId: string,
    field: keyof TrophyCondition,
    value: string | number | null
  ) => {
    updateTrophyDraft((current) => ({
      ...current,
      conditions: current.conditions.map((condition) =>
        condition.id === conditionId
          ? {
              ...condition,
              [field]: value,
            }
          : condition
      ),
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleTrophyConditionTypeChange = (
    conditionId: string,
    nextType: TrophyConditionType
  ) => {
    updateTrophyDraft((current) => ({
      ...current,
      conditions: current.conditions.map((condition) =>
        condition.id === conditionId
          ? {
              ...createEmptyTrophyCondition(nextType),
              id: condition.id,
            }
          : condition
      ),
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleAddTrophyCondition = () => {
    updateTrophyDraft((current) => ({
      ...current,
      conditions: [...current.conditions, createEmptyTrophyCondition()],
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleDeleteTrophyCondition = (conditionId: string) => {
    updateTrophyDraft((current) => ({
      ...current,
      conditions: current.conditions.filter((condition) => condition.id !== conditionId),
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleTrophyLevelChange = (
    tier: TrophyLevelDefinition['tier'],
    field: keyof TrophyLevelDefinition,
    value: string | number | null
  ) => {
    updateTrophyDraft((current) => ({
      ...current,
      levels: current.levels.map((level) =>
        level.tier === tier
          ? {
              ...level,
              [field]: value,
            }
          : level
      ),
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleTrophyImageUpload = async (
    imageKey: TrophyImageKey,
    file: File | null
  ) => {
    if (!file) {
      return;
    }

    setTrophyFormFeedback(null);
    setUploadingTrophyImageKeys((current) =>
      current.includes(imageKey) ? current : [...current, imageKey]
    );

    try {
      const { publicUrl } = await uploadTrophyImage({
        file,
        fileName: file.name,
        imageKey,
        trophyId: trophyDraft?.id ?? 'trophy',
      });

      const nextImageValue = publicUrl;
      updateTrophyDraft((current) => ({
        ...current,
        images: {
          ...current.images,
          [imageKey]: nextImageValue,
        },
        levels: current.levels.map((level) =>
          level.tier === imageKey
            ? {
                ...level,
                imageSrc: nextImageValue,
              }
            : level
        ),
        updatedAt: new Date().toISOString(),
      }));

      setTrophyFormFeedback({
        kind: 'success',
        message: 'L’image du trophée a été téléversée sur le serveur.',
      });
    } catch (error) {
      setTrophyFormFeedback({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Le téléversement de l’image du trophée a échoué.',
      });
    } finally {
      setUploadingTrophyImageKeys((current) =>
        current.filter((currentKey) => currentKey !== imageKey)
      );
    }
  };

  const handleTrophyImageRemove = (imageKey: TrophyImageKey) => {
    updateTrophyDraft((current) => ({
      ...current,
      images: {
        ...current.images,
        [imageKey]: null,
      },
      levels: current.levels.map((level) =>
        level.tier === imageKey
          ? {
              ...level,
              imageSrc: null,
            }
          : level
      ),
      updatedAt: new Date().toISOString(),
    }));
  };

  const getTrophyImageFileExtension = (contentType: string) => {
    if (contentType === 'image/png') {
      return 'png';
    }

    if (contentType === 'image/webp') {
      return 'webp';
    }

    if (contentType === 'image/gif') {
      return 'gif';
    }

    return 'jpg';
  };

  const hasLegacyTrophyImage = (imageValue: string | null) =>
    Boolean(imageValue && imageValue.startsWith('data:'));

  const uploadLegacyTrophyImages = async (
    definition: AdminTrophyDefinition
  ): Promise<AdminTrophyDefinition> => {
    const nextDefinition = ensureTrophyDefinitionShape(definition);
    const imageKeys = TROPHY_IMAGE_FIELDS.map((field) => field.key);

    for (const imageKey of imageKeys) {
      const imageValue = nextDefinition.images[imageKey];

      if (!imageValue || !hasLegacyTrophyImage(imageValue)) {
        continue;
      }

      const imageResponse = await fetch(imageValue);
      const imageBlob = await imageResponse.blob();
      const extension = getTrophyImageFileExtension(imageBlob.type);
      const imageFile = new File([imageBlob], `${imageKey}.${extension}`, {
        type: imageBlob.type || 'image/jpeg',
      });
      const { publicUrl } = await uploadTrophyImage({
        file: imageFile,
        fileName: imageFile.name,
        imageKey,
        trophyId: nextDefinition.id,
      });

      nextDefinition.images[imageKey] = publicUrl;
      nextDefinition.levels = nextDefinition.levels.map((level) =>
        level.tier === imageKey
          ? {
              ...level,
              imageSrc: publicUrl,
            }
          : level
      );
    }

    return nextDefinition;
  };

  useEffect(() => {
    if (
      !isAdmin ||
      trophyDraft ||
      view === 'trophy-editor' ||
      hasAttemptedLegacyTrophyImageMigrationRef.current
    ) {
      return;
    }

    const legacyTrophies = adminTrophies.filter((trophy) =>
      Object.values(ensureTrophyDefinitionShape(trophy).images).some((imageValue) =>
        hasLegacyTrophyImage(imageValue)
      )
    );

    if (!legacyTrophies.length) {
      hasAttemptedLegacyTrophyImageMigrationRef.current = true;
      return;
    }

    hasAttemptedLegacyTrophyImageMigrationRef.current = true;

    let isCancelled = false;

    async function migrateLegacyTrophyImages() {
      try {
        const migratedTrophies = await Promise.all(
          legacyTrophies.map((trophy) => uploadLegacyTrophyImages(trophy))
        );

        if (isCancelled) {
          return;
        }

        const migratedTrophyMap = new Map(
          migratedTrophies.map((trophy) => [
            trophy.id,
            {
              ...trophy,
              updatedAt: new Date().toISOString(),
            },
          ])
        );

        setAdminTrophies((current) =>
          current.map((trophy) => migratedTrophyMap.get(trophy.id) ?? trophy)
        );
      } catch (error) {
        console.warn('Legacy trophy image migration failed', error);
      }
    }

    void migrateLegacyTrophyImages();

    return () => {
      isCancelled = true;
    };
  }, [adminTrophies, isAdmin, setAdminTrophies, trophyDraft, view]);

  const handleSaveTrophy = async () => {
    if (!trophyDraft) {
      return;
    }

    const normalizedDraft = ensureTrophyDefinitionShape(trophyDraft);
    const errors = validateTrophyDefinition(normalizedDraft);

    setTrophyValidationErrors(errors);

    if (errors.length > 0) {
      setTrophyFormFeedback({
        kind: 'error',
        message: 'Complétez les champs requis avant d’enregistrer le trophée.',
      });
      return;
    }

    const existingTrophy =
      adminTrophies.find((trophy) => trophy.id === normalizedDraft.id) ?? null;

    if (existingTrophy?.status === 'active') {
      const confirmed = window.confirm(
        'Modifier cette règle peut recalculer l’attribution du trophée pour tous les internes.'
      );

      if (!confirmed) {
        return;
      }
    }

    setIsSavingTrophy(true);
    setTrophyFormFeedback(null);

    try {
      const migratedDraft = await uploadLegacyTrophyImages(normalizedDraft);

      setAdminTrophies((current) => {
        const nextTrophy = {
          ...migratedDraft,
          updatedAt: new Date().toISOString(),
        };

        return existingTrophy
          ? current.map((trophy) =>
              trophy.id === nextTrophy.id ? nextTrophy : trophy
            )
          : [nextTrophy, ...current];
      });
      setSelectedTrophyId(migratedDraft.id);
      setTrophyFormFeedback({
        kind: 'success',
        message: 'Le trophée a été enregistré.',
      });
      setView('trophies');
      setTrophyDraft(null);
    } catch (error) {
      setTrophyFormFeedback({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Le trophée n’a pas pu être enregistré.',
      });
    } finally {
      setIsSavingTrophy(false);
    }
  };

  const handleCancelTrophyEditor = () => {
    setTrophyDraft(null);
    setTrophyValidationErrors([]);
    setTrophyFormFeedback(null);
    setView('trophies');
  };

  const handleExportFilteredBlocks = () => {
    downloadInterventionsExcel(
      filteredInterventions,
      internalProfiles,
      customSurgicalInterventions,
      adminEvaluations,
      selectableSeniors
    );
  };

  const handleExport = () => {
    downloadInterventionsExcel(
      selectedInterventions,
      internalProfiles,
      customSurgicalInterventions,
      adminEvaluations,
      selectableSeniors
    );
  };

  const handleSelectedProfileExport = () => {
    downloadInterventionsExcel(
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
    const selectedEvaluationApproachLabel =
      selectedEvaluationIntervention.approach
        ? getChoiceLabel(
            approachOptions,
            selectedEvaluationIntervention.approach
          )
        : 'Non renseignée';
    const selectedEvaluationEntryTechniqueLabel =
      selectedEvaluationIntervention.entryTechnique
        ? getChoiceLabel(
            entryTechniqueOptions,
            selectedEvaluationIntervention.entryTechnique
          )
        : 'Non renseignée';
    const selectedEvaluationInterventionLabel = formatSeniorInterventionLabel(
      procedureLabel,
      selectedEvaluationIntervention.procedure,
      selectedEvaluationIntervention.approach
    );
    const selectedEvaluationInternalName = selectedEvaluationInternal
      ? formatDisplayName(
          selectedEvaluationInternal.firstName,
          selectedEvaluationInternal.lastName
        )
      : 'Interne non retrouvé';
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
    const selectedEvaluationKeyStepRows = selectedEvaluationDefinition
      ? selectedEvaluationChecklistSteps.filter((step) =>
          selectedEvaluationDefinition.keyStepIds.includes(step.id)
        )
      : [];
    const selectedEvaluationKeyStepScores = selectedEvaluationKeyStepRows
      .map((step) => selectedEvaluationIntervention.checklist[step.id])
      .filter((level): level is '0' | '1' | '2' | '3' | '4' =>
        ['0', '1', '2', '3', '4'].includes(level ?? '')
      )
      .map((level) => Number(level));
    const selectedEvaluationKeyStepScore =
      selectedEvaluationKeyStepScores.length > 0
        ? Math.round(
            (selectedEvaluationKeyStepScores.reduce(
              (total, score) => total + score,
              0
            ) /
              selectedEvaluationKeyStepScores.length /
              4) *
              100
          )
        : null;
    const selectedPerformanceOption = evaluationDraft.globalPerformance
      ? ADMIN_PERFORMANCE_OPTIONS.find(
          (option) => option.value === evaluationDraft.globalPerformance
        )
      : undefined;
    const selectedDifficultyOption = evaluationDraft.categoryDifficulty
      ? ADMIN_CATEGORY_DIFFICULTY_OPTIONS.find(
          (option) => option.value === evaluationDraft.categoryDifficulty
        )
      : undefined;
    if (isSenior) {
      return (
        <ScreenContainer
          bodyClassName="senior-evaluation-screen__body"
          heroClassName="senior-evaluation-screen__hero"
          heroTop={
            <button
              className="senior-evaluation-screen__hero-back"
              onClick={() => {
                setSelectedEvaluationInterventionId(null);
                setEvaluationFeedback(null);
              }}
              type="button"
            >
              <ChevronLeft aria-hidden="true" />
              <span>Retour à l’espace senior</span>
            </button>
          }
          shellClassName="dashboard-screen senior-screen senior-evaluation-screen"
          title="Évaluer l’interne"
          frameWidth="wide"
        >
          <section className="senior-evaluation-summary-card">
            <div className="senior-evaluation-summary-card__main">
              <ApproachIcon intervention={selectedEvaluationIntervention} />
              <div className="senior-evaluation-summary-card__identity">
                <span>{formatLongFrenchDate(selectedEvaluationIntervention.date)}</span>
                <strong>{selectedEvaluationInterventionLabel}</strong>
                <small>
                  {selectedEvaluationInternalName} -{' '}
                  {getChoiceLabel(roleOptions, selectedEvaluationIntervention.role)}
                </small>
                <small>
                  Indication : {indicationLabel || 'Non renseignée'}
                </small>
              </div>
            </div>
            <div className="senior-auto-evaluation__score senior-auto-evaluation__score--summary">
              <Check aria-hidden="true" />
              <div>
                <strong>
                  {selectedEvaluationKeyStepScore == null
                    ? 'Non calculable'
                    : `${selectedEvaluationKeyStepScore} %`}
                </strong>
                <span>
                  {selectedEvaluationKeyStepScore == null
                    ? 'Score non calculable'
                    : 'Score calculé'}
                </span>
              </div>
            </div>
          </section>

          <div className="senior-auto-evaluation">
            <button
              className="senior-auto-evaluation__toggle"
              onClick={() => setIsAutoEvaluationOpen((current) => !current)}
              type="button"
            >
              <span>Voir le détail de l’auto-évaluation</span>
              <ChevronDown
                aria-hidden="true"
                className={isAutoEvaluationOpen ? 'senior-auto-evaluation__toggle-icon--open' : ''}
              />
            </button>
          </div>

          {isAutoEvaluationOpen ? (
            <div className="senior-auto-evaluation__details">
              {selectedEvaluationKeyStepRows.length ? (
                selectedEvaluationKeyStepRows.map((step) => {
                  const level = selectedEvaluationIntervention.checklist[step.id];

                  return (
                    <div className="senior-auto-evaluation__detail-row" key={step.id}>
                      <strong>{step.label}</strong>
                      <span>{getChecklistLevelBadgeLabel(level)}</span>
                      <small>{getChecklistLevelDescription(level)}</small>
                    </div>
                  );
                })
              ) : (
                <p>Aucun temps opératoire clé défini pour cette intervention.</p>
              )}
            </div>
          ) : null}

          <section className="senior-evaluation-panel senior-evaluation-panel--primary">
            <div className="senior-evaluation-panel__header">
              <h2>Évaluation senior</h2>
            </div>

            <div className="senior-evaluation-step">
              <div className="senior-evaluation-step__title">
                <span>1</span>
                <h3>Performance chirurgicale globale</h3>
              </div>
              <div className="senior-evaluation-option-grid senior-evaluation-option-grid--performance">
                {ADMIN_PERFORMANCE_OPTIONS.map((option) => {
                  const isSelected =
                    evaluationDraft.globalPerformance === option.value;
                  const level = Number(option.value);

                  return (
                    <button
                      className={`senior-rating-option senior-rating-option--level-${option.value} ${
                        isSelected ? 'senior-rating-option--selected' : ''
                      }`.trim()}
                      key={option.value}
                      onClick={() => {
                        setEvaluationFeedback(null);
                        setEvaluationDraft((current) => ({
                          ...current,
                          globalPerformance: option.value,
                        }));
                      }}
                      type="button"
                    >
                      <span className="senior-rating-option__number">
                        {option.value}
                      </span>
                      <strong>{SENIOR_PERFORMANCE_SHORT_LABELS[option.value]}</strong>
                      <span className="senior-rating-option__chevrons" aria-hidden="true">
                        {'>'.repeat(level)}
                      </span>
                    </button>
                  );
                })}
              </div>
              {selectedPerformanceOption ? (
                <p className="senior-rating-description">
                  {selectedPerformanceOption.description}
                </p>
              ) : null}
            </div>

            <div className="senior-evaluation-step">
              <div className="senior-evaluation-step__title">
                <span>2</span>
                <h3>Difficulté chirurgicale intra-catégorie</h3>
              </div>
              <div className="senior-evaluation-option-grid senior-evaluation-option-grid--difficulty">
                {ADMIN_CATEGORY_DIFFICULTY_OPTIONS.map((option) => {
                  const isSelected =
                    evaluationDraft.categoryDifficulty === option.value;
                  const level = Number(option.value);

                  return (
                    <button
                      className={`senior-rating-option senior-rating-option--difficulty ${
                        isSelected ? 'senior-rating-option--selected' : ''
                      }`.trim()}
                      key={option.value}
                      onClick={() => {
                        setEvaluationFeedback(null);
                        setEvaluationDraft((current) => ({
                          ...current,
                          categoryDifficulty: option.value,
                        }));
                      }}
                      type="button"
                    >
                      <span className="senior-rating-option__number">
                        {option.value}
                      </span>
                      <strong>{SENIOR_DIFFICULTY_SHORT_LABELS[option.value]}</strong>
                      <span className="senior-rating-option__stars" aria-hidden="true">
                        {Array.from({ length: level }, (_, index) => (
                          <Star key={index} />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
              {selectedDifficultyOption ? (
                <p className="senior-rating-description">
                  {selectedDifficultyOption.description}
                </p>
              ) : null}
            </div>

            <div className="senior-evaluation-step">
              <div className="senior-evaluation-step__title">
                <span>3</span>
                <h3>
                  Commentaire senior <small>(optionnel)</small>
                </h3>
              </div>
              <label className="senior-comment-field">
                <textarea
                  maxLength={200}
                  onChange={(event) => {
                    setEvaluationFeedback(null);
                    setEvaluationDraft((current) => ({
                      ...current,
                      seniorComment: event.target.value,
                    }));
                  }}
                  placeholder="Votre commentaire sur la performance de l’interne, les points forts, les axes d’amélioration, les objectifs pour la suite…"
                  value={evaluationDraft.seniorComment}
                />
                <span>{evaluationDraft.seniorComment.length} / 200</span>
              </label>
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

            <div className="senior-evaluation-actions">
              <button
                className="senior-evaluation-actions__primary"
                onClick={handleValidateSeniorEvaluation}
                type="button"
              >
                <Check aria-hidden="true" />
                <span>Valider l’évaluation</span>
              </button>
              <button
                className="senior-evaluation-actions__secondary"
                onClick={() => {
                  setSelectedEvaluationInterventionId(null);
                  setEvaluationFeedback(null);
                }}
                type="button"
              >
                Retour à l’espace senior
              </button>
            </div>
          </section>
        </ScreenContainer>
      );
    }

    return (
      <ScreenContainer
        eyebrow={isSenior ? 'Évaluation senior' : 'Évaluation administrateur'}
        bodyClassName={isSenior ? 'senior-evaluation-screen__body' : undefined}
        heroClassName={isSenior ? 'senior-screen__hero' : undefined}
        shellClassName={isSenior ? 'dashboard-screen senior-screen senior-evaluation-screen' : undefined}
        title="Évaluer l’interne"
        subtitle={
          selectedEvaluationInternal
            ? `${selectedEvaluationInternalName} · ${formatIsoDate(
                selectedEvaluationIntervention.date
              )}`
            : formatIsoDate(selectedEvaluationIntervention.date)
        }
        frameWidth="wide"
      >
        <SectionCard
          className={isSenior ? 'senior-section-card senior-evaluation-screen__section' : undefined}
          title={isSenior ? 'Intervention à évaluer' : 'Journal de l’interne'}
          description={
            isSenior
              ? 'Synthèse de l’intervention avant de renseigner l’évaluation senior.'
              : 'Résumé de l’intervention renseignée dans le journal.'
          }
        >
          {isSenior ? (
            <div className="senior-evaluation-screen__summary">
              <ApproachIcon intervention={selectedEvaluationIntervention} />
              <div className="senior-evaluation-screen__summary-copy">
                <strong>{selectedEvaluationInterventionLabel}</strong>
                <span className="senior-evaluation-screen__summary-meta">
                  {selectedEvaluationInternalName} ·{' '}
                  {formatLongFrenchDate(selectedEvaluationIntervention.date)}
                </span>
                <div className="senior-evaluation-screen__summary-details">
                  <span>
                    <strong>Indication</strong>
                    {indicationLabel || 'Non renseignée'}
                  </span>
                  <span>
                    <strong>Voie d’abord</strong>
                    {selectedEvaluationApproachLabel}
                  </span>
                  <span>
                    <strong>Méthode d’entrée</strong>
                    {selectedEvaluationEntryTechniqueLabel}
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          <div
            className={[
              'info-grid',
              isSenior ? 'senior-evaluation-screen__details' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
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

        <SectionCard
          className={isSenior ? 'senior-section-card senior-evaluation-screen__section' : undefined}
          title="Répartition des niveaux d’autonomie"
          description={
            isSenior
              ? 'Lecture détaillée des temps opératoires associés à chaque niveau d’autonomie.'
              : undefined
          }
        >
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

        <SectionCard
          className={isSenior ? 'senior-section-card senior-evaluation-screen__section' : undefined}
          title="Évaluation senior / administrateur"
          description={
            isSenior
              ? 'Positionnez l’évaluation finale de l’intervention sur les deux dimensions attendues.'
              : undefined
          }
        >
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

        {isSenior ? (
          <button
            className="senior-evaluation-screen__back-button"
            onClick={() => {
              setSelectedEvaluationInterventionId(null);
              setEvaluationFeedback(null);
            }}
            type="button"
          >
            <ChevronLeft aria-hidden="true" />
            <span>Retour à l’espace senior</span>
          </button>
        ) : (
          <div className="action-stack">
            <PrimaryButton
              label="Retour à l’espace administrateur"
              onPress={() => {
                setSelectedEvaluationInterventionId(null);
                setEvaluationFeedback(null);
              }}
              variant="secondary"
            />
          </div>
        )}
      </ScreenContainer>
    );
  }

  if (isAdmin && view === 'history') {
    return (
      <AdminPageShell
        backLabel="Retour à l’espace administrateur"
        onBack={() => setView('home')}
        subtitle="Accédez aux statistiques des internes et exportez les données des blocs."
        title="Historique des blocs"
      >
        <SectionCard
          className="admin-dashboard-card"
          description="Exportez les blocs enregistrés avec l’ensemble des données internes et seniors."
          title="Export des blocs"
        >
          <div className="admin-export-note">
            <CalendarDays aria-hidden="true" />
            <span>
              L’export inclut les données générales, les auto-évaluations internes,
              les évaluations senior, les étapes opératoires, les scores calculés et
              les délais d’évaluation.
            </span>
          </div>

          <div className="admin-filter-grid admin-filter-grid--history">
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
              <span className="field-stack__label">Senior</span>
              <select
                className="field-input"
                onChange={(event) =>
                  handleInterventionFilterChange('seniorId', event.target.value)
                }
                value={interventionFilters.seniorId}
              >
                <option value="all">Tous les seniors</option>
                {selectableSeniors
                  .filter((senior) => senior.id !== 'sen-other')
                  .map((senior) => (
                    <option key={senior.id} value={senior.id}>
                      {formatSeniorDisplayName(senior)}
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
              <span className="field-stack__label">Voie d’abord</span>
              <select
                className="field-input"
                onChange={(event) =>
                  handleInterventionFilterChange('approach', event.target.value)
                }
                value={interventionFilters.approach}
              >
                <option value="all">Toutes les voies d’abord</option>
                {approachOptions.map((approach) => (
                  <option key={approach.value} value={approach.value}>
                    {approach.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field-stack">
              <span className="field-stack__label">Statut</span>
              <select
                className="field-input"
                onChange={(event) =>
                  handleInterventionFilterChange('status', event.target.value)
                }
                value={interventionFilters.status}
              >
                <option value="all">Toutes</option>
                <option value="evaluated">Évaluées</option>
                <option value="pending">En attente</option>
              </select>
            </label>

            <div className="field-stack admin-history-period-field">
              <span className="field-stack__label">Période du bloc</span>
              <div className="admin-history-period-grid">
                <label className="admin-history-period-input">
                  <span>À partir du</span>
                  <input
                    className="field-input"
                    onChange={(event) =>
                      handleInterventionFilterChange('dateFrom', event.target.value)
                    }
                    type="date"
                    value={interventionFilters.dateFrom}
                  />
                </label>

                <label className="admin-history-period-input">
                  <span>Jusqu’au</span>
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
            </div>
          </div>

          <div className="admin-export-summary-card">
            <div className="admin-export-summary-card__icon">
              <BarChart3 aria-hidden="true" />
            </div>
            <div className="admin-export-summary-card__copy">
              <strong>
                {filteredInterventions.length} intervention
                {filteredInterventions.length > 1 ? 's' : ''} seront exportée
                {filteredInterventions.length > 1 ? 's' : ''}
              </strong>
              <div className="admin-export-summary-card__meta">
                <span className="admin-export-summary-card__meta-item admin-export-summary-card__meta-item--evaluated">
                  {filteredInterventionsEvaluatedCount} évaluée
                  {filteredInterventionsEvaluatedCount > 1 ? 's' : ''}
                </span>
                <span className="admin-export-summary-card__meta-item admin-export-summary-card__meta-item--pending">
                  {filteredInterventionsPendingCount} en attente
                </span>
                <span className="admin-export-summary-card__meta-item">
                  Export Excel complet · 4 onglets
                </span>
              </div>
            </div>
          </div>

          <div className="admin-toolbar admin-toolbar--dashboard admin-toolbar--export">
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
                className="app-button app-button--primary admin-export-button"
                disabled={filteredInterventions.length === 0}
                onClick={handleExportFilteredBlocks}
                type="button"
              >
                Exporter en Excel
              </button>
            </div>
          </div>
        </SectionCard>
      </AdminPageShell>
    );
  }

  if (isAdmin && view === 'connections') {
    return (
      <AdminPageShell
        backLabel="Retour à l’espace administrateur"
        onBack={() => setView('home')}
        subtitle="Historique synthétique des dernières connexions internes et seniors."
        title="Connexions utilisateurs"
      >
        <SectionCard className="admin-dashboard-card" title="Toutes les connexions">
          {userConnections.length ? (
            <div className="admin-connections-list">
              {userConnections.map((connection) => {
                const activities = getConnectionActivities(connection);

                return (
                  <article className="admin-connection-row" key={connection.id}>
                    <div className="admin-connection-row__copy">
                      <div className="admin-connection-row__main">
                        <strong>{connection.name}</strong>
                        <span className="admin-connection-row__time">
                          {formatAdminConnectionTimestamp(connection.lastLoginAt)}
                        </span>
                      </div>
                      <span>{connection.role}</span>
                      <div className="admin-connection-row__activity-list">
                        {activities.length ? (
                          activities.map((entry) => (
                            <span
                              className="admin-connection-row__activity-item"
                              key={entry.id}
                            >
                              {formatAdminConnectionTimestamp(entry.createdAt)} ·{' '}
                              {formatActivityLogEntrySummary(entry)}
                            </span>
                          ))
                        ) : (
                          <span className="admin-connection-row__activity-empty">
                            Aucune activité récente enregistrée.
                          </span>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="validation-box">
              <strong>Aucune connexion enregistrée</strong>
              <span>Les prochaines connexions internes et seniors apparaîtront ici.</span>
            </div>
          )}
        </SectionCard>
      </AdminPageShell>
    );
  }

  if (isAdmin && view === 'account') {
    return (
      <AdminPageShell
        backLabel="Retour à l’espace administrateur"
        onBack={() => setView('home')}
        subtitle="Informations du compte administrateur et accès au support."
        title="Mon profil administrateur"
      >
        <SectionCard className="admin-dashboard-card" title="Compte administrateur">
          <div className="info-grid">
            <div className="info-block">
              <span className="info-block__label">Rôle</span>
              <strong className="info-block__value">Administration</strong>
            </div>
            <div className="info-block">
              <span className="info-block__label">Identifiant</span>
              <strong className="info-block__value">admin</strong>
            </div>
            <div className="info-block">
              <span className="info-block__label">Périmètre</span>
              <strong className="info-block__value">
                Profils, interventions, historique, trophées
              </strong>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          className="admin-dashboard-card"
          description="Besoin d’un accès, d’une correction de données ou d’une assistance technique ?"
          title="Support"
        >
          <div className="action-stack">
            <PrimaryButton
              label="Contacter le support"
              onPress={handleAdminSupportClick}
              variant="secondary"
            />
          </div>
        </SectionCard>
      </AdminPageShell>
    );
  }

  if (
    (isAdmin || isSenior) &&
    view === 'profile' &&
    selectedProfile &&
    selectedProfileStats
  ) {
    const historyStart =
      selectedProfileHistoryRows.length === 0
        ? 0
        : (profileHistoryPage - 1) * profileHistoryPageSize + 1;
    const historyEnd = Math.min(
      profileHistoryPage * profileHistoryPageSize,
      selectedProfileHistoryRows.length
    );
    const progressChartPoints = selectedProfileProgressSeries.map((point, index, points) => {
      const usableWidth = 320;
      const usableHeight = 150;
      const x =
        points.length <= 1 ? 0 : (index / Math.max(points.length - 1, 1)) * usableWidth;
      const y = usableHeight - (point.score / 100) * usableHeight;

      return {
        ...point,
        x,
        y,
      };
    });
    const progressChartPath = progressChartPoints
      .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
      .join(' ');

    return (
      <AdminPageShell
        backLabel="Retour à l’administration des profils"
        onBack={() => {
          setSelectedProfileId(null);
          setView('profiles');
        }}
        subtitle={`Consultez l’historique opératoire et la progression pédagogique de ${selectedProfileDisplayName}.`}
        title="Statistiques de l’interne"
      >
        <div className="admin-profile-stats-hero">
          <SectionCard className="admin-dashboard-card admin-profile-summary-card">
            <div className="admin-profile-summary-card__body">
              <InternalAvatar
                className="admin-profile-summary-card__avatar"
                firstName={selectedProfile.firstName}
                imageSrc={selectedProfile.avatarImageSrc}
                lastName={selectedProfile.lastName}
              />
              <div className="admin-profile-summary-card__copy">
                <div className="admin-profile-summary-card__header">
                  <strong>{selectedProfileDisplayName}</strong>
                  <span className="profile-card__badge">{selectedProfile.semester}</span>
                </div>
                <div className="admin-profile-summary-card__meta">
                  <span>{selectedProfile.promotion}</span>
                  <span>Stage actuel : {selectedProfile.currentRotation}</span>
                  <span>Identifiant : {selectedProfile.loginId}</span>
                </div>
              </div>
            </div>
          </SectionCard>

          <div className="admin-profile-kpi-grid">
            <article className="admin-profile-kpi-card">
              <span className="admin-profile-kpi-card__icon">
                <Pencil aria-hidden="true" />
              </span>
              <strong>{selectedProfileStats.recordedInterventionsCount}</strong>
              <span>interventions</span>
            </article>
            <article className="admin-profile-kpi-card admin-profile-kpi-card--success">
              <span className="admin-profile-kpi-card__icon">
                <Check aria-hidden="true" />
              </span>
              <strong>{selectedProfileEvaluationRate}%</strong>
              <span>évaluées</span>
            </article>
            <article className="admin-profile-kpi-card admin-profile-kpi-card--amber">
              <span className="admin-profile-kpi-card__icon">
                <Trophy aria-hidden="true" />
              </span>
              <strong>{selectedProfileStats.earnedBadgesCount}</strong>
              <span>trophées</span>
            </article>
          </div>
        </div>

        <SectionCard
          className="admin-dashboard-card admin-profile-stats-card"
          title={profileStatsTab === 'history' ? 'Historique opératoire' : 'Progression pédagogique'}
        >
          <div className="admin-profile-stats-tabs" aria-label="Onglets statistiques">
            <button
              className={`admin-profile-stats-tab ${
                profileStatsTab === 'history' ? 'admin-profile-stats-tab--active' : ''
              }`}
              onClick={() => setProfileStatsTab('history')}
              type="button"
            >
              <FolderOpen aria-hidden="true" />
              <span>Historique</span>
            </button>
            <button
              className={`admin-profile-stats-tab ${
                profileStatsTab === 'progress' ? 'admin-profile-stats-tab--active' : ''
              }`}
              onClick={() => setProfileStatsTab('progress')}
              type="button"
            >
              <BarChart3 aria-hidden="true" />
              <span>Progression</span>
            </button>
          </div>

          {profileStatsTab === 'history' ? (
            <>
              <div className="admin-profile-filters">
                <label className="field-stack">
                  <span className="field-stack__label">Intervention</span>
                  <input
                    className="field-input"
                    onChange={(event) => setProfileHistorySearch(event.target.value)}
                    placeholder="Rechercher une intervention..."
                    type="search"
                    value={profileHistorySearch}
                  />
                </label>

                <label className="field-stack">
                  <span className="field-stack__label">Senior</span>
                  <select
                    className="field-input"
                    onChange={(event) => setProfileHistorySeniorFilter(event.target.value)}
                    value={profileHistorySeniorFilter}
                  >
                    <option value="all">Tous les seniors</option>
                    {selectableSeniors
                      .filter((senior) => senior.id !== 'sen-other')
                      .map((senior) => (
                        <option key={senior.id} value={senior.id}>
                          {formatSeniorDisplayName(senior)}
                        </option>
                      ))}
                  </select>
                </label>

                <label className="field-stack">
                  <span className="field-stack__label">Statut</span>
                  <select
                    className="field-input"
                    onChange={(event) =>
                      setProfileHistoryStatusFilter(
                        event.target.value as ProfileHistoryStatusFilter
                      )
                    }
                    value={profileHistoryStatusFilter}
                  >
                    <option value="all">Tous les statuts</option>
                    <option value="evaluated">Évaluée</option>
                    <option value="pending">En attente</option>
                  </select>
                </label>

                <label className="field-stack">
                  <span className="field-stack__label">Du</span>
                  <input
                    className="field-input"
                    onChange={(event) => setProfileHistoryDateFrom(event.target.value)}
                    type="date"
                    value={profileHistoryDateFrom}
                  />
                </label>

                <label className="field-stack">
                  <span className="field-stack__label">Au</span>
                  <input
                    className="field-input"
                    onChange={(event) => setProfileHistoryDateTo(event.target.value)}
                    type="date"
                    value={profileHistoryDateTo}
                  />
                </label>
              </div>

              {paginatedProfileHistoryRows.length ? (
                <div className="admin-profile-history-list">
                  {paginatedProfileHistoryRows.map((intervention) => {
                    const evaluation = adminEvaluations[intervention.id];
                    const status = getProfileHistoryStatus(evaluation);
                    const senior =
                      selectableSeniors.find(
                        (seniorItem) => seniorItem.id === intervention.seniorId
                      ) ?? null;
                    const checklistSteps = getChecklistStepsForIntervention(
                      intervention.procedure,
                      intervention.indication,
                      intervention.approach,
                      intervention.entryTechnique,
                      customSurgicalInterventions
                    );
                    const isExpanded =
                      expandedHistoryInterventionId === intervention.id;

                    return (
                      <article
                        className="admin-profile-history-card"
                        key={intervention.id}
                      >
                        <div className="admin-profile-history-card__main">
                          <div className="admin-profile-history-card__copy">
                            <strong>
                              {getChoiceLabel(
                                surgicalProcedureOptions,
                                intervention.procedure
                              )}
                            </strong>
                            <span>
                              {formatIsoDate(intervention.date)} · Senior :{' '}
                              {senior
                                ? formatSeniorDisplayName(senior)
                                : 'Non renseigné'}
                            </span>
                            <span>
                              Voie d’abord : {getInterventionApproachLabel(intervention)}
                            </span>
                            {getInterventionIndicationLabel(intervention) ? (
                              <span>
                                Indication : {getInterventionIndicationLabel(intervention)}
                              </span>
                            ) : null}
                          </div>

                          <div className="admin-profile-history-card__aside">
                            <span className={getProfileHistoryStatusClassName(status)}>
                              {getProfileHistoryStatusLabel(status)}
                            </span>
                            <button
                              className="mini-button mini-button--secondary"
                              onClick={() =>
                                setExpandedHistoryInterventionId((current) =>
                                  current === intervention.id ? null : intervention.id
                                )
                              }
                              type="button"
                            >
                              {isExpanded ? 'Masquer le détail' : 'Voir le détail'}
                            </button>
                          </div>
                        </div>

                        {isExpanded ? (
                          <div className="admin-profile-history-card__detail">
                            <div className="admin-profile-history-card__detail-grid">
                              <div className="info-block">
                                <span className="info-block__label">Enregistrée le</span>
                                <strong className="info-block__value">
                                  {formatDateTime(intervention.savedAt)}
                                </strong>
                              </div>
                              <div className="info-block">
                                <span className="info-block__label">Rôle</span>
                                <strong className="info-block__value">
                                  {getChoiceLabel(roleOptions, intervention.role)}
                                </strong>
                              </div>
                              <div className="info-block">
                                <span className="info-block__label">Statut</span>
                                <strong className="info-block__value">
                                  {getProfileHistoryStatusLabel(status)}
                                </strong>
                              </div>
                              <div className="info-block">
                                <span className="info-block__label">Score d'autonomie</span>
                                <strong className="info-block__value">
                                  {intervention.autonomyScore != null
                                    ? `${Math.round(intervention.autonomyScore)}%`
                                    : 'Non calculable'}
                                </strong>
                              </div>
                            </div>

                            <div className="admin-profile-history-card__steps">
                              {checklistSteps.map((step) => (
                                <div
                                  className="admin-profile-history-card__step"
                                  key={step.id}
                                >
                                  <span>{step.label}</span>
                                  <strong>
                                    {getChecklistLevelBadgeLabel(
                                      intervention.checklist[step.id]
                                    )}
                                  </strong>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="validation-box">
                  <strong>Aucune intervention ne correspond aux filtres</strong>
                  <span>
                    Ajustez la recherche ou les dates pour retrouver les blocs de cet
                    interne.
                  </span>
                </div>
              )}

              <div className="admin-profile-pagination">
                <span>
                  {historyStart} - {historyEnd} sur {selectedProfileHistoryRows.length}{' '}
                  intervention{selectedProfileHistoryRows.length > 1 ? 's' : ''}
                </span>
                <div className="admin-profile-pagination__controls">
                  <button
                    className="mini-button"
                    disabled={profileHistoryPage === 1}
                    onClick={() => setProfileHistoryPage((current) => current - 1)}
                    type="button"
                  >
                    <ChevronLeft aria-hidden="true" />
                  </button>
                  <span>
                    {profileHistoryPage} / {profileHistoryPageCount}
                  </span>
                  <button
                    className="mini-button"
                    disabled={profileHistoryPage === profileHistoryPageCount}
                    onClick={() => setProfileHistoryPage((current) => current + 1)}
                    type="button"
                  >
                    <ChevronRight aria-hidden="true" />
                  </button>
                  <select
                    className="field-input admin-profile-pagination__select"
                    onChange={(event) =>
                      setProfileHistoryPageSize(Number(event.target.value))
                    }
                    value={profileHistoryPageSize}
                  >
                    {PROFILE_HISTORY_PAGE_SIZE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option} par page
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="admin-profile-filters admin-profile-filters--progress">
                <label className="field-stack">
                  <span className="field-stack__label">Intervention</span>
                  <select
                    className="field-input"
                    onChange={(event) => setProfileProgressKey(event.target.value)}
                    value={profileProgressKey}
                  >
                    {selectedProfileProgressOptions.map((option) => (
                      <option key={option.key} value={option.key}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field-stack">
                  <span className="field-stack__label">Période</span>
                  <select
                    className="field-input"
                    onChange={(event) =>
                      setProfileProgressPeriod(
                        event.target.value as ProfileProgressPeriod
                      )
                    }
                    value={profileProgressPeriod}
                  >
                    <option value="3m">3 derniers mois</option>
                    <option value="6m">6 derniers mois</option>
                    <option value="12m">12 derniers mois</option>
                    <option value="all">Toutes les données</option>
                  </select>
                </label>

              </div>

              {selectedProfileProgressSeries.length ? (
                <>
                  <div className="admin-profile-progress-kpis">
                    <div className="info-block">
                      <span className="info-block__label">Dernier enregistrement</span>
                      <strong className="info-block__value">
                        {selectedProfileLastRecordedAt
                          ? formatDateTime(selectedProfileLastRecordedAt)
                          : 'Non renseignée'}
                      </strong>
                    </div>
                  </div>

                  <div className="admin-profile-progress-layout">
                    <SectionCard
                      className="admin-profile-progress-panel"
                      title="Évolution de l’autonomie"
                    >
                      <div className="admin-profile-progress-chart">
                        <svg
                          aria-hidden="true"
                          viewBox="0 0 360 190"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <line x1="16" x2="336" y1="160" y2="160" />
                          <line x1="16" x2="16" y1="10" y2="160" />
                          <line x1="16" x2="336" y1="122.5" y2="122.5" />
                          <line x1="16" x2="336" y1="85" y2="85" />
                          <line x1="16" x2="336" y1="47.5" y2="47.5" />
                          {progressChartPath ? (
                            <path
                              d={progressChartPath}
                              fill="none"
                              stroke="currentColor"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="3"
                              transform="translate(16 10)"
                            />
                          ) : null}
                          {progressChartPoints.map((point) => (
                            <g key={point.id} transform={`translate(${point.x + 16} ${point.y + 10})`}>
                              <circle cx="0" cy="0" fill="white" r="5" stroke="currentColor" strokeWidth="3" />
                              <text x="0" y="-12">
                                {point.score}%
                              </text>
                            </g>
                          ))}
                        </svg>
                        <div className="admin-profile-progress-chart__labels">
                          {selectedProfileProgressSeries.map((point) => (
                            <span key={point.id}>{formatIsoDate(point.date)}</span>
                          ))}
                        </div>
                      </div>
                    </SectionCard>

                    <SectionCard
                      className="admin-profile-progress-panel"
                      title="Temps opératoires clés"
                    >
                      {selectedProfileStepRows.length ? (
                        <div className="admin-profile-step-list">
                          {selectedProfileStepRows.map((step) => (
                            <div className="admin-profile-step-row" key={step.id}>
                              <span>{step.label}</span>
                              <div className="admin-profile-step-row__bar">
                                <div
                                  className={`admin-profile-step-row__fill admin-profile-step-row__fill--${step.tone}`}
                                  style={{ width: `${step.score}%` }}
                                />
                              </div>
                              <strong>{step.score}%</strong>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="validation-box">
                          <strong>Aucune donnée de progression disponible</strong>
                          <span>Les prochaines évaluations alimenteront cette vue.</span>
                        </div>
                      )}
                    </SectionCard>
                  </div>

                  <div className="admin-profile-progress-footer">
                    <SectionCard
                      className="admin-profile-progress-panel"
                      title="Trophées obtenus"
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
                          <span>Les futurs trophées validés apparaîtront ici.</span>
                        </div>
                      )}
                    </SectionCard>
                  </div>
                </>
              ) : (
                <div className="validation-box">
                  <strong>Aucune donnée de progression disponible pour cet interne</strong>
                  <span>
                    Les évaluations senior et les scores d’autonomie apparaîtront ici dès
                    qu’ils seront disponibles.
                  </span>
                </div>
              )}
            </>
          )}
        </SectionCard>
      </AdminPageShell>
    );
  }

  if ((isAdmin || isSenior) && view === 'profiles') {
    return (
      <AdminPageShell
        backLabel={isSenior ? 'Retour à l’espace senior' : 'Retour à l’espace administrateur'}
        onBack={() => setView('home')}
        subtitle="Créez, modifiez ou désactivez les comptes internes et seniors de BlocLog."
        title="Gestion des profils"
      >
        <div className="admin-profile-overview">
          <article className="admin-profile-overview-card admin-profile-overview-card--violet">
            <span className="admin-profile-overview-card__icon">
              <Users aria-hidden="true" />
            </span>
            <div>
              <strong>{profilesForAdminList.length + allSeniorProfilesForAdminList.length}</strong>
              <span>Comptes actifs</span>
            </div>
          </article>
        </div>

        <SectionCard className="admin-dashboard-card admin-profile-management-card">
          <div className="admin-profiles-layout">
            <div className="admin-profiles-panel">
              <div className="admin-profiles-tabs">
                <button
                  className={`admin-profiles-tab ${
                    profilesTab === 'internal' ? 'admin-profiles-tab--active' : ''
                  }`}
                  onClick={() => setProfilesTab('internal')}
                  type="button"
                >
                  <span>Internes</span>
                </button>
                <button
                  className={`admin-profiles-tab ${
                    profilesTab === 'senior' ? 'admin-profiles-tab--active' : ''
                  }`}
                  onClick={() => setProfilesTab('senior')}
                  type="button"
                >
                  <span>Seniors</span>
                </button>
              </div>

              <div className="admin-profiles-toolbar">
                <label className="admin-profiles-search">
                  <Search aria-hidden="true" />
                  <input
                    onChange={(event) => setProfileSearch(event.target.value)}
                    placeholder="Rechercher un profil..."
                    type="search"
                    value={profileSearch}
                  />
                </label>
                <button
                  className="app-button app-button--primary admin-profiles-toolbar__button"
                  onClick={() => openProfileEditor(profilesTab)}
                  type="button"
                >
                  + Nouveau profil
                </button>
              </div>

              {profilesTab === 'internal' ? <FeedbackMessage feedback={feedback} /> : null}
              {profilesTab === 'senior' ? <FeedbackMessage feedback={seniorFeedback} /> : null}
              {profilesTab === 'senior' ? (
                <FeedbackMessage feedback={seniorAccountFeedback} />
              ) : null}

              <div className="admin-profile-list admin-profile-list--tall">
                {profilesTab === 'internal' ? (
                  filteredInternalProfiles.length ? (
                    filteredInternalProfiles.map((profile) => (
                      <article
                        key={profile.id}
                        className={`profile-card profile-card--${getSemesterTone(
                          profile.semester
                        )} profile-card--static admin-profile-card`}
                      >
                        <div className="admin-profile-card__identity">
                          <span className="admin-profile-card__avatar admin-profile-card__avatar--senior">
                            <span className="admin-profile-card__initials">
                              {getProfileInitials(profile)}
                            </span>
                          </span>
                          <div className="admin-profile-card__copy">
                            <div className="profile-card__header">
                              <strong>{formatDisplayName(profile.firstName, profile.lastName)}</strong>
                              <span className="profile-card__badge">{profile.semester}</span>
                            </div>
                            <div className="profile-card__meta">
                              <span>{profile.promotion}</span>
                              <span>Stage actuel : {profile.currentRotation}</span>
                              <span>Identifiant : {profile.loginId}</span>
                              <span>Mot de passe : {MASKED_PASSWORD}</span>
                            </div>
                          </div>
                        </div>

                        <div className="admin-profile-card__actions admin-profile-card__actions--grid">
                          <button
                            className="mini-button mini-button--secondary"
                            onClick={() => openProfileStats(profile, 'profiles')}
                            type="button"
                          >
                            Voir les statistiques
                          </button>
                          <button
                            className="mini-button"
                            onClick={() => startInternalEdition(profile)}
                            type="button"
                          >
                            Modifier
                          </button>
                          <button
                            className="mini-button"
                            onClick={() => handlePrepareInternalPasswordReset(profile)}
                            type="button"
                          >
                            Réinitialiser le mot de passe
                          </button>
                          <button
                            className="mini-button mini-button--danger"
                            onClick={() => setProfileToDelete(profile)}
                            type="button"
                          >
                            Désactiver le profil
                          </button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="validation-box">
                      <strong>Aucun profil interne trouvé</strong>
                      <span>Essayez un autre terme ou créez un nouveau profil.</span>
                    </div>
                  )
                ) : filteredSeniorProfiles.length ? (
                  filteredSeniorProfiles.map((senior) => (
                    <article
                      key={senior.id}
                      className="profile-card profile-card--static admin-profile-card"
                    >
                      <div className="admin-profile-card__identity">
                        <span className="admin-profile-card__avatar admin-profile-card__avatar--senior">
                          <span className="admin-profile-card__initials">
                            {getProfileInitials(senior)}
                          </span>
                        </span>
                        <div className="admin-profile-card__copy">
                          <div className="profile-card__header">
                            <strong>{formatSeniorDisplayName(senior)}</strong>
                          </div>
                          <div className="profile-card__meta">
                            <span>Identifiant : {senior.loginId}</span>
                            <span>Mot de passe : {MASKED_PASSWORD}</span>
                            {!senior.isCustom ? (
                              <span>Compte système : modification désactivée</span>
                            ) : null}
                          </div>
                        </div>
                      </div>

                      {senior.isCustom ? (
                        <div className="admin-profile-card__actions admin-profile-card__actions--grid">
                          <button
                            className="mini-button"
                            onClick={() => startSeniorEdition(senior)}
                            type="button"
                          >
                            Modifier
                          </button>
                          <button
                            className="mini-button"
                            onClick={() => handlePrepareSeniorPasswordReset(senior)}
                            type="button"
                          >
                            Réinitialiser le mot de passe
                          </button>
                          <button
                            className="mini-button mini-button--danger"
                            onClick={() => handleDeleteSeniorProfile(senior)}
                            type="button"
                          >
                            Désactiver le compte
                          </button>
                        </div>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <div className="validation-box">
                    <strong>Aucun compte senior créé</strong>
                    <span>Créez un senior depuis le panneau de droite.</span>
                  </div>
                )}
              </div>
            </div>

            <aside className="admin-profile-editor">
              <div className="admin-profile-editor__header">
                <div>
                  <strong>
                    {profileEditorType === 'internal'
                      ? editingInternalProfileId
                        ? 'Modifier le profil'
                        : 'Nouveau profil'
                      : editingSeniorId
                        ? 'Modifier le compte senior'
                        : 'Nouveau profil'}
                  </strong>
                  <span>Type de compte</span>
                </div>
                {(editingInternalProfileId || editingSeniorId) ? (
                  <button
                    className="mini-button"
                    onClick={() => openProfileEditor(profileEditorType)}
                    type="button"
                  >
                    <X aria-hidden="true" />
                  </button>
                ) : null}
              </div>

              <div className="admin-profile-editor__switch">
                <button
                  className={
                    profileEditorType === 'internal'
                      ? 'admin-profile-editor__switch-button admin-profile-editor__switch-button--active'
                      : 'admin-profile-editor__switch-button'
                  }
                  onClick={() => {
                    setProfileEditorType('internal');
                    resetSeniorEditor();
                  }}
                  type="button"
                >
                  Interne
                </button>
                <button
                  className={
                    profileEditorType === 'senior'
                      ? 'admin-profile-editor__switch-button admin-profile-editor__switch-button--active'
                      : 'admin-profile-editor__switch-button'
                  }
                  onClick={() => {
                    setProfileEditorType('senior');
                    resetInternalEditor();
                  }}
                  type="button"
                >
                  Senior
                </button>
              </div>

              {profileEditorType === 'internal' ? (
                <form className="admin-create-form" onSubmit={handleCreateProfile}>
                  <div className="admin-create-form__grid">
                    <label className="field-stack">
                      <span className="field-stack__label">Prénom</span>
                      <input
                        className="field-input"
                        onChange={(event) =>
                          handleCreateFieldChange('firstName', event.target.value)
                        }
                        placeholder="Prénom"
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
                        placeholder="Nom"
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
                        placeholder="Identifiant"
                        type="text"
                        value={createForm.loginId}
                      />
                    </label>

                    <label className="field-stack">
                      <span className="field-stack__label">Mot de passe temporaire</span>
                      <input
                        autoCapitalize="none"
                        autoCorrect="off"
                        className="field-input"
                        onChange={(event) =>
                          handleCreateFieldChange('password', event.target.value)
                        }
                        placeholder="Mot de passe temporaire"
                        type="text"
                        value={createForm.password}
                      />
                      <span className="field-helper">
                        L’utilisateur devra le changer lors de sa première connexion.
                      </span>
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
                        placeholder="Ex : Chirurgie digestive"
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

                  <div className="admin-profile-editor__actions">
                    {(editingInternalProfileId || createForm.firstName || createForm.lastName) ? (
                      <button
                        className="app-button app-button--secondary"
                        onClick={resetInternalEditor}
                        type="button"
                      >
                        Annuler
                      </button>
                    ) : null}
                    <button className="app-button app-button--primary" type="submit">
                      {editingInternalProfileId ? 'Enregistrer le profil' : 'Créer le profil'}
                    </button>
                  </div>
                </form>
              ) : (
                <form className="admin-create-form" onSubmit={handleCreateSeniorProfile}>
                  <div className="admin-create-form__grid">
                    <label className="field-stack">
                      <span className="field-stack__label">Prénom</span>
                      <input
                        className="field-input"
                        onChange={(event) =>
                          handleCreateSeniorFieldChange('firstName', event.target.value)
                        }
                        placeholder="Prénom"
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
                        placeholder="Nom"
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
                        placeholder="Identifiant"
                        type="text"
                        value={createSeniorForm.loginId}
                      />
                    </label>

                    <label className="field-stack">
                      <span className="field-stack__label">Mot de passe temporaire</span>
                      <input
                        autoCapitalize="none"
                        autoCorrect="off"
                        className="field-input"
                        onChange={(event) =>
                          handleCreateSeniorFieldChange('password', event.target.value)
                        }
                        placeholder="Mot de passe temporaire"
                        type="text"
                        value={createSeniorForm.password}
                      />
                      <span className="field-helper">
                        L’utilisateur devra le changer lors de sa première connexion.
                      </span>
                    </label>
                  </div>

                  <div className="admin-profile-editor__actions">
                    {(editingSeniorId || createSeniorForm.firstName || createSeniorForm.lastName) ? (
                      <button
                        className="app-button app-button--secondary"
                        onClick={resetSeniorEditor}
                        type="button"
                      >
                        Annuler
                      </button>
                    ) : null}
                    <button className="app-button app-button--primary" type="submit">
                      {editingSeniorId ? 'Enregistrer le compte' : 'Créer le profil'}
                    </button>
                  </div>
                </form>
              )}
            </aside>
          </div>
        </SectionCard>
      </AdminPageShell>
    );
  }

  if (view === 'interventions') {
    return (
      <ScreenContainer
        bodyClassName="admin-workspace__body"
        frameClassName="admin-workspace__frame"
        frameWidth="wide"
        heroClassName="admin-workspace__hero"
        hideBrandmark
        shellClassName="admin-workspace"
      >
        <AdminInterventionsManager
          createSurgicalIntervention={createSurgicalIntervention}
          deleteCustomSurgicalIntervention={deleteCustomSurgicalIntervention}
          interventions={surgicalInterventionDefinitions}
          onBack={() => setView('home')}
          savedInterventions={savedInterventions}
          updateSurgicalIntervention={updateSurgicalIntervention}
        />
      </ScreenContainer>
    );
  }

  if (isAdmin && view === 'trophies') {
    return (
      <AdminPageShell
        backLabel="Retour à l’espace administrateur"
        onBack={() => setView('home')}
        subtitle="Créer, modifier et configurer les trophées attribués automatiquement aux internes."
        title="Catalogue des trophées"
      >
        <div className="admin-page-toolbar">
          <div />
          <button
            className="app-button app-button--primary"
            onClick={handleCreateTrophy}
            type="button"
          >
            + Créer un trophée
          </button>
        </div>

        {trophyFormFeedback ? (
          <div
            className={
              trophyFormFeedback.kind === 'success' ? 'auth-success' : 'auth-error'
            }
          >
            {trophyFormFeedback.message}
          </div>
        ) : null}

        {trophyStorageWarning ? (
          <div className="auth-error">{trophyStorageWarning}</div>
        ) : null}

        <SectionCard className="admin-dashboard-card">
          <div className="admin-trophy-toolbar">
            <div className="admin-filter-chip-row">
              {ADMIN_TROPHY_FILTER_OPTIONS.map((option) => (
                <button
                  className={`admin-filter-chip ${
                    trophyFilter === option.value ? 'admin-filter-chip--active' : ''
                  }`}
                  key={option.value}
                  onClick={() => setTrophyFilter(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
            <label className="admin-search-field">
              <Search aria-hidden="true" />
              <input
                onChange={(event) => setTrophySearch(event.target.value)}
                placeholder="Rechercher un trophée..."
                type="search"
                value={trophySearch}
              />
            </label>
          </div>
        </SectionCard>

        {filteredAdminTrophies.length ? (
          <div className="admin-trophy-grid">
            {filteredAdminTrophies.map((trophy) => {
              const previewImage = getTrophyPreviewImage(trophy);
              const isSelected = selectedTrophy?.id === trophy.id;
              const summaryLabel =
                trophy.visibility === 'surprise' && trophy.type === 'special'
                  ? 'Règle visible uniquement par l’administrateur.'
                  : trophy.ruleSummary;

              return (
                <article
                  className={`admin-trophy-card ${
                    isSelected ? 'admin-trophy-card--selected' : ''
                  }`}
                  key={trophy.id}
                >
                  <div className="admin-trophy-card__hero">
                    <div className="admin-trophy-card__image">
                      {previewImage ? (
                        <img alt={trophy.title} src={previewImage} />
                      ) : (
                        <Trophy aria-hidden="true" />
                      )}
                    </div>
                    <div className="admin-trophy-card__copy">
                      <div className="admin-trophy-card__title-row">
                        <strong>{trophy.title || 'Trophée sans titre'}</strong>
                        <span className={TROPHY_STATUS_CLASSNAMES[trophy.status]}>
                          {TROPHY_STATUS_LABELS[trophy.status]}
                        </span>
                      </div>
                      <div className="admin-trophy-card__tags">
                        <span className="admin-tag-chip">
                          {TROPHY_TYPE_LABELS[trophy.type]}
                        </span>
                        <span className="admin-tag-chip">
                          {TROPHY_FORMAT_LABELS[trophy.format]}
                        </span>
                        <span className="admin-tag-chip">
                          {TROPHY_VISIBILITY_LABELS[trophy.visibility]}
                        </span>
                      </div>
                      <p className="admin-trophy-card__summary">{summaryLabel}</p>
                    </div>
                  </div>

                  <div className="admin-trophy-card__footer">
                    <span>{formatObtainedCountLabel(trophy.obtainedCount)}</span>
                    <span>
                      {trophy.type === 'operatoire'
                        ? trophy.operativeScope === 'approach'
                          ? trophy.associatedApproach
                            ? getChoiceLabel(
                                approachOptions,
                                trophy.associatedApproach,
                                trophy.associatedApproach
                              )
                            : 'Voie d’abord à définir'
                          : trophy.associatedProcedure
                            ? getChoiceLabel(
                                surgicalProcedureOptions,
                                trophy.associatedProcedure,
                                trophy.associatedProcedure
                              )
                            : 'Intervention à définir'
                        : TROPHY_VISIBILITY_DESCRIPTIONS[trophy.visibility]}
                    </span>
                  </div>

                  <div className="admin-trophy-card__actions">
                    <button
                      className="mini-button mini-button--secondary"
                      onClick={() => setSelectedTrophyId(trophy.id)}
                      type="button"
                    >
                      Aperçu
                    </button>
                    <button
                      className="mini-button mini-button--secondary"
                      onClick={() => handleEditTrophy(trophy.id)}
                      type="button"
                    >
                      Modifier
                    </button>
                    <button
                      className="mini-button mini-button--secondary"
                      onClick={() => handleDuplicateTrophy(trophy)}
                      type="button"
                    >
                      Dupliquer
                    </button>
                    <button
                      className="mini-button mini-button--secondary"
                      onClick={() => handleTrophyStatusToggle(trophy.id)}
                      type="button"
                    >
                      {trophy.status === 'active' ? 'Désactiver' : 'Activer'}
                    </button>
                    <button
                      className="mini-button mini-button--danger"
                      onClick={() => handleDeleteTrophy(trophy.id)}
                      type="button"
                    >
                      Supprimer
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <SectionCard className="admin-dashboard-card">
            <div className="admin-empty-state">
              <Trophy aria-hidden="true" />
              <strong>Aucun trophée ne correspond aux filtres</strong>
              <span>
                Ajustez la recherche ou créez un nouveau trophée pour démarrer le
                catalogue.
              </span>
            </div>
          </SectionCard>
        )}

        {selectedTrophy ? (
          <SectionCard
            className="admin-dashboard-card admin-trophy-preview-shell"
            description="Prévisualisation de l’affichage interne selon la configuration actuelle."
            title="Aperçu côté interne"
          >
            <div className="admin-trophy-preview-panel">
              <div className="admin-trophy-preview-card">
                <div className="admin-trophy-preview-card__badge">
                  {selectedTrophy.visibility === 'surprise' ? 'Trophée surprise' : 'Progression visible'}
                </div>
                <div className="admin-trophy-preview-card__visual">
                  {getTrophyPreviewImage(selectedTrophy) ? (
                    <img
                      alt={selectedTrophy.title}
                      src={getTrophyPreviewImage(selectedTrophy) as string}
                    />
                  ) : (
                    <Trophy aria-hidden="true" />
                  )}
                </div>
                <strong>{selectedTrophy.title}</strong>
                <p>{selectedTrophy.description}</p>
                {selectedTrophy.format === 'levels' ? (
                  <div className="admin-preview-level-list">
                    {selectedTrophy.levels.map((level) => (
                      <div className="admin-preview-level-item" key={level.tier}>
                        <span>{level.label}</span>
                        <small>
                          {level.threshold ?? 0} intervention(s){' '}
                          {selectedTrophy.trackedInterventionStatus === 'evaluated'
                            ? 'évaluée(s)'
                            : 'enregistrée(s)'}
                        </small>
                      </div>
                    ))}
                  </div>
                ) : selectedTrophy.visibility === 'surprise' ? (
                  <div className="admin-trophy-preview-card__surprise-note">
                    Ce trophée restera invisible avant son obtention.
                  </div>
                ) : null}
              </div>

              <div className="admin-trophy-preview-meta">
                <div className="admin-preview-stat">
                  <strong>{selectedTrophy.obtainedCount}</strong>
                  <span>interne(s) l’ont obtenu</span>
                </div>
                <div className="admin-preview-stat">
                  <strong>{TROPHY_STATUS_LABELS[selectedTrophy.status]}</strong>
                  <span>statut actuel</span>
                </div>
                <div className="admin-preview-stat">
                  <strong>{TROPHY_FORMAT_LABELS[selectedTrophy.format]}</strong>
                  <span>format configuré</span>
                </div>
              </div>
            </div>
          </SectionCard>
        ) : null}

        <SectionCard className="admin-dashboard-card admin-info-card">
          <div className="admin-info-card__body">
            <div className="admin-info-card__icon">
              <Info aria-hidden="true" />
            </div>
            <div className="admin-info-card__copy">
              <strong>À propos du catalogue des trophées</strong>
              <p>
                Les trophées sont attribués automatiquement selon les règles que
                vous configurez. Modifier un trophée actif peut déclencher un
                recalcul pour l’ensemble des internes.
              </p>
            </div>
          </div>
        </SectionCard>
      </AdminPageShell>
    );
  }

  if (isAdmin && view === 'trophy-create-type') {
    return (
      <AdminPageShell
        backLabel="Retour au catalogue des trophées"
        onBack={() => setView('trophies')}
        subtitle="Choisissez le format de configuration à ouvrir pour créer un nouveau trophée."
        title="Créer un trophée"
      >
        <div className="admin-trophy-type-grid">
          <button
            className="admin-trophy-type-card"
            onClick={() => handleStartTrophyCreation('operatoire')}
            type="button"
          >
            <div className="admin-trophy-type-card__icon admin-trophy-type-card__icon--turquoise">
              <Trophy aria-hidden="true" />
            </div>
            <div className="admin-trophy-type-card__copy">
              <strong>Trophée opératoire</strong>
              <p>
                Configurez un trophée lié à une intervention précise avec une
                progression par niveaux Bronze, Argent, Or et Diamant.
              </p>
              <span>Intervention associée, voie d’abord, rôle, seuils, autonomie.</span>
            </div>
            <ChevronRight aria-hidden="true" />
          </button>

          <button
            className="admin-trophy-type-card"
            onClick={() => handleStartTrophyCreation('special')}
            type="button"
          >
            <div className="admin-trophy-type-card__icon admin-trophy-type-card__icon--violet">
              <Star aria-hidden="true" />
            </div>
            <div className="admin-trophy-type-card__copy">
              <strong>Trophée spécial</strong>
              <p>
                Créez un trophée transversal, événementiel ou surprise basé sur des
                conditions configurables.
              </p>
              <span>Conditions multiples, plage horaire, volume global, jalons spéciaux.</span>
            </div>
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </AdminPageShell>
    );
  }

  if (isAdmin && view === 'trophy-editor' && trophyDraft) {
    const isEditingExistingTrophy = adminTrophies.some(
      (trophy) => trophy.id === trophyDraft.id
    );
    const previewProfile = internalProfiles[0] ?? null;
    const previewUnlockedTier = previewProfile
      ? getUnlockedTrophyTierForProfile(
          trophyDraft,
          previewProfile,
          savedInterventions,
          adminEvaluations
        )
      : null;
    const previewImage = getTrophyPreviewImage(trophyDraft);
    const previewObtainedCount = countProfilesWithTrophy(
      trophyDraft,
      internalProfiles,
      savedInterventions,
      adminEvaluations
    );
    const matchingProfiles = internalProfiles
      .filter(
        (profile) =>
          getUnlockedTrophyTierForProfile(
            trophyDraft,
            profile,
            savedInterventions,
            adminEvaluations
          ) != null
      )
      .sort((left, right) =>
        formatDisplayName(left.firstName, left.lastName).localeCompare(
          formatDisplayName(right.firstName, right.lastName),
          'fr-FR',
          { sensitivity: 'base' }
        )
      );

    return (
      <AdminPageShell
        backLabel="Retour au catalogue des trophées"
        onBack={handleCancelTrophyEditor}
        subtitle={
          trophyDraft.type === 'operatoire'
            ? 'Configurez un trophée lié à une intervention avec progression visible.'
            : 'Configurez un trophée surprise lié à un objectif transversal ou à un événement.'
        }
        title={
          isEditingExistingTrophy
            ? 'Modifier un trophée'
            : trophyDraft.type === 'operatoire'
              ? 'Créer un trophée opératoire'
              : 'Créer un trophée spécial'
        }
      >
        <div className="admin-page-toolbar">
          <div />
          <button
            className="app-button app-button--primary"
            disabled={isSavingTrophy || uploadingTrophyImageKeys.length > 0}
            onClick={handleSaveTrophy}
            type="button"
          >
            {isSavingTrophy ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>

        {trophyFormFeedback ? (
          <div
            className={
              trophyFormFeedback.kind === 'success'
                ? 'auth-success'
                : 'auth-error'
            }
          >
            {trophyFormFeedback.message}
          </div>
        ) : null}

        {trophyStorageWarning ? (
          <div className="auth-error">{trophyStorageWarning}</div>
        ) : null}

        {trophyValidationErrors.length ? (
          <div className="validation-box admin-validation-box">
            <strong>Compléments nécessaires avant enregistrement</strong>
            {trophyValidationErrors.map((error) => (
              <span key={error}>{error}</span>
            ))}
          </div>
        ) : null}

        <div className="admin-trophy-editor-layout">
          <div className="admin-trophy-editor-main">
            <SectionCard className="admin-dashboard-card" title="Informations générales">
              <div className="admin-create-form">
                <label className="field-stack admin-create-form__field--full">
                  <span className="field-stack__label">Nom du trophée</span>
                  <input
                    className="field-input"
                    onChange={(event) =>
                      handleTrophyDraftFieldChange('title', event.target.value)
                    }
                    placeholder={
                      trophyDraft.type === 'operatoire'
                        ? 'Ex. Progression salpingectomie'
                        : 'Ex. Trophée de nuit'
                    }
                    type="text"
                    value={trophyDraft.title}
                  />
                </label>

                <label className="field-stack admin-create-form__field--full">
                  <span className="field-stack__label">
                    Description courte (optionnelle)
                  </span>
                  <input
                    className="field-input"
                    onChange={(event) =>
                      handleTrophyDraftFieldChange('description', event.target.value)
                    }
                    placeholder="Optionnel : décrivez brièvement ce que récompense ce trophée."
                    type="text"
                    value={trophyDraft.description}
                  />
                </label>

                <div className="admin-create-form__grid">
                  <label className="field-stack">
                    <span className="field-stack__label">Statut</span>
                    <select
                      className="field-input"
                      onChange={(event) =>
                        handleTrophyDraftFieldChange('status', event.target.value)
                      }
                      value={trophyDraft.status}
                    >
                      <option value="draft">Brouillon</option>
                      <option value="active">Actif</option>
                      <option value="inactive">Inactif</option>
                    </select>
                  </label>
                </div>

                {trophyDraft.type === 'operatoire' ? (
                  <div className="admin-create-form__grid">
                    <label className="field-stack">
                      <span className="field-stack__label">Progression suivie</span>
                      <select
                        className="field-input"
                        onChange={(event) =>
                          handleTrophyDraftFieldChange(
                            'operativeScope',
                            event.target.value
                          )
                        }
                        value={trophyDraft.operativeScope}
                      >
                        {TROPHY_OPERATIVE_SCOPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    {trophyDraft.operativeScope === 'procedure' ? (
                      <>
                        <label className="field-stack">
                          <span className="field-stack__label">Intervention associée</span>
                          <select
                            className="field-input"
                            onChange={(event) =>
                              handleTrophyDraftFieldChange(
                                'associatedProcedure',
                                event.target.value
                              )
                            }
                            value={trophyDraft.associatedProcedure}
                          >
                            <option value="">Sélectionner</option>
                            {surgicalProcedureOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="field-stack">
                          <span className="field-stack__label">Voie d’abord (facultatif)</span>
                          <select
                            className="field-input"
                            onChange={(event) =>
                              handleTrophyDraftFieldChange(
                                'associatedApproach',
                                event.target.value
                              )
                            }
                            value={trophyDraft.associatedApproach}
                          >
                            <option value="">Toutes</option>
                            {approachOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </label>
                      </>
                    ) : (
                      <label className="field-stack">
                        <span className="field-stack__label">Voie d’abord suivie</span>
                        <select
                          className="field-input"
                          onChange={(event) =>
                            handleTrophyDraftFieldChange(
                              'associatedApproach',
                              event.target.value
                            )
                          }
                          value={trophyDraft.associatedApproach}
                        >
                          <option value="">Sélectionner</option>
                          {approachOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}

                    <label className="field-stack">
                      <span className="field-stack__label">Indication (facultatif)</span>
                      <select
                        className="field-input"
                        onChange={(event) =>
                          handleTrophyDraftFieldChange(
                            'associatedIndication',
                            event.target.value
                          )
                        }
                        value={trophyDraft.associatedIndication}
                      >
                        <option value="">Toutes</option>
                        {indicationOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field-stack">
                      <span className="field-stack__label">Rôle pris en compte</span>
                      <select
                        className="field-input"
                        onChange={(event) =>
                          handleTrophyDraftFieldChange('trackedRole', event.target.value)
                        }
                        value={trophyDraft.trackedRole}
                      >
                        <option value="">Tous les rôles</option>
                        {roleOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field-stack">
                      <span className="field-stack__label">
                        Statut des interventions prises en compte
                      </span>
                      <select
                        className="field-input"
                        onChange={(event) =>
                          handleTrophyDraftFieldChange(
                            'trackedInterventionStatus',
                            event.target.value
                          )
                        }
                        value={trophyDraft.trackedInterventionStatus}
                      >
                        <option value="evaluated">Évaluées</option>
                        <option value="recorded">Enregistrées</option>
                      </select>
                    </label>
                  </div>
                ) : null}
              </div>
            </SectionCard>

            {trophyDraft.format === 'unique' ? (
              <SectionCard
                className="admin-dashboard-card"
                description="Cumulez une ou plusieurs conditions. Toutes les conditions doivent être remplies."
                title="Conditions d’obtention"
              >
                <div className="admin-condition-list">
                  {trophyDraft.conditions.map((condition, index) => (
                    <Fragment key={condition.id}>
                      {index > 0 ? (
                        <div className="admin-condition-separator">ET</div>
                      ) : null}
                      <div className="admin-condition-card">
                        <div className="admin-condition-card__header">
                          <strong>Condition {index + 1}</strong>
                          {trophyDraft.conditions.length > 1 ? (
                            <button
                              className="mini-button mini-button--danger"
                              onClick={() => handleDeleteTrophyCondition(condition.id)}
                              type="button"
                            >
                              Supprimer
                            </button>
                          ) : null}
                        </div>

                        <div className="admin-create-form__grid">
                          <label className="field-stack admin-create-form__field--full">
                            <span className="field-stack__label">Type de condition</span>
                            <select
                              className="field-input"
                              onChange={(event) =>
                                handleTrophyConditionTypeChange(
                                  condition.id,
                                  event.target.value as TrophyConditionType
                                )
                              }
                              value={condition.type}
                            >
                              {TROPHY_CONDITION_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </label>

                          {[
                            'total_recorded',
                            'total_evaluated',
                            'procedure_count',
                            'approach_count',
                            'recording_time_range',
                          ].includes(condition.type) ? (
                            <label className="field-stack">
                              <span className="field-stack__label">Seuil minimal</span>
                              <input
                                className="field-input"
                                min="1"
                                onChange={(event) =>
                                  handleTrophyConditionFieldChange(
                                    condition.id,
                                    'threshold',
                                    parseOptionalNumber(event.target.value)
                                  )
                                }
                                type="number"
                                value={condition.threshold ?? ''}
                              />
                            </label>
                          ) : null}

                          {condition.type === 'procedure_count' ? (
                            <>
                              <label className="field-stack">
                                <span className="field-stack__label">Intervention</span>
                                <select
                                  className="field-input"
                                  onChange={(event) =>
                                    handleTrophyConditionFieldChange(
                                      condition.id,
                                      'procedure',
                                      event.target.value
                                    )
                                  }
                                  value={condition.procedure ?? ''}
                                >
                                  <option value="">Sélectionner</option>
                                  {surgicalProcedureOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="field-stack">
                                <span className="field-stack__label">Statut pris en compte</span>
                                <select
                                  className="field-input"
                                  onChange={(event) =>
                                    handleTrophyConditionFieldChange(
                                      condition.id,
                                      'trackedStatus',
                                      event.target.value
                                    )
                                  }
                                  value={condition.trackedStatus ?? 'recorded'}
                                >
                                  <option value="recorded">Enregistrées</option>
                                  <option value="evaluated">Évaluées</option>
                                </select>
                              </label>
                            </>
                          ) : null}

                          {condition.type === 'approach_count' ? (
                            <>
                              <label className="field-stack">
                                <span className="field-stack__label">Voie d’abord</span>
                                <select
                                  className="field-input"
                                  onChange={(event) =>
                                    handleTrophyConditionFieldChange(
                                      condition.id,
                                      'approach',
                                      event.target.value
                                    )
                                  }
                                  value={condition.approach ?? ''}
                                >
                                  <option value="">Sélectionner</option>
                                  {approachOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="field-stack">
                                <span className="field-stack__label">Statut pris en compte</span>
                                <select
                                  className="field-input"
                                  onChange={(event) =>
                                    handleTrophyConditionFieldChange(
                                      condition.id,
                                      'trackedStatus',
                                      event.target.value
                                    )
                                  }
                                  value={condition.trackedStatus ?? 'recorded'}
                                >
                                  <option value="recorded">Enregistrées</option>
                                  <option value="evaluated">Évaluées</option>
                                </select>
                              </label>
                            </>
                          ) : null}

                          {condition.type === 'recording_time_range' ? (
                            <>
                              <label className="field-stack">
                                <span className="field-stack__label">Heure de début</span>
                                <input
                                  className="field-input"
                                  onChange={(event) =>
                                    handleTrophyConditionFieldChange(
                                      condition.id,
                                      'startHour',
                                      event.target.value
                                    )
                                  }
                                  type="time"
                                  value={condition.startHour ?? '00:00'}
                                />
                              </label>
                              <label className="field-stack">
                                <span className="field-stack__label">Heure de fin</span>
                                <input
                                  className="field-input"
                                  onChange={(event) =>
                                    handleTrophyConditionFieldChange(
                                      condition.id,
                                      'endHour',
                                      event.target.value
                                    )
                                  }
                                  type="time"
                                  value={condition.endHour ?? '06:00'}
                                />
                              </label>
                            </>
                          ) : null}

                          {condition.type === 'average_autonomy' ? (
                            <label className="field-stack">
                              <span className="field-stack__label">Autonomie moyenne minimale (%)</span>
                              <input
                                className="field-input"
                                min="0"
                                onChange={(event) =>
                                  handleTrophyConditionFieldChange(
                                    condition.id,
                                    'autonomyMin',
                                    parseOptionalNumber(event.target.value)
                                  )
                                }
                                type="number"
                                value={condition.autonomyMin ?? ''}
                              />
                            </label>
                          ) : null}

                          {condition.type === 'cross_procedure_autonomy' ? (
                            <>
                              <label className="field-stack">
                                <span className="field-stack__label">Autonomie moyenne minimale (%)</span>
                                <input
                                  className="field-input"
                                  min="0"
                                  onChange={(event) =>
                                    handleTrophyConditionFieldChange(
                                      condition.id,
                                      'autonomyMin',
                                      parseOptionalNumber(event.target.value)
                                    )
                                  }
                                  type="number"
                                  value={condition.autonomyMin ?? ''}
                                />
                              </label>
                              <label className="field-stack">
                                <span className="field-stack__label">Nombre de types d’interventions</span>
                                <input
                                  className="field-input"
                                  min="1"
                                  onChange={(event) =>
                                    handleTrophyConditionFieldChange(
                                      condition.id,
                                      'distinctProcedureCount',
                                      parseOptionalNumber(event.target.value)
                                    )
                                  }
                                  type="number"
                                  value={condition.distinctProcedureCount ?? ''}
                                />
                              </label>
                              <label className="field-stack">
                                <span className="field-stack__label">Minimum évalué par type</span>
                                <input
                                  className="field-input"
                                  min="1"
                                  onChange={(event) =>
                                    handleTrophyConditionFieldChange(
                                      condition.id,
                                      'minEvaluatedPerProcedure',
                                      parseOptionalNumber(event.target.value)
                                    )
                                  }
                                  type="number"
                                  value={condition.minEvaluatedPerProcedure ?? ''}
                                />
                              </label>
                            </>
                          ) : null}

                          {condition.type === 'distinct_procedures' ? (
                            <label className="field-stack">
                              <span className="field-stack__label">Nombre minimal d’interventions différentes</span>
                              <input
                                className="field-input"
                                min="1"
                                onChange={(event) =>
                                  handleTrophyConditionFieldChange(
                                    condition.id,
                                    'distinctProcedureCount',
                                    parseOptionalNumber(event.target.value)
                                  )
                                }
                                type="number"
                                value={condition.distinctProcedureCount ?? ''}
                              />
                            </label>
                          ) : null}

                          {condition.type === 'role' ? (
                            <label className="field-stack">
                              <span className="field-stack__label">Rôle de l’interne</span>
                              <select
                                className="field-input"
                                onChange={(event) =>
                                  handleTrophyConditionFieldChange(
                                    condition.id,
                                    'role',
                                    event.target.value
                                  )
                                }
                                value={condition.role ?? ''}
                              >
                                <option value="">Sélectionner</option>
                                {roleOptions.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}

                          {condition.type === 'intervention_status' ? (
                            <label className="field-stack">
                              <span className="field-stack__label">Statut recherché</span>
                              <select
                                className="field-input"
                                onChange={(event) =>
                                  handleTrophyConditionFieldChange(
                                    condition.id,
                                    'interventionStatus',
                                    event.target.value
                                  )
                                }
                                value={condition.interventionStatus ?? ''}
                              >
                                <option value="">Sélectionner</option>
                                <option value="evaluated">Évaluée</option>
                                <option value="pending">En attente</option>
                              </select>
                            </label>
                          ) : null}
                        </div>

                        <p className="admin-condition-card__summary">
                          {buildConditionSummary(condition, trophyDraft)}
                        </p>
                      </div>
                    </Fragment>
                  ))}
                </div>

                <button
                  className="mini-button mini-button--secondary"
                  onClick={handleAddTrophyCondition}
                  type="button"
                >
                  + Ajouter une condition
                </button>
              </SectionCard>
            ) : (
              <SectionCard
                className="admin-dashboard-card"
                description={
                  trophyDraft.operativeScope === 'approach'
                    ? 'Ce trophée suit automatiquement la progression sur la voie d’abord sélectionnée.'
                    : 'Ce trophée suit automatiquement la progression sur l’intervention sélectionnée.'
                }
                title="Conditions d’obtention"
              >
                <div className="admin-trophy-helper-grid">
                  <div className="admin-helper-card">
                    <strong>Progression suivie</strong>
                    <span>
                      {trophyDraft.operativeScope === 'approach'
                        ? 'Voie d’abord'
                        : 'Intervention'}
                    </span>
                  </div>
                  <div className="admin-helper-card">
                    <strong>
                      {trophyDraft.operativeScope === 'approach'
                        ? 'Voie d’abord suivie'
                        : 'Intervention suivie'}
                    </strong>
                    <span>
                      {trophyDraft.operativeScope === 'approach'
                        ? trophyDraft.associatedApproach
                          ? getChoiceLabel(
                              approachOptions,
                              trophyDraft.associatedApproach,
                              trophyDraft.associatedApproach
                            )
                          : 'À définir'
                        : trophyDraft.associatedProcedure
                          ? getChoiceLabel(
                              surgicalProcedureOptions,
                              trophyDraft.associatedProcedure,
                              trophyDraft.associatedProcedure
                            )
                          : 'À définir'}
                    </span>
                  </div>
                  <div className="admin-helper-card">
                    <strong>Indication</strong>
                    <span>
                      {trophyDraft.associatedIndication
                        ? getChoiceLabel(
                            indicationOptions,
                            trophyDraft.associatedIndication,
                            trophyDraft.associatedIndication
                          )
                        : 'Toutes'}
                    </span>
                  </div>
                  {trophyDraft.operativeScope === 'procedure' ? (
                    <div className="admin-helper-card">
                      <strong>Voie d’abord</strong>
                      <span>
                        {trophyDraft.associatedApproach
                          ? getChoiceLabel(
                              approachOptions,
                              trophyDraft.associatedApproach,
                              trophyDraft.associatedApproach
                            )
                          : 'Toutes'}
                      </span>
                    </div>
                  ) : null}
                  <div className="admin-helper-card">
                    <strong>Rôle pris en compte</strong>
                    <span>
                      {trophyDraft.trackedRole
                        ? getChoiceLabel(roleOptions, trophyDraft.trackedRole, trophyDraft.trackedRole)
                        : 'Tous les rôles'}
                    </span>
                  </div>
                  <div className="admin-helper-card">
                    <strong>Statut pris en compte</strong>
                    <span>
                      {trophyDraft.trackedInterventionStatus === 'evaluated'
                        ? 'Interventions évaluées'
                        : 'Interventions enregistrées'}
                    </span>
                  </div>
                </div>
              </SectionCard>
            )}

            {trophyDraft.format === 'levels' ? (
              <SectionCard
                className="admin-dashboard-card"
                description="Réglez les seuils Bronze, Argent, Or et Diamant."
                title="Niveaux du trophée"
              >
                <div className="admin-level-list">
                  {trophyDraft.levels.map((level) => (
                    <div className="admin-level-card" key={level.tier}>
                      <div className="admin-level-card__header">
                        <strong>{level.label}</strong>
                        <span className="admin-tag-chip">
                          {level.autonomyMin != null
                            ? `Autonomie ≥ ${level.autonomyMin} %`
                            : 'Sans contrainte d’autonomie'}
                        </span>
                      </div>
                      <div className="admin-create-form__grid">
                        <label className="field-stack">
                          <span className="field-stack__label">Seuil</span>
                          <input
                            className="field-input"
                            min="1"
                            onChange={(event) =>
                              handleTrophyLevelChange(
                                level.tier,
                                'threshold',
                                parseOptionalNumber(event.target.value)
                              )
                            }
                            type="number"
                            value={level.threshold ?? ''}
                          />
                        </label>

                        <label className="field-stack">
                          <span className="field-stack__label">Autonomie minimale (%)</span>
                          <input
                            className="field-input"
                            min="0"
                            onChange={(event) =>
                              handleTrophyLevelChange(
                                level.tier,
                                'autonomyMin',
                                parseOptionalNumber(event.target.value)
                              )
                            }
                            placeholder="Optionnel"
                            type="number"
                            value={level.autonomyMin ?? ''}
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            ) : null}

            <SectionCard className="admin-dashboard-card" title="Images du trophée">
              <div className="admin-image-grid">
                {(trophyDraft.format === 'levels'
                  ? TROPHY_IMAGE_FIELDS.filter((field) => field.key !== 'single')
                  : TROPHY_IMAGE_FIELDS.filter((field) => field.key === 'single')
                ).map((field) => {
                  const imageValue = trophyDraft.images[field.key];
                  const isUploading = uploadingTrophyImageKeys.includes(field.key);

                  return (
                    <div className="admin-image-card" key={field.key}>
                      <strong>{field.label}</strong>
                      <div className="admin-image-card__preview">
                        {imageValue ? (
                          <img alt={field.label} src={imageValue} />
                        ) : (
                          <Trophy aria-hidden="true" />
                        )}
                      </div>
                      <label className="mini-button mini-button--secondary admin-image-card__upload">
                        {isUploading ? 'Téléversement...' : 'Changer l’image'}
                        <input
                          accept="image/*"
                          disabled={isUploading}
                          hidden
                          onChange={(event) =>
                            handleTrophyImageUpload(
                              field.key,
                              event.target.files?.[0] ?? null
                            )
                          }
                          type="file"
                        />
                      </label>
                      {imageValue ? (
                        <button
                          className="mini-button mini-button--danger"
                          disabled={isUploading}
                          onClick={() => handleTrophyImageRemove(field.key)}
                          type="button"
                        >
                          Supprimer
                        </button>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </SectionCard>

            <SectionCard className="admin-dashboard-card" title="Résumé de la règle">
              <p>{buildTrophyRuleSummary(trophyDraft)}</p>
            </SectionCard>
          </div>

          <div className="admin-trophy-editor-side">
            <SectionCard className="admin-dashboard-card" title="Aperçu côté interne">
              {trophyDraft.visibility === 'surprise' && trophyDraft.type === 'special' ? (
                <div className="admin-surprise-preview">
                  <div className="admin-surprise-preview__visual">
                    {previewImage ? (
                      <img alt={trophyDraft.title || 'Trophée surprise'} src={previewImage} />
                    ) : (
                      <Star aria-hidden="true" />
                    )}
                  </div>
                  <strong>Trophée surprise</strong>
                  <p>
                    Ce trophée est configuré comme trophée surprise. Il restera
                    invisible côté interne avant son obtention.
                  </p>
                  <div className="admin-surprise-preview__checklist">
                    <span>Image du trophée</span>
                    <span>Nom du trophée</span>
                    <span>Description courte si renseignée</span>
                    <span>Date d’obtention si disponible</span>
                  </div>
                </div>
              ) : (
                <div className="admin-editor-preview-card">
                  <div className="admin-editor-preview-card__eyebrow">
                    {TROPHY_VISIBILITY_LABELS[trophyDraft.visibility]}
                  </div>
                  <div className="admin-editor-preview-card__visual">
                    {previewImage ? (
                      <img alt={trophyDraft.title || 'Trophée'} src={previewImage} />
                    ) : (
                      <Trophy aria-hidden="true" />
                    )}
                  </div>
                  <strong>{trophyDraft.title || 'Titre du trophée'}</strong>
                  <p>
                    {trophyDraft.description ||
                      'La description apparaîtra ici dans l’espace interne.'}
                  </p>

                  {trophyDraft.format === 'levels' ? (
                    <div className="admin-editor-preview-levels">
                      {trophyDraft.levels.map((level) => {
                        const isUnlocked =
                          previewUnlockedTier != null &&
                          getTierRank(previewUnlockedTier) >= getTierRank(level.tier);

                        return (
                          <div className="admin-editor-preview-level" key={level.tier}>
                            <div>
                              <span>{level.label}</span>
                              <small>
                                {level.threshold ?? 0} /{' '}
                                {trophyDraft.trackedInterventionStatus === 'evaluated'
                                  ? 'évaluées'
                                  : 'enregistrées'}
                              </small>
                            </div>
                            <strong>{isUnlocked ? 'Obtenu' : 'À débloquer'}</strong>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              )}
            </SectionCard>

            <SectionCard className="admin-dashboard-card" title="Impact estimé">
              <div className="admin-preview-stat-list">
                <div className="admin-preview-stat">
                  <strong>{previewObtainedCount}</strong>
                  <span>interne(s) correspondant déjà à la règle</span>
                </div>
                <div className="admin-preview-stat">
                  <strong>
                    {matchingProfiles.length
                      ? `${matchingProfiles.length} profil${
                          matchingProfiles.length > 1 ? 's' : ''
                        } identifié${matchingProfiles.length > 1 ? 's' : ''}`
                      : 'Aucun interne correspondant'}
                  </strong>
                  {matchingProfiles.length ? (
                    <div className="admin-preview-stat__profile-list">
                      {matchingProfiles.map((profile) => (
                        <span
                          className="admin-preview-stat__profile-chip"
                          key={profile.id}
                        >
                          {formatDisplayName(profile.firstName, profile.lastName)}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span>
                      La liste des internes déjà éligibles au trophée apparaîtra ici.
                    </span>
                  )}
                </div>
                <div className="admin-preview-stat">
                  <strong>{TROPHY_STATUS_LABELS[trophyDraft.status]}</strong>
                  <span>statut d’enregistrement</span>
                </div>
              </div>
            </SectionCard>
          </div>
        </div>
      </AdminPageShell>
    );
  }

  if (isSenior && selectedSenior) {
    return (
      <SeniorDashboard
        adminEvaluations={adminEvaluations}
        customSurgicalInterventions={customSurgicalInterventions}
        internalProfiles={internalProfiles}
        onEvaluate={openEvaluationTool}
        onLogout={logout}
        savedInterventions={savedInterventions}
        selectedSenior={selectedSenior}
        surgicalProcedureOptions={surgicalProcedureOptions}
        updateSeniorCredentials={updateSeniorCredentials}
        updateSeniorManagedInternals={updateSeniorManagedInternals}
      />
    );
  }

  if (isAdmin) {
    return (
      <AdminPageShell
        subtitle="Supervision de l’activité opératoire, gestion des profils, interventions et trophées pédagogiques."
        title="Espace administrateur"
      >
        <SectionCard
          className="admin-dashboard-card admin-activity-card"
          description="Évolution des interventions enregistrées et évaluées"
          title="Rapport d’activité"
        >
          <div className="admin-activity-card__toolbar">
            <div className="admin-segmented-control" role="tablist" aria-label="Période">
              {ADMIN_ACTIVITY_RANGE_OPTIONS.map((option) => (
                <button
                  className={`admin-segmented-control__button ${
                    activityRange === option.value
                      ? 'admin-segmented-control__button--active'
                      : ''
                  }`}
                  key={option.value}
                  onClick={() => setActivityRange(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="admin-activity-chart-scroll">
            <div
              className="admin-activity-chart"
              style={{
                gridTemplateColumns: `repeat(${activityBuckets.length}, minmax(88px, 1fr))`,
                minWidth: `${activityBuckets.length * 98}px`,
              }}
            >
              {activityBuckets.map((bucket) => (
                <div className="admin-activity-chart__group" key={bucket.id}>
                  <div className="admin-activity-chart__bars">
                    <div
                      className="admin-activity-chart__bar admin-activity-chart__bar--recorded"
                      style={{
                        height: `${(bucket.recordedCount / activityTotals.chartMax) * 100}%`,
                      }}
                    >
                      <span>{bucket.recordedCount}</span>
                    </div>
                    <div
                      className="admin-activity-chart__bar admin-activity-chart__bar--evaluated"
                      style={{
                        height: `${(bucket.evaluatedCount / activityTotals.chartMax) * 100}%`,
                      }}
                    >
                      <span>{bucket.evaluatedCount}</span>
                    </div>
                  </div>
                  <strong>{bucket.label}</strong>
                </div>
              ))}
            </div>
          </div>

          <div className="admin-activity-legend">
            <span>
              <i className="admin-activity-legend__dot admin-activity-legend__dot--recorded" />
              Interventions enregistrées
            </span>
            <span>
              <i className="admin-activity-legend__dot admin-activity-legend__dot--evaluated" />
              Interventions évaluées
            </span>
          </div>

          <div className="admin-metric-grid">
            <article className="admin-metric-card">
              <span className="admin-metric-card__icon">
                <FolderOpen
                  aria-hidden="true"
                  className="admin-metric-card__glyph admin-metric-card__glyph--folder"
                />
              </span>
              <div>
                <strong>{activityTotals.totalRecorded}</strong>
                <span>Total enregistré</span>
                <small>sur la période</small>
              </div>
            </article>
            <article className="admin-metric-card">
              <span className="admin-metric-card__icon admin-metric-card__icon--navy">
                <Check
                  aria-hidden="true"
                  className="admin-metric-card__glyph admin-metric-card__glyph--check"
                />
              </span>
              <div>
                <strong>{activityTotals.totalEvaluated}</strong>
                <span>Total évalué</span>
                <small>sur la période</small>
              </div>
            </article>
          </div>
        </SectionCard>

        <SectionCard className="admin-dashboard-card" title="Dernières activités utilisateurs">
          {recentUserConnections.length ? (
            <div className="admin-connections-list">
              {recentUserConnections.map((connection) => {
                const activities = getConnectionActivities(connection);

                return (
                  <article className="admin-connection-row" key={connection.id}>
                    <div className="admin-connection-row__copy">
                      <div className="admin-connection-row__main">
                        <strong>{connection.name}</strong>
                        <small className="admin-connection-row__time">
                          {formatAdminConnectionTimestamp(connection.lastLoginAt)}
                        </small>
                      </div>
                      <span>{connection.role}</span>
                      <div className="admin-connection-row__activity-list">
                        {activities.length ? (
                          activities.map((entry) => (
                            <span
                              className="admin-connection-row__activity-item"
                              key={entry.id}
                            >
                              {formatAdminConnectionTimestamp(entry.createdAt)} ·{' '}
                              {formatActivityLogEntrySummary(entry)}
                            </span>
                          ))
                        ) : (
                          <span className="admin-connection-row__activity-empty">
                            Aucune activité récente enregistrée.
                          </span>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="validation-box">
              <strong>Aucune connexion sur les 48 dernières heures</strong>
              <span>
                Les connexions internes et seniors récentes apparaîtront ici
                automatiquement.
              </span>
            </div>
          )}
        </SectionCard>

        <div className="admin-shortcut-grid">
          <button
            className="admin-shortcut-card"
            onClick={() => setView('trophies')}
            type="button"
          >
            <span className="admin-shortcut-card__icon">
              <Trophy aria-hidden="true" />
            </span>
            <div className="admin-shortcut-card__copy">
              <strong>Catalogue des trophées</strong>
              <span>Créer, modifier et consulter les trophées pédagogiques.</span>
            </div>
            <ChevronRight aria-hidden="true" />
          </button>

          <button
            className="admin-shortcut-card"
            onClick={() => setView('history')}
            type="button"
          >
            <span className="admin-shortcut-card__icon admin-shortcut-card__icon--green">
              <FolderOpen aria-hidden="true" />
            </span>
            <div className="admin-shortcut-card__copy">
              <strong>Historique des blocs</strong>
              <span>
                Consulter toutes les interventions enregistrées, filtrer les données
                et exporter en Excel.
              </span>
            </div>
            <ChevronRight aria-hidden="true" />
          </button>

          <button
            className="admin-shortcut-card"
            onClick={() => setView('interventions')}
            type="button"
          >
            <span className="admin-shortcut-card__icon admin-shortcut-card__icon--violet">
              <Pencil aria-hidden="true" />
            </span>
            <div className="admin-shortcut-card__copy">
              <strong>Créer les interventions</strong>
              <span>Ajouter ou modifier les interventions, voies d’abord et étapes opératoires.</span>
            </div>
            <ChevronRight aria-hidden="true" />
          </button>

          <button
            className="admin-shortcut-card"
            onClick={() => setView('profiles')}
            type="button"
          >
            <span className="admin-shortcut-card__icon admin-shortcut-card__icon--amber">
              <Users aria-hidden="true" />
            </span>
            <div className="admin-shortcut-card__copy">
              <strong>Administration des profils</strong>
              <span>Créer et gérer les comptes internes, seniors et administrateurs.</span>
            </div>
            <ChevronRight aria-hidden="true" />
          </button>
        </div>

        <button className="admin-logout-button" onClick={logout} type="button">
          <LogOut aria-hidden="true" />
          <span>Se déconnecter</span>
        </button>
      </AdminPageShell>
    );
  }

  return (
    <ScreenContainer
      eyebrow="Senior"
      title="Espace senior"
      frameWidth="wide"
    >
      <SectionCard
        title="Accès senior"
        description={
          isSenior && selectedSenior
            ? `Connecté : ${formatDisplayName(
                selectedSenior.firstName,
                selectedSenior.lastName
              )}.`
            : 'Cet espace centralise la création de profils et la consultation des données.'
        }
      >
        <PrimaryButton
          label="Administration des profils"
          onPress={() => setView('profiles')}
          variant="secondary"
        />
        <PrimaryButton
          label="Ouvrir outil de création des interventions"
          onPress={() => setView('interventions')}
          variant="secondary"
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
                          Supprimer
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
                      onClick={() => openProfileStats(profile, 'profiles')}
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

function SeniorDashboard({
  adminEvaluations,
  customSurgicalInterventions,
  internalProfiles,
  onEvaluate,
  onLogout,
  savedInterventions,
  selectedSenior,
  surgicalProcedureOptions,
  updateSeniorCredentials,
  updateSeniorManagedInternals,
}: {
  adminEvaluations: Record<string, AdminInterventionEvaluation>;
  customSurgicalInterventions: SurgicalInterventionDefinition[];
  internalProfiles: InternalProfile[];
  onEvaluate: (interventionId: string) => void;
  onLogout: () => void;
  savedInterventions: SavedIntervention[];
  selectedSenior: Senior;
  surgicalProcedureOptions: ReturnType<typeof useAppContext>['surgicalProcedureOptions'];
  updateSeniorCredentials: (
    seniorId: string,
    input: UpdateSeniorCredentialsInput
  ) => UpdateSeniorCredentialsResult;
  updateSeniorManagedInternals: (seniorId: string, internalIds: string[]) => void;
}) {
  const seniorName = formatDisplayName(
    selectedSenior.firstName,
    selectedSenior.lastName
  );
  const pendingEvaluationsPreviewLimit = 5;
  const [populationFilter, setPopulationFilter] =
    useState<SeniorPopulationFilter>('recent');
  const [isInternalSettingsSheetOpen, setIsInternalSettingsSheetOpen] =
    useState(false);
  const [isPasswordSheetOpen, setIsPasswordSheetOpen] = useState(false);
  const [isPendingEvaluationsSheetOpen, setIsPendingEvaluationsSheetOpen] =
    useState(false);
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const [managedInternalIdsDraft, setManagedInternalIdsDraft] = useState<string[]>(
    selectedSenior.managedInternalIds ?? []
  );
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    nextPassword: '',
    confirmPassword: '',
  });
  const [passwordFeedback, setPasswordFeedback] = useState<FeedbackState>(null);
  const [selectedInterventionKey, setSelectedInterventionKey] = useState(
    SENIOR_FALLBACK_INTERVENTION_OPTION.key
  );
  const [selectedInternalId, setSelectedInternalId] = useState<string | null>(null);
  const internalStripRef = useRef<HTMLDivElement | null>(null);

  const alphabeticalProfiles = useMemo(
    () =>
      [...internalProfiles].sort((left, right) =>
        formatDisplayName(left.firstName, left.lastName).localeCompare(
          formatDisplayName(right.firstName, right.lastName),
          'fr-FR',
          { sensitivity: 'base' }
        )
      ),
    [internalProfiles]
  );

  const seniorSavedInterventions = useMemo(
    () =>
      savedInterventions.filter(
        (intervention) => intervention.seniorId === selectedSenior.id
      ),
    [savedInterventions, selectedSenior.id]
  );

  const interventionOptions = useMemo(
    () =>
      buildSeniorInterventionOptions(
        seniorSavedInterventions,
        surgicalProcedureOptions
      ),
    [seniorSavedInterventions, surgicalProcedureOptions]
  );

  const pendingEvaluations = useMemo(
    () =>
      [...seniorSavedInterventions]
        .filter(
          (intervention) =>
            !hasCompleteAdminEvaluation(adminEvaluations[intervention.id])
        )
        .sort((left, right) => right.savedAt.localeCompare(left.savedAt)),
    [adminEvaluations, seniorSavedInterventions]
  );

  const relatedProfilesByRecency = useMemo(() => {
    const latestByInternal = new Map<string, string>();

    seniorSavedInterventions.forEach((intervention) => {
      if (!intervention.internalId) {
        return;
      }

      const current = latestByInternal.get(intervention.internalId);

      if (!current || current < intervention.savedAt) {
        latestByInternal.set(intervention.internalId, intervention.savedAt);
      }
    });

    return Array.from(latestByInternal.entries())
      .sort((left, right) => right[1].localeCompare(left[1]))
      .map(([internalId]) =>
        internalProfiles.find((profile) => profile.id === internalId) ?? null
      )
      .filter((profile): profile is InternalProfile => profile != null);
  }, [internalProfiles, seniorSavedInterventions]);

  const managedProfiles = useMemo(
    () =>
      alphabeticalProfiles.filter((profile) =>
        (selectedSenior.managedInternalIds ?? []).includes(profile.id)
      ),
    [alphabeticalProfiles, selectedSenior.managedInternalIds]
  );

  const visibleProfiles = useMemo(() => {
    if (populationFilter === 'all') {
      return alphabeticalProfiles;
    }

    if (populationFilter === 'mine') {
      return managedProfiles;
    }

    return relatedProfilesByRecency;
  }, [
    managedProfiles,
    populationFilter,
    relatedProfilesByRecency,
  ]);

  const selectedInterventionOption =
    interventionOptions.find((option) => option.key === selectedInterventionKey) ??
    interventionOptions[0] ??
    SENIOR_FALLBACK_INTERVENTION_OPTION;

  const selectedInternal =
    visibleProfiles.find((profile) => profile.id === selectedInternalId) ??
    visibleProfiles[0] ??
    null;

  const selectedInternalInterventions = useMemo(() => {
    if (!selectedInternal) {
      return [];
    }

    return [...seniorSavedInterventions]
      .filter(
        (intervention) =>
          intervention.internalId === selectedInternal.id &&
          matchesSeniorInterventionOption(intervention, selectedInterventionOption)
      )
      .sort((left, right) => left.savedAt.localeCompare(right.savedAt));
  }, [
    selectedInternal,
    selectedInterventionOption,
    seniorSavedInterventions,
  ]);

  const autonomySeries = useMemo(
    () =>
      buildSeniorAutonomySeries(
        selectedInternalInterventions,
        adminEvaluations,
        customSurgicalInterventions
      ),
    [
      adminEvaluations,
      customSurgicalInterventions,
      selectedInternalInterventions,
    ]
  );

  const stepStats = useMemo(
    () =>
      buildSeniorStepStats(
        selectedInternalInterventions,
        customSurgicalInterventions
      ),
    [customSurgicalInterventions, selectedInternalInterventions]
  );

  useEffect(() => {
    if (
      interventionOptions.some((option) => option.key === selectedInterventionKey)
    ) {
      return;
    }

    setSelectedInterventionKey(
      interventionOptions[0]?.key ?? SENIOR_FALLBACK_INTERVENTION_OPTION.key
    );
  }, [interventionOptions, selectedInterventionKey]);

  useEffect(() => {
    if (!isInternalSettingsSheetOpen) {
      return;
    }

    setManagedInternalIdsDraft(selectedSenior.managedInternalIds ?? []);
  }, [isInternalSettingsSheetOpen, selectedSenior.managedInternalIds]);

  useEffect(() => {
    if (!isPasswordSheetOpen) {
      return;
    }

    setPasswordForm({
      currentPassword: '',
      nextPassword: '',
      confirmPassword: '',
    });
    setPasswordFeedback(null);
  }, [isPasswordSheetOpen]);

  useEffect(() => {
    if (
      selectedInternalId &&
      visibleProfiles.some((profile) => profile.id === selectedInternalId)
    ) {
      return;
    }

    setSelectedInternalId(visibleProfiles[0]?.id ?? null);
  }, [selectedInternalId, visibleProfiles]);

  const handleSupportClick = () => {
    setIsSettingsMenuOpen(false);

    if (typeof window !== 'undefined') {
      window.location.href =
        'mailto:support@chu-nantes.fr?subject=Support%20espace%20senior';
    }
  };

  const toggleManagedInternal = (internalId: string) => {
    setManagedInternalIdsDraft((current) =>
      current.includes(internalId)
        ? current.filter((id) => id !== internalId)
        : [...current, internalId]
    );
  };

  const handleSaveManagedInternals = () => {
    updateSeniorManagedInternals(selectedSenior.id, managedInternalIdsDraft);
    setPopulationFilter('mine');
    setIsInternalSettingsSheetOpen(false);
  };

  const handlePasswordFieldChange = (
    field: 'currentPassword' | 'nextPassword' | 'confirmPassword',
    value: string
  ) => {
    setPasswordForm((current) => ({
      ...current,
      [field]: value,
    }));
    setPasswordFeedback(null);
  };

  const handleSaveSeniorPassword = () => {
    const currentPassword = passwordForm.currentPassword.trim();
    const nextPassword = passwordForm.nextPassword.trim();
    const confirmPassword = passwordForm.confirmPassword.trim();

    if (currentPassword !== (selectedSenior.password ?? '')) {
      setPasswordFeedback({
        kind: 'error',
        message: 'Le mot de passe actuel est incorrect.',
      });
      return;
    }

    if (!nextPassword || !confirmPassword) {
      setPasswordFeedback({
        kind: 'error',
        message: 'Renseigne le nouveau mot de passe et sa confirmation.',
      });
      return;
    }

    if (nextPassword !== confirmPassword) {
      setPasswordFeedback({
        kind: 'error',
        message: 'La confirmation du nouveau mot de passe ne correspond pas.',
      });
      return;
    }

    const result = updateSeniorCredentials(selectedSenior.id, {
      loginId: selectedSenior.loginId ?? '',
      mustChangePassword: false,
      password: nextPassword,
    });

    setPasswordFeedback({
      kind: result.success ? 'success' : 'error',
      message: result.success
        ? 'Le mot de passe a bien été mis à jour.'
        : result.message,
    });

    if (!result.success) {
      return;
    }

    setPasswordForm({
      currentPassword: '',
      nextPassword: '',
      confirmPassword: '',
    });
  };

  const handleEvaluateIntervention = (interventionId: string) => {
    setIsPendingEvaluationsSheetOpen(false);
    onEvaluate(interventionId);
  };

  const scrollInternalStrip = (direction: 'left' | 'right') => {
    internalStripRef.current?.scrollBy({
      left: direction === 'left' ? -280 : 280,
      behavior: 'smooth',
    });
  };

  const renderPendingEvaluationCard = (intervention: SavedIntervention) => {
    const internal = getInternalById(intervention.internalId, internalProfiles) ?? null;
    const procedureLabel = getChoiceLabel(
      surgicalProcedureOptions,
      intervention.procedure
    );

    return (
      <button
        className="senior-evaluation-card senior-evaluation-card--clickable"
        key={intervention.id}
        onClick={() => handleEvaluateIntervention(intervention.id)}
        type="button"
      >
        <ApproachIcon intervention={intervention} />
        <div className="senior-evaluation-card__content">
          <div className="senior-evaluation-card__headline">
            <span className="senior-evaluation-card__date">
              {formatLongFrenchDate(intervention.date)}
            </span>
            <span className="senior-evaluation-card__separator" aria-hidden="true">
              |
            </span>
            <strong>
              {formatSeniorInterventionLabel(
                procedureLabel,
                intervention.procedure,
                intervention.approach
              )}
            </strong>
          </div>
          <span className="senior-evaluation-card__internal">
            Interne :{' '}
            {internal
              ? formatDisplayName(internal.firstName, internal.lastName)
              : 'Interne non retrouvé'}
          </span>
        </div>
        <span className="senior-evaluation-card__action">
          <span>Évaluer</span>
          <ChevronRight aria-hidden="true" />
        </span>
      </button>
    );
  };

  return (
    <ScreenContainer
      frameWidth="wide"
      heroClassName="senior-screen__hero"
      shellClassName="dashboard-screen senior-screen"
      title={`Dr ${seniorName}`}
      subtitle="Service de gynécologie-obstétrique – CHU Nantes"
      headerAction={
        <div className="senior-settings">
          <button
            aria-expanded={isSettingsMenuOpen}
            aria-haspopup="menu"
            aria-label="Ouvrir le menu senior"
            className="senior-settings__button"
            onClick={() => setIsSettingsMenuOpen((current) => !current)}
            type="button"
          >
            <Settings aria-hidden="true" />
          </button>

          {isSettingsMenuOpen ? (
            <div className="senior-settings__menu" role="menu">
              <button
                className="senior-settings__menu-item"
                onClick={() => {
                  setIsSettingsMenuOpen(false);
                  setIsPasswordSheetOpen(true);
                }}
                role="menuitem"
                type="button"
              >
                <Pencil aria-hidden="true" />
                <span>Modifier mot de passe</span>
              </button>

              <button
                className="senior-settings__menu-item"
                onClick={() => {
                  setIsSettingsMenuOpen(false);
                  setIsInternalSettingsSheetOpen(true);
                }}
                role="menuitem"
                type="button"
              >
                <Users aria-hidden="true" />
                <span>Mes paramètres internes</span>
              </button>
            </div>
          ) : null}
        </div>
      }
    >
      <SectionCard className="senior-section-card" title="Interventions à évaluer">
        {pendingEvaluations.length ? (
          <>
            <div className="senior-evaluation-list">
              {pendingEvaluations
                .slice(0, pendingEvaluationsPreviewLimit)
                .map(renderPendingEvaluationCard)}
            </div>

            {pendingEvaluations.length > pendingEvaluationsPreviewLimit ? (
              <button
                className="senior-section-link"
                onClick={() => setIsPendingEvaluationsSheetOpen(true)}
                type="button"
              >
                <span>
                  Voir toutes les interventions à évaluer ({pendingEvaluations.length})
                </span>
                <ChevronRight aria-hidden="true" />
              </button>
            ) : null}
          </>
        ) : (
          <div className="validation-box">
            <strong>Aucune intervention en attente d’évaluation</strong>
            <span>Les prochains blocs attribués à ce senior apparaîtront ici.</span>
          </div>
        )}
      </SectionCard>

      <SectionCard
        className="senior-section-card"
        description="Consultez les statistiques détaillées par type d’intervention."
        title="Aperçu des statistiques par interne"
      >
        <div className="senior-filter-grid">
          <label className="field-stack">
            <span className="field-stack__label">Population</span>
            <select
              className="field-input"
              onChange={(event) =>
                setPopulationFilter(event.target.value as SeniorPopulationFilter)
              }
              value={populationFilter}
            >
              {SENIOR_POPULATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {visibleProfiles.length ? (
          <>
            <div className="senior-internal-strip-shell">
              <button
                aria-label="Faire défiler la liste des internes vers la gauche"
                className="senior-strip-arrow"
                onClick={() => scrollInternalStrip('left')}
                type="button"
              >
                <ChevronLeft aria-hidden="true" />
              </button>

              <div className="senior-internal-strip" ref={internalStripRef}>
                {visibleProfiles.map((profile) => {
                  const isSelected = profile.id === selectedInternal?.id;
                  const semesterTone = getSeniorSemesterTone(profile.semester);

                  return (
                    <button
                      className={`senior-internal-card ${
                        isSelected ? 'senior-internal-card--selected' : ''
                      }`.trim()}
                      key={profile.id}
                      onClick={() => setSelectedInternalId(profile.id)}
                      type="button"
                    >
                      <span
                        className={`senior-avatar senior-avatar--${semesterTone}`}
                        aria-hidden="true"
                      >
                        <UserRound />
                      </span>
                      <span className="senior-internal-card__copy">
                        <strong>
                          {formatDisplayName(profile.firstName, profile.lastName)}
                        </strong>
                        <span>{profile.semester}</span>
                      </span>
                    </button>
                  );
                })}
              </div>

              <button
                aria-label="Faire défiler la liste des internes vers la droite"
                className="senior-strip-arrow"
                onClick={() => scrollInternalStrip('right')}
                type="button"
              >
                <ChevronRight aria-hidden="true" />
              </button>
            </div>

            {selectedInternal ? (
              <div className="senior-profile-detail">
                <div className="senior-profile-detail__header">
                  <div className="senior-profile-detail__identity">
                    <span
                      className={`senior-avatar senior-avatar--${getSeniorSemesterTone(
                        selectedInternal.semester
                      )}`}
                      aria-hidden="true"
                    >
                      <UserRound />
                    </span>
                    <div className="senior-profile-detail__identity-copy">
                      <h3>
                        {formatDisplayName(
                          selectedInternal.firstName,
                          selectedInternal.lastName
                        )}
                      </h3>
                      <span>{selectedInternal.semester}</span>
                    </div>
                  </div>

                  <label className="field-stack senior-profile-detail__selector">
                    <span className="field-stack__label">Intervention analysée</span>
                    <select
                      className="field-input"
                      onChange={(event) =>
                        setSelectedInterventionKey(event.target.value)
                      }
                      value={selectedInterventionOption.key}
                    >
                      {interventionOptions.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="senior-profile-detail__count">
                  <div className="senior-profile-detail__count-main">
                    <strong>
                      {selectedInternalInterventions.length} interventions enregistrées
                    </strong>
                  </div>
                  <span>
                    Nombre d’interventions correspondant au type sélectionné.
                  </span>
                </div>

                <div className="senior-profile-detail__grid">
                  <section className="senior-metric-card senior-metric-card--chart">
                    <div className="senior-metric-card__title-row">
                      <h4>Évolution autonomie</h4>
                      <span className="senior-info-tooltip">
                        <button
                          aria-label="Informations sur l’évolution autonomie"
                          className="senior-info-tooltip__button"
                          type="button"
                        >
                          <Info aria-hidden="true" />
                        </button>
                        <span className="senior-info-tooltip__content" role="note">
                          Évolution du score d’autonomie en fonction du nombre de
                          procédures enregistrées.
                        </span>
                      </span>
                    </div>
                    <SeniorAutonomyLineChart
                      ariaLabel="Évolution du score d’autonomie pour l’interne sélectionné"
                      series={autonomySeries}
                    />
                  </section>

                  <section className="senior-metric-card">
                    <h4>Temps opératoires</h4>
                    <div className="senior-step-list">
                      {stepStats.map((step) => (
                        <div className="senior-step-row" key={step.id}>
                          <div className="senior-step-row__header">
                            <span>{step.label}</span>
                            <strong>
                              {step.score} % <small>· n={step.sampleSize}</small>
                            </strong>
                          </div>
                          <div className="senior-step-row__track" aria-hidden="true">
                            <span
                              className={`senior-step-row__fill senior-step-row__fill--${step.tone}`}
                              style={{ width: `${step.score}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="validation-box">
            <strong>Aucun interne disponible</strong>
            <span>
              {populationFilter === 'recent'
                ? 'Les internes ayant récemment enregistré une intervention avec ce senior référent apparaîtront ici.'
                : populationFilter === 'mine'
                  ? 'Les internes ajoutés dans "Mes internes" apparaîtront ici.'
                  : 'Les profils internes apparaîtront ici dès qu’ils seront créés.'}
            </span>
          </div>
        )}
      </SectionCard>

      <SectionCard
        className="senior-section-card"
      >
        <div className="action-stack">
          <PrimaryButton
            label="Contacter le support"
            onPress={handleSupportClick}
            variant="secondary"
          />
          <PrimaryButton
            label="Se déconnecter"
            onPress={onLogout}
            variant="danger"
          />
        </div>
      </SectionCard>

      {isInternalSettingsSheetOpen ? (
        <div
          aria-hidden="true"
          className="account-sheet-backdrop"
          onClick={() => setIsInternalSettingsSheetOpen(false)}
        >
          <div
            aria-modal="true"
            className="account-sheet senior-account-sheet"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="account-sheet__header">
              <div className="account-sheet__heading">
                <h3>Mes paramètres internes</h3>
                <p className="account-sheet__text">
                  Choisissez les internes qui alimentent le filtre “Mes internes”.
                </p>
              </div>
              <button
                aria-label="Fermer la fenêtre des paramètres internes"
                className="account-sheet__close"
                onClick={() => setIsInternalSettingsSheetOpen(false)}
                type="button"
              >
                <X aria-hidden="true" />
              </button>
            </div>

            <div className="senior-account-sheet__section">
              <div className="senior-account-sheet__section-header">
                <strong>Mes internes</strong>
                <span>
                  {managedInternalIdsDraft.length} sélectionné
                  {managedInternalIdsDraft.length > 1 ? 's' : ''}
                </span>
              </div>
              <div className="senior-account-sheet__list">
                {alphabeticalProfiles.map((profile) => {
                  const isSelected = managedInternalIdsDraft.includes(profile.id);

                  return (
                    <button
                      className={`senior-account-internal ${
                        isSelected ? 'senior-account-internal--selected' : ''
                      }`.trim()}
                      key={profile.id}
                      onClick={() => toggleManagedInternal(profile.id)}
                      type="button"
                    >
                      <span className="senior-account-internal__copy">
                        <strong>
                          {formatDisplayName(profile.firstName, profile.lastName)}
                        </strong>
                        <span>
                          {profile.semester} · {profile.currentRotation}
                        </span>
                      </span>
                      <span
                        className={`senior-account-internal__check ${
                          isSelected ? 'senior-account-internal__check--selected' : ''
                        }`.trim()}
                        aria-hidden="true"
                      >
                        <Check />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="account-sheet__actions account-sheet__actions--split">
              <button
                className="account-button"
                onClick={() => setIsInternalSettingsSheetOpen(false)}
                type="button"
              >
                Fermer
              </button>
              <button
                className="flow-button flow-button--primary"
                onClick={handleSaveManagedInternals}
                type="button"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isPasswordSheetOpen ? (
        <div
          aria-hidden="true"
          className="account-sheet-backdrop"
          onClick={() => setIsPasswordSheetOpen(false)}
        >
          <div
            aria-modal="true"
            className="account-sheet senior-account-sheet"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="account-sheet__header">
              <div className="account-sheet__heading">
                <h3>Modifier mot de passe</h3>
                <p className="account-sheet__text">
                  Mettez à jour le mot de passe du compte senior connecté.
                </p>
              </div>
              <button
                aria-label="Fermer la fenêtre de modification du mot de passe"
                className="account-sheet__close"
                onClick={() => setIsPasswordSheetOpen(false)}
                type="button"
              >
                <X aria-hidden="true" />
              </button>
            </div>

            {passwordFeedback ? (
              <div className={passwordFeedback.kind === 'success' ? 'auth-success' : 'auth-error'}>
                {passwordFeedback.message}
              </div>
            ) : null}

            <div className="account-sheet__stack">
              <label className="account-sheet__field">
                <span>Mot de passe actuel</span>
                <input
                  className="account-sheet__input"
                  onChange={(event) =>
                    handlePasswordFieldChange('currentPassword', event.target.value)
                  }
                  type="password"
                  value={passwordForm.currentPassword}
                />
              </label>

              <label className="account-sheet__field">
                <span>Nouveau mot de passe</span>
                <input
                  className="account-sheet__input"
                  onChange={(event) =>
                    handlePasswordFieldChange('nextPassword', event.target.value)
                  }
                  type="password"
                  value={passwordForm.nextPassword}
                />
              </label>

              <label className="account-sheet__field">
                <span>Confirmer le nouveau mot de passe</span>
                <input
                  className="account-sheet__input"
                  onChange={(event) =>
                    handlePasswordFieldChange('confirmPassword', event.target.value)
                  }
                  type="password"
                  value={passwordForm.confirmPassword}
                />
              </label>
            </div>

            <div className="account-sheet__actions account-sheet__actions--split">
              <button
                className="account-button"
                onClick={() => setIsPasswordSheetOpen(false)}
                type="button"
              >
                Fermer
              </button>
              <button
                className="flow-button flow-button--primary"
                onClick={handleSaveSeniorPassword}
                type="button"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isPendingEvaluationsSheetOpen ? (
        <div
          aria-hidden="true"
          className="account-sheet-backdrop"
          onClick={() => setIsPendingEvaluationsSheetOpen(false)}
        >
          <div
            aria-labelledby="pending-evaluations-sheet-title"
            aria-modal="true"
            className="account-sheet senior-evaluations-sheet"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="account-sheet__header">
              <div className="account-sheet__heading">
                <h3 id="pending-evaluations-sheet-title">
                  Interventions à évaluer
                </h3>
                <p>
                  Retrouvez l’ensemble des interventions en attente pour ce
                  senior.
                </p>
              </div>
              <button
                aria-label="Fermer la fenêtre des interventions à évaluer"
                className="account-sheet__close"
                onClick={() => setIsPendingEvaluationsSheetOpen(false)}
                type="button"
              >
                <X aria-hidden="true" />
              </button>
            </div>

            <div className="senior-account-sheet__section">
              <div className="senior-account-sheet__section-header">
                <strong>{pendingEvaluations.length} intervention(s)</strong>
                <span>Liste complète</span>
              </div>
              <div className="senior-evaluation-list senior-evaluation-list--sheet">
                {pendingEvaluations.map(renderPendingEvaluationCard)}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </ScreenContainer>
  );
}

function SeniorAutonomyLineChart({
  ariaLabel,
  series,
}: {
  ariaLabel: string;
  series: SeniorAutonomyPoint[];
}) {
  const width = 446;
  const height = 272;
  const left = 84;
  const right = 12;
  const top = 18;
  const bottom = 54;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const yAxisLabelX = 14;
  const maxIndex = Math.max(...series.map((point) => point.index));
  const xAxisTicks = buildSeniorXAxisTicks(maxIndex);
  const points = series.map((point, index) => {
    const x =
      maxIndex <= 1
        ? left + chartWidth / 2
        : left + (chartWidth * (point.index - 1)) / (maxIndex - 1);
    const y = top + chartHeight - (point.score / 100) * chartHeight;

    return { ...point, x, y };
  });

  if (!series.length) {
    return <p className="field-helper">Aucune donnée disponible pour cette intervention.</p>;
  }

  return (
    <div className="progress-line-chart senior-progress-line-chart" role="img" aria-label={ariaLabel}>
      <svg viewBox={`0 0 ${width} ${height}`}>
        {[100, 75, 50, 25, 0].map((value) => {
          const y = top + chartHeight - (value / 100) * chartHeight;

          return (
            <g key={value}>
              <line
                className="progress-line-chart__grid"
                x1={left}
                x2={width - right}
                y1={y}
                y2={y}
              />
              <text className="progress-line-chart__axis-label" x={yAxisLabelX} y={y + 4}>
                {value}%
              </text>
            </g>
          );
        })}

        <line
          className="progress-line-chart__axis"
          x1={left}
          x2={left}
          y1={top}
          y2={height - bottom}
        />
        <line
          className="progress-line-chart__axis"
          x1={left}
          x2={width - right}
          y1={height - bottom}
          y2={height - bottom}
        />

        <polyline
          className="progress-line-chart__line"
          fill="none"
          points={points.map((point) => `${point.x},${point.y}`).join(' ')}
        />

        {points.map((point) => (
          <g key={point.id}>
            <circle className="progress-line-chart__point" cx={point.x} cy={point.y} r="4.5" />
          </g>
        ))}

        {xAxisTicks.map((tick) => {
          const tickX =
            maxIndex <= 1
              ? left + chartWidth / 2
              : left + (chartWidth * (tick - 1)) / (maxIndex - 1);

          return (
            <text className="progress-line-chart__x-label" key={tick} x={tickX} y={height - 14}>
              {tick}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
