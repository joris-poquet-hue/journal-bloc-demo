import {
  approachOptions,
  checklistLevelOptions,
  entryTechniqueOptions,
  formatComplexityRating,
  getChoiceLabel,
  getHistoricalChecklistSteps,
  getHistoricalProcedureLabel,
  getInternalById,
  indicationOptions,
  lateralityOptions,
  roleOptions,
} from '../data/mockData';
import { getClinicalContextSummaryRows } from '../data/contextVariables';
import type {
  AdminInterventionEvaluation,
  InternalProfile,
  SavedIntervention,
  Senior,
  SurgicalInterventionDefinition,
} from '../types';
import {
  calculateAutonomyScore,
  calculateKeyStepAutonomyAverage,
} from './autonomyScore';
import { getAuthoritativeChecklist } from './evaluationChecklist';
import {
  getCalendarDayDifference,
  getHourDifference,
  hasCompleteEvaluation,
} from './exportMetrics';
import {
  createXlsxBlob,
  downloadXlsxWorkbook,
  type XlsxCell,
  type XlsxCellStyle,
  type XlsxCellValue,
  type XlsxWorksheet,
} from './xlsx';

export type InterventionExportAudience = 'admin' | 'internal' | 'senior';

export type InterventionExportOptions = {
  audience?: InterventionExportAudience;
  generatedAtIso?: string;
  scopeLabel?: string;
};

type ExportIdentity = {
  firstName: string;
  lastName: string;
  stageLocation: string;
};

type InterventionExportContext = {
  approachLabel: string;
  autonomyScore: number | null;
  calendarRecordingDelayDays: number | null;
  clinicalContextLabel: string;
  entryTechniqueLabel: string;
  evaluation: AdminInterventionEvaluation | undefined;
  evaluationDelayHours: number | null;
  indicationLabel: string;
  internal: ExportIdentity;
  internalDifficultyLabel: string;
  keyStepAutonomyScore: number | null;
  lateralityLabel: string;
  procedureLabel: string;
  roleLabel: string;
  senior: ExportIdentity;
};

const performanceLabels: Record<string, string> = {
  '1': 'Interne non préparé',
  '2': 'Connaissance insuffisante de la procédure',
  '3': 'Performance intermédiaire',
  '4': 'Performance compatible avec une future autonomie supervisée',
  '5': 'Performance exceptionnelle',
};

const seniorDifficultyLabels: Record<string, string> = {
  '1': 'Intervention simple',
  '2': 'Intervention de difficulté intermédiaire',
  '3': 'Intervention difficile',
};

function cell(value: XlsxCell['value'], style?: XlsxCellStyle): XlsxCell {
  return { style, value };
}

function headerRow(headers: string[]) {
  return headers.map((header) => cell(header, 'header'));
}

function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));

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
  return value == null || Number.isNaN(value) ? null : cell(value, 'decimal');
}

function percentageCell(value: number | null) {
  return value == null || Number.isNaN(value)
    ? null
    : cell(value, 'percentage');
}

function average(values: Array<number | null>) {
  const availableValues = values.filter((value): value is number => value != null);

  if (availableValues.length === 0) {
    return null;
  }

  return (
    availableValues.reduce((total, value) => total + value, 0) /
    availableValues.length
  );
}

function getSeniorById(
  seniorId: string | null | undefined,
  selectableSeniors: Senior[]
) {
  if (!seniorId || seniorId === 'sen-other') {
    return null;
  }

  return selectableSeniors.find((senior) => senior.id === seniorId) ?? null;
}

function getInternalIdentity(
  internalId: string | null,
  internalProfiles: InternalProfile[]
): ExportIdentity {
  const internal = internalId
    ? getInternalById(internalId, internalProfiles)
    : null;

  return internal
    ? {
        firstName: internal.firstName,
        lastName: internal.lastName,
        stageLocation: internal.institution,
      }
    : {
        firstName: 'Profil indisponible',
        lastName: '',
        stageLocation: '',
      };
}

function getSeniorIdentity(
  seniorId: string | null | undefined,
  selectableSeniors: Senior[]
): ExportIdentity {
  const senior = getSeniorById(seniorId, selectableSeniors);

  return senior
    ? {
        firstName: senior.firstName,
        lastName: senior.lastName,
        stageLocation: senior.institution,
      }
    : {
        firstName: 'Non renseigné',
        lastName: '',
        stageLocation: '',
      };
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

function getChecklistLabel(value: string | null | undefined) {
  if (!value) {
    return '';
  }

  return (
    checklistLevelOptions.find((option) => option.value === value)?.description ?? ''
  );
}

function buildInterventionContext(
  intervention: SavedIntervention,
  internalProfiles: InternalProfile[],
  customInterventions: SurgicalInterventionDefinition[],
  adminEvaluations: Record<string, AdminInterventionEvaluation>,
  selectableSeniors: Senior[]
): InterventionExportContext {
  const evaluation = adminEvaluations[intervention.id];
  const evaluationSeniorId =
    evaluation?.seniorProfileId ?? intervention.seniorId;

  return {
    approachLabel: getChoiceLabel(
      approachOptions,
      intervention.approach,
      'Non renseignée'
    ),
    autonomyScore: calculateAutonomyScore(
      intervention,
      customInterventions,
      evaluation
    ),
    calendarRecordingDelayDays: getCalendarDayDifference(
      intervention.date,
      intervention.savedAt
    ),
    clinicalContextLabel: getClinicalContextSummaryRows(
      intervention.contextVariables
    )
      .map((row) => `${row.label} : ${row.value}`)
      .join(' | '),
    entryTechniqueLabel: getChoiceLabel(
      entryTechniqueOptions,
      intervention.entryTechnique,
      ''
    ),
    evaluation,
    evaluationDelayHours: evaluation?.updatedAt
      ? getHourDifference(intervention.savedAt, evaluation.updatedAt)
      : null,
    indicationLabel: getIndicationLabel(intervention),
    internal: getInternalIdentity(intervention.internalId, internalProfiles),
    internalDifficultyLabel: formatComplexityRating(
      intervention.complexity,
      ''
    ),
    keyStepAutonomyScore: calculateKeyStepAutonomyAverage(
      intervention,
      customInterventions,
      evaluation
    ),
    lateralityLabel: getChoiceLabel(
      lateralityOptions,
      intervention.laterality,
      ''
    ),
    procedureLabel: getHistoricalProcedureLabel(
      intervention,
      customInterventions,
      intervention.procedure
    ),
    roleLabel: getChoiceLabel(roleOptions, intervention.role, ''),
    senior: getSeniorIdentity(evaluationSeniorId, selectableSeniors),
  };
}

function getScopeLabel(audience: InterventionExportAudience) {
  if (audience === 'admin') {
    return 'Sélection administrateur';
  }

  if (audience === 'senior') {
    return 'Internes actifs du même lieu de stage';
  }

  return "Données de l'interne connecté";
}

export function getInterventionsExportFilename(
  audience: InterventionExportAudience,
  generatedAtIso: string
) {
  const dateStamp = generatedAtIso.slice(0, 10);

  if (audience === 'admin') {
    return `export-interventions-${dateStamp}.xlsx`;
  }

  if (audience === 'senior') {
    return `statistiques-etablissement-${dateStamp}.xlsx`;
  }

  return `mes-statistiques-${dateStamp}.xlsx`;
}

export function buildInterventionsWorksheets(
  interventions: SavedIntervention[],
  internalProfiles: InternalProfile[],
  customInterventions: SurgicalInterventionDefinition[] = [],
  adminEvaluations: Record<string, AdminInterventionEvaluation> = {},
  selectableSeniors: Senior[] = [],
  options: InterventionExportOptions = {}
): XlsxWorksheet[] {
  const audience = options.audience ?? 'internal';
  const generatedAtIso = options.generatedAtIso ?? new Date().toISOString();
  const references = new Map(
    interventions.map((intervention, index) => [
      intervention.id,
      `BLOC-${String(index + 1).padStart(6, '0')}`,
    ])
  );
  const contexts = new Map(
    interventions.map((intervention) => [
      intervention.id,
      buildInterventionContext(
        intervention,
        internalProfiles,
        customInterventions,
        adminEvaluations,
        selectableSeniors
      ),
    ])
  );
  const evaluatedCount = interventions.filter((intervention) =>
    hasCompleteEvaluation(adminEvaluations[intervention.id])
  ).length;
  const recordingDelays = interventions.map(
    (intervention) => contexts.get(intervention.id)?.calendarRecordingDelayDays ?? null
  );
  const evaluationDelays = interventions.map(
    (intervention) => contexts.get(intervention.id)?.evaluationDelayHours ?? null
  );
  const summaryRows: XlsxCellValue[][] = [
    [cell("Export des statistiques opératoires", 'title'), cell(null, 'title')],
    ['Portée', options.scopeLabel ?? getScopeLabel(audience)],
    ['Généré le', dateTimeCell(generatedAtIso)],
    [],
    [cell('Indicateurs de la sélection', 'section'), cell('Valeur', 'section')],
    ['Interventions exportées', interventions.length],
    ['Interventions évaluées à la date de l’export', evaluatedCount],
    [
      "Taux d'évaluation de la sélection",
      percentageCell(
        interventions.length > 0 ? evaluatedCount / interventions.length : 0
      ),
    ],
    [
      'Délai moyen intervention → saisie (jours calendaires)',
      decimalCell(average(recordingDelays)),
    ],
    [
      'Délai moyen saisie → évaluation (heures)',
      decimalCell(average(evaluationDelays)),
    ],
  ];
  const interventionHeaders = [
    'Référence',
    'Prénom interne',
    'Nom interne',
    'Lieu de stage',
    'Prénom senior',
    'Nom senior',
    "Date de l'intervention",
    "Date et heure de saisie",
    'Délai intervention → saisie (jours calendaires)',
    'Intervention',
    'Indication',
    "Voie d'abord",
    "Technique d'entrée",
    'Latéralité',
    "Rôle de l'interne",
    "Difficulté ressentie par l'interne",
    'Variables de contexte clinique',
    "Score d'autonomie final (%)",
    "Statut de l'évaluation",
  ];
  const interventionRows = interventions.map<XlsxCellValue[]>((intervention) => {
    const context = contexts.get(intervention.id) as InterventionExportContext;

    return [
      references.get(intervention.id) ?? '',
      context.internal.firstName,
      context.internal.lastName,
      context.internal.stageLocation,
      context.senior.firstName,
      context.senior.lastName,
      dateCell(intervention.date),
      dateTimeCell(intervention.savedAt),
      context.calendarRecordingDelayDays,
      context.procedureLabel,
      context.indicationLabel,
      context.approachLabel,
      context.entryTechniqueLabel,
      context.lateralityLabel,
      context.roleLabel,
      context.internalDifficultyLabel,
      cell(context.clinicalContextLabel, 'wrap'),
      decimalCell(context.autonomyScore),
      hasCompleteEvaluation(context.evaluation) ? 'Évaluée' : 'En attente',
    ];
  });
  const evaluationHeaders = [
    'Référence',
    'Prénom interne',
    'Nom interne',
    'Lieu de stage',
    'Prénom senior évaluateur',
    'Nom senior évaluateur',
    "Date et heure de l'évaluation",
    'Délai saisie → évaluation (heures)',
    'Performance globale (1-5)',
    'Libellé de la performance globale',
    'Difficulté senior (1-3)',
    'Libellé de la difficulté senior',
    'Commentaire senior',
    "Score d'autonomie final (%)",
    'Score des étapes clés (0-4)',
  ];
  const evaluationRows = interventions.map<XlsxCellValue[]>((intervention) => {
    const context = contexts.get(intervention.id) as InterventionExportContext;
    const evaluation = context.evaluation;

    return [
      references.get(intervention.id) ?? '',
      context.internal.firstName,
      context.internal.lastName,
      context.internal.stageLocation,
      context.senior.firstName,
      context.senior.lastName,
      dateTimeCell(evaluation?.updatedAt),
      decimalCell(context.evaluationDelayHours),
      evaluation?.globalPerformance ? Number(evaluation.globalPerformance) : null,
      evaluation?.globalPerformance
        ? performanceLabels[evaluation.globalPerformance] ?? ''
        : '',
      evaluation?.categoryDifficulty ? Number(evaluation.categoryDifficulty) : null,
      evaluation?.categoryDifficulty
        ? seniorDifficultyLabels[evaluation.categoryDifficulty] ?? ''
        : '',
      cell(evaluation?.seniorComment ?? '', 'wrap'),
      decimalCell(context.autonomyScore),
      decimalCell(context.keyStepAutonomyScore),
    ];
  });
  const stepHeaders = [
    'Référence',
    'Prénom interne',
    'Nom interne',
    'Lieu de stage',
    'Prénom senior évaluateur',
    'Nom senior évaluateur',
    'Intervention',
    "Ordre de l'étape",
    "Nom de l'étape opératoire",
    'Niveau obtenu (0-4)',
    'Libellé du niveau',
    'Étape applicable',
  ];
  const stepRows = interventions.flatMap<XlsxCellValue[]>((intervention) => {
    const context = contexts.get(intervention.id) as InterventionExportContext;
    const checklist = getAuthoritativeChecklist(intervention, context.evaluation);
    const steps = getHistoricalChecklistSteps(
      intervention,
      customInterventions
    );

    return steps.map<XlsxCellValue[]>((step, index) => {
      const level = checklist[step.id];

      return [
        references.get(intervention.id) ?? '',
        context.internal.firstName,
        context.internal.lastName,
        context.internal.stageLocation,
        context.senior.firstName,
        context.senior.lastName,
        context.procedureLabel,
        index + 1,
        cell(step.label, 'wrap'),
        level && level !== 'NA' ? Number(level) : null,
        getChecklistLabel(level),
        level === 'NA' ? 'Non' : 'Oui',
      ];
    });
  });

  return [
    {
      columnWidths: [58, 24],
      name: 'Synthèse',
      rows: summaryRows,
    },
    {
      autoFilter: true,
      columnWidths: [18, 20, 20, 28, 20, 20, 16, 22, 24, 30, 28, 24, 26, 18, 20, 26, 54, 22, 20],
      freezeHeader: true,
      name: 'Interventions',
      rows: [headerRow(interventionHeaders), ...interventionRows],
    },
    {
      autoFilter: true,
      columnWidths: [18, 20, 20, 28, 24, 24, 24, 22, 22, 48, 20, 42, 54, 22, 22],
      freezeHeader: true,
      name: 'Évaluations',
      rows: [headerRow(evaluationHeaders), ...evaluationRows],
    },
    {
      autoFilter: true,
      columnWidths: [18, 20, 20, 28, 24, 24, 30, 18, 54, 20, 42, 18],
      freezeHeader: true,
      name: 'Étapes opératoires',
      rows: [headerRow(stepHeaders), ...stepRows],
    },
  ];
}

export function createInterventionsWorkbookBlob(
  interventions: SavedIntervention[],
  internalProfiles: InternalProfile[],
  customInterventions: SurgicalInterventionDefinition[] = [],
  adminEvaluations: Record<string, AdminInterventionEvaluation> = {},
  selectableSeniors: Senior[] = [],
  options: InterventionExportOptions = {}
) {
  return createXlsxBlob(
    buildInterventionsWorksheets(
      interventions,
      internalProfiles,
      customInterventions,
      adminEvaluations,
      selectableSeniors,
      options
    )
  );
}

export async function downloadInterventionsXlsx(
  interventions: SavedIntervention[],
  internalProfiles: InternalProfile[],
  customInterventions: SurgicalInterventionDefinition[] = [],
  adminEvaluations: Record<string, AdminInterventionEvaluation> = {},
  selectableSeniors: Senior[] = [],
  options: InterventionExportOptions = {}
) {
  if (interventions.length === 0) {
    return 0;
  }

  const generatedAtIso = options.generatedAtIso ?? new Date().toISOString();
  const audience = options.audience ?? 'internal';

  await downloadXlsxWorkbook(
    buildInterventionsWorksheets(
      interventions,
      internalProfiles,
      customInterventions,
      adminEvaluations,
      selectableSeniors,
      { ...options, audience, generatedAtIso }
    ),
    getInterventionsExportFilename(audience, generatedAtIso)
  );
  return interventions.length;
}
