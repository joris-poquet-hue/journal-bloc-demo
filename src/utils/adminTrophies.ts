import {
  AdminInterventionEvaluation,
  AdminTrophyDefinition,
  BadgeTier,
  GlobalRole,
  InternalProfile,
  InterventionType,
  SavedIntervention,
  SurgicalApproach,
  TrophyCondition,
  TrophyConditionType,
  TrophyImageSet,
  TrophyLevelDefinition,
  TrophyTrackedStatus,
  TrophyType,
} from '../types';

export type TrophyProgressSnapshot = {
  awardedAt: string | null;
  nextThreshold: number | null;
  nextTier: BadgeTier | null;
  progressCurrent: number | null;
  progressTarget: number | null;
  unlockedTier: BadgeTier | null;
};

const TROPHY_TIERS: Array<{ tier: BadgeTier; label: string }> = [
  { tier: 'bronze', label: 'Bronze' },
  { tier: 'silver', label: 'Argent' },
  { tier: 'gold', label: 'Or' },
  { tier: 'diamond', label: 'Diamant' },
];

export function createEmptyTrophyImageSet(): TrophyImageSet {
  return {
    single: null,
    bronze: null,
    silver: null,
    gold: null,
    diamond: null,
  };
}

export function createDefaultTrophyLevels(): TrophyLevelDefinition[] {
  return TROPHY_TIERS.map(({ tier, label }, index) => ({
    tier,
    label,
    trackedStatus: 'evaluated',
    threshold: index === 0 ? 10 : index === 1 ? 20 : 30,
    autonomyMin: tier === 'diamond' ? 75 : null,
    imageSrc: null,
  }));
}

export function createEmptyTrophyCondition(
  type: TrophyConditionType = 'total_recorded'
): TrophyCondition {
  return {
    id: `trophy-condition-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    procedure: '',
    approach: '',
    role: '',
    trackedStatus: type === 'total_evaluated' ? 'evaluated' : 'recorded',
    threshold: type === 'first_recorded' ? 1 : 10,
    autonomyMin: 75,
    distinctProcedureCount: 5,
    minEvaluatedPerProcedure: 3,
    startHour: '00:00',
    endHour: '06:00',
    interventionStatus: '',
  };
}

export function createEmptyTrophyDefinition(type: TrophyType): AdminTrophyDefinition {
  const now = new Date().toISOString();
  const isOperative = type === 'operatoire';

  return {
    id: `admin-trophy-${Date.now()}`,
    title: '',
    description: '',
    type,
    format: isOperative ? 'levels' : 'unique',
    status: 'draft',
    visibility: isOperative ? 'visible' : 'surprise',
    operativeScope: 'procedure',
    associatedProcedure: '',
    associatedApproach: '',
    associatedIndication: '',
    trackedRole: 'operateur_principal',
    trackedInterventionStatus: 'evaluated',
    conditions: isOperative ? [] : [createEmptyTrophyCondition('total_recorded')],
    levels: isOperative ? createDefaultTrophyLevels() : [],
    images: createEmptyTrophyImageSet(),
    createdAt: now,
    updatedAt: now,
  };
}

export function cloneTrophyDefinition(
  definition: AdminTrophyDefinition
): AdminTrophyDefinition {
  const now = new Date().toISOString();

  return {
    ...definition,
    id: `admin-trophy-${Date.now()}`,
    title: definition.title ? `${definition.title} (copie)` : '',
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    conditions: definition.conditions.map((condition) => ({
      ...condition,
      id: `trophy-condition-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
    })),
    levels: definition.levels.map((level) => ({ ...level })),
    images: { ...definition.images },
  };
}

export function ensureTrophyDefinitionShape(
  definition: AdminTrophyDefinition
): AdminTrophyDefinition {
  const isOperative = definition.type === 'operatoire';

  return {
    ...definition,
    title: definition.title ?? '',
    description: definition.description ?? '',
    operativeScope: definition.operativeScope ?? 'procedure',
    associatedProcedure: definition.associatedProcedure ?? '',
    associatedApproach: definition.associatedApproach ?? '',
    associatedIndication: definition.associatedIndication ?? '',
    trackedRole: definition.trackedRole ?? 'operateur_principal',
    trackedInterventionStatus: definition.trackedInterventionStatus ?? 'evaluated',
    visibility:
      definition.visibility ??
      (isOperative ? 'visible' : 'surprise'),
    format: definition.format ?? (isOperative ? 'levels' : 'unique'),
    conditions: (definition.conditions ?? []).map((condition) => ({
      ...createEmptyTrophyCondition(condition.type),
      ...condition,
    })),
    levels:
      definition.format === 'levels'
        ? (definition.levels?.length
            ? definition.levels
            : createDefaultTrophyLevels()
          ).map((level, index) => ({
            ...createDefaultTrophyLevels()[index],
            ...level,
          }))
        : [],
    images: {
      ...createEmptyTrophyImageSet(),
      ...definition.images,
    },
  };
}

function matchesTrackedStatus(
  intervention: SavedIntervention,
  adminEvaluations: Record<string, AdminInterventionEvaluation>,
  trackedStatus: TrophyTrackedStatus
) {
  if (trackedStatus === 'recorded') {
    return true;
  }

  return Boolean(
    adminEvaluations[intervention.id]?.globalPerformance &&
      adminEvaluations[intervention.id]?.categoryDifficulty
  );
}

function matchesRole(intervention: SavedIntervention, role: GlobalRole | '') {
  return !role || intervention.role === role;
}

function matchesBaseFilters(
  intervention: SavedIntervention,
  definition: AdminTrophyDefinition,
  adminEvaluations: Record<string, AdminInterventionEvaluation>
) {
  if (
    definition.operativeScope === 'procedure' &&
    definition.associatedProcedure &&
    intervention.procedure !== definition.associatedProcedure
  ) {
    return false;
  }

  if (
    definition.associatedApproach &&
    intervention.approach !== definition.associatedApproach
  ) {
    return false;
  }

  if (
    definition.associatedIndication &&
    intervention.indication !== definition.associatedIndication
  ) {
    return false;
  }

  if (!matchesRole(intervention, definition.trackedRole)) {
    return false;
  }

  return matchesTrackedStatus(
    intervention,
    adminEvaluations,
    definition.trackedInterventionStatus
  );
}

function getRelevantInterventionsForProfile(
  definition: AdminTrophyDefinition,
  profile: InternalProfile,
  interventions: SavedIntervention[],
  adminEvaluations: Record<string, AdminInterventionEvaluation>
) {
  return interventions.filter(
    (intervention) =>
      intervention.internalId === profile.id &&
      matchesBaseFilters(intervention, definition, adminEvaluations)
  );
}

function getCountProgressForCondition(
  condition: TrophyCondition,
  definition: AdminTrophyDefinition,
  profile: InternalProfile,
  interventions: SavedIntervention[],
  adminEvaluations: Record<string, AdminInterventionEvaluation>
) {
  const profileInterventions = interventions.filter(
    (intervention) => intervention.internalId === profile.id
  );
  const filteredByRole = condition.role
    ? profileInterventions.filter((intervention) => intervention.role === condition.role)
    : profileInterventions;
  const filteredByStatus =
    condition.trackedStatus != null
      ? filteredByRole.filter((intervention) =>
          matchesTrackedStatus(intervention, adminEvaluations, condition.trackedStatus!)
        )
      : filteredByRole;
  const threshold = condition.threshold ?? 0;

  switch (condition.type) {
    case 'first_recorded':
      return {
        awardedAt: profileInterventions[0]?.savedAt ?? null,
        progressCurrent: Math.min(profileInterventions.length, 1),
        progressTarget: 1,
      };
    case 'total_recorded':
      return {
        awardedAt: profileInterventions[threshold - 1]?.savedAt ?? null,
        progressCurrent: profileInterventions.length,
        progressTarget: threshold,
      };
    case 'total_evaluated': {
      const evaluatedInterventions = profileInterventions.filter((intervention) =>
        matchesTrackedStatus(intervention, adminEvaluations, 'evaluated')
      );

      return {
        awardedAt: evaluatedInterventions[threshold - 1]?.savedAt ?? null,
        progressCurrent: evaluatedInterventions.length,
        progressTarget: threshold,
      };
    }
    case 'procedure_count': {
      const matchingInterventions = filteredByStatus.filter(
        (intervention) =>
          intervention.procedure === (condition.procedure || definition.associatedProcedure)
      );

      return {
        awardedAt: matchingInterventions[threshold - 1]?.savedAt ?? null,
        progressCurrent: matchingInterventions.length,
        progressTarget: threshold,
      };
    }
    case 'approach_count': {
      const matchingInterventions = filteredByStatus.filter(
        (intervention) =>
          intervention.approach === (condition.approach || definition.associatedApproach)
      );

      return {
        awardedAt: matchingInterventions[threshold - 1]?.savedAt ?? null,
        progressCurrent: matchingInterventions.length,
        progressTarget: threshold,
      };
    }
    case 'recording_time_range': {
      const matchingInterventions = filteredByRole.filter((intervention) =>
        isWithinTimeRange(
          intervention.savedAt,
          getHourLabel(condition.startHour),
          getHourLabel(condition.endHour)
        )
      );

      return {
        awardedAt: matchingInterventions[threshold - 1]?.savedAt ?? null,
        progressCurrent: matchingInterventions.length,
        progressTarget: threshold,
      };
    }
    case 'distinct_procedures': {
      const sortedInterventions = filteredByStatus.filter((intervention) =>
        matchesRole(intervention, condition.role ?? '')
      );
      const seenProcedures = new Set<InterventionType>();
      let awardedAt: string | null = null;

      sortedInterventions.forEach((intervention) => {
        if (awardedAt) {
          return;
        }

        seenProcedures.add(intervention.procedure);

        if (seenProcedures.size >= (condition.distinctProcedureCount ?? threshold)) {
          awardedAt = intervention.savedAt;
        }
      });

      return {
        awardedAt,
        progressCurrent: seenProcedures.size,
        progressTarget: condition.distinctProcedureCount ?? threshold,
      };
    }
    default:
      return {
        awardedAt: null,
        progressCurrent: null,
        progressTarget: null,
      };
  }
}

function getAverageAutonomy(interventions: SavedIntervention[]) {
  const scores = interventions
    .map((intervention) => intervention.autonomyScore)
    .filter((score): score is number => score != null);

  if (scores.length === 0) {
    return null;
  }

  return scores.reduce((total, score) => total + score, 0) / scores.length;
}

function getHourLabel(value: string | undefined) {
  return value && value.length === 5 ? value : '00:00';
}

function getMinuteOfDay(value: string) {
  const [hours, minutes] = value.split(':').map(Number);

  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function isWithinTimeRange(savedAt: string, startHour: string, endHour: string) {
  const date = new Date(savedAt);
  const currentMinute = date.getHours() * 60 + date.getMinutes();
  const startMinute = getMinuteOfDay(startHour);
  const endMinute = getMinuteOfDay(endHour);

  if (startMinute <= endMinute) {
    return currentMinute >= startMinute && currentMinute <= endMinute;
  }

  return currentMinute >= startMinute || currentMinute <= endMinute;
}

export function doesConditionMatchProfile(
  condition: TrophyCondition,
  definition: AdminTrophyDefinition,
  profile: InternalProfile,
  interventions: SavedIntervention[],
  adminEvaluations: Record<string, AdminInterventionEvaluation>
) {
  const profileInterventions = interventions.filter(
    (intervention) => intervention.internalId === profile.id
  );
  const filteredByRole = condition.role
    ? profileInterventions.filter((intervention) => intervention.role === condition.role)
    : profileInterventions;
  const filteredByStatus =
    condition.trackedStatus != null
      ? filteredByRole.filter((intervention) =>
          matchesTrackedStatus(intervention, adminEvaluations, condition.trackedStatus!)
        )
      : filteredByRole;
  const threshold = condition.threshold ?? 0;

  switch (condition.type) {
    case 'first_recorded':
      return profileInterventions.length >= 1;
    case 'total_recorded':
      return profileInterventions.length >= threshold;
    case 'total_evaluated':
      return profileInterventions.filter((intervention) =>
        matchesTrackedStatus(intervention, adminEvaluations, 'evaluated')
      ).length >= threshold;
    case 'procedure_count':
      return filteredByStatus.filter(
        (intervention) =>
          intervention.procedure === (condition.procedure || definition.associatedProcedure)
      ).length >= threshold;
    case 'approach_count':
      return filteredByStatus.filter(
        (intervention) =>
          intervention.approach === (condition.approach || definition.associatedApproach)
      ).length >= threshold;
    case 'recording_time_range':
      return filteredByRole.filter((intervention) =>
        isWithinTimeRange(
          intervention.savedAt,
          getHourLabel(condition.startHour),
          getHourLabel(condition.endHour)
        )
      ).length >= threshold;
    case 'average_autonomy': {
      const average = getAverageAutonomy(
        filteredByStatus.filter((intervention) =>
          matchesTrackedStatus(intervention, adminEvaluations, 'evaluated')
        )
      );

      return average != null && average >= (condition.autonomyMin ?? 0);
    }
    case 'cross_procedure_autonomy': {
      const qualifyingInterventions = filteredByStatus.filter((intervention) =>
        matchesTrackedStatus(intervention, adminEvaluations, 'evaluated')
      );
      const perProcedure = new Map<
        InterventionType,
        { count: number; scores: number[] }
      >();

      qualifyingInterventions.forEach((intervention) => {
        const current = perProcedure.get(intervention.procedure) ?? {
          count: 0,
          scores: [],
        };

        current.count += 1;

        if (intervention.autonomyScore != null) {
          current.scores.push(intervention.autonomyScore);
        }

        perProcedure.set(intervention.procedure, current);
      });

      const matchingProcedures = Array.from(perProcedure.values()).filter((entry) => {
        if (entry.count < (condition.minEvaluatedPerProcedure ?? 0)) {
          return false;
        }

        if (entry.scores.length === 0) {
          return false;
        }

        const average =
          entry.scores.reduce((total, score) => total + score, 0) / entry.scores.length;

        return average >= (condition.autonomyMin ?? 0);
      });

      return matchingProcedures.length >= (condition.distinctProcedureCount ?? 0);
    }
    case 'distinct_procedures': {
      const distinctCount = new Set(
        filteredByStatus
          .filter((intervention) => matchesRole(intervention, condition.role ?? ''))
          .map((intervention) => intervention.procedure)
      ).size;

      return distinctCount >= (condition.distinctProcedureCount ?? threshold);
    }
    case 'role':
      return profileInterventions.some((intervention) =>
        matchesRole(intervention, condition.role ?? '')
      );
    case 'intervention_status':
      if (condition.interventionStatus === 'pending') {
        return profileInterventions.some(
          (intervention) =>
            !matchesTrackedStatus(intervention, adminEvaluations, 'evaluated')
        );
      }

      if (condition.interventionStatus === 'evaluated') {
        return profileInterventions.some((intervention) =>
          matchesTrackedStatus(intervention, adminEvaluations, 'evaluated')
        );
      }

      return false;
    default:
      return false;
  }
}

export function getUnlockedTrophyTierForProfile(
  definition: AdminTrophyDefinition,
  profile: InternalProfile,
  interventions: SavedIntervention[],
  adminEvaluations: Record<string, AdminInterventionEvaluation>
) {
  if (definition.status !== 'active') {
    return null;
  }

  if (definition.format === 'levels') {
    const relevantInterventions = getRelevantInterventionsForProfile(
      definition,
      profile,
      interventions,
      adminEvaluations
    );
    let highestTier: BadgeTier | null = null;

    definition.levels.forEach((level) => {
      const threshold = level.threshold ?? 0;
      const matchingInterventions = relevantInterventions.filter((intervention) =>
        matchesTrackedStatus(
          intervention,
          adminEvaluations,
          definition.trackedInterventionStatus
        )
      );
      const averageAutonomy = getAverageAutonomy(matchingInterventions);

      if (
        matchingInterventions.length >= threshold &&
        (level.autonomyMin == null ||
          (averageAutonomy != null && averageAutonomy >= level.autonomyMin))
      ) {
        highestTier = level.tier;
      }
    });

    return highestTier;
  }

  const allConditionsMatch = definition.conditions.every((condition) =>
    doesConditionMatchProfile(
      condition,
      definition,
      profile,
      interventions,
      adminEvaluations
    )
  );

  return allConditionsMatch ? 'bronze' : null;
}

export function getTrophyProgressSnapshotForProfile(
  definition: AdminTrophyDefinition,
  profile: InternalProfile,
  interventions: SavedIntervention[],
  adminEvaluations: Record<string, AdminInterventionEvaluation>
): TrophyProgressSnapshot {
  if (definition.status !== 'active') {
    return {
      awardedAt: null,
      nextThreshold: null,
      nextTier: null,
      progressCurrent: null,
      progressTarget: null,
      unlockedTier: null,
    };
  }

  if (definition.format === 'levels') {
    const relevantInterventions = getRelevantInterventionsForProfile(
      definition,
      profile,
      interventions,
      adminEvaluations
    ).sort((left, right) => left.savedAt.localeCompare(right.savedAt));
    const currentCount = relevantInterventions.length;
    const averageAutonomy = getAverageAutonomy(relevantInterventions);
    let unlockedTier: BadgeTier | null = null;
    let awardedAt: string | null = null;
    let nextTier: BadgeTier | null = null;
    let nextThreshold: number | null = null;
    const lastRelevantIntervention =
      relevantInterventions.length > 0
        ? relevantInterventions[relevantInterventions.length - 1]
        : null;

    definition.levels.forEach((level) => {
      const threshold = level.threshold ?? 0;
      const autonomySatisfied =
        level.autonomyMin == null ||
        (averageAutonomy != null && averageAutonomy >= level.autonomyMin);
      const levelUnlocked = currentCount >= threshold && autonomySatisfied;

      if (levelUnlocked) {
        unlockedTier = level.tier;
        awardedAt =
          relevantInterventions[Math.max(0, threshold - 1)]?.savedAt ??
          lastRelevantIntervention?.savedAt ??
          awardedAt;
      } else if (!nextTier) {
        nextTier = level.tier;
        nextThreshold = threshold;
      }
    });

    return {
      awardedAt,
      nextThreshold,
      nextTier,
      progressCurrent: nextThreshold != null ? currentCount : currentCount || null,
      progressTarget: nextThreshold,
      unlockedTier,
    };
  }

  const unlockedTier = getUnlockedTrophyTierForProfile(
    definition,
    profile,
    interventions,
    adminEvaluations
  );
  const progressCondition = definition.conditions.find((condition) =>
    [
      'first_recorded',
      'total_recorded',
      'total_evaluated',
      'procedure_count',
      'approach_count',
      'recording_time_range',
      'distinct_procedures',
    ].includes(condition.type)
  );

  if (!progressCondition) {
    const relevantInterventions = getRelevantInterventionsForProfile(
      definition,
      profile,
      interventions,
      adminEvaluations
    ).sort((left, right) => left.savedAt.localeCompare(right.savedAt));

    return {
      awardedAt: unlockedTier
        ? relevantInterventions[relevantInterventions.length - 1]?.savedAt ?? null
        : null,
      nextThreshold: null,
      nextTier: null,
      progressCurrent: null,
      progressTarget: null,
      unlockedTier,
    };
  }

  const progress = getCountProgressForCondition(
    progressCondition,
    definition,
    profile,
    interventions,
    adminEvaluations
  );

  return {
    awardedAt: unlockedTier ? progress.awardedAt : null,
    nextThreshold: unlockedTier ? null : progress.progressTarget,
    nextTier: unlockedTier ? null : 'bronze',
    progressCurrent: progress.progressCurrent,
    progressTarget: progress.progressTarget,
    unlockedTier,
  };
}

export function countProfilesWithTrophy(
  definition: AdminTrophyDefinition,
  profiles: InternalProfile[],
  interventions: SavedIntervention[],
  adminEvaluations: Record<string, AdminInterventionEvaluation>
) {
  return profiles.filter(
    (profile) =>
      getUnlockedTrophyTierForProfile(
        definition,
        profile,
        interventions,
        adminEvaluations
      ) != null
  ).length;
}

export function buildTrophyRuleSummary(definition: AdminTrophyDefinition) {
  if (definition.format === 'levels' && definition.levels.length > 0) {
    const levelSummary = definition.levels
      .filter((level) => level.threshold != null)
      .map((level) => {
        const thresholdLabel = `${level.label} : au moins ${level.threshold} intervention(s) ${
          definition.trackedInterventionStatus === 'evaluated'
            ? 'évaluée(s)'
            : 'enregistrée(s)'
        }`;
        const autonomyLabel =
          level.autonomyMin != null
            ? ` et autonomie moyenne ≥ ${level.autonomyMin} %`
            : '';

        return `${thresholdLabel}${autonomyLabel}`;
      })
      .join(' · ');

    return levelSummary || 'Configurez les niveaux du trophée.';
  }

  if (definition.conditions.length === 0) {
    return 'Ajoutez au moins une condition d’obtention.';
  }

  return `Ce trophée sera attribué si ${definition.conditions
    .map((condition) => buildConditionSummary(condition, definition))
    .join(' ET ')}.`;
}

export function buildConditionSummary(
  condition: TrophyCondition,
  definition: AdminTrophyDefinition
) {
  const threshold = condition.threshold ?? 0;
  const trackedStatusLabel =
    condition.trackedStatus === 'evaluated' ? 'évaluées' : 'enregistrées';
  const procedureLabel = condition.procedure || definition.associatedProcedure || 'cette intervention';
  const approachLabel = condition.approach || definition.associatedApproach || 'cette voie d’abord';

  switch (condition.type) {
    case 'first_recorded':
      return 'l’interne a enregistré au moins une intervention';
    case 'total_recorded':
      return `l’interne a enregistré au moins ${threshold} intervention(s)`;
    case 'total_evaluated':
      return `l’interne a au moins ${threshold} intervention(s) évaluée(s)`;
    case 'procedure_count':
      return `l’interne a au moins ${threshold} intervention(s) ${trackedStatusLabel} pour ${procedureLabel}`;
    case 'approach_count':
      return `l’interne a au moins ${threshold} intervention(s) ${trackedStatusLabel} par ${approachLabel}`;
    case 'recording_time_range':
      return `l’interne a enregistré au moins ${threshold} intervention(s) entre ${getHourLabel(
        condition.startHour
      )} et ${getHourLabel(condition.endHour)}`;
    case 'average_autonomy':
      return `l’interne obtient une autonomie moyenne ≥ ${condition.autonomyMin ?? 0} %`;
    case 'cross_procedure_autonomy':
      return `l’interne obtient une autonomie moyenne ≥ ${condition.autonomyMin ?? 0} % sur au moins ${
        condition.distinctProcedureCount ?? 0
      } types d’interventions différents, avec au moins ${
        condition.minEvaluatedPerProcedure ?? 0
      } intervention(s) évaluée(s) par type`;
    case 'distinct_procedures':
      return `l’interne a réalisé au moins ${
        condition.distinctProcedureCount ?? threshold
      } types d’interventions différents`;
    case 'role':
      return `le rôle pris en compte est ${condition.role || 'non défini'}`;
    case 'intervention_status':
      return `le statut pris en compte est ${
        condition.interventionStatus === 'pending' ? 'en attente' : 'évaluée'
      }`;
    default:
      return 'la condition configurée est remplie';
  }
}

export function getTrophyPreviewImage(definition: AdminTrophyDefinition) {
  if (definition.format === 'levels') {
    return (
      definition.images.bronze ||
      definition.images.silver ||
      definition.images.gold ||
      definition.images.diamond ||
      definition.images.single
    );
  }

  return definition.images.single;
}

export function validateTrophyDefinition(definition: AdminTrophyDefinition) {
  const errors: string[] = [];

  if (!definition.title.trim()) {
    errors.push('Le nom du trophée est obligatoire.');
  }

  if (definition.type === 'operatoire') {
    if (
      definition.operativeScope === 'procedure' &&
      !definition.associatedProcedure
    ) {
      errors.push('Sélectionnez une intervention associée pour ce trophée opératoire.');
    }

    if (
      definition.operativeScope === 'approach' &&
      !definition.associatedApproach
    ) {
      errors.push('Sélectionnez une voie d’abord suivie pour ce trophée opératoire.');
    }
  }

  if (definition.format === 'levels') {
    if (definition.levels.length !== 4) {
      errors.push('Les quatre niveaux Bronze, Argent, Or et Diamant sont requis.');
    }

    definition.levels.forEach((level) => {
      if (level.threshold == null || level.threshold <= 0) {
        errors.push(`Le seuil du niveau ${level.label} doit être supérieur à 0.`);
      }
    });
  } else if (definition.conditions.length === 0) {
    errors.push('Ajoutez au moins une condition d’obtention.');
  }

  return errors;
}
