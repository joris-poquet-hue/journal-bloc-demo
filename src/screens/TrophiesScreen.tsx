import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Trophy,
  X,
} from 'lucide-react';
import {
  CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { InternalTrophyCard } from '../components/InternalTrophyCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { useAppContext } from '../context/AppContext';
import { formatIsoDate } from '../utils/date';
import {
  TrophyDisplayModel,
  buildTrophyDisplayModels,
} from '../utils/trophyDisplay';

type TrophySectionId = 'earned' | 'progress';

function getProgressRatio(item: TrophyDisplayModel) {
  if (
    typeof item.progressCurrent !== 'number' ||
    typeof item.progressTarget !== 'number' ||
    item.progressTarget <= 0
  ) {
    return 0;
  }

  return item.progressCurrent / item.progressTarget;
}

function compareProgressTrophies(
  left: TrophyDisplayModel,
  right: TrophyDisplayModel
) {
  const ratioDelta = getProgressRatio(right) - getProgressRatio(left);

  if (ratioDelta !== 0) {
    return ratioDelta;
  }

  const currentDelta =
    (right.progressCurrent ?? 0) - (left.progressCurrent ?? 0);

  if (currentDelta !== 0) {
    return currentDelta;
  }

  return left.title.localeCompare(right.title, 'fr');
}

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

function TrophyCollectionStack({
  item,
  onOpenTierGallery,
}: {
  item: TrophyDisplayModel;
  onOpenTierGallery: (
    item: TrophyDisplayModel,
    trigger: HTMLButtonElement
  ) => void;
}) {
  const historicalTiers = item.earnedTiers.slice(1, 4);
  const stackDepth = historicalTiers.length;

  return (
    <div
      className={`trophy-collection-stack${
        stackDepth > 0 ? ' trophy-collection-stack--layered' : ''
      }`}
      data-depth={stackDepth}
    >
      {historicalTiers.map((tier, index) => (
        <div
          aria-hidden="true"
          className="trophy-collection-stack__layer"
          data-tier={tier.tier ?? 'unique'}
          key={`${tier.tier ?? 'unique'}:${tier.awardedAt}`}
          style={
            {
              '--trophy-stack-x': `${12 + index * 9}px`,
              zIndex: 3 - index,
            } as CSSProperties
          }
        />
      ))}

      <InternalTrophyCard
        item={item}
        onOpenDetails={
          stackDepth > 0
            ? (trigger) => onOpenTierGallery(item, trigger)
            : undefined
        }
      />
    </div>
  );
}

function TrophyTierGallery({
  item,
  onClose,
  returnFocus,
}: {
  item: TrophyDisplayModel;
  onClose: () => void;
  returnFocus: HTMLButtonElement;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const earnedTiers = item.earnedTiers;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
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
      window.requestAnimationFrame(() => returnFocus.focus());
    };
  }, [onClose, returnFocus]);

  return (
    <div className="trophy-detail-backdrop" onClick={onClose}>
      <section
        aria-label={`Niveaux obtenus pour le trophée ${item.title}`}
        aria-modal="true"
        className="trophy-tier-gallery"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        style={
          {
            '--trophy-tier-count': earnedTiers.length,
            '--trophy-tier-dialog-width': `${Math.min(
              1180,
              72 + earnedTiers.length * 260
            )}px`,
          } as CSSProperties
        }
      >
        <button
          aria-label="Fermer les trophées obtenus"
          className="trophy-detail-dialog__close trophy-tier-gallery__close"
          onClick={onClose}
          ref={closeButtonRef}
          type="button"
        >
          <X aria-hidden="true" />
        </button>

        <div className="trophy-tier-gallery__cards">
          {earnedTiers.map((tier) => (
            <article
              className="trophy-tier-gallery__card"
              data-tier={tier.tier ?? 'unique'}
              key={`${tier.tier ?? 'unique'}:${tier.awardedAt}`}
            >
              <div className="trophy-tier-gallery__visual">
                {tier.imageSrc ? <img alt="" src={tier.imageSrc} /> : null}
              </div>
              <div className="trophy-tier-gallery__copy">
                <h2>{item.title}</h2>
                <p>{item.description || item.subtitle}</p>
                <time dateTime={tier.awardedAt}>
                  {formatIsoDate(tier.awardedAt)}
                </time>
              </div>
            </article>
          ))}
        </div>
      </section>
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

export function TrophiesScreen() {
  const {
    adminEvaluations,
    adminTrophies,
    customSurgicalInterventions,
    selectedInternal,
    savedInterventions,
    trophyAwards,
    backToWelcome,
  } = useAppContext();
  const [activeSectionSheet, setActiveSectionSheet] = useState<TrophySectionId | null>(
    null
  );
  const [isWebCollectionOpen, setIsWebCollectionOpen] = useState(false);
  const [tierGallery, setTierGallery] = useState<{
    item: TrophyDisplayModel;
    returnFocus: HTMLButtonElement;
  } | null>(null);
  const isNativeApp =
    typeof window !== 'undefined' &&
    Boolean(
      (window as Window & { __MONJDB_NATIVE_APP__?: boolean })
        .__MONJDB_NATIVE_APP__
    );
  const trophyDisplay = useMemo(
    () => {
      if (!selectedInternal) {
        return {
          counts: { earned: 0, progress: 0 },
          earned: [],
          progress: [],
        };
      }

      return buildTrophyDisplayModels({
        adminEvaluations,
        adminTrophies,
        customSurgicalInterventions,
        profile: selectedInternal,
        savedInterventions,
        trophyAwards,
      });
    },
    [
      adminEvaluations,
      adminTrophies,
      customSurgicalInterventions,
      savedInterventions,
      selectedInternal,
      trophyAwards,
    ]
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
  const sortedProgressTrophies = [...trophyDisplay.progress].sort(
    compareProgressTrophies
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
      title: 'Mes trophées remportés',
      items: trophyDisplay.earned,
      previewItems: trophyDisplay.earned.slice(0, 3),
      sheetDescription: 'Tous les trophées actifs obtenus au fil de ta progression.',
    },
    {
      filter: 'progress',
      title: isNativeApp ? 'Mes trophées en cours' : 'Trophées en cours ...',
      items: isNativeApp ? trophyDisplay.progress : sortedProgressTrophies,
      previewItems: (
        isNativeApp ? trophyDisplay.progress : sortedProgressTrophies
      ).slice(0, 3),
      sheetDescription:
        'Les trophées actifs visibles qui progressent encore vers leur prochain palier.',
    },
  ];
  const activeSheetSection = activeSectionSheet
    ? trophySections.find((section) => section.filter === activeSectionSheet) ?? null
    : null;
  const hasAnyTrophies =
    trophyDisplay.earned.length > 0 || trophyDisplay.progress.length > 0;
  const latestEarnedTrophy = trophyDisplay.earned[0] ?? null;
  const earnedCountLabel = `${trophyDisplay.counts.earned} trophée${
    trophyDisplay.counts.earned > 1 ? 's' : ''
  } remporté${trophyDisplay.counts.earned > 1 ? 's' : ''}`;
  const progressCountLabel = `${trophyDisplay.counts.progress} objectif${
    trophyDisplay.counts.progress > 1 ? 's' : ''
  } en cours`;

  if (!isNativeApp && isWebCollectionOpen) {
    return (
      <>
        <ScreenContainer
          bodyClassName="trophy-screen__body trophy-collection-page__body"
          frameClassName="trophy-screen__frame"
          frameWidth="wide"
          headerAction={<TrophyHeroIllustration />}
          heroTop={
            <button
              className="trophy-screen__back"
              onClick={() => setIsWebCollectionOpen(false)}
              type="button"
            >
              <ChevronLeft aria-hidden="true" />
              Retour
            </button>
          }
          shellClassName="trophy-screen trophy-screen--web-showcase trophy-screen--web-collection"
          subtitle="Tes trophées remportés au fil de ta progression."
          title="Ma collection"
        >
          <section
            aria-label="Collection des trophées remportés"
            className="trophy-collection-page"
          >
            <header className="trophy-collection-page__header">
              <div>
                <span>Collection</span>
                <h2>{earnedCountLabel}</h2>
              </div>
            </header>

            <div className="trophy-collection-page__grid">
              {trophyDisplay.earned.map((item) => (
                <TrophyCollectionStack
                  item={item}
                  key={item.id}
                  onOpenTierGallery={(selectedItem, trigger) =>
                    setTierGallery({
                      item: selectedItem,
                      returnFocus: trigger,
                    })
                  }
                />
              ))}
            </div>
          </section>
        </ScreenContainer>

        {tierGallery ? (
          <TrophyTierGallery
            item={tierGallery.item}
            onClose={() => setTierGallery(null)}
            returnFocus={tierGallery.returnFocus}
          />
        ) : null}
      </>
    );
  }

  return (
    <>
      <ScreenContainer
        bodyClassName="trophy-screen__body"
        frameWidth={isNativeApp ? 'default' : 'wide'}
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
        shellClassName={`trophy-screen${
          isNativeApp ? '' : ' trophy-screen--web-showcase'
        }`}
        subtitle={
          isNativeApp
            ? 'Les trophées obtenus lors de ta progression au bloc.'
            : 'Chaque trophée raconte une étape de ta progression.'
        }
        title="Mes trophées"
      >
        {isNativeApp ? (
          <>
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
                        <InternalTrophyCard item={item} key={item.id} />
                      ))}
                    </div>
                  </section>
                ))
            ) : (
              <section
                aria-label="Aucun trophée remporté"
                className="trophy-empty-state"
              >
                <div className="trophy-empty-state__icon">
                  <Trophy aria-hidden="true" strokeWidth={2.1} />
                </div>
                <strong>Aucun trophée remporté pour le moment</strong>
                <p>Progresse pour remporter des trophées!</p>
              </section>
            )}
          </>
        ) : hasAnyTrophies ? (
          <div className="trophy-showcase">
            <section
              aria-label="Dernière réussite et résumé de la collection"
              className={`trophy-showcase__feature${
                latestEarnedTrophy
                  ? ''
                  : ' trophy-showcase__feature--awaiting'
              }`}
            >
              {latestEarnedTrophy ? (
                <InternalTrophyCard
                  item={latestEarnedTrophy}
                  kicker="Dernier trophée obtenu"
                  presentation="feature"
                />
              ) : (
                <div className="trophy-showcase__awaiting">
                  <div
                    aria-hidden="true"
                    className="trophy-showcase__awaiting-icon"
                  >
                    <Trophy strokeWidth={1.85} />
                  </div>
                  <div>
                    <span>Ma collection</span>
                    <h2>Ta vitrine se construit</h2>
                    <p>
                      Ton premier trophée apparaîtra ici dès qu’il sera obtenu.
                    </p>
                  </div>
                </div>
              )}

              <aside
                aria-label="Résumé de la collection"
                className="trophy-showcase__stats"
              >
                <span>Collection</span>
                <strong>{earnedCountLabel}</strong>
                <small>{progressCountLabel}</small>
                {latestEarnedTrophy ? (
                  <button
                    onClick={() => setIsWebCollectionOpen(true)}
                    type="button"
                  >
                    Voir la collection
                    <ChevronRight aria-hidden="true" />
                  </button>
                ) : null}
              </aside>
            </section>

            {sortedProgressTrophies.length > 0 ? (
              <section className="trophy-showcase__next">
                <header>
                  <h2>Objectifs en cours</h2>
                </header>

                <div className="trophy-showcase__objectives">
                  {sortedProgressTrophies.map((item) => (
                    <InternalTrophyCard
                      actionLabel="Voir le détail"
                      item={item}
                      key={item.id}
                      kicker="Progression actuelle"
                      presentation="wide"
                      supportingText={item.subtitle}
                    />
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        ) : (
          <section className="trophy-empty-state" aria-label="Aucun trophée remporté">
            <div className="trophy-empty-state__icon">
              <Trophy aria-hidden="true" strokeWidth={2.1} />
            </div>
            <strong>Aucun trophée remporté pour le moment</strong>
            <p>Progresse pour remporter des trophées!</p>
          </section>
        )}
      </ScreenContainer>

      {isNativeApp && activeSheetSection ? (
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
                <InternalTrophyCard
                  item={item}
                  key={item.id}
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}

    </>
  );
}
