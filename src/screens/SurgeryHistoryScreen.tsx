import { useState } from 'react';

import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { SectionCard } from '../components/SectionCard';
import { useAppContext } from '../context/AppContext';
import {
  approachOptions,
  formatDisplayName,
  getChoiceLabel,
  getSeniorById,
  indicationOptions,
  roleOptions,
} from '../data/mockData';
import {
  AdminInterventionEvaluation,
  InterventionType,
  SavedIntervention,
} from '../types';
import {
  calculateAutonomyScore,
  formatAutonomyScore,
} from '../utils/autonomyScore';
import { formatIsoDate } from '../utils/date';

type HistoryPeriod = 'day' | 'week' | 'month';
type HistoryScoreMode = 'global' | 'procedure';

type HistoryBucket = {
  key: string;
  label: string;
  scoreAverage: number | null;
  scoreCount: number;
  scoreTotal: number;
  volumeCount: number;
};

type ScoredHistoryIntervention = {
  autonomyScore: number | null;
  intervention: SavedIntervention;
};

const periodOptions: Array<{ value: HistoryPeriod; label: string }> = [
  { value: 'day', label: 'Jour' },
  { value: 'week', label: 'Semaine' },
  { value: 'month', label: 'Mois' },
];
const scoreModeOptions: Array<{ value: HistoryScoreMode; label: string }> = [
  { value: 'global', label: 'Global' },
  { value: 'procedure', label: 'Par type d’intervention' },
];
const ADMIN_EVALUATIONS_STORAGE_KEY =
  'journal-bord:admin-intervention-evaluations:v1';

function loadStoredAdminEvaluations() {
  if (typeof window === 'undefined') {
    return {};
  }

  try {
    const rawValue = window.localStorage.getItem(ADMIN_EVALUATIONS_STORAGE_KEY);

    if (!rawValue) {
      return {};
    }

    const parsedValue = JSON.parse(rawValue);

    return parsedValue && typeof parsedValue === 'object'
      ? (parsedValue as Record<string, AdminInterventionEvaluation>)
      : {};
  } catch {
    return {};
  }
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getWeekStart(date: Date) {
  const weekStart = new Date(date);
  const day = weekStart.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  weekStart.setDate(weekStart.getDate() + diff);

  return weekStart;
}

function getBucketKey(date: string, period: HistoryPeriod) {
  const parsedDate = parseIsoDate(date);

  if (period === 'day') {
    return date;
  }

  if (period === 'week') {
    return toIsoDate(getWeekStart(parsedDate));
  }

  return `${parsedDate.getFullYear()}-${`${parsedDate.getMonth() + 1}`.padStart(2, '0')}`;
}

function getBucketLabel(key: string, period: HistoryPeriod) {
  if (period === 'month') {
    const [year, month] = key.split('-');
    return `${month}/${year}`;
  }

  if (period === 'week') {
    return `Sem. ${formatIsoDate(key)}`;
  }

  return formatIsoDate(key);
}

function buildBuckets(
  interventions: ScoredHistoryIntervention[],
  period: HistoryPeriod
) {
  const bucketMap = new Map<string, HistoryBucket>();

  interventions.forEach(({ autonomyScore, intervention }) => {
    const key = getBucketKey(intervention.date, period);
    const bucket = bucketMap.get(key) ?? {
      key,
      label: getBucketLabel(key, period),
      scoreAverage: null,
      scoreCount: 0,
      scoreTotal: 0,
      volumeCount: 0,
    };

    bucket.volumeCount += 1;

    if (autonomyScore != null) {
      bucket.scoreCount += 1;
      bucket.scoreTotal += autonomyScore;
      bucket.scoreAverage = Math.round(bucket.scoreTotal / bucket.scoreCount);
    }

    bucketMap.set(key, bucket);
  });

  return Array.from(bucketMap.values()).sort((left, right) =>
    left.key.localeCompare(right.key)
  );
}

function getIndicationLabel(intervention: SavedIntervention) {
  if (intervention.customIndication?.trim()) {
    return intervention.customIndication.trim();
  }

  if (
    intervention.indication === 'autre' &&
    intervention.indicationComment.trim()
  ) {
    return intervention.indicationComment.trim();
  }

  return getChoiceLabel(indicationOptions, intervention.indication, '');
}

function getBarHeight(count: number, maxCount: number) {
  return count === 0 ? '0%' : `${Math.max(8, (count / maxCount) * 100)}%`;
}

function getScoreBarHeight(score: number | null) {
  return score == null ? '0%' : `${Math.max(8, score)}%`;
}

export function SurgeryHistoryScreen() {
  const {
    customSurgicalInterventions,
    selectedInternal,
    savedInterventions,
    surgicalProcedureOptions,
    goToSurgeryPortal,
  } = useAppContext();
  const [period, setPeriod] = useState<HistoryPeriod>('week');
  const [scoreMode, setScoreMode] = useState<HistoryScoreMode>('global');
  const [selectedProcedure, setSelectedProcedure] =
    useState<InterventionType | ''>('salpingectomie');
  const [adminEvaluations] = useState(loadStoredAdminEvaluations);

  if (!selectedInternal) {
    return (
      <ScreenContainer
        eyebrow="Historique"
        title="Historique des blocs"
        subtitle="Retourne au portail chirurgie pour reprendre la session."
      >
        <PrimaryButton label="Retour au portail chirurgie" onPress={goToSurgeryPortal} />
      </ScreenContainer>
    );
  }

  const interventions = savedInterventions
    .filter((intervention) => intervention.internalId === selectedInternal.id)
    .sort((left, right) => right.date.localeCompare(left.date));
  const scoredInterventions = interventions.map((intervention) => ({
    intervention,
    autonomyScore:
      calculateAutonomyScore(
        intervention,
        customSurgicalInterventions,
        adminEvaluations[intervention.id]
      ) ?? intervention.autonomyScore,
  }));
  const procedureForStats =
    selectedProcedure || surgicalProcedureOptions[0]?.value || 'salpingectomie';
  const chartInterventions =
    scoreMode === 'procedure'
      ? scoredInterventions.filter(
          ({ intervention }) => intervention.procedure === procedureForStats
        )
      : scoredInterventions;
  const scoreByInterventionId = new Map(
    scoredInterventions.map(({ autonomyScore, intervention }) => [
      intervention.id,
      autonomyScore,
    ])
  );
  const buckets = buildBuckets(chartInterventions, period);
  const maxVolumeCount = Math.max(
    1,
    ...buckets.map((bucket) => bucket.volumeCount)
  );

  return (
    <ScreenContainer
      eyebrow="Historique"
      title="Historique des blocs"
      subtitle={`${formatDisplayName(selectedInternal.firstName, selectedInternal.lastName)} · ${selectedInternal.currentRotation}`}
    >
      <SectionCard
        title="Histogramme"
        description="Volume et score moyen d’autonomie opératoire selon la période choisie."
      >
        <div className="history-toolbar" aria-label="Période de l’histogramme">
          {periodOptions.map((option) => (
            <button
              key={option.value}
              className={`history-period-button ${
                period === option.value ? 'history-period-button--selected' : ''
              }`}
              onClick={() => setPeriod(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="history-toolbar" aria-label="Mode de calcul du score">
          {scoreModeOptions.map((option) => (
            <button
              key={option.value}
              className={`history-period-button ${
                scoreMode === option.value ? 'history-period-button--selected' : ''
              }`}
              onClick={() => setScoreMode(option.value)}
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>

        {scoreMode === 'procedure' ? (
          <label className="field-stack">
            <span className="field-stack__label">Type d’intervention</span>
            <select
              className="field-input"
              onChange={(event) =>
                setSelectedProcedure(event.target.value as InterventionType)
              }
              value={procedureForStats}
            >
              {surgicalProcedureOptions.map((procedure) => (
                <option key={procedure.value} value={procedure.value}>
                  {procedure.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="history-chart-legend">
          <span className="history-chart-legend__item history-chart-legend__item--volume">
            Volume
          </span>
          <span className="history-chart-legend__item history-chart-legend__item--score">
            Score moyen
          </span>
        </div>

        {buckets.length ? (
          <div className="history-chart" role="img" aria-label="Histogramme des blocs">
            {buckets.map((bucket) => (
              <div key={bucket.key} className="history-chart__group">
                <div className="history-chart__bars">
                  <span
                    className="history-chart__bar history-chart__bar--volume"
                    style={{
                      height: getBarHeight(bucket.volumeCount, maxVolumeCount),
                    }}
                    title={`Volume : ${bucket.volumeCount}`}
                  >
                    <span>{bucket.volumeCount}</span>
                  </span>
                  <span
                    className="history-chart__bar history-chart__bar--score"
                    style={{
                      height: getScoreBarHeight(bucket.scoreAverage),
                    }}
                    title={`Score moyen : ${
                      bucket.scoreAverage == null
                        ? 'Non calculable'
                        : `${bucket.scoreAverage} / 100`
                    }`}
                  >
                    <span>{bucket.scoreAverage ?? '—'}</span>
                  </span>
                </div>
                <span className="history-chart__label">{bucket.label}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="field-helper">
            Aucun bloc enregistré pour le moment
          </p>
        )}
      </SectionCard>

      <SectionCard
        className="section-card--scroll-list"
        title="Tous les blocs enregistrés"
      >
        {interventions.length ? (
          <div className="history-list">
            {interventions.map((intervention) => {
              const senior = getSeniorById(intervention.seniorId);
              const indicationLabel = getIndicationLabel(intervention);
              const autonomyScore = scoreByInterventionId.get(intervention.id) ?? null;

              return (
                <article key={intervention.id} className="history-list-item">
                  <div className="history-list-item__header">
                    <strong>
                      {getChoiceLabel(
                        surgicalProcedureOptions,
                        intervention.procedure
                      )}
                    </strong>
                    <span>{formatIsoDate(intervention.date)}</span>
                  </div>
                  <div className="history-list-item__meta">
                    <span>
                      Senior :{' '}
                      {senior
                        ? `${senior.firstName} ${senior.lastName}`
                        : 'Non renseigné'}
                    </span>
                    {indicationLabel ? <span>Indication : {indicationLabel}</span> : null}
                    {intervention.approach ? (
                      <span>
                        Voie : {getChoiceLabel(approachOptions, intervention.approach)}
                      </span>
                    ) : null}
                    <span>
                      Rôle : {getChoiceLabel(roleOptions, intervention.role)}
                    </span>
                    <span>
                      Score d’autonomie opératoire :{' '}
                      {formatAutonomyScore(autonomyScore)}
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="field-helper">
            Aucun bloc enregistré pour le moment
          </p>
        )}
      </SectionCard>

      <PrimaryButton
        label="Retour au portail chirurgie"
        onPress={goToSurgeryPortal}
        variant="secondary"
      />
    </ScreenContainer>
  );
}
