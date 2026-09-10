import { ArrowLeft } from 'lucide-react';
import { MouseEvent, ReactNode } from 'react';

import { useAppContext } from '../context/AppContext';

type InterventionFlowLayoutProps = {
  step: 1 | 2 | 3;
  title: string;
  eyebrow?: string;
  className?: string;
  subtitle?: string;
  onBack?: () => void;
  onTrackInteraction?: () => void;
  children: ReactNode;
};

function isTrackableInteractionTarget(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(
      target.closest('button, input, select, textarea, label, [role="button"]')
    )
  );
}

export function InterventionFlowLayout({
  step,
  title,
  eyebrow,
  className,
  subtitle,
  onBack,
  onTrackInteraction,
  children,
}: InterventionFlowLayoutProps) {
  const {
    discardOfflineInterventionDraft,
    isOnline,
    offlineDraftRecovery,
    offlineDraftStatus,
    restoreOfflineInterventionDraft,
  } = useAppContext();
  const handleInteractionCapture = (event: MouseEvent<HTMLElement>) => {
    if (!onTrackInteraction || !isTrackableInteractionTarget(event.target)) {
      return;
    }

    onTrackInteraction();
  };

  return (
    <main
      className={['screen-shell', 'intervention-flow', className]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        className="screen-shell__frame intervention-flow__frame"
        onClickCapture={handleInteractionCapture}
      >
        <header className="intervention-flow__header">
          {onBack ? (
            <button
              aria-label="Retour"
              className="intervention-flow__back"
              onClick={onBack}
              type="button"
            >
              <ArrowLeft aria-hidden="true" strokeWidth={2.4} />
            </button>
          ) : null}
          {eyebrow ? (
            <span className="intervention-flow__eyebrow">{eyebrow}</span>
          ) : null}
          <h1 className="intervention-flow__title">{title}</h1>
          {subtitle ? <p className="intervention-flow__subtitle">{subtitle}</p> : null}
        </header>

        <div className="screen-body intervention-flow__body">
          <div
            className={`offline-draft-status offline-draft-status--${
              isOnline ? offlineDraftStatus : 'offline'
            }`}
            role="status"
          >
            <span aria-hidden="true" className="offline-draft-status__dot" />
            {!isOnline
              ? 'Hors ligne · brouillon chiffré conservé sur cet appareil'
              : offlineDraftStatus === 'saving'
                ? 'Sauvegarde locale chiffrée…'
                : offlineDraftStatus === 'saved'
                  ? 'Brouillon chiffré sauvegardé sur cet appareil'
                  : offlineDraftStatus === 'error'
                    ? 'La sauvegarde locale est indisponible'
                    : 'Connexion disponible'}
          </div>

          {offlineDraftRecovery ? (
            <section className="offline-draft-recovery" aria-labelledby="offline-draft-title">
              <div>
                <strong id="offline-draft-title">Brouillon retrouvé</strong>
                <p>
                  Une saisie non terminée du{' '}
                  {new Date(offlineDraftRecovery.updatedAt).toLocaleString('fr-FR', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}{' '}
                  est disponible sur cet appareil.
                </p>
              </div>
              <div className="offline-draft-recovery__actions">
                <button className="flow-button flow-button--primary" onClick={restoreOfflineInterventionDraft} type="button">
                  Reprendre le brouillon
                </button>
                <button
                  className="flow-button flow-button--secondary"
                  onClick={() => void discardOfflineInterventionDraft()}
                  type="button"
                >
                  Supprimer le brouillon
                </button>
              </div>
            </section>
          ) : null}

          <div className="intervention-flow__progress-block" aria-hidden="true">
            <div className="intervention-flow__progress">
              <span className="intervention-flow__progress-line" />
              {[1, 2, 3].map((item) => (
                <span
                  className={`intervention-flow__progress-dot ${
                    item < step
                      ? 'intervention-flow__progress-dot--complete'
                      : ''
                  } ${item === step ? 'intervention-flow__progress-dot--active' : ''}`.trim()}
                  key={item}
                />
              ))}
            </div>
            <span className="intervention-flow__step-label">Étape {step} sur 3</span>
          </div>

          {children}
        </div>
      </div>
    </main>
  );
}
