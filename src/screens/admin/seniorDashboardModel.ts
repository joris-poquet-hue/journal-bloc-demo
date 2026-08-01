import {
  allChecklistSteps,
  approachOptions,
  getHistoricalChecklistSteps,
  getChoiceLabel,
  getSurgicalInterventionDefinition,
  getSurgicalInterventionDefinitions,
  indicationOptions,
} from '../../data/mockData';
import type {
  AdminInterventionEvaluation,
  ChecklistLevel,
  ChoiceOption,
  InterventionType,
  SavedIntervention,
  Senior,
  SurgicalApproach,
  SurgicalInterventionDefinition,
} from '../../types';
import { getAuthoritativeChecklist } from '../../utils/evaluationChecklist';
import { getInterventionApproachLabel } from '../../components/ApproachIcon';
import { calculateAutonomyScore } from '../../utils/autonomyScore';
import {
  buildDailyAutonomySeries,
  filterItemsByProgressPeriod,
  type DailyAutonomyPoint,
  type ProgressPeriod,
} from '../../utils/progressStatistics';
import { hasCompleteAdminEvaluation } from './adminEvaluationModel';

export type SeniorPopulationFilter = 'recent' | 'mine' | 'all';
export type SeniorStatisticsTab = 'progress' | 'history';
export type SeniorProgressPeriod = ProgressPeriod;
export type SeniorHistoryStatusFilter = 'all' | 'evaluated' | 'pending';
export type SeniorHistoryCardStatus = Exclude<SeniorHistoryStatusFilter, 'all'>;

export type SeniorProgressProcedureOption = {
  indicationLabel: string;
  indicationToken: string;
  key: string;
  label: string;
  procedure: InterventionType;
  procedureLabel: string;
};

export type SeniorAutonomyPoint = DailyAutonomyPoint;

export type SeniorStepStat = {
  id: string;
  label: string;
  score: number | null;
  sampleSize: number;
  tone: 'positive' | 'warning' | 'critical' | 'neutral';
};

export const SENIOR_POPULATION_OPTIONS: Array<{
  value: SeniorPopulationFilter;
  label: string;
}> = [
  { value: 'all', label: 'Tous les internes' },
  { value: 'mine', label: 'Mes internes' },
  { value: 'recent', label: 'Relations récentes' },
];

export const SENIOR_FALLBACK_INTERVENTION_KEY = '';
export const SENIOR_HISTORY_PAGE_SIZE_OPTIONS = [4, 8, 12] as const;

const SENIOR_CHECKLIST_LEVELS = new Set<ChecklistLevel>(['0', '1', '2', '3', '4']);
const SENIOR_CHECKLIST_STEP_META = new Map(
  allChecklistSteps.map((step, index) => [
    step.id,
    { label: step.label, order: index },
  ])
);

function formatSeniorStepFallbackLabel(stepId: string) {
  return stepId
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function normalizeProgressToken(value: string) {
  return value.trim().toLocaleLowerCase('fr-FR');
}

export function formatLongFrenchDate(value: string) {
  if (!value) return 'Date non renseignée';
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00`));
}

export function formatSeniorDateTime(value: string) {
  if (!value) return 'Non renseignée';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Non renseignée';
  return date.toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function getSeniorSemesterTone(semester: string) {
  const number = Number(semester.replace('S', ''));
  if (number >= 1 && number <= 2) return 'blue';
  if (number >= 3 && number <= 8) return 'green';
  return 'violet';
}

export function getSeniorStepTone(score: number): SeniorStepStat['tone'] {
  if (score >= 75) return 'positive';
  if (score >= 50) return 'warning';
  return 'critical';
}

function getSeniorProcedureApproachSuffix(approach: SurgicalApproach | null) {
  if (approach === 'coelioscopie') return 'cœlioscopique';
  if (approach === 'robot') return 'robot-assistée';
  if (approach === 'hysteroscopie') return 'hystéroscopique';
  if (approach === 'laparotomie') return 'par laparotomie';
  if (approach === 'vnotes') return 'vNOTES';
  return '';
}

export function formatSeniorInterventionLabel(
  procedureLabel: string,
  _procedure: InterventionType,
  approach: SurgicalApproach | null
) {
  const suffix = getSeniorProcedureApproachSuffix(approach);
  return suffix ? `${procedureLabel} ${suffix}` : procedureLabel;
}

export function getSeniorIndicationLabel(intervention: SavedIntervention) {
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

export function getSeniorIndicationToken(intervention: SavedIntervention) {
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

export function buildSeniorProgressProcedureOptions({
  definitions,
  interventions,
  procedureOptions,
}: {
  definitions: SurgicalInterventionDefinition[];
  interventions: SavedIntervention[];
  procedureOptions: ChoiceOption<InterventionType>[];
}) {
  const optionsByKey = new Map<string, SeniorProgressProcedureOption>();
  const addOption = (
    procedure: InterventionType,
    procedureLabel: string,
    indicationToken: string,
    indicationLabel: string
  ) => {
    const normalizedLabel = indicationLabel.trim();
    if (!normalizedLabel) return;

    const key = `${procedure}::${indicationToken}`;
    if (optionsByKey.has(key)) return;

    optionsByKey.set(key, {
      indicationLabel: normalizedLabel,
      indicationToken,
      key,
      label: `${procedureLabel} - ${normalizedLabel}`,
      procedure,
      procedureLabel,
    });
  };

  getSurgicalInterventionDefinitions(definitions)
    .filter((definition) => definition.status !== 'archived')
    .forEach((definition) => {
      const activeIndicationOptions =
        definition.indicationOptions?.filter(
          (option) => option.active && option.label.trim() && !option.isOther
        ) ?? [];
      const indicationLabels = activeIndicationOptions.length
        ? activeIndicationOptions.map((option) => option.label.trim())
        : definition.indications
            .map((indication) => indication.trim())
            .filter(Boolean);

      indicationLabels.forEach((indicationLabel) => {
        addOption(
          definition.id,
          definition.name,
          `custom:${normalizeProgressToken(indicationLabel)}`,
          indicationLabel
        );
      });
    });

  interventions.forEach((intervention) => {
    addOption(
      intervention.procedure,
      getChoiceLabel(procedureOptions, intervention.procedure),
      getSeniorIndicationToken(intervention),
      getSeniorIndicationLabel(intervention) || 'Indication non renseignée'
    );
  });

  return Array.from(optionsByKey.values()).sort((left, right) =>
    left.label.localeCompare(right.label, 'fr-FR', { sensitivity: 'base' })
  );
}

export function matchesSeniorProgressProcedureOption(
  intervention: SavedIntervention,
  option: SeniorProgressProcedureOption
) {
  return (
    intervention.procedure === option.procedure &&
    (getSeniorIndicationToken(intervention) === option.indicationToken ||
      normalizeProgressToken(getSeniorIndicationLabel(intervention)) ===
        normalizeProgressToken(option.indicationLabel))
  );
}

export function getDefaultSeniorProgressProcedureKey(
  interventions: SavedIntervention[],
  options: SeniorProgressProcedureOption[]
) {
  const latestIntervention = [...interventions].sort((left, right) =>
    right.savedAt.localeCompare(left.savedAt)
  )[0];

  if (!latestIntervention) return options[0]?.key ?? '';

  return (
    options.find(
      (option) =>
        option.procedure === latestIntervention.procedure &&
        option.indicationToken === getSeniorIndicationToken(latestIntervention)
    )?.key ?? options[0]?.key ?? ''
  );
}

export function buildSeniorProgressApproachOptions(
  interventions: SavedIntervention[],
  option: SeniorProgressProcedureOption | null,
  definitions: SurgicalInterventionDefinition[]
) {
  if (!option) return [];

  const optionsByValue = new Map<
    SurgicalApproach,
    { label: string; value: SurgicalApproach }
  >();
  const addOption = (approach: SurgicalApproach) => {
    if (optionsByValue.has(approach)) return;
    optionsByValue.set(approach, {
      label: getChoiceLabel(approachOptions, approach, approach),
      value: approach,
    });
  };

  const definition =
    definitions.find((item) => item.id === option.procedure) ??
    getSurgicalInterventionDefinition(option.procedure, definitions);
  definition?.allowedApproaches.forEach(addOption);
  definition?.approachConfigs
    ?.filter((config) => config.active)
    .forEach((config) => addOption(config.approach));

  interventions
    .filter((intervention) =>
      matchesSeniorProgressProcedureOption(intervention, option)
    )
    .forEach((intervention) => {
      if (intervention.approach) addOption(intervention.approach);
    });

  return Array.from(optionsByValue.values()).sort((left, right) =>
    left.label.localeCompare(right.label, 'fr-FR', { sensitivity: 'base' })
  );
}

export function getDefaultSeniorProgressApproach(
  interventions: SavedIntervention[],
  option: SeniorProgressProcedureOption | null,
  approaches: Array<{ label: string; value: SurgicalApproach }>
) {
  if (!option) return '';

  const latestMatchingIntervention = [...interventions]
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt))
    .find(
      (intervention) =>
        matchesSeniorProgressProcedureOption(intervention, option) &&
        intervention.approach
    );
  const latestApproach = latestMatchingIntervention?.approach ?? null;

  if (
    latestApproach &&
    approaches.some((approach) => approach.value === latestApproach)
  ) {
    return latestApproach;
  }

  return approaches[0]?.value ?? '';
}

export function filterSeniorProgressInterventions({
  approach,
  interventions,
  period,
  procedureOption,
}: {
  approach: SurgicalApproach | '';
  interventions: SavedIntervention[];
  period: SeniorProgressPeriod;
  procedureOption: SeniorProgressProcedureOption | null;
}) {
  return filterItemsByProgressPeriod(
    interventions
    .filter((intervention) => {
      if (
        procedureOption &&
        !matchesSeniorProgressProcedureOption(intervention, procedureOption)
      ) {
        return false;
      }
      if (approach && intervention.approach !== approach) return false;
      return true;
    })
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) || left.savedAt.localeCompare(right.savedAt)
    ),
    period,
    (intervention) => intervention.date
  );
}

export function buildSeniorAutonomySeries(
  interventions: SavedIntervention[],
  evaluations: Record<string, AdminInterventionEvaluation>,
  customInterventions: SurgicalInterventionDefinition[] = []
) {
  return buildDailyAutonomySeries(
    interventions,
    (intervention) => intervention.date,
    (intervention) => {
      const evaluation = evaluations[intervention.id];

      if (!hasCompleteAdminEvaluation(evaluation)) {
        return null;
      }

      return calculateAutonomyScore(
        intervention,
        customInterventions,
        evaluation
      );
    }
  );
}

export function buildSeniorStepStats(
  interventions: SavedIntervention[],
  definitions: SurgicalInterventionDefinition[],
  evaluations: Record<string, AdminInterventionEvaluation> = {},
  includeNotApplicableSteps = false
) {
  if (!interventions.length) return [];
  const aggregates = new Map<
    string,
    { label: string; total: number; count: number; naCount: number; order: number }
  >();

  interventions.forEach((intervention) => {
    const checklist = getAuthoritativeChecklist(
      intervention,
      evaluations[intervention.id]
    );
    const definedMeta = new Map(
      getHistoricalChecklistSteps(intervention, definitions).map((step, index) => [
        step.id,
        {
          label: step.label,
          order: SENIOR_CHECKLIST_STEP_META.get(step.id)?.order ?? index,
        },
      ])
    );

    Object.entries(checklist).forEach(([stepId, level]) => {
      const isNotApplicable = level === 'NA';

      if (
        !level ||
        (!SENIOR_CHECKLIST_LEVELS.has(level) &&
          !(includeNotApplicableSteps && isNotApplicable))
      ) {
        return;
      }

      const meta =
        definedMeta.get(stepId) ??
        SENIOR_CHECKLIST_STEP_META.get(stepId) ?? {
          label: formatSeniorStepFallbackLabel(stepId),
          order: Number.MAX_SAFE_INTEGER,
        };
      const current = aggregates.get(stepId) ?? {
        label: meta.label,
        total: 0,
        count: 0,
        naCount: 0,
        order: meta.order,
      };

      if (isNotApplicable) {
        current.naCount += 1;
      } else {
        current.total += (Number(level) / 4) * 100;
        current.count += 1;
      }

      current.order = Math.min(current.order, meta.order);
      aggregates.set(stepId, current);
    });
  });

  return Array.from(aggregates.entries())
    .sort((left, right) =>
      left[1].order !== right[1].order
        ? left[1].order - right[1].order
        : left[1].label.localeCompare(right[1].label, 'fr-FR')
    )
    .map(([id, value]) => {
      const score = value.count > 0 ? Math.round(value.total / value.count) : null;
      return {
        id,
        label: value.label,
        score,
        sampleSize: value.count + value.naCount,
        tone: score == null ? 'neutral' : getSeniorStepTone(score),
      };
    });
}

export function getSeniorHistoryStatus(
  evaluation: AdminInterventionEvaluation | undefined
): SeniorHistoryCardStatus {
  return hasCompleteAdminEvaluation(evaluation) ? 'evaluated' : 'pending';
}

export function getSeniorHistoryStatusLabel(status: SeniorHistoryCardStatus) {
  return status === 'evaluated' ? 'Évaluée' : 'En attente';
}

export function getSeniorHistoryStatusClassName(status: SeniorHistoryCardStatus) {
  return status === 'evaluated'
    ? 'admin-profile-history-card__status admin-profile-history-card__status--evaluated'
    : 'admin-profile-history-card__status admin-profile-history-card__status--pending';
}

export function filterSeniorHistoryInterventions({
  dateFrom,
  dateTo,
  evaluations,
  interventions,
  procedureOptions,
  search,
  seniorFilter,
  seniors,
  statusFilter,
}: {
  dateFrom: string;
  dateTo: string;
  evaluations: Record<string, AdminInterventionEvaluation>;
  interventions: SavedIntervention[];
  procedureOptions: ChoiceOption<InterventionType>[];
  search: string;
  seniorFilter: string;
  seniors: Senior[];
  statusFilter: SeniorHistoryStatusFilter;
}) {
  const normalizedSearch = search.trim().toLocaleLowerCase('fr-FR');

  return interventions
    .filter((intervention) => {
      const status = getSeniorHistoryStatus(evaluations[intervention.id]);
      const senior = seniors.find((item) => item.id === intervention.seniorId);
      const seniorName = senior
        ? `${senior.firstName} ${senior.lastName}`.trim()
        : '';
      const haystack = [
        getChoiceLabel(procedureOptions, intervention.procedure),
        getInterventionApproachLabel(intervention),
        getSeniorIndicationLabel(intervention),
        seniorName,
      ]
        .join(' ')
        .toLocaleLowerCase('fr-FR');

      if (normalizedSearch && !haystack.includes(normalizedSearch)) return false;
      if (seniorFilter !== 'all' && intervention.seniorId !== seniorFilter) return false;
      if (statusFilter !== 'all' && status !== statusFilter) return false;
      if (dateFrom && intervention.date < dateFrom) return false;
      if (dateTo && intervention.date > dateTo) return false;
      return true;
    })
    .sort(
      (left, right) =>
        right.date.localeCompare(left.date) || right.savedAt.localeCompare(left.savedAt)
    );
}

export function getSeniorChecklistLevelBadgeLabel(
  level: ChecklistLevel | null | undefined
) {
  if (!level) return 'Non renseigné';
  return level === 'NA' ? 'NA' : `Niveau ${level}`;
}
