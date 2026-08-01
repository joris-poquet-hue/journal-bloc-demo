import {
  Archive,
  BarChart3,
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FolderOpen,
  Info,
  LogOut,
  Pencil,
  RotateCcw,
  Search,
  Star,
  Trophy,
  Users,
  X,
} from 'lucide-react';
import {
  type CSSProperties,
  FormEvent,
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  ApproachIcon,
  getInterventionApproachLabel,
} from '../components/ApproachIcon';
import { InternalTrophyCard } from '../components/InternalTrophyCard';
import { InternalAvatar } from '../components/InternalAvatar';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { SectionCard } from '../components/SectionCard';
import { AdminInterventionsManager } from '../components/AdminInterventionsManager';
import { buildSupportMailto } from '../supportConfig';
import { useAppContext } from '../context/AppContext';
import {
  allChecklistSteps,
  approachOptions,
  checklistLevelOptions,
  entryTechniqueOptions,
  formatComplexityRating,
  formatDisplayName,
  formatSeniorDisplayName,
  getHistoricalChecklistSteps,
  getHistoricalProcedureLabel,
  getChoiceLabel,
  getInternalById,
  getSurgicalInterventionDefinition,
  getSurgicalInterventionDefinitions,
  indicationOptions,
  roleOptions,
} from '../data/mockData';
import {
  SENIOR_DIFFICULTY_LABELS,
  SENIOR_PERFORMANCE_LABELS,
} from '../data/seniorEvaluationLabels';
import { getClinicalContextSummaryRows } from '../data/contextVariables';
import {
  CreateInternalProfileInput,
  CreateSeniorProfileInput,
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
  TrophyCondition,
  TrophyConditionType,
  TrophyLevelDefinition,
  TrophyOperativeScope,
  TrophyStatus,
  TrophyTrackedStatus,
  TrophyType,
  TrophyVisibility,
  UpdateInternalCredentialsInput,
  UpdateSeniorCredentialsInput,
} from '../types';
import { formatIsoDate } from '../utils/date';
import {
  calculateAutonomyScore,
  INSUFFICIENT_KEY_STEP_COVERAGE_MESSAGE,
} from '../utils/autonomyScore';
import { getAuthoritativeChecklist } from '../utils/evaluationChecklist';
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
import {
  buildTrophyDisplayModels,
  type TrophyDisplayModel,
} from '../utils/trophyDisplay';
import { downloadAnalyticsExcel } from '../utils/analyticsExport';
import { downloadInterventionsExcel } from '../utils/export';
import { loadBackendDisabledProfiles } from '../services/backendRepository';
import { reactivateAdminAccount } from '../services/adminAccountService';
import type { BackendProfile } from '../shared/backendTypes';
import {
  cleanupTrophyImages,
  uploadTrophyImage,
} from '../services/trophyImageStorage';
import {
  formatLongFrenchDate,
  formatSeniorInterventionLabel,
  getSeniorStepTone,
} from './admin/seniorDashboardModel';
import { SeniorDashboard } from './admin/SeniorDashboard';
import { AdminPageShell } from './admin/AdminPageShell';
import { hasCompleteAdminEvaluation } from './admin/adminEvaluationModel';
import {
  AdminFeedbackMessage as FeedbackMessage,
  type AdminFeedback as FeedbackState,
} from './admin/AdminFeedbackMessage';

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
  | 'institutions'
  | 'interventions';
type AdminActivityRange = 'day' | 'week' | 'month';
type AdminActivityAnalyticsPeriod = '7d' | '30d' | '6m' | '1y';
type AdminInterventionStatusFilter = 'all' | 'evaluated' | 'pending';
type AdminRelanceWindow = '14d' | '1m' | '3m';
type AdminUserConnection = {
  id: string;
  actorRole: 'internal' | 'senior';
  name: string;
  role: 'Interne' | 'Senior';
  lastLoginAt: string;
};
type AdminActivityAnalyticsBucket = {
  id: string;
  label: string;
  internalCount: number;
  seniorCount: number;
  totalCount: number;
};
type AdminRelanceProfile = {
  id: string;
  name: string;
  roleLabel: string;
  contactEmail: string | null;
  lastLoginAt: string | null;
  inactiveDays: number | null;
};
type AdminLeaderboardItem = {
  id: string;
  label: string;
  value: number;
  detail: string;
};
type AdminTrophyFilter =
  | 'all'
  | 'operatoire'
  | 'special'
  | 'draft'
  | 'active'
  | 'inactive';
type AdminTrophyCardItem = AdminTrophyDefinition & {
  levelObtainedCounts: Array<{
    count: number;
    label: string;
    tier: TrophyLevelDefinition['tier'];
  }>;
  obtainedCount: number;
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
type ProfileProgressProcedureOption = {
  indicationLabel: string;
  indicationToken: string;
  key: string;
  label: string;
  procedure: InterventionType;
  procedureLabel: string;
};
type ProfileHistoryCardStatus = Exclude<ProfileHistoryStatusFilter, 'all'>;

const PROFILE_HISTORY_PAGE_SIZE_OPTIONS = [4, 8, 12];
const ADMIN_ACTIVITY_ANALYTICS_PERIOD_OPTIONS: Array<{
  value: AdminActivityAnalyticsPeriod;
  label: string;
}> = [
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
  { value: '6m', label: '6 mois' },
  { value: '1y', label: '1 an' },
];
const ADMIN_RELANCE_WINDOW_OPTIONS: Array<{
  value: AdminRelanceWindow;
  label: string;
}> = [
  { value: '14d', label: '14 jours' },
  { value: '1m', label: '1 mois' },
  { value: '3m', label: '3 mois' },
];
const ADMIN_DETAILED_ACTIVITY_PAGE_SIZE = 10;
const ADMIN_PROFILE_LOGIN_ACTION = 'Connexion au profil';

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
  institutionId: '',
  lastName: '',
  loginId: '',
  promotion: '',
  semester: '',
};

const EMPTY_UPDATE_INTERNAL_CREDENTIALS_FORM: UpdateInternalCredentialsInput = {
  loginId: '',
  password: '',
};

const EMPTY_CREATE_SENIOR_FORM: CreateSeniorProfileInput = {
  firstName: '',
  institutionId: '',
  lastName: '',
  loginId: '',
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
  { value: 'profile_login_count', label: 'Nombre de connexions au profil' },
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

const PROMOTION_OPTIONS = [
  'Promo 2020',
  'Promo 2021',
  'Promo 2022',
  'Promo 2023',
  'Promo 2024',
  'Promo 2025',
];

const SEMESTER_OPTIONS = Array.from({ length: 12 }, (_, index) => `S${index + 1}`);

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

function getProfileInitials(profile: { firstName: string; lastName: string }) {
  return `${profile.firstName.trim().charAt(0)}${profile.lastName.trim().charAt(0)}`
    .trim()
    .toUpperCase();
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

function getChecklistLevelBadgeLabel(level: ChecklistLevel | null | undefined) {
  if (!level) {
    return 'Non renseigné';
  }

  return level === 'NA' ? 'NA' : `Niveau ${level}`;
}

const SENIOR_CHECKLIST_SLIDER_LEVELS = ['0', '1', '2', '3', '4'] as const;
const SENIOR_CHECKLIST_SLIDER_COLORS = [
  '#ef5a3c',
  '#f1a31b',
  '#a8c84a',
  '#58ad72',
  '#0a9da8',
] as const;
const SENIOR_CHECKLIST_DISPLAY_LABELS: Record<ChecklistLevel, string> = {
  NA: 'Non applicable',
  '0': 'Observé uniquement',
  '1': 'Montré et expliqué',
  '2': 'Assistance active du senior',
  '3': 'Assistance passive du senior',
  '4': 'Supervision seule',
};

type SeniorChecklistEditorProps = {
  activeStepId: string | null;
  onActiveStepChange: (stepId: string) => void;
  onValueChange: (stepId: string, level: ChecklistLevel | null) => void;
  steps: Array<{ id: string; label: string }>;
  values: Record<string, ChecklistLevel | null>;
};

function SeniorChecklistEditor({
  activeStepId,
  onActiveStepChange,
  onValueChange,
  steps,
  values,
}: SeniorChecklistEditorProps) {
  const resolvedActiveStepId =
    steps.some((step) => step.id === activeStepId)
      ? activeStepId
      : steps.find((step) => values[step.id] == null)?.id ?? steps[0]?.id ?? null;

  return (
    <div className="senior-checklist-editor">
      {steps.map((step) => {
        const selectedLevel = values[step.id] ?? null;
        const isExpanded = step.id === resolvedActiveStepId;

        if (!isExpanded) {
          return (
            <button
              aria-expanded="false"
              className="senior-checklist-editor__collapsed-step"
              key={step.id}
              onClick={() => onActiveStepChange(step.id)}
              type="button"
            >
              <strong>{step.label}</strong>
              <span
                className={`senior-checklist-editor__collapsed-value ${
                  selectedLevel === 'NA'
                    ? 'senior-checklist-editor__collapsed-value--na'
                    : ''
                }`.trim()}
              >
                {selectedLevel && selectedLevel !== 'NA' ? (
                  <b>{selectedLevel}</b>
                ) : null}
                {selectedLevel
                  ? SENIOR_CHECKLIST_DISPLAY_LABELS[selectedLevel]
                  : 'À renseigner'}
              </span>
              <ChevronDown aria-hidden="true" />
            </button>
          );
        }

        const hasNumericValue =
          selectedLevel != null && selectedLevel !== 'NA';
        const sliderValue = hasNumericValue ? Number(selectedLevel) : 2;
        const sliderPosition = `${sliderValue * 25}%`;
        const sliderLabel = hasNumericValue
          ? SENIOR_CHECKLIST_DISPLAY_LABELS[selectedLevel]
          : selectedLevel == null
            ? 'Déplacer le curseur'
            : null;

        return (
          <div
            aria-label={step.label}
            className="senior-checklist-editor__expanded-step"
            key={step.id}
            role="group"
          >
            <div className="senior-checklist-editor__expanded-header">
              <button
                aria-expanded="true"
                className="senior-checklist-editor__expanded-title"
                onClick={() => onActiveStepChange(step.id)}
                type="button"
              >
                <strong>{step.label}</strong>
                <ChevronDown aria-hidden="true" />
              </button>
              <button
                aria-label={
                  selectedLevel === 'NA'
                    ? `Désélectionner Non applicable pour ${step.label}`
                    : `Sélectionner Non applicable pour ${step.label}`
                }
                aria-pressed={selectedLevel === 'NA'}
                className={`senior-checklist-editor__na-button ${
                  selectedLevel === 'NA'
                    ? 'senior-checklist-editor__na-button--selected'
                    : ''
                }`.trim()}
                onClick={() =>
                  onValueChange(
                    step.id,
                    selectedLevel === 'NA' ? null : 'NA'
                  )
                }
                type="button"
              >
                <b>NA</b>
                <span>Non applicable</span>
              </button>
            </div>

            <div
              className={`senior-checklist-slider ${
                selectedLevel === 'NA' ? 'senior-checklist-slider--na' : ''
              }`.trim()}
              style={
                {
                  '--senior-slider-position': sliderPosition,
                  '--senior-slider-thumb-color':
                    selectedLevel === 'NA'
                      ? '#b7cbd4'
                      : SENIOR_CHECKLIST_SLIDER_COLORS[sliderValue],
                } as CSSProperties
              }
            >
              {sliderLabel ? (
                <output className="senior-checklist-slider__label">
                  {sliderLabel}
                </output>
              ) : null}
              <input
                aria-label={`Niveau d’autonomie pour ${step.label}`}
                aria-valuetext={
                  hasNumericValue
                    ? SENIOR_CHECKLIST_DISPLAY_LABELS[selectedLevel]
                    : undefined
                }
                max="4"
                min="0"
                onChange={(event) =>
                  onValueChange(
                    step.id,
                    String(event.currentTarget.value) as ChecklistLevel
                  )
                }
                step="1"
                type="range"
                value={sliderValue}
              />
              <div
                aria-hidden="true"
                className="senior-checklist-slider__ticks"
              >
                {SENIOR_CHECKLIST_SLIDER_LEVELS.map((level) => (
                  <span key={level}>{level}</span>
                ))}
              </div>
              <div className="senior-checklist-slider__endpoints">
                <span>Observé uniquement</span>
                <span>Supervision seule</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function normalizeProgressToken(value: string) {
  return value.trim().toLocaleLowerCase('fr-FR');
}

function getInterventionIndicationToken(intervention: SavedIntervention) {
  if (intervention.customIndication?.trim()) {
    return `custom:${normalizeProgressToken(intervention.customIndication)}`;
  }

  if (
    intervention.indication === 'autre' &&
    intervention.indicationComment.trim()
  ) {
    return `other:${normalizeProgressToken(intervention.indicationComment)}`;
  }

  return intervention.indication ? `preset:${intervention.indication}` : 'preset:unknown';
}

function matchesProfileProgressProcedureOption(
  intervention: SavedIntervention,
  option: ProfileProgressProcedureOption
) {
  return (
    intervention.procedure === option.procedure &&
    (
      getInterventionIndicationToken(intervention) === option.indicationToken ||
      normalizeProgressToken(getInterventionIndicationLabel(intervention)) ===
        normalizeProgressToken(option.indicationLabel)
    )
  );
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

function getDaysSinceTimestamp(value: string | null, referenceTime: number) {
  if (!value) {
    return null;
  }

  const timestamp = new Date(value).getTime();

  if (Number.isNaN(timestamp)) {
    return null;
  }

  return Math.max(0, Math.floor((referenceTime - timestamp) / (1000 * 60 * 60 * 24)));
}

function formatInactiveDaysLabel(days: number | null) {
  if (days == null) {
    return 'Jamais connecté';
  }

  if (days === 0) {
    return 'Connexion aujourd’hui';
  }

  if (days === 1) {
    return 'Dernière connexion hier';
  }

  return `Dernière connexion il y a ${days} jours`;
}

function formatAdminDelayLabel(valueInMs: number | null) {
  if (valueInMs == null) {
    return 'Non calculable';
  }

  const totalSeconds = Math.max(1, Math.round(valueInMs / 1000));

  if (totalSeconds < 120) {
    return `${totalSeconds} s`;
  }

  const totalMinutes = Math.max(1, Math.round(valueInMs / (1000 * 60)));

  if (totalMinutes < 120) {
    return `${totalMinutes} min`;
  }

  const totalHours = valueInMs / (1000 * 60 * 60);

  if (totalHours < 24) {
    const roundedHours = Math.max(1, Math.round(totalHours));

    return `${roundedHours} h`;
  }

  const totalDays = totalHours / 24;

  return totalDays >= 10
    ? `${Math.round(totalDays)} j`
    : `${totalDays.toFixed(1).replace('.', ',')} j`;
}

function formatAdminActivityBarTooltip(
  count: number,
  roleLabel: 'interne' | 'senior'
) {
  return `${count} activité${count > 1 ? 's' : ''} ${roleLabel}${count > 1 ? 's' : ''}`;
}

function isAnalyticsTrackingEntry(entry: ActivityLogEntry) {
  return Boolean(entry.analyticsEvent);
}

function formatWorkflowDurationLabel(valueInMs: number | null) {
  if (valueInMs == null) {
    return 'Non calculable';
  }

  const totalSeconds = Math.max(1, Math.round(valueInMs / 1000));

  if (totalSeconds < 120) {
    return `${totalSeconds} s`;
  }

  const totalMinutes = Math.max(1, Math.round(valueInMs / (1000 * 60)));

  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
}

function formatAverageClickCountLabel(value: number | null) {
  if (value == null) {
    return 'Non calculable';
  }

  if (value >= 10) {
    return `${Math.round(value)} clics`;
  }

  return `${value.toFixed(1).replace('.', ',')} clics`;
}

function isAnalyticsInteractionTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest('button, input, select, textarea, label, [role="button"]')
    )
  );
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

function formatTierObtainedCountLabel(label: string, count: number) {
  return `${label} obtenu par ${count} interne${count > 1 ? 's' : ''}`;
}

type AdminActivityBucket = {
  id: string;
  label: string;
  recordedCount: number;
  evaluatedCount: number;
};

function getAdminAnalyticsPeriodLabel(period: AdminActivityAnalyticsPeriod) {
  return (
    ADMIN_ACTIVITY_ANALYTICS_PERIOD_OPTIONS.find((option) => option.value === period)
      ?.label ?? '30 jours'
  );
}

function getAdminAnalyticsPeriodStart(
  period: AdminActivityAnalyticsPeriod,
  referenceDate: Date
) {
  if (period === '7d') {
    const start = addDays(referenceDate, -6);

    start.setHours(0, 0, 0, 0);
    return start;
  }

  if (period === '30d') {
    const start = addDays(referenceDate, -29);

    start.setHours(0, 0, 0, 0);
    return start;
  }

  if (period === '6m') {
    return startOfMonth(addMonths(referenceDate, -5));
  }

  return startOfMonth(addMonths(referenceDate, -11));
}

function buildAllTimeAdminCycleSummary(
  activityLog: ActivityLogEntry[],
  interventions: SavedIntervention[],
  adminEvaluations: Record<string, AdminInterventionEvaluation>
) {
  const userActivityEntries = activityLog.filter(
    (entry) => entry.actorRole === 'internal' || entry.actorRole === 'senior'
  );
  const completedInterventionFormEvents = userActivityEntries
    .filter((entry) => entry.analyticsEvent?.kind === 'intervention_form')
    .map((entry) => entry.analyticsEvent!);
  const completedSeniorEvaluationEvents = userActivityEntries
    .filter((entry) => entry.analyticsEvent?.kind === 'senior_evaluation')
    .map((entry) => entry.analyticsEvent!);
  const evaluatedInterventions = interventions.filter((intervention) =>
    hasCompleteAdminEvaluation(adminEvaluations[intervention.id])
  );
  const recordingDelayValues = interventions
    .map((intervention) => {
      const delay =
        new Date(intervention.savedAt).getTime() -
        parseIsoDateValue(intervention.date).getTime();

      return Number.isNaN(delay) || delay < 0 ? null : delay;
    })
    .filter((value): value is number => value != null);
  const evaluationDelayValues = evaluatedInterventions
    .map((intervention) => {
      const updatedAt = adminEvaluations[intervention.id]?.updatedAt;

      if (!updatedAt) return null;

      const delay =
        new Date(updatedAt).getTime() - new Date(intervention.savedAt).getTime();

      return Number.isNaN(delay) || delay < 0 ? null : delay;
    })
    .filter((value): value is number => value != null);

  return {
    averageEvaluationDelayMs: averageNumbers(evaluationDelayValues),
    averageInterventionFormClickCount: averageNumbers(
      completedInterventionFormEvents.map((event) => event.clickCount)
    ),
    averageInterventionFormDurationMs: averageNumbers(
      completedInterventionFormEvents.map((event) => event.durationMs)
    ),
    averageRecordingDelayMs: averageNumbers(recordingDelayValues),
    averageSeniorEvaluationClickCount: averageNumbers(
      completedSeniorEvaluationEvents.map((event) => event.clickCount)
    ),
    averageSeniorEvaluationDurationMs: averageNumbers(
      completedSeniorEvaluationEvents.map((event) => event.durationMs)
    ),
    completedInterventionFormCount: completedInterventionFormEvents.length,
    completedSeniorEvaluationCount: completedSeniorEvaluationEvents.length,
    evaluatedCount: evaluatedInterventions.length,
    recordedCount: interventions.length,
  };
}

function getAdminRelanceThresholdDays(window: AdminRelanceWindow) {
  if (window === '1m') {
    return 30;
  }

  if (window === '3m') {
    return 90;
  }

  return 14;
}

function buildAdminActivityAnalyticsBuckets(
  activityLog: ActivityLogEntry[],
  period: AdminActivityAnalyticsPeriod
) {
  const referenceDate = new Date();
  const userEntries = activityLog.filter(
    (entry) =>
      (entry.actorRole === 'internal' || entry.actorRole === 'senior') &&
      !isAnalyticsTrackingEntry(entry)
  );
  const bucketBlueprints =
    period === '6m' || period === '1y'
      ? Array.from({ length: period === '6m' ? 6 : 12 }, (_, index) => {
          const monthDate = addMonths(
            referenceDate,
            index - (period === '6m' ? 5 : 11)
          );
          const start = startOfMonth(monthDate);
          const end = endOfMonth(monthDate);

          return {
            id: start.toISOString(),
            label: start.toLocaleDateString('fr-FR', {
              month: 'short',
              year: period === '1y' ? '2-digit' : undefined,
            }),
            start,
            end,
          };
        })
      : Array.from({ length: period === '7d' ? 7 : 30 }, (_, index) => {
            const offset = period === '7d' ? 6 : 29;
            const date = addDays(referenceDate, index - offset);
            const start = new Date(date);

            start.setHours(0, 0, 0, 0);

            const end = new Date(date);

            end.setHours(23, 59, 59, 999);

            return {
              id: start.toISOString(),
              label: start.toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'short',
              }),
              start,
              end,
            };
          })
        ;

  return bucketBlueprints.map((bucket) => {
    const counts = userEntries.reduce(
      (current, entry) => {
        const timestamp = new Date(entry.createdAt);

        if (Number.isNaN(timestamp.getTime())) {
          return current;
        }

        if (timestamp < bucket.start || timestamp > bucket.end) {
          return current;
        }

        if (entry.actorRole === 'internal') {
          current.internalCount += 1;
        }

        if (entry.actorRole === 'senior') {
          current.seniorCount += 1;
        }

        current.totalCount += 1;
        return current;
      },
      { internalCount: 0, seniorCount: 0, totalCount: 0 }
    );

    return {
      id: bucket.id,
      label: bucket.label,
      ...counts,
    };
  });
}

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

export function AdminScreen() {
  const {
    adminEvaluations,
    archiveInstitution,
    createInstitution,
    createInternalProfile,
    createSeniorProfile,
    createSurgicalIntervention,
    customSeniors,
    customSurgicalInterventions,
    deleteCustomSurgicalIntervention,
    deactivateInternalProfile,
    deactivateSeniorProfile,
    activityLog,
    adminTrophies,
    adminTrophyStorageWarning: trophyStorageWarning,
    internalProfiles,
    institutions,
    isAdmin,
    isSenior,
    notebookDocuments,
    logout,
    recordActivity,
    regenerateAccessKey,
    refreshBackendData,
    renameInstitution,
    savedInterventions,
    trophyAwards,
    saveSeniorEvaluation,
    saveAdminTrophy,
    deleteAdminTrophy,
    selectableSeniors,
    selectedSenior,
    surgicalProcedureOptions,
    updateInternalProfile,
    updateInternalCredentials,
    updateSeniorProfile,
    updateSeniorManagedInternals,
    updateSeniorCredentials,
    updateSurgicalIntervention,
  } = useAppContext();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [view, setView] = useState<AdminView>('home');
  const [activityRange, setActivityRange] = useState<AdminActivityRange>('day');
  const [activityAnalyticsPeriod, setActivityAnalyticsPeriod] =
    useState<AdminActivityAnalyticsPeriod>('30d');
  const [relanceWindow, setRelanceWindow] = useState<AdminRelanceWindow>('14d');
  const [detailedActivitiesVisibleCount, setDetailedActivitiesVisibleCount] =
    useState(ADMIN_DETAILED_ACTIVITY_PAGE_SIZE);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [selectedProfileViewSource, setSelectedProfileViewSource] =
    useState<AdminProfileViewSource>('profiles');
  const [profilesTab, setProfilesTab] = useState<ProfileAccountTab>('internal');
  const [profileEditorType, setProfileEditorType] =
    useState<ProfileAccountTab>('internal');
  const [profileSearch, setProfileSearch] = useState('');
  const [editingInternalProfileId, setEditingInternalProfileId] =
    useState<string | null>(null);
  const [profileStatsTab, setProfileStatsTab] = useState<ProfileStatsTab>('progress');
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
  const [profileProgressProcedureKey, setProfileProgressProcedureKey] = useState('');
  const [profileProgressApproach, setProfileProgressApproach] = useState('');
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
  const homeActivityChartScrollRef = useRef<HTMLDivElement | null>(null);
  const analyticsChartScrollRef = useRef<HTMLDivElement | null>(null);
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
  const [interventionFilters, setInterventionFilters] =
    useState<AdminInterventionFilters>(EMPTY_INTERVENTION_FILTERS);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [analyticsFeedback, setAnalyticsFeedback] = useState<FeedbackState>(null);
  const [internalCredentialsFeedback, setInternalCredentialsFeedback] =
    useState<FeedbackState>(null);
  const [seniorFeedback, setSeniorFeedback] = useState<FeedbackState>(null);
  const [seniorAccountFeedback, setSeniorAccountFeedback] =
    useState<FeedbackState>(null);
  const [disabledProfiles, setDisabledProfiles] = useState<BackendProfile[]>([]);
  const [disabledProfilesError, setDisabledProfilesError] = useState<string | null>(
    null
  );
  const [disabledProfilesFeedback, setDisabledProfilesFeedback] =
    useState<FeedbackState>(null);
  const [reactivatingProfileId, setReactivatingProfileId] =
    useState<string | null>(null);
  const [isLoadingDisabledProfiles, setIsLoadingDisabledProfiles] =
    useState(false);
  const [revealedAccessKey, setRevealedAccessKey] = useState<{
    accessKey: string;
    userLabel: string;
  } | null>(null);
  const [institutionName, setInstitutionName] = useState('');
  const [editingInstitutionId, setEditingInstitutionId] =
    useState<string | null>(null);
  const [institutionFeedback, setInstitutionFeedback] =
    useState<FeedbackState>(null);
  useScrollResetOnChange([view]);

  useEffect(() => {
    if (view !== 'profiles') {
      setRevealedAccessKey(null);
    }
  }, [view]);

  useEffect(() => {
    if (!isAdmin || view !== 'profiles') {
      return;
    }

    const controller = new AbortController();

    setIsLoadingDisabledProfiles(true);
    setDisabledProfilesError(null);
    void loadBackendDisabledProfiles(controller.signal)
      .then((profiles) => {
        if (!controller.signal.aborted) {
          setDisabledProfiles(profiles);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setDisabledProfilesError(
            error instanceof Error
              ? error.message
              : 'Impossible de charger les comptes désactivés.'
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoadingDisabledProfiles(false);
        }
      });

    return () => controller.abort();
  }, [customSeniors.length, internalProfiles.length, isAdmin, view]);
  const [selectedEvaluationInterventionId, setSelectedEvaluationInterventionId] =
    useState<string | null>(null);
  const [evaluationFeedback, setEvaluationFeedback] =
    useState<FeedbackState>(null);
  const [
    activeEvaluationChecklistStepId,
    setActiveEvaluationChecklistStepId,
  ] = useState<string | null>(null);
  const [evaluationDraft, setEvaluationDraft] = useState<{
    checklist: Record<string, ChecklistLevel | null>;
    globalPerformance: AdminPerformanceRating | null;
    categoryDifficulty: AdminCategoryDifficultyRating | null;
    seniorComment: string;
  }>({
    checklist: {},
    globalPerformance: null,
    categoryDifficulty: null,
    seniorComment: '',
  });
  const seniorEvaluationAnalyticsSessionRef = useRef<{
    clickCount: number;
    interventionId: string;
    sessionId: string;
    startedAt: string;
  } | null>(null);

  const sortedInterventions = useMemo(
    () =>
      [...savedInterventions].sort((left, right) =>
        right.savedAt.localeCompare(left.savedAt)
      ),
    [savedInterventions]
  );
  const activeInstitutions = useMemo(
    () =>
      institutions
        .filter((institution) => institution.status === 'active')
        .sort((left, right) => left.name.localeCompare(right.name, 'fr')),
    [institutions]
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
        const authoritativeAwards =
          trophy.status === 'active'
            ? trophyAwards.filter((award) => award.trophyId === trophy.id)
            : [];
        const highestTierByProfile = new Map<
          string,
          TrophyLevelDefinition['tier']
        >();

        authoritativeAwards.forEach((award) => {
          const awardedTier = award.tier ?? 'bronze';
          const currentTier = highestTierByProfile.get(award.profileId);

          if (!currentTier || getTierRank(awardedTier) > getTierRank(currentTier)) {
            highestTierByProfile.set(award.profileId, awardedTier);
          }
        });
        const obtainedCount = new Set(
          authoritativeAwards.map((award) => award.profileId)
        ).size;
        const levelObtainedCounts =
          trophy.format === 'levels'
            ? trophy.levels.map((level) => ({
                count: Array.from(highestTierByProfile.values()).filter(
                  (tier) => tier === level.tier
                ).length,
                label: level.label,
                tier: level.tier,
              }))
            : [];

        return {
          ...trophy,
          levelObtainedCounts,
          obtainedCount,
          ruleSummary: buildTrophyRuleSummary(trophy),
        };
      }),
    [
      adminTrophies,
      trophyAwards,
    ]
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
  const hasActivityChartData =
    activityTotals.totalRecorded > 0 || activityTotals.totalEvaluated > 0;
  const activeProfileCount =
    internalProfiles.length +
    selectableSeniors.filter((senior) => senior.id !== 'sen-other').length;
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
      if (
        !entry.actorId ||
        entry.actorRole === 'admin' ||
        isAnalyticsTrackingEntry(entry)
      ) {
        return accumulator;
      }

      const actorKey = `${entry.actorRole}:${entry.actorId}`;
      const currentEntries = accumulator[actorKey] ?? [];

      currentEntries.push(entry);
      accumulator[actorKey] = currentEntries;

      return accumulator;
    }, {});
  }, [activityLog]);
  const activityAnalyticsBuckets = useMemo<AdminActivityAnalyticsBucket[]>(
    () =>
      buildAdminActivityAnalyticsBuckets(activityLog, activityAnalyticsPeriod),
    [activityAnalyticsPeriod, activityLog]
  );
  const allTimeActivityCycleSummary = useMemo(
    () =>
      buildAllTimeAdminCycleSummary(
        activityLog,
        sortedInterventions,
        adminEvaluations
      ),
    [activityLog, adminEvaluations, sortedInterventions]
  );
  const activityAnalyticsSummary = useMemo(() => {
    const now = Date.now();
    const referenceDate = new Date(now);
    const analyticsPeriodStart = getAdminAnalyticsPeriodStart(
      activityAnalyticsPeriod,
      referenceDate
    );
    const analyticsPeriodStartIso = analyticsPeriodStart.toISOString();
    const relanceThresholdDays = getAdminRelanceThresholdDays(relanceWindow);
    const activityEntries = activityLog
      .filter((entry) => entry.actorRole === 'internal' || entry.actorRole === 'senior')
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
    const visibleActivityEntries = activityEntries.filter(
      (entry) => !isAnalyticsTrackingEntry(entry)
    );
    const recentActivityEntries = visibleActivityEntries.filter(
      (entry) => entry.createdAt >= analyticsPeriodStartIso
    );
    const completedInterventionFormEvents = activityEntries
      .filter(
        (entry) =>
          entry.createdAt >= analyticsPeriodStartIso &&
          entry.analyticsEvent?.kind === 'intervention_form'
      )
      .map((entry) => entry.analyticsEvent!);
    const completedSeniorEvaluationEvents = activityEntries
      .filter(
        (entry) =>
          entry.createdAt >= analyticsPeriodStartIso &&
          entry.analyticsEvent?.kind === 'senior_evaluation'
      )
      .map((entry) => entry.analyticsEvent!);
    const recentRecordedInterventions = sortedInterventions.filter(
      (intervention) => intervention.savedAt >= analyticsPeriodStartIso
    );
    const evaluatedInterventions = sortedInterventions.filter((intervention) =>
      hasCompleteAdminEvaluation(adminEvaluations[intervention.id])
    );
    const recentEvaluatedInterventions = evaluatedInterventions.filter((intervention) => {
      const updatedAt = adminEvaluations[intervention.id]?.updatedAt;

      return Boolean(updatedAt && updatedAt >= analyticsPeriodStartIso);
    });
    const evaluationDelayValues = recentEvaluatedInterventions
      .map((intervention) => {
        const updatedAt = adminEvaluations[intervention.id]?.updatedAt;

        if (!updatedAt) {
          return null;
        }

        const delay = new Date(updatedAt).getTime() - new Date(intervention.savedAt).getTime();

        return Number.isNaN(delay) || delay < 0 ? null : delay;
      })
      .filter((value): value is number => value != null);
    const recordingDelayValues = recentRecordedInterventions
      .map((intervention) => {
        const delay =
          new Date(intervention.savedAt).getTime() -
          parseIsoDateValue(intervention.date).getTime();

        return Number.isNaN(delay) || delay < 0 ? null : delay;
      })
      .filter((value): value is number => value != null);
    const interventionFormDurationValues = completedInterventionFormEvents.map(
      (event) => event.durationMs
    );
    const interventionFormClickValues = completedInterventionFormEvents.map(
      (event) => event.clickCount
    );
    const seniorEvaluationDurationValues = completedSeniorEvaluationEvents.map(
      (event) => event.durationMs
    );
    const seniorEvaluationClickValues = completedSeniorEvaluationEvents.map(
      (event) => event.clickCount
    );
    const relanceProfiles = [
      ...internalProfiles.map<AdminRelanceProfile>((profile) => ({
        contactEmail: profile.contactEmail ?? null,
        id: `internal:${profile.id}`,
        inactiveDays: getDaysSinceTimestamp(profile.lastLoginAt, now),
        lastLoginAt: profile.lastLoginAt,
        name: formatDisplayName(profile.firstName, profile.lastName),
        roleLabel: 'Interne',
      })),
      ...selectableSeniors
        .filter((senior) => senior.id !== 'sen-other')
        .map<AdminRelanceProfile>((senior) => ({
          contactEmail: senior.contactEmail ?? null,
          id: `senior:${senior.id}`,
          inactiveDays: getDaysSinceTimestamp(senior.lastLoginAt ?? null, now),
          lastLoginAt: senior.lastLoginAt ?? null,
          name: formatSeniorDisplayName(senior),
          roleLabel: 'Senior',
        })),
    ]
      .filter(
        (profile) =>
          profile.inactiveDays == null ||
          profile.inactiveDays >= relanceThresholdDays
      )
      .sort((left, right) => {
        if (left.inactiveDays == null && right.inactiveDays != null) {
          return -1;
        }

        if (left.inactiveDays != null && right.inactiveDays == null) {
          return 1;
        }

        return (right.inactiveDays ?? 0) - (left.inactiveDays ?? 0);
      });
    const actionCounts = recentActivityEntries.reduce<Map<string, number>>((accumulator, entry) => {
      accumulator.set(entry.action, (accumulator.get(entry.action) ?? 0) + 1);
      return accumulator;
    }, new Map());
    const topActions = Array.from(actionCounts.entries())
      .map<AdminLeaderboardItem>(([label, value], index) => ({
        detail: `${value} activité${value > 1 ? 's' : ''} sur ${getAdminAnalyticsPeriodLabel(
          activityAnalyticsPeriod
        ).toLocaleLowerCase('fr-FR')}`,
        id: `${index}-${label}`,
        label,
        value,
      }))
      .sort((left, right) => right.value - left.value)
      .slice(0, 5);
    const recentLoginEntries = recentActivityEntries.filter(
      (entry) => entry.action === ADMIN_PROFILE_LOGIN_ACTION
    );
    const internalConnectionEventCounts = recentLoginEntries.reduce<Map<string, number>>(
      (accumulator, entry) => {
        if (entry.actorRole !== 'internal' || !entry.actorId) {
          return accumulator;
        }

        accumulator.set(entry.actorId, (accumulator.get(entry.actorId) ?? 0) + 1);
        return accumulator;
      },
      new Map()
    );
    const internalConnectionCounts = internalProfiles.reduce<Map<string, number>>(
      (accumulator, profile) => {
        const fallbackConnectionCount =
          profile.lastLoginAt &&
          new Date(profile.lastLoginAt).getTime() >= analyticsPeriodStart.getTime()
            ? 1
            : 0;
        const measuredConnectionCount = internalConnectionEventCounts.get(profile.id) ?? 0;
        const value = Math.max(fallbackConnectionCount, measuredConnectionCount);

        if (value > 0) {
          accumulator.set(profile.id, value);
        }

        return accumulator;
      },
      new Map()
    );
    const topInternalConnections = Array.from(internalConnectionCounts.entries())
      .map<AdminLeaderboardItem>(([internalId, value]) => {
        const profile =
          internalProfiles.find((candidate) => candidate.id === internalId) ?? null;

        return {
          detail: `${value} connexion${value > 1 ? 's' : ''} sur ${getAdminAnalyticsPeriodLabel(
            activityAnalyticsPeriod
          ).toLocaleLowerCase('fr-FR')}`,
          id: internalId,
          label: profile
            ? formatDisplayName(profile.firstName, profile.lastName)
            : 'Interne introuvable',
          value,
        };
      })
      .sort((left, right) => right.value - left.value)
      .slice(0, 5);
    const seniorConnectionEventCounts = recentLoginEntries.reduce<Map<string, number>>(
      (accumulator, entry) => {
        if (entry.actorRole !== 'senior' || !entry.actorId) {
          return accumulator;
        }

        accumulator.set(entry.actorId, (accumulator.get(entry.actorId) ?? 0) + 1);
        return accumulator;
      },
      new Map()
    );
    const seniorConnectionCounts = selectableSeniors.reduce<Map<string, number>>(
      (accumulator, senior) => {
        if (senior.id === 'sen-other') {
          return accumulator;
        }

        const fallbackConnectionCount =
          senior.lastLoginAt &&
          new Date(senior.lastLoginAt).getTime() >= analyticsPeriodStart.getTime()
            ? 1
            : 0;
        const measuredConnectionCount = seniorConnectionEventCounts.get(senior.id) ?? 0;
        const value = Math.max(fallbackConnectionCount, measuredConnectionCount);

        if (value > 0) {
          accumulator.set(senior.id, value);
        }

        return accumulator;
      },
      new Map()
    );
    const topSeniorConnections = Array.from(seniorConnectionCounts.entries())
      .map<AdminLeaderboardItem>(([seniorId, value]) => {
        const senior =
          selectableSeniors.find((candidate) => candidate.id === seniorId) ?? null;

        return {
          detail: `${value} connexion${value > 1 ? 's' : ''} sur ${getAdminAnalyticsPeriodLabel(
            activityAnalyticsPeriod
          ).toLocaleLowerCase('fr-FR')}`,
          id: seniorId,
          label: senior ? formatSeniorDisplayName(senior) : 'Senior introuvable',
          value,
        };
      })
      .sort((left, right) => right.value - left.value)
      .slice(0, 5);

    return {
      activeInternalCount: internalProfiles.filter((profile) => {
        const lastLoginTime = profile.lastLoginAt
          ? new Date(profile.lastLoginAt).getTime()
          : Number.NaN;

        return !Number.isNaN(lastLoginTime) && lastLoginTime >= analyticsPeriodStart.getTime();
      }).length,
      activeSeniorCount: selectableSeniors.filter((senior) => {
        if (senior.id === 'sen-other') {
          return false;
        }

        const lastLoginTime = senior.lastLoginAt
          ? new Date(senior.lastLoginAt).getTime()
          : Number.NaN;

        return !Number.isNaN(lastLoginTime) && lastLoginTime >= analyticsPeriodStart.getTime();
      }).length,
      averageEvaluationDelayMs: averageNumbers(evaluationDelayValues),
      averageRecordingDelayMs: averageNumbers(recordingDelayValues),
      chartMax: Math.max(
        ...activityAnalyticsBuckets.flatMap((bucket) => [
          bucket.internalCount,
          bucket.seniorCount,
        ]),
        1
      ),
      evaluationRate:
        recentRecordedInterventions.length > 0
          ? Math.round(
              (recentEvaluatedInterventions.length / recentRecordedInterventions.length) * 100
            )
          : 0,
      neverConnectedCount: relanceProfiles.filter(
        (profile) => profile.inactiveDays == null
      ).length,
      recentActivityCount: recentActivityEntries.length,
      recentDetailedActivities: visibleActivityEntries.slice(0, 24),
      recentEvaluatedCount: recentEvaluatedInterventions.length,
      recentRecordedCount: recentRecordedInterventions.length,
      averageInterventionFormDurationMs: averageNumbers(interventionFormDurationValues),
      averageInterventionFormClickCount: averageNumbers(interventionFormClickValues),
      averageSeniorEvaluationDurationMs: averageNumbers(seniorEvaluationDurationValues),
      averageSeniorEvaluationClickCount: averageNumbers(seniorEvaluationClickValues),
      completedInterventionFormCount: completedInterventionFormEvents.length,
      completedSeniorEvaluationCount: completedSeniorEvaluationEvents.length,
      relanceProfiles,
      topActions,
      topInternalConnections,
      topSeniorConnections,
    };
  }, [
    activityAnalyticsBuckets,
    activityAnalyticsPeriod,
    activityLog,
    adminEvaluations,
    internalProfiles,
    relanceWindow,
    selectableSeniors,
    sortedInterventions,
  ]);
  const hasActivityAnalyticsChartData =
    activityAnalyticsSummary.recentActivityCount > 0;
  const analyticsPeriodLabel = getAdminAnalyticsPeriodLabel(activityAnalyticsPeriod);
  const relanceThresholdDays = getAdminRelanceThresholdDays(relanceWindow);
  const relanceInternalProfiles = activityAnalyticsSummary.relanceProfiles.filter(
    (profile) => profile.roleLabel === 'Interne'
  );
  const relanceSeniorProfiles = activityAnalyticsSummary.relanceProfiles.filter(
    (profile) => profile.roleLabel === 'Senior'
  );
  const visibleDetailedActivities = activityAnalyticsSummary.recentDetailedActivities.slice(
    0,
    detailedActivitiesVisibleCount
  );
  const hasMoreDetailedActivities =
    activityAnalyticsSummary.recentDetailedActivities.length >
    detailedActivitiesVisibleCount;
  useEffect(() => {
    const container = homeActivityChartScrollRef.current;

    if (!container || typeof window === 'undefined') {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      container.scrollLeft = Math.max(
        0,
        container.scrollWidth - container.clientWidth
      );
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activityBuckets, activityRange]);
  useEffect(() => {
    const container = analyticsChartScrollRef.current;

    if (!container || typeof window === 'undefined') {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      container.scrollLeft = Math.max(
        0,
        container.scrollWidth - container.clientWidth
      );
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [activityAnalyticsBuckets, activityAnalyticsPeriod]);
  useEffect(() => {
    setDetailedActivitiesVisibleCount(ADMIN_DETAILED_ACTIVITY_PAGE_SIZE);
  }, [activityAnalyticsSummary.recentDetailedActivities.length, activityAnalyticsPeriod]);
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
  const selectedProfileAdminTrophyDisplay = useMemo(
    () =>
      selectedProfile
        ? buildTrophyDisplayModels({
            adminEvaluations,
            customSurgicalInterventions,
            adminTrophies,
            profile: selectedProfile,
            savedInterventions,
            trophyAwards,
          })
        : null,
    [
      adminEvaluations,
      adminTrophies,
      customSurgicalInterventions,
      savedInterventions,
      selectedProfile,
      trophyAwards,
    ]
  );
  const selectedProfileAllEarnedTrophies =
    selectedProfileAdminTrophyDisplay?.earned ?? [];

  const selectedProfileStats = useMemo(() => {
    if (!selectedProfile) {
      return null;
    }

    return {
      recordedInterventionsCount: selectedProfileInterventions.length,
      earnedTrophiesCount:
        selectedProfileAdminTrophyDisplay?.counts.earned ?? 0,
    };
  }, [
    selectedProfile,
    selectedProfileAdminTrophyDisplay?.counts.earned,
    selectedProfileInterventions,
  ]);
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
        getHistoricalProcedureLabel(
          intervention,
          customSurgicalInterventions,
          intervention.procedure
        ),
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
          getProfileHistoryStatus(adminEvaluations[intervention.id]) === 'evaluated'
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
  const selectedProfileProgressProcedureOptions = useMemo(() => {
    const optionsByKey = new Map<string, ProfileProgressProcedureOption>();
    const addOption = (
      procedure: InterventionType,
      procedureLabel: string,
      indicationToken: string,
      indicationLabel: string
    ) => {
      const normalizedLabel = indicationLabel.trim();

      if (!normalizedLabel) {
        return;
      }

      const key = `${procedure}::${indicationToken}`;

      if (optionsByKey.has(key)) {
        return;
      }

      optionsByKey.set(key, {
        indicationLabel: normalizedLabel,
        indicationToken,
        key,
        label: `${procedureLabel} - ${normalizedLabel}`,
        procedure,
        procedureLabel,
      });
    };

    surgicalInterventionDefinitions
      .filter((definition) => definition.status !== 'archived')
      .forEach((definition) => {
        const procedureLabel = definition.name;
        const activeIndicationOptions =
          definition.indicationOptions?.filter(
            (option) => option.active && option.label.trim().length > 0 && !option.isOther
          ) ?? [];
        const indicationLabels =
          activeIndicationOptions.length > 0
            ? activeIndicationOptions.map((option) => option.label.trim())
            : definition.indications
                .map((indication) => indication.trim())
                .filter((indication) => indication.length > 0);

        indicationLabels.forEach((indicationLabel) => {
          addOption(
            definition.id,
            procedureLabel,
            `custom:${normalizeProgressToken(indicationLabel)}`,
            indicationLabel
          );
        });
      });

    selectedProfileInterventions.forEach((intervention) => {
      addOption(
        intervention.procedure,
        getHistoricalProcedureLabel(
          intervention,
          customSurgicalInterventions,
          intervention.procedure
        ),
        getInterventionIndicationToken(intervention),
        getInterventionIndicationLabel(intervention) || 'Indication non renseignée'
      );
    });

    return Array.from(optionsByKey.values()).sort((left, right) =>
      left.label.localeCompare(right.label, 'fr-FR', { sensitivity: 'base' })
    );
  }, [selectedProfileInterventions, surgicalInterventionDefinitions, surgicalProcedureOptions]);
  const selectedProfileProgressProcedureOption =
    selectedProfileProgressProcedureOptions.find(
      (option) => option.key === profileProgressProcedureKey
    ) ?? null;
  const defaultProfileProgressProcedureKey = useMemo(() => {
    const latestIntervention = [...selectedProfileInterventions].sort((left, right) =>
      (right.savedAt ?? '').localeCompare(left.savedAt ?? '')
    )[0];

    if (!latestIntervention) {
      return selectedProfileProgressProcedureOptions[0]?.key ?? '';
    }

    const latestIndicationToken = getInterventionIndicationToken(latestIntervention);

    return (
      selectedProfileProgressProcedureOptions.find(
        (option) =>
          option.procedure === latestIntervention.procedure &&
          option.indicationToken === latestIndicationToken
      )?.key ??
      selectedProfileProgressProcedureOptions[0]?.key ??
      ''
    );
  }, [selectedProfileInterventions, selectedProfileProgressProcedureOptions]);
  const selectedProfileProgressApproachOptions = useMemo(() => {
    const optionsByValue = new Map<
      SurgicalApproach,
      { label: string; value: SurgicalApproach }
    >();
    const addOption = (approach: SurgicalApproach) => {
      if (optionsByValue.has(approach)) {
        return;
      }

      optionsByValue.set(approach, {
        label: getChoiceLabel(approachOptions, approach, approach),
        value: approach,
      });
    };

    if (!selectedProfileProgressProcedureOption) {
      return [];
    }

    const selectedDefinition =
      surgicalInterventionDefinitions.find(
        (definition) => definition.id === selectedProfileProgressProcedureOption.procedure
      ) ?? null;

    selectedDefinition?.allowedApproaches.forEach(addOption);
    selectedDefinition?.approachConfigs
      ?.filter((config) => config.active)
      .forEach((config) => addOption(config.approach));

    selectedProfileInterventions
      .filter((intervention) =>
        matchesProfileProgressProcedureOption(
          intervention,
          selectedProfileProgressProcedureOption
        )
      )
      .forEach((intervention) => {
        if (intervention.approach) {
          addOption(intervention.approach);
        }
      });

    return Array.from(optionsByValue.values()).sort((left, right) =>
      left.label.localeCompare(right.label, 'fr-FR', { sensitivity: 'base' })
    );
  }, [
    selectedProfileInterventions,
    selectedProfileProgressProcedureOption,
    surgicalInterventionDefinitions,
  ]);
  const defaultProfileProgressApproach = useMemo(() => {
    if (!selectedProfileProgressProcedureOption) {
      return '';
    }

    const latestMatchingIntervention = [...selectedProfileInterventions]
      .sort((left, right) =>
        (right.savedAt ?? '').localeCompare(left.savedAt ?? '')
      )
      .find(
        (intervention) =>
          matchesProfileProgressProcedureOption(
            intervention,
            selectedProfileProgressProcedureOption
          ) && intervention.approach
      );
    const latestApproach = latestMatchingIntervention?.approach ?? null;

    if (
      latestApproach &&
      selectedProfileProgressApproachOptions.some(
        (option) => option.value === latestApproach
      )
    ) {
      return latestApproach;
    }

    return selectedProfileProgressApproachOptions[0]?.value ?? '';
  }, [
    selectedProfileInterventions,
    selectedProfileProgressApproachOptions,
    selectedProfileProgressProcedureOption,
  ]);
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
        if (
          selectedProfileProgressProcedureOption &&
          !matchesProfileProgressProcedureOption(
            intervention,
            selectedProfileProgressProcedureOption
          )
        ) {
          return false;
        }

        if (
          profileProgressApproach &&
          intervention.approach !== profileProgressApproach
        ) {
          return false;
        }

        if (!periodStart) {
          return true;
        }

        return parseIsoDateValue(intervention.date) >= periodStart;
      })
      .sort((left, right) => left.date.localeCompare(right.date));
  }, [
    profileProgressApproach,
    profileProgressPeriod,
    selectedProfileInterventions,
    selectedProfileProgressProcedureOption,
  ]);
  const selectedProfileProgressSeries = useMemo(() => {
    const scoresByDate = selectedProfileProgressInterventions.reduce<
      Map<string, number[]>
    >((scores, intervention) => {
      const evaluation = adminEvaluations[intervention.id];

      if (!hasCompleteAdminEvaluation(evaluation)) {
        return scores;
      }

      const autonomyScore = calculateAutonomyScore(
        intervention,
        customSurgicalInterventions,
        evaluation
      );

      if (autonomyScore == null) {
        return scores;
      }

      const dailyScores = scores.get(intervention.date) ?? [];

      dailyScores.push(autonomyScore);
      scores.set(intervention.date, dailyScores);

      return scores;
    }, new Map());

    return Array.from(scoresByDate.entries())
      .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
      .map(([date, scores], index) => ({
        date,
        id: date,
        index: index + 1,
        score: Math.round(averageNumbers(scores) ?? 0),
      }));
  }, [
    adminEvaluations,
    customSurgicalInterventions,
    selectedProfileProgressInterventions,
  ]);
  const selectedProfileLastRecordedAt = useMemo(() => {
    const latestIntervention = [...selectedProfileProgressInterventions].sort((left, right) =>
      (right.savedAt ?? '').localeCompare(left.savedAt ?? '')
    )[0];

    return latestIntervention?.savedAt ?? null;
  }, [selectedProfileProgressInterventions]);
  const selectedProfileStepRows = useMemo(() => {
    const stepStats = selectedProfileProgressInterventions.reduce<
      Map<string, { label: string; order: number; values: number[] }>
    >((accumulator, intervention) => {
        const checklist = getAuthoritativeChecklist(
          intervention,
          adminEvaluations[intervention.id]
        );
        const checklistSteps = getHistoricalChecklistSteps(
          intervention,
          customSurgicalInterventions
        );

        checklistSteps.forEach((step, stepIndex) => {
          const numericValue = getChecklistLevelNumericValue(
            checklist[step.id]
          );

          if (numericValue == null) {
            return;
          }

          const normalizedStepLabel = normalizeProgressToken(step.label);
          const currentEntry = accumulator.get(normalizedStepLabel);
          const nextValue = Math.round((numericValue / 4) * 100);

          if (!currentEntry) {
            accumulator.set(normalizedStepLabel, {
              label: step.label,
              order: stepIndex,
              values: [nextValue],
            });
            return;
          }

          currentEntry.values.push(nextValue);
          currentEntry.order = Math.min(currentEntry.order, stepIndex);
        });

        return accumulator;
      }, new Map());

    return Array.from(stepStats.entries())
      .filter(([, value]) => value.values.length > 0)
      .map(([stepKey, value]) => ({
        id: stepKey,
        label: value.label,
        order: value.order,
        score: Math.round(averageNumbers(value.values) ?? 0),
        sampleSize: value.values.length,
        tone: getSeniorStepTone(Math.round(averageNumbers(value.values) ?? 0)),
      }))
      .sort(
        (left, right) =>
          left.order - right.order || left.label.localeCompare(right.label, 'fr-FR')
      );
  }, [customSurgicalInterventions, selectedProfileProgressInterventions]);
  const selectedEvaluationIntervention =
    sortedInterventions.find(
      (intervention) => intervention.id === selectedEvaluationInterventionId
    ) ?? null;
  const selectedEvaluationInternal = selectedEvaluationIntervention
    ? getInternalById(selectedEvaluationIntervention.internalId, internalProfiles)
    : null;
  const selectedEvaluationChecklistSteps = selectedEvaluationIntervention
    ? getHistoricalChecklistSteps(
        selectedEvaluationIntervention,
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

    const authoritativeChecklist =
      selectedEvaluation?.checklist ?? selectedEvaluationIntervention.checklist;
    const baseLevels: ChecklistLevel[] = ['0', '1', '2', '3', '4'];
    const hasNonApplicableStep = selectedEvaluationChecklistSteps.some(
      (step) => authoritativeChecklist[step.id] === 'NA'
    );
    const levels = hasNonApplicableStep
      ? (['NA', ...baseLevels] as ChecklistLevel[])
      : baseLevels;

    return levels.map((level) => ({
      level,
      steps: selectedEvaluationChecklistSteps.filter(
        (step) => authoritativeChecklist[step.id] === level
      ),
    }));
  }, [
    selectedEvaluation?.checklist,
    selectedEvaluationChecklistSteps,
    selectedEvaluationIntervention,
  ]);
  useEffect(() => {
    if (!selectedEvaluationInterventionId) {
      return;
    }

    setEvaluationDraft({
      checklist: selectedEvaluation?.checklist ?? {},
      globalPerformance: selectedEvaluation?.globalPerformance ?? null,
      categoryDifficulty: selectedEvaluation?.categoryDifficulty ?? null,
      seniorComment: selectedEvaluation?.seniorComment ?? '',
    });
  }, [
    selectedEvaluation?.checklist,
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
      profileProgressProcedureKey &&
      !selectedProfileProgressProcedureOptions.some(
        (option) => option.key === profileProgressProcedureKey
      )
    ) {
      setProfileProgressProcedureKey(defaultProfileProgressProcedureKey);
      return;
    }

    if (
      !profileProgressProcedureKey &&
      selectedProfileProgressProcedureOptions.length > 0
    ) {
      setProfileProgressProcedureKey(defaultProfileProgressProcedureKey);
    }
  }, [
    defaultProfileProgressProcedureKey,
    profileProgressProcedureKey,
    selectedProfileProgressProcedureOptions,
  ]);

  useEffect(() => {
    if (
      profileProgressApproach &&
      !selectedProfileProgressApproachOptions.some(
        (option) => option.value === profileProgressApproach
      )
    ) {
      setProfileProgressApproach(defaultProfileProgressApproach);
      return;
    }

    if (!profileProgressApproach && selectedProfileProgressApproachOptions.length > 0) {
      setProfileProgressApproach(defaultProfileProgressApproach);
    }
  }, [
    defaultProfileProgressApproach,
    profileProgressApproach,
    selectedProfileProgressApproachOptions,
  ]);

  const openProfileStats = (
    profile: InternalProfile,
    source: AdminProfileViewSource
  ) => {
    setProfileStatsTab('progress');
    setProfileProgressProcedureKey('');
    setProfileProgressApproach('');
    setSelectedProfileId(profile.id);
    setSelectedProfileViewSource(source);
    setView('profile');
    recordActivity(
      'Consultation des statistiques d’un interne',
      'Interne',
      formatDisplayName(profile.firstName, profile.lastName)
    );
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

  const startSeniorEvaluationAnalyticsSession = (interventionId: string) => {
    seniorEvaluationAnalyticsSessionRef.current = {
      clickCount: 1,
      interventionId,
      sessionId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      startedAt: new Date().toISOString(),
    };
  };

  const cancelSeniorEvaluationAnalyticsSession = () => {
    seniorEvaluationAnalyticsSessionRef.current = null;
  };

  const registerSeniorEvaluationInteraction = () => {
    const currentSession = seniorEvaluationAnalyticsSessionRef.current;

    if (!currentSession) {
      return;
    }

    seniorEvaluationAnalyticsSessionRef.current = {
      ...currentSession,
      clickCount: currentSession.clickCount + 1,
    };
  };

  const completeSeniorEvaluationAnalyticsSession = () => {
    const currentSession = seniorEvaluationAnalyticsSessionRef.current;

    if (!currentSession) {
      return;
    }

    const completedAt = new Date().toISOString();
    const durationMs =
      new Date(completedAt).getTime() - new Date(currentSession.startedAt).getTime();

    if (!Number.isNaN(durationMs) && durationMs >= 0) {
      recordActivity(
        'Mesure senior du formulaire évaluation',
        'Analytics',
        selectedEvaluationIntervention
          ? formatSeniorInterventionLabel(
              getChoiceLabel(
                surgicalProcedureOptions,
                selectedEvaluationIntervention.procedure
              ),
              selectedEvaluationIntervention.procedure,
              selectedEvaluationIntervention.approach
            )
          : 'Évaluation senior',
        {
          clickCount: currentSession.clickCount,
          completedAt,
          durationMs,
          kind: 'senior_evaluation',
          sessionId: currentSession.sessionId,
        }
      );
    }

    seniorEvaluationAnalyticsSessionRef.current = null;
  };

  const openEvaluationTool = (interventionId: string) => {
    const intervention =
      sortedInterventions.find((item) => item.id === interventionId) ?? null;
    const checklistSteps = intervention
      ? getHistoricalChecklistSteps(intervention, customSurgicalInterventions)
      : [];
    const existingChecklist = adminEvaluations[interventionId]?.checklist ?? {};
    const initialStepId =
      checklistSteps.find((step) => existingChecklist[step.id] == null)?.id ??
      checklistSteps[0]?.id ??
      null;

    startSeniorEvaluationAnalyticsSession(interventionId);
    setActiveEvaluationChecklistStepId(initialStepId);
    setSelectedEvaluationInterventionId(interventionId);
    setEvaluationFeedback(null);
  };

  const updateAdminEvaluation = async (
    field: 'globalPerformance' | 'categoryDifficulty',
    value: AdminPerformanceRating | AdminCategoryDifficultyRating
  ) => {
    if (!selectedEvaluationIntervention) {
      return;
    }

    const timestamp = new Date().toISOString();

    const currentEvaluation = adminEvaluations[selectedEvaluationIntervention.id] ?? {
        interventionId: selectedEvaluationIntervention.id,
        checklist: selectedEvaluationIntervention.checklist,
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
    try {
      await saveSeniorEvaluation(nextEvaluation);
      setEvaluationFeedback({
        kind: 'success',
        message: 'Évaluation administrateur enregistrée.',
      });
    } catch (error) {
      setEvaluationFeedback({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'L’évaluation n’a pas pu être enregistrée.',
      });
    }
  };

  const handleValidateSeniorEvaluation = async () => {
    if (!selectedEvaluationIntervention) {
      return;
    }

    const missingChecklistSteps = selectedEvaluationChecklistSteps.filter(
      (step) => evaluationDraft.checklist[step.id] == null
    );

    if (missingChecklistSteps.length > 0) {
      setEvaluationFeedback({
        kind: 'error',
        message: `Complétez la checklist Senior (${missingChecklistSteps.length} étape${
          missingChecklistSteps.length > 1 ? 's' : ''
        } restante${missingChecklistSteps.length > 1 ? 's' : ''}).`,
      });
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
      checklist: selectedEvaluationChecklistSteps.reduce<
        Record<string, ChecklistLevel | null>
      >((checklist, step) => {
        checklist[step.id] = evaluationDraft.checklist[step.id] ?? null;
        return checklist;
      }, {}),
      globalPerformance: evaluationDraft.globalPerformance,
      categoryDifficulty: evaluationDraft.categoryDifficulty,
      seniorComment: evaluationDraft.seniorComment.trim(),
      updatedAt: timestamp,
    };
    try {
      await saveSeniorEvaluation(nextEvaluation);
    } catch (error) {
      setEvaluationFeedback({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'L’évaluation n’a pas pu être enregistrée.',
      });
      return;
    }

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
    completeSeniorEvaluationAnalyticsSession();
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

  const handleSaveInstitution = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = institutionName.trim();

    if (!name) {
      setInstitutionFeedback({
        kind: 'error',
        message: 'Le nom officiel de l’établissement est obligatoire.',
      });
      return;
    }

    try {
      if (editingInstitutionId) {
        const currentInstitution = institutions.find(
          (institution) => institution.id === editingInstitutionId
        );

        if (!currentInstitution) {
          throw new Error('Cet établissement est introuvable.');
        }

        await renameInstitution(
          currentInstitution.id,
          name,
          currentInstitution.version
        );
        setInstitutionFeedback({
          kind: 'success',
          message: 'L’établissement a été renommé sans modifier ses rattachements.',
        });
      } else {
        await createInstitution(name);
        setInstitutionFeedback({
          kind: 'success',
          message: 'L’établissement officiel a bien été créé.',
        });
      }

      setEditingInstitutionId(null);
      setInstitutionName('');
    } catch (error) {
      setInstitutionFeedback({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'L’établissement n’a pas pu être enregistré.',
      });
    }
  };

  const handleArchiveInstitution = async (institutionId: string) => {
    const institution = institutions.find(
      (candidate) => candidate.id === institutionId
    );

    if (!institution) {
      return;
    }

    if (
      !window.confirm(
        `Archiver « ${institution.name} » ? Les comptes déjà rattachés conserveront leur historique, mais cet établissement ne pourra plus être choisi pour une nouvelle affectation.`
      )
    ) {
      return;
    }

    try {
      await archiveInstitution(institution.id, institution.version);
      setEditingInstitutionId(null);
      setInstitutionName('');
      setInstitutionFeedback({
        kind: 'success',
        message: 'L’établissement a été archivé et son historique est conservé.',
      });
    } catch (error) {
      setInstitutionFeedback({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'L’établissement n’a pas pu être archivé.',
      });
    }
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
      institutionId: profile.institutionId ?? '',
      lastName: profile.lastName,
      loginId: profile.loginId,
      promotion: profile.promotion,
      semester: profile.semester,
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
      institutionId: senior.institutionId ?? '',
      lastName: senior.lastName,
      loginId: senior.loginId ?? '',
    });
    setEditingSeniorId(senior.id);
    setSeniorFeedback(null);
    setSeniorAccountFeedback(null);
  };

  const startSeniorCredentialsEdition = (senior: Senior) => {
    startSeniorEdition(senior);
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

  const handleCreateProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const result = await (
      editingInternalProfileId != null
        ? updateInternalProfile(editingInternalProfileId, createForm)
        : createInternalProfile(createForm)
    );

    setFeedback({
      kind: result.success ? 'success' : 'error',
      message: result.message,
    });

    if (!result.success) {
      return;
    }

    if (result.accessKey && result.profile) {
      setRevealedAccessKey({
        accessKey: result.accessKey,
        userLabel: formatDisplayName(
          result.profile.firstName,
          result.profile.lastName
        ),
      });
    }

    setEditingInternalProfileId(null);
    setCreateForm(EMPTY_CREATE_FORM);
  };

  const handleCreateSeniorProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSeniorAccountFeedback(null);

    const result = await (
      editingSeniorId != null
        ? updateSeniorProfile(editingSeniorId, createSeniorForm)
        : createSeniorProfile(createSeniorForm)
    );

    setSeniorFeedback({
      kind: result.success ? 'success' : 'error',
      message: result.message,
    });

    if (!result.success) {
      return;
    }

    if (result.accessKey && result.senior) {
      setRevealedAccessKey({
        accessKey: result.accessKey,
        userLabel: formatSeniorDisplayName(result.senior),
      });
    }

    setEditingSeniorId(null);
    setCreateSeniorForm(EMPTY_CREATE_SENIOR_FORM);
  };

  const handleRegenerateAccessKey = async (
    profile: InternalProfile | Senior
  ) => {
    if (!profile.version) {
      const nextFeedback = {
        kind: 'error',
        message: 'Rechargez les données avant de régénérer cette clé.',
      } as const;

      if ('semester' in profile) {
        setFeedback(nextFeedback);
      } else {
        setSeniorFeedback(nextFeedback);
      }
      return;
    }

    const userLabel = formatDisplayName(profile.firstName, profile.lastName);

    if (
      !window.confirm(
        `Régénérer la clé d’accès de ${userLabel} ? L’ancienne clé deviendra immédiatement invalide.`
      )
    ) {
      return;
    }

    try {
      const result = await regenerateAccessKey(profile.id, profile.version);
      setRevealedAccessKey({
        accessKey: result.accessKey,
        userLabel,
      });
      const nextFeedback = {
        kind: result.auditWarning ? 'error' : 'success',
        message:
          result.auditWarning ??
          'La nouvelle clé est prête. Copiez-la maintenant : elle ne sera plus affichée ensuite.',
      } as const;

      if ('semester' in profile) {
        setFeedback(nextFeedback);
      } else {
        setSeniorFeedback(nextFeedback);
      }
    } catch (error) {
      const nextFeedback = {
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Impossible de régénérer cette clé d’accès.',
      } as const;

      if ('semester' in profile) {
        setFeedback(nextFeedback);
      } else {
        setSeniorFeedback(nextFeedback);
      }
    }
  };

  const handleCopyAccessKey = async () => {
    if (!revealedAccessKey) {
      return;
    }

    try {
      await navigator.clipboard.writeText(revealedAccessKey.accessKey);
      setFeedback({
        kind: 'success',
        message: 'La clé d’accès a été copiée dans le presse-papiers.',
      });
    } catch {
      setFeedback({
        kind: 'error',
        message: 'La copie automatique a échoué. Sélectionnez la clé manuellement.',
      });
    }
  };

  const handleUpdateSeniorCredentials = async (
    event: FormEvent<HTMLFormElement>,
    seniorId: string
  ) => {
    event.preventDefault();
    setSeniorFeedback(null);

    const result = await updateSeniorCredentials(
      seniorId,
      {
        ...editSeniorCredentialsForm,
        mustChangePassword: true,
      }
    );

    setSeniorAccountFeedback({
      kind: result.success ? 'success' : 'error',
      message: result.message,
    });

    if (!result.success) {
      return;
    }

    setEditingSeniorId(null);
    setEditSeniorCredentialsForm(EMPTY_UPDATE_SENIOR_CREDENTIALS_FORM);
  };

  const handleDeactivateSeniorProfile = async (senior: Senior) => {
    const seniorLabel = formatSeniorDisplayName(senior);
    const confirmed = window.confirm(
      `Désactiver le compte senior ${seniorLabel} ?\n\nSon identité de connexion et toutes ses données seront conservées. Ses sessions actives seront immédiatement révoquées.`
    );

    if (!confirmed) {
      return;
    }

    try {
      await deactivateSeniorProfile(senior.id);
      setEditingSeniorId((current) => (current === senior.id ? null : current));
      setEditSeniorCredentialsForm(EMPTY_UPDATE_SENIOR_CREDENTIALS_FORM);
      setSeniorFeedback(null);
      setSeniorAccountFeedback({
        kind: 'success',
        message: `Le compte senior ${seniorLabel} a été désactivé.`,
      });
    } catch (error) {
      setSeniorAccountFeedback({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Désactivation impossible.',
      });
    }
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
      window.location.href = buildSupportMailto({
        body: [
          'Bonjour,',
          '',
          'Je rencontre le problème suivant :',
          '',
          '[Décrivez votre demande ici]',
          '',
          'Espace : Administrateur',
        ].join('\n'),
        subject: 'Support espace administrateur',
      });
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

    const editableDefinition = existingTrophy.pendingDraft
      ? {
          ...existingTrophy.pendingDraft,
          draftBaseVersion: existingTrophy.draftBaseVersion ?? null,
          draftVersion: existingTrophy.draftVersion ?? null,
          id: existingTrophy.id,
          version: existingTrophy.version,
          everActivated: existingTrophy.everActivated,
          activatedAt: existingTrophy.activatedAt,
        }
      : {
          ...existingTrophy,
          pendingDraft: null,
          status: 'draft' as const,
        };

    setTrophyDraft(ensureTrophyDefinitionShape(editableDefinition));
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

  const handleDeleteTrophy = async (trophyId: string) => {
    const trophy = adminTrophies.find((item) => item.id === trophyId);

    if (trophy?.status !== 'draft') {
      setTrophyFormFeedback({
        kind: 'error',
        message:
          'Un trophée activé doit être désactivé et ne peut pas être supprimé.',
      });
      return;
    }

    const confirmed = window.confirm(
      'Supprimer définitivement ce brouillon jamais activé ?'
    );

    if (!confirmed) {
      return;
    }

    try {
      await deleteAdminTrophy(trophyId);
      setSelectedTrophyId((current) => (current === trophyId ? null : current));
      if (trophyDraft?.id === trophyId) {
        setTrophyDraft(null);
        setView('trophies');
      }
    } catch (error) {
      setTrophyFormFeedback({
        kind: 'error',
        message:
          error instanceof Error ? error.message : 'Suppression impossible.',
      });
    }
  };

  const handleTrophyStatusToggle = async (trophyId: string) => {
    const trophy = adminTrophies.find((item) => item.id === trophyId);

    if (!trophy) {
      return;
    }

    try {
      await saveAdminTrophy({
        ...trophy,
        status:
          trophy.status === 'active'
            ? 'inactive'
            : trophy.status === 'inactive'
              ? 'active'
              : 'active',
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      setTrophyFormFeedback({
        kind: 'error',
        message:
          error instanceof Error ? error.message : 'Mise à jour impossible.',
      });
    }
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

  const handleSaveTrophy = async () => {
    if (!trophyDraft) {
      return;
    }

    const normalizedDraft = ensureTrophyDefinitionShape(trophyDraft);
    const errors =
      normalizedDraft.status === 'active'
        ? validateTrophyDefinition(normalizedDraft)
        : [];

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

    if (
      existingTrophy?.status === 'active' &&
      normalizedDraft.status !== 'draft'
    ) {
      const confirmed = window.confirm(
        'Publier cette nouvelle version recalculera les trophées de tous les internes. Continuer ?'
      );

      if (!confirmed) {
        return;
      }
    }

    setIsSavingTrophy(true);
    setTrophyFormFeedback(null);

    try {
      const nextDraft = {
        ...normalizedDraft,
        updatedAt: new Date().toISOString(),
      };
      const savedTrophy = await saveAdminTrophy(nextDraft);
      setSelectedTrophyId(savedTrophy.id);
      setTrophyFormFeedback({
        kind: 'success',
        message:
          nextDraft.status === 'draft'
            ? 'Le brouillon a été enregistré. La version actuellement publiée reste inchangée.'
            : 'La nouvelle version du trophée a été publiée atomiquement.',
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
    if (uploadingTrophyImageKeys.length > 0) {
      setTrophyFormFeedback({
        kind: 'error',
        message: 'Attendez la fin du téléversement avant de quitter.',
      });
      return;
    }

    const trophyIdToClean = trophyDraft?.id ?? null;

    setTrophyDraft(null);
    setTrophyValidationErrors([]);
    setTrophyFormFeedback(null);
    setView('trophies');

    if (trophyIdToClean) {
      void cleanupTrophyImages(trophyIdToClean).catch((error) => {
        console.warn('Unable to clean up cancelled trophy images.', error);
      });
    }
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

  const handleExportAnalyticsExcel = () => {
    const generatedAt = new Date();

    downloadAnalyticsExcel({
      activityLog,
      adminEvaluations,
      allTimeCycleSummary: allTimeActivityCycleSummary,
      customSurgicalInterventions,
      internalProfiles,
      period: activityAnalyticsPeriod,
      periodEndIso: generatedAt.toISOString(),
      periodLabel: analyticsPeriodLabel,
      periodStartIso: getAdminAnalyticsPeriodStart(
        activityAnalyticsPeriod,
        generatedAt
      ).toISOString(),
      periodSummary: activityAnalyticsSummary,
      generatedAtIso: generatedAt.toISOString(),
      savedInterventions,
      selectableSeniors,
    });
    setAnalyticsFeedback({
      kind: 'success',
      message: 'L’export des données au format Excel a bien été téléchargé.',
    });
  };

  const handleSendRelanceEmail = (profile: AdminRelanceProfile) => {
    setAnalyticsFeedback(null);

    if (!profile.contactEmail) {
      setAnalyticsFeedback({
        kind: 'error',
        message: `Aucune adresse e-mail n’est enregistrée pour ${profile.name}.`,
      });
      return;
    }

    const subject = encodeURIComponent('Rappel de connexion - Mon Journal de Bloc');
    const body = encodeURIComponent(
      `Bonjour ${profile.name},\n\n` +
        `Un rappel vous est adressé afin de vous reconnecter à Mon Journal de Bloc.\n\n` +
        `Vous pouvez utiliser votre identifiant habituel pour accéder à la plateforme.\n\n` +
        `Bien cordialement,`
    );

    window.location.href = `mailto:${profile.contactEmail}?subject=${subject}&body=${body}`;
    recordActivity('Préparation d’un rappel e-mail', 'Relance profil', profile.name);
    setAnalyticsFeedback({
      kind: 'success',
      message: `Le rappel e-mail pour ${profile.name} a été préparé.`,
    });
  };

  const handleDeactivateInternalProfile = async (profile: InternalProfile) => {
    const confirmed = window.confirm(
      `Désactiver le profil de ${formatDisplayName(
        profile.firstName,
        profile.lastName
      )} ?\n\nSon accès sera désactivé, sans supprimer ses interventions, fiches ni trophées.`
    );

    if (!confirmed) {
      return;
    }

    try {
      await deactivateInternalProfile(profile.id);
      setFeedback({
        kind: 'success',
        message: `Le profil ${formatDisplayName(profile.firstName, profile.lastName)} a été désactivé.`,
      });
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Désactivation impossible.',
      });
    }
  };

  const handleReactivateProfile = async (profile: BackendProfile) => {
    const profileLabel = formatDisplayName(profile.firstName, profile.lastName);

    if (!profile.authUserId) {
      setDisabledProfilesFeedback({
        kind: 'error',
        message: `Le compte historique de ${profileLabel} ne possède plus d’identité Supabase Auth et ne peut pas être réactivé automatiquement.`,
      });
      return;
    }

    if (
      !window.confirm(
        `Réactiver le compte de ${profileLabel} ?\n\nSon identité et son mot de passe sont conservés. Une nouvelle connexion sera exigée sur chaque appareil.`
      )
    ) {
      return;
    }

    setDisabledProfilesFeedback(null);
    setReactivatingProfileId(profile.id);

    try {
      await reactivateAdminAccount(profile.id, profile.version);
      setDisabledProfiles((current) =>
        current.filter((candidate) => candidate.id !== profile.id)
      );
      setDisabledProfilesFeedback({
        kind: 'success',
        message: `Le compte de ${profileLabel} a été réactivé. Une nouvelle connexion est nécessaire.`,
      });

      try {
        await refreshBackendData();
      } catch {
        setDisabledProfilesFeedback({
          kind: 'error',
          message: `Le compte de ${profileLabel} est réactivé, mais l’affichage des profils actifs n’a pas pu être actualisé. Rechargez la page.`,
        });
      }
    } catch (error) {
      setDisabledProfilesFeedback({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'La réactivation du compte a échoué.',
      });
    } finally {
      setReactivatingProfileId(null);
    }
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
    const selectedEvaluationContextRows = getClinicalContextSummaryRows(
      selectedEvaluationIntervention.contextVariables
    );
    const selectedEvaluationVisibleContextRows =
      selectedEvaluationContextRows.filter(
        (row) =>
          row.value !== 'Non renseigné' &&
          row.value !== 'Non renseignée' &&
          row.value !== 'Non renseignées'
      );
    const selectedEvaluationContextMetricLabels = new Set([
      'Âge de la patiente',
      'IMC de la patiente',
      'Saignement per-opératoire',
    ]);
    const getSelectedEvaluationContextValue = (label: string) =>
      selectedEvaluationContextRows.find((row) => row.label === label)?.value ??
      'Non renseigné';
    const selectedEvaluationContextMetrics = [
      {
        label: 'Âge',
        value: getSelectedEvaluationContextValue('Âge de la patiente'),
      },
      {
        label: 'IMC',
        value: getSelectedEvaluationContextValue('IMC de la patiente'),
      },
      {
        label: 'Durée opératoire',
        value: selectedEvaluationIntervention.operativeDurationMinutes
          ? `${selectedEvaluationIntervention.operativeDurationMinutes} min`
          : 'Non renseignée',
      },
      {
        label: 'Saignement',
        value: getSelectedEvaluationContextValue('Saignement per-opératoire'),
      },
    ];
    const selectedEvaluationOtherContextRows =
      selectedEvaluationVisibleContextRows.filter(
        (row) => !selectedEvaluationContextMetricLabels.has(row.label)
      );
    const selectedEvaluationClinicalDataCount =
      selectedEvaluationVisibleContextRows.length +
      (selectedEvaluationIntervention.operativeDurationMinutes ? 1 : 0);
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
          )
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
                cancelSeniorEvaluationAnalyticsSession();
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
          <div
            onClickCapture={(event) => {
              if (isAnalyticsInteractionTarget(event.target)) {
                registerSeniorEvaluationInteraction();
              }
            }}
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
                <small className="senior-evaluation-summary-card__native-indication">
                  Indication : {indicationLabel || 'Non renseignée'}
                </small>
                <small className="senior-evaluation-summary-card__native-timing">
                  Début : {selectedEvaluationIntervention.startTime ?? 'Non renseigné'}
                  <span className="senior-evaluation-summary-card__native-duration">
                    {' · '}
                    Durée :{' '}
                    {selectedEvaluationIntervention.operativeDurationMinutes
                      ? `${selectedEvaluationIntervention.operativeDurationMinutes} min`
                      : 'Non renseignée'}
                  </span>
                </small>
                <small className="senior-evaluation-summary-card__web-meta">
                  {indicationLabel || 'Indication non renseignée'}
                  {' · '}
                  {selectedEvaluationIntervention.startTime ?? 'Horaire non renseigné'}
                </small>
              </div>
            </div>
            <section
              aria-labelledby="senior-evaluation-clinical-overview-title"
              className="senior-evaluation-clinical-overview"
            >
              <div className="senior-evaluation-clinical-overview__heading">
                <div>
                  <strong id="senior-evaluation-clinical-overview-title">
                    Contexte clinique
                  </strong>
                  <span>Synthèse des variables renseignées</span>
                </div>
                <span className="senior-evaluation-clinical-overview__count">
                  {selectedEvaluationClinicalDataCount}{' '}
                  {selectedEvaluationClinicalDataCount > 1 ? 'données' : 'donnée'}
                </span>
              </div>

              <dl className="senior-evaluation-clinical-overview__metrics">
                {selectedEvaluationContextMetrics.map((metric) => (
                  <div key={metric.label}>
                    <dt>{metric.label}</dt>
                    <dd>{metric.value}</dd>
                  </div>
                ))}
              </dl>

              <details className="senior-evaluation-clinical-overview__details">
                <summary>Voir les autres variables</summary>
                {selectedEvaluationOtherContextRows.length ? (
                  <dl>
                    {selectedEvaluationOtherContextRows.map((row) => (
                      <div key={row.label}>
                        <dt>{row.label}</dt>
                        <dd>{row.value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p>Aucune autre variable renseignée.</p>
                )}
              </details>
            </section>
            <details className="senior-evaluation-clinical-context senior-evaluation-clinical-context--native">
              <summary>Contexte clinique de l’intervention</summary>
              <dl>
                {selectedEvaluationContextRows.map((row) => (
                  <div key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </div>
                ))}
              </dl>
            </details>
          </section>

          <section className="senior-evaluation-panel senior-evaluation-panel--primary">
            <div className="senior-evaluation-panel__header">
              <h2>Évaluation senior</h2>
            </div>

            <div className="senior-evaluation-step">
              <div className="senior-evaluation-step__title">
                <span>1</span>
                <h3>Autonomie par temps opératoire</h3>
                <small className="senior-evaluation-step__progress">
                  {
                    selectedEvaluationChecklistSteps.filter(
                      (step) => evaluationDraft.checklist[step.id] != null
                    ).length
                  }{' '}
                  étapes sur {selectedEvaluationChecklistSteps.length} renseignées
                </small>
              </div>
              {selectedEvaluationChecklistSteps.length ? (
                <SeniorChecklistEditor
                  activeStepId={activeEvaluationChecklistStepId}
                  onActiveStepChange={setActiveEvaluationChecklistStepId}
                  onValueChange={(stepId, level) => {
                    setEvaluationFeedback(null);
                    setEvaluationDraft((current) => ({
                      ...current,
                      checklist: {
                        ...current.checklist,
                        [stepId]: level,
                      },
                    }));
                  }}
                  steps={selectedEvaluationChecklistSteps}
                  values={evaluationDraft.checklist}
                />
              ) : (
                <p className="senior-rating-description">
                  Aucun temps opératoire applicable à cette intervention.
                </p>
              )}
            </div>

            <div className="senior-evaluation-step">
              <div className="senior-evaluation-step__title">
                <span>2</span>
                <h3>Performance chirurgicale globale</h3>
              </div>
              <div className="senior-evaluation-option-grid senior-evaluation-option-grid--performance">
                {ADMIN_PERFORMANCE_OPTIONS.map((option) => {
                  const isSelected =
                    evaluationDraft.globalPerformance === option.value;
                  const level = Number(option.value);

                  return (
                    <button
                      aria-pressed={isSelected}
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
                      <strong>{SENIOR_PERFORMANCE_LABELS[option.value]}</strong>
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
                <span>3</span>
                <h3>Difficulté chirurgicale intra-catégorie</h3>
              </div>
              <div className="senior-evaluation-option-grid senior-evaluation-option-grid--difficulty">
                {ADMIN_CATEGORY_DIFFICULTY_OPTIONS.map((option) => {
                  const isSelected =
                    evaluationDraft.categoryDifficulty === option.value;
                  const level = Number(option.value);

                  return (
                    <button
                      aria-pressed={isSelected}
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
                      <strong>{SENIOR_DIFFICULTY_LABELS[option.value]}</strong>
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
                <span>4</span>
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
                  cancelSeniorEvaluationAnalyticsSession();
                  setSelectedEvaluationInterventionId(null);
                  setEvaluationFeedback(null);
                }}
                type="button"
              >
                Retour à l’espace senior
              </button>
            </div>
          </section>
          </div>
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
                  <span>
                    <strong>Début</strong>
                    {selectedEvaluationIntervention.startTime ?? 'Non renseigné'}
                  </span>
                  <span>
                    <strong>Durée</strong>
                    {selectedEvaluationIntervention.operativeDurationMinutes
                      ? `${selectedEvaluationIntervention.operativeDurationMinutes} min`
                      : 'Non renseignée'}
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
          <details className="senior-evaluation-clinical-context">
            <summary>Contexte clinique de l’intervention</summary>
            <dl>
              {selectedEvaluationContextRows.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </details>
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
                  aria-pressed={
                    selectedEvaluation?.globalPerformance === option.value
                  }
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
                  aria-pressed={
                    selectedEvaluation?.categoryDifficulty === option.value
                  }
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
              L’export inclut les données générales, les évaluations Senior, les
              étapes opératoires, les scores calculés et les délais d’évaluation.
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
        subtitle="Vue détaillée de l’usage de la plateforme, des blocs enregistrés et des profils à relancer."
        title="Analytique d'usage"
      >
        <FeedbackMessage feedback={analyticsFeedback} />
        <SectionCard
          className="admin-dashboard-card admin-usage-overview-card"
        >
          <div className="admin-usage-overview">
            <div className="admin-usage-overview__copy">
              <h2>Vue instantanée de l'activité</h2>
            </div>

            <div className="admin-usage-overview__toolbar">
              <div className="admin-segmented-control" role="tablist" aria-label="Période d'analyse">
                {ADMIN_ACTIVITY_ANALYTICS_PERIOD_OPTIONS.map((option) => (
                  <button
                    aria-selected={activityAnalyticsPeriod === option.value}
                    className={`admin-segmented-control__button ${
                      activityAnalyticsPeriod === option.value
                        ? 'admin-segmented-control__button--active'
                        : ''
                    }`}
                    key={option.value}
                    onClick={() => setActivityAnalyticsPeriod(option.value)}
                    role="tab"
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <div className="admin-usage-overview__actions">
                <button
                  className="app-button app-button--primary"
                  onClick={handleExportAnalyticsExcel}
                  type="button"
                >
                  Exporter les données
                </button>
              </div>
            </div>
          </div>

          <div className="admin-metric-grid admin-metric-grid--analytics admin-metric-grid--usage">
            <article className="admin-metric-card admin-metric-card--compact admin-metric-card--compact-no-icon">
              <div>
                <strong>{activityAnalyticsSummary.recentActivityCount}</strong>
                <span>Activités sur {analyticsPeriodLabel.toLocaleLowerCase('fr-FR')}</span>
                <small>internes + seniors</small>
              </div>
            </article>

            <article className="admin-metric-card admin-metric-card--compact admin-metric-card--compact-no-icon">
              <div>
                <strong>
                  {activityAnalyticsSummary.activeInternalCount +
                    activityAnalyticsSummary.activeSeniorCount}
                </strong>
                <span>Profils actifs sur {analyticsPeriodLabel.toLocaleLowerCase('fr-FR')}</span>
                <small>
                  {activityAnalyticsSummary.activeInternalCount} internes ·{' '}
                  {activityAnalyticsSummary.activeSeniorCount} seniors
                </small>
              </div>
            </article>

            <article className="admin-metric-card admin-metric-card--compact admin-metric-card--compact-no-icon">
              <div>
                <strong>{activityAnalyticsSummary.evaluationRate}%</strong>
                <span>Blocs évalués</span>
                <small>
                  {activityAnalyticsSummary.recentEvaluatedCount} évaluations enregistrées
                  sur {analyticsPeriodLabel.toLocaleLowerCase('fr-FR')}
                </small>
              </div>
            </article>

            <article className="admin-metric-card admin-metric-card--compact admin-metric-card--compact-no-icon">
              <div>
                <strong>
                  {formatAdminDelayLabel(activityAnalyticsSummary.averageRecordingDelayMs)}
                </strong>
                <span>Délai moyen bloc → saisie</span>
                <small>date opératoire → enregistrement</small>
              </div>
            </article>

            <article className="admin-metric-card admin-metric-card--compact admin-metric-card--compact-no-icon">
              <div>
                <strong>
                  {formatAdminDelayLabel(activityAnalyticsSummary.averageEvaluationDelayMs)}
                </strong>
                <span>Délai moyen saisie → évaluation</span>
                <small>calculé sur les blocs déjà évalués</small>
              </div>
            </article>
          </div>
        </SectionCard>

        <div className="admin-usage-primary-grid">
          <SectionCard
            className="admin-dashboard-card admin-usage-chart-card"
            description="Suivi du volume d'usage par granularité sélectionnée."
            title="Connexions"
          >
            <div className="admin-usage-chart-card__toolbar">
              <div className="admin-usage-chart-card__meta">
                <span>
                  {activityAnalyticsSummary.recentActivityCount} activités sur {analyticsPeriodLabel.toLocaleLowerCase('fr-FR')}
                </span>
              </div>
            </div>

            {hasActivityAnalyticsChartData ? (
              <>
                <div className="admin-usage-line-chart-scroll" ref={analyticsChartScrollRef}>
                  <div
                    className="admin-usage-line-chart"
                    style={{
                      minWidth: `${Math.max(activityAnalyticsBuckets.length * 84, 480)}px`,
                    }}
                  >
                    <div className="admin-usage-line-chart__plot admin-usage-line-chart__plot--bars">
                      <div className="admin-usage-line-chart__grid">
                        {Array.from({ length: 4 }, (_, index) => (
                          <span key={index} />
                        ))}
                      </div>

                      <div
                        className="admin-usage-bar-chart"
                        style={{
                          gridTemplateColumns: `repeat(${Math.max(
                            activityAnalyticsBuckets.length,
                            1
                          )}, minmax(64px, 1fr))`,
                        }}
                      >
                        {activityAnalyticsBuckets.map((bucket) => (
                          <div className="admin-usage-bar-chart__column" key={bucket.id}>
                            <div className="admin-usage-bar-chart__bars">
                              <button
                                aria-label={formatAdminActivityBarTooltip(
                                  bucket.internalCount,
                                  'interne'
                                )}
                                className="admin-usage-bar-chart__bar admin-usage-bar-chart__bar--internal"
                                style={{
                                  height: `${Math.max(
                                    (bucket.internalCount /
                                      Math.max(activityAnalyticsSummary.chartMax, 1)) *
                                      100,
                                    bucket.internalCount > 0 ? 10 : 0
                                  )}%`,
                                }}
                                title={formatAdminActivityBarTooltip(
                                  bucket.internalCount,
                                  'interne'
                                )}
                                type="button"
                              >
                                <span className="admin-usage-bar-chart__tooltip">
                                  {formatAdminActivityBarTooltip(
                                    bucket.internalCount,
                                    'interne'
                                  )}
                                </span>
                              </button>
                              <button
                                aria-label={formatAdminActivityBarTooltip(
                                  bucket.seniorCount,
                                  'senior'
                                )}
                                className="admin-usage-bar-chart__bar admin-usage-bar-chart__bar--senior"
                                style={{
                                  height: `${Math.max(
                                    (bucket.seniorCount /
                                      Math.max(activityAnalyticsSummary.chartMax, 1)) *
                                      100,
                                    bucket.seniorCount > 0 ? 10 : 0
                                  )}%`,
                                }}
                                title={formatAdminActivityBarTooltip(
                                  bucket.seniorCount,
                                  'senior'
                                )}
                                type="button"
                              >
                                <span className="admin-usage-bar-chart__tooltip">
                                  {formatAdminActivityBarTooltip(
                                    bucket.seniorCount,
                                    'senior'
                                  )}
                                </span>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div
                      className="admin-usage-line-chart__labels"
                      style={{
                        gridTemplateColumns: `repeat(${Math.max(
                          activityAnalyticsBuckets.length,
                          1
                        )}, minmax(64px, 1fr))`,
                      }}
                    >
                      {activityAnalyticsBuckets.map((bucket) => (
                        <div className="admin-usage-line-chart__label" key={bucket.id}>
                          <span>{bucket.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="admin-activity-legend admin-activity-legend--usage">
                  <span>
                    <i className="admin-activity-legend__dot admin-activity-legend__dot--recorded" />
                    Activités internes
                  </span>
                  <span>
                    <i className="admin-activity-legend__dot admin-activity-legend__dot--senior" />
                    Activités seniors
                  </span>
                </div>
              </>
            ) : (
              <div className="admin-empty-state">
                <BarChart3 aria-hidden="true" />
                <strong>Aucune activité récente à tracer</strong>
                <span>
                  Les connexions et activités des utilisateurs apparaitront ici dès qu'elles seront enregistrées.
                </span>
              </div>
            )}
          </SectionCard>

          <SectionCard
            className="admin-dashboard-card admin-usage-relance-card"
            description={`Profils inactifs depuis ${relanceThresholdDays} jours ou jamais connectés.`}
            title="Profils à relancer"
          >
            <div className="admin-usage-relance-summary">
              <div className="admin-segmented-control" role="tablist" aria-label="Fenêtre de relance">
                {ADMIN_RELANCE_WINDOW_OPTIONS.map((option) => (
                  <button
                    aria-selected={relanceWindow === option.value}
                    className={`admin-segmented-control__button ${
                      relanceWindow === option.value
                        ? 'admin-segmented-control__button--active'
                        : ''
                    }`}
                    key={option.value}
                    onClick={() => setRelanceWindow(option.value)}
                    role="tab"
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {activityAnalyticsSummary.neverConnectedCount > 0 ? (
              <div className="admin-usage-relance-summary">
                <span className="admin-usage-filter-pill admin-usage-filter-pill--warning">
                  {activityAnalyticsSummary.neverConnectedCount} jamais connectés
                </span>
              </div>
            ) : null}

            {activityAnalyticsSummary.relanceProfiles.length ? (
              <div className="admin-usage-relance-columns">
                <div className="admin-usage-relance-column">
                  <h3>Internes</h3>
                  {relanceInternalProfiles.length ? (
                    <div className="admin-usage-relance-list">
                      {relanceInternalProfiles.map((profile) => (
                        <article className="admin-usage-relance-item" key={profile.id}>
                          <div>
                            <strong>{profile.name}</strong>
                            <span>{formatInactiveDaysLabel(profile.inactiveDays)}</span>
                            <small>{profile.contactEmail ?? 'Aucun e-mail enregistré'}</small>
                          </div>
                          <div className="admin-usage-relance-item__actions">
                            <small>
                              {profile.lastLoginAt
                                ? formatAdminConnectionTimestamp(profile.lastLoginAt)
                                : 'Aucune connexion'}
                            </small>
                            <button
                              className="mini-button mini-button--secondary"
                              disabled={!profile.contactEmail}
                              onClick={() => handleSendRelanceEmail(profile)}
                              type="button"
                            >
                              Envoyer un rappel
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="validation-box">
                      <strong>Aucun interne à relancer</strong>
                      <span>Tous les internes se sont connectés récemment.</span>
                    </div>
                  )}
                </div>

                <div className="admin-usage-relance-column">
                  <h3>Seniors</h3>
                  {relanceSeniorProfiles.length ? (
                    <div className="admin-usage-relance-list">
                      {relanceSeniorProfiles.map((profile) => (
                        <article className="admin-usage-relance-item" key={profile.id}>
                          <div>
                            <strong>{profile.name}</strong>
                            <span>{formatInactiveDaysLabel(profile.inactiveDays)}</span>
                            <small>{profile.contactEmail ?? 'Aucun e-mail enregistré'}</small>
                          </div>
                          <div className="admin-usage-relance-item__actions">
                            <small>
                              {profile.lastLoginAt
                                ? formatAdminConnectionTimestamp(profile.lastLoginAt)
                                : 'Aucune connexion'}
                            </small>
                            <button
                              className="mini-button mini-button--secondary"
                              disabled={!profile.contactEmail}
                              onClick={() => handleSendRelanceEmail(profile)}
                              type="button"
                            >
                              Envoyer un rappel
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <div className="validation-box">
                      <strong>Aucun senior à relancer</strong>
                      <span>Tous les seniors se sont connectés récemment.</span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="validation-box">
                <strong>Aucun profil à relancer</strong>
                <span>Tous les comptes ont été actifs récemment.</span>
              </div>
            )}
          </SectionCard>
        </div>

        <div className="admin-usage-secondary-grid">
          <SectionCard
            className="admin-dashboard-card admin-usage-cycle-card"
            description="Indicateurs calculables immédiatement à partir des horodatages déjà enregistrés."
            title="Cycle des interventions"
          >
            <div className="admin-usage-cycle-strip">
              <article className="admin-usage-cycle-pill">
                <strong>{activityAnalyticsSummary.recentRecordedCount}</strong>
                <span>Blocs enregistrés</span>
              </article>
              <article className="admin-usage-cycle-pill">
                <strong>{activityAnalyticsSummary.recentEvaluatedCount}</strong>
                <span>Évaluations enregistrées</span>
              </article>
            </div>

            <div className="admin-usage-delay-grid">
              <article className="admin-usage-delay-card">
                <span>Délai moyen bloc → saisie</span>
                <strong>
                  {formatAdminDelayLabel(activityAnalyticsSummary.averageRecordingDelayMs)}
                </strong>
              </article>
              <article className="admin-usage-delay-card">
                <span>Délai moyen saisie → évaluation</span>
                <strong>
                  {formatAdminDelayLabel(activityAnalyticsSummary.averageEvaluationDelayMs)}
                </strong>
              </article>
              <article className="admin-usage-delay-card">
                <span>Temps moyen pour ajouter une intervention</span>
                <strong>
                  {formatWorkflowDurationLabel(
                    activityAnalyticsSummary.averageInterventionFormDurationMs
                  )}
                </strong>
                <small>
                  {activityAnalyticsSummary.completedInterventionFormCount} formulaire(s)
                  complété(s)
                </small>
              </article>
              <article className="admin-usage-delay-card">
                <span>Clics moyens pour ajouter une intervention</span>
                <strong>
                  {formatAverageClickCountLabel(
                    activityAnalyticsSummary.averageInterventionFormClickCount
                  )}
                </strong>
                <small>
                  Mesure des interactions internes sur mobile et desktop
                </small>
              </article>
              <article className="admin-usage-delay-card">
                <span>Temps moyen pour évaluer un interne</span>
                <strong>
                  {formatWorkflowDurationLabel(
                    activityAnalyticsSummary.averageSeniorEvaluationDurationMs
                  )}
                </strong>
                <small>
                  {activityAnalyticsSummary.completedSeniorEvaluationCount} évaluation(s)
                  validée(s)
                </small>
              </article>
              <article className="admin-usage-delay-card">
                <span>Clics moyens pour évaluer un interne</span>
                <strong>
                  {formatAverageClickCountLabel(
                    activityAnalyticsSummary.averageSeniorEvaluationClickCount
                  )}
                </strong>
                <small>
                  Mesure des interactions seniors sur mobile et desktop
                </small>
              </article>
            </div>

          </SectionCard>

          <SectionCard
            className="admin-dashboard-card admin-usage-ranking-panel"
            description={`Ce que les utilisateurs font le plus sur ${analyticsPeriodLabel.toLocaleLowerCase('fr-FR')}.`}
            title="Top usages"
          >
            <div className="admin-usage-ranking-grid">
              <div className="admin-usage-ranking-card">
                <div className="admin-usage-ranking-block">
                  <h3>Activités les plus fréquentes</h3>
                  {activityAnalyticsSummary.topActions.length ? (
                    <div className="admin-usage-ranking-list">
                      {activityAnalyticsSummary.topActions.map((item) => (
                        <article className="admin-usage-ranking-item" key={item.id}>
                          <div>
                            <strong>{item.label}</strong>
                            <span>{item.detail}</span>
                          </div>
                          <b>{item.value}</b>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <span className="admin-connection-row__activity-empty">
                      Aucune activité enregistrée sur la période.
                    </span>
                  )}
                </div>

              </div>

              <div className="admin-usage-ranking-card">
                <div className="admin-usage-ranking-block">
                  <h3>Internes les plus actifs</h3>
                  {activityAnalyticsSummary.topInternalConnections.length ? (
                    <div className="admin-usage-ranking-list">
                      {activityAnalyticsSummary.topInternalConnections.map((item) => (
                        <article className="admin-usage-ranking-item" key={item.id}>
                          <div>
                            <strong>{item.label}</strong>
                            <span>{item.detail}</span>
                          </div>
                          <b>{item.value}</b>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <span className="admin-connection-row__activity-empty">
                      Aucune connexion interne récente.
                    </span>
                  )}
                </div>

                <div className="admin-usage-ranking-block">
                  <h3>Seniors les plus actifs</h3>
                  {activityAnalyticsSummary.topSeniorConnections.length ? (
                    <div className="admin-usage-ranking-list">
                      {activityAnalyticsSummary.topSeniorConnections.map((item) => (
                        <article className="admin-usage-ranking-item" key={item.id}>
                          <div>
                            <strong>{item.label}</strong>
                            <span>{item.detail}</span>
                          </div>
                          <b>{item.value}</b>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <span className="admin-connection-row__activity-empty">
                      Aucune connexion senior récente.
                    </span>
                  )}
                </div>
              </div>
            </div>
          </SectionCard>
        </div>

        <SectionCard
          className="admin-dashboard-card"
          description="Les actions utilisateurs détaillées les plus récentes."
          title="Dernières activités détaillées sur 24h"
        >
          {activityAnalyticsSummary.recentDetailedActivities.length ? (
            <>
              <div className="admin-usage-table-shell">
                <table className="admin-usage-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Utilisateur</th>
                      <th>Rôle</th>
                      <th>Action</th>
                      <th>Cible</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleDetailedActivities.map((entry) => (
                      <tr key={entry.id}>
                        <td>{formatAdminConnectionTimestamp(entry.createdAt)}</td>
                        <td>
                          <div className="admin-usage-table__identity">
                            <strong>{entry.actorLabel}</strong>
                          </div>
                        </td>
                        <td>
                          <span className="admin-usage-role-badge">
                            {entry.actorRole === 'internal' ? 'Interne' : 'Senior'}
                          </span>
                        </td>
                        <td>
                          <div className="admin-usage-table__detail">
                            <strong>{entry.action}</strong>
                            <span>{entry.targetType}</span>
                          </div>
                        </td>
                        <td>
                          <div className="admin-usage-table__detail">
                            <strong>{entry.targetLabel || 'Sans cible précise'}</strong>
                            <span>{formatActivityLogEntrySummary(entry)}</span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="admin-usage-mobile-list">
                {visibleDetailedActivities.map((entry) => (
                  <article className="admin-usage-mobile-card" key={entry.id}>
                    <div className="admin-usage-mobile-card__head">
                      <strong>{entry.actorLabel}</strong>
                      <span>{formatAdminConnectionTimestamp(entry.createdAt)}</span>
                    </div>
                    <div className="admin-usage-mobile-card__meta">
                      <span className="admin-usage-role-badge">
                        {entry.actorRole === 'internal' ? 'Interne' : 'Senior'}
                      </span>
                      <small>{entry.targetType}</small>
                    </div>
                    <p>{entry.action}</p>
                    <small>{entry.targetLabel || 'Sans cible précise'}</small>
                  </article>
                ))}
              </div>

              {activityAnalyticsSummary.recentDetailedActivities.length >
              ADMIN_DETAILED_ACTIVITY_PAGE_SIZE ? (
                <div className="admin-usage-table-footer">
                  <span>
                    {visibleDetailedActivities.length} /{' '}
                    {activityAnalyticsSummary.recentDetailedActivities.length} activités
                    affichées
                  </span>
                  <div className="admin-usage-table-footer__actions">
                    {hasMoreDetailedActivities ? (
                      <button
                        className="mini-button mini-button--secondary"
                        onClick={() =>
                          setDetailedActivitiesVisibleCount((current) =>
                            current + ADMIN_DETAILED_ACTIVITY_PAGE_SIZE
                          )
                        }
                        type="button"
                      >
                        Voir {ADMIN_DETAILED_ACTIVITY_PAGE_SIZE} activités de plus
                      </button>
                    ) : null}
                    {visibleDetailedActivities.length >
                    ADMIN_DETAILED_ACTIVITY_PAGE_SIZE ? (
                      <button
                        className="mini-button mini-button--secondary"
                        onClick={() =>
                          setDetailedActivitiesVisibleCount(
                            ADMIN_DETAILED_ACTIVITY_PAGE_SIZE
                          )
                        }
                        type="button"
                      >
                        Voir moins
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="validation-box">
              <strong>Aucune activité enregistrée</strong>
              <span>Les prochaines actions utilisateurs apparaitront ici.</span>
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
        points.length <= 1
          ? usableWidth / 2
          : (index / Math.max(points.length - 1, 1)) * usableWidth;
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
    const maximumDateLabels = 5;
    const dateLabelInterval = Math.max(
      1,
      Math.ceil(
        (progressChartPoints.length - 1) /
          Math.max(maximumDateLabels - 1, 1)
      )
    );
    const progressChartDateLabelPoints = progressChartPoints.filter(
      (_point, index) =>
        progressChartPoints.length <= maximumDateLabels ||
        index === 0 ||
        index === progressChartPoints.length - 1 ||
        index % dateLabelInterval === 0
    );

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
              <div className="admin-profile-kpi-card__copy">
                <strong>{selectedProfileStats.recordedInterventionsCount}</strong>
                <span>interventions</span>
              </div>
            </article>
            <article className="admin-profile-kpi-card admin-profile-kpi-card--success">
              <span className="admin-profile-kpi-card__icon">
                <Check aria-hidden="true" />
              </span>
              <div className="admin-profile-kpi-card__copy">
                <strong>{selectedProfileEvaluationRate}%</strong>
                <span>évaluées</span>
              </div>
            </article>
            <article className="admin-profile-kpi-card admin-profile-kpi-card--amber">
              <span className="admin-profile-kpi-card__icon">
                <Trophy aria-hidden="true" />
              </span>
              <div className="admin-profile-kpi-card__copy">
                <strong>{selectedProfileStats.earnedTrophiesCount}</strong>
                <span>trophées</span>
              </div>
            </article>
          </div>
        </div>

        <SectionCard className="admin-dashboard-card admin-profile-stats-card">
          <div
            aria-label="Onglets statistiques"
            className="admin-profile-stats-tabs"
            role="tablist"
          >
            <button
              aria-selected={profileStatsTab === 'progress'}
              className={`admin-profile-stats-tab ${
                profileStatsTab === 'progress' ? 'admin-profile-stats-tab--active' : ''
              }`}
              onClick={() => setProfileStatsTab('progress')}
              role="tab"
              type="button"
            >
              <BarChart3 aria-hidden="true" />
              <span>Progression</span>
            </button>
            <button
              aria-selected={profileStatsTab === 'history'}
              className={`admin-profile-stats-tab ${
                profileStatsTab === 'history' ? 'admin-profile-stats-tab--active' : ''
              }`}
              onClick={() => setProfileStatsTab('history')}
              role="tab"
              type="button"
            >
              <FolderOpen aria-hidden="true" />
              <span>Historique</span>
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
                    const autonomyScore =
                      status === 'evaluated'
                        ? calculateAutonomyScore(
                            intervention,
                            customSurgicalInterventions,
                            evaluation
                          )
                        : null;
                    const senior =
                      selectableSeniors.find(
                        (seniorItem) => seniorItem.id === intervention.seniorId
                      ) ?? null;
                    const checklistSteps = getHistoricalChecklistSteps(
                      intervention,
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
                                  {autonomyScore != null
                                    ? `${Math.round(autonomyScore)}%`
                                    : status === 'evaluated'
                                      ? INSUFFICIENT_KEY_STEP_COVERAGE_MESSAGE
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
                                      getAuthoritativeChecklist(
                                        intervention,
                                        adminEvaluations[intervention.id]
                                      )[step.id]
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
                  <span className="field-stack__label">Procédure + indication</span>
                  <span className="admin-profile-themed-select">
                    <select
                      className="field-input admin-profile-themed-select__input"
                      onChange={(event) =>
                        setProfileProgressProcedureKey(event.target.value)
                      }
                      value={profileProgressProcedureKey}
                    >
                      {selectedProfileProgressProcedureOptions.length === 0 ? (
                        <option value="">Aucune intervention créée</option>
                      ) : null}
                      {selectedProfileProgressProcedureOptions.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <span className="admin-profile-themed-select__icon" aria-hidden="true">
                      <ChevronDown />
                    </span>
                  </span>
                </label>

                <label className="field-stack">
                  <span className="field-stack__label">Voie d’abord</span>
                  <span className="admin-profile-themed-select">
                    <select
                      className="field-input admin-profile-themed-select__input"
                      onChange={(event) =>
                        setProfileProgressApproach(event.target.value as SurgicalApproach)
                      }
                      value={profileProgressApproach}
                    >
                      {selectedProfileProgressApproachOptions.length === 0 ? (
                        <option value="">Aucune voie disponible</option>
                      ) : null}
                      {selectedProfileProgressApproachOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <span className="admin-profile-themed-select__icon" aria-hidden="true">
                      <ChevronDown />
                    </span>
                  </span>
                </label>

                <label className="field-stack">
                  <span className="field-stack__label">Période</span>
                  <span className="admin-profile-themed-select">
                    <select
                      className="field-input admin-profile-themed-select__input"
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
                    <span className="admin-profile-themed-select__icon" aria-hidden="true">
                      <ChevronDown />
                    </span>
                  </span>
                </label>

              </div>

              {selectedProfileProgressInterventions.length ? (
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
              ) : (
                <div className="validation-box">
                  <strong>Aucun bloc enregistré pour cette sélection</strong>
                  <span>
                    Choisis une autre procédure, une autre indication ou une autre voie
                    d’abord pour afficher les données disponibles.
                  </span>
                </div>
              )}

              <div className="admin-profile-progress-layout">
                <SectionCard
                  className="admin-profile-progress-panel"
                  title="Évolution de l’autonomie"
                >
                  {selectedProfileProgressSeries.length ? (
                    <div
                      aria-label="Évolution du score d’autonomie de l’interne sélectionné"
                      className="admin-profile-progress-chart"
                      role="img"
                    >
                      <svg
                        viewBox="0 0 360 205"
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
                          <g
                            key={point.id}
                            transform={`translate(${point.x + 16} ${point.y + 10})`}
                          >
                            <title>
                              {formatIsoDate(point.date)} : {point.score}%
                            </title>
                            <circle
                              cx="0"
                              cy="0"
                              fill="white"
                              r="5"
                              stroke="currentColor"
                              strokeWidth="3"
                            />
                            <text x="0" y="-12">
                              {point.score}%
                            </text>
                          </g>
                        ))}
                        {progressChartDateLabelPoints.map((point, index) => (
                          <text
                            className="admin-profile-progress-chart__date-label"
                            key={`date-${point.id}`}
                            textAnchor={
                              progressChartDateLabelPoints.length === 1
                                ? 'middle'
                                : index === 0
                                  ? 'start'
                                  : index ===
                                      progressChartDateLabelPoints.length - 1
                                    ? 'end'
                                    : 'middle'
                            }
                            x={point.x + 16}
                            y="192"
                          >
                            {formatIsoDate(point.date)}
                          </text>
                        ))}
                      </svg>
                    </div>
                  ) : (
                    <div className="validation-box">
                      <strong>Aucune autonomie évaluée pour cette sélection</strong>
                      <span>
                        La courbe apparaîtra dès qu’au moins une intervention évaluée aura
                        un score d’autonomie.
                      </span>
                    </div>
                  )}
                </SectionCard>

                <SectionCard
                  className="admin-profile-progress-panel"
                  title="Temps opératoires"
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
                      <strong>Aucun temps opératoire disponible</strong>
                      <span>
                        Les étapes de cette intervention apparaîtront ici dès qu’un bloc
                        correspondant sera enregistré.
                      </span>
                    </div>
                  )}
                </SectionCard>
              </div>

              <div className="admin-profile-progress-footer admin-profile-progress-footer--single">
                <SectionCard
                  className="admin-profile-progress-panel"
                  title="Trophées obtenus"
                >
                  {selectedProfileAllEarnedTrophies.length ? (
                    <div className="trophy-card-grid">
                      {selectedProfileAllEarnedTrophies.map((trophy) => (
                        <InternalTrophyCard item={trophy} key={trophy.id} />
                      ))}
                    </div>
                  ) : (
                    <div className="validation-box">
                      <strong>Aucun trophée acquis pour l’instant</strong>
                      <span>Tous les trophées gagnés par l’interne apparaîtront ici.</span>
                    </div>
                  )}
                </SectionCard>
              </div>
            </>
          )}
        </SectionCard>
      </AdminPageShell>
    );
  }

  if (isAdmin && view === 'institutions') {
    return (
      <AdminPageShell
        backLabel="Retour à l’espace administrateur"
        onBack={() => setView('home')}
        subtitle="Les rattachements utilisent un identifiant stable : renommer un établissement ne modifie ni les droits ni les historiques."
        title="Établissements"
      >
        <div className="admin-profile-overview">
          <article className="admin-profile-overview-card admin-profile-overview-card--violet">
            <span className="admin-profile-overview-card__icon">
              <Building2 aria-hidden="true" />
            </span>
            <div>
              <strong>{activeInstitutions.length}</strong>
              <span>Établissements actifs</span>
            </div>
          </article>
        </div>

        <FeedbackMessage feedback={institutionFeedback} />

        <SectionCard
          className="admin-dashboard-card"
          title={
            editingInstitutionId
              ? 'Renommer l’établissement'
              : 'Créer un établissement officiel'
          }
        >
          <form className="admin-create-form" onSubmit={handleSaveInstitution}>
            <div className="admin-create-form__grid">
              <label className="field-stack admin-create-form__field--full">
                <span className="field-stack__label">Nom officiel</span>
                <input
                  className="field-input"
                  maxLength={160}
                  onChange={(event) => {
                    setInstitutionName(event.target.value);
                    setInstitutionFeedback(null);
                  }}
                  placeholder="Ex : CHU de Nantes"
                  required
                  type="text"
                  value={institutionName}
                />
              </label>
            </div>
            <div className="admin-profile-editor__actions">
              {editingInstitutionId ? (
                <button
                  className="app-button app-button--secondary"
                  onClick={() => {
                    setEditingInstitutionId(null);
                    setInstitutionName('');
                  }}
                  type="button"
                >
                  Annuler
                </button>
              ) : null}
              <button className="app-button app-button--primary" type="submit">
                {editingInstitutionId ? 'Enregistrer le nouveau nom' : 'Créer'}
              </button>
            </div>
          </form>
        </SectionCard>

        <SectionCard
          className="admin-dashboard-card admin-profile-management-card"
          title="Référentiel officiel"
        >
          <div className="admin-profile-list">
            {institutions.map((institution) => {
              const linkedAccountCount =
                internalProfiles.filter(
                  (profile) => profile.institutionId === institution.id
                ).length +
                customSeniors.filter(
                  (senior) => senior.institutionId === institution.id
                ).length;

              return (
                <article
                  className="profile-card profile-card--static admin-profile-card"
                  key={institution.id}
                >
                  <div className="admin-profile-card__identity">
                    <span className="admin-profile-card__avatar admin-profile-card__avatar--senior">
                      <Building2 aria-hidden="true" />
                    </span>
                    <div className="admin-profile-card__copy">
                      <div className="profile-card__header">
                        <strong>{institution.name}</strong>
                        <span className="profile-card__badge">
                          {institution.status === 'active' ? 'Actif' : 'Archivé'}
                        </span>
                      </div>
                      <div className="profile-card__meta">
                        <span>
                          {linkedAccountCount} compte
                          {linkedAccountCount > 1 ? 's' : ''} rattaché
                          {linkedAccountCount > 1 ? 's' : ''}
                        </span>
                        <span>Identifiant stable : {institution.id}</span>
                      </div>
                    </div>
                  </div>
                  <div className="admin-profile-card__actions">
                    <button
                      className="mini-button mini-button--secondary"
                      onClick={() => {
                        setEditingInstitutionId(institution.id);
                        setInstitutionName(institution.name);
                        setInstitutionFeedback(null);
                      }}
                      type="button"
                    >
                      <Pencil aria-hidden="true" />
                      Renommer
                    </button>
                    {institution.status === 'active' ? (
                      <button
                        className="mini-button"
                        onClick={() => handleArchiveInstitution(institution.id)}
                        type="button"
                      >
                        <Archive aria-hidden="true" />
                        Archiver
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </SectionCard>
      </AdminPageShell>
    );
  }

  if ((isAdmin || isSenior) && view === 'profiles') {
    return (
      <AdminPageShell
        backLabel={isSenior ? 'Retour à l’espace senior' : 'Retour à l’espace administrateur'}
        onBack={() => setView('home')}
        subtitle="Modifiez ou désactivez les comptes internes et seniors de BlocLog."
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
          {isAdmin ? (
            <article className="admin-profile-overview-card">
              <span className="admin-profile-overview-card__icon">
                <Archive aria-hidden="true" />
              </span>
              <div>
                <strong>{disabledProfiles.length}</strong>
                <span>Comptes désactivés</span>
              </div>
            </article>
          ) : null}
        </div>

        <SectionCard className="admin-dashboard-card admin-profile-management-card">
          <div className="admin-profiles-layout">
            <div className="admin-profiles-panel">
              <div
                aria-label="Type de profils"
                className="admin-profiles-tabs"
                role="tablist"
              >
                <button
                  aria-selected={profilesTab === 'internal'}
                  className={`admin-profiles-tab ${
                    profilesTab === 'internal' ? 'admin-profiles-tab--active' : ''
                  }`}
                  onClick={() => setProfilesTab('internal')}
                  role="tab"
                  type="button"
                >
                  <span>Internes</span>
                </button>
                <button
                  aria-selected={profilesTab === 'senior'}
                  className={`admin-profiles-tab ${
                    profilesTab === 'senior' ? 'admin-profiles-tab--active' : ''
                  }`}
                  onClick={() => setProfilesTab('senior')}
                  role="tab"
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
              </div>

              {profilesTab === 'internal' ? <FeedbackMessage feedback={feedback} /> : null}
              {profilesTab === 'senior' ? <FeedbackMessage feedback={seniorFeedback} /> : null}
              {profilesTab === 'senior' ? (
                <FeedbackMessage feedback={seniorAccountFeedback} />
              ) : null}
              {revealedAccessKey ? (
                <div className="validation-box" role="status">
                  <strong>
                    Clé d’accès de {revealedAccessKey.userLabel}
                  </strong>
                  <code>{revealedAccessKey.accessKey}</code>
                  <span>
                    Cette clé n’est affichée qu’ici. Copiez-la avant de fermer ce
                    message.
                  </span>
                  <div className="admin-profile-card__actions">
                    <button
                      className="mini-button mini-button--secondary"
                      onClick={() => void handleCopyAccessKey()}
                      type="button"
                    >
                      Copier la clé
                    </button>
                    <button
                      className="mini-button"
                      onClick={() => setRevealedAccessKey(null)}
                      type="button"
                    >
                      J’ai conservé la clé
                    </button>
                  </div>
                </div>
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
                              <span>Identifiant : {profile.loginId}</span>
                              <span>
                                {profile.mustChangePassword
                                  ? 'Activation en attente'
                                  : 'Compte activé'}
                              </span>
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
                          {isAdmin && profile.mustChangePassword ? (
                            <button
                              className="mini-button"
                              onClick={() => void handleRegenerateAccessKey(profile)}
                              type="button"
                            >
                              Régénérer la clé d’accès
                            </button>
                          ) : null}
                          <button
                            className="mini-button mini-button--danger"
                            onClick={() => handleDeactivateInternalProfile(profile)}
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
                      <span>Essayez un autre terme de recherche.</span>
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
                            <span>
                              {senior.mustChangePassword
                                ? 'Activation en attente'
                                : 'Compte activé'}
                            </span>
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
                          {isAdmin && senior.mustChangePassword ? (
                            <button
                              className="mini-button"
                              onClick={() => void handleRegenerateAccessKey(senior)}
                              type="button"
                            >
                              Régénérer la clé d’accès
                            </button>
                          ) : null}
                          <button
                            className="mini-button mini-button--danger"
                            onClick={() => handleDeactivateSeniorProfile(senior)}
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

              <div
                aria-label="Type de compte à éditer"
                className="admin-profile-editor__switch"
                role="tablist"
              >
                <button
                  aria-selected={profileEditorType === 'internal'}
                  className={
                    profileEditorType === 'internal'
                      ? 'admin-profile-editor__switch-button admin-profile-editor__switch-button--active'
                      : 'admin-profile-editor__switch-button'
                  }
                  onClick={() => {
                    setProfileEditorType('internal');
                    resetSeniorEditor();
                  }}
                  role="tab"
                  type="button"
                >
                  Interne
                </button>
                <button
                  aria-selected={profileEditorType === 'senior'}
                  className={
                    profileEditorType === 'senior'
                      ? 'admin-profile-editor__switch-button admin-profile-editor__switch-button--active'
                      : 'admin-profile-editor__switch-button'
                  }
                  onClick={() => {
                    setProfileEditorType('senior');
                    resetInternalEditor();
                  }}
                  role="tab"
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

                    <label className="field-stack admin-create-form__field--full">
                      <span className="field-stack__label">Établissement</span>
                      <select
                        className="field-input"
                        onChange={(event) =>
                          handleCreateFieldChange('institutionId', event.target.value)
                        }
                        required
                        value={createForm.institutionId}
                      >
                        <option value="">Sélectionner un établissement</option>
                        {activeInstitutions.map((institution) => (
                          <option key={institution.id} value={institution.id}>
                            {institution.name}
                          </option>
                        ))}
                      </select>
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

                  </div>

                  {!editingInternalProfileId ? (
                    <div className="validation-box">
                      <strong>Clé d’accès générée automatiquement</strong>
                      <span>
                        Le site affichera une clé provisoire XXXX-XXXX une seule
                        fois après la création. L’interne choisira lui-même son
                        e-mail et son mot de passe à sa première connexion.
                      </span>
                    </div>
                  ) : null}

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

                    <label className="field-stack admin-create-form__field--full">
                      <span className="field-stack__label">Établissement</span>
                      <select
                        className="field-input"
                        onChange={(event) =>
                          handleCreateSeniorFieldChange(
                            'institutionId',
                            event.target.value
                          )
                        }
                        required
                        value={createSeniorForm.institutionId}
                      >
                        <option value="">Sélectionner un établissement</option>
                        {activeInstitutions.map((institution) => (
                          <option key={institution.id} value={institution.id}>
                            {institution.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {!editingSeniorId ? (
                    <div className="validation-box">
                      <strong>Clé d’accès générée automatiquement</strong>
                      <span>
                        Le site affichera une clé provisoire XXXX-XXXX une seule
                        fois après la création. Le senior choisira lui-même son
                        e-mail et son mot de passe à sa première connexion.
                      </span>
                    </div>
                  ) : null}

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

        {isAdmin ? (
          <SectionCard
            className="admin-dashboard-card"
            description="Les comptes et leur identité de connexion sont conservés. Une réactivation exige une nouvelle connexion sur chaque appareil."
            title="Comptes désactivés"
          >
            <FeedbackMessage feedback={disabledProfilesFeedback} />
            {isLoadingDisabledProfiles ? (
              <div className="validation-box" role="status">
                <strong>Chargement de l’historique…</strong>
              </div>
            ) : disabledProfilesError ? (
              <div className="auth-error" role="alert">
                {disabledProfilesError}
              </div>
            ) : disabledProfiles.length ? (
              <div className="admin-profile-list">
                {disabledProfiles.map((profile) => (
                  <article
                    className="profile-card profile-card--static admin-profile-card"
                    key={profile.id}
                  >
                    <div className="admin-profile-card__identity">
                      <span className="admin-profile-card__avatar admin-profile-card__avatar--senior">
                        <span className="admin-profile-card__initials">
                          {getProfileInitials(profile)}
                        </span>
                      </span>
                      <div className="admin-profile-card__copy">
                        <div className="profile-card__header">
                          <strong>
                            {formatDisplayName(profile.firstName, profile.lastName)}
                          </strong>
                          <span className="profile-card__badge">
                            {profile.role === 'internal'
                              ? 'Interne'
                              : profile.role === 'senior'
                                ? 'Senior'
                                : 'Administrateur'}
                          </span>
                        </div>
                        <div className="profile-card__meta">
                          <span>
                            Établissement : {profile.institution ?? 'Non renseigné'}
                          </span>
                          <span>
                            Désactivé le{' '}
                            {formatAdminConnectionTimestamp(profile.updatedAt)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="admin-profile-card__actions">
                      {profile.authUserId ? (
                        <button
                          className="mini-button mini-button--secondary"
                          disabled={reactivatingProfileId === profile.id}
                          onClick={() => void handleReactivateProfile(profile)}
                          type="button"
                        >
                          <RotateCcw aria-hidden="true" size={16} />
                          {reactivatingProfileId === profile.id
                            ? 'Réactivation…'
                            : 'Réactiver'}
                        </button>
                      ) : (
                        <span className="profile-card__badge">
                          Identité Auth absente
                        </span>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="validation-box">
                <strong>Aucun compte désactivé</strong>
                <span>Les comptes désactivés apparaîtront ici sans être supprimés.</span>
              </div>
            )}
          </SectionCard>
        ) : null}
      </AdminPageShell>
    );
  }

  if (view === 'interventions') {
    return (
      <AdminPageShell
        backLabel="Retour à l’espace administrateur"
        onBack={() => setView('home')}
        subtitle="Configurer les interventions, leurs voies d’abord et les étapes opératoires évaluables."
        title="Création des interventions"
      >
        <AdminInterventionsManager
          createSurgicalIntervention={createSurgicalIntervention}
          deleteCustomSurgicalIntervention={deleteCustomSurgicalIntervention}
          interventions={surgicalInterventionDefinitions}
          savedInterventions={savedInterventions}
          updateSurgicalIntervention={updateSurgicalIntervention}
        />
      </AdminPageShell>
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
                  aria-pressed={trophyFilter === option.value}
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
              const summaryLabel = trophy.ruleSummary;

              return (
                <article className="admin-trophy-card" key={trophy.id}>
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
                    {trophy.levelObtainedCounts.length ? (
                      <div className="admin-trophy-card__impact-list">
                        {trophy.levelObtainedCounts.map((level) => (
                          <span key={level.tier}>
                            {formatTierObtainedCountLabel(level.label, level.count)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="admin-trophy-card__actions">
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
                    {trophy.status === 'draft' ? (
                      <button
                        className="mini-button mini-button--danger"
                        onClick={() => handleDeleteTrophy(trophy.id)}
                        type="button"
                      >
                        Supprimer le brouillon
                      </button>
                    ) : null}
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
          adminEvaluations,
          customSurgicalInterventions
        )
      : null;
    const previewImage = getTrophyPreviewImage(trophyDraft);
    const previewObtainedCount = countProfilesWithTrophy(
      trophyDraft,
      internalProfiles,
      savedInterventions,
      adminEvaluations,
      customSurgicalInterventions
    );
    const matchingProfiles = internalProfiles
      .filter(
        (profile) =>
          getUnlockedTrophyTierForProfile(
            trophyDraft,
            profile,
            savedInterventions,
            adminEvaluations,
            customSurgicalInterventions
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
            {isSavingTrophy
              ? 'Enregistrement...'
              : trophyDraft.status === 'draft'
                ? 'Enregistrer le brouillon'
                : 'Publier la version'}
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
                    Description courte
                  </span>
                  <input
                    className="field-input"
                    onChange={(event) =>
                      handleTrophyDraftFieldChange('description', event.target.value)
                    }
                    placeholder="Décrivez brièvement ce que récompense ce trophée."
                    type="text"
                    value={trophyDraft.description}
                  />
                  <small className="field-stack__hint">
                    Cette description est obligatoire avant publication.
                  </small>
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
                      {trophyDraft.everActivated ? (
                        <option value="inactive">Inactif</option>
                      ) : null}
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
                            'profile_login_count',
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

  const adminHomeShortcuts = (
    <section className="admin-home-shortcuts" aria-labelledby="admin-home-shortcuts-title">
      <h2 id="admin-home-shortcuts-title">Accès rapides</h2>
      <div className="admin-shortcut-grid admin-shortcut-grid--home">
        <button
          className="admin-shortcut-card admin-shortcut-card--compact"
          onClick={() => setView('trophies')}
          type="button"
        >
          <span className="admin-shortcut-card__icon">
            <Trophy aria-hidden="true" />
          </span>
          <div className="admin-shortcut-card__copy">
            <strong>Catalogue trophées</strong>
          </div>
          <ChevronRight aria-hidden="true" />
        </button>

        <button
          className="admin-shortcut-card admin-shortcut-card--compact"
          onClick={() => setView('history')}
          type="button"
        >
          <span className="admin-shortcut-card__icon admin-shortcut-card__icon--green">
            <FolderOpen aria-hidden="true" />
          </span>
          <div className="admin-shortcut-card__copy">
            <strong>Historique des blocs</strong>
          </div>
          <ChevronRight aria-hidden="true" />
        </button>

        <button
          className="admin-shortcut-card admin-shortcut-card--compact"
          onClick={() => setView('interventions')}
          type="button"
        >
          <span className="admin-shortcut-card__icon admin-shortcut-card__icon--violet">
            <Pencil aria-hidden="true" />
          </span>
          <div className="admin-shortcut-card__copy">
            <strong>Créer les interventions</strong>
          </div>
          <ChevronRight aria-hidden="true" />
        </button>

        <button
          className="admin-shortcut-card admin-shortcut-card--compact"
          onClick={() => setView('profiles')}
          type="button"
        >
          <span className="admin-shortcut-card__icon admin-shortcut-card__icon--amber">
            <Users aria-hidden="true" />
          </span>
          <div className="admin-shortcut-card__copy">
            <strong>Gestion des profils</strong>
          </div>
          <ChevronRight aria-hidden="true" />
        </button>

        <button
          className="admin-shortcut-card admin-shortcut-card--compact"
          onClick={() => setView('institutions')}
          type="button"
        >
          <span className="admin-shortcut-card__icon admin-shortcut-card__icon--green">
            <Building2 aria-hidden="true" />
          </span>
          <div className="admin-shortcut-card__copy">
            <strong>Gestion établissements</strong>
          </div>
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </section>
  );

  if (isSenior && selectedSenior) {
    return (
      <SeniorDashboard
        adminEvaluations={adminEvaluations}
        customSurgicalInterventions={customSurgicalInterventions}
        internalProfiles={internalProfiles}
        onEvaluate={openEvaluationTool}
        onLogout={logout}
        refreshBackendData={refreshBackendData}
        savedInterventions={savedInterventions}
        selectableSeniors={selectableSeniors}
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
        {adminHomeShortcuts}

        <div className="admin-home-dashboard-grid">
          <SectionCard
            className="admin-dashboard-card admin-activity-card admin-home-activity-card"
            description="Évolution des interventions enregistrées et évaluées"
            title="Rapport d’activité"
          >
          <div className="admin-activity-card__toolbar">
            <div className="admin-segmented-control" role="tablist" aria-label="Période">
              {ADMIN_ACTIVITY_RANGE_OPTIONS.map((option) => (
                <button
                  aria-selected={activityRange === option.value}
                  className={`admin-segmented-control__button ${
                    activityRange === option.value
                      ? 'admin-segmented-control__button--active'
                      : ''
                  }`}
                  key={option.value}
                  onClick={() => setActivityRange(option.value)}
                  role="tab"
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
            <div className="admin-home-chart-summary" aria-label="Synthèse de la période">
              <span className="admin-home-chart-summary__item">
                <strong>{activityTotals.totalRecorded}</strong>
                enregistrées
              </span>
              <span className="admin-home-chart-summary__item admin-home-chart-summary__item--navy">
                <strong>{activityTotals.totalEvaluated}</strong>
                évaluées
              </span>
            </div>
          </div>

          {hasActivityChartData ? (
            <>
              <div className="admin-activity-chart-scroll" ref={homeActivityChartScrollRef}>
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
            </>
          ) : (
            <div className="admin-empty-state">
              <BarChart3 aria-hidden="true" />
              <strong>Aucune activité sur la période</strong>
              <span>
                Le graphique apparaitra dès qu'une intervention sera enregistrée ou évaluée.
              </span>
            </div>
          )}

          </SectionCard>

          <SectionCard
          className="admin-dashboard-card admin-home-connections-card"
          headerAction={
            <button
              className="mini-button mini-button--secondary"
              onClick={() => setView('connections')}
              type="button"
            >
              Voir toutes les activités
            </button>
          }
          title="Dernières activités utilisateurs"
        >
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
            <>
              <div className="validation-box">
                <strong>Aucune connexion sur les 48 dernières heures</strong>
                <span>
                  Les connexions internes et seniors récentes apparaîtront ici
                  automatiquement.
                </span>
              </div>
            </>
          )}
            <div className="admin-home-status-grid">
              <article className="admin-home-status-card">
                <span className="admin-home-status-card__icon">
                  <Clock3 aria-hidden="true" />
                </span>
                <div>
                  <strong>{activityTotals.totalPending}</strong>
                  <span>en attente</span>
                  <small>Interventions à évaluer</small>
                </div>
              </article>
              <article className="admin-home-status-card admin-home-status-card--profiles">
                <span className="admin-home-status-card__icon">
                  <Users aria-hidden="true" />
                </span>
                <div>
                  <strong>{activeProfileCount}</strong>
                  <span>profils actifs</span>
                  <small>Internes et seniors</small>
                </div>
              </article>
            </div>
          </SectionCard>
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
                    <span>Identifiant : {profile.loginId}</span>
                    <span>E-mail : {profile.contactEmail ?? 'Non renseigné'}</span>
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
                      onClick={() => handleDeactivateInternalProfile(profile)}
                      type="button"
                    >
                      Désactiver le profil
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
                              Sélectionner pour l’export
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
    </ScreenContainer>
  );
}
