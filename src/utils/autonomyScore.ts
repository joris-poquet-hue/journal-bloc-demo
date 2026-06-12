import {
  getChecklistStepsForIntervention,
  getSurgicalInterventionDefinition,
} from '../data/mockData';
import {
  AdminInterventionEvaluation,
  SavedIntervention,
  SurgicalInterventionDefinition,
} from '../types';
import { calculateAutonomyScoreFromComponents } from './autonomyScoreFormula';

export function calculateKeyStepAutonomyAverage(
  intervention: SavedIntervention,
  customInterventions: SurgicalInterventionDefinition[] = []
) {
  const interventionDefinition = getSurgicalInterventionDefinition(
    intervention.procedure,
    customInterventions
  );

  if (!interventionDefinition) {
    return null;
  }

  const keyStepIds = new Set(interventionDefinition.keyStepIds);
  const checklistSteps = getChecklistStepsForIntervention(
    intervention.procedure,
    intervention.indication,
    intervention.approach,
    intervention.entryTechnique,
    customInterventions
  );
  const keyScores = checklistSteps
    .filter((step) => keyStepIds.has(step.id))
    .map((step) => intervention.checklist[step.id])
    .filter((level): level is '0' | '1' | '2' | '3' | '4' =>
      ['0', '1', '2', '3', '4'].includes(level ?? '')
    )
    .map((level) => Number(level));

  if (keyScores.length === 0) {
    return null;
  }

  return keyScores.reduce((total, score) => total + score, 0) / keyScores.length;
}

export function calculateAutonomyScore(
  intervention: SavedIntervention,
  customInterventions: SurgicalInterventionDefinition[] = [],
  evaluation?: AdminInterventionEvaluation
) {
  const keyStepAverage = calculateKeyStepAutonomyAverage(
    intervention,
    customInterventions
  );

  if (
    keyStepAverage == null ||
    !evaluation?.globalPerformance ||
    !evaluation.categoryDifficulty
  ) {
    return null;
  }

  return calculateAutonomyScoreFromComponents(
    keyStepAverage,
    evaluation.globalPerformance,
    evaluation.categoryDifficulty
  );
}

export function formatAutonomyScore(score: number | null | undefined) {
  return score == null ? 'Non calculable' : `${score} / 100`;
}
