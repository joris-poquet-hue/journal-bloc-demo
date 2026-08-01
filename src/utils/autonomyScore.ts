import {
  getChecklistStepsForIntervention,
  getSurgicalInterventionDefinition,
} from '../data/mockData';
import {
  AdminInterventionEvaluation,
  SavedIntervention,
  SurgicalInterventionDefinition,
} from '../types';
import { getAuthoritativeChecklist } from './evaluationChecklist';

const MINIMUM_KEY_STEP_COVERAGE = 0.75;
export const INSUFFICIENT_KEY_STEP_COVERAGE_MESSAGE =
  "Score non calculable — vous n'avez pas enregistré suffisamment d'étapes";

export function calculateKeyStepAutonomyAverage(
  intervention: SavedIntervention,
  customInterventions: SurgicalInterventionDefinition[] = [],
  evaluation?: AdminInterventionEvaluation
) {
  const interventionDefinition = getSurgicalInterventionDefinition(
    intervention.procedure,
    customInterventions
  );

  if (!interventionDefinition && !intervention.definitionSnapshot) {
    return null;
  }

  const snapshotSteps =
    intervention.definitionSnapshot?.applicableChecklistSteps ?? null;
  const keyStepIds = new Set(interventionDefinition?.keyStepIds ?? []);
  const checklistSteps =
    snapshotSteps ??
    getChecklistStepsForIntervention(
      intervention.procedure,
      intervention.indication,
      intervention.approach,
      intervention.entryTechnique,
      customInterventions
    );
  const applicableKeySteps = snapshotSteps
    ? snapshotSteps.filter((step) => step.scored)
    : checklistSteps.filter((step) => keyStepIds.has(step.id));
  const checklist = getAuthoritativeChecklist(intervention, evaluation);
  const keyScores = applicableKeySteps
    .map((step) => checklist[step.id])
    .filter((level): level is '0' | '1' | '2' | '3' | '4' =>
      ['0', '1', '2', '3', '4'].includes(level ?? '')
    )
    .map((level) => Number(level));

  if (
    applicableKeySteps.length === 0 ||
    keyScores.length / applicableKeySteps.length < MINIMUM_KEY_STEP_COVERAGE
  ) {
    return null;
  }

  return keyScores.reduce((total, score) => total + score, 0) / keyScores.length;
}

export function calculateAutonomyScore(
  intervention: SavedIntervention,
  _customInterventions: SurgicalInterventionDefinition[] = [],
  _evaluation?: AdminInterventionEvaluation
) {
  return intervention.autonomyScore ?? null;
}

export function formatAutonomyScore(score: number | null | undefined) {
  return score == null ? 'Non calculable' : `${score} / 100`;
}
