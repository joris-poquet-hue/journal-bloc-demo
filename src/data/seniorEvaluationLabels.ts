import type {
  AdminCategoryDifficultyRating,
  AdminPerformanceRating,
} from '../types';

export const SENIOR_PERFORMANCE_LABELS = {
  '1': 'Interne non préparé',
  '2': 'Connaissance insuffisante',
  '3': 'Performance intermédiaire',
  '4': 'Compatible autonomie supervisée',
  '5': 'Performance exceptionnelle',
} as const satisfies Record<AdminPerformanceRating, string>;

export const SENIOR_DIFFICULTY_LABELS = {
  '1': 'Simple',
  '2': 'Intermédiaire',
  '3': 'Difficile',
} as const satisfies Record<AdminCategoryDifficultyRating, string>;

export const SENIOR_PERFORMANCE_RATINGS = [
  '1',
  '2',
  '3',
  '4',
  '5',
] as const satisfies ReadonlyArray<AdminPerformanceRating>;

export const SENIOR_DIFFICULTY_RATINGS = [
  '1',
  '2',
  '3',
] as const satisfies ReadonlyArray<AdminCategoryDifficultyRating>;
