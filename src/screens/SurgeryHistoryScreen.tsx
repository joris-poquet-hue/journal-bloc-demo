import {
  ArrowLeft,
  BarChart3,
  ChartNoAxesCombined,
  ChartNoAxesColumnDecreasing,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Info,
  MoveRight,
  SlidersHorizontal,
  Star,
} from 'lucide-react';
import { CSSProperties, useLayoutEffect, useMemo, useState } from 'react';

import {
  ApproachIcon,
  getInterventionApproachLabel,
} from '../components/ApproachIcon';
import { AutonomyLineChart } from '../components/AutonomyLineChart';
import { ClinicalContextOverview } from '../components/ClinicalContextOverview';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { SectionCard } from '../components/SectionCard';
import {
  formatInterventionCardDate,
  SurgeryInterventionCard,
} from '../components/SurgeryInterventionCard';
import { useAppContext } from '../context/AppContext';
import {
  approachOptions,
  allChecklistSteps,
  formatDisplayName,
  formatSeniorDisplayName,
  formatSurgeryContext,
  getHistoricalChecklistSteps,
  getHistoricalProcedureLabel,
  getChoiceLabel,
  getProcedureLabel,
  indicationOptions,
} from '../data/mockData';
import {
  SENIOR_DIFFICULTY_LABELS,
  SENIOR_DIFFICULTY_RATINGS,
  SENIOR_PERFORMANCE_LABELS,
  SENIOR_PERFORMANCE_RATINGS,
} from '../data/seniorEvaluationLabels';
import {
  AdminInterventionEvaluation,
  ChecklistLevel,
  InterventionType,
  SavedIntervention,
  SurgicalInterventionDefinition,
} from '../types';
import {
  calculateAutonomyScore,
  INSUFFICIENT_KEY_STEP_COVERAGE_MESSAGE,
} from '../utils/autonomyScore';
import { formatIsoDate } from '../utils/date';
import { getAuthoritativeChecklist } from '../utils/evaluationChecklist';
import {
  buildDailyAutonomySeries,
  filterItemsByProgressPeriod,
  PROGRESS_PERIOD_OPTIONS,
  type ProgressPeriod,
} from '../utils/progressStatistics';

type HistoryViewMode = 'calendar' | 'progress';
type ProgressSubTab = 'autonomy' | 'steps';

type ScoredHistoryIntervention = {
  autonomyScore: number | null;
  evaluation?: AdminInterventionEvaluation;
  intervention: SavedIntervention;
  isValidated: boolean;
};

type ProgressInterventionGroup = {
  key: string;
  label: string;
  items: ScoredHistoryIntervention[];
};

type ProgressFilterOption = {
  value: string;
  label: string;
};

type ProgressStepRow = {
  id: string;
  label: string;
  score: number;
};

type ProgressStepTone = 'danger' | 'warning' | 'success';

type ProgressStepGroup = {
  label: string;
  rows: ProgressStepRow[];
  tone: ProgressStepTone;
};

type PreviousFiveScoreEvolution = {
  delta: number;
  trend: 'up' | 'down' | 'stable';
};

function getProgressStepTone(score: number): ProgressStepTone {
  if (score < 50) {
    return 'danger';
  }

  if (score < 75) {
    return 'warning';
  }

  return 'success';
}

function buildProgressStepGroups(rows: ProgressStepRow[]) {
  const groups: Array<Omit<ProgressStepGroup, 'rows'>> = [
    { label: 'À renforcer', tone: 'danger' },
    { label: 'En progression', tone: 'warning' },
    { label: 'Maîtrisé', tone: 'success' },
  ];

  return groups
    .map((group): ProgressStepGroup => ({
      ...group,
      rows: rows.filter((row) => getProgressStepTone(row.score) === group.tone),
    }))
    .filter((group) => group.rows.length > 0);
}

const WEEKDAY_LABELS = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];
const historyDifficultyScaleOptions = SENIOR_DIFFICULTY_RATINGS.map((value) => ({
  label: SENIOR_DIFFICULTY_LABELS[value],
  value,
}));
const historyPerformanceScaleOptions = SENIOR_PERFORMANCE_RATINGS.map((value) => ({
  label: SENIOR_PERFORMANCE_LABELS[value],
  value,
}));

function renderHistoryDifficultyScale(
  difficulty: AdminInterventionEvaluation['categoryDifficulty']
) {
  return (
    <div
      aria-label={
        difficulty
          ? `Difficulté de l’intervention : ${SENIOR_DIFFICULTY_LABELS[difficulty]}`
          : 'Difficulté de l’intervention non renseignée'
      }
      className="history-difficulty-scale"
      role="img"
    >
      {historyDifficultyScaleOptions.map((option) => {
        const isActive = difficulty === option.value;

        return (
          <span
            className={`history-difficulty-scale__item${
              isActive ? ' history-difficulty-scale__item--active' : ''
            }`}
            key={option.value}
          >
            <strong>{option.label}</strong>
            <span aria-hidden="true" className="history-difficulty-scale__stars">
              {Array.from({ length: Number(option.value) }, (_, index) => (
                <Star key={index} />
              ))}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function renderHistoryPerformanceScale(
  performance: AdminInterventionEvaluation['globalPerformance']
) {
  const performanceValue = Number(performance ?? 0);
  const progress = performance ? ((performanceValue - 1) / 4) * 100 : 0;

  return (
    <div
      aria-label={
        performance
          ? `Performance de l’interne : ${SENIOR_PERFORMANCE_LABELS[performance]}`
          : 'Performance de l’interne non renseignée'
      }
      className={`history-performance-scale${
        performance ? '' : ' history-performance-scale--empty'
      }`}
      role="img"
      style={
        {
          '--history-performance-progress': `${progress}%`,
        } as CSSProperties
      }
    >
      <span aria-hidden="true" className="history-performance-scale__track">
        <span />
      </span>
      <span className="history-performance-scale__points">
        {historyPerformanceScaleOptions.map((option) => {
          const optionValue = Number(option.value);
          const isActive = performance === option.value;
          const isComplete = performanceValue >= optionValue;

          return (
            <span
              className={`history-performance-scale__point${
                isComplete ? ' history-performance-scale__point--complete' : ''
              }${isActive ? ' history-performance-scale__point--active' : ''}`}
              key={option.value}
            >
              <span aria-hidden="true" className="history-performance-scale__dot">
                {option.value}
              </span>
              <span>{option.label}</span>
            </span>
          );
        })}
      </span>
    </div>
  );
}

function renderHistoryWebRatingScale(
  value: string | null | undefined,
  maximum: number,
  ariaLabel: string
) {
  const numericValue = Number(value ?? 0);

  return (
    <span
      aria-label={ariaLabel}
      className="history-web-rating-scale"
      role="img"
    >
      {Array.from({ length: maximum }, (_, index) => (
        <span
          className={
            numericValue >= index + 1
              ? 'history-web-rating-scale__segment history-web-rating-scale__segment--active'
              : 'history-web-rating-scale__segment'
          }
          key={index}
        />
      ))}
    </span>
  );
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getTodayIsoDate() {
  return toIsoDate(new Date());
}

function getMonthTitle(date: Date) {
  return new Intl.DateTimeFormat('fr-FR', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function getDayTitle(value: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parseIsoDate(value));
}

function getInterventionTime(intervention: SavedIntervention) {
  if (intervention.startTime) {
    return intervention.startTime.slice(0, 5);
  }

  const date = new Date(intervention.savedAt);

  if (Number.isNaN(date.getTime())) {
    return 'Heure non renseignée';
  }

  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getInterventionSortValue(intervention: SavedIntervention) {
  if (intervention.startTime) {
    const interventionTime = new Date(
      `${intervention.date}T${intervention.startTime}`
    ).getTime();

    if (!Number.isNaN(interventionTime)) {
      return interventionTime;
    }
  }

  const savedAtTime = new Date(intervention.savedAt).getTime();
  const fallbackTime = parseIsoDate(intervention.date).getTime();

  return Number.isNaN(savedAtTime) ? fallbackTime : savedAtTime;
}

function compareInterventionsChronologically(
  left: SavedIntervention,
  right: SavedIntervention
) {
  const dateComparison = left.date.localeCompare(right.date);

  if (dateComparison !== 0) {
    return dateComparison;
  }

  return getInterventionSortValue(left) - getInterventionSortValue(right);
}

function hasCompleteSeniorEvaluation(
  evaluation: AdminInterventionEvaluation | undefined
) {
  return Boolean(evaluation?.globalPerformance && evaluation.categoryDifficulty);
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

  return getChoiceLabel(indicationOptions, intervention.indication, 'Non renseignée');
}

function getInterventionIndicationComparisonKey(intervention: SavedIntervention) {
  if (intervention.customIndication?.trim()) {
    return `custom:${intervention.customIndication
      .trim()
      .toLocaleLowerCase('fr-FR')}`;
  }

  if (
    intervention.indication === 'autre' &&
    intervention.indicationComment.trim()
  ) {
    return `other:${intervention.indicationComment
      .trim()
      .toLocaleLowerCase('fr-FR')}`;
  }

  return `preset:${intervention.indication ?? 'non-renseignee'}`;
}

function getCalendarDays(monthDate: Date) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(
    monthDate.getFullYear(),
    monthDate.getMonth() + 1,
    0
  ).getDate();
  const visibleDayCount = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;
  const calendarStart = new Date(firstDay);
  calendarStart.setDate(firstDay.getDate() - mondayOffset);

  return Array.from({ length: visibleDayCount }, (_, index) => {
    const date = new Date(calendarStart);
    date.setDate(calendarStart.getDate() + index);

    return date;
  });
}

function buildInterventionsByDate(interventions: ScoredHistoryIntervention[]) {
  return interventions.reduce<Map<string, ScoredHistoryIntervention[]>>(
    (dateMap, intervention) => {
      const current = dateMap.get(intervention.intervention.date) ?? [];
      current.push(intervention);
      dateMap.set(intervention.intervention.date, current);

      return dateMap;
    },
    new Map()
  );
}

function getFirstInterventionDateInMonth(
  interventionsByDate: Map<string, ScoredHistoryIntervention[]>,
  monthDate: Date
) {
  const monthPrefix = `${monthDate.getFullYear()}-${`${
    monthDate.getMonth() + 1
  }`.padStart(2, '0')}`;

  return Array.from(interventionsByDate.keys())
    .filter((date) => date.startsWith(monthPrefix))
    .sort()[0];
}

function getPreviousFiveScoreEvolution(
  scoredInterventions: ScoredHistoryIntervention[],
  selectedIntervention: ScoredHistoryIntervention
): PreviousFiveScoreEvolution | null {
  if (selectedIntervention.autonomyScore == null) {
    return null;
  }

  const selectedProcedure = selectedIntervention.intervention.procedure;
  const selectedIndicationKey = getInterventionIndicationComparisonKey(
    selectedIntervention.intervention
  );
  const validatedInterventions = scoredInterventions
    .filter(
      (item) =>
        item.isValidated &&
        item.autonomyScore != null &&
        item.intervention.procedure === selectedProcedure &&
        getInterventionIndicationComparisonKey(item.intervention) ===
          selectedIndicationKey
    )
    .sort(
      (left, right) =>
        compareInterventionsChronologically(
          left.intervention,
          right.intervention
        )
    );
  const selectedIndex = validatedInterventions.findIndex(
    (item) => item.intervention.id === selectedIntervention.intervention.id
  );

  if (selectedIndex < 5) {
    return null;
  }

  const previousScores = validatedInterventions
    .slice(selectedIndex - 5, selectedIndex)
    .map((item) => item.autonomyScore)
    .filter((score): score is number => score != null);

  if (previousScores.length !== 5) {
    return null;
  }

  const previousAverage =
    previousScores.reduce((total, score) => total + score, 0) /
    previousScores.length;
  const delta = Math.round(selectedIntervention.autonomyScore - previousAverage);

  return {
    delta,
    trend: delta > 0 ? 'up' : delta < 0 ? 'down' : 'stable',
  };
}

function getScoreEvolutionTitle(trend: PreviousFiveScoreEvolution['trend']) {
  if (trend === 'up') {
    return 'Votre progression est positive';
  }

  if (trend === 'down') {
    return 'Votre progression est en baisse';
  }

  return 'Votre progression est stable';
}

function getScoreEvolutionDescription(evolution: PreviousFiveScoreEvolution) {
  if (evolution.trend === 'stable') {
    return 'Aucune variation sur vos 5 dernières interventions.';
  }

  const absoluteDelta = Math.abs(evolution.delta);
  const pointLabel = absoluteDelta > 1 ? 'points' : 'point';
  const prefix = evolution.trend === 'up' ? '+' : '−';

  return `${prefix}${absoluteDelta} ${pointLabel} sur vos 5 dernières interventions.`;
}

function getScoreEvolutionAccessibleLabel(trend: PreviousFiveScoreEvolution['trend']) {
  if (trend === 'up') {
    return 'Autonomie en progression';
  }

  if (trend === 'down') {
    return 'Autonomie en diminution';
  }

  return 'Autonomie stable';
}

function buildProgressProcedureOptions(
  scoredInterventions: ScoredHistoryIntervention[],
  customSurgicalInterventions: SurgicalInterventionDefinition[]
) {
  const optionMap = new Map<string, ProgressFilterOption>();

  scoredInterventions.forEach((item) => {
    if (!item.isValidated || item.autonomyScore == null) {
      return;
    }

    const value = item.intervention.procedure;
    optionMap.set(value, {
      value,
      label: getProcedureLabel(value, customSurgicalInterventions),
    });
  });

  return Array.from(optionMap.values()).sort((left, right) =>
    left.label.localeCompare(right.label, 'fr-FR')
  );
}

function buildProgressIndicationOptions(items: ScoredHistoryIntervention[]) {
  const optionMap = new Map<string, ProgressFilterOption>();

  items.forEach((item) => {
    const value = getInterventionIndicationComparisonKey(item.intervention);
    optionMap.set(value, {
      value,
      label: getInterventionIndicationLabel(item.intervention),
    });
  });

  return Array.from(optionMap.values()).sort((left, right) =>
    left.label.localeCompare(right.label, 'fr-FR')
  );
}

function getProgressApproachKey(intervention: SavedIntervention) {
  return intervention.approach
    ? `preset:${intervention.approach}`
    : `label:${getInterventionApproachLabel(intervention).toLocaleLowerCase('fr-FR')}`;
}

function buildProgressApproachOptions(items: ScoredHistoryIntervention[]) {
  const optionMap = new Map<string, ProgressFilterOption>();

  items.forEach((item) => {
    const value = getProgressApproachKey(item.intervention);
    optionMap.set(value, {
      value,
      label: item.intervention.approach
        ? getChoiceLabel(
            approachOptions,
            item.intervention.approach,
            getInterventionApproachLabel(item.intervention)
          )
        : getInterventionApproachLabel(item.intervention),
    });
  });

  return Array.from(optionMap.values()).sort((left, right) =>
    left.label.localeCompare(right.label, 'fr-FR')
  );
}

function getChronologicalItems(group: ProgressInterventionGroup | null) {
  return group
    ? group.items
        .slice()
        .sort((left, right) =>
          compareInterventionsChronologically(
            left.intervention,
            right.intervention
          )
        )
    : [];
}

function buildAutonomySeries(group: ProgressInterventionGroup | null) {
  return buildDailyAutonomySeries(
    getChronologicalItems(group),
    (item) => item.intervention.date,
    (item) => item.autonomyScore
  );
}

function getChecklistLevelScore(level: ChecklistLevel | null | undefined) {
  if (!level || level === 'NA') {
    return null;
  }

  return (Number(level) / 4) * 100;
}

function getChecklistLevelTone(level: ChecklistLevel) {
  if (level === 'NA') {
    return 'na';
  }

  return `level-${level}`;
}

const HISTORY_WEB_CHECKLIST_LEVELS = ['0', '1', '2', '3', '4'] as const;

function renderHistoryWebChecklistScale(level: ChecklistLevel) {
  if (level === 'NA') {
    return <strong className="history-web-step-na">NA</strong>;
  }

  return (
    <span
      aria-label={`Niveau d’autonomie ${level} sur 4`}
      className="history-web-step-scale"
      role="img"
    >
      {HISTORY_WEB_CHECKLIST_LEVELS.map((candidate) => (
        <span
          className={`history-web-step-scale__dot history-web-step-scale__dot--level-${candidate}${
            candidate === level
              ? ' history-web-step-scale__dot--selected'
              : ''
          }`}
          key={candidate}
        />
      ))}
    </span>
  );
}

function buildStepRows(
  group: ProgressInterventionGroup | null,
  customSurgicalInterventions: SurgicalInterventionDefinition[]
) {
  const recentItems = getChronologicalItems(group).slice(-5);
  const stepScores = new Map<string, { label: string; scoreTotal: number; count: number }>();
  const knownStepLabels = new Map(
    [
      ...allChecklistSteps,
      ...customSurgicalInterventions.flatMap(
        (intervention) => intervention.checklistSteps
      ),
    ].map((step) => [step.id, step.label])
  );

  recentItems.forEach((item) => {
    const intervention = item.intervention;
    const checklist = getAuthoritativeChecklist(intervention, item.evaluation);
    const definedSteps = getHistoricalChecklistSteps(
      intervention,
      customSurgicalInterventions
    );
    const stepsById = new Map(definedSteps.map((step) => [step.id, step]));

    Object.keys(checklist).forEach((stepId) => {
      if (!stepsById.has(stepId)) {
        stepsById.set(stepId, {
          id: stepId,
          label: knownStepLabels.get(stepId) ?? stepId,
        });
      }
    });

    Array.from(stepsById.values()).forEach((step) => {
      const score = getChecklistLevelScore(checklist[step.id]);

      if (score == null) {
        return;
      }

      const current = stepScores.get(step.id) ?? {
        label: step.label,
        scoreTotal: 0,
        count: 0,
      };
      current.scoreTotal += score;
      current.count += 1;
      stepScores.set(step.id, current);
    });
  });

  const rows = Array.from(stepScores.entries()).map(([id, item]) => ({
    id,
    label: item.label,
    score: Math.round(item.scoreTotal / item.count),
  }));

  if (!rows.length) {
    return [];
  }

  return rows;
}

function buildDetailChecklistRows(
  intervention: SavedIntervention,
  customSurgicalInterventions: SurgicalInterventionDefinition[],
  evaluation?: AdminInterventionEvaluation
) {
  const checklist = getAuthoritativeChecklist(intervention, evaluation);
  const knownStepLabels = new Map(
    [
      ...allChecklistSteps,
      ...customSurgicalInterventions.flatMap(
        (customIntervention) => customIntervention.checklistSteps
      ),
    ].map((step) => [step.id, step.label])
  );
  const definedSteps = getHistoricalChecklistSteps(
    intervention,
    customSurgicalInterventions
  );
  const stepsById = new Map(definedSteps.map((step) => [step.id, step.label]));

  Object.keys(checklist).forEach((stepId) => {
    if (!stepsById.has(stepId) && checklist[stepId] != null) {
      stepsById.set(stepId, knownStepLabels.get(stepId) ?? stepId);
    }
  });

  const rows = Array.from(stepsById.entries()).map(([id, label]) => ({
    id,
    label,
    level: checklist[id] ?? 'NA',
  }));
  const rowsByLabel = new Map<
    string,
    { id: string; label: string; level: ChecklistLevel }
  >();

  rows.forEach((row) => {
    const labelKey = row.label.trim().toLocaleLowerCase('fr-FR');
    const current = rowsByLabel.get(labelKey);

    if (!current) {
      rowsByLabel.set(labelKey, row);
      return;
    }

    if (current.level === 'NA' && row.level !== 'NA') {
      rowsByLabel.set(labelKey, row);
      return;
    }

    if (
      current.level !== 'NA' &&
      row.level !== 'NA' &&
      Number(row.level) > Number(current.level)
    ) {
      rowsByLabel.set(labelKey, row);
    }
  });

  return Array.from(rowsByLabel.values());
}

export function SurgeryHistoryScreen() {
  const {
    adminEvaluations,
    clearHistoryNavigationDate,
    customSurgicalInterventions,
    historyNavigationDate,
    historyNavigationInterventionId,
    historyNavigationView,
    selectedInternal,
    savedInterventions,
    selectableSeniors,
    goToSurgeryPortal,
  } = useAppContext();
  const isNativeApp =
    typeof window !== 'undefined' &&
    (Boolean(
      (window as Window & { __MONJDB_NATIVE_APP__?: boolean })
        .__MONJDB_NATIVE_APP__
    ) ||
      new URLSearchParams(window.location.search).get('native-app') === '1' ||
      window.navigator.userAgent.includes('MonJournalDeBlocMobile'));
  const [viewMode, setViewMode] = useState<HistoryViewMode>(
    historyNavigationView ?? 'calendar'
  );
  const [progressSubTab, setProgressSubTab] =
    useState<ProgressSubTab>('autonomy');
  const [selectedProgressProcedure, setSelectedProgressProcedure] = useState('');
  const [selectedProgressIndication, setSelectedProgressIndication] =
    useState('all');
  const [selectedProgressApproach, setSelectedProgressApproach] =
    useState('all');
  const [progressPeriod, setProgressPeriod] = useState<ProgressPeriod>('12m');
  const [selectedDetailId, setSelectedDetailId] = useState<string | null>(null);

  const internalInterventions = useMemo(
    () =>
      selectedInternal
        ? savedInterventions.filter(
            (intervention) => intervention.internalId === selectedInternal.id
          )
        : [],
    [savedInterventions, selectedInternal]
  );
  const latestInterventionDate =
    [...internalInterventions].sort((left, right) =>
      right.date.localeCompare(left.date)
    )[0]?.date ?? getTodayIsoDate();
  const [selectedDate, setSelectedDate] = useState(latestInterventionDate);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const date = parseIsoDate(latestInterventionDate);

    return new Date(date.getFullYear(), date.getMonth(), 1);
  });

  useLayoutEffect(() => {
    if (
      !historyNavigationDate &&
      !historyNavigationView &&
      !historyNavigationInterventionId
    ) {
      return;
    }

    if (historyNavigationView) {
      setViewMode(historyNavigationView);
      setSelectedDetailId(historyNavigationInterventionId);
    }

    if (historyNavigationDate) {
      const targetDate = parseIsoDate(historyNavigationDate);

      setSelectedDetailId(historyNavigationInterventionId);
      setSelectedDate(historyNavigationDate);
      setVisibleMonth(new Date(targetDate.getFullYear(), targetDate.getMonth(), 1));
    }

    if (historyNavigationView === 'calendar' && !historyNavigationDate) {
      setSelectedDetailId(historyNavigationInterventionId);
    }

    if (historyNavigationInterventionId) {
      setSelectedDetailId(historyNavigationInterventionId);
    }

    clearHistoryNavigationDate();
  }, [
    clearHistoryNavigationDate,
    historyNavigationDate,
    historyNavigationInterventionId,
    historyNavigationView,
  ]);

  const scoredInterventions = useMemo<ScoredHistoryIntervention[]>(
    () =>
      internalInterventions
        .map((intervention) => {
          const evaluation = adminEvaluations[intervention.id];
          const isValidated = hasCompleteSeniorEvaluation(evaluation);

          return {
            evaluation,
            intervention,
            isValidated,
            autonomyScore: isValidated
              ? calculateAutonomyScore(
                  intervention,
                  customSurgicalInterventions,
                  evaluation
                )
              : null,
          };
        })
        .sort(
          (left, right) =>
            getInterventionSortValue(right.intervention) -
            getInterventionSortValue(left.intervention)
        ),
    [adminEvaluations, customSurgicalInterventions, internalInterventions]
  );
  const interventionsByDate = useMemo(
    () => buildInterventionsByDate(scoredInterventions),
    [scoredInterventions]
  );
  const selectedDayInterventions = (interventionsByDate.get(selectedDate) ?? [])
    .slice()
    .sort(
      (left, right) =>
        getInterventionSortValue(left.intervention) -
        getInterventionSortValue(right.intervention)
    );
  const calendarDays = getCalendarDays(visibleMonth);
  const selectedDetail = selectedDetailId
    ? scoredInterventions.find((item) => item.intervention.id === selectedDetailId)
    : null;
  const selectedDetailEvaluation = selectedDetail
    ? adminEvaluations[selectedDetail.intervention.id]
    : undefined;
  const selectedDetailSeniorComment =
    selectedDetailEvaluation?.seniorComment.trim() ?? '';
  const selectedDetailSenior = selectedDetail
    ? selectableSeniors.find(
        (senior) => senior.id === selectedDetail.intervention.seniorId
      ) ?? null
    : null;
  const selectedDetailChecklistRows = selectedDetail
      ? buildDetailChecklistRows(
        selectedDetail.intervention,
        customSurgicalInterventions,
        selectedDetailEvaluation
      )
    : [];
  const selectedDetailEvolution = selectedDetail
    ? getPreviousFiveScoreEvolution(scoredInterventions, selectedDetail)
    : null;
  const progressProcedureOptions = useMemo(
    () =>
      buildProgressProcedureOptions(
        scoredInterventions,
        customSurgicalInterventions
      ),
    [customSurgicalInterventions, scoredInterventions]
  );
  const activeProgressProcedure = progressProcedureOptions.some(
    (option) => option.value === selectedProgressProcedure
  )
    ? selectedProgressProcedure
    : progressProcedureOptions[0]?.value ?? '';
  const progressProcedureItems = useMemo(
    () =>
      scoredInterventions.filter(
        (item) =>
          item.isValidated &&
          item.autonomyScore != null &&
          item.intervention.procedure === activeProgressProcedure
      ),
    [activeProgressProcedure, scoredInterventions]
  );
  const progressIndicationOptions = useMemo(
    () => buildProgressIndicationOptions(progressProcedureItems),
    [progressProcedureItems]
  );
  const activeProgressIndication =
    selectedProgressIndication === 'all' ||
    progressIndicationOptions.some(
      (option) => option.value === selectedProgressIndication
    )
      ? selectedProgressIndication
      : 'all';
  const progressIndicationItems = useMemo(
    () =>
      activeProgressIndication === 'all'
        ? progressProcedureItems
        : progressProcedureItems.filter(
            (item) =>
              getInterventionIndicationComparisonKey(item.intervention) ===
              activeProgressIndication
          ),
    [activeProgressIndication, progressProcedureItems]
  );
  const progressApproachOptions = useMemo(
    () => buildProgressApproachOptions(progressIndicationItems),
    [progressIndicationItems]
  );
  const activeProgressApproach =
    selectedProgressApproach === 'all' ||
    progressApproachOptions.some(
      (option) => option.value === selectedProgressApproach
    )
      ? selectedProgressApproach
      : 'all';
  const selectedProgressGroup = useMemo<ProgressInterventionGroup | null>(() => {
    if (!activeProgressProcedure) {
      return null;
    }

    const matchingItems =
      activeProgressApproach === 'all'
        ? progressIndicationItems
        : progressIndicationItems.filter(
            (item) =>
              getProgressApproachKey(item.intervention) === activeProgressApproach
          );
    const items = filterItemsByProgressPeriod(
      matchingItems,
      progressPeriod,
      (item) => item.intervention.date
    );

    return {
      key: `${activeProgressProcedure}:${activeProgressIndication}:${activeProgressApproach}:${progressPeriod}`,
      label:
        progressProcedureOptions.find(
          (option) => option.value === activeProgressProcedure
        )?.label ?? '',
      items,
    };
  }, [
    activeProgressApproach,
    activeProgressIndication,
    activeProgressProcedure,
    progressIndicationItems,
    progressPeriod,
    progressProcedureOptions,
  ]);
  const autonomySeries = useMemo(
    () => buildAutonomySeries(selectedProgressGroup),
    [selectedProgressGroup]
  );
  const stepRows = useMemo(
    () => buildStepRows(selectedProgressGroup, customSurgicalInterventions),
    [customSurgicalInterventions, selectedProgressGroup]
  );
  const stepGroups = useMemo(() => buildProgressStepGroups(stepRows), [stepRows]);
  function getSeniorLabel(intervention: SavedIntervention) {
    const senior = selectableSeniors.find(
      (seniorItem) => seniorItem.id === intervention.seniorId
    );

    return senior ? formatSeniorDisplayName(senior) : 'Senior non renseigné';
  }

  function moveVisibleMonth(offset: number) {
    setVisibleMonth((currentMonth) => {
      const nextMonth = new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth() + offset,
        1
      );
      setSelectedDate(
        getFirstInterventionDateInMonth(interventionsByDate, nextMonth) ??
          toIsoDate(nextMonth)
      );

      return nextMonth;
    });
  }

  function openInterventionDetail(intervention: ScoredHistoryIntervention) {
    if (!intervention.isValidated) {
      return;
    }

    setSelectedDetailId(intervention.intervention.id);
  }

  const autonomyPanel = (
    <SectionCard
      className={
        isNativeApp
          ? 'progress-chart-card'
          : 'progress-chart-card internal-progress-comparison__panel internal-progress-comparison__autonomy'
      }
      headerAction={
        isNativeApp ? undefined : (
          <span
            aria-hidden="true"
            className="internal-progress-comparison__heading-icon"
          >
            <BarChart3 />
          </span>
        )
      }
      title={isNativeApp ? undefined : 'Évolution autonomie'}
    >
      {autonomySeries.length ? (
        <AutonomyLineChart
          ariaLabel="Évolution du score d’autonomie"
          series={autonomySeries}
        />
      ) : (
        <p className="field-helper">
          Aucun score disponible pour cette sélection et cette période.
        </p>
      )}
    </SectionCard>
  );

  const stepsPanel = (
    <SectionCard
      className={
        isNativeApp
          ? 'progress-steps-card'
          : 'progress-steps-card internal-progress-comparison__panel internal-progress-comparison__steps'
      }
      description="Maîtrise des étapes sur vos 5 dernières interventions."
      headerAction={
        isNativeApp ? undefined : (
          <span
            aria-hidden="true"
            className="internal-progress-comparison__heading-icon"
          >
            <Clock3 />
          </span>
        )
      }
      title="Analyse par temps opératoire"
    >
      <div className="progress-steps-list">
        {stepGroups.length ? (
          stepGroups.map((group) => (
            <section
              className={`progress-step-group progress-step-group--${group.tone}`}
              key={group.tone}
            >
              <h3>
                {group.label} <span aria-hidden="true">·</span>{' '}
                {group.rows.length}
              </h3>
              <div className="progress-step-group__rows">
                {group.rows.map((row) => (
                  <div className="progress-step-row" key={row.id}>
                    <span>{row.label}</span>
                    <strong>{row.score}%</strong>
                  </div>
                ))}
              </div>
            </section>
          ))
        ) : (
          <p className="field-helper">
            Aucun temps opératoire évalué pour cette sélection.
          </p>
        )}
      </div>
    </SectionCard>
  );

  if (!selectedInternal) {
    return (
      <ScreenContainer
        eyebrow="Progression"
        title="Historique des blocs"
        subtitle="Retourne au portail chirurgie pour reprendre la session."
      >
        <PrimaryButton label="Retour au portail chirurgie" onPress={goToSurgeryPortal} />
      </ScreenContainer>
    );
  }

  if (selectedDetail && selectedDetail.isValidated) {
    return (
      <ScreenContainer
        heroTop={
          <button
            className="history-back-button"
            onClick={() => setSelectedDetailId(null)}
            type="button"
          >
            <ArrowLeft aria-hidden="true" />
            <span>Retour</span>
          </button>
        }
        title="Détail de l’intervention"
      >
        {isNativeApp ? (
          <>
            <SectionCard className="history-detail-card">
          <div className="history-detail-card__header">
            <ApproachIcon intervention={selectedDetail.intervention} />
            <div className="history-detail-card__summary">
              <span className="history-detail-card__date">
                {formatIsoDate(selectedDetail.intervention.date)} ·{' '}
                {getInterventionTime(selectedDetail.intervention)}
              </span>
              <h2>
                {getHistoricalProcedureLabel(
                  selectedDetail.intervention,
                  customSurgicalInterventions
                )}
              </h2>
              <span className="history-detail-card__senior">
                {selectedDetailSenior
                  ? formatSeniorDisplayName(selectedDetailSenior)
                  : 'Senior non renseigné'}
              </span>
            </div>
          </div>

          <div className="history-detail-grid">
            <div className="history-detail-row">
              <span>Indication</span>
              <strong>{getInterventionIndicationLabel(selectedDetail.intervention)}</strong>
            </div>
            <div className="history-detail-row">
              <span>Voie d’abord</span>
              <strong>
                {selectedDetail.intervention.approach
                  ? getChoiceLabel(approachOptions, selectedDetail.intervention.approach)
                  : getInterventionApproachLabel(selectedDetail.intervention)}
              </strong>
            </div>
          </div>
        </SectionCard>

        <SectionCard
          className="history-autonomy-section"
          title="Score d’autonomie opératoire"
        >
          <div className="history-autonomy-section__summary">
            {selectedDetail.autonomyScore == null ? (
              <p className="history-score-unavailable">
                {INSUFFICIENT_KEY_STEP_COVERAGE_MESSAGE}
              </p>
            ) : (
              <div className="history-score-card">
                <div
                  aria-label={`Score d’autonomie ${Math.round(
                    selectedDetail.autonomyScore
                  )} pour cent`}
                  className="history-score-gauge history-score-gauge--coral"
                  role="img"
                  style={
                    {
                      '--history-score': `${selectedDetail.autonomyScore}%`,
                    } as CSSProperties
                  }
                >
                  <span>{Math.round(selectedDetail.autonomyScore)}%</span>
                </div>
                <div className="history-score-card__copy">
                  {selectedDetailEvolution != null ? (
                    <div
                      className={`history-score-trend history-score-trend--${selectedDetailEvolution.trend}`}
                    >
                      <span
                        aria-label={getScoreEvolutionAccessibleLabel(
                          selectedDetailEvolution.trend
                        )}
                        className="history-score-trend__icon"
                        role="img"
                      >
                        {selectedDetailEvolution.trend === 'up' ? (
                          <ChartNoAxesCombined aria-hidden="true" />
                        ) : selectedDetailEvolution.trend === 'down' ? (
                          <ChartNoAxesColumnDecreasing aria-hidden="true" />
                        ) : (
                          <MoveRight aria-hidden="true" />
                        )}
                      </span>
                      <div className="history-score-trend__copy">
                        <strong>
                          {getScoreEvolutionTitle(selectedDetailEvolution.trend)}
                        </strong>
                        <p>{getScoreEvolutionDescription(selectedDetailEvolution)}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="history-score-trend history-score-trend--empty">
                      <span
                        aria-label="Progression indisponible"
                        className="history-score-trend__icon"
                        role="img"
                      >
                        <ChartNoAxesCombined aria-hidden="true" />
                      </span>
                      <div className="history-score-trend__copy">
                        <strong>Votre progression n’est pas encore disponible</strong>
                        <p>Elle apparaîtra après 5 interventions similaires.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="history-score-evaluation">
            <div className="history-score-evaluation__group">
              <span className="history-score-evaluation__label">
                Difficulté de l’intervention
              </span>
              {renderHistoryDifficultyScale(
                selectedDetailEvaluation?.categoryDifficulty ?? null
              )}
            </div>
            <div className="history-score-evaluation__group">
              <span className="history-score-evaluation__label">
                Performance de l’interne
              </span>
              {renderHistoryPerformanceScale(
                selectedDetailEvaluation?.globalPerformance ?? null
              )}
            </div>
            {selectedDetailSeniorComment ? (
              <div className="history-score-evaluation__comment">
                <span>Commentaire du senior</span>
                <p>{selectedDetailSeniorComment}</p>
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="Auto-évaluation de l’interne">
          <div className="history-step-list">
            {selectedDetailChecklistRows.map((step) => {
              return (
                <div className="history-step-row" key={step.id}>
                  <span>{step.label}</span>
                  <strong
                    className={`history-step-pill history-step-pill--${getChecklistLevelTone(
                      step.level
                    )}`}
                  >
                    {step.level}
                  </strong>
                </div>
              );
            })}
          </div>
            </SectionCard>
          </>
        ) : (
          <>
            <SectionCard className="history-web-detail-hero">
              <div className="history-web-detail-hero__main">
                <ApproachIcon intervention={selectedDetail.intervention} />
                <div className="history-web-detail-hero__copy">
                  <h2>
                    {getHistoricalProcedureLabel(
                      selectedDetail.intervention,
                      customSurgicalInterventions
                    )}
                  </h2>
                  <div className="history-web-detail-hero__metadata">
                    <span>
                      {formatIsoDate(selectedDetail.intervention.date)}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{getInterventionTime(selectedDetail.intervention)}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {selectedDetailSenior
                        ? formatSeniorDisplayName(selectedDetailSenior)
                        : 'Senior non renseigné'}
                    </span>
                  </div>
                </div>
                <span
                  aria-label={`Cadre de l’intervention : ${formatSurgeryContext(
                    selectedDetail.intervention.context
                  )}`}
                  className={`surgery-context-badge surgery-context-badge--${
                    selectedDetail.intervention.context ?? 'unknown'
                  } history-web-detail-hero__status`}
                >
                  {formatSurgeryContext(selectedDetail.intervention.context)}
                </span>
              </div>

              <div className="history-web-detail-hero__facts">
                <div>
                  <span>Indication</span>
                  <strong>
                    {getInterventionIndicationLabel(
                      selectedDetail.intervention
                    )}
                  </strong>
                </div>
                <div>
                  <span>Voie d’abord</span>
                  <strong>
                    {selectedDetail.intervention.approach
                      ? getChoiceLabel(
                          approachOptions,
                          selectedDetail.intervention.approach
                        )
                      : getInterventionApproachLabel(
                          selectedDetail.intervention
                        )}
                  </strong>
                </div>
              </div>

              <ClinicalContextOverview
                className="history-web-detail-hero__clinical-context"
                intervention={selectedDetail.intervention}
              />
            </SectionCard>

            <SectionCard className="history-web-score-banner">
              <div className="history-web-score-banner__layout">
                <div className="history-web-score-banner__score">
                  {selectedDetail.autonomyScore == null ? (
                    <>
                      <strong>—</strong>
                      <span>{INSUFFICIENT_KEY_STEP_COVERAGE_MESSAGE}</span>
                    </>
                  ) : (
                    <>
                      <strong>
                        {Math.round(selectedDetail.autonomyScore)}%
                      </strong>
                      <span>Score d’autonomie</span>
                    </>
                  )}
                </div>

                <div className="history-web-score-banner__assessments">
                  <div className="history-web-score-banner__assessment">
                    <span>Performance de l’interne</span>
                    <strong>
                      {selectedDetailEvaluation?.globalPerformance
                        ? `${SENIOR_PERFORMANCE_LABELS[
                            selectedDetailEvaluation.globalPerformance
                          ]} · ${selectedDetailEvaluation.globalPerformance}/5`
                        : 'Non renseignée'}
                    </strong>
                    {renderHistoryWebRatingScale(
                      selectedDetailEvaluation?.globalPerformance,
                      5,
                      selectedDetailEvaluation?.globalPerformance
                        ? `Performance de l’interne ${selectedDetailEvaluation.globalPerformance} sur 5`
                        : 'Performance de l’interne non renseignée'
                    )}
                  </div>

                  <div className="history-web-score-banner__assessment">
                    <span>Difficulté de l’intervention</span>
                    <strong>
                      {selectedDetailEvaluation?.categoryDifficulty
                        ? `${SENIOR_DIFFICULTY_LABELS[
                            selectedDetailEvaluation.categoryDifficulty
                          ]} · ${selectedDetailEvaluation.categoryDifficulty}/3`
                        : 'Non renseignée'}
                    </strong>
                    {renderHistoryWebRatingScale(
                      selectedDetailEvaluation?.categoryDifficulty,
                      3,
                      selectedDetailEvaluation?.categoryDifficulty
                        ? `Difficulté de l’intervention ${selectedDetailEvaluation.categoryDifficulty} sur 3`
                        : 'Difficulté de l’intervention non renseignée'
                    )}
                  </div>
                </div>
              </div>

              {selectedDetailSeniorComment ? (
                <div className="history-web-score-banner__comment">
                  <span>Commentaire du senior</span>
                  <p>{selectedDetailSeniorComment}</p>
                </div>
              ) : null}
            </SectionCard>

            <SectionCard className="history-web-steps-card">
              <div className="history-web-steps-card__heading">
                <div>
                  <h2>Autonomie par temps opératoire</h2>
                </div>
                <span>
                  {selectedDetailChecklistRows.length}/
                  {selectedDetailChecklistRows.length}
                </span>
              </div>

              <div className="history-web-steps-list">
                {selectedDetailChecklistRows.map((step) => (
                  <div className="history-web-step-row" key={step.id}>
                    <span>{step.label}</span>
                    {renderHistoryWebChecklistScale(step.level)}
                  </div>
                ))}
              </div>
            </SectionCard>
          </>
        )}
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
      frameWidth="wide"
      shellClassName={
        viewMode === 'progress' ? 'progression-screen' : 'history-screen'
      }
      title={viewMode === 'calendar' ? 'Historique des blocs' : 'Ma progression'}
    >
      <div className="history-view-switch" aria-label="Mode d’affichage">
        <button
          className={viewMode === 'calendar' ? 'history-view-switch__item--active' : ''}
          onClick={() => setViewMode('calendar')}
          type="button"
        >
          Calendrier
        </button>
        <button
          className={viewMode === 'progress' ? 'history-view-switch__item--active' : ''}
          onClick={() => setViewMode('progress')}
          type="button"
        >
          Progression
        </button>
      </div>

      {viewMode === 'calendar' ? (
        <div className="history-web-calendar-layout">
          <SectionCard className="history-calendar-card">
            <div className="history-calendar__header">
              <button
                aria-label="Mois précédent"
                onClick={() => moveVisibleMonth(-1)}
                type="button"
              >
                <ChevronLeft aria-hidden="true" />
              </button>
              <div className="history-calendar__month">
                <h2>{getMonthTitle(visibleMonth)}</h2>
              </div>
              <button
                aria-label="Mois suivant"
                onClick={() => moveVisibleMonth(1)}
                type="button"
              >
                <ChevronRight aria-hidden="true" />
              </button>
            </div>

            <div className="history-calendar">
              {WEEKDAY_LABELS.map((label) => (
                <span className="history-calendar__weekday" key={label}>
                  {label}
                </span>
              ))}
              {calendarDays.map((date) => {
                const dateKey = toIsoDate(date);
                const interventionsCount =
                  interventionsByDate.get(dateKey)?.length ?? 0;
                const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();
                const isSelected = dateKey === selectedDate;
                const isToday = dateKey === toIsoDate(new Date());

                return (
                  <button
                    aria-current={isToday ? 'date' : undefined}
                    className={[
                      'history-calendar__day',
                      isCurrentMonth ? '' : 'history-calendar__day--muted',
                      interventionsCount > 0 ? 'history-calendar__day--marked' : '',
                      isSelected ? 'history-calendar__day--selected' : '',
                      isToday ? 'history-calendar__day--today' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    key={dateKey}
                    onClick={() => setSelectedDate(dateKey)}
                    type="button"
                  >
                    <span>{date.getDate()}</span>
                    {interventionsCount > 0 ? <i aria-hidden="true" /> : null}
                  </button>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard className="history-day-card">
            <div className="history-day-card__header">
              <div className="history-day-card__heading-copy">
                <span className="history-day-card__eyebrow">
                  Journée sélectionnée
                </span>
                <h2>{getDayTitle(selectedDate)}</h2>
              </div>
              <span className="history-day-card__count">
                {selectedDayInterventions.length}{' '}
                intervention{selectedDayInterventions.length > 1 ? 's' : ''}
              </span>
            </div>

            {selectedDayInterventions.length ? (
              <div className="history-card-list">
                {selectedDayInterventions.map((item) => (
                  <HistoryInterventionCard
                    key={item.intervention.id}
                    intervention={item}
                    onOpen={() => openInterventionDetail(item)}
                    procedureLabel={getHistoricalProcedureLabel(
                      item.intervention,
                      customSurgicalInterventions
                    )}
                    seniorLabel={getSeniorLabel(item.intervention)}
                  />
                ))}
              </div>
            ) : (
              <p className="field-helper">Aucune intervention enregistrée ce jour-là.</p>
            )}
          </SectionCard>
        </div>
      ) : (
        <div className="progress-dashboard">
          {progressProcedureOptions.length ? (
            <>
              <div className="progress-web-layout">
                <aside className="progress-web-sidebar">
                  <div className="progress-web-filter-heading">
                    <span className="progress-web-filter-heading__icon">
                      <SlidersHorizontal aria-hidden="true" />
                    </span>
                    <span className="progress-web-filter-heading__copy">
                      <strong>Affiner la vue</strong>
                      <small>
                        {selectedProgressGroup?.items.length ?? 0}{' '}
                        intervention
                        {(selectedProgressGroup?.items.length ?? 0) > 1 ? 's' : ''}{' '}
                        évaluée
                        {(selectedProgressGroup?.items.length ?? 0) > 1 ? 's' : ''}
                      </small>
                    </span>
                  </div>

                  <div className="progress-filters">
                    <label className="progress-selector progress-selector--primary">
                      <span className="progress-selector__label">Intervention</span>
                      <span className="progress-selector__control">
                        <select
                          aria-label="Choisir une intervention"
                          onChange={(event) => {
                            setSelectedProgressProcedure(event.target.value);
                            setSelectedProgressIndication('all');
                            setSelectedProgressApproach('all');
                          }}
                          value={activeProgressProcedure}
                        >
                          {progressProcedureOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          aria-hidden="true"
                          className="progress-selector__chevron"
                        />
                      </span>
                    </label>

                    <label className="progress-selector">
                      <span className="progress-selector__label">Indication</span>
                      <span className="progress-selector__control">
                        <select
                          aria-label="Filtrer par indication"
                          onChange={(event) => {
                            setSelectedProgressIndication(event.target.value);
                            setSelectedProgressApproach('all');
                          }}
                          value={activeProgressIndication}
                        >
                          <option value="all">Toutes</option>
                          {progressIndicationOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          aria-hidden="true"
                          className="progress-selector__chevron"
                        />
                      </span>
                    </label>

                    <label className="progress-selector">
                      <span className="progress-selector__label">Voie d’abord</span>
                      <span className="progress-selector__control">
                        <select
                          aria-label="Filtrer par voie d’abord"
                          onChange={(event) => {
                            setSelectedProgressApproach(event.target.value);
                          }}
                          value={activeProgressApproach}
                        >
                          <option value="all">Toutes</option>
                          {progressApproachOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <ChevronDown
                          aria-hidden="true"
                          className="progress-selector__chevron"
                        />
                      </span>
                    </label>
                  </div>

                  <div
                    aria-label="Période analysée"
                    className="senior-progress-period"
                    role="group"
                  >
                    {PROGRESS_PERIOD_OPTIONS.map((option) => (
                      <button
                        aria-pressed={progressPeriod === option.value}
                        className={`senior-progress-period__item ${
                          progressPeriod === option.value
                            ? 'senior-progress-period__item--active'
                            : ''
                        }`.trim()}
                        key={option.value}
                        onClick={() => setProgressPeriod(option.value)}
                        type="button"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </aside>

                <main className="progress-web-main">
                  {isNativeApp ? (
                    <>
                      <div
                        className="progress-subtabs"
                        aria-label="Analyse de progression"
                      >
                        <button
                          aria-pressed={progressSubTab === 'autonomy'}
                          className={
                            progressSubTab === 'autonomy'
                              ? 'progress-subtabs__item progress-subtabs__item--active'
                              : 'progress-subtabs__item'
                          }
                          onClick={() => setProgressSubTab('autonomy')}
                          type="button"
                        >
                          <span className="progress-subtabs__icon">
                            <BarChart3 aria-hidden="true" />
                          </span>
                          <span className="progress-subtabs__label">
                            Évolution autonomie
                          </span>
                        </button>
                        <button
                          aria-pressed={progressSubTab === 'steps'}
                          className={
                            progressSubTab === 'steps'
                              ? 'progress-subtabs__item progress-subtabs__item--active'
                              : 'progress-subtabs__item'
                          }
                          onClick={() => setProgressSubTab('steps')}
                          type="button"
                        >
                          <span className="progress-subtabs__icon">
                            <Clock3 aria-hidden="true" />
                          </span>
                          <span className="progress-subtabs__label">
                            Temps opératoires
                          </span>
                        </button>
                      </div>

                      <div className="progress-dashboard__stack">
                        {progressSubTab === 'autonomy'
                          ? autonomyPanel
                          : stepsPanel}
                      </div>
                    </>
                  ) : (
                    <div className="internal-progress-comparison">
                      {autonomyPanel}
                      {stepsPanel}
                    </div>
                  )}
                </main>
              </div>
            </>
          ) : (
            <SectionCard title="Ma progression">
              <p className="field-helper">
                {scoredInterventions.some((item) => item.isValidated)
                  ? INSUFFICIENT_KEY_STEP_COVERAGE_MESSAGE
                  : 'Aucune intervention validée par un senior pour le moment.'}
              </p>
            </SectionCard>
          )}
        </div>
      )}

    </ScreenContainer>
  );
}

function HistoryInterventionCard({
  intervention,
  onOpen,
  procedureLabel,
  seniorLabel,
}: {
  intervention: ScoredHistoryIntervention;
  onOpen: () => void;
  procedureLabel: string;
  seniorLabel: string;
}) {
  return (
    <div className="history-day-entry">
      <SurgeryInterventionCard
        dateLabel={formatInterventionCardDate(intervention.intervention.date)}
        dateMetaLabel={getInterventionTime(intervention.intervention)}
        intervention={intervention.intervention}
        isValidated={intervention.isValidated}
        onPress={onOpen}
        procedureLabel={procedureLabel}
        seniorLabel={seniorLabel}
      />
      <span
        className={`history-day-entry__status ${
          intervention.isValidated
            ? 'history-day-entry__status--validated'
            : 'history-day-entry__status--pending'
        }`}
      >
        {intervention.isValidated ? 'Évaluée' : 'En attente'}
      </span>
    </div>
  );
}
