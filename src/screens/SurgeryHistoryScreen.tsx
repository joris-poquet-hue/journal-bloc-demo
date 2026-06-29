import {
  ArrowLeft,
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Info,
  LockKeyhole,
  Trophy,
} from 'lucide-react';
import { CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  ApproachIcon,
  getInterventionApproachLabel,
} from '../components/ApproachIcon';
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
  getChecklistStepsForIntervention,
  getChoiceLabel,
  hydrateAdminInterventionEvaluations,
  indicationOptions,
} from '../data/mockData';
import {
  AdminInterventionEvaluation,
  ChecklistLevel,
  SavedIntervention,
  SurgicalInterventionDefinition,
} from '../types';
import { calculateAutonomyScore } from '../utils/autonomyScore';
import { formatIsoDate } from '../utils/date';

type HistoryViewMode = 'calendar' | 'progress';
type ProgressSubTab = 'autonomy' | 'steps' | 'trophies';

type ScoredHistoryIntervention = {
  autonomyScore: number | null;
  intervention: SavedIntervention;
  isValidated: boolean;
};

type ProgressInterventionGroup = {
  key: string;
  label: string;
  items: ScoredHistoryIntervention[];
};

type AutonomySeriesPoint = {
  intervention: ScoredHistoryIntervention;
  index: number;
  score: number;
};

type ProgressComparisonRow = {
  key: string;
  label: string;
  score: number;
};

type ProgressStepRow = {
  id: string;
  label: string;
  score: number;
  isCritical: boolean;
};

function getProgressStepTone(score: number) {
  if (score < 50) {
    return 'danger';
  }

  if (score < 75) {
    return 'warning';
  }

  return 'success';
}

const ADMIN_EVALUATIONS_STORAGE_KEY =
  'journal-bord:admin-intervention-evaluations:v1';
const WEEKDAY_LABELS = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];
const difficultyLabels = {
  '1': 'Simple',
  '2': 'Standard',
  '3': 'Difficile',
} as const;

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
  const savedAtTime = new Date(intervention.savedAt).getTime();
  const fallbackTime = parseIsoDate(intervention.date).getTime();

  return Number.isNaN(savedAtTime) ? fallbackTime : savedAtTime;
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
) {
  if (selectedIntervention.autonomyScore == null) {
    return null;
  }

  const validatedInterventions = scoredInterventions
    .filter((item) => item.isValidated && item.autonomyScore != null)
    .sort(
      (left, right) =>
        getInterventionSortValue(left.intervention) -
        getInterventionSortValue(right.intervention)
    );
  const selectedIndex = validatedInterventions.findIndex(
    (item) => item.intervention.id === selectedIntervention.intervention.id
  );

  if (selectedIndex <= 0) {
    return null;
  }

  const previousScores = validatedInterventions
    .slice(Math.max(0, selectedIndex - 5), selectedIndex)
    .map((item) => item.autonomyScore)
    .filter((score): score is number => score != null);

  if (previousScores.length === 0) {
    return null;
  }

  const previousAverage =
    previousScores.reduce((total, score) => total + score, 0) /
    previousScores.length;
  const evolution = Math.round(selectedIntervention.autonomyScore - previousAverage);

  return evolution >= 5 ? evolution : null;
}

function formatProgressApproachLabel(approachLabel: string) {
  const normalizedLabel = approachLabel.toLocaleLowerCase('fr-FR');

  if (normalizedLabel.includes('coelio') || normalizedLabel.includes('cœlio')) {
    return 'cœlioscopique';
  }

  if (normalizedLabel.includes('robot')) {
    return 'robot';
  }

  if (normalizedLabel.includes('vnotes')) {
    return 'vNotes';
  }

  if (normalizedLabel.includes('laparotomie')) {
    return 'laparotomie';
  }

  if (normalizedLabel.includes('voie basse')) {
    return 'voie basse';
  }

  return approachLabel;
}

function getProgressGroupLabel(
  intervention: SavedIntervention,
  surgicalProcedureOptions: Array<{ value: string; label: string }>
) {
  const procedureLabel = getChoiceLabel(
    surgicalProcedureOptions,
    intervention.procedure
  );
  const approachLabel = getInterventionApproachLabel(intervention);

  return `${procedureLabel} ${formatProgressApproachLabel(approachLabel)}`;
}

function buildProgressGroups(
  scoredInterventions: ScoredHistoryIntervention[],
  surgicalProcedureOptions: Array<{ value: string; label: string }>
) {
  const groupMap = new Map<string, ProgressInterventionGroup>();

  scoredInterventions.forEach((item) => {
    if (!item.isValidated || item.autonomyScore == null) {
      return;
    }

    const approachLabel = getInterventionApproachLabel(item.intervention);
    const key = `${item.intervention.procedure}:${approachLabel}`;
    const group = groupMap.get(key) ?? {
      key,
      label: getProgressGroupLabel(item.intervention, surgicalProcedureOptions),
      items: [],
    };
    group.items.push(item);
    groupMap.set(key, group);
  });

  return Array.from(groupMap.values()).sort((left, right) =>
    left.label.localeCompare(right.label, 'fr-FR')
  );
}

function getChronologicalItems(group: ProgressInterventionGroup | null) {
  return group
    ? group.items
        .slice()
        .sort(
          (left, right) =>
            getInterventionSortValue(left.intervention) -
            getInterventionSortValue(right.intervention)
        )
    : [];
}

function getAverageScore(items: ScoredHistoryIntervention[]) {
  const scores = items
    .map((item) => item.autonomyScore)
    .filter((score): score is number => score != null);

  if (!scores.length) {
    return 0;
  }

  return Math.round(scores.reduce((total, score) => total + score, 0) / scores.length);
}

function buildAutonomySeries(group: ProgressInterventionGroup | null) {
  return getChronologicalItems(group)
    .map((item, index): AutonomySeriesPoint | null =>
      item.autonomyScore == null
        ? null
        : {
            intervention: item,
            index: index + 1,
            score: Math.round(item.autonomyScore),
          }
    )
    .filter((point): point is AutonomySeriesPoint => point != null);
}

function buildComparisonRows(groups: ProgressInterventionGroup[]) {
  return groups
    .map(
      (group): ProgressComparisonRow => ({
        key: group.key,
        label: group.label,
        score: getAverageScore(group.items),
      })
    )
    .sort((left, right) => right.score - left.score);
}

function getChecklistLevelScore(level: ChecklistLevel | null | undefined) {
  if (!level || level === 'NA') {
    return null;
  }

  return (Number(level) / 4) * 100;
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
    const definedSteps = getChecklistStepsForIntervention(
      intervention.procedure,
      intervention.indication,
      intervention.approach,
      intervention.entryTechnique,
      customSurgicalInterventions
    );
    const stepsById = new Map(definedSteps.map((step) => [step.id, step]));

    Object.keys(intervention.checklist).forEach((stepId) => {
      if (!stepsById.has(stepId)) {
        stepsById.set(stepId, {
          id: stepId,
          label: knownStepLabels.get(stepId) ?? stepId,
        });
      }
    });

    Array.from(stepsById.values()).forEach((step) => {
      const score = getChecklistLevelScore(intervention.checklist[step.id]);

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
    isCritical: Math.round(item.scoreTotal / item.count) < 50,
  }));

  if (!rows.length) {
    return [];
  }

  return rows;
}

function buildDetailChecklistRows(
  intervention: SavedIntervention,
  customSurgicalInterventions: SurgicalInterventionDefinition[]
) {
  const knownStepLabels = new Map(
    [
      ...allChecklistSteps,
      ...customSurgicalInterventions.flatMap(
        (customIntervention) => customIntervention.checklistSteps
      ),
    ].map((step) => [step.id, step.label])
  );
  const definedSteps = getChecklistStepsForIntervention(
    intervention.procedure,
    intervention.indication,
    intervention.approach,
    intervention.entryTechnique,
    customSurgicalInterventions
  );
  const stepsById = new Map(definedSteps.map((step) => [step.id, step.label]));

  Object.keys(intervention.checklist).forEach((stepId) => {
    if (!stepsById.has(stepId)) {
      stepsById.set(stepId, knownStepLabels.get(stepId) ?? stepId);
    }
  });

  const rows = Array.from(stepsById.entries()).map(([id, label]) => ({
    id,
    label,
    level: intervention.checklist[id] ?? 'NA',
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
    clearHistoryNavigationDate,
    customSurgicalInterventions,
    historyNavigationDate,
    historyNavigationView,
    selectedInternal,
    savedInterventions,
    selectableSeniors,
    surgicalProcedureOptions,
    goToSurgeryPortal,
  } = useAppContext();
  const [adminEvaluations] = useState(loadStoredAdminEvaluations);
  const [viewMode, setViewMode] = useState<HistoryViewMode>(
    historyNavigationView ?? 'calendar'
  );
  const [progressSubTab, setProgressSubTab] =
    useState<ProgressSubTab>('autonomy');
  const [selectedProgressKey, setSelectedProgressKey] = useState('');
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);
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
    if (!historyNavigationDate && !historyNavigationView) {
      return;
    }

    if (historyNavigationView) {
      setViewMode(historyNavigationView);
      setSelectedDetailId(null);
    }

    if (historyNavigationDate) {
      const targetDate = parseIsoDate(historyNavigationDate);

      setSelectedDetailId(null);
      setSelectedDate(historyNavigationDate);
      setVisibleMonth(new Date(targetDate.getFullYear(), targetDate.getMonth(), 1));
    }

    if (historyNavigationView === 'calendar' && !historyNavigationDate) {
      setSelectedDetailId(null);
    }

    clearHistoryNavigationDate();
  }, [clearHistoryNavigationDate, historyNavigationDate, historyNavigationView]);

  const scoredInterventions = useMemo<ScoredHistoryIntervention[]>(
    () =>
      internalInterventions
        .map((intervention) => {
          const evaluation = adminEvaluations[intervention.id];
          const isValidated = hasCompleteSeniorEvaluation(evaluation);

          return {
            intervention,
            isValidated,
            autonomyScore: isValidated
              ? calculateAutonomyScore(
                  intervention,
                  customSurgicalInterventions,
                  evaluation
                ) ?? intervention.autonomyScore
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
  const selectedDetailSenior = selectedDetail
    ? selectableSeniors.find(
        (senior) => senior.id === selectedDetail.intervention.seniorId
      ) ?? null
    : null;
  const selectedDetailChecklistRows = selectedDetail
    ? buildDetailChecklistRows(
        selectedDetail.intervention,
        customSurgicalInterventions
      )
    : [];
  const selectedDetailEvolution = selectedDetail
    ? getPreviousFiveScoreEvolution(scoredInterventions, selectedDetail)
    : null;
  const selectedDetailAutonomyTone = getProgressStepTone(
    selectedDetail?.autonomyScore ?? 0
  );
  const progressGroups = useMemo(
    () => buildProgressGroups(scoredInterventions, surgicalProcedureOptions),
    [scoredInterventions, surgicalProcedureOptions]
  );
  const selectedProgressGroup =
    progressGroups.find((group) => group.key === selectedProgressKey) ??
    progressGroups[0] ??
    null;
  const autonomySeries = useMemo(
    () => buildAutonomySeries(selectedProgressGroup),
    [selectedProgressGroup]
  );
  const comparisonRows = useMemo(
    () => buildComparisonRows(progressGroups),
    [progressGroups]
  );
  const stepRows = useMemo(
    () => buildStepRows(selectedProgressGroup, customSurgicalInterventions),
    [customSurgicalInterventions, selectedProgressGroup]
  );
  const activePointIndex =
    selectedPointIndex != null && selectedPointIndex < autonomySeries.length
      ? selectedPointIndex
      : null;

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
      <ScreenContainer title="Détail de l’intervention">
        <button
          className="history-back-button"
          onClick={() => setSelectedDetailId(null)}
          type="button"
        >
          <ArrowLeft aria-hidden="true" />
          <span>Retour</span>
        </button>

        <SectionCard className="history-detail-card">
          <div className="history-detail-card__header">
            <ApproachIcon intervention={selectedDetail.intervention} />
            <div>
              <h2>
                {getChoiceLabel(
                  surgicalProcedureOptions,
                  selectedDetail.intervention.procedure
                )}
              </h2>
              <span>{getInterventionApproachLabel(selectedDetail.intervention)}</span>
            </div>
            <span className="dashboard-status-pill dashboard-status-pill--valid">
              Évaluée
            </span>
          </div>

          <div className="history-detail-grid">
            <div className="history-detail-row">
              <span>Date et heure</span>
              <strong>
                {formatIsoDate(selectedDetail.intervention.date)} ·{' '}
                {getInterventionTime(selectedDetail.intervention)}
              </strong>
            </div>
            <div className="history-detail-row">
              <span>Senior</span>
              <strong>
                {selectedDetailSenior
                  ? formatSeniorDisplayName(selectedDetailSenior)
                  : 'Senior non renseigné'}
              </strong>
            </div>
            <div className="history-detail-row">
              <span>Intervention</span>
              <strong>
                {getChoiceLabel(
                  surgicalProcedureOptions,
                  selectedDetail.intervention.procedure
                )}
              </strong>
            </div>
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

        <SectionCard title="Score d’autonomie opératoire">
          <div className="history-score-card">
            <div
              aria-label={`Score d’autonomie ${Math.round(
                selectedDetail.autonomyScore ?? 0
              )} pour cent`}
              className={`history-score-gauge history-score-gauge--${selectedDetailAutonomyTone}`}
              role="img"
              style={
                {
                  '--history-score': `${selectedDetail.autonomyScore ?? 0}%`,
                } as CSSProperties
              }
            >
              <span>{Math.round(selectedDetail.autonomyScore ?? 0)}%</span>
            </div>
            <div className="history-score-card__copy">
              {(selectedDetail.autonomyScore ?? 0) >= 75 ? (
                <strong>Autonomie élevée</strong>
              ) : null}
              {selectedDetailEvolution != null ? (
                <p>
                  <span className="history-progress-pill">
                    +{selectedDetailEvolution}%
                  </span>
                  <span> par rapport à vos 5 dernières interventions</span>
                </p>
              ) : null}
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Auto-évaluation de l’interne">
          <div className="history-step-list">
            {selectedDetailChecklistRows.map((step) => {
              return (
                <div className="history-step-row" key={step.id}>
                  <span>{step.label}</span>
                  <strong>{step.level === 'NA' ? 'NA' : `${step.level} / 4`}</strong>
                </div>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard title="Évaluation du senior">
          <div className="history-senior-evaluation">
            <div className="history-senior-evaluation__row">
              <span>Difficulté de l’intervention</span>
              <strong className="history-info-badge">
                {selectedDetailEvaluation?.categoryDifficulty
                  ? difficultyLabels[selectedDetailEvaluation.categoryDifficulty]
                  : 'Non renseignée'}
              </strong>
            </div>
            <div className="history-senior-evaluation__row">
              <span>Performance globale de l’interne</span>
              <strong className="history-info-badge">
                {selectedDetailEvaluation?.globalPerformance ?? 'NA'} / 5
              </strong>
            </div>
          </div>
        </SectionCard>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer
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
        <>
          <SectionCard className="history-calendar-card">
            <div className="history-calendar__header">
              <button
                aria-label="Mois précédent"
                onClick={() => moveVisibleMonth(-1)}
                type="button"
              >
                <ChevronLeft aria-hidden="true" />
              </button>
              <h2>{getMonthTitle(visibleMonth)}</h2>
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

                return (
                  <button
                    className={[
                      'history-calendar__day',
                      isCurrentMonth ? '' : 'history-calendar__day--muted',
                      interventionsCount > 0 ? 'history-calendar__day--marked' : '',
                      isSelected ? 'history-calendar__day--selected' : '',
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
              <h2>{getDayTitle(selectedDate)}</h2>
            </div>

            {selectedDayInterventions.length ? (
              <div className="history-card-list">
                {selectedDayInterventions.map((item) => (
                  <HistoryInterventionCard
                    key={item.intervention.id}
                    intervention={item}
                    onOpen={() => openInterventionDetail(item)}
                    procedureLabel={getChoiceLabel(
                      surgicalProcedureOptions,
                      item.intervention.procedure
                    )}
                    seniorLabel={getSeniorLabel(item.intervention)}
                  />
                ))}
              </div>
            ) : (
              <p className="field-helper">Aucune intervention enregistrée ce jour-là.</p>
            )}
          </SectionCard>
        </>
      ) : (
        <div className="progress-dashboard">
          {progressGroups.length ? (
            <>
              <label className="progress-selector">
                <span className="progress-selector__label">Intervention</span>
                <span className="progress-selector__control">
                  <select
                    aria-label="Choisir une intervention"
                    onChange={(event) => {
                      setSelectedProgressKey(event.target.value);
                      setSelectedPointIndex(null);
                    }}
                    value={selectedProgressGroup?.key ?? ''}
                  >
                    {progressGroups.map((group) => (
                      <option key={group.key} value={group.key}>
                        {group.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown aria-hidden="true" className="progress-selector__chevron" />
                </span>
              </label>

              <div className="progress-subtabs" aria-label="Analyse de progression">
                <button
                  className={
                    progressSubTab === 'autonomy'
                      ? 'progress-subtabs__item progress-subtabs__item--active'
                      : 'progress-subtabs__item'
                  }
                  onClick={() => setProgressSubTab('autonomy')}
                  type="button"
                >
                  <BarChart3 aria-hidden="true" />
                  <span>Évolution autonomie</span>
                </button>
                <button
                  className={
                    progressSubTab === 'steps'
                      ? 'progress-subtabs__item progress-subtabs__item--active'
                      : 'progress-subtabs__item'
                  }
                  onClick={() => setProgressSubTab('steps')}
                  type="button"
                >
                  <Clock3 aria-hidden="true" />
                  <span>Temps opératoires</span>
                </button>
                <button
                  className={
                    progressSubTab === 'trophies'
                      ? 'progress-subtabs__item progress-subtabs__item--active'
                      : 'progress-subtabs__item'
                  }
                  onClick={() => setProgressSubTab('trophies')}
                  type="button"
                >
                  <Trophy aria-hidden="true" />
                  <span>Trophées</span>
                </button>
              </div>

              {progressSubTab === 'autonomy' ? (
                <div className="progress-dashboard__stack">
                  <SectionCard className="progress-chart-card">
                    <div className="progress-card-title">
                      <h2>Score d’autonomie opératoire</h2>
                    </div>
                    <AutonomyLineChart
                      onSelect={setSelectedPointIndex}
                      selectedIndex={activePointIndex}
                      series={autonomySeries}
                    />
                  </SectionCard>

                  <SectionCard title="Comparaison avec vos autres interventions">
                    <div className="progress-bars-list">
                      {comparisonRows.map((row) => (
                        <div className="progress-bar-row" key={row.key}>
                          <div className="progress-bar-row__header">
                            <span>{row.label}</span>
                            <strong>{row.score} %</strong>
                          </div>
                          <div className="progress-bar-row__track" aria-hidden="true">
                            <span style={{ width: `${row.score}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                </div>
              ) : null}

              {progressSubTab === 'steps' ? (
                <div className="progress-dashboard__stack">
                  <SectionCard
                    className="progress-steps-card"
                    description="Maîtrise des étapes sur vos 5 dernières interventions."
                    title="Analyse par temps opératoire"
                  >
                    <div className="progress-steps-list">
                      {stepRows.map((row) => (
                        <div
                          className={[
                            'progress-step-row',
                            row.isCritical ? 'progress-step-row--weak' : '',
                            `progress-step-row--${getProgressStepTone(row.score)}`,
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          key={row.id}
                        >
                          <div className="progress-step-row__header">
                            <span>{row.label}</span>
                            <strong>{row.score}%</strong>
                          </div>
                          <div className="progress-step-row__track" aria-hidden="true">
                            <span style={{ width: `${row.score}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                </div>
              ) : null}

              {progressSubTab === 'trophies' ? (
                <SectionCard className="progress-trophies-card" title="Trophées">
                  <p className="field-helper">
                    Aucun trophée n’est encore configuré. Nous les ajouterons dans une
                    prochaine étape.
                  </p>
                </SectionCard>
              ) : null}
            </>
          ) : (
            <SectionCard title="Ma progression">
              <p className="field-helper">
                Aucune intervention validée par un senior pour le moment.
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
    <SurgeryInterventionCard
      dateLabel={formatInterventionCardDate(intervention.intervention.date)}
      dateMetaLabel={getInterventionTime(intervention.intervention)}
      intervention={intervention.intervention}
      isValidated={intervention.isValidated}
      onPress={intervention.isValidated ? onOpen : undefined}
      procedureLabel={procedureLabel}
      seniorLabel={seniorLabel}
    />
  );
}

function AutonomyLineChart({
  onSelect,
  selectedIndex,
  series,
}: {
  onSelect: (index: number | null) => void;
  selectedIndex: number | null;
  series: AutonomySeriesPoint[];
}) {
  const chartRef = useRef<HTMLDivElement | null>(null);
  const width = 330;
  const height = 235;
  const left = 42;
  const right = 16;
  const top = 18;
  const bottom = 38;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const points = series.map((point, index) => {
    const x =
      series.length === 1
        ? left + chartWidth / 2
        : left + (chartWidth * index) / (series.length - 1);
    const y = top + chartHeight - (point.score / 100) * chartHeight;

    return { ...point, x, y };
  });
  const selectedPoint =
    selectedIndex != null ? points[selectedIndex] ?? null : null;
  const tooltipX = selectedPoint
    ? Math.min(Math.max(selectedPoint.x - 48, left + 4), width - 104)
    : 0;
  const tooltipY = selectedPoint ? Math.max(top + 4, selectedPoint.y - 62) : 0;
  const interventionLabel = selectedPoint
    ? selectedPoint.index === 1
      ? '1ère intervention'
      : `${selectedPoint.index}e intervention`
    : '';

  useEffect(() => {
    if (selectedIndex == null) {
      return;
    }

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;

      if (!(target instanceof Node)) {
        return;
      }

      if (chartRef.current?.contains(target)) {
        return;
      }

      onSelect(null);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [onSelect, selectedIndex]);

  if (!series.length) {
    return <p className="field-helper">Aucun score disponible pour cette intervention.</p>;
  }

  return (
    <div
      ref={chartRef}
      className="progress-line-chart"
      role="img"
      aria-label="Évolution du score d’autonomie"
    >
      <svg viewBox={`0 0 ${width} ${height}`}>
        {[100, 75, 50, 25, 0].map((value) => {
          const y = top + chartHeight - (value / 100) * chartHeight;

          return (
            <g key={value}>
              <line className="progress-line-chart__grid" x1={left} x2={width - right} y1={y} y2={y} />
              <text className="progress-line-chart__axis-label" x={4} y={y + 4}>
                {value}%
              </text>
            </g>
          );
        })}

        <line className="progress-line-chart__axis" x1={left} x2={left} y1={top} y2={height - bottom} />
        <line className="progress-line-chart__axis" x1={left} x2={width - right} y1={height - bottom} y2={height - bottom} />

        <polyline
          className="progress-line-chart__line"
          fill="none"
          points={points.map((point) => `${point.x},${point.y}`).join(' ')}
        />

        {points.map((point, index) => (
          <g key={point.intervention.intervention.id}>
            <circle
              aria-label={`${point.score}% à la ${point.index}e intervention`}
              className="progress-line-chart__hit-area"
              cx={point.x}
              cy={point.y}
              onClick={() => onSelect(index)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(index);
                }
              }}
              r="13"
              role="button"
              tabIndex={0}
            />
            <circle
              className={
                selectedIndex != null && index === selectedIndex
                  ? 'progress-line-chart__point progress-line-chart__point--active'
                  : 'progress-line-chart__point'
              }
              cx={point.x}
              cy={point.y}
              r="4.5"
            />
          </g>
        ))}

        {points.map((point) => (
          <text
            className="progress-line-chart__x-label"
            key={`${point.intervention.intervention.id}-label`}
            x={point.x}
            y={height - 12}
          >
            {point.index}
          </text>
        ))}

        {selectedPoint ? (
          <g className="progress-line-chart__tooltip">
            <rect height="50" rx="10" width="96" x={tooltipX} y={tooltipY} />
            <text x={tooltipX + 48} y={tooltipY + 22}>
              {selectedPoint.score}%
            </text>
            <text className="progress-line-chart__tooltip-detail" x={tooltipX + 48} y={tooltipY + 38}>
              {interventionLabel}
            </text>
          </g>
        ) : null}

        <text className="progress-line-chart__caption" x={left + chartWidth / 2} y={height - 1}>
          Interventions réalisées
        </text>
      </svg>
    </div>
  );
}
