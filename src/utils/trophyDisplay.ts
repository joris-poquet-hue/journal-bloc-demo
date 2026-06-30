import { hydrateAdminInterventionEvaluations } from '../data/mockData';
import {
  AdminInterventionEvaluation,
  AdminTrophyDefinition,
  BadgeTier,
  InternalProfile,
  SavedIntervention,
} from '../types';
import {
  buildTrophyRuleSummary,
  ensureTrophyDefinitionShape,
  getTrophyProgressSnapshotForProfile,
} from './adminTrophies';

const ADMIN_EVALUATIONS_STORAGE_KEY = 'journal-bord:admin-intervention-evaluations:v1';
const ADMIN_TROPHIES_STORAGE_KEY = 'journal-bord:admin-trophies:v1';

export type TrophyDisplayStatus = 'earned' | 'progress' | 'secret';
export type TrophyDisplayAccent =
  | 'green'
  | 'bronze'
  | 'blue'
  | 'silver'
  | 'gold'
  | 'lavender';

export type TrophyDisplayModel = {
  accent: TrophyDisplayAccent;
  awardedAt: string | null;
  description: string;
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

export function loadStoredAdminEvaluations() {
  if (typeof window === 'undefined') {
    return hydrateAdminInterventionEvaluations();
  }

  try {
    const rawValue = window.localStorage.getItem(ADMIN_EVALUATIONS_STORAGE_KEY);

    if (!rawValue) {
      return hydrateAdminInterventionEvaluations();
    }

    const parsedValue = JSON.parse(rawValue);

    return parsedValue && typeof parsedValue === 'object'
      ? hydrateAdminInterventionEvaluations(
          parsedValue as Record<string, AdminInterventionEvaluation>
        )
      : hydrateAdminInterventionEvaluations();
  } catch {
    return hydrateAdminInterventionEvaluations();
  }
}

export function loadStoredAdminTrophies() {
  if (typeof window === 'undefined') {
    return [] as AdminTrophyDefinition[];
  }

  try {
    const rawValue = window.localStorage.getItem(ADMIN_TROPHIES_STORAGE_KEY);

    if (!rawValue) {
      return [] as AdminTrophyDefinition[];
    }

    const parsedValue = JSON.parse(rawValue);

    return Array.isArray(parsedValue)
      ? parsedValue.map((item) => ensureTrophyDefinitionShape(item))
      : ([] as AdminTrophyDefinition[]);
  } catch {
    return [] as AdminTrophyDefinition[];
  }
}

export function buildTrophyDisplayModels({
  adminEvaluations,
  adminTrophies,
  profile,
  savedInterventions,
}: {
  adminEvaluations: Record<string, AdminInterventionEvaluation>;
  adminTrophies: AdminTrophyDefinition[];
  profile: InternalProfile;
  savedInterventions: SavedIntervention[];
}) {
  const activeTrophies = adminTrophies.filter((trophy) => trophy.status === 'active');
  const displayModels = activeTrophies
    .map((trophy) => {
      const snapshot = getTrophyProgressSnapshotForProfile(
        trophy,
        profile,
        savedInterventions,
        adminEvaluations
      );
      const unlockedTier = snapshot.unlockedTier;
      const isEarned = unlockedTier != null;
      const isSecret = trophy.visibility === 'surprise' && !isEarned;
      const section: TrophyDisplayStatus = isEarned
        ? 'earned'
        : isSecret
          ? 'secret'
          : 'progress';
      const accent =
        section === 'secret'
          ? 'lavender'
          : trophy.format === 'levels'
            ? getAccentForTier(unlockedTier ?? snapshot.nextTier)
            : isEarned
              ? 'green'
              : 'blue';
      const subtitle =
        section === 'secret'
          ? 'Continue à progresser pour découvrir ce trophée.'
          : isEarned
            ? trophy.format === 'levels' && unlockedTier
              ? `Niveau ${getTierLabel(unlockedTier)}`
              : trophy.description || 'Trophée débloqué'
            : trophy.format === 'levels' && snapshot.nextTier
              ? `Prochain palier : ${getTierLabel(snapshot.nextTier)}`
              : trophy.description || buildTrophyRuleSummary(trophy);

      return {
        accent,
        awardedAt: snapshot.awardedAt,
        description: trophy.description,
        id: trophy.id,
        imageSrc: isEarned
          ? getImageForDefinition(trophy, unlockedTier, snapshot.nextTier)
          : null,
        isSecret,
        isUnlocked: isEarned,
        progressCurrent: section === 'progress' ? snapshot.progressCurrent : null,
        progressTarget: section === 'progress' ? snapshot.progressTarget : null,
        section,
        statusLabel: isEarned ? 'Débloqué' : null,
        subtitle,
        title:
          isSecret && !isEarned
            ? 'Trophée secret'
            : trophy.title || 'Trophée sans titre',
      } satisfies TrophyDisplayModel;
    })
    .sort((left, right) => toTimestamp(right.awardedAt) - toTimestamp(left.awardedAt));

  const earned = displayModels.filter((item) => item.section === 'earned');
  const progress = displayModels.filter((item) => item.section === 'progress');
  const secret = displayModels.filter((item) => item.section === 'secret');

  return {
    counts: {
      earned: earned.length,
      progress: progress.length,
    },
    earned,
    progress,
    secret,
  };
}
