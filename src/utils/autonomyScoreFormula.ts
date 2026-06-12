import {
  AdminCategoryDifficultyRating,
  AdminPerformanceRating,
} from '../types';

const DIFFICULTY_COEFFICIENTS: Record<AdminCategoryDifficultyRating, number> = {
  '1': 0.95,
  '2': 1,
  '3': 1.05,
};

function clampScore(value: number) {
  return Math.min(100, Math.max(0, value));
}

export function calculateAutonomyScoreFromComponents(
  keyStepAverage: number,
  globalPerformance: AdminPerformanceRating,
  categoryDifficulty: AdminCategoryDifficultyRating
) {
  const autonomyComponent = (keyStepAverage / 4) * 100;
  const performanceComponent = ((Number(globalPerformance) - 1) / 4) * 100;
  const difficultyCoefficient = DIFFICULTY_COEFFICIENTS[categoryDifficulty];
  const score =
    (0.4 * autonomyComponent + 0.6 * performanceComponent) *
    difficultyCoefficient;

  return Math.round(clampScore(score));
}
