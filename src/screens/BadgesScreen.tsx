import { ProgressBadgeCard } from '../components/ProgressBadgeCard';
import { PrimaryButton } from '../components/PrimaryButton';
import { ScreenContainer } from '../components/ScreenContainer';
import { SectionCard } from '../components/SectionCard';
import { useAppContext } from '../context/AppContext';
import { getProgressBadgesForInternal } from '../data/mockData';
import { BadgeTier, ProgressBadge } from '../types';

function getTierRank(tier: BadgeTier) {
  if (tier === 'diamond') {
    return 4;
  }

  if (tier === 'gold') {
    return 3;
  }

  if (tier === 'silver') {
    return 2;
  }

  return 1;
}

function getProgressRatio(badge: ProgressBadge) {
  return badge.target > 0 ? badge.current / badge.target : 0;
}

export function BadgesScreen() {
  const { selectedInternal, savedInterventions, backToWelcome } = useAppContext();

  if (!selectedInternal) {
    return (
      <ScreenContainer
        eyebrow="Trophées"
        title="Aucun profil interne"
        subtitle="Reconnecte-toi pour consulter tes trophées."
      >
        <PrimaryButton label="Retour à l’accueil" onPress={backToWelcome} />
      </ScreenContainer>
    );
  }

  const badges = getProgressBadgesForInternal(selectedInternal, savedInterventions);
  const earnedBadges = badges
    .filter((badge) => badge.isEarned)
    .sort((left, right) => {
      const tierDelta = getTierRank(right.tier) - getTierRank(left.tier);

      if (tierDelta !== 0) {
        return tierDelta;
        }

        return (right.awardedAt ?? '').localeCompare(left.awardedAt ?? '');
      });
  const pendingBadges = badges
    .filter(
      (badge) =>
        !badge.isEarned &&
        !badge.isLocked &&
        !badge.isBinary &&
        badge.current > 0
    )
    .sort((left, right) => {
      const progressDelta = getProgressRatio(right) - getProgressRatio(left);

      if (progressDelta !== 0) {
        return progressDelta;
      }

      return getTierRank(right.tier) - getTierRank(left.tier);
    });

  return (
    <ScreenContainer
      eyebrow="Trophées"
      title="Tous mes trophées"
    >
      {earnedBadges.length ? (
        <SectionCard title="Trophées obtenus">
          <div className="badge-grid">
            {earnedBadges.map((badge) => (
              <ProgressBadgeCard key={badge.id} badge={badge} />
            ))}
          </div>
        </SectionCard>
      ) : null}

      {pendingBadges.length ? (
        <SectionCard title="À débloquer">
          <div className="badge-row">
            {pendingBadges.map((badge) => (
              <ProgressBadgeCard
                key={badge.id}
                badge={badge}
                compact
              />
            ))}
          </div>
        </SectionCard>
      ) : null}

      <div className="action-stack">
        <PrimaryButton
          label="Retour à l’accueil"
          onPress={backToWelcome}
          variant="secondary"
        />
      </div>
    </ScreenContainer>
  );
}
