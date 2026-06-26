import {
  approachOptions,
  checklistLevelOptions,
  contextOptions,
  entryTechniqueOptions,
  formatComplexityRating,
  formatDisplayName,
  formatSeniorDisplayName,
  getFixedContextForIntervention,
  getChecklistStepsForIntervention,
  getChoiceLabel,
  getInternalById,
  getProcedureOptions,
  getSurgicalInterventionDefinition,
  indicationOptions,
  lateralityOptions,
  roleOptions,
} from '../data/mockData';
import {
  AdminInterventionEvaluation,
  InternalProfile,
  SavedIntervention,
  Senior,
  SurgicalInterventionDefinition,
} from '../types';
import { calculateAutonomyScore } from './autonomyScore';

type ExportRowContext = {
  internal: InternalProfile | null;
  seniorLabel: string;
  checklistStepIds: Set<string>;
  keyStepAutonomyScore: string;
  autonomyScore: number | null;
  adminEvaluation: AdminInterventionEvaluation | undefined;
};

type CsvColumn = {
  header: string;
  getValue: (intervention: SavedIntervention, context: ExportRowContext) => string;
};

function escapeCsvCell(value: string) {
  const normalizedValue = value.replace(/\r?\n/g, ' ').trim();

  if (
    normalizedValue.includes(';') ||
    normalizedValue.includes('"') ||
    normalizedValue.includes(',')
  ) {
    return `"${normalizedValue.replace(/"/g, '""')}"`;
  }

  return normalizedValue;
}

function createCsvRow(values: string[]) {
  return values.map(escapeCsvCell).join(';');
}

function getChecklistValue(intervention: SavedIntervention, stepId: string) {
  const value = intervention.checklist[stepId];

  if (!value) {
    return '';
  }

  return getChoiceLabel(checklistLevelOptions, value, '');
}

const adminPerformanceExportLabels: Record<string, string> = {
  '1': '1 · Interne non préparé',
  '2': '2 · Connaissance insuffisante de la procédure',
  '3': '3 · Performance intermédiaire',
  '4': '4 · Performance compatible avec une future autonomie supervisée',
  '5': '5 · Performance exceptionnelle',
};

const adminCategoryDifficultyExportLabels: Record<string, string> = {
  '1': '1 · Intervention simple',
  '2': '2 · Intervention de difficulté intermédiaire',
  '3': '3 · Intervention difficile',
};

function formatKeyStepAutonomyScore(value: number | null) {
  if (value == null) {
    return '';
  }

  return `${value.toFixed(1).replace('.', ',')} / 4`;
}

function getKeyStepAutonomyScore(
  intervention: SavedIntervention,
  customInterventions: SurgicalInterventionDefinition[]
) {
  const interventionDefinition = getSurgicalInterventionDefinition(
    intervention.procedure,
    customInterventions
  );

  if (!interventionDefinition) {
    return '';
  }

  const keyStepIdSet = new Set(interventionDefinition.keyStepIds);
  const checklistSteps = getChecklistStepsForIntervention(
    intervention.procedure,
    intervention.indication,
    intervention.approach,
    intervention.entryTechnique,
    customInterventions
  );
  const keyScores = checklistSteps
    .filter((step) => keyStepIdSet.has(step.id))
    .map((step) => intervention.checklist[step.id])
    .filter((level): level is '0' | '1' | '2' | '3' | '4' =>
      ['0', '1', '2', '3', '4'].includes(level ?? '')
    )
    .map((level) => Number(level));

  if (keyScores.length === 0) {
    return '';
  }

  return formatKeyStepAutonomyScore(
    keyScores.reduce((total, score) => total + score, 0) / keyScores.length
  );
}

export function downloadInterventionsCsv(
  interventions: SavedIntervention[],
  internalProfiles: InternalProfile[],
  customInterventions: SurgicalInterventionDefinition[] = [],
  adminEvaluations: Record<string, AdminInterventionEvaluation> = {},
  selectableSeniors: Senior[] = []
) {
  if (interventions.length === 0) {
    return;
  }

  const hasIndication = interventions.some(
    (intervention) =>
      intervention.indication !== null ||
      (intervention.customIndication?.trim().length ?? 0) > 0
  );
  const hasIndicationComment = interventions.some(
    (intervention) => intervention.indicationComment.trim().length > 0
  );
  const hasApproach = interventions.some((intervention) => intervention.approach !== null);
  const hasEntryTechnique = interventions.some(
    (intervention) => intervention.entryTechnique !== null
  );
  const hasLaterality = interventions.some((intervention) => intervention.laterality !== null);
  const procedureOptions = getProcedureOptions(customInterventions);
  const activeChecklistColumns = new Map<
    string,
    { procedureLabel: string; stepId: string; stepLabel: string }
  >();

  interventions.forEach((intervention) => {
    const checklistSteps = getChecklistStepsForIntervention(
      intervention.procedure,
      intervention.indication,
      intervention.approach,
      intervention.entryTechnique,
      customInterventions
    );
    const procedureLabel = getChoiceLabel(
      procedureOptions,
      intervention.procedure,
      intervention.procedure
    );

    checklistSteps.forEach((step) => {
      activeChecklistColumns.set(`${intervention.procedure}:${step.id}`, {
        procedureLabel,
        stepId: step.id,
        stepLabel: step.label,
      });
    });
  });

  const checklistColumns: CsvColumn[] = Array.from(
    activeChecklistColumns.values()
  ).map((column) => ({
    header: `Checklist ${column.procedureLabel} - ${column.stepLabel}`,
    getValue: (intervention: SavedIntervention, context: ExportRowContext) =>
      context.checklistStepIds.has(column.stepId)
        ? getChecklistValue(intervention, column.stepId)
        : '',
  }));

  const columns: CsvColumn[] = [
    {
      header: 'Date du bloc',
      getValue: (intervention) => intervention.date,
    },
    {
      header: 'Enregistrée le',
      getValue: (intervention) => intervention.savedAt,
    },
    {
      header: 'Interne',
      getValue: (_intervention, context) =>
        context.internal
          ? formatDisplayName(context.internal.firstName, context.internal.lastName)
          : '',
    },
    {
      header: 'Promotion',
      getValue: (_intervention, context) => context.internal?.promotion ?? '',
    },
    {
      header: 'Semestre',
      getValue: (_intervention, context) => context.internal?.semester ?? '',
    },
    {
      header: 'Stage actuel',
      getValue: (_intervention, context) => context.internal?.currentRotation ?? '',
    },
    {
      header: 'Senior',
      getValue: (_intervention, context) => context.seniorLabel,
    },
    {
      header: 'Intervention',
      getValue: (intervention) =>
        getChoiceLabel(procedureOptions, intervention.procedure, ''),
    },
    ...(hasIndication
      ? [
          {
            header: 'Indication',
            getValue: (intervention: SavedIntervention) =>
              intervention.customIndication?.trim() ||
              getChoiceLabel(indicationOptions, intervention.indication, ''),
          },
        ]
      : []),
    ...(hasIndicationComment
      ? [
          {
            header: 'Précision indication',
            getValue: (intervention: SavedIntervention) =>
              intervention.indicationComment.trim(),
          },
        ]
      : []),
    ...(hasApproach
      ? [
          {
            header: 'Voie d’abord',
            getValue: (intervention: SavedIntervention) =>
              getChoiceLabel(approachOptions, intervention.approach, ''),
          },
        ]
      : []),
    ...(hasEntryTechnique
      ? [
          {
            header: 'Technique d’entrée',
            getValue: (intervention: SavedIntervention) =>
              getChoiceLabel(entryTechniqueOptions, intervention.entryTechnique, ''),
          },
        ]
      : []),
    ...(hasLaterality
      ? [
          {
            header: 'Latéralité',
            getValue: (intervention: SavedIntervention) =>
              getChoiceLabel(lateralityOptions, intervention.laterality, ''),
          },
        ]
      : []),
    {
      header: 'Contexte',
      getValue: (intervention) =>
        getChoiceLabel(
          contextOptions,
          intervention.context ??
            getFixedContextForIntervention(
              intervention.procedure,
              intervention.indication
            ),
          ''
        ),
    },
    {
      header: 'Difficulté ressentie',
      getValue: (intervention) =>
        formatComplexityRating(intervention.complexity, ''),
    },
    {
      header: 'Rôle global',
      getValue: (intervention) => getChoiceLabel(roleOptions, intervention.role, ''),
    },
    {
      header: 'Score autonomie temps opératoires clés',
      getValue: (_intervention, context) => context.keyStepAutonomyScore,
    },
    {
      header: 'Score d’autonomie opératoire',
      getValue: (_intervention, context) =>
        context.autonomyScore == null ? '' : `${context.autonomyScore}`,
    },
    {
      header: 'Performance chirurgicale globale',
      getValue: (_intervention, context) =>
        context.adminEvaluation?.globalPerformance
          ? adminPerformanceExportLabels[
              context.adminEvaluation.globalPerformance
            ] ?? context.adminEvaluation.globalPerformance
          : '',
    },
    {
      header: 'Difficulté chirurgicale intra-catégorie',
      getValue: (_intervention, context) =>
        context.adminEvaluation?.categoryDifficulty
          ? adminCategoryDifficultyExportLabels[
              context.adminEvaluation.categoryDifficulty
            ] ?? context.adminEvaluation.categoryDifficulty
          : '',
    },
    ...checklistColumns,
  ];

  const headers = columns.map((column) => column.header);

  const rows = interventions.map((intervention) => {
    const internal = getInternalById(intervention.internalId, internalProfiles);
    const senior =
      selectableSeniors.find((item) => item.id === intervention.seniorId) ??
      null;
    const checklistSteps = getChecklistStepsForIntervention(
      intervention.procedure,
      intervention.indication,
      intervention.approach,
      intervention.entryTechnique,
      customInterventions
    );
    const context: ExportRowContext = {
      internal,
      seniorLabel: senior ? formatSeniorDisplayName(senior) : '',
      checklistStepIds: new Set(checklistSteps.map((step) => step.id)),
      keyStepAutonomyScore: getKeyStepAutonomyScore(
        intervention,
        customInterventions
      ),
      autonomyScore:
        calculateAutonomyScore(
          intervention,
          customInterventions,
          adminEvaluations[intervention.id]
        ) ?? intervention.autonomyScore,
      adminEvaluation: adminEvaluations[intervention.id],
    };

    return createCsvRow(
      columns.map((column) => column.getValue(intervention, context))
    );
  });

  const csvContent = `\uFEFF${createCsvRow(headers)}\n${rows.join('\n')}`;
  const blob = new Blob([csvContent], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateStamp = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = `journal-de-bord-interventions-${dateStamp}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}
