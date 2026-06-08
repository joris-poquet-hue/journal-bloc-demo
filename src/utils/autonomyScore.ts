import {
  getChecklistStepsForIntervention,
  getSurgicalInterventionDefinition,
} from '../data/mockData';
import {
  AdminInterventionEvaluation,
  SavedIntervention,
  SurgicalInterventionDefinition,
} from '../types';

const DIFFICULTY_COEFFICIENTS: Record<string, number> = {
  '1': 0.95,
  '2': 1,
  '3': 1.05,
};

function clampScore(value: number) {
  return Math.min(100, Math.max(0, value));
}

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

  const autonomyComponent = (keyStepAverage / 4) * 100;
  const performanceComponent = ((Number(evaluation.globalPerformance) - 1) / 4) * 100;
  const difficultyCoefficient =
    DIFFICULTY_COEFFICIENTS[evaluation.categoryDifficulty] ?? 1;
  const score =
    (0.4 * autonomyComponent + 0.6 * performanceComponent) *
    difficultyCoefficient;

  return Math.round(clampScore(score));
}

export function formatAutonomyScore(score: number | null | undefined) {
  return score == null ? 'Non calculable' : `${score} / 100`;
}
