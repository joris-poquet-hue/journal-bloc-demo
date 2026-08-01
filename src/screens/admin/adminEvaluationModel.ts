import type { AdminInterventionEvaluation } from '../../types';

export function hasCompleteAdminEvaluation(
  evaluation: AdminInterventionEvaluation | undefined
) {
  return Boolean(evaluation?.globalPerformance && evaluation.categoryDifficulty);
}
