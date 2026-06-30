import {
  ChecklistStep,
  CreateSurgicalInterventionInput,
  EntryTechnique,
  InterventionApproachConfig,
  InterventionEntryTechniqueOption,
  InterventionIndicationOption,
  InterventionLateralityMode,
  InterventionStatus,
  InterventionType,
  OperativeStepDefinition,
  SurgicalApproach,
  SurgicalInterventionDefinition,
} from '../types';

const DEFAULT_ENTRY_TECHNIQUES: EntryTechnique[] = [
  'trocart_direct',
  'open',
  'veress',
];

const PNEUMOPERITONEUM_APPROACHES: SurgicalApproach[] = [
  'coelioscopie',
  'robot',
];

const SURGICAL_APPROACH_LABELS: Record<SurgicalApproach, string> = {
  coelioscopie: 'Cœlioscopie',
  robot: 'Robot',
  laparotomie: 'Laparotomie',
  voie_vaginale: 'Voie vaginale',
  hysteroscopie: 'Hystéroscopie',
  vnotes: 'vNOTES',
};

export function createInterventionIndicationOption(
  label = '',
  overrides: Partial<InterventionIndicationOption> = {}
): InterventionIndicationOption {
  const normalizedLabel = label.trim();
  const isOther = overrides.isOther ?? normalizedLabel.toLocaleLowerCase('fr-FR') === 'autre';

  return {
    id:
      overrides.id ??
      `intervention-indication-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
    label,
    active: overrides.active ?? true,
    isOther,
    isDefault: overrides.isDefault ?? isOther,
  };
}

export function createEntryTechniqueOptions(
  entryTechniques: EntryTechnique[] = DEFAULT_ENTRY_TECHNIQUES
): InterventionEntryTechniqueOption[] {
  return entryTechniques.map((entryTechnique, index) => ({
    id: `entry-technique-${entryTechnique}-${index + 1}`,
    label: entryTechnique,
    active: true,
  }));
}

export function createOperativeStep(
  label = '',
  order = 1,
  scored = order === 1
): OperativeStepDefinition {
  return {
    id: `operative-step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label,
    scored,
    order,
  };
}

export function createApproachConfig(
  approach: SurgicalApproach,
  overrides: Partial<InterventionApproachConfig> = {}
): InterventionApproachConfig {
  const needsEntryTechniques = PNEUMOPERITONEUM_APPROACHES.includes(approach);

  return {
    id:
      overrides.id ??
      `approach-config-${approach}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
    approach,
    active: overrides.active ?? false,
    entryTechniques:
      overrides.entryTechniques ??
      (needsEntryTechniques ? createEntryTechniqueOptions() : []),
    steps: overrides.steps ?? [],
  };
}

export function createEmptySurgicalInterventionDefinition(): SurgicalInterventionDefinition {
  const now = new Date().toISOString();

  return ensureSurgicalInterventionDefinitionShape({
    id: `custom-${Date.now()}` as InterventionType,
    name: '',
    indications: [],
    allowedApproaches: [],
    allowedEntryTechniques: [],
    requiresLaterality: true,
    checklistSteps: [],
    keyStepIds: [],
    status: 'inactive',
    lateralityMode: 'right_left_bilateral',
    indicationOptions: [],
    approachConfigs: [],
    isCustom: true,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  });
}

export function sortIndicationOptions(
  indicationOptions: InterventionIndicationOption[]
) {
  const activeOptions = [...indicationOptions];

  return activeOptions.sort((left, right) => {
    if (left.isOther && !right.isOther) {
      return 1;
    }

    if (!left.isOther && right.isOther) {
      return -1;
    }

    return left.label.localeCompare(right.label, 'fr-FR', {
      sensitivity: 'base',
    });
  });
}

export function lateralityModeToRequiresLaterality(
  lateralityMode: InterventionLateralityMode
) {
  return lateralityMode !== 'none';
}

function getDefaultLateralityMode(
  definition: SurgicalInterventionDefinition | CreateSurgicalInterventionInput
) {
  if (definition.lateralityMode) {
    return definition.lateralityMode;
  }

  return definition.requiresLaterality ? 'right_left_bilateral' : 'none';
}

function buildIndicationOptionsFromLegacy(
  indications: string[]
): InterventionIndicationOption[] {
  const normalized = indications.filter((indication) => indication.trim());
  const hasOther = normalized.some(
    (indication) => indication.trim().toLocaleLowerCase('fr-FR') === 'autre'
  );
  const options = normalized.map((indication) =>
    createInterventionIndicationOption(indication, {
      isOther: indication.trim().toLocaleLowerCase('fr-FR') === 'autre',
      isDefault: indication.trim().toLocaleLowerCase('fr-FR') === 'autre',
    })
  );

  if (!hasOther) {
    options.push(
      createInterventionIndicationOption('Autre', {
        isOther: true,
        isDefault: true,
      })
    );
  }

  return sortIndicationOptions(options);
}

function buildApproachConfigsFromLegacy(
  definition: SurgicalInterventionDefinition | CreateSurgicalInterventionInput
) {
  return definition.allowedApproaches.map((approach) => {
    const needsEntryTechniques = PNEUMOPERITONEUM_APPROACHES.includes(approach);
    const entryTechniques = needsEntryTechniques
      ? createEntryTechniqueOptions(definition.allowedEntryTechniques)
      : [];
    const legacyChecklistSteps =
      'checklistSteps' in definition ? definition.checklistSteps : [];
    const legacyKeyStepIds =
      'keyStepIds' in definition ? new Set(definition.keyStepIds) : new Set<string>();
    const legacyStepApproachLabels =
      'stepApproachLabels' in definition ? definition.stepApproachLabels : {};
    const legacyStepOrderLabels =
      'stepOrderLabels' in definition ? definition.stepOrderLabels : [];
    const legacyCustomSteps =
      'customChecklistSteps' in definition ? definition.customChecklistSteps : [];
    const resolvedLegacySteps =
      legacyChecklistSteps.length > 0
        ? legacyChecklistSteps
        : [...legacyStepOrderLabels, ...legacyCustomSteps].map((label, index) => ({
            id: `legacy-step-${index + 1}`,
            label,
            applicableApproaches:
              legacyStepApproachLabels[label]?.length != null
                ? legacyStepApproachLabels[label]
                : [],
          }));
    const steps = resolvedLegacySteps
      .filter((step) => {
        const applicableApproaches = step.applicableApproaches ?? [];

        return (
          applicableApproaches.length === 0 ||
          applicableApproaches.includes(approach)
        );
      })
      .map((step, index) =>
        createOperativeStep(step.label, index + 1, legacyKeyStepIds.has(step.id))
      );

    return createApproachConfig(approach, {
      active: true,
      entryTechniques,
      steps,
    });
  });
}

function deriveAllowedEntryTechniques(approachConfigs: InterventionApproachConfig[]) {
  return [
    ...new Set(
      approachConfigs
        .filter((config) => config.active)
        .flatMap((config) => config.entryTechniques ?? [])
        .filter((entryTechnique) => entryTechnique.active)
        .map((entryTechnique) => entryTechnique.label)
    ),
  ];
}

function deriveChecklistSteps(approachConfigs: InterventionApproachConfig[]): ChecklistStep[] {
  const stepMap = new Map<
    string,
    { id: string; label: string; applicableApproaches: SurgicalApproach[] }
  >();

  approachConfigs
    .filter((config) => config.active)
    .forEach((config) => {
      [...config.steps]
        .sort((left, right) => left.order - right.order)
        .forEach((step) => {
          const normalizedLabel = step.label.trim().toLocaleLowerCase('fr-FR');
          const current = stepMap.get(normalizedLabel);

          if (!current) {
            stepMap.set(normalizedLabel, {
              id: step.id,
              label: step.label.trim(),
              applicableApproaches: [config.approach],
            });
            return;
          }

          if (!current.applicableApproaches.includes(config.approach)) {
            current.applicableApproaches.push(config.approach);
          }
        });
    });

  return Array.from(stepMap.values()).map((step) => ({
    id: step.id,
    label: step.label,
    applicableApproaches: step.applicableApproaches,
  }));
}

function deriveKeyStepIds(approachConfigs: InterventionApproachConfig[]) {
  const scoredIds = new Set<string>();

  approachConfigs
    .filter((config) => config.active)
    .forEach((config) => {
      config.steps.forEach((step) => {
        if (step.scored) {
          scoredIds.add(step.id);
        }
      });
    });

  return Array.from(scoredIds);
}

export function ensureSurgicalInterventionDefinitionShape(
  definition: SurgicalInterventionDefinition
): SurgicalInterventionDefinition {
  const indicationOptions =
    definition.indicationOptions != null
      ? sortIndicationOptions(
          definition.indicationOptions.map((indicationOption) => ({
            ...createInterventionIndicationOption(indicationOption.label),
            ...indicationOption,
          }))
        )
      : buildIndicationOptionsFromLegacy(definition.indications ?? []);
  const allowedApproaches = definition.allowedApproaches ?? [];
  const approachConfigs =
    definition.approachConfigs?.length != null &&
    definition.approachConfigs.length > 0
      ? [
          ...new Set([
            ...definition.approachConfigs.map((config) => config.approach),
            ...allowedApproaches,
          ]),
        ]
          .map((approach) =>
            definition.approachConfigs?.find((config) => config.approach === approach) ??
            createApproachConfig(approach, { active: true })
          )
          .map((config) => ({
            ...createApproachConfig(config.approach),
            ...config,
            active:
              config.active ??
              allowedApproaches.includes(config.approach),
            entryTechniques: (config.entryTechniques ?? []).map((entryTechnique) => ({
              ...createEntryTechniqueOptions([entryTechnique.label])[0],
              ...entryTechnique,
            })),
            steps: [...(config.steps ?? [])]
              .sort((left, right) => left.order - right.order)
              .map((step, index) => ({
                ...createOperativeStep(step.label, index + 1, step.scored),
                ...step,
                label: step.label ?? '',
                order: step.order ?? index + 1,
              })),
          }))
      : buildApproachConfigsFromLegacy(definition);
  const activeApproachConfigs = approachConfigs.filter((config) => config.active);
  const lateralityMode = getDefaultLateralityMode(definition);

  return {
    ...definition,
    indications: sortIndicationOptions(indicationOptions)
      .filter((indicationOption) => indicationOption.active)
      .map((indicationOption) => indicationOption.label.trim()),
    indicationOptions,
    allowedApproaches: activeApproachConfigs.map((config) => config.approach),
    allowedEntryTechniques: deriveAllowedEntryTechniques(activeApproachConfigs),
    requiresLaterality: lateralityModeToRequiresLaterality(lateralityMode),
    checklistSteps: deriveChecklistSteps(activeApproachConfigs),
    keyStepIds: deriveKeyStepIds(activeApproachConfigs),
    status: definition.status ?? 'active',
    lateralityMode,
    approachConfigs,
    archivedAt: definition.archivedAt ?? null,
    updatedAt: definition.updatedAt ?? definition.createdAt ?? new Date().toISOString(),
  };
}

export function buildSurgicalInterventionDefinitionFromInput(
  input: CreateSurgicalInterventionInput,
  existingDefinition?: SurgicalInterventionDefinition,
  forcedStatus?: InterventionStatus
): SurgicalInterventionDefinition {
  const now = new Date().toISOString();
  const draftDefinition: SurgicalInterventionDefinition = {
    id:
      existingDefinition?.id ??
      (`custom-${Date.now()}` as InterventionType),
    name: input.name.trim(),
    indications: input.indications ?? [],
    allowedApproaches: input.allowedApproaches ?? [],
    allowedEntryTechniques: input.allowedEntryTechniques ?? [],
    requiresLaterality: input.requiresLaterality,
    checklistSteps: [],
    keyStepIds: [],
    isCustom: existingDefinition?.isCustom ?? true,
    createdAt: existingDefinition?.createdAt ?? now,
    updatedAt: now,
    status: forcedStatus ?? input.status ?? existingDefinition?.status ?? 'inactive',
    lateralityMode:
      input.lateralityMode ??
      existingDefinition?.lateralityMode ??
      'right_left_bilateral',
    indicationOptions:
      input.indicationOptions ??
      existingDefinition?.indicationOptions ??
      buildIndicationOptionsFromLegacy(input.indications ?? []),
    approachConfigs:
      input.approachConfigs ??
      existingDefinition?.approachConfigs ??
      buildApproachConfigsFromLegacy(input),
    archivedAt:
      (forcedStatus ?? input.status ?? existingDefinition?.status) === 'archived'
        ? existingDefinition?.archivedAt ?? now
        : null,
  };

  return ensureSurgicalInterventionDefinitionShape(draftDefinition);
}

export function surgicalInterventionDefinitionToInput(
  definition: SurgicalInterventionDefinition
): CreateSurgicalInterventionInput {
  const normalizedDefinition = ensureSurgicalInterventionDefinitionShape(definition);

  return {
    name: normalizedDefinition.name,
    indications: normalizedDefinition.indications,
    allowedApproaches: normalizedDefinition.allowedApproaches,
    allowedEntryTechniques: normalizedDefinition.allowedEntryTechniques,
    requiresLaterality: normalizedDefinition.requiresLaterality,
    customChecklistSteps: [],
    keyStepLabels: [],
    stepOrderLabels: [],
    stepApproachLabels: {},
    status: normalizedDefinition.status,
    lateralityMode: normalizedDefinition.lateralityMode,
    indicationOptions: normalizedDefinition.indicationOptions,
    approachConfigs: normalizedDefinition.approachConfigs,
  };
}

export function countInterventionConfiguredSteps(
  definition: SurgicalInterventionDefinition
) {
  return ensureSurgicalInterventionDefinitionShape(definition).approachConfigs?.reduce(
    (total, config) => total + config.steps.length,
    0
  ) ?? 0;
}

export function duplicateSurgicalInterventionDefinition(
  definition: SurgicalInterventionDefinition
): SurgicalInterventionDefinition {
  const now = new Date().toISOString();
  const source = ensureSurgicalInterventionDefinitionShape(definition);

  return ensureSurgicalInterventionDefinitionShape({
    ...source,
    id: `custom-${Date.now()}` as InterventionType,
    name: `Copie de ${source.name}`,
    status: 'inactive',
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    indicationOptions: source.indicationOptions?.map((indicationOption) => ({
      ...indicationOption,
      id: `intervention-indication-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
    })),
    approachConfigs: source.approachConfigs?.map((config) => ({
      ...config,
      id: `approach-config-${config.approach}-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)}`,
      entryTechniques: (config.entryTechniques ?? []).map((entryTechnique) => ({
        ...entryTechnique,
        id: `entry-technique-${entryTechnique.label}-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
      })),
      steps: config.steps.map((step, index) => ({
        ...step,
        id: `operative-step-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        order: index + 1,
      })),
    })),
  });
}

export function validateSurgicalInterventionForPublish(
  definition: SurgicalInterventionDefinition
) {
  const normalizedDefinition = ensureSurgicalInterventionDefinitionShape(definition);
  const errors: string[] = [];

  if (!normalizedDefinition.name.trim()) {
    errors.push('Impossible de publier cette intervention : le nom est obligatoire.');
  }

  const activeApproachConfigs =
    normalizedDefinition.approachConfigs?.filter((config) => config.active) ?? [];

  if (activeApproachConfigs.length === 0) {
    errors.push(
      'Impossible de publier cette intervention : au moins une voie d’abord doit être configurée.'
    );
  }

  activeApproachConfigs.forEach((config) => {
    const validSteps = config.steps.filter((step) => step.label.trim());
    const activeEntryTechniques =
      config.entryTechniques?.filter((entryTechnique) => entryTechnique.active) ?? [];
    const approachLabel = SURGICAL_APPROACH_LABELS[config.approach];

    if (
      PNEUMOPERITONEUM_APPROACHES.includes(config.approach) &&
      activeEntryTechniques.length === 0
    ) {
      errors.push(
        `Impossible de publier cette intervention : la voie d’abord ${approachLabel} doit proposer au moins une technique d’entrée du pneumopéritoine.`
      );
    }

    if (validSteps.length === 0) {
      errors.push(
        `Impossible de publier cette intervention : la voie d’abord ${approachLabel} ne contient aucune étape opératoire.`
      );
    }

    if (validSteps.length > 0 && !validSteps.some((step) => step.scored)) {
      errors.push(
        'Impossible de publier cette intervention : chaque voie d’abord active doit contenir au moins une étape clé évaluée dans le score.'
      );
    }
  });

  return errors;
}
