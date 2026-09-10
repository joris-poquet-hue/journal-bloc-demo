import type {
  AdminInterventionEvaluation,
  SavedIntervention,
} from '../types';

const MILLISECONDS_PER_DAY = 86_400_000;
const PARIS_CALENDAR_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  timeZone: 'Europe/Paris',
  year: 'numeric',
});

function getUtcCalendarValue(year: number, month: number, day: number) {
  const value = Date.UTC(year, month - 1, day);
  const date = new Date(value);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return value;
}

function parseDateOnlyToUtc(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return null;
  }

  return getUtcCalendarValue(
    Number(match[1]),
    Number(match[2]),
    Number(match[3])
  );
}

function getParisCalendarValue(timestamp: string) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = PARIS_CALENDAR_FORMATTER.formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);

  if (!year || !month || !day) {
    return null;
  }

  return getUtcCalendarValue(year, month, day);
}

export function getCalendarDayDifference(
  interventionDate: string,
  savedAt: string
) {
  const operationDay = parseDateOnlyToUtc(interventionDate);
  const savedDay = getParisCalendarValue(savedAt);

  if (operationDay == null || savedDay == null || savedDay < operationDay) {
    return null;
  }

  return Math.round((savedDay - operationDay) / MILLISECONDS_PER_DAY);
}

export function getHourDifference(startAt: string, endAt: string) {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();

  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return null;
  }

  return (end - start) / 3_600_000;
}

export function hasCompleteEvaluation(
  evaluation: AdminInterventionEvaluation | undefined
) {
  return Boolean(evaluation?.globalPerformance && evaluation.categoryDifficulty);
}

export function buildEvaluationPeriodCounts(
  interventions: SavedIntervention[],
  evaluations: Record<string, AdminInterventionEvaluation>,
  periodStartIso: string,
  periodEndIso: string
) {
  const recordedInterventions = interventions.filter(
    (intervention) =>
      intervention.savedAt >= periodStartIso &&
      intervention.savedAt <= periodEndIso
  );
  const evaluatedRecordedCount = recordedInterventions.filter((intervention) =>
    hasCompleteEvaluation(evaluations[intervention.id])
  ).length;
  const evaluationsPerformedCount = interventions.filter((intervention) => {
    const evaluation = evaluations[intervention.id];

    return Boolean(
      hasCompleteEvaluation(evaluation) &&
        evaluation?.updatedAt &&
        evaluation.updatedAt >= periodStartIso &&
        evaluation.updatedAt <= periodEndIso
    );
  }).length;

  return {
    evaluatedRecordedCount,
    evaluationRate:
      recordedInterventions.length > 0
        ? Math.round(
            (evaluatedRecordedCount / recordedInterventions.length) * 100
          )
        : 0,
    evaluationsPerformedCount,
    recordedCount: recordedInterventions.length,
  };
}
