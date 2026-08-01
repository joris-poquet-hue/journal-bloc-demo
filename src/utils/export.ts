import {
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
  indicationOptions,
  lateralityOptions,
  roleOptions,
} from '../data/mockData';
import { getClinicalContextSummaryRows } from '../data/contextVariables';
import {
  AdminInterventionEvaluation,
  InternalProfile,
  SavedIntervention,
  Senior,
  SurgicalInterventionDefinition,
} from '../types';
import { calculateAutonomyScore } from './autonomyScore';
import { getAuthoritativeChecklist } from './evaluationChecklist';
import { buildSeniorInstitutionExportScope } from './seniorExportScope';

type WorksheetData = {
  name: string;
  headers: string[];
  rows: string[][];
};

type InterventionExportContext = {
  internal: InternalProfile | null;
  internalLabel: string;
  seniorLabel: string;
  procedureLabel: string;
  indicationLabel: string;
  approachLabel: string;
  entryTechniqueLabel: string;
  lateralityLabel: string;
  roleLabel: string;
  internalDifficultyLabel: string;
  seniorDifficultyLabel: string;
  seniorPerformanceLabel: string;
  evaluationTimestamp: string;
  evaluationStatusLabel: string;
  keyStepAutonomyScore: string;
  autonomyScore: number | null;
  delayBeforeEvaluationHours: string;
  delayBeforeEvaluationDays: string;
  currentWaitingHours: string;
  checklistSteps: ReturnType<typeof getHistoricalChecklistSteps>;
  adminEvaluation: AdminInterventionEvaluation | undefined;
};

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

function normalizeExportCell(value: string) {
  return value.replace(/\r?\n/g, ' ').trim();
}

function escapeXmlCell(value: string) {
  return normalizeExportCell(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function getChecklistValue(
  intervention: SavedIntervention,
  stepId: string,
  evaluation?: AdminInterventionEvaluation
) {
  const value = getAuthoritativeChecklist(intervention, evaluation)[stepId];

  if (!value) {
    return '';
  }

  if (value === 'NA') {
    return 'NA';
  }

  return getChoiceLabel(checklistLevelOptions, value, '');
}

function formatKeyStepAutonomyScore(value: number | null) {
  if (value == null) {
    return '';
  }

  return `${value.toFixed(1).replace('.', ',')} / 4`;
}

function getKeyStepAutonomyScore(
  intervention: SavedIntervention,
  customInterventions: SurgicalInterventionDefinition[],
  evaluation?: AdminInterventionEvaluation
) {
  const interventionDefinition = getSurgicalInterventionDefinition(
    intervention.procedure,
    customInterventions
  );

  if (!interventionDefinition) {
    return '';
  }

  const keyStepIdSet = new Set(interventionDefinition.keyStepIds);
  const checklistSteps = getHistoricalChecklistSteps(
    intervention,
    customInterventions
  );
  const checklist = getAuthoritativeChecklist(intervention, evaluation);
  const keyScores = checklistSteps
    .filter((step) =>
      'scored' in step ? Boolean(step.scored) : keyStepIdSet.has(step.id)
    )
    .map((step) => checklist[step.id])
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

function formatHoursDecimal(value: number | null) {
  if (value == null || Number.isNaN(value)) {
    return '';
  }

  return `${value.toFixed(1).replace('.', ',')} h`;
}

function formatDaysDecimal(value: number | null) {
  if (value == null || Number.isNaN(value)) {
    return '';
  }

  return `${value.toFixed(1).replace('.', ',')} j`;
}

function getHourDifference(startAt: string, endAt: string) {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();

  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return null;
  }

  return (end - start) / (1000 * 60 * 60);
}

function buildWorkbookXml(worksheets: WorksheetData[]) {
  const worksheetXml = worksheets
    .map(
      (worksheet) => `
  <Worksheet ss:Name="${escapeXmlCell(worksheet.name)}">
    <Table>
      <Row>
        ${worksheet.headers
          .map(
            (header) =>
              `<Cell><Data ss:Type="String">${escapeXmlCell(header)}</Data></Cell>`
          )
          .join('')}
      </Row>
      ${worksheet.rows
        .map(
          (row) => `
      <Row>
        ${row
          .map(
            (cell) =>
              `<Cell><Data ss:Type="String">${escapeXmlCell(cell)}</Data></Cell>`
          )
          .join('')}
      </Row>`
        )
        .join('')}
    </Table>
  </Worksheet>`
    )
    .join('');

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
  <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
    <Author>Codex</Author>
    <Created>${new Date().toISOString()}</Created>
  </DocumentProperties>
  <ExcelWorkbook xmlns="urn:schemas-microsoft-com:office:excel">
    <ProtectStructure>False</ProtectStructure>
    <ProtectWindows>False</ProtectWindows>
  </ExcelWorkbook>
  ${worksheetXml}
</Workbook>`;
}

function buildInterventionContext(
  intervention: SavedIntervention,
  internalProfiles: InternalProfile[],
  customInterventions: SurgicalInterventionDefinition[],
  adminEvaluations: Record<string, AdminInterventionEvaluation>,
  selectableSeniors: Senior[]
): InterventionExportContext {
  const internal = getInternalById(intervention.internalId, internalProfiles);
  const senior =
    selectableSeniors.find((item) => item.id === intervention.seniorId) ?? null;
  const adminEvaluation = adminEvaluations[intervention.id];
  const checklistSteps = getHistoricalChecklistSteps(
    intervention,
    customInterventions
  );
  const evaluationTimestamp = adminEvaluation?.updatedAt ?? '';
  const delayBeforeEvaluationHours = evaluationTimestamp
    ? formatHoursDecimal(getHourDifference(intervention.savedAt, evaluationTimestamp))
    : '';
  const delayBeforeEvaluationDays = evaluationTimestamp
    ? formatDaysDecimal(
        (() => {
          const hours = getHourDifference(intervention.savedAt, evaluationTimestamp);
          return hours == null ? null : hours / 24;
        })()
      )
    : '';
  const currentWaitingHours = evaluationTimestamp
    ? ''
    : formatHoursDecimal(getHourDifference(intervention.savedAt, new Date().toISOString()));

  return {
    internal,
    internalLabel: internal
      ? formatDisplayName(internal.firstName, internal.lastName)
      : 'Interne non retrouvé',
    seniorLabel: senior ? formatSeniorDisplayName(senior) : 'Non renseigné',
    procedureLabel: getHistoricalProcedureLabel(
      intervention,
      customInterventions,
      intervention.procedure
    ),
    indicationLabel:
      intervention.customIndication?.trim() ||
      getChoiceLabel(indicationOptions, intervention.indication, ''),
    approachLabel: getChoiceLabel(
      approachOptions,
      intervention.approach,
      'Non renseignée'
    ),
    entryTechniqueLabel: getChoiceLabel(
      entryTechniqueOptions,
      intervention.entryTechnique,
      ''
    ),
    lateralityLabel: getChoiceLabel(lateralityOptions, intervention.laterality, ''),
    roleLabel: getChoiceLabel(roleOptions, intervention.role, ''),
    internalDifficultyLabel: formatComplexityRating(intervention.complexity, ''),
    seniorDifficultyLabel: adminEvaluation?.categoryDifficulty
      ? adminCategoryDifficultyExportLabels[adminEvaluation.categoryDifficulty] ??
        adminEvaluation.categoryDifficulty
      : '',
    seniorPerformanceLabel: adminEvaluation?.globalPerformance
      ? adminPerformanceExportLabels[adminEvaluation.globalPerformance] ??
        adminEvaluation.globalPerformance
      : '',
    evaluationTimestamp,
    evaluationStatusLabel:
      adminEvaluation?.globalPerformance && adminEvaluation.categoryDifficulty
        ? 'Évaluée'
        : 'En attente',
    keyStepAutonomyScore: getKeyStepAutonomyScore(
      intervention,
      customInterventions,
      adminEvaluation
    ),
    autonomyScore:
      calculateAutonomyScore(
        intervention,
        customInterventions,
        adminEvaluation
      ),
    delayBeforeEvaluationHours,
    delayBeforeEvaluationDays,
    currentWaitingHours,
    checklistSteps,
    adminEvaluation,
  };
}

function createSummaryWorksheet(
  interventions: SavedIntervention[],
  internalProfiles: InternalProfile[],
  customInterventions: SurgicalInterventionDefinition[],
  adminEvaluations: Record<string, AdminInterventionEvaluation>,
  selectableSeniors: Senior[]
): WorksheetData {
  return {
    name: 'Synthese blocs',
    headers: [
      'ID intervention',
      'Date du bloc',
      'Heure de début du bloc',
      'Durée opératoire en minutes',
      'Date et heure d’enregistrement par l’interne',
      'Date et heure d’évaluation par le senior',
      'Délai avant évaluation senior en heures',
      'Interne',
      'Senior',
      'Intervention',
      'Indication',
      'Voie d’abord',
      'Technique d’entrée',
      'Latéralité',
      'Rôle de l’interne',
      'Score d’autonomie final',
      'Score autonomie temps opératoires clés',
      'Difficulté ressentie interne',
      'Variables de contexte clinique',
      'Difficulté senior',
      'Performance senior',
    ],
    rows: interventions.map((intervention) => {
      const context = buildInterventionContext(
        intervention,
        internalProfiles,
        customInterventions,
        adminEvaluations,
        selectableSeniors
      );

      return [
        intervention.id,
        intervention.date,
        intervention.startTime ?? '',
        intervention.operativeDurationMinutes == null
          ? ''
          : `${intervention.operativeDurationMinutes}`,
        intervention.savedAt,
        context.evaluationTimestamp || 'Non évaluée',
        context.delayBeforeEvaluationHours || 'En attente',
        context.internalLabel,
        context.seniorLabel,
        context.procedureLabel,
        context.indicationLabel,
        context.approachLabel,
        context.entryTechniqueLabel,
        context.lateralityLabel,
        context.roleLabel,
        context.autonomyScore == null ? '' : `${context.autonomyScore}`,
        context.keyStepAutonomyScore,
        context.internalDifficultyLabel,
        getClinicalContextSummaryRows(intervention.contextVariables)
          .map((row) => `${row.label} : ${row.value}`)
          .join(' | '),
        context.seniorDifficultyLabel,
        context.seniorPerformanceLabel,
      ];
    }),
  };
}

function createInternalDataWorksheet(
  interventions: SavedIntervention[],
  internalProfiles: InternalProfile[],
  customInterventions: SurgicalInterventionDefinition[],
  adminEvaluations: Record<string, AdminInterventionEvaluation>
): WorksheetData {
  return {
    name: 'Donnees internes',
    headers: [
      'ID intervention',
      'Interne',
      'Intervention',
      'Date du bloc',
      'Difficulté ressentie',
      'Étape opératoire',
      'Niveau autonomie Senior',
    ],
    rows: interventions.flatMap((intervention) => {
      const internal = getInternalById(intervention.internalId, internalProfiles);
      const internalLabel = internal
        ? formatDisplayName(internal.firstName, internal.lastName)
        : 'Interne non retrouvé';
      const procedureLabel = getHistoricalProcedureLabel(
        intervention,
        customInterventions,
        intervention.procedure
      );
      const checklistSteps = getHistoricalChecklistSteps(
        intervention,
        customInterventions
      );

      return checklistSteps.map((step) => {
        const level = getAuthoritativeChecklist(
          intervention,
          adminEvaluations[intervention.id]
        )[step.id];

        return [
          intervention.id,
          internalLabel,
          procedureLabel,
          intervention.date,
          formatComplexityRating(intervention.complexity, ''),
          step.label,
          getChecklistValue(
            intervention,
            step.id,
            adminEvaluations[intervention.id]
          ),
        ];
      });
    }),
  };
}

function createSeniorDataWorksheet(
  interventions: SavedIntervention[],
  internalProfiles: InternalProfile[],
  customInterventions: SurgicalInterventionDefinition[],
  adminEvaluations: Record<string, AdminInterventionEvaluation>,
  selectableSeniors: Senior[]
): WorksheetData {
  return {
    name: 'Donnees seniors',
    headers: [
      'ID intervention',
      'Senior',
      'Intervention',
      'Date du bloc',
      'Date et heure d’évaluation',
      'Difficulté senior',
      'Performance senior',
      'Commentaire senior',
    ],
    rows: interventions.map((intervention) => {
      const context = buildInterventionContext(
        intervention,
        internalProfiles,
        customInterventions,
        adminEvaluations,
        selectableSeniors
      );

      return [
        intervention.id,
        context.seniorLabel,
        context.procedureLabel,
        intervention.date,
        context.evaluationTimestamp || 'Non évaluée',
        context.seniorDifficultyLabel,
        context.seniorPerformanceLabel,
        context.adminEvaluation?.seniorComment ?? '',
      ];
    }),
  };
}

function createStepDetailWorksheet(
  interventions: SavedIntervention[],
  customInterventions: SurgicalInterventionDefinition[],
  adminEvaluations: Record<string, AdminInterventionEvaluation>
): WorksheetData {
  return {
    name: 'Etapes operatoires',
    headers: [
      'ID intervention',
      'Intervention',
      'Ordre de l’étape',
      'Nom de l’étape',
      'Niveau autonomie Senior',
    ],
    rows: interventions.flatMap((intervention) => {
      const procedureLabel = getHistoricalProcedureLabel(
        intervention,
        customInterventions,
        intervention.procedure
      );
      const checklistSteps = getHistoricalChecklistSteps(
        intervention,
        customInterventions
      );

      return checklistSteps.map((step, index) => {
        const level = getAuthoritativeChecklist(
          intervention,
          adminEvaluations[intervention.id]
        )[step.id];

        return [
          intervention.id,
          procedureLabel,
          `${index + 1}`,
          step.label,
          getChecklistValue(
            intervention,
            step.id,
            adminEvaluations[intervention.id]
          ),
        ];
      });
    }),
  };
}

export function buildInterventionsWorkbookXml(
  interventions: SavedIntervention[],
  internalProfiles: InternalProfile[],
  customInterventions: SurgicalInterventionDefinition[] = [],
  adminEvaluations: Record<string, AdminInterventionEvaluation> = {},
  selectableSeniors: Senior[] = []
) {
  if (interventions.length === 0) {
    return '';
  }

  const worksheets: WorksheetData[] = [
    createSummaryWorksheet(
      interventions,
      internalProfiles,
      customInterventions,
      adminEvaluations,
      selectableSeniors
    ),
    createInternalDataWorksheet(
      interventions,
      internalProfiles,
      customInterventions,
      adminEvaluations
    ),
    createSeniorDataWorksheet(
      interventions,
      internalProfiles,
      customInterventions,
      adminEvaluations,
      selectableSeniors
    ),
    createStepDetailWorksheet(
      interventions,
      customInterventions,
      adminEvaluations
    ),
  ];

  return buildWorkbookXml(worksheets);
}

function downloadWorkbookXml(workbookXml: string) {
  if (!workbookXml) {
    return;
  }

  const blob = new Blob([`\uFEFF${workbookXml}`], {
    type: 'application/vnd.ms-excel;charset=utf-8;',
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dateStamp = new Date().toISOString().slice(0, 10);

  link.href = url;
  link.download = `journal-de-bord-interventions-${dateStamp}.xls`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export function downloadInterventionsExcel(
  interventions: SavedIntervention[],
  internalProfiles: InternalProfile[],
  customInterventions: SurgicalInterventionDefinition[] = [],
  adminEvaluations: Record<string, AdminInterventionEvaluation> = {},
  selectableSeniors: Senior[] = []
) {
  downloadWorkbookXml(
    buildInterventionsWorkbookXml(
      interventions,
      internalProfiles,
      customInterventions,
      adminEvaluations,
      selectableSeniors
    )
  );
}

export function downloadSeniorInstitutionInterventionsExcel(
  senior: Senior,
  interventions: SavedIntervention[],
  internalProfiles: InternalProfile[],
  customInterventions: SurgicalInterventionDefinition[] = [],
  adminEvaluations: Record<string, AdminInterventionEvaluation> = {},
  selectableSeniors: Senior[] = []
) {
  const scope = buildSeniorInstitutionExportScope(
    senior,
    interventions,
    internalProfiles,
    selectableSeniors
  );

  downloadInterventionsExcel(
    scope.interventions,
    scope.internalProfiles,
    customInterventions,
    adminEvaluations,
    scope.selectableSeniors
  );

  return scope.interventions.length;
}
