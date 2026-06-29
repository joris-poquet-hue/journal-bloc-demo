import { ChevronRight, LockKeyhole } from 'lucide-react';

import { ApproachIcon } from './ApproachIcon';
import { SavedIntervention } from '../types';

type SurgeryInterventionCardProps = {
  intervention: SavedIntervention;
  procedureLabel: string;
  seniorLabel: string;
  dateLabel: string;
  dateMetaLabel?: string;
  isValidated: boolean;
  onPress?: () => void;
};

export function formatInterventionCardDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
    .format(new Date(year, month - 1, day))
    .replace(/\./g, '')
    .toLocaleUpperCase('fr-FR');
}

export function SurgeryInterventionCard({
  intervention,
  procedureLabel,
  seniorLabel,
  dateLabel,
  dateMetaLabel,
  isValidated,
  onPress,
}: SurgeryInterventionCardProps) {
  const content = (
    <>
      <span className="surgery-intervention-card__medallion">
        <ApproachIcon
          className="approach-icon--intervention-card"
          intervention={intervention}
        />
      </span>
      <span className="surgery-intervention-card__content">
        <span className="surgery-intervention-card__date-line">
          <span>{dateLabel}</span>
          {dateMetaLabel ? (
            <span className="surgery-intervention-card__date-meta">
              {dateMetaLabel}
            </span>
          ) : null}
        </span>
        <strong>{procedureLabel}</strong>
        <span className="surgery-intervention-card__senior">{seniorLabel}</span>
      </span>
      <span className="surgery-intervention-card__status">
        {isValidated ? (
          <ChevronRight aria-hidden="true" />
        ) : (
          <span
            aria-label="En attente d’évaluation"
            className="intervention-lock-indicator"
            role="img"
          >
            <LockKeyhole aria-hidden="true" />
          </span>
        )}
      </span>
    </>
  );

  if (isValidated && onPress) {
    return (
      <button
        className="surgery-intervention-card surgery-intervention-card--clickable"
        onClick={onPress}
        type="button"
      >
        {content}
      </button>
    );
  }

  return (
    <article className="surgery-intervention-card surgery-intervention-card--locked">
      {content}
    </article>
  );
}
