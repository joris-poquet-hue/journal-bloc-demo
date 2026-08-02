import { ChevronRight, Target, X } from 'lucide-react';
import { createPortal } from 'react-dom';
import {
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

import { formatIsoDate } from '../utils/date';
import { TrophyDisplayModel } from '../utils/trophyDisplay';

type InternalTrophyCardProps = {
  actionLabel?: string;
  autoOpen?: boolean;
  item: TrophyDisplayModel;
  onAutoOpen?: () => void;
  kicker?: string;
  onOpenDetails?: (trigger: HTMLButtonElement) => void;
  presentation?: 'default' | 'feature' | 'wide';
  supportingText?: string;
};

export function InternalTrophyCard({
  actionLabel,
  autoOpen = false,
  item,
  kicker,
  onAutoOpen,
  onOpenDetails,
  presentation = 'default',
  supportingText,
}: InternalTrophyCardProps) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const dialogDescriptionId = useId();
  const dialogTitleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const autoOpenHandledRef = useRef(false);
  const detailDescription = item.isSecret
    ? item.subtitle
    : item.description || (item.section === 'progress' ? item.subtitle : '');
  const isNativeApp =
    typeof window !== 'undefined' &&
    Boolean(
      (window as Window & { __MONJDB_NATIVE_APP__?: boolean })
        .__MONJDB_NATIVE_APP__
    );
  const hasNumericProgress =
    item.progressCurrent != null &&
    item.progressTarget != null &&
    item.progressTarget > 0;
  const progressPercentage = hasNumericProgress
    ? Math.min(
        100,
        Math.max(0, Math.round((item.progressCurrent! / item.progressTarget!) * 100))
      )
    : null;
  const className = [
    'internal-trophy-card',
    item.isUnlocked ? 'internal-trophy-card--unlocked' : 'internal-trophy-card--locked',
    item.isSecret ? 'internal-trophy-card--secret' : '',
    presentation !== 'default'
      ? `internal-trophy-card--${presentation}`
      : '',
  ]
    .filter(Boolean)
    .join(' ');
  const showShowcaseProgress =
    item.section === 'progress' && (isNativeApp || presentation !== 'default');

  const closeDetails = () => {
    setIsDetailsOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };
  const openDetails = (trigger: HTMLButtonElement) => {
    if (onOpenDetails) {
      onOpenDetails(trigger);
      return;
    }

    setIsDetailsOpen(true);
  };

  useEffect(() => {
    if (!autoOpen || autoOpenHandledRef.current || !triggerRef.current) {
      return;
    }

    autoOpenHandledRef.current = true;
    openDetails(triggerRef.current);
    onAutoOpen?.();
  }, [autoOpen, onAutoOpen]);

  useEffect(() => {
    if (!isDetailsOpen || onOpenDetails) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsDetailsOpen(false);
        window.requestAnimationFrame(() => triggerRef.current?.focus());
      }

      if (event.key === 'Tab') {
        event.preventDefault();
        closeButtonRef.current?.focus();
      }
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    closeButtonRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isDetailsOpen, onOpenDetails]);

  return (
    <>
      <article className={className}>
        <button
          aria-expanded={onOpenDetails ? undefined : isDetailsOpen}
          aria-haspopup="dialog"
          aria-label={`Voir le détail du trophée ${item.title}`}
          className="internal-trophy-card__trigger"
          onClick={(event) => openDetails(event.currentTarget)}
          ref={triggerRef}
          type="button"
        />

        <div className="internal-trophy-card__visual">
          {item.imageSrc ? (
            <img
              alt={item.title}
              className="internal-trophy-card__image"
              src={item.imageSrc}
            />
          ) : item.section === 'progress' && presentation !== 'default' ? (
            <div
              aria-hidden="true"
              className="internal-trophy-card__target"
            >
              <Target strokeWidth={1.9} />
            </div>
          ) : (
            <div aria-hidden="true" className="internal-trophy-card__mystery">
              ?
            </div>
          )}
        </div>

        <div className="internal-trophy-card__copy">
          {kicker ? (
            <span className="internal-trophy-card__kicker">{kicker}</span>
          ) : null}
          <strong>{item.title}</strong>
          {supportingText ? (
            <p className="internal-trophy-card__supporting-text">
              {supportingText}
            </p>
          ) : null}
          {showShowcaseProgress ? (
            <div
              aria-label={
                hasNumericProgress
                  ? `${item.progressCurrent} sur ${item.progressTarget}`
                  : 'Progression en cours'
              }
              aria-valuemax={hasNumericProgress ? item.progressTarget! : undefined}
              aria-valuemin={hasNumericProgress ? 0 : undefined}
              aria-valuenow={hasNumericProgress ? item.progressCurrent! : undefined}
              className={`internal-trophy-card__progress${
                progressPercentage == null
                  ? ' internal-trophy-card__progress--indeterminate'
                  : ''
              }`}
              role="progressbar"
            >
              <span
                style={
                  progressPercentage == null
                    ? undefined
                    : { width: `${progressPercentage}%` }
                }
              />
            </div>
          ) : null}
          {presentation === 'feature' && item.awardedAt ? (
            <time
              className="internal-trophy-card__earned-date"
              dateTime={item.awardedAt}
            >
              Obtenu le {formatIsoDate(item.awardedAt)}
            </time>
          ) : null}
          {actionLabel ? (
            <span className="internal-trophy-card__action">
              {actionLabel}
              <ChevronRight aria-hidden="true" />
            </span>
          ) : null}
        </div>

      </article>

      {isDetailsOpen && !onOpenDetails && typeof document !== 'undefined'
        ? createPortal(
            <div className="trophy-detail-backdrop" onClick={closeDetails}>
              <section
                aria-describedby={
                  detailDescription ? dialogDescriptionId : undefined
                }
                aria-labelledby={dialogTitleId}
                aria-modal="true"
                className="trophy-detail-dialog"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
              >
                <button
                  aria-label="Fermer le détail du trophée"
                  className="trophy-detail-dialog__close"
                  onClick={closeDetails}
                  ref={closeButtonRef}
                  type="button"
                >
                  <X aria-hidden="true" />
                </button>

                <div className="trophy-detail-dialog__visual">
                  {item.imageSrc ? (
                    <img alt="" src={item.imageSrc} />
                  ) : item.section === 'progress' ? (
                    <div
                      aria-hidden="true"
                      className="internal-trophy-card__target internal-trophy-card__target--dialog"
                    >
                      <Target strokeWidth={1.9} />
                    </div>
                  ) : (
                    <div
                      aria-hidden="true"
                      className="internal-trophy-card__mystery"
                    >
                      ?
                    </div>
                  )}
                </div>

                <div className="trophy-detail-dialog__copy">
                  <h2 id={dialogTitleId}>{item.title}</h2>
                  {detailDescription ? (
                    <p id={dialogDescriptionId}>{detailDescription}</p>
                  ) : null}
                  {item.isUnlocked && item.awardedAt ? (
                    <time
                      aria-label={`Obtenu le ${formatIsoDate(item.awardedAt)}`}
                      className="trophy-detail-dialog__date"
                      dateTime={item.awardedAt}
                    >
                      {formatIsoDate(item.awardedAt)}
                    </time>
                  ) : null}
                </div>
              </section>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
