import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  LockKeyhole,
  Sparkles,
  Star,
  Trophy,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';

import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAppContext } from '../context/AppContext';
import {
  TrophyDisplayModel,
  buildTrophyDisplayModels,
} from '../utils/trophyDisplay';

type TrophySectionId = 'earned' | 'progress' | 'secret';
type TrophyKind = TrophyDisplayModel['section'];

function TrophyHeroIllustration() {
  return (
    <div aria-hidden="true" className="trophy-hero-illustration trophy-hero-illustration--image">
      <img
        alt=""
        className="trophy-hero-illustration__image"
        src="/images/trophies/trophy-page-background.png"
      />
    </div>
  );
}

function TrophySummaryCard({
  earnedCount,
  progressCount,
}: {
  earnedCount: number;
  progressCount: number;
}) {
  return (
    <section className="trophy-summary-card" aria-label="Résumé des trophées">
      <div className="trophy-summary-card__item">
        <div className="trophy-summary-card__icon trophy-summary-card__icon--gold">
          <Trophy aria-hidden="true" strokeWidth={2.05} />
        </div>
        <div className="trophy-summary-card__copy">
          <strong>{earnedCount}</strong>
          <span>débloqués</span>
        </div>
      </div>
      <div aria-hidden="true" className="trophy-summary-card__divider" />
      <div className="trophy-summary-card__item">
        <div className="trophy-summary-card__icon trophy-summary-card__icon--clock">
          <Clock3 aria-hidden="true" strokeWidth={2.05} />
        </div>
        <div className="trophy-summary-card__copy">
          <strong>{progressCount}</strong>
          <span>en cours</span>
        </div>
      </div>
    </section>
  );
}

function TrophyCard({
  item,
  onPress,
}: {
  item: TrophyDisplayModel;
  onPress: (item: TrophyDisplayModel) => void;
}) {
  const hasProgress =
    typeof item.progressCurrent === 'number' && typeof item.progressTarget === 'number';
  const progressCurrent = item.progressCurrent ?? 0;
  const progressTarget = item.progressTarget ?? 0;
  const progressRatio =
    hasProgress
      ? Math.max(0, Math.min(1, progressCurrent / progressTarget))
      : 0;
  const badgeAccentClass =
    item.accent === 'green'
      ? 'trophy-card__badge--green'
      : item.accent === 'bronze'
        ? 'trophy-card__badge--bronze'
        : item.accent === 'gold'
          ? 'trophy-card__badge--gold'
          : item.accent === 'silver'
            ? 'trophy-card__badge--silver'
            : 'trophy-card__badge--blue';

  return (
    <button
      className={`trophy-card trophy-card--${item.section} trophy-card--${item.accent}`}
      data-trophy-id={item.id}
      data-trophy-kind={item.section}
      onClick={() => onPress(item)}
      type="button"
    >
      {item.section === 'secret' ? (
        <div className="trophy-card__secret-top">
          <Sparkles className="trophy-card__secret-star trophy-card__secret-star--left" />
          <div className="trophy-card__secret-lock">
            <LockKeyhole aria-hidden="true" strokeWidth={2.05} />
          </div>
          <Sparkles className="trophy-card__secret-star trophy-card__secret-star--right" />
        </div>
      ) : (
        <>
          <div className={`trophy-card__badge ${badgeAccentClass}`}>
            {item.section === 'earned' ? (
              <Check aria-hidden="true" strokeWidth={2.5} />
            ) : (
              <Star aria-hidden="true" fill="currentColor" strokeWidth={2.2} />
            )}
          </div>
          <div className="trophy-card__medallion">
            {item.imageSrc ? (
              <img
                alt={item.title}
                className="trophy-card__image"
                src={item.imageSrc}
              />
            ) : (
              <div className="trophy-card__medallion-inner">
                <Trophy aria-hidden="true" strokeWidth={2.05} />
              </div>
            )}
          </div>
        </>
      )}

      <div className="trophy-card__content">
        <strong>{item.title}</strong>
        <span>{item.subtitle}</span>
      </div>

      {item.section === 'earned' && item.statusLabel ? (
        <div className="trophy-card__status">
          <span>{item.statusLabel}</span>
          <Check aria-hidden="true" strokeWidth={2.4} />
        </div>
      ) : null}

      {item.section === 'progress' && hasProgress ? (
        <div className="trophy-card__progress-block">
          <div aria-hidden="true" className="trophy-card__progress-track">
            <div
              className="trophy-card__progress-fill"
              style={{ width: `${progressRatio * 100}%` }}
            />
          </div>
          <strong className="trophy-card__progress-label">
            {progressCurrent} / {progressTarget}
          </strong>
        </div>
      ) : null}
    </button>
  );
}

export function TrophiesScreen() {
  const {
    adminEvaluations,
    adminTrophies,
    selectedInternal,
    savedInterventions,
    backToWelcome,
  } = useAppContext();
  const [activeSectionSheet, setActiveSectionSheet] = useState<TrophySectionId | null>(
    null
  );

  if (!selectedInternal) {
    return (
      <ScreenContainer
        title="Mes trophées"
        subtitle="Reconnecte-toi pour consulter tes trophées."
      >
        <PrimaryButton label="Retour à l’accueil" onPress={backToWelcome} />
      </ScreenContainer>
    );
  }
  const trophyDisplay = useMemo(
    () =>
      buildTrophyDisplayModels({
        adminEvaluations,
        adminTrophies,
        profile: selectedInternal,
        savedInterventions,
      }),
    [adminEvaluations, adminTrophies, savedInterventions, selectedInternal]
  );
  const trophySections: Array<{
    filter: TrophySectionId;
    title: string;
    items: TrophyDisplayModel[];
    previewItems: TrophyDisplayModel[];
    sheetDescription: string;
  }> = [
    {
      filter: 'earned',
      title: 'Récemment débloqués',
      items: trophyDisplay.earned,
      previewItems: trophyDisplay.earned.slice(0, 3),
      sheetDescription: 'Tous les trophées actifs obtenus au fil de ta progression.',
    },
    {
      filter: 'progress',
      title: 'En cours',
      items: trophyDisplay.progress,
      previewItems: trophyDisplay.progress.slice(0, 3),
      sheetDescription:
        'Les trophées actifs visibles qui progressent encore vers leur prochain palier.',
    },
    {
      filter: 'secret',
      title: 'Secrets à découvrir',
      items: trophyDisplay.secret,
      previewItems: trophyDisplay.secret.slice(0, 3),
      sheetDescription:
        'Les trophées actifs surprise restent visibles, mais verrouillés avant leur obtention.',
    },
  ];
  const activeSheetSection = activeSectionSheet
    ? trophySections.find((section) => section.filter === activeSectionSheet) ?? null
    : null;
  const hasAnyTrophies =
    trophyDisplay.earned.length > 0 ||
    trophyDisplay.progress.length > 0 ||
    trophyDisplay.secret.length > 0;
  const handleTrophyPress = (_item: TrophyDisplayModel) => {};

  return (
    <>
      <ScreenContainer
        bodyClassName="trophy-screen__body"
        frameClassName="trophy-screen__frame"
        headerAction={<TrophyHeroIllustration />}
        heroTop={
          <button
            className="trophy-screen__back"
            onClick={backToWelcome}
            type="button"
          >
            <ChevronLeft aria-hidden="true" />
            Retour
          </button>
        }
        shellClassName="trophy-screen"
        subtitle="Les trophées obtenus lors de ta progression au bloc."
        title="Mes trophées"
      >
        <TrophySummaryCard
          earnedCount={trophyDisplay.counts.earned}
          progressCount={trophyDisplay.counts.progress}
        />

        {hasAnyTrophies ? (
          trophySections
            .filter((section) => section.items.length > 0)
            .map((section) => (
              <section className="trophy-section" key={section.filter}>
                <header className="trophy-section__header">
                  <h2>{section.title}</h2>
                  <button
                    className="trophy-section__link"
                    onClick={() => setActiveSectionSheet(section.filter)}
                    type="button"
                  >
                    Voir tout
                    <ChevronRight aria-hidden="true" />
                  </button>
                </header>

                <div className="trophy-card-grid">
                  {section.previewItems.map((item) => (
                    <TrophyCard item={item} key={item.id} onPress={handleTrophyPress} />
                  ))}
                </div>
              </section>
            ))
        ) : (
          <section className="trophy-empty-state" aria-label="Aucun trophée actif">
            <div className="trophy-empty-state__icon">
              <Trophy aria-hidden="true" strokeWidth={2.1} />
            </div>
            <strong>Aucun trophée actif pour le moment</strong>
            <p>
              Les trophées apparaîtront ici dès qu’ils seront activés dans le
              catalogue administrateur.
            </p>
          </section>
        )}
      </ScreenContainer>

      {activeSheetSection ? (
        <div
          className="account-sheet-backdrop"
          onClick={() => setActiveSectionSheet(null)}
        >
          <div
            aria-modal="true"
            className="account-sheet trophy-section-sheet"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="account-sheet__header">
              <div className="account-sheet__heading">
                <span>Mes trophées</span>
                <h3>{activeSheetSection.title}</h3>
                <p>
                  {activeSheetSection.sheetDescription} {activeSheetSection.items.length}{' '}
                  trophée
                  {activeSheetSection.items.length > 1 ? 's' : ''} affiché
                  {activeSheetSection.items.length > 1 ? 's' : ''}.
                </p>
              </div>
              <button
                aria-label="Fermer la fenêtre"
                className="account-sheet__close"
                onClick={() => setActiveSectionSheet(null)}
                type="button"
              >
                <X aria-hidden="true" strokeWidth={2.1} />
              </button>
            </div>

            <div className="trophy-section-sheet__grid">
              {activeSheetSection.items.map((item) => (
                <TrophyCard item={item} key={item.id} onPress={handleTrophyPress} />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
