import type {
  AdminCategoryDifficultyRating,
  AdminPerformanceRating,
} from '../types';

function clampScore(value: number) {
  return Math.min(100, Math.max(0, value));
}

export function calculateAutonomyScoreFromComponents(
  keyStepAverage: number,
  _globalPerformance: AdminPerformanceRating,
  _categoryDifficulty: AdminCategoryDifficultyRating
) {
  const autonomyComponent = (keyStepAverage / 4) * 100;

  return Math.round(clampScore(autonomyComponent));
}
