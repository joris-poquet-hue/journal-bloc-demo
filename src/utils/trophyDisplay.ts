import {
  AdminInterventionEvaluation,
  AdminTrophyDefinition,
  BadgeTier,
  InternalProfile,
  SavedIntervention,
  SurgicalInterventionDefinition,
  TrophyAward,
} from '../types';
import {
  buildTrophyRuleSummary,
  getTrophyProgressSnapshotForProfile,
} from './adminTrophies';

export type TrophyDisplayStatus = 'earned' | 'progress' | 'secret';
export type TrophyDisplayAccent =
  | 'green'
  | 'bronze'
  | 'blue'
  | 'silver'
  | 'gold'
  | 'lavender';

export type TrophyEarnedTierVisual = {
  awardedAt: string;
  imageSrc: string | null;
  tier: BadgeTier | null;
};

export type TrophyDisplayModel = {
  accent: TrophyDisplayAccent;
  awardedAt: string | null;
  description: string;
  earnedTiers: TrophyEarnedTierVisual[];
  id: string;
  imageSrc: string | null;
  isSecret: boolean;
  isUnlocked: boolean;
  progressCurrent: number | null;
  progressTarget: number | null;
  section: TrophyDisplayStatus;
  statusLabel: string | null;
  subtitle: string;
  title: string;
};

function getTierLabel(tier: BadgeTier) {
  if (tier === 'gold') {
    return 'Or';
  }

  if (tier === 'silver') {
    return 'Argent';
  }

  if (tier === 'diamond') {
    return 'Diamant';
  }

  return 'Bronze';
}

function getAccentForTier(tier: BadgeTier | null): TrophyDisplayAccent {
  if (tier === 'gold') {
    return 'gold';
  }

  if (tier === 'silver') {
    return 'silver';
  }

  if (tier === 'diamond') {
    return 'blue';
  }

  if (tier === 'bronze') {
    return 'bronze';
  }

  return 'green';
}

function getImageForDefinition(
  definition: AdminTrophyDefinition,
  unlockedTier: BadgeTier | null,
  nextTier: BadgeTier | null
) {
  if (definition.format === 'levels') {
    const tierToShow = unlockedTier ?? nextTier ?? 'bronze';

    if (tierToShow === 'diamond') {
      return (
        definition.images.diamond ??
        definition.images.gold ??
        definition.images.silver ??
        definition.images.bronze ??
        definition.images.single
      );
    }

    if (tierToShow === 'gold') {
      return (
        definition.images.gold ??
        definition.images.silver ??
        definition.images.bronze ??
        definition.images.diamond ??
        definition.images.single
      );
    }

    if (tierToShow === 'silver') {
      return (
        definition.images.silver ??
        definition.images.bronze ??
        definition.images.gold ??
        definition.images.diamond ??
        definition.images.single
      );
    }

    return (
      definition.images.bronze ??
      definition.images.silver ??
      definition.images.gold ??
      definition.images.diamond ??
      definition.images.single
    );
  }

  return definition.images.single;
}

function toTimestamp(value: string | null) {
  if (!value) {
    return 0;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

const TROPHY_TIER_RANK: Record<BadgeTier, number> = {
  bronze: 0,
  silver: 1,
  gold: 2,
  diamond: 3,
};

export function buildTrophyDisplayModels({
  adminEvaluations,
  adminTrophies,
  customSurgicalInterventions,
  profile,
  savedInterventions,
  trophyAwards,
}: {
  adminEvaluations: Record<string, AdminInterventionEvaluation>;
  adminTrophies: AdminTrophyDefinition[];
  customSurgicalInterventions: SurgicalInterventionDefinition[];
  profile: InternalProfile;
  savedInterventions: SavedIntervention[];
  trophyAwards: TrophyAward[];
}) {
  const activeTrophies = adminTrophies.filter((trophy) => trophy.status === 'active');
  const profileAwards = trophyAwards.filter(
    (award) => award.profileId === profile.id
  );
  const displayGroups = activeTrophies
    .map<{
      earned: TrophyDisplayModel | null;
      progress: TrophyDisplayModel | null;
    } | null>((trophy) => {
      const snapshot = getTrophyProgressSnapshotForProfile(
        trophy,
        profile,
        savedInterventions,
        adminEvaluations,
        customSurgicalInterventions
      );
      const definitionAwards = profileAwards.filter(
        (award) => award.trophyId === trophy.id
      );
      const highestAward = [...definitionAwards].sort(
        (left, right) =>
          TROPHY_TIER_RANK[right.tier ?? 'bronze'] -
            TROPHY_TIER_RANK[left.tier ?? 'bronze'] ||
          toTimestamp(right.awardedAt) - toTimestamp(left.awardedAt)
      )[0];
      const sortedDefinitionAwards = [...definitionAwards].sort(
        (left, right) =>
          TROPHY_TIER_RANK[right.tier ?? 'bronze'] -
            TROPHY_TIER_RANK[left.tier ?? 'bronze'] ||
          toTimestamp(right.awardedAt) - toTimestamp(left.awardedAt)
      );
      const earnedTierKeys = new Set<string>();
      const earnedTiers = sortedDefinitionAwards
        .filter((award) => {
          const tierKey =
            trophy.format === 'levels' ? award.tier ?? 'bronze' : 'single';

          if (earnedTierKeys.has(tierKey)) {
            return false;
          }

          earnedTierKeys.add(tierKey);
          return true;
        })
        .map((award) => ({
          awardedAt: award.awardedAt,
          imageSrc: getImageForDefinition(
            trophy,
            trophy.format === 'levels' ? award.tier ?? 'bronze' : null,
            null
          ),
          tier: trophy.format === 'levels' ? award.tier ?? 'bronze' : null,
        }));
      const unlockedTier = highestAward?.tier ?? null;
      const isEarned = Boolean(highestAward);
      const hasStartedProgress =
        snapshot.hasStarted;

      if (trophy.visibility === 'surprise' && !isEarned) {
        return null;
      }

      if (!isEarned && !hasStartedProgress) {
        return null;
      }

      return {
        earned: isEarned
          ? {
              accent:
                trophy.format === 'levels'
                  ? getAccentForTier(unlockedTier)
                  : 'green',
              awardedAt: highestAward?.awardedAt ?? null,
              description: trophy.description,
              earnedTiers,
              id: `${trophy.id}:earned`,
              imageSrc: getImageForDefinition(
                trophy,
                unlockedTier,
                snapshot.nextTier
              ),
              isSecret: false,
              isUnlocked: true,
              progressCurrent: null,
              progressTarget: null,
              section: 'earned',
              statusLabel: null,
              subtitle:
                trophy.format === 'levels' && unlockedTier
                  ? `Niveau ${getTierLabel(unlockedTier)}`
                  : trophy.description || 'Trophée débloqué',
              title: trophy.title || 'Trophée sans titre',
            }
          : null,
        progress:
          hasStartedProgress &&
          (!isEarned ||
            (trophy.format === 'levels' && snapshot.nextTier != null))
            ? {
                accent:
                  trophy.format === 'levels'
                    ? getAccentForTier(snapshot.nextTier)
                    : 'blue',
                awardedAt: null,
                description: trophy.description,
                earnedTiers: [],
                id: `${trophy.id}:progress:${snapshot.nextTier ?? 'current'}`,
                imageSrc: null,
                isSecret: false,
                isUnlocked: false,
                progressCurrent: snapshot.progressCurrent,
                progressTarget: snapshot.progressTarget,
                section: 'progress',
                statusLabel: null,
                subtitle:
                  trophy.format === 'levels' && snapshot.nextTier
                    ? `Prochain palier : ${getTierLabel(snapshot.nextTier)}`
                    : trophy.description || buildTrophyRuleSummary(trophy),
                title: trophy.title || 'Trophée sans titre',
              }
            : null,
      };
    })
    .filter((group): group is NonNullable<typeof group> => group !== null);
  const displayModels = displayGroups
    .flatMap((group) => [group.earned, group.progress])
    .filter((item): item is TrophyDisplayModel => item !== null)
    .sort((left, right) => toTimestamp(right.awardedAt) - toTimestamp(left.awardedAt));

  const earned = displayModels.filter((item) => item.section === 'earned');
  const progress = displayModels.filter((item) => item.section === 'progress');
  const secret = displayModels.filter((item) => item.section === 'secret');
  const activeTrophyIds = new Set(activeTrophies.map((trophy) => trophy.id));
  const earnedLevelKeys = new Set(
    profileAwards
      .filter((award) => activeTrophyIds.has(award.trophyId))
      .map((award) => `${award.trophyId}:${award.tier ?? 'bronze'}`)
  );

  return {
    counts: {
      earned: earnedLevelKeys.size,
      progress: progress.length,
    },
    earned,
    progress,
    secret,
  };
}
