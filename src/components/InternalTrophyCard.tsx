import type { CSSProperties } from 'react';

import { Check } from 'lucide-react';

import { TrophyDisplayModel } from '../utils/trophyDisplay';

function clampProgressRatio(progressCurrent: number | null, progressTarget: number | null) {
  if (typeof progressCurrent !== 'number' || typeof progressTarget !== 'number' || progressTarget <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(1, progressCurrent / progressTarget));
}

function mixChannel(start: number, end: number, ratio: number) {
  return Math.round(start + (end - start) * ratio);
}

function mixColor(startHex: string, endHex: string, ratio: number) {
  const normalizedRatio = Math.max(0, Math.min(1, ratio));
  const start = startHex.replace('#', '');
  const end = endHex.replace('#', '');
  const startRgb = [
    Number.parseInt(start.slice(0, 2), 16),
    Number.parseInt(start.slice(2, 4), 16),
    Number.parseInt(start.slice(4, 6), 16),
  ];
  const endRgb = [
    Number.parseInt(end.slice(0, 2), 16),
    Number.parseInt(end.slice(2, 4), 16),
    Number.parseInt(end.slice(4, 6), 16),
  ];
  const rgb = startRgb.map((channel, index) =>
    mixChannel(channel, endRgb[index], normalizedRatio)
  );

  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

function getProgressFillStyle(progressRatio: number): CSSProperties {
  const startColor = mixColor('#0f2954', '#0f6a87', progressRatio);
  const endColor = mixColor('#1a4f7a', '#47c9d0', progressRatio);

  return {
    width: `${progressRatio * 100}%`,
    minWidth: progressRatio > 0 ? '12px' : '0',
    background: `linear-gradient(90deg, ${startColor} 0%, ${endColor} 100%)`,
  };
}

export function InternalTrophyCard({
  item,
  compact = false,
}: {
  item: TrophyDisplayModel;
  compact?: boolean;
}) {
  const progressRatio = clampProgressRatio(item.progressCurrent, item.progressTarget);
  const className = [
    'internal-trophy-card',
    compact ? 'internal-trophy-card--compact' : '',
    item.isUnlocked ? 'internal-trophy-card--unlocked' : 'internal-trophy-card--locked',
    item.isSecret ? 'internal-trophy-card--secret' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <article className={className}>
      <div className="internal-trophy-card__visual">
        {item.imageSrc ? (
          <img alt={item.title} className="internal-trophy-card__image" src={item.imageSrc} />
        ) : (
          <div aria-hidden="true" className="internal-trophy-card__mystery">
            ?
          </div>
        )}
      </div>

      <div className="internal-trophy-card__copy">
        <strong>{item.title}</strong>
        <span>{item.subtitle}</span>
      </div>

      {!item.isUnlocked && item.section === 'progress' ? (
        <div className="internal-trophy-card__progress" aria-hidden="true">
          <div className="internal-trophy-card__progress-track">
            <div
              className="internal-trophy-card__progress-fill"
              style={getProgressFillStyle(progressRatio)}
            />
          </div>
        </div>
      ) : null}

      {item.isUnlocked && item.statusLabel ? (
        <div className="internal-trophy-card__status">
          <Check aria-hidden="true" strokeWidth={2.25} />
          <span>{item.statusLabel}</span>
        </div>
      ) : null}
    </article>
  );
}
