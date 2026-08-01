export type ProgressPeriod = '3m' | '6m' | '12m';

export type DailyAutonomyPoint = {
  date: string;
  id: string;
  index: number;
  score: number;
};

export const PROGRESS_PERIOD_OPTIONS: Array<{
  label: string;
  value: ProgressPeriod;
}> = [
  { label: '3 mois', value: '3m' },
  { label: '6 mois', value: '6m' },
  { label: '12 mois', value: '12m' },
];

function parseIsoDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function getProgressPeriodStart(period: ProgressPeriod) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 12, 0, 0, 0);
  start.setMonth(
    start.getMonth() - (period === '3m' ? 2 : period === '6m' ? 5 : 11)
  );
  return start;
}

export function filterItemsByProgressPeriod<T>(
  items: T[],
  period: ProgressPeriod,
  getDate: (item: T) => string
) {
  const periodStart = getProgressPeriodStart(period);

  return items.filter((item) => parseIsoDate(getDate(item)) >= periodStart);
}

export function buildDailyAutonomySeries<T>(
  items: T[],
  getDate: (item: T) => string,
  getScore: (item: T) => number | null
): DailyAutonomyPoint[] {
  const scoresByDate = items.reduce<Map<string, number[]>>((scores, item) => {
    const score = getScore(item);

    if (score == null) return scores;

    const date = getDate(item);
    const dailyScores = scores.get(date) ?? [];
    dailyScores.push(score);
    scores.set(date, dailyScores);
    return scores;
  }, new Map());

  return Array.from(scoresByDate.entries())
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
    .map(([date, scores], index) => ({
      date,
      id: date,
      index: index + 1,
      score: Math.round(
        scores.reduce((total, score) => total + score, 0) / scores.length
      ),
    }));
}
