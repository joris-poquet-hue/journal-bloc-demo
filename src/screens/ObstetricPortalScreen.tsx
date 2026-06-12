import { PrimaryButton } from '../components/PrimaryButton';
import { ProgressBadgeCard } from '../components/ProgressBadgeCard';
import { ScreenContainer } from '../components/ScreenContainer';
import { SectionCard } from '../components/SectionCard';
import { useAppContext } from '../context/AppContext';
import {
  formatDisplayName,
  getProgressBadgesForInternal,
} from '../data/mockData';
import { formatIsoDate } from '../utils/date';

function getSemesterTone(semester: string) {
  const semesterNumber = Number(semester.replace('S', ''));

  if (semesterNumber >= 1 && semesterNumber <= 2) {
    return 'blue';
  }

  if (semesterNumber >= 3 && semesterNumber <= 8) {
    return 'green';
  }

  return 'gold';
}

export function ObstetricPortalScreen() {
  const {
    selectedInternal,
    savedInterventions,
    savedObstetricGestures,
    goToBadges,
    goToObstetricJournal,
    goToPortalSelection,
    goToPreBlock,
    logout,
  } = useAppContext();

  if (!selectedInternal) {
    return null;
  }

  const semesterTone = getSemesterTone(selectedInternal.semester);
  const visibleBadges = getProgressBadgesForInternal(
    selectedInternal,
    savedInterventions
  ).filter(
    (badge) =>
      !badge.isLocked &&
      (badge.isEarned || (!(badge.isBinary && !badge.isEarned) && badge.current > 0))
  );
  const recentEarnedBadges = visibleBadges
    .filter((badge) => badge.isEarned)
    .sort((left, right) => (right.awardedAt ?? '').localeCompare(left.awardedAt ?? ''));
  const inProgressBadges = visibleBadges
    .filter((badge) => !badge.isEarned)
    .sort((left, right) => (right.current / right.target) - (left.current / left.target));
  const badgePreview = recentEarnedBadges.length
    ? [
        ...recentEarnedBadges,
        ...inProgressBadges,
      ].slice(0, 3)
    : [];
  const latestGestures = savedObstetricGestures
    .filter((gesture) => gesture.internalId === selectedInternal.id)
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt))
    .slice(0, 5);

  return (
    <ScreenContainer
      eyebrow="Portail obstétrique"
      title="Portail obstétrique"
    >
      <section className="welcome-hero-card">
        <div className="welcome-hero-card__copy">
          <p>
            Ce portail rassemble les repères utiles autour de la salle de
            naissance, du suivi des gestes et de la progression clinique de
            l’interne.
          </p>
        </div>
      </section>

      <div className="section-heading">
        <span className="section-heading__eyebrow">Session</span>
        <h2 className="section-heading__title">Profil connecté</h2>
      </div>

      <article className={`profile-card profile-card--${semesterTone} profile-card--static profile-card--selected`}>
        <div className="profile-card__header">
          <strong className={`profile-card__name-tag profile-card__name-tag--${semesterTone}`}>
            {formatDisplayName(selectedInternal.firstName, selectedInternal.lastName)}
          </strong>
          <span className="profile-card__badge">{selectedInternal.semester}</span>
        </div>
        <div className="profile-card__meta">
          <span>{selectedInternal.promotion}</span>
          <span>{selectedInternal.currentRotation}</span>
        </div>
      </article>

      <SectionCard title="Derniers gestes">
        {latestGestures.length ? (
          <div className="intervention-row">
            {latestGestures.map((gesture) => (
              <article
                key={gesture.id}
                className="intervention-card intervention-card--compact"
              >
                <span className="intervention-card__date">
                  {formatIsoDate(gesture.date)}
                </span>
                <strong className="intervention-card__title">
                  {gesture.gesture}
                </strong>
                <span className="intervention-card__meta">
                  {[
                    gesture.instrumentalExtraction,
                    gesture.vacuumType,
                    gesture.forcepsType,
                    gesture.indication,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </article>
            ))}
          </div>
        ) : (
          <p className="field-helper">
            Aucun geste enregistré pour le moment
          </p>
        )}
      </SectionCard>

      <SectionCard title="Badges de progression">
        {badgePreview.length ? (
          <>
            <div className="badge-row">
              {badgePreview.map((badge) => (
                <ProgressBadgeCard
                  key={badge.id}
                  badge={badge}
                  compact
                  revealTitleOnHover
                />
              ))}
            </div>
            <div className="badge-section-action">
              <PrimaryButton
                label="Voir tous mes badges"
                onPress={goToBadges}
                variant="secondary"
              />
            </div>
          </>
        ) : (
          <p className="field-helper">Aucun badge obtenu pour le moment</p>
        )}
      </SectionCard>

      <div className="section-heading">
        <span className="section-heading__eyebrow">Avant la salle de naissance</span>
        <h2 className="section-heading__title">Fiches techniques</h2>
      </div>

      <section className="welcome-hero-card welcome-hero-card--action">
        <div className="welcome-hero-card__copy">
          <p>
            Retrouve ici les fiches dédiées aux prises en charge et aux gestes
            en salle de naissance lorsqu’elles seront disponibles.
          </p>
        </div>
        <PrimaryButton
          label="Consulter"
          onPress={() => goToPreBlock('obstetric')}
          variant="secondary"
        />
      </section>

      <div className="action-stack">
        <PrimaryButton
          label="Continuer vers le journal"
          onPress={goToObstetricJournal}
        />
        <PrimaryButton
          label="Retour au portail chirurgie"
          onPress={goToPortalSelection}
          variant="secondary"
        />
        <PrimaryButton
          label="Se déconnecter"
          onPress={logout}
          variant="danger"
        />
      </div>
    </ScreenContainer>
  );
}
