import { useAppContext } from '../context/AppContext';
import { formatDisplayName, getProgressBadgesForInternal } from '../data/mockData';
import { ProgressBadgeCard } from '../components/ProgressBadgeCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { SectionCard } from '../components/SectionCard';

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

export function WelcomeScreen() {
  const {
    selectedInternal,
    savedInterventions,
    goToBadges,
    goToForm,
    goToPreBlock,
    logout,
  } =
    useAppContext();

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

  return (
    <ScreenContainer
      eyebrow="Accueil"
      title="Journal de bord du bloc"
      subtitle="Journal de bord des internes en gynécologie-obstétrique du CHU de Nantes"
    >
      <section className="welcome-hero-card">
        <div className="welcome-hero-card__copy">
          <p>
            Ce journal de bord permet de tracer les interventions réalisées au
            bloc, d’objectiver la progression opératoire de l’interne et de
            structurer le suivi de sa formation.
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
        <span className="section-heading__eyebrow">Avant le bloc</span>
        <h2 className="section-heading__title">Fiches techniques</h2>
      </div>

      <section className="welcome-hero-card welcome-hero-card--action">
        <div className="welcome-hero-card__copy">
          <p>
            Consulte des fiches de rappels.
          </p>
        </div>
        <PrimaryButton
          label="Consulter"
          onPress={goToPreBlock}
          variant="secondary"
        />
      </section>

      <div className="action-stack">
        <PrimaryButton
          label="Continuer vers le journal"
          onPress={goToForm}
        />
        <PrimaryButton
          label="Se déconnecter"
          onPress={logout}
          variant="secondary"
        />
      </div>
    </ScreenContainer>
  );
}
