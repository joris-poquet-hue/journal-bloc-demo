import {
  approachOptions,
  checklistLevelOptions,
  colpoclesisChecklistSteps,
  complexityOptions,
  contextOptions,
  entryTechniqueOptions,
  formatDisplayName,
  getFixedContextForIntervention,
  getChecklistStepsForIntervention,
  getChoiceLabel,
  getInternalById,
  getSeniorById,
  indicationOptions,
  lateralityOptions,
  procedureOptions,
  roleOptions,
  salpingectomyChecklistSteps,
} from '../data/mockData';
import { InternalProfile, SavedIntervention } from '../types';

type ExportRowContext = {
  internal: InternalProfile | null;
  seniorLabel: string;
  checklistStepIds: Set<string>;
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

export function downloadInterventionsCsv(
  interventions: SavedIntervention[],
  internalProfiles: InternalProfile[]
) {
  if (interventions.length === 0) {
    return;
  }

  const hasIndication = interventions.some((intervention) => intervention.indication !== null);
  const hasIndicationComment = interventions.some(
    (intervention) => intervention.indicationComment.trim().length > 0
  );
  const hasApproach = interventions.some((intervention) => intervention.approach !== null);
  const hasEntryTechnique = interventions.some(
    (intervention) => intervention.entryTechnique !== null
  );
  const hasLaterality = interventions.some((intervention) => intervention.laterality !== null);
  const activeSalpingectomyStepIds = new Set<string>();
  const activeColpoclesisStepIds = new Set<string>();

  interventions.forEach((intervention) => {
    const checklistSteps = getChecklistStepsForIntervention(
      intervention.procedure,
      intervention.indication,
      intervention.approach,
      intervention.entryTechnique
    );

    checklistSteps.forEach((step) => {
      if (intervention.procedure === 'salpingectomie') {
        activeSalpingectomyStepIds.add(step.id);
        return;
      }

      if (intervention.procedure === 'colpoclesis') {
        activeColpoclesisStepIds.add(step.id);
      }
    });
  });

  const checklistColumns: CsvColumn[] = [
    ...salpingectomyChecklistSteps
      .filter((step) => activeSalpingectomyStepIds.has(step.id))
      .map((step) => ({
        header: `Checklist salpingectomie - ${step.label}`,
        getValue: (intervention: SavedIntervention, context: ExportRowContext) =>
          context.checklistStepIds.has(step.id) ? getChecklistValue(intervention, step.id) : '',
      })),
    ...colpoclesisChecklistSteps
      .filter((step) => activeColpoclesisStepIds.has(step.id))
      .map((step) => ({
        header: `Checklist colpoclésis - ${step.label}`,
        getValue: (intervention: SavedIntervention, context: ExportRowContext) =>
          context.checklistStepIds.has(step.id) ? getChecklistValue(intervention, step.id) : '',
      })),
  ];

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
      header: 'Difficulté',
      getValue: (intervention) =>
        getChoiceLabel(complexityOptions, intervention.complexity, ''),
    },
    {
      header: 'Rôle global',
      getValue: (intervention) => getChoiceLabel(roleOptions, intervention.role, ''),
    },
    ...checklistColumns,
  ];

  const headers = columns.map((column) => column.header);

  const rows = interventions.map((intervention) => {
    const internal = getInternalById(intervention.internalId, internalProfiles);
    const senior = getSeniorById(intervention.seniorId);
    const checklistSteps = getChecklistStepsForIntervention(
      intervention.procedure,
      intervention.indication,
      intervention.approach,
      intervention.entryTechnique
    );
    const context: ExportRowContext = {
      internal,
      seniorLabel: senior ? `${senior.firstName} ${senior.lastName}` : '',
      checklistStepIds: new Set(checklistSteps.map((step) => step.id)),
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
