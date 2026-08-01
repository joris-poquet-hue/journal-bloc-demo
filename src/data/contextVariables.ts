import type {
  ChoiceOption,
  ClinicalCountCategory,
  InterventionClinicalContext,
  InterventionContextVariable,
  InterventionContextVariables,
} from '../types';

export const interventionContextVariableOptions: ChoiceOption<InterventionContextVariable>[] = [
  {
    value: 'urgence',
    label: 'Urgence',
  },
  {
    value: 'antecedent_chirurgie_abdominale',
    label: 'Antécédent de chirurgie abdominale',
  },
  {
    value: 'complication_per_operatoire',
    label: 'Complication per-opératoire',
  },
  {
    value: 'imc_superieur_30',
    label: 'IMC > 30',
  },
  {
    value: 'aucun_contexte_particulier',
    label: 'Aucun contexte particulier',
  },
];

export function getContextVariableLabel(
  value: InterventionContextVariable
) {
  return (
    interventionContextVariableOptions.find((option) => option.value === value)
      ?.label ?? value
  );
}

export function toggleContextVariable(
  current: InterventionContextVariable[],
  value: InterventionContextVariable
) {
  if (value === 'aucun_contexte_particulier') {
    return current.includes(value) ? [] : [value];
  }

  const withoutNone = current.filter(
    (candidate) => candidate !== 'aucun_contexte_particulier'
  );

  return withoutNone.includes(value)
    ? withoutNone.filter((candidate) => candidate !== value)
    : [...withoutNone, value];
}

export const clinicalCountOptions: ChoiceOption<ClinicalCountCategory>[] = [
  { value: '0', label: '0' },
  { value: '1', label: '1' },
  { value: '2', label: '2' },
  { value: '3_plus', label: '≥ 3' },
];

export function createEmptyClinicalContext(): InterventionClinicalContext {
  return {
    schemaVersion: 2,
    patient: {
      ageYears: null,
      bmi: null,
      tobaccoUse: null,
      parity: null,
    },
    history: {
      igh: null,
      pelvicPeritonitis: null,
      abdominopelvicSurgery: null,
      abdominopelvicSurgeryDetails: '',
      cesareanCount: null,
    },
    intraoperative: {
      bloodLossMl: null,
      complication: null,
      complicationDetails: '',
    },
  };
}

export function isStructuredClinicalContext(
  value: InterventionContextVariables | null | undefined
): value is InterventionClinicalContext {
  return (
    Boolean(value) &&
    !Array.isArray(value) &&
    value?.schemaVersion === 2 &&
    typeof value.patient === 'object' &&
    typeof value.history === 'object' &&
    typeof value.intraoperative === 'object'
  );
}

export function getClinicalContextCompletion(
  context: InterventionClinicalContext
) {
  const patientCompleted = [
    context.patient.ageYears,
    context.patient.bmi,
    context.patient.tobaccoUse,
    context.patient.parity,
  ].filter((value) => value !== null).length;
  const historyCompleted = [
    context.history.igh,
    context.history.pelvicPeritonitis,
    context.history.abdominopelvicSurgery,
    context.history.cesareanCount,
  ].filter((value) => value !== null).length;
  const intraoperativeCompleted = [
    context.intraoperative.bloodLossMl,
    context.intraoperative.complication,
  ].filter((value) => value !== null).length;

  return {
    patient: {
      completed: patientCompleted,
      total: 4,
      isComplete: patientCompleted === 4,
    },
    history: {
      completed: historyCompleted,
      total: 4,
      isComplete: historyCompleted === 4,
    },
    intraoperative: {
      completed: intraoperativeCompleted,
      total: 2,
      isComplete: intraoperativeCompleted === 2,
    },
    completed: patientCompleted + historyCompleted + intraoperativeCompleted,
    total: 10,
    isComplete:
      patientCompleted === 4 &&
      historyCompleted === 4 &&
      intraoperativeCompleted === 2,
  };
}

export function isClinicalContextComplete(
  value: InterventionContextVariables
) {
  return (
    isStructuredClinicalContext(value) &&
    getClinicalContextCompletion(value).isComplete
  );
}

function formatBoolean(value: boolean | null) {
  if (value === null) {
    return 'Non renseigné';
  }

  return value ? 'Oui' : 'Non';
}

function formatCount(value: ClinicalCountCategory | null) {
  return (
    clinicalCountOptions.find((option) => option.value === value)?.label ??
    'Non renseigné'
  );
}

export function formatBmi(value: number | null) {
  if (value === null) {
    return 'Non renseigné';
  }

  if (value <= 15) {
    return '≤ 15';
  }

  if (value >= 40) {
    return '≥ 40';
  }

  return value.toLocaleString('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export function formatBloodLoss(value: number | null) {
  if (value === null) {
    return 'Non renseigné';
  }

  return value >= 2500 ? '≥ 2 500 mL' : `${value.toLocaleString('fr-FR')} mL`;
}

export function getClinicalContextSummaryRows(
  value: InterventionContextVariables
) {
  if (!isStructuredClinicalContext(value)) {
    return [
      {
        label: 'Anciennes variables de contexte',
        value: value.map(getContextVariableLabel).join(' · ') || 'Non renseignées',
      },
    ];
  }

  return [
    {
      label: 'Âge de la patiente',
      value:
        value.patient.ageYears === null
          ? 'Non renseigné'
          : `${value.patient.ageYears} ans`,
    },
    { label: 'IMC de la patiente', value: formatBmi(value.patient.bmi) },
    { label: 'Tabac', value: formatBoolean(value.patient.tobaccoUse) },
    { label: 'Parité', value: formatCount(value.patient.parity) },
    { label: 'Antécédent d’IGH', value: formatBoolean(value.history.igh) },
    {
      label: 'Antécédent de pelvipéritonite',
      value: formatBoolean(value.history.pelvicPeritonitis),
    },
    {
      label: 'Antécédent de chirurgie abdomino-pelvienne',
      value: value.history.abdominopelvicSurgery
        ? `Oui${
            value.history.abdominopelvicSurgeryDetails.trim()
              ? ` · ${value.history.abdominopelvicSurgeryDetails.trim()}`
              : ''
          }`
        : formatBoolean(value.history.abdominopelvicSurgery),
    },
    {
      label: 'Antécédent de césarienne',
      value: formatCount(value.history.cesareanCount),
    },
    {
      label: 'Saignement per-opératoire',
      value: formatBloodLoss(value.intraoperative.bloodLossMl),
    },
    {
      label: 'Complication per-opératoire',
      value: value.intraoperative.complication
        ? `Oui${
            value.intraoperative.complicationDetails.trim()
              ? ` · ${value.intraoperative.complicationDetails.trim()}`
              : ''
          }`
        : formatBoolean(value.intraoperative.complication),
    },
  ];
}
