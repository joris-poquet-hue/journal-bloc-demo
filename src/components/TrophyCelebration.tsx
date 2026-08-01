import { Sparkles, X } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { useAppContext } from '../context/AppContext';

export function TrophyCelebration() {
  const {
    dismissTrophyCelebration,
    goToTrophies,
    trophyCelebration,
  } = useAppContext();
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!trophyCelebration) {
      return;
    }

    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        dismissTrophyCelebration();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dismissTrophyCelebration, trophyCelebration]);

  if (!trophyCelebration) {
    return null;
  }

  const openTrophies = () => {
    dismissTrophyCelebration();
    goToTrophies();
  };

  return (
    <div
      className="trophy-celebration-backdrop"
      onClick={dismissTrophyCelebration}
    >
      <section
        aria-labelledby="trophy-celebration-title"
        aria-modal="true"
        className="trophy-celebration"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <button
          aria-label="Fermer la célébration"
          className="trophy-celebration__close"
          onClick={dismissTrophyCelebration}
          ref={closeButtonRef}
          type="button"
        >
          <X aria-hidden="true" />
        </button>

        <div aria-hidden="true" className="trophy-celebration__sparkles">
          <Sparkles />
        </div>

        {trophyCelebration.imageSrc ? (
          <img
            alt=""
            className="trophy-celebration__image"
            src={trophyCelebration.imageSrc}
          />
        ) : null}

        <span className="trophy-celebration__eyebrow">
          Nouveau trophée obtenu
        </span>
        <h2 id="trophy-celebration-title">{trophyCelebration.title}</h2>
        {trophyCelebration.tierLabel ? (
          <p>Niveau {trophyCelebration.tierLabel}</p>
        ) : null}

        <button
          className="app-button app-button--primary"
          onClick={openTrophies}
          type="button"
        >
          Voir mes trophées
        </button>
      </section>
    </div>
  );
}
