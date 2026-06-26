import { ChecklistLevel } from '../types';

export function getChecklistAverage(levels: Array<ChecklistLevel | null>) {
  const numericLevels = levels
    .filter((level): level is '0' | '1' | '2' | '3' | '4' =>
      ['0', '1', '2', '3', '4'].includes(level ?? '')
    )
    .map((level) => Number(level));

  if (numericLevels.length === 0) {
    return null;
  }

  return numericLevels.reduce((total, level) => total + level, 0) / numericLevels.length;
}

export function formatChecklistAverage(value: number | null) {
  if (value == null) {
    return '– / 4';
  }

  return `${value.toFixed(1).replace('.', ',')} / 4`;
}
