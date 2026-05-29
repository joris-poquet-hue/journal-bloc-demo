import { getChecklistStepsForIntervention } from '../data/mockData';
import { ChecklistProgress, InterventionDraft } from '../types';
import { isValidIsoDate } from './date';

export function getMissingFormFields(draft: InterventionDraft) {
  const missingFields: string[] = [];
  const isSalpingectomy = draft.procedure === 'salpingectomie';

  if (!draft.date || !isValidIsoDate(draft.date)) {
    missingFields.push('date valide');
  }

  if (!draft.internalId) {
    missingFields.push('interne');
  }

  if (!draft.seniorId) {
    missingFields.push('senior');
  }

  if (isSalpingectomy && !draft.indication) {
    missingFields.push('indication');
  }

  if (isSalpingectomy && !draft.approach) {
    missingFields.push('voie d’abord');
  }

  if (
    isSalpingectomy &&
    (draft.approach === 'coelioscopie' || draft.approach === 'robot') &&
    !draft.entryTechnique
  ) {
    missingFields.push('technique d’entrée');
  }

  if (isSalpingectomy && !draft.laterality) {
    missingFields.push('latéralité');
  }

  if (!draft.complexity) {
    missingFields.push('complexité');
  }

  if (!draft.role) {
    missingFields.push('rôle global');
  }

  return missingFields;
}

export function getChecklistProgress(draft: InterventionDraft): ChecklistProgress {
  const checklistSteps = getChecklistStepsForIntervention(
    draft.procedure,
    draft.indication,
    draft.approach,
    draft.entryTechnique
  );

  if (checklistSteps.length === 0) {
    return {
      applicable: false,
      completed: 0,
      total: 0,
      isComplete: true,
    };
  }

  const total = checklistSteps.length;
  const completed = checklistSteps.filter(
    (step) => draft.checklist[step.id] !== null
  ).length;

  return {
    applicable: true,
    completed,
    total,
    isComplete: completed === total,
  };
}

export function canSaveIntervention(draft: InterventionDraft) {
  return (
    getMissingFormFields(draft).length === 0 &&
    getChecklistProgress(draft).isComplete
  );
}
