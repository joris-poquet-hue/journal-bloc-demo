import {
  getChecklistStepsForIntervention,
  getSurgicalInterventionDefinition,
  isApproachAllowedForIndication,
} from '../data/mockData';
import {
  ChecklistProgress,
  InterventionDraft,
  SurgicalInterventionDefinition,
} from '../types';
import { isValidIsoDate } from './date';

export function getMissingFormFields(
  draft: InterventionDraft,
  customInterventions: SurgicalInterventionDefinition[] = []
) {
  const missingFields: string[] = [];
  const isSalpingectomy = draft.procedure === 'salpingectomie';
  const interventionDefinition = getSurgicalInterventionDefinition(
    draft.procedure,
    customInterventions
  );
  const isCustomIntervention = Boolean(interventionDefinition?.isCustom);
  const requiresApproach =
    isCustomIntervention &&
    (interventionDefinition?.allowedApproaches.length ?? 0) > 0;
  const requiresLaterality =
    isSalpingectomy || Boolean(interventionDefinition?.requiresLaterality);

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

  if (
    !isSalpingectomy &&
    isCustomIntervention &&
    (interventionDefinition?.indications.length ?? 0) > 0 &&
    !draft.customIndication
  ) {
    missingFields.push('indication');
  }

  if ((isSalpingectomy || requiresApproach) && !draft.approach) {
    missingFields.push('voie d’abord');
  }

  if (
    isSalpingectomy &&
    draft.approach &&
    !isApproachAllowedForIndication(draft.approach, draft.indication)
  ) {
    missingFields.push('voie d’abord compatible');
  }

  if (
    isCustomIntervention &&
    draft.approach &&
    !interventionDefinition?.allowedApproaches.includes(draft.approach)
  ) {
    missingFields.push('voie d’abord compatible');
  }

  if (
    (isSalpingectomy || isCustomIntervention) &&
    (draft.approach === 'coelioscopie' || draft.approach === 'robot') &&
    !draft.entryTechnique
  ) {
    missingFields.push('technique d’entrée');
  }

  if (
    isCustomIntervention &&
    draft.entryTechnique &&
    !interventionDefinition?.allowedEntryTechniques.includes(draft.entryTechnique)
  ) {
    missingFields.push('technique d’entrée compatible');
  }

  if (requiresLaterality && !draft.laterality) {
    missingFields.push('latéralité');
  }

  if (!draft.complexity) {
    missingFields.push('difficulté ressentie');
  }

  if (!draft.role) {
    missingFields.push('rôle global');
  }

  return missingFields;
}

export function getChecklistProgress(
  draft: InterventionDraft,
  customInterventions: SurgicalInterventionDefinition[] = []
): ChecklistProgress {
  const checklistSteps = getChecklistStepsForIntervention(
    draft.procedure,
    draft.indication,
    draft.approach,
    draft.entryTechnique,
    customInterventions
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
    (step) => draft.checklist[step.id] != null
  ).length;

  return {
    applicable: true,
    completed,
    total,
    isComplete: completed === total,
  };
}

export function canSaveIntervention(
  draft: InterventionDraft,
  customInterventions: SurgicalInterventionDefinition[] = []
) {
  return (
    getMissingFormFields(draft, customInterventions).length === 0 &&
    getChecklistProgress(draft, customInterventions).isComplete
  );
}
