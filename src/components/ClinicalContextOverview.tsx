import { useId } from 'react';

import { getClinicalContextSummaryRows } from '../data/contextVariables';
import type { SavedIntervention } from '../types';

const CLINICAL_CONTEXT_EMPTY_VALUES = new Set([
  'Non renseigné',
  'Non renseignée',
  'Non renseignées',
]);

const CLINICAL_CONTEXT_PRIMARY_LABELS = new Set([
  'Âge de la patiente',
  'IMC de la patiente',
  'Saignement per-opératoire',
]);

interface ClinicalContextOverviewProps {
  className?: string;
  intervention: Pick<
    SavedIntervention,
    'contextVariables' | 'operativeDurationMinutes'
  >;
}

export function ClinicalContextOverview({
  className,
  intervention,
}: ClinicalContextOverviewProps) {
  const titleId = useId();
  const contextRows = getClinicalContextSummaryRows(
    intervention.contextVariables
  );
  const visibleContextRows = contextRows.filter(
    (row) => !CLINICAL_CONTEXT_EMPTY_VALUES.has(row.value)
  );
  const getContextValue = (label: string) =>
    contextRows.find((row) => row.label === label)?.value ?? 'Non renseigné';
  const metrics = [
    {
      label: 'Âge',
      value: getContextValue('Âge de la patiente'),
    },
    {
      label: 'IMC',
      value: getContextValue('IMC de la patiente'),
    },
    {
      label: 'Durée opératoire',
      value: intervention.operativeDurationMinutes
        ? `${intervention.operativeDurationMinutes} min`
        : 'Non renseignée',
    },
    {
      label: 'Saignement',
      value: getContextValue('Saignement per-opératoire'),
    },
  ];
  const otherContextRows = visibleContextRows.filter(
    (row) => !CLINICAL_CONTEXT_PRIMARY_LABELS.has(row.label)
  );
  const clinicalDataCount =
    visibleContextRows.length +
    (intervention.operativeDurationMinutes ? 1 : 0);

  return (
    <section
      aria-labelledby={titleId}
      className={['clinical-context-overview', className]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="clinical-context-overview__heading">
        <div>
          <strong id={titleId}>Contexte clinique</strong>
        </div>
        <span className="clinical-context-overview__count">
          {clinicalDataCount}{' '}
          {clinicalDataCount === 1 ? 'donnée' : 'données'}
        </span>
      </div>

      <dl className="clinical-context-overview__metrics">
        {metrics.map((metric) => (
          <div key={metric.label}>
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
          </div>
        ))}
      </dl>

      <details className="clinical-context-overview__details">
        <summary>Voir les autres variables</summary>
        {otherContextRows.length ? (
          <dl>
            {otherContextRows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p>Aucune autre variable renseignée.</p>
        )}
      </details>
    </section>
  );
}
