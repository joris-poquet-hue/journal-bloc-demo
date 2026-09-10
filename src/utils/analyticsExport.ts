import {
  approachOptions,
  entryTechniqueOptions,
  getHistoricalChecklistSteps,
  getHistoricalProcedureLabel,
  getChoiceLabel,
  indicationOptions,
  lateralityOptions,
  roleOptions,
} from '../data/mockData';
import { getClinicalContextSummaryRows } from '../data/contextVariables';
import type {
  ActivityLogEntry,
  AdminInterventionEvaluation,
  InternalProfile,
  SavedIntervention,
  Senior,
  SurgicalInterventionDefinition,
} from '../types';
import { calculateAutonomyScore } from './autonomyScore';
import { getAuthoritativeChecklist } from './evaluationChecklist';
import {
  getCalendarDayDifference,
  getHourDifference,
  hasCompleteEvaluation,
} from './exportMetrics';
import {
  createXlsxBlob,
  deliverDownloadableFile,
  type XlsxCell,
  type XlsxCellStyle,
  type XlsxCellValue,
  type XlsxWorksheet,
} from './xlsx';

export type AnalyticsExportPeriod = '7d' | '30d' | '6m' | '1y';

type PeriodAnalyticsSummary = {
  activeInternalCount: number;
  activeSeniorCount: number;
  averageEvaluationDelayMs: number | null;
  averageInterventionFormClickCount: number | null;
  averageInterventionFormDurationMs: number | null;
  averageRecordingDelayDays: number | null;
  averageSeniorEvaluationClickCount: number | null;
  averageSeniorEvaluationDurationMs: number | null;
  evaluationRate: number;
  evaluatedRecordedCount: number;
  evaluationsPerformedCount: number;
  recentActivityCount: number;
  recentRecordedCount: number;
};

type AllTimeCycleSummary = {
  averageEvaluationDelayMs: number | null;
  averageInterventionFormClickCount: number | null;
  averageInterventionFormDurationMs: number | null;
  averageRecordingDelayDays: number | null;
  averageSeniorEvaluationClickCount: number | null;
  averageSeniorEvaluationDurationMs: number | null;
  completedInterventionFormCount: number;
  completedSeniorEvaluationCount: number;
  evaluatedCount: number;
  recordedCount: number;
};

export type AnalyticsExportInput = {
  activityLog: ActivityLogEntry[];
  adminEvaluations: Record<string, AdminInterventionEvaluation>;
  allTimeCycleSummary: AllTimeCycleSummary;
  customSurgicalInterventions: SurgicalInterventionDefinition[];
  internalProfiles: InternalProfile[];
  period: AnalyticsExportPeriod;
  periodEndIso: string;
  periodLabel: string;
  periodStartIso: string;
  periodSummary: PeriodAnalyticsSummary;
  generatedAtIso: string;
  savedInterventions: SavedIntervention[];
  selectableSeniors: Senior[];
};

type AnalyticsPeriodData = {
  activities: ActivityLogEntry[];
  interventions: SavedIntervention[];
  internalIds: Set<string>;
  seniorIds: Set<string>;
};

const contextLabels: Record<string, string> = {
  programme: 'Programmé',
  urgence: 'Urgence',
};

function cell(value: XlsxCell['value'], style?: XlsxCellStyle): XlsxCell {
  return { style, value };
}

function headerRow(headers: string[]): XlsxCell[] {
  return headers.map((header) => cell(header, 'header'));
}

function parseDateOnly(value: string) {
  const [year, month, day] = value.split('-').map(Number);

  if (!year || !month || !day) {
    return null;
  }

  const date = new Date(year, month - 1, day);

  return Number.isNaN(date.getTime()) ? null : date;
}

function parseTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function dateCell(value: string) {
  return cell(parseDateOnly(value), 'date');
}

function dateTimeCell(value: string | null | undefined) {
  return cell(parseTimestamp(value), 'datetime');
}

function decimalCell(value: number | null) {
  return value == null || Number.isNaN(value) ? cell(null) : cell(value, 'decimal');
}

function signedPointsCell(value: number | null) {
  return value == null || Number.isNaN(value)
    ? cell(null)
    : cell(value, 'signedPoints');
}

function percentageCell(value: number | null) {
  return value == null || Number.isNaN(value)
    ? cell(null)
    : cell(value, 'percentage');
}

function getProcedureLabel(
  intervention: SavedIntervention,
  customDefinitions: SurgicalInterventionDefinition[]
) {
  return getHistoricalProcedureLabel(
    intervention,
    customDefinitions,
    intervention.procedure
  );
}

function getIndicationLabel(intervention: SavedIntervention) {
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

function getIndicationComparisonKey(intervention: SavedIntervention) {
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

function getApproachLabel(intervention: SavedIntervention) {
  return getChoiceLabel(approachOptions, intervention.approach, '');
}

function getAutonomyScore(
  input: AnalyticsExportInput,
  intervention: SavedIntervention
) {
  return (
    calculateAutonomyScore(
      intervention,
      input.customSurgicalInterventions,
      input.adminEvaluations[intervention.id]
    )
  );
}

function getInterventionSortValue(intervention: SavedIntervention) {
  const savedAtTime = new Date(intervention.savedAt).getTime();
  const interventionDate = parseDateOnly(intervention.date)?.getTime() ?? 0;

  return Number.isNaN(savedAtTime) ? interventionDate : savedAtTime;
}

function buildAutonomyScoreEvolutions(input: AnalyticsExportInput) {
  const previousScoreByPair = new Map<string, number>();
  const evolutionByInterventionId = new Map<string, number | null>();
  const chronologicalInterventions = [...input.savedInterventions].sort(
    (left, right) =>
      getInterventionSortValue(left) - getInterventionSortValue(right)
  );

  chronologicalInterventions.forEach((intervention) => {
    const autonomyScore = getAutonomyScore(input, intervention);

    if (autonomyScore == null || !intervention.internalId) {
      evolutionByInterventionId.set(intervention.id, null);
      return;
    }

    const pairKey = [
      intervention.internalId,
      intervention.procedure,
      getIndicationComparisonKey(intervention),
    ].join('|');
    const previousScore = previousScoreByPair.get(pairKey);
    const evolution =
      previousScore == null
        ? null
        : Math.round((autonomyScore - previousScore) * 100) / 100;

    evolutionByInterventionId.set(intervention.id, evolution);
    previousScoreByPair.set(pairKey, autonomyScore);
  });

  return evolutionByInterventionId;
}

type ExportIdentity = {
  firstName: string;
  lastName: string;
  stageLocation: string;
};

function getInternalIdentity(
  input: AnalyticsExportInput,
  internalId: string | null | undefined
): ExportIdentity {
  const profile = internalId
    ? input.internalProfiles.find((candidate) => candidate.id === internalId)
    : null;

  return profile
    ? {
        firstName: profile.firstName,
        lastName: profile.lastName,
        stageLocation: profile.institution,
      }
    : { firstName: 'Profil indisponible', lastName: '', stageLocation: '' };
}

function getSeniorIdentity(
  input: AnalyticsExportInput,
  seniorId: string | null | undefined
): ExportIdentity {
  const senior =
    seniorId && seniorId !== 'sen-other'
      ? input.selectableSeniors.find((candidate) => candidate.id === seniorId)
      : null;

  return senior
    ? {
        firstName: senior.firstName,
        lastName: senior.lastName,
        stageLocation: senior.institution,
      }
    : { firstName: 'Non renseigné', lastName: '', stageLocation: '' };
}

function getActorIdentity(
  input: AnalyticsExportInput,
  entry: ActivityLogEntry
) {
  return entry.actorRole === 'internal'
    ? getInternalIdentity(input, entry.actorId)
    : getSeniorIdentity(input, entry.actorId);
}

function buildInterventionReferences(interventions: SavedIntervention[]) {
  return new Map(
    interventions.map((intervention, index) => [
      intervention.id,
      `BLOC-${String(index + 1).padStart(6, '0')}`,
    ])
  );
}

function getPeriodData(input: AnalyticsExportInput): AnalyticsPeriodData {
  const activities = input.activityLog
    .filter(
      (entry) =>
        (entry.actorRole === 'internal' || entry.actorRole === 'senior') &&
        entry.createdAt >= input.periodStartIso &&
        entry.createdAt <= input.periodEndIso
    )
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const interventions = input.savedInterventions
    .filter(
      (intervention) =>
        intervention.savedAt >= input.periodStartIso &&
        intervention.savedAt <= input.periodEndIso
    )
    .sort((left, right) => left.savedAt.localeCompare(right.savedAt));
  const internalIds = new Set<string>();
  const seniorIds = new Set<string>();

  activities.forEach((entry) => {
    if (!entry.actorId) {
      return;
    }

    if (entry.actorRole === 'internal') {
      internalIds.add(entry.actorId);
    } else if (entry.actorRole === 'senior') {
      seniorIds.add(entry.actorId);
    }
  });

  interventions.forEach((intervention) => {
    if (intervention.internalId) {
      internalIds.add(intervention.internalId);
    }

    if (intervention.seniorId && intervention.seniorId !== 'sen-other') {
      seniorIds.add(intervention.seniorId);
    }
  });

  input.internalProfiles.forEach((profile) => {
    if (
      profile.lastLoginAt &&
      profile.lastLoginAt >= input.periodStartIso &&
      profile.lastLoginAt <= input.periodEndIso
    ) {
      internalIds.add(profile.id);
    }
  });

  input.selectableSeniors.forEach((senior) => {
    if (
      senior.id !== 'sen-other' &&
      senior.lastLoginAt &&
      senior.lastLoginAt >= input.periodStartIso &&
      senior.lastLoginAt <= input.periodEndIso
    ) {
      seniorIds.add(senior.id);
    }
  });

  return { activities, internalIds, interventions, seniorIds };
}

function buildSummaryWorksheet(input: AnalyticsExportInput): XlsxWorksheet {
  const generatedAt = parseTimestamp(input.generatedAtIso);
  const periodStart = parseTimestamp(input.periodStartIso);
  const periodEnd = parseTimestamp(input.periodEndIso);
  const period = input.periodSummary;
  const allTime = input.allTimeCycleSummary;
  const metricValue = (
    value: number | null,
    divisor = 1,
    style: XlsxCellStyle = 'decimal'
  ) =>
    value == null
      ? cell('Non calculable')
      : cell(value / divisor, style);
  const rows: XlsxCellValue[][] = [
    [cell("Synthèse de l'analytique d'usage", 'title'), cell(null, 'title')],
    ['Période analysée', input.periodLabel],
    ['Début de la période', cell(periodStart, 'date')],
    ['Fin de la période', cell(periodEnd, 'datetime')],
    ["Date et heure de génération", cell(generatedAt, 'datetime')],
    [],
    [cell('Indicateurs de la période sélectionnée', 'section'), cell('Valeur', 'section')],
    ["Nombre total d'activités", period.recentActivityCount],
    ["Nombre d'internes actifs", period.activeInternalCount],
    ['Nombre de seniors actifs', period.activeSeniorCount],
    ['Interventions enregistrées pendant la période', period.recentRecordedCount],
    [
      'Interventions de la période évaluées à la date de l’export',
      period.evaluatedRecordedCount,
    ],
    [
      "Taux d'évaluation des interventions enregistrées pendant la période",
      percentageCell(period.evaluationRate / 100),
    ],
    [
      'Évaluations réalisées pendant la période',
      period.evaluationsPerformedCount,
    ],
    ['Délai moyen intervention → saisie (jours calendaires)', metricValue(period.averageRecordingDelayDays)],
    ['Délai moyen saisie → évaluation (heures)', metricValue(period.averageEvaluationDelayMs, 3_600_000)],
    ["Durée moyenne de saisie d'une intervention (secondes)", metricValue(period.averageInterventionFormDurationMs, 1_000)],
    ["Clics moyens pour saisir une intervention", metricValue(period.averageInterventionFormClickCount)],
    ["Durée moyenne d'une évaluation senior (secondes)", metricValue(period.averageSeniorEvaluationDurationMs, 1_000)],
    ["Clics moyens pour réaliser une évaluation", metricValue(period.averageSeniorEvaluationClickCount)],
    [],
    [cell('Indicateurs toutes périodes confondues', 'section'), cell('Valeur', 'section')],
    ['Blocs enregistrés', allTime.recordedCount],
    ['Évaluations enregistrées', allTime.evaluatedCount],
    ['Délai moyen intervention → saisie (jours calendaires)', metricValue(allTime.averageRecordingDelayDays)],
    ['Délai moyen saisie → évaluation (heures)', metricValue(allTime.averageEvaluationDelayMs, 3_600_000)],
    ["Durée moyenne de saisie d'une intervention (secondes)", metricValue(allTime.averageInterventionFormDurationMs, 1_000)],
    ['Formulaires intervention terminés', allTime.completedInterventionFormCount],
    ["Clics moyens pour saisir une intervention", metricValue(allTime.averageInterventionFormClickCount)],
    ["Durée moyenne d'une évaluation senior (secondes)", metricValue(allTime.averageSeniorEvaluationDurationMs, 1_000)],
    ['Évaluations senior terminées', allTime.completedSeniorEvaluationCount],
    ["Clics moyens pour réaliser une évaluation", metricValue(allTime.averageSeniorEvaluationClickCount)],
  ];

  return {
    columnWidths: [58, 24],
    name: 'Synthèse',
    rows,
  };
}

function buildInterventionsWorksheet(
  input: AnalyticsExportInput,
  interventions: SavedIntervention[],
  references: Map<string, string>
): XlsxWorksheet {
  const headers = [
    'Référence',
    'Prénom interne',
    'Nom interne',
    'Lieu de stage',
    'Prénom senior évaluateur',
    'Nom senior évaluateur',
    "Date de l'intervention",
    "Date et heure d'enregistrement",
    'Procédure',
    'Indication',
    "Voie d'abord",
    "Technique d'entrée",
    'Latéralité',
    'Contexte',
    "Rôle de l'interne",
    'Complexité (1-10)',
    'Variables de contexte clinique',
    "Score d'autonomie (%)",
    "Evolution score d'autonomie (%)",
    'Statut',
    "Date et heure de l'évaluation",
    'Performance globale (1-5)',
    'Difficulté senior (1-3)',
    'Commentaire senior',
    'Délai intervention → saisie (jours calendaires)',
    'Délai saisie → évaluation (heures)',
  ];
  const autonomyScoreEvolutions = buildAutonomyScoreEvolutions(input);
  const rows = interventions.map<XlsxCellValue[]>((intervention) => {
    const evaluation = input.adminEvaluations[intervention.id];
    const isEvaluated = hasCompleteEvaluation(evaluation);
    const autonomyScore = getAutonomyScore(input, intervention);
    const internal = getInternalIdentity(input, intervention.internalId);
    const senior = getSeniorIdentity(
      input,
      evaluation?.seniorProfileId ?? intervention.seniorId
    );

    return [
      references.get(intervention.id) ?? '',
      internal.firstName,
      internal.lastName,
      internal.stageLocation,
      senior.firstName,
      senior.lastName,
      dateCell(intervention.date),
      dateTimeCell(intervention.savedAt),
      getProcedureLabel(intervention, input.customSurgicalInterventions),
      getIndicationLabel(intervention),
      getApproachLabel(intervention),
      getChoiceLabel(entryTechniqueOptions, intervention.entryTechnique, ''),
      getChoiceLabel(lateralityOptions, intervention.laterality, ''),
      intervention.context ? contextLabels[intervention.context] ?? intervention.context : '',
      getChoiceLabel(roleOptions, intervention.role, ''),
      intervention.complexity,
      getClinicalContextSummaryRows(intervention.contextVariables)
        .map((row) => `${row.label} : ${row.value}`)
        .join(' | '),
      autonomyScore == null ? null : decimalCell(autonomyScore),
      signedPointsCell(autonomyScoreEvolutions.get(intervention.id) ?? null),
      isEvaluated ? 'Évaluée' : 'En attente',
      dateTimeCell(evaluation?.updatedAt),
      evaluation?.globalPerformance ? Number(evaluation.globalPerformance) : null,
      evaluation?.categoryDifficulty ? Number(evaluation.categoryDifficulty) : null,
      cell(evaluation?.seniorComment ?? '', 'wrap'),
      getCalendarDayDifference(intervention.date, intervention.savedAt),
      decimalCell(
        evaluation?.updatedAt
          ? getHourDifference(intervention.savedAt, evaluation.updatedAt)
          : null
      ),
    ];
  });

  return {
    autoFilter: true,
    columnWidths: [18, 18, 18, 28, 22, 22, 15, 22, 28, 28, 22, 24, 16, 16, 22, 16, 54, 20, 22, 16, 22, 20, 20, 54, 24, 24],
    freezeHeader: true,
    name: 'Interventions',
    rows: [headerRow(headers), ...rows],
  };
}

function buildOperativeStepsWorksheet(
  input: AnalyticsExportInput,
  interventions: SavedIntervention[],
  references: Map<string, string>
): XlsxWorksheet {
  const headers = [
    'Référence',
    'Prénom interne',
    'Nom interne',
    'Lieu de stage',
    'Prénom senior évaluateur',
    'Nom senior évaluateur',
    'Procédure',
    'Indication',
    "Voie d'abord",
    "Nom de l'étape opératoire",
    'Niveau obtenu (0-4)',
    'Score correspondant (%)',
    'Étape applicable',
  ];
  const rows = interventions.flatMap<XlsxCellValue[]>((intervention) => {
    const evaluation = input.adminEvaluations[intervention.id];
    const internal = getInternalIdentity(input, intervention.internalId);
    const senior = getSeniorIdentity(
      input,
      evaluation?.seniorProfileId ?? intervention.seniorId
    );
    const checklist = getAuthoritativeChecklist(
      intervention,
      evaluation
    );
    const steps = getHistoricalChecklistSteps(
      intervention,
      input.customSurgicalInterventions
    );

    return steps.flatMap<XlsxCellValue[]>((step) => {
      const level = checklist[step.id];

      if (!level) {
        return [];
      }

      const numericLevel = level === 'NA' ? null : Number(level);

      return [[
        references.get(intervention.id) ?? '',
        internal.firstName,
        internal.lastName,
        internal.stageLocation,
        senior.firstName,
        senior.lastName,
        getProcedureLabel(intervention, input.customSurgicalInterventions),
        getIndicationLabel(intervention),
        getApproachLabel(intervention),
        cell(step.label, 'wrap'),
        numericLevel ?? 'NA',
        numericLevel == null ? null : percentageCell(numericLevel / 4),
        level === 'NA' ? 'Non' : 'Oui',
      ]];
    });
  });

  return {
    autoFilter: true,
    columnWidths: [18, 20, 20, 28, 24, 24, 24, 24, 20, 46, 20, 23, 18],
    freezeHeader: true,
    name: 'Étapes opératoires',
    rows: [headerRow(headers), ...rows],
  };
}

function getMeasurementType(entry: ActivityLogEntry) {
  if (entry.analyticsEvent?.kind === 'intervention_form') {
    return "Saisie d'intervention";
  }

  if (entry.analyticsEvent?.kind === 'senior_evaluation') {
    return 'Évaluation senior';
  }

  return '';
}

function getMeasurementAnalyticsEvent(entry: ActivityLogEntry) {
  const event = entry.analyticsEvent;

  return event?.kind === 'intervention_form' || event?.kind === 'senior_evaluation'
    ? event
    : null;
}

function buildUsageRows(
  input: AnalyticsExportInput,
  activities: ActivityLogEntry[]
): XlsxCellValue[][] {
  return activities.map((entry) => {
    const measurement = getMeasurementAnalyticsEvent(entry);
    const actor = getActorIdentity(input, entry);

    return [
      dateTimeCell(entry.createdAt),
      actor.firstName,
      actor.lastName,
      actor.stageLocation,
      entry.actorRole === 'internal' ? 'Interne' : 'Senior',
      entry.action,
      entry.targetType,
      entry.targetLabel,
      getMeasurementType(entry),
      measurement ? decimalCell(measurement.durationMs / 1_000) : null,
      measurement?.clickCount ?? null,
      dateTimeCell(measurement?.completedAt),
      measurement ? 'Oui' : '',
    ];
  });
}

function buildUsageWorksheet(
  input: AnalyticsExportInput,
  activities: ActivityLogEntry[]
): XlsxWorksheet {
  const headers = [
    'Date et heure',
    'Prénom',
    'Nom',
    'Lieu de stage',
    'Rôle',
    'Action réalisée',
    "Type d'élément concerné",
    "Libellé de l'élément concerné",
    'Type de mesure',
    'Durée (secondes)',
    'Nombre de clics',
    'Date et heure de fin',
    'Formulaire terminé',
  ];

  return {
    autoFilter: true,
    columnWidths: [22, 20, 20, 28, 14, 34, 24, 38, 24, 20, 18, 22, 20],
    freezeHeader: true,
    name: 'Usage',
    rows: [headerRow(headers), ...buildUsageRows(input, activities)],
  };
}

function buildProfilesWorksheet(
  input: AnalyticsExportInput,
  periodData: AnalyticsPeriodData
): XlsxWorksheet {
  const headers = [
    'Prénom',
    'Nom',
    'Lieu de stage',
    'Rôle',
    'Promotion',
    'Semestre',
    'Date de création',
    'Dernière connexion',
    'Nombre total de connexions',
  ];
  const internalRows = input.internalProfiles
    .filter((profile) => periodData.internalIds.has(profile.id))
    .map<XlsxCellValue[]>((profile) => [
      profile.firstName,
      profile.lastName,
      profile.institution,
      'Interne',
      profile.promotion,
      profile.semester,
      dateTimeCell(profile.createdAt),
      dateTimeCell(profile.lastLoginAt),
      profile.loginCount ?? 0,
    ]);
  const seniorRows = input.selectableSeniors
    .filter(
      (senior) =>
        senior.id !== 'sen-other' && periodData.seniorIds.has(senior.id)
    )
    .map<XlsxCellValue[]>((senior) => {
      const loginCount = input.activityLog.filter(
        (entry) =>
          entry.actorRole === 'senior' &&
          entry.actorId === senior.id &&
          entry.action === 'Connexion au profil'
      ).length;

      return [
        senior.firstName,
        senior.lastName,
        senior.institution,
        'Senior',
        '',
        '',
        dateTimeCell(senior.createdAt),
        dateTimeCell(senior.lastLoginAt),
        loginCount,
      ];
    });

  return {
    autoFilter: true,
    columnWidths: [20, 20, 28, 14, 16, 14, 22, 22, 26],
    freezeHeader: true,
    name: 'Profils concernés',
    rows: [headerRow(headers), ...internalRows, ...seniorRows],
  };
}

function getPeriodFilenameLabel(period: AnalyticsExportPeriod) {
  return period.replace('d', '-jours').replace('m', '-mois').replace('y', '-an');
}

export function downloadAnalyticsExcel(input: AnalyticsExportInput) {
  const dateStamp = input.generatedAtIso.slice(0, 10);

  return deliverDownloadableFile(
    createAnalyticsWorkbookBlob(input),
    `export-donnees-${getPeriodFilenameLabel(input.period)}-${dateStamp}.xlsx`
  );
}

export function createAnalyticsWorkbookBlob(input: AnalyticsExportInput) {
  return createXlsxBlob(buildAnalyticsWorksheets(input));
}

export function buildAnalyticsWorksheets(input: AnalyticsExportInput) {
  const periodData = getPeriodData(input);
  const references = buildInterventionReferences(periodData.interventions);
  const worksheets: XlsxWorksheet[] = [
    buildSummaryWorksheet(input),
    buildInterventionsWorksheet(input, periodData.interventions, references),
    buildOperativeStepsWorksheet(input, periodData.interventions, references),
    buildUsageWorksheet(input, periodData.activities),
    buildProfilesWorksheet(input, periodData),
  ];

  return worksheets;
}
