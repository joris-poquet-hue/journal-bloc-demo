import type {
  ActivityLogEntry,
  AdminInterventionEvaluation,
  SavedIntervention,
} from '../../types';
import { getCalendarDayDifference } from '../../utils/exportMetrics';
import { hasCompleteAdminEvaluation } from './adminEvaluationModel';

export type AdminActivityRange = 'day' | 'week' | 'month';
export type AdminActivityAnalyticsPeriod = '7d' | '30d' | '6m' | '1y';
export type AdminRelanceWindow = '14d' | '1m' | '3m';

export const ADMIN_ACTIVITY_ANALYTICS_PERIOD_OPTIONS: Array<{
  value: AdminActivityAnalyticsPeriod;
  label: string;
}> = [
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
  { value: '6m', label: '6 mois' },
  { value: '1y', label: '1 an' },
];

export const ADMIN_RELANCE_WINDOW_OPTIONS: Array<{
  value: AdminRelanceWindow;
  label: string;
}> = [
  { value: '14d', label: '14 jours' },
  { value: '1m', label: '1 mois' },
  { value: '3m', label: '3 mois' },
];

function averageNumbers(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function parseIsoDateValue(value: string) {
  const [year, month, day] = value.split('-').map(Number);

  return new Date(year, (month ?? 1) - 1, day ?? 1, 12, 0, 0, 0);
}

function startOfWeek(value: Date) {
  const nextDate = new Date(value);
  const day = nextDate.getDay();
  const diff = day === 0 ? -6 : 1 - day;

  nextDate.setDate(nextDate.getDate() + diff);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function endOfWeek(value: Date) {
  const nextDate = startOfWeek(value);

  nextDate.setDate(nextDate.getDate() + 6);
  nextDate.setHours(23, 59, 59, 999);
  return nextDate;
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1, 0, 0, 0, 0);
}

function endOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function addDays(value: Date, amount: number) {
  const nextDate = new Date(value);

  nextDate.setDate(nextDate.getDate() + amount);
  return nextDate;
}

export function addMonths(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1, 12, 0, 0, 0);
}

export function isSameCalendarDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

export function isAnalyticsTrackingEntry(entry: ActivityLogEntry) {
  return (
    entry.analyticsEvent?.kind === 'intervention_form' ||
    entry.analyticsEvent?.kind === 'senior_evaluation'
  );
}

export function getAdminAnalyticsPeriodLabel(
  period: AdminActivityAnalyticsPeriod
) {
  return (
    ADMIN_ACTIVITY_ANALYTICS_PERIOD_OPTIONS.find(
      (option) => option.value === period
    )?.label ?? '30 jours'
  );
}

export function getAdminAnalyticsPeriodStart(
  period: AdminActivityAnalyticsPeriod,
  referenceDate: Date
) {
  if (period === '7d') {
    const start = addDays(referenceDate, -6);

    start.setHours(0, 0, 0, 0);
    return start;
  }

  if (period === '30d') {
    const start = addDays(referenceDate, -29);

    start.setHours(0, 0, 0, 0);
    return start;
  }

  if (period === '6m') {
    return startOfMonth(addMonths(referenceDate, -5));
  }

  return startOfMonth(addMonths(referenceDate, -11));
}

export function buildAllTimeAdminCycleSummary(
  activityLog: ActivityLogEntry[],
  interventions: SavedIntervention[],
  adminEvaluations: Record<string, AdminInterventionEvaluation>
) {
  const userActivityEntries = activityLog.filter(
    (entry) => entry.actorRole === 'internal' || entry.actorRole === 'senior'
  );
  const completedInterventionFormEvents = userActivityEntries.flatMap((entry) =>
    entry.analyticsEvent?.kind === 'intervention_form'
      ? [entry.analyticsEvent]
      : []
  );
  const completedSeniorEvaluationEvents = userActivityEntries.flatMap((entry) =>
    entry.analyticsEvent?.kind === 'senior_evaluation'
      ? [entry.analyticsEvent]
      : []
  );
  const evaluatedInterventions = interventions.filter((intervention) =>
    hasCompleteAdminEvaluation(adminEvaluations[intervention.id])
  );
  const recordingDelayValues = interventions
    .map((intervention) =>
      getCalendarDayDifference(intervention.date, intervention.savedAt)
    )
    .filter((value): value is number => value != null);
  const evaluationDelayValues = evaluatedInterventions
    .map((intervention) => {
      const updatedAt = adminEvaluations[intervention.id]?.updatedAt;

      if (!updatedAt) {
        return null;
      }

      const delay =
        new Date(updatedAt).getTime() - new Date(intervention.savedAt).getTime();

      return Number.isNaN(delay) || delay < 0 ? null : delay;
    })
    .filter((value): value is number => value != null);

  return {
    averageEvaluationDelayMs: averageNumbers(evaluationDelayValues),
    averageInterventionFormClickCount: averageNumbers(
      completedInterventionFormEvents.map((event) => event.clickCount)
    ),
    averageInterventionFormDurationMs: averageNumbers(
      completedInterventionFormEvents.map((event) => event.durationMs)
    ),
    averageRecordingDelayDays: averageNumbers(recordingDelayValues),
    averageSeniorEvaluationClickCount: averageNumbers(
      completedSeniorEvaluationEvents.map((event) => event.clickCount)
    ),
    averageSeniorEvaluationDurationMs: averageNumbers(
      completedSeniorEvaluationEvents.map((event) => event.durationMs)
    ),
    completedInterventionFormCount: completedInterventionFormEvents.length,
    completedSeniorEvaluationCount: completedSeniorEvaluationEvents.length,
    evaluatedCount: evaluatedInterventions.length,
    recordedCount: interventions.length,
  };
}

export function getAdminRelanceThresholdDays(window: AdminRelanceWindow) {
  if (window === '1m') {
    return 30;
  }

  if (window === '3m') {
    return 90;
  }

  return 14;
}

export function buildAdminActivityAnalyticsBuckets(
  activityLog: ActivityLogEntry[],
  period: AdminActivityAnalyticsPeriod
) {
  const referenceDate = new Date();
  const userEntries = activityLog.filter(
    (entry) =>
      (entry.actorRole === 'internal' || entry.actorRole === 'senior') &&
      !isAnalyticsTrackingEntry(entry)
  );
  const bucketBlueprints =
    period === '6m' || period === '1y'
      ? Array.from({ length: period === '6m' ? 6 : 12 }, (_, index) => {
          const monthDate = addMonths(
            referenceDate,
            index - (period === '6m' ? 5 : 11)
          );
          const start = startOfMonth(monthDate);
          const end = endOfMonth(monthDate);

          return {
            id: start.toISOString(),
            label: start.toLocaleDateString('fr-FR', {
              month: 'short',
              year: period === '1y' ? '2-digit' : undefined,
            }),
            start,
            end,
          };
        })
      : Array.from({ length: period === '7d' ? 7 : 30 }, (_, index) => {
          const offset = period === '7d' ? 6 : 29;
          const date = addDays(referenceDate, index - offset);
          const start = new Date(date);

          start.setHours(0, 0, 0, 0);

          const end = new Date(date);

          end.setHours(23, 59, 59, 999);

          return {
            id: start.toISOString(),
            label: start.toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'short',
            }),
            start,
            end,
          };
        });

  return bucketBlueprints.map((bucket) => {
    const counts = userEntries.reduce(
      (current, entry) => {
        const timestamp = new Date(entry.createdAt);

        if (
          Number.isNaN(timestamp.getTime()) ||
          timestamp < bucket.start ||
          timestamp > bucket.end
        ) {
          return current;
        }

        if (entry.actorRole === 'internal') {
          current.internalCount += 1;
        }

        if (entry.actorRole === 'senior') {
          current.seniorCount += 1;
        }

        current.totalCount += 1;
        return current;
      },
      { internalCount: 0, seniorCount: 0, totalCount: 0 }
    );

    return {
      id: bucket.id,
      label: bucket.label,
      ...counts,
    };
  });
}

export function buildAdminActivityBuckets(
  savedInterventions: SavedIntervention[],
  adminEvaluations: Record<string, AdminInterventionEvaluation>,
  range: AdminActivityRange
) {
  const today = new Date();
  const latestInterventionDate = savedInterventions.reduce<Date>(
    (latest, intervention) => {
      const currentDate = parseIsoDateValue(intervention.date);

      return currentDate > latest ? currentDate : latest;
    },
    today
  );
  const referenceDate = latestInterventionDate > today ? latestInterventionDate : today;
  const bucketBlueprints =
    range === 'day'
      ? Array.from({ length: 7 }, (_, index) => {
          const date = addDays(referenceDate, index - 6);
          const start = new Date(date);

          start.setHours(0, 0, 0, 0);

          const end = new Date(date);

          end.setHours(23, 59, 59, 999);

          return {
            id: date.toISOString(),
            label: date.toLocaleDateString('fr-FR', {
              day: 'numeric',
              month: 'short',
            }),
            start,
            end,
          };
        })
      : range === 'week'
        ? Array.from({ length: 8 }, (_, index) => {
            const weekStart = startOfWeek(addDays(referenceDate, (index - 7) * 7));
            const weekEnd = endOfWeek(weekStart);

            return {
              id: weekStart.toISOString(),
              label: `${weekStart.toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'short',
              })} - ${weekEnd.toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'short',
              })}`,
              start: weekStart,
              end: weekEnd,
            };
          })
        : Array.from({ length: 6 }, (_, index) => {
            const monthDate = addMonths(referenceDate, index - 5);
            const monthStart = startOfMonth(monthDate);
            const monthEnd = endOfMonth(monthDate);

            return {
              id: monthStart.toISOString(),
              label: monthStart.toLocaleDateString('fr-FR', {
                month: 'short',
                year: 'numeric',
              }),
              start: monthStart,
              end: monthEnd,
            };
          });

  return bucketBlueprints.map((bucket) => {
    const counters = savedInterventions.reduce(
      (current, intervention) => {
        const interventionDate = parseIsoDateValue(intervention.date);

        if (interventionDate < bucket.start || interventionDate > bucket.end) {
          return current;
        }

        return {
          recordedCount: current.recordedCount + 1,
          evaluatedCount:
            current.evaluatedCount +
            (hasCompleteAdminEvaluation(adminEvaluations[intervention.id])
              ? 1
              : 0),
        };
      },
      { recordedCount: 0, evaluatedCount: 0 }
    );

    return {
      id: bucket.id,
      label: bucket.label,
      ...counters,
    };
  });
}
