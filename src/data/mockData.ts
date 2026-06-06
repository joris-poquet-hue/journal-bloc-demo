import {
  ChecklistLevel,
  ChecklistStep,
  ChoiceOption,
  Complexity,
  EntryTechnique,
  GlobalRole,
  Indication,
  BadgeMetricKey,
  BadgeCatalogItem,
  InternalProfile,
  InterventionType,
  Laterality,
  ProgressBadge,
  SavedIntervention,
  Senior,
  SurgicalApproach,
  SurgicalInterventionDefinition,
  SurgeryContext,
  TechniqueGuide,
} from '../types';

export const internalProfiles: InternalProfile[] = [
  {
    id: 'int-1',
    firstName: 'Interne1',
    lastName: '',
    loginId: 'Interne1',
    password: 'Interne1',
    promotion: 'Promo 2025',
    semester: 'S1',
    currentRotation: 'Pool obstétrical',
    createdAt: '2026-05-29T08:00:00.000Z',
    lastLoginAt: null,
    baselineStats: {
      totalInterventions: 0,
      primaryOperatorCount: 0,
      primaryAssistantCount: 0,
    },
    achievementBadges: [],
    badgeMetrics: {
      primarySalpingectomyCount: 0,
      primaryColpocleisisCount: 0,
    },
  },
  {
    id: 'int-2',
    firstName: 'Interne2',
    lastName: '',
    loginId: 'Interne2',
    password: 'Interne2',
    promotion: 'Promo 2023',
    semester: 'S5',
    currentRotation: 'Chirurgie',
    createdAt: '2026-05-29T08:05:00.000Z',
    lastLoginAt: null,
    baselineStats: {
      totalInterventions: 0,
      primaryOperatorCount: 0,
      primaryAssistantCount: 0,
    },
    achievementBadges: [],
    badgeMetrics: {
      primarySalpingectomyCount: 0,
      primaryColpocleisisCount: 0,
    },
  },
  {
    id: 'int-3',
    firstName: 'Interne3',
    lastName: '',
    loginId: 'Interne3',
    password: 'Interne3',
    promotion: 'Promo 2020',
    semester: 'S12',
    currentRotation: 'Chirurgie',
    createdAt: '2026-05-29T08:10:00.000Z',
    lastLoginAt: null,
    baselineStats: {
      totalInterventions: 0,
      primaryOperatorCount: 0,
      primaryAssistantCount: 0,
    },
    achievementBadges: [],
    badgeMetrics: {
      primarySalpingectomyCount: 0,
      primaryColpocleisisCount: 0,
    },
  },
];

export const seniors: Senior[] = [
  { id: 'sen-1', firstName: 'Sophie', lastName: 'Le Goff' },
  { id: 'sen-2', firstName: 'Camille', lastName: 'Durand' },
];

export const procedureOptions: ChoiceOption<InterventionType>[] = [
  {
    value: 'salpingectomie',
    label: 'Salpingectomie',
  },
  {
    value: 'colpoclesis',
    label: 'Colpoclésis',
  },
];

export const indicationOptions: ChoiceOption<Indication>[] = [
  { value: 'geu', label: 'GEU' },
  { value: 'ligature_tubaire', label: 'Ligature tubaire' },
  { value: 'autre', label: 'Autre' },
];

export const approachOptions: ChoiceOption<SurgicalApproach>[] = [
  { value: 'coelioscopie', label: 'Cœlioscopie' },
  { value: 'laparotomie', label: 'Laparotomie' },
  { value: 'robot', label: 'Robot' },
  { value: 'vnotes', label: 'vNotes' },
];

export function getApproachOptionsForIndication(indication: Indication | null) {
  if (indication === 'geu') {
    return approachOptions.filter(
      (option) => option.value !== 'robot' && option.value !== 'vnotes'
    );
  }

  if (indication === 'ligature_tubaire') {
    return approachOptions.filter(
      (option) => option.value !== 'laparotomie' && option.value !== 'robot'
    );
  }

  return approachOptions;
}

export function isApproachAllowedForIndication(
  approach: SurgicalApproach,
  indication: Indication | null
) {
  return getApproachOptionsForIndication(indication).some(
    (option) => option.value === approach
  );
}

export const entryTechniqueOptions: ChoiceOption<EntryTechnique>[] = [
  { value: 'trocart_direct', label: 'Trocart direct' },
  { value: 'open', label: 'Open' },
  { value: 'veress', label: 'Aiguille de Veress' },
];

export const lateralityOptions: ChoiceOption<Laterality>[] = [
  { value: 'gauche', label: 'Gauche' },
  { value: 'bilateral', label: 'Bilatéral' },
  { value: 'droite', label: 'Droite' },
];

export const contextOptions: ChoiceOption<SurgeryContext>[] = [
  { value: 'programme', label: 'Programmé' },
  { value: 'urgence', label: 'Urgence' },
];

export function formatDisplayName(firstName: string, lastName: string) {
  return [firstName, lastName].filter((value) => value.trim().length > 0).join(' ');
}

export function getFixedContextForIntervention(
  procedure: InterventionType,
  indication: Indication | null
): SurgeryContext | null {
  if (procedure === 'colpoclesis') {
    return 'programme';
  }

  if (procedure === 'salpingectomie' && indication === 'geu') {
    return 'urgence';
  }

  if (procedure === 'salpingectomie' && indication === 'ligature_tubaire') {
    return 'programme';
  }

  return null;
}

export function normalizeComplexityRating(
  value: Complexity | 'simple' | 'intermediaire' | 'difficile' | null
): Complexity | null {
  if (typeof value === 'number' && value >= 1 && value <= 10) {
    return value as Complexity;
  }

  if (value === 'simple') {
    return 2;
  }

  if (value === 'intermediaire') {
    return 5;
  }

  if (value === 'difficile') {
    return 8;
  }

  return null;
}

export function formatComplexityRating(
  value: Complexity | 'simple' | 'intermediaire' | 'difficile' | null,
  fallbackValue = 'Non renseigné'
) {
  const normalizedValue = normalizeComplexityRating(value);

  return normalizedValue ? `${normalizedValue} / 10` : fallbackValue;
}

export const defaultComplexityRating: Complexity = 5;

export const roleOptions: ChoiceOption<GlobalRole>[] = [
  { value: 'operateur_principal', label: 'Opérateur principal' },
  { value: 'aide_principal', label: 'Aide principal' },
  { value: 'aide_secondaire', label: 'Aide secondaire' },
  { value: 'observateur', label: 'Observateur' },
];

export const checklistLevelOptions: ChoiceOption<ChecklistLevel>[] = [
  { value: 'NA', label: 'NA', description: 'Non applicable' },
  { value: '0', label: '0', description: 'Observé uniquement' },
  {
    value: '1',
    label: '1',
    description: 'Montré et expliqué',
  },
  {
    value: '2',
    label: '2',
    description: 'Réalisé avec assistance active du senior',
  },
  {
    value: '3',
    label: '3',
    description: 'Réalisé avec assistance passive du senior',
  },
  {
    value: '4',
    label: '4',
    description: 'Réalisé sous supervision seule',
  },
];

export const checklistLevelDetails: Record<ChecklistLevel, string> = {
  NA: 'Étape non concernée pour cette intervention.',
  '0': 'Le senior a réalisé l’étape. Je n’ai pas participé techniquement.',
  '1':
    'Le senior a réalisé l’étape en me la montrant et en l’expliquant. Ma participation était limitée ou absente.',
  '2':
    'J’ai réalisé l’étape avec une aide importante du senior : aide physique, correction du geste, reprise partielle ou guidage rapproché.',
  '3':
    'J’ai réalisé l’étape moi-même, avec seulement des consignes verbales ou des conseils ponctuels. Le senior n’est pas intervenu physiquement.',
  '4':
    'J’ai réalisé l’étape en autonomie, le senior étant uniquement présent pour superviser et sécuriser si besoin.',
};

const commonChecklistStepLabels = [
  'Installation de la patiente',
  'Préparation du matériel et vérification de l’installation',
] as const;

export const salpingectomyChecklistSteps: ChecklistStep[] = [
  { id: 'step-1', label: commonChecklistStepLabels[0] },
  { id: 'step-2', label: commonChecklistStepLabels[1] },
  { id: 'step-3', label: 'Voie d’abord du pneumopéritoine' },
  { id: 'step-4', label: 'Mise en place des trocarts' },
  { id: 'step-5', label: 'Exploration abdomino-pelvienne initiale' },
  { id: 'step-7', label: 'Exposition des annexes' },
  { id: 'step-8', label: 'Aspiration / lavage si nécessaire' },
  {
    id: 'step-9',
    label: 'Coagulation-section progressive du mésosalpinx',
  },
  {
    id: 'step-10',
    label: 'Section de la trompe au niveau de la corne utérine',
  },
  { id: 'step-11', label: 'Mise en sac et extraction de la pièce opératoire' },
  { id: 'step-12', label: 'Contrôle de l’hémostase' },
  { id: 'step-13', label: 'Exsufflation et retrait des trocarts' },
  { id: 'step-14', label: 'Fermeture de la voie d’abord' },
  { id: 'step-15', label: 'Fermeture cutanée' },
];

export const colpoclesisChecklistSteps: ChecklistStep[] = [
  { id: 'colpo-step-1', label: commonChecklistStepLabels[0] },
  { id: 'colpo-step-2', label: commonChecklistStepLabels[1] },
  {
    id: 'colpo-step-3',
    label: 'Colpectomie antérieure et postérieure',
  },
  {
    id: 'colpo-step-4',
    label: 'Colporraphie antéro-postérieure',
  },
  { id: 'colpo-step-5', label: 'Fermeture vaginale' },
];

export const allChecklistSteps: ChecklistStep[] = [
  ...salpingectomyChecklistSteps,
  ...colpoclesisChecklistSteps,
];

export const builtInSurgicalInterventions: SurgicalInterventionDefinition[] = [
  {
    id: 'salpingectomie',
    name: 'Salpingectomie',
    indications: [],
    allowedApproaches: ['coelioscopie', 'laparotomie', 'robot', 'vnotes'],
    allowedEntryTechniques: ['trocart_direct', 'open', 'veress'],
    requiresLaterality: true,
    checklistSteps: salpingectomyChecklistSteps,
    keyStepIds: ['step-9', 'step-10', 'step-12'],
  },
  {
    id: 'colpoclesis',
    name: 'Colpoclésis',
    indications: [],
    allowedApproaches: [],
    allowedEntryTechniques: [],
    requiresLaterality: false,
    checklistSteps: colpoclesisChecklistSteps,
    keyStepIds: ['colpo-step-3', 'colpo-step-4', 'colpo-step-5'],
  },
];

export function getSurgicalInterventionDefinitions(
  customInterventions: SurgicalInterventionDefinition[] = []
) {
  const customById = new Map(
    customInterventions.map((intervention) => [intervention.id, intervention])
  );
  const builtInIds = new Set(
    builtInSurgicalInterventions.map((intervention) => intervention.id)
  );
  const resolvedBuiltIns = builtInSurgicalInterventions.map(
    (intervention) => customById.get(intervention.id) ?? intervention
  );
  const additionalCustomInterventions = customInterventions.filter(
    (intervention) => !builtInIds.has(intervention.id)
  );

  return [...resolvedBuiltIns, ...additionalCustomInterventions];
}

export function getProcedureOptions(
  customInterventions: SurgicalInterventionDefinition[] = []
): ChoiceOption<InterventionType>[] {
  return getSurgicalInterventionDefinitions(customInterventions).map((intervention) => ({
    value: intervention.id,
    label: intervention.name,
  }));
}

export function getSurgicalInterventionDefinition(
  procedure: InterventionType,
  customInterventions: SurgicalInterventionDefinition[] = []
) {
  return getSurgicalInterventionDefinitions(customInterventions).find(
    (intervention) => intervention.id === procedure
  );
}

export function getChecklistStepsForIntervention(
  procedure: InterventionType,
  indication: Indication | null,
  approach?: SurgicalApproach | null,
  entryTechnique?: EntryTechnique | null,
  customInterventions: SurgicalInterventionDefinition[] = []
) {
  const customIntervention = customInterventions.find(
    (intervention) => intervention.id === procedure
  );

  if (customIntervention) {
    return customIntervention.checklistSteps;
  }

  if (
    procedure === 'salpingectomie' &&
    (indication === 'geu' || indication === 'ligature_tubaire')
  ) {
    return salpingectomyChecklistSteps.filter((step) => {
      if (
        (step.id === 'step-3' || step.id === 'step-13') &&
        !['coelioscopie', 'robot', 'vnotes'].includes(approach ?? '')
      ) {
        return false;
      }

      if (
        step.id === 'step-14' &&
        !(entryTechnique === 'open' || approach === 'vnotes')
      ) {
        return false;
      }

      return true;
    });
  }

  if (procedure === 'colpoclesis') {
    return colpoclesisChecklistSteps;
  }

  return [];
}

function createChecklistState(
  steps: ChecklistStep[],
  level: ChecklistLevel
): Record<string, ChecklistLevel | null> {
  return steps.reduce<Record<string, ChecklistLevel | null>>((accumulator, step) => {
    accumulator[step.id] = level;
    return accumulator;
  }, {});
}

function createSavedSalpingectomyIntervention({
  id,
  internalId,
  date,
  savedAt,
  indication,
  seniorId,
  laterality,
  level,
}: {
  id: string;
  internalId: string;
  date: string;
  savedAt: string;
  indication: Indication;
  seniorId: string;
  laterality: Laterality;
  level: ChecklistLevel;
}): SavedIntervention {
  const approach: SurgicalApproach = 'coelioscopie';
  const entryTechnique: EntryTechnique = 'open';
  const checklistSteps = getChecklistStepsForIntervention(
    'salpingectomie',
    indication,
    approach,
    entryTechnique
  );

  return {
    id,
    savedAt,
    date,
    internalId,
    seniorId,
    procedure: 'salpingectomie',
    indication,
    indicationComment: '',
    customIndication: null,
    approach,
    entryTechnique,
    laterality,
    context: getFixedContextForIntervention('salpingectomie', indication),
    complexity: defaultComplexityRating,
    role: 'operateur_principal',
    checklist: createChecklistState(checklistSteps, level),
  };
}

function createSavedColpoclesisIntervention({
  id,
  internalId,
  date,
  savedAt,
  seniorId,
  level,
}: {
  id: string;
  internalId: string;
  date: string;
  savedAt: string;
  seniorId: string;
  level: ChecklistLevel;
}): SavedIntervention {
  return {
    id,
    savedAt,
    date,
    internalId,
    seniorId,
    procedure: 'colpoclesis',
    indication: null,
    indicationComment: '',
    customIndication: null,
    approach: null,
    entryTechnique: null,
    laterality: null,
    context: getFixedContextForIntervention('colpoclesis', null),
    complexity: defaultComplexityRating,
    role: 'operateur_principal',
    checklist: createChecklistState(colpoclesisChecklistSteps, level),
  };
}

const interne2SalpingectomyDates = [
  '2026-02-02',
  '2026-02-12',
  '2026-02-21',
  '2026-03-01',
  '2026-03-10',
  '2026-03-19',
  '2026-03-28',
  '2026-04-08',
  '2026-04-19',
  '2026-05-04',
];

const interne2SavedInterventions = [
  ...interne2SalpingectomyDates.map((date, index) =>
    createSavedSalpingectomyIntervention({
      id: `seed-int2-salp-${index + 1}`,
      internalId: 'int-2',
      date,
      savedAt: `${date}T18:00:00.000Z`,
      indication: index < 6 ? 'geu' : 'ligature_tubaire',
      seniorId: index % 2 === 0 ? 'sen-1' : 'sen-2',
      laterality:
        index < 6
          ? index % 2 === 0
            ? 'gauche'
            : 'droite'
          : 'bilateral',
      level: '3',
    })
  ),
  createSavedColpoclesisIntervention({
    id: 'seed-int2-colpo-1',
    internalId: 'int-2',
    date: '2026-05-16',
    savedAt: '2026-05-16T18:00:00.000Z',
    seniorId: 'sen-1',
    level: '3',
  }),
];

const interne3SalpingectomyDates = [
  '2025-06-10',
  '2025-06-22',
  '2025-07-03',
  '2025-07-15',
  '2025-07-29',
  '2025-08-11',
  '2025-08-24',
  '2025-09-05',
  '2025-09-18',
  '2025-10-02',
  '2025-10-16',
  '2025-10-30',
  '2025-11-13',
  '2025-11-27',
  '2025-12-10',
  '2026-01-08',
  '2026-01-22',
  '2026-02-05',
  '2026-02-18',
  '2026-03-03',
];

const interne3ColpoclesisDates = [
  '2025-05-28',
  '2025-06-21',
  '2025-07-17',
  '2025-08-07',
  '2025-08-28',
  '2025-09-18',
  '2025-10-09',
  '2025-10-30',
  '2025-12-04',
  '2026-02-06',
];

const interne3SavedInterventions = [
  ...interne3SalpingectomyDates.map((date, index) =>
    createSavedSalpingectomyIntervention({
      id: `seed-int3-salp-${index + 1}`,
      internalId: 'int-3',
      date,
      savedAt: `${date}T18:00:00.000Z`,
      indication: index < 12 ? 'geu' : 'ligature_tubaire',
      seniorId: index % 2 === 0 ? 'sen-1' : 'sen-2',
      laterality:
        index < 12
          ? index % 2 === 0
            ? 'gauche'
            : 'droite'
          : 'bilateral',
      level: index === 0 ? '4' : '3',
    })
  ),
  ...interne3ColpoclesisDates.map((date, index) =>
    createSavedColpoclesisIntervention({
      id: `seed-int3-colpo-${index + 1}`,
      internalId: 'int-3',
      date,
      savedAt: `${date}T18:00:00.000Z`,
      seniorId: index % 2 === 0 ? 'sen-1' : 'sen-2',
      level: index === 0 ? '4' : '3',
    })
  ),
];

export const seededSavedInterventions: SavedIntervention[] = [
  ...interne2SavedInterventions,
  ...interne3SavedInterventions,
].sort((left, right) => right.savedAt.localeCompare(left.savedAt));

const salpingectomyPrimaryBadgeMilestones = [
  {
    id: 'milestone-salpingectomie-as',
    metricKey: 'master_salpingectomy' as const,
    title: 'As de la salpingectomie',
    tier: 'diamond' as const,
    target: salpingectomyChecklistSteps.length,
    imageSrc: '/images/badges/salpingectomie-as.png',
  },
  {
    id: 'milestone-salpingectomie-20',
    metricKey: 'primary_salpingectomy' as const,
    title: 'Vingt salpingectomies en tant qu’opérateur principal',
    tier: 'gold' as const,
    target: 20,
    imageSrc: '/images/badges/salpingectomie-operateur-principal-20.png',
  },
  {
    id: 'milestone-salpingectomie-10',
    metricKey: 'primary_salpingectomy' as const,
    title: 'Dix salpingectomies en tant qu’opérateur principal',
    tier: 'silver' as const,
    target: 10,
    imageSrc: '/images/badges/salpingectomie-operateur-principal-10.png',
  },
  {
    id: 'milestone-salpingectomie-1',
    metricKey: 'primary_salpingectomy' as const,
    title: 'Première salpingectomie en tant qu’opérateur principal',
    tier: 'bronze' as const,
    target: 1,
    imageSrc: '/images/badges/salpingectomie-operateur-principal-1.png',
  },
] as const;

const colpocleisisAceMilestone = {
  id: 'milestone-colpocleisis-as',
  metricKey: 'master_colpocleisis' as const,
  title: 'As du colpoclésis',
  tier: 'diamond' as const,
  target: colpoclesisChecklistSteps.length,
  imageSrc: '/images/badges/colpocleisis-as.png',
} as const;

const colpocleisisPrimaryBadgeMilestones = [
  {
    id: 'milestone-colpocleisis-10',
    metricKey: 'primary_colpocleisis' as const,
    title: 'Dix colpoclésis en tant qu’opérateur principal',
    tier: 'gold' as const,
    target: 10,
    imageSrc: '/images/badges/colpocleisis-operateur-principal-10.png',
  },
  {
    id: 'milestone-colpocleisis-5',
    metricKey: 'primary_colpocleisis' as const,
    title: 'Cinq colpoclésis en tant qu’opérateur principal',
    tier: 'silver' as const,
    target: 5,
    imageSrc: '/images/badges/colpocleisis-operateur-principal-5.png',
  },
  {
    id: 'milestone-colpocleisis-1',
    metricKey: 'primary_colpocleisis' as const,
    title: 'Premier colpoclésis en tant qu’opérateur principal',
    tier: 'bronze' as const,
    target: 1,
    imageSrc: '/images/badges/colpocleisis-operateur-principal-1.png',
  },
] as const;

export const badgeCatalog: BadgeCatalogItem[] = [
  {
    id: 'catalog-salpingectomie-as',
    title: 'As de la salpingectomie',
    tier: 'diamond',
    metricKey: 'master_salpingectomy',
    target: 14,
    imageSrc: '/images/badges/salpingectomie-as.png',
    criteria:
      'Obtenu lorsqu’une salpingectomie pour GEU est validée avec le niveau 4 sur l’ensemble de la checklist technique.',
  },
  {
    id: 'catalog-colpocleisis-as',
    title: 'As du colpoclésis',
    tier: 'diamond',
    metricKey: 'master_colpocleisis',
    target: 5,
    imageSrc: '/images/badges/colpocleisis-as.png',
    criteria:
      'Obtenu lorsqu’un colpoclésis est validé avec le niveau 4 sur l’ensemble de la checklist technique.',
  },
  {
    id: 'catalog-salpingectomie-1',
    title: 'Première salpingectomie en tant qu’opérateur principal',
    tier: 'bronze',
    metricKey: 'primary_salpingectomy',
    target: 1,
    imageSrc: '/images/badges/salpingectomie-operateur-principal-1.png',
    criteria:
      'Obtenu après 1 salpingectomie enregistrée en tant qu’opérateur principal.',
  },
  {
    id: 'catalog-salpingectomie-10',
    title: 'Dix salpingectomies en tant qu’opérateur principal',
    tier: 'silver',
    metricKey: 'primary_salpingectomy',
    target: 10,
    imageSrc: '/images/badges/salpingectomie-operateur-principal-10.png',
    criteria:
      'Obtenu après 10 salpingectomies enregistrées en tant qu’opérateur principal. Déverrouillé seulement après obtention du badge précédent.',
    prerequisiteTitle: 'Première salpingectomie en tant qu’opérateur principal',
  },
  {
    id: 'catalog-salpingectomie-20',
    title: 'Vingt salpingectomies en tant qu’opérateur principal',
    tier: 'gold',
    metricKey: 'primary_salpingectomy',
    target: 20,
    imageSrc: '/images/badges/salpingectomie-operateur-principal-20.png',
    criteria:
      'Obtenu après 20 salpingectomies enregistrées en tant qu’opérateur principal. Déverrouillé seulement après obtention du badge précédent.',
    prerequisiteTitle: 'Dix salpingectomies en tant qu’opérateur principal',
  },
  {
    id: 'catalog-colpocleisis-1',
    title: 'Premier colpoclésis en tant qu’opérateur principal',
    tier: 'bronze',
    metricKey: 'primary_colpocleisis',
    target: 1,
    imageSrc: '/images/badges/colpocleisis-operateur-principal-1.png',
    criteria:
      'Obtenu après 1 colpoclésis enregistré en tant qu’opérateur principal.',
  },
  {
    id: 'catalog-colpocleisis-5',
    title: 'Cinq colpoclésis en tant qu’opérateur principal',
    tier: 'silver',
    metricKey: 'primary_colpocleisis',
    target: 5,
    imageSrc: '/images/badges/colpocleisis-operateur-principal-5.png',
    criteria:
      'Obtenu après 5 colpoclésis enregistrés en tant qu’opérateur principal. Déverrouillé seulement après obtention du badge précédent.',
    prerequisiteTitle: 'Premier colpoclésis en tant qu’opérateur principal',
  },
  {
    id: 'catalog-colpocleisis-10',
    title: 'Dix colpoclésis en tant qu’opérateur principal',
    tier: 'gold',
    metricKey: 'primary_colpocleisis',
    target: 10,
    imageSrc: '/images/badges/colpocleisis-operateur-principal-10.png',
    criteria:
      'Obtenu après 10 colpoclésis enregistrés en tant qu’opérateur principal. Déverrouillé seulement après obtention du badge précédent.',
    prerequisiteTitle: 'Cinq colpoclésis en tant qu’opérateur principal',
  },
];

export const techniqueGuides: TechniqueGuide[] = [
  {
    id: 'guide-geu',
    kind: 'geu',
    title: 'Prise en charge chirurgicale d’une GEU',
    category: 'Urgence gynécologique',
    approach: 'Cœlioscopie en première intention',
    intro:
      'Repères pratiques pour préparer un bloc de grossesse extra-utérine tubaire et choisir un geste cohérent avec l’état de la trompe, l’hémostase et le projet reproductif.',
    anatomyText:
      '1. Arcade infratubaire. 2. Artère tubaire médiale. 3. Ligament utéro-ovarien. 4. Artère utérine. 5. Artère tubaire latérale. 6. ligament infundibulo-ovarien. 7. artère ovarique. 8. ligament lombo-ovarien. U. utérus. O. ovaire. T. trompe. M. mésosalpinx. ①. Jonction interstitielle. ②. Isthme de la trompe. ③. Ampoule tubaire. ④. Infundibulum.',
    anatomyHighlights: [
      'Repérer l’arcade infra-tubaire, le mésosalpinx et les rapports avec l’ovaire.',
      'Identifier le ligament utéro-ovarien, le ligament infundibulo-ovarien et l’ampoule tubaire.',
      'Confirmer la latéralité et vérifier systématiquement l’état de l’annexe controlatérale.',
    ],
    comparisonOverview:
      'La salpingotomie (« césarienne tubaire ») permet de conserver une chance de grossesse avec la trompe concernée. Actuellement, les recommandations prônent une décision individualisée : conserver la trompe si elle est peu altérée et si la controlatérale est compromise ; réaliser une salpingectomie si la trompe est très endommagée, si la controlatérale est saine, ou en l’absence de désir de grossesse.',
    indications: [
      'Le choix entre salpingotomie et salpingectomie reste individualisé selon le projet de grossesse, l’aspect de la trompe atteinte et la trompe controlatérale.',
      'La salpingectomie est à privilégier si la trompe est très altérée, hémorragique ou difficilement conservable.',
      'Une salpingotomie peut se discuter si la trompe paraît réparable et que la préservation tubaire a un réel enjeu fonctionnel.',
    ],
    literatureHighlights: [
      'La salpingotomie conserve la trompe avec un risque de récidive légèrement plus élevé (8 %) que la salpingectomie (5 %). La décision dépend du projet de grossesse, des antécédents et de l’état des trompes (Mol, Femke et al. “The ESEP study: salpingostomy versus salpingectomy for tubal ectopic pregnancy; the impact on future fertility: a randomised controlled trial.” BMC women’s health vol. 8 11. 26 Jun. 2008, doi:10.1186/1472-6874-8-11).',
      'Aucune différence significative entre la salpingotomie et la salpingectomie en termes de durée opératoire ou d’hospitalisation, mais la salpingotomie entraîne un volume de saignement opératoire moindre (Wenjing, Lin, and Li Haibo. “Therapeutic effect of laparoscopic salpingotomy vs. salpingectomy on patients with ectopic pregnancy: A systematic review and meta-analysis.” Frontiers in surgery vol. 9 997490. 11 Oct. 2022, doi:10.3389/fsurg.2022.997490).',
    ],
    preoperativeAssessment: [
      'La cœlioscopie est la voie de référence si la patiente est stable.',
      'La laparotomie reste indiquée en cas de GEU rompue avec hémopéritoine massif et instabilité hémodynamique.',
      'Bilan préopératoire utile : NFS, groupe sanguin avec phénotype Rhésus et Kell, bilan de coagulation.',
      'Informer sur les risques de conversion, de saignement et sur la possibilité d’un geste radical.',
      'À l’exploration : préciser le siège exact de la GEU, le volume de l’hémopéritoine et l’état des annexes.',
    ],
    salpingotomyTechniqueIntro:
      'Elle répond à trois principes généraux :',
    salpingotomyGeneralPrinciples: [
      'Ne pas traumatiser la trompe',
      'Réaliser l’incision au niveau du bord anti-mésial',
      'Se souvenir que la GEU est proximale et que l’hématosalpinx est distal',
    ],
    salpingotomyTechniqueParagraphs: [
      'La grossesse extra-utérine se développe dans l’épaisseur de la paroi tubaire, et non dans sa lumière. Il faut garder à l’esprit que la GEU est située en position proximale, tandis que l’hématosalpinx est distal.',
      'La trompe est saisie au niveau de son bord anti-mésial à l’aide d’une pince fine atraumatique. Une incision longitudinale est pratiquée sur 1 à 2 cm en fonction de la taille de la GEU, à la partie proximale de la voussure repérée. Une incision trop distale expose au risque de laisser persister du trophoblaste. L’ouverture est franche, réalisée à la pointe monopolaire en courant de section, jusqu’à apparition du trophoblaste ou de l’hématosalpinx.',
      'L’extraction se fait le plus souvent par aspiration. Une canule de lavage-aspiration de 10 mm est introduite dans la trompe : l’instillation de sérum décolle le trophoblaste et les caillots intratubaires, ensuite aspirés par mouvements de retrait et de rotation. L’extraction peut aussi être réalisée à la pince. Si celui-ci n’est pas entièrement aspiré, son extraction doit être réalisée dans un sac afin d’éviter toute dissémination péritonéale et la greffe d’implants trophoblastiques. La fermeture de la trompe n’est pas nécessaire.',
      'L’hémostase des berges peut être utile, par exemple avec une pince bipolaire fine. Une suture à l’aide de monocryl 3/0 est possible mais non obligatoire. En cas de saignement actif provenant du lit de la GEU, l’hémostase est souvent difficile : les tentatives répétées entraînent un risque important de lésions tubaires irréversibles. Dans ce contexte, une compression douce et des lavages au sérum physiologique chaud peuvent parfois suffire. En cas d’échec, il convient de recourir à un traitement radical, nécessaire dans environ 50 % des cas.',
      'Enfin, l’expression tubaire est à proscrire, y compris dans les avortements tubopéritonéaux, car elle augmente nettement le risque d’échec.',
    ],
    salpingotomyTechniqueNote:
      'A noter que les données de la littérature sont insuffisantes pour émettre une recommandation concernant l’ajout d’une injection systématique de MTX lors de la réalisation d’une salpingotomie en comparaison à la réalisation d’une salpingectomie seule pour la diminuer la morbidité ultérieure.',
    salpingotomyPrinciples: [
      'Respecter la trompe autant que possible et réaliser l’incision sur le bord antémésial.',
      'Ne pas confondre la GEU proximale avec l’hématosalpinx distal : l’incision doit porter sur la zone d’implantation.',
      'Ouvrir franchement sur environ 1 à 2 cm, extraire le trophoblaste sans fragmentation si possible et protéger l’extraction.',
      'Limiter les tentatives traumatiques et compléter par un lavage abondant si des débris persistent.',
    ],
    salpingectomyPrinciples: [
      'Elle repose sur un principe de coagulation-section depuis l’infudibulum vers la jonction interstitielle. Le principal risque de la salpingectomie laparoscopique est la dévascularisation ovarienne. Il convient toujours de rester au ras de la trompe, à distance de l’arcade ovarienne et du ligament lombo-ovarien en utilisant une coagulation bipolaire.',
      'Il est important de ne pas induire de pathologie du moignon tubaire, ce qui implique une coagulation de la portion interstitielle au ras de l’utérus. Ce geste limite également le risque de GEU ultérieure soit au niveau interstitiel, soit au niveau du moignon restant. Le moignon tubaire utérin, soigneusement coagulé, doit être suffisamment long pour éviter une reperméabilisation tubaire spontanée, à l’origine d’une fistule utéropéritonéale.',
    ],
    vigilancePoints: [],
    figures: {
      anatomy: '/images/geu/anatomie-legendee-geu.png',
      salpingectomy: '/images/geu/salpingectomie-technique-detail.png',
      salpingotomy: '/images/geu/salpingotomie-technique-detail.png',
    },
    sections: [
      {
        id: 'geu-section-1',
        title: 'Rappels anatomiques',
        subsections: [
          {
            id: 'geu-subsection-1',
            title: '',
            paragraphs: [
              '1. Arcade infratubaire. 2. Artère tubaire médiale. 3. Ligament utéro-ovarien. 4. Artère utérine. 5. Artère tubaire latérale. 6. ligament infundibulo-ovarien. 7. artère ovarique. 8. ligament lombo-ovarien. U. utérus. O. ovaire. T. trompe. M. mésosalpinx. ①. Jonction interstitielle. ②. Isthme de la trompe. ③. Ampoule tubaire. ④. Infundibulum.',
            ],
            imageSrc: '/images/geu/anatomie-legendee-geu.png',
            imageCaption: '',
            textStyle: {
              fontFamily: 'sans',
              color: 'primary',
              size: 'md',
              bold: false,
              italic: false,
            },
          },
        ],
      },
      {
        id: 'geu-section-2',
        title: 'Salpingectomie vs Salpingotomie',
        subsections: [
          {
            id: 'geu-subsection-2',
            title: '',
            paragraphs: [
              'La salpingotomie (« césarienne tubaire ») permet de conserver une chance de grossesse avec la trompe concernée. Actuellement, les recommandations prônent une décision individualisée : conserver la trompe si elle est peu altérée et si la controlatérale est compromise ; réaliser une salpingectomie si la trompe est très endommagée, si la controlatérale est saine, ou en l’absence de désir de grossesse.',
            ],
            textStyle: {
              fontFamily: 'sans',
              color: 'primary',
              size: 'md',
              bold: false,
              italic: false,
            },
          },
          {
            id: 'geu-subsection-3',
            title: '',
            eyebrow: 'Littérature',
            paragraphs: [
              'La salpingotomie conserve la trompe avec un risque de récidive légèrement plus élevé (8 %) que la salpingectomie (5 %). La décision dépend du projet de grossesse, des antécédents et de l’état des trompes (Mol, Femke et al. “The ESEP study: salpingostomy versus salpingectomy for tubal ectopic pregnancy; the impact on future fertility: a randomised controlled trial.” BMC women’s health vol. 8 11. 26 Jun. 2008, doi:10.1186/1472-6874-8-11).',
              'Aucune différence significative entre la salpingotomie et la salpingectomie en termes de durée opératoire ou d’hospitalisation, mais la salpingotomie entraîne un volume de saignement opératoire moindre (Wenjing, Lin, and Li Haibo. “Therapeutic effect of laparoscopic salpingotomy vs. salpingectomy on patients with ectopic pregnancy: A systematic review and meta-analysis.” Frontiers in surgery vol. 9 997490. 11 Oct. 2022, doi:10.3389/fsurg.2022.997490).',
            ],
            textStyle: {
              fontFamily: 'sans',
              color: 'muted',
              size: 'md',
              bold: false,
              italic: false,
            },
          },
        ],
      },
      {
        id: 'geu-section-3',
        title: 'Salpingectomie',
        subsections: [
          {
            id: 'geu-subsection-4',
            title: '',
            paragraphs: [
              'Elle repose sur un principe de coagulation-section depuis l’infudibulum vers la jonction interstitielle. Le principal risque de la salpingectomie laparoscopique est la dévascularisation ovarienne. Il convient toujours de rester au ras de la trompe, à distance de l’arcade ovarienne et du ligament lombo-ovarien en utilisant une coagulation bipolaire.',
              'Il est important de ne pas induire de pathologie du moignon tubaire, ce qui implique une coagulation de la portion interstitielle au ras de l’utérus. Ce geste limite également le risque de GEU ultérieure soit au niveau interstitiel, soit au niveau du moignon restant. Le moignon tubaire utérin, soigneusement coagulé, doit être suffisamment long pour éviter une reperméabilisation tubaire spontanée, à l’origine d’une fistule utéropéritonéale.',
            ],
            imageSrc: '/images/geu/salpingectomie-technique-detail.png',
            imageCaption: '',
            textStyle: {
              fontFamily: 'sans',
              color: 'primary',
              size: 'md',
              bold: false,
              italic: false,
            },
          },
        ],
      },
      {
        id: 'geu-section-4',
        title: 'Salpingotomie',
        subsections: [
          {
            id: 'geu-subsection-5',
            title: '',
            paragraphs: ['Elle répond à trois principes généraux :'],
            textStyle: {
              fontFamily: 'sans',
              color: 'primary',
              size: 'md',
              bold: false,
              italic: false,
            },
          },
          {
            id: 'geu-subsection-6',
            title: '',
            paragraphs: [
              'Ne pas traumatiser la trompe',
              'Réaliser l’incision au niveau du bord anti-mésial',
              'Se souvenir que la GEU est proximale et que l’hématosalpinx est distal',
            ],
            textStyle: {
              fontFamily: 'sans',
              color: 'muted',
              size: 'md',
              bold: true,
              italic: false,
            },
          },
          {
            id: 'geu-subsection-7',
            title: '',
            paragraphs: [
              'La grossesse extra-utérine se développe dans l’épaisseur de la paroi tubaire, et non dans sa lumière. Il faut garder à l’esprit que la GEU est située en position proximale, tandis que l’hématosalpinx est distal.',
              'La trompe est saisie au niveau de son bord anti-mésial à l’aide d’une pince fine atraumatique. Une incision longitudinale est pratiquée sur 1 à 2 cm en fonction de la taille de la GEU, à la partie proximale de la voussure repérée. Une incision trop distale expose au risque de laisser persister du trophoblaste. L’ouverture est franche, réalisée à la pointe monopolaire en courant de section, jusqu’à apparition du trophoblaste ou de l’hématosalpinx.',
              'L’extraction se fait le plus souvent par aspiration. Une canule de lavage-aspiration de 10 mm est introduite dans la trompe : l’instillation de sérum décolle le trophoblaste et les caillots intratubaires, ensuite aspirés par mouvements de retrait et de rotation. L’extraction peut aussi être réalisée à la pince. Si celui-ci n’est pas entièrement aspiré, son extraction doit être réalisée dans un sac afin d’éviter toute dissémination péritonéale et la greffe d’implants trophoblastiques. La fermeture de la trompe n’est pas nécessaire.',
              'L’hémostase des berges peut être utile, par exemple avec une pince bipolaire fine. Une suture à l’aide de monocryl 3/0 est possible mais non obligatoire. En cas de saignement actif provenant du lit de la GEU, l’hémostase est souvent difficile : les tentatives répétées entraînent un risque important de lésions tubaires irréversibles. Dans ce contexte, une compression douce et des lavages au sérum physiologique chaud peuvent parfois suffire. En cas d’échec, il convient de recourir à un traitement radical, nécessaire dans environ 50 % des cas.',
              'Enfin, l’expression tubaire est à proscrire, y compris dans les avortements tubopéritonéaux, car elle augmente nettement le risque d’échec.',
            ],
            imageSrc: '/images/geu/salpingotomie-technique-detail.png',
            imageCaption: '',
            textStyle: {
              fontFamily: 'sans',
              color: 'primary',
              size: 'md',
              bold: false,
              italic: false,
            },
          },
          {
            id: 'geu-subsection-8',
            title: '',
            paragraphs: [
              'A noter que les données de la littérature sont insuffisantes pour émettre une recommandation concernant l’ajout d’une injection systématique de MTX lors de la réalisation d’une salpingotomie en comparaison à la réalisation d’une salpingectomie seule pour la diminuer la morbidité ultérieure.',
            ],
            textStyle: {
              fontFamily: 'serif',
              color: 'muted',
              size: 'sm',
              bold: false,
              italic: true,
            },
          },
        ],
      },
    ],
  },
  {
    id: 'guide-colpocleisis',
    kind: 'custom',
    title: 'Colpoclésis',
    category: 'Prolapsus génital',
    approach: 'Voie vaginale',
    intro:
      'Repères synthétiques pour la fermeture vaginale dans la prise en charge d’un prolapsus avancé.',
    sections: [
      {
        id: 'colpo-section-1',
        title: 'Principe général',
        subsections: [
          {
            id: 'colpo-subsection-1',
            title: '',
            paragraphs: [
              'Le geste consiste à réséquer la muqueuse vaginale des parois antérieure et postérieure, puis à suturer ces zones de résection l’une à l’autre afin de fusionner les parois et de fermer le vagin sur toute sa hauteur.',
              'Lors de la suture, deux gouttières latérales sont ménagées pour permettre l’extériorisation des sécrétions cervico-utérines.',
            ],
            textStyle: {
              fontFamily: 'sans',
              color: 'primary',
              size: 'md',
              bold: false,
              italic: false,
            },
          },
        ],
      },
      {
        id: 'colpo-section-2',
        title: 'Installation',
        subsections: [
          {
            id: 'colpo-subsection-2',
            title: '',
            paragraphs: [
              'L’intervention est habituellement réalisée sous anesthésie générale ou rachianesthésie, en position gynécologique.',
              'La vessie est vidée en début d’intervention ; cela peut être réalisé par sondage itératif au cours du geste ou par sonde à demeure selon les habitudes.',
              'Une antibioprophylaxie par céfazoline 2 g est recommandée.',
            ],
            textStyle: {
              fontFamily: 'sans',
              color: 'primary',
              size: 'md',
              bold: false,
              italic: false,
            },
          },
        ],
      },
      {
        id: 'colpo-section-3',
        title: 'Première étape : Colpectomie',
        subsections: [
          {
            id: 'colpo-subsection-3',
            title: '',
            paragraphs: [
              'Le col est saisi à la pince de Pozzi sur les berges antérieure et postérieure, afin d’extérioriser le prolapsus et d’exposer les parois vaginales.',
            ],
            bulletItems: [
              'Colpectomie antérieure : rectangle dont la limite inférieure est située à 3 cm au-dessus de l’orifice externe du col et la limite supérieure à 3 cm sous le méat urétral ; hauteur habituelle 5 à 6 cm.',
              'Colpectomie postérieure : rectangle de taille et forme similaires, s’étendant d’environ 3 cm sous l’orifice externe du col jusqu’à environ 3 cm de la fourchette vulvaire.',
            ],
            imageSrc:
              '/images/colpocleisis/colpectomie-premiere-etape.png',
            textStyle: {
              fontFamily: 'sans',
              color: 'primary',
              size: 'md',
              bold: false,
              italic: false,
            },
          },
          {
            id: 'colpo-subsection-4',
            title: '',
            paragraphs: [
              'Les dimensions sont adaptées au degré du prolapsus en conservant, de part et d’autre, une bande latérale de paroi vaginale d’environ 3 cm destinée à former les gouttières. La distance entre les parois latérales des deux rectangles doit rester d’au moins 1,5 cm pour permettre leur constitution.',
              'Une infiltration de lidocaïne adrénalinée 1 % au niveau des futures colpectomies facilite la dissection et limite le saignement.',
              'La colpectomie antérieure est réalisée au bistouri, avec une dissection plus aisée du col vers le méat urétral, et une hémostase sélective progressive. Le même geste est effectué en postérieur ; la dissection se fait au contact du cul-de-sac de Douglas et de la paroi antérieure du rectum, jusqu’à environ 3 cm de la fourchette.',
              'Les zones non réséquées constituent les deux bandes latérales. Un drain de Blake ou des crins de Florence peuvent être placés au contact de l’orifice externe du col pour matérialiser les gouttières.',
            ],
            textStyle: {
              fontFamily: 'sans',
              color: 'primary',
              size: 'md',
              bold: false,
              italic: false,
            },
          },
        ],
      },
      {
        id: 'colpo-section-4',
        title: 'Deuxième étape : Fermeture',
        subsections: [
          {
            id: 'colpo-subsection-5',
            title: 'Colporraphie antéro-postérieure',
            paragraphs: [
              'Points simples au Vicryl 2-0 rapprochant le bord inférieur du rectangle antérieur du bord supérieur du rectangle postérieur.',
              'La suture progresse surtout sur la largeur, de l’orifice externe du col vers les orifices des gouttières, en recouvrant le col et le prolapsus.',
            ],
            textStyle: {
              fontFamily: 'sans',
              color: 'primary',
              size: 'md',
              bold: false,
              italic: false,
            },
          },
          {
            id: 'colpo-subsection-5-image-1',
            title: '',
            paragraphs: [],
            imageSrc:
              '/images/colpocleisis/colporraphie-etape-1.png',
            textStyle: {
              fontFamily: 'sans',
              color: 'primary',
              size: 'md',
              bold: false,
              italic: false,
            },
          },
          {
            id: 'colpo-subsection-5-image-2',
            title: '',
            paragraphs: [],
            imageSrc:
              '/images/colpocleisis/colporraphie-etape-2.png',
            textStyle: {
              fontFamily: 'sans',
              color: 'primary',
              size: 'md',
              bold: false,
              italic: false,
            },
          },
          {
            id: 'colpo-subsection-6',
            title: 'Fermeture vaginale',
            paragraphs: [
              'Rapprochement des rectangles deux à deux par points simples ou surjet au Vicryl 2-0.',
              'La suture prend successivement le rectangle supérieur puis le côté homolatéral du rectangle inférieur, puis de même controlatéralement.',
              'Le serrage reloule la zone réséquée vers l’intérieur, réintègre le col et le prolapsus dans le bassin, puis permet l’accolement final des berges.',
              'En fin de geste, le vagin est totalement fermé.',
              'Des points simples peuvent être réalisés tous les 1 cm entre le fascia de Halban et le fascia pré-rectal pour renforcer le montage.',
            ],
            textStyle: {
              fontFamily: 'sans',
              color: 'primary',
              size: 'md',
              bold: false,
              italic: false,
            },
          },
          {
            id: 'colpo-subsection-6-image-1',
            title: '',
            paragraphs: [],
            imageSrc:
              '/images/colpocleisis/fermeture-vaginale-final.png',
            textStyle: {
              fontFamily: 'sans',
              color: 'primary',
              size: 'md',
              bold: false,
              italic: false,
            },
          },
        ],
      },
      {
        id: 'colpo-section-5',
        title: 'Suites opératoires',
        subsections: [
          {
            id: 'colpo-subsection-7',
            title: '',
            paragraphs: [
              'La sonde vésicale peut être retirée en post-opératoire immédiat ou maintenue jusqu’au lendemain, avec vérification de la reprise mictionnelle.',
              'Une mèche vaginale drainante peut être retirée le soir même ou le lendemain matin selon les habitudes du service.',
            ],
            textStyle: {
              fontFamily: 'sans',
              color: 'primary',
              size: 'md',
              bold: false,
              italic: false,
            },
          },
        ],
      },
    ],
  },
];

export function getChoiceLabel<T extends string>(
  options: ChoiceOption<T>[],
  value: T | null | undefined,
  fallback = 'Non renseigné'
) {
  if (!value) {
    return fallback;
  }

  return options.find((option) => option.value === value)?.label ?? fallback;
}

export function getProcedureChecklistTitle(
  procedure: InterventionType,
  customInterventions: SurgicalInterventionDefinition[] = []
) {
  const intervention = getSurgicalInterventionDefinition(
    procedure,
    customInterventions
  );

  return intervention
    ? `Checklist technique ${intervention.name.toLowerCase()}`
    : 'Checklist technique';
}

export function getInternalById(
  id: string | null | undefined,
  profiles: InternalProfile[] = internalProfiles
) {
  if (!id) {
    return null;
  }

  return profiles.find((profile) => profile.id === id) ?? null;
}

function getPrimarySalpingectomyInterventions(
  profileId: string,
  savedInterventions: SavedIntervention[]
) {
  return savedInterventions
    .filter(
      (intervention) =>
        intervention.internalId === profileId &&
        intervention.procedure === 'salpingectomie' &&
        intervention.role === 'operateur_principal'
    )
    .sort((left, right) => left.savedAt.localeCompare(right.savedAt));
}

function getPrimaryColpoclesisInterventions(
  profileId: string,
  savedInterventions: SavedIntervention[]
) {
  return savedInterventions
    .filter(
      (intervention) =>
        intervention.internalId === profileId &&
        intervention.procedure === 'colpoclesis' &&
        intervention.role === 'operateur_principal'
    )
    .sort((left, right) => left.savedAt.localeCompare(right.savedAt));
}

function getAllFourChecklistInterventions(
  profileId: string,
  savedInterventions: SavedIntervention[]
) {
  return savedInterventions
    .filter(
      (intervention) =>
        intervention.internalId === profileId &&
        intervention.procedure === 'salpingectomie' &&
        intervention.indication === 'geu'
    )
    .sort((left, right) => left.savedAt.localeCompare(right.savedAt));
}

function getColpoclesisChecklistInterventions(
  profileId: string,
  savedInterventions: SavedIntervention[]
) {
  return savedInterventions
    .filter(
      (intervention) =>
        intervention.internalId === profileId &&
        intervention.procedure === 'colpoclesis'
    )
    .sort((left, right) => left.savedAt.localeCompare(right.savedAt));
}

function buildSequentialProgressBadges<T extends BadgeMetricKey>({
  metricKey,
  milestones,
  currentCount,
  profile,
  awardedAtByTarget,
}: {
  metricKey: T;
  milestones: ReadonlyArray<{
    id: string;
    metricKey: T;
    title: string;
    tier: ProgressBadge['tier'];
    target: number;
    imageSrc: string;
  }>;
  currentCount: number;
  profile: InternalProfile;
  awardedAtByTarget?: Map<number, string>;
}) {
  const milestonesAscending = [...milestones].sort((left, right) => left.target - right.target);
  const badgesAscending: ProgressBadge[] = [];

  milestonesAscending.forEach((milestone, index) => {
    const earnedBadge =
      profile.achievementBadges?.find(
        (badge) =>
          badge.metricKey === milestone.metricKey && badge.target === milestone.target
      ) ?? null;
    const previousBadge = badgesAscending[index - 1];
    const isLocked = Boolean(previousBadge && !previousBadge.isEarned);
    const isEarned = !isLocked && currentCount >= milestone.target;
    const awardedAt =
      earnedBadge?.awardedAt ??
      (isEarned ? awardedAtByTarget?.get(milestone.target) ?? null : null);

    badgesAscending.push({
      ...milestone,
      current: currentCount,
      awardedAt,
      isEarned,
      isLocked,
      progressLabel: `${Math.min(currentCount, milestone.target)}/${milestone.target}`,
    });
  });

  return badgesAscending.sort((left, right) => right.target - left.target);
}

export function getProgressBadgesForInternal(
  profile: InternalProfile,
  savedInterventions: SavedIntervention[] = []
): ProgressBadge[] {
  const basePrimaryCount = profile.badgeMetrics?.primarySalpingectomyCount ?? 0;
  const primaryInterventions = getPrimarySalpingectomyInterventions(
    profile.id,
    savedInterventions
  );
  const currentPrimaryCount = basePrimaryCount + primaryInterventions.length;
  const baseColpocleisisCount = profile.badgeMetrics?.primaryColpocleisisCount ?? 0;
  const primaryColpoclesisInterventions = getPrimaryColpoclesisInterventions(
    profile.id,
    savedInterventions
  );
  const colpocleisisCount =
    baseColpocleisisCount + primaryColpoclesisInterventions.length;
  const checklistInterventions = getAllFourChecklistInterventions(
    profile.id,
    savedInterventions
  );
  const colpoclesisChecklistInterventions = getColpoclesisChecklistInterventions(
    profile.id,
    savedInterventions
  );
  const primaryAwardedAtByTarget = new Map<number, string>();
  const colpocleisisAwardedAtByTarget = new Map<number, string>();
  let runningPrimaryCount = basePrimaryCount;
  let runningColpocleisisCount = baseColpocleisisCount;

  for (const intervention of primaryInterventions) {
    runningPrimaryCount += 1;

    if (!primaryAwardedAtByTarget.has(1) && runningPrimaryCount >= 1) {
      primaryAwardedAtByTarget.set(1, intervention.savedAt);
    }

    if (!primaryAwardedAtByTarget.has(10) && runningPrimaryCount >= 10) {
      primaryAwardedAtByTarget.set(10, intervention.savedAt);
    }

    if (!primaryAwardedAtByTarget.has(20) && runningPrimaryCount >= 20) {
      primaryAwardedAtByTarget.set(20, intervention.savedAt);
    }
  }

  for (const intervention of primaryColpoclesisInterventions) {
    runningColpocleisisCount += 1;

    if (!colpocleisisAwardedAtByTarget.has(1) && runningColpocleisisCount >= 1) {
      colpocleisisAwardedAtByTarget.set(1, intervention.savedAt);
    }

    if (!colpocleisisAwardedAtByTarget.has(5) && runningColpocleisisCount >= 5) {
      colpocleisisAwardedAtByTarget.set(5, intervention.savedAt);
    }

    if (!colpocleisisAwardedAtByTarget.has(10) && runningColpocleisisCount >= 10) {
      colpocleisisAwardedAtByTarget.set(10, intervention.savedAt);
    }
  }

  const aceBadge: ProgressBadge = (() => {
    const aceMilestone = salpingectomyPrimaryBadgeMilestones[0];
    const earnedBadge =
      profile.achievementBadges?.find(
        (badge) =>
          badge.metricKey === aceMilestone.metricKey && badge.target === aceMilestone.target
      ) ?? null;
    const bestChecklistCount = checklistInterventions.reduce((bestCount, intervention) => {
      const applicableSteps = getChecklistStepsForIntervention(
        intervention.procedure,
        intervention.indication,
        intervention.approach,
        intervention.entryTechnique
      );
      const completedAtLevelFour = applicableSteps.reduce(
        (count, step) => count + (intervention.checklist[step.id] === '4' ? 1 : 0),
        0
      );

      return Math.max(bestCount, completedAtLevelFour);
    }, 0);
    const awardedIntervention = checklistInterventions.find((intervention) => {
      const applicableSteps = getChecklistStepsForIntervention(
        intervention.procedure,
        intervention.indication,
        intervention.approach,
        intervention.entryTechnique
      );

      return (
        applicableSteps.length > 0 &&
        applicableSteps.every((step) => intervention.checklist[step.id] === '4')
      );
    });

    return {
      ...aceMilestone,
      current: bestChecklistCount,
      awardedAt: earnedBadge?.awardedAt ?? awardedIntervention?.savedAt ?? null,
      isEarned:
        bestChecklistCount >= aceMilestone.target ||
        earnedBadge !== null ||
        Boolean(awardedIntervention),
      isBinary: true,
      progressLabel: `${bestChecklistCount}/${aceMilestone.target}`,
    };
  })();

  const colpocleisisAceBadge: ProgressBadge = (() => {
    const earnedBadge =
      profile.achievementBadges?.find(
        (badge) =>
          badge.metricKey === colpocleisisAceMilestone.metricKey &&
          badge.target === colpocleisisAceMilestone.target
      ) ?? null;
    const bestChecklistCount = colpoclesisChecklistInterventions.reduce(
      (bestCount, intervention) => {
        const completedAtLevelFour = colpoclesisChecklistSteps.reduce(
          (count, step) => count + (intervention.checklist[step.id] === '4' ? 1 : 0),
          0
        );

        return Math.max(bestCount, completedAtLevelFour);
      },
      0
    );
    const awardedIntervention = colpoclesisChecklistInterventions.find((intervention) =>
      colpoclesisChecklistSteps.every((step) => intervention.checklist[step.id] === '4')
    );

    return {
      ...colpocleisisAceMilestone,
      current: bestChecklistCount,
      awardedAt: earnedBadge?.awardedAt ?? awardedIntervention?.savedAt ?? null,
      isEarned:
        bestChecklistCount >= colpocleisisAceMilestone.target ||
        earnedBadge !== null ||
        Boolean(awardedIntervention),
      isBinary: true,
      progressLabel: `${bestChecklistCount}/${colpocleisisAceMilestone.target}`,
    };
  })();

  const salpingectomyPrimaryBadges = buildSequentialProgressBadges({
    metricKey: 'primary_salpingectomy',
    milestones: salpingectomyPrimaryBadgeMilestones.filter(
      (milestone) => milestone.metricKey === 'primary_salpingectomy'
    ),
    currentCount: currentPrimaryCount,
    profile,
    awardedAtByTarget: primaryAwardedAtByTarget,
  });

  const colpocleisisPrimaryBadges = buildSequentialProgressBadges({
    metricKey: 'primary_colpocleisis',
    milestones: colpocleisisPrimaryBadgeMilestones,
    currentCount: colpocleisisCount,
    profile,
    awardedAtByTarget: colpocleisisAwardedAtByTarget,
  });

  return [
    aceBadge,
    colpocleisisAceBadge,
    ...salpingectomyPrimaryBadges,
    ...colpocleisisPrimaryBadges,
  ];
}

export function normalizeCredentialValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function getInternalByCredentials(
  loginId: string,
  password: string,
  profiles: InternalProfile[] = internalProfiles
) {
  const normalizedLoginId = normalizeCredentialValue(loginId);
  const normalizedPassword = normalizeCredentialValue(password);

  return (
    profiles.find(
      (profile) =>
        normalizeCredentialValue(profile.loginId) === normalizedLoginId &&
        normalizeCredentialValue(profile.password) === normalizedPassword
    ) ?? null
  );
}

export function isAdminCredentials(loginId: string, password: string) {
  const normalizedLoginId = normalizeCredentialValue(loginId);
  const normalizedPassword = normalizeCredentialValue(password);

  return normalizedLoginId === 'admin' && normalizedPassword === 'admin';
}

export function getSeniorById(id: string | null | undefined) {
  if (!id) {
    return null;
  }

  return seniors.find((senior) => senior.id === id) ?? null;
}
