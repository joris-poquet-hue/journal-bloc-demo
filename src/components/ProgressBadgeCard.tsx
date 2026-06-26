import { LockKeyhole } from 'lucide-react';

import { ProgressBadge } from '../types';
import { formatIsoDate } from '../utils/date';

function getProgressTone(progressRatio: number) {
  if (progressRatio < 0.4) {
    return 'danger';
  }

  if (progressRatio < 0.75) {
    return 'warning';
  }

  return 'success';
}

export function ProgressBadgeCard({
  badge,
  compact = false,
  revealTitleOnHover = false,
  showAsSecret = false,
  showEarnedDate = true,
}: {
  badge: ProgressBadge;
  compact?: boolean;
  revealTitleOnHover?: boolean;
  showAsSecret?: boolean;
  showEarnedDate?: boolean;
}) {
  const progressRatio = Math.max(0, Math.min(1, badge.current / badge.target));
  const progressTone = getProgressTone(progressRatio);
  const className = [
    'badge-card',
    compact ? 'badge-card--compact' : '',
    revealTitleOnHover ? 'badge-card--hover-reveal' : '',
    badge.isEarned ? '' : 'badge-card--locked',
  ]
    .filter(Boolean)
    .join(' ');
  const isSecret = showAsSecret || badge.isLocked;
  const displayTitle = isSecret ? 'Trophée secret' : badge.title;
  const shouldShowMeta = !revealTitleOnHover;

  return (
    <article
      aria-label={displayTitle}
      className={className}
      tabIndex={revealTitleOnHover ? 0 : undefined}
    >
      {badge.isEarned ? (
        <img
          alt={badge.title}
          className="badge-card__image"
          src={badge.imageSrc}
        />
      ) : isSecret ? (
        <div
          aria-hidden="true"
          className="badge-card__placeholder badge-card__placeholder--lock"
        >
          <LockKeyhole strokeWidth={1.9} />
        </div>
      ) : (
        <div aria-hidden="true" className="badge-card__placeholder">
          ?
        </div>
      )}
      <strong className="badge-card__title">{displayTitle}</strong>
      {(shouldShowMeta || showEarnedDate) && badge.isEarned && badge.awardedAt ? (
        <span className="badge-card__date">{formatIsoDate(badge.awardedAt)}</span>
      ) : shouldShowMeta && (badge.isBinary || isSecret) ? (
        <div className="badge-card__binary-state" />
      ) : shouldShowMeta ? (
        <div
          aria-label={`${badge.current}/${badge.target}`}
          className="badge-card__progress"
          role="img"
        >
          <div className="badge-card__progress-track">
            <div
              className={`badge-card__progress-fill badge-card__progress-fill--${progressTone}`}
              style={{ width: `${progressRatio * 100}%` }}
            />
          </div>
        </div>
      ) : !badge.isEarned && !badge.isBinary && !isSecret ? (
        <div
          aria-label={`${badge.current}/${badge.target}`}
          className="badge-card__progress"
          role="img"
        >
          <div className="badge-card__progress-track">
            <div
              className={`badge-card__progress-fill badge-card__progress-fill--${progressTone}`}
              style={{ width: `${progressRatio * 100}%` }}
            />
          </div>
        </div>
      ) : null}
    </article>
  );
}
