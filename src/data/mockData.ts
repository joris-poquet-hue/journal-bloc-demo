import {
  AdminInterventionEvaluation,
  ChecklistLevel,
  ChecklistStep,
  ChoiceOption,
  Complexity,
  EntryTechnique,
  GlobalRole,
  Indication,
  InternalProfile,
  InterventionType,
  Laterality,
  SavedIntervention,
  Senior,
  SurgicalApproach,
  SurgicalInterventionDefinition,
  SurgeryContext,
  TechniqueGuide,
} from '../types';
import { ensureSurgicalInterventionDefinitionShape } from '../utils/surgicalInterventions';

export const ADMIN_LOGIN_ID = 'adminbeta';

export const internalProfiles: InternalProfile[] = [];

export const seniors: Senior[] = [];

export const selectableSeniors: Senior[] = [
  ...seniors,
  {
    id: 'sen-other',
    firstName: 'Autre',
    institution: '',
    lastName: '',
  },
];

export function getSelectableSeniors(customSeniors: Senior[] = []) {
  const mergedSeniors = [...customSeniors, ...seniors].reduce<Senior[]>(
    (accumulator, senior) => {
      if (accumulator.some((item) => item.id === senior.id)) {
        return accumulator;
      }

      accumulator.push(senior);
      return accumulator;
    },
    []
  );

  return [
    ...mergedSeniors,
    {
      id: 'sen-other',
      firstName: 'Autre',
      institution: '',
      lastName: '',
    },
  ];
}

export const procedureOptions: ChoiceOption<InterventionType>[] = [];

export const indicationOptions: ChoiceOption<Indication>[] = [
  { value: 'geu', label: 'GEU' },
  { value: 'ligature_tubaire', label: 'Ligature tubaire' },
  { value: 'autre', label: 'Autre' },
];

export const approachOptions: ChoiceOption<SurgicalApproach>[] = [
  { value: 'coelioscopie', label: 'Cœlioscopie' },
  { value: 'hysteroscopie', label: 'Hystéroscopie' },
  { value: 'laparotomie', label: 'Laparotomie' },
  { value: 'robot', label: 'Robot' },
  { value: 'voie_vaginale', label: 'Voie vaginale' },
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

export const surgeryContextOptions: ChoiceOption<SurgeryContext>[] = [
  { value: 'programme', label: 'Bloc programmé' },
  { value: 'urgence', label: 'Urgence' },
];

export function formatSurgeryContext(
  context: SurgeryContext | null,
  fallback = 'Non renseigné'
) {
  return getChoiceLabel(surgeryContextOptions, context, fallback);
}

export function formatDisplayName(firstName: string, lastName: string) {
  return [firstName, lastName].filter((value) => value.trim().length > 0).join(' ');
}

export function formatSeniorDisplayName(senior: Senior) {
  if (senior.id === 'sen-other') {
    return 'Autre';
  }

  if (senior.isCustom) {
    const lastName = senior.lastName.trim();
    const fallbackName = formatDisplayName(senior.firstName, senior.lastName);

    return lastName.length > 0 ? `Dr ${lastName}` : fallbackName;
  }

  return formatDisplayName(senior.firstName, senior.lastName);
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
  {
    id: 'step-3',
    label: 'Voie d’abord du pneumopéritoine',
    applicableApproaches: ['coelioscopie', 'robot', 'vnotes'],
  },
  {
    id: 'step-4',
    label: 'Mise en place des trocarts',
    applicableApproaches: ['coelioscopie', 'robot'],
  },
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
  {
    id: 'step-11',
    label: 'Mise en sac et extraction de la pièce opératoire',
    applicableApproaches: ['coelioscopie', 'robot'],
  },
  { id: 'step-12', label: 'Contrôle de l’hémostase' },
  {
    id: 'step-13',
    label: 'Exsufflation et retrait des trocarts',
    applicableApproaches: ['coelioscopie', 'robot'],
  },
  { id: 'step-14', label: 'Fermeture de la voie d’abord' },
  { id: 'step-15', label: 'Fermeture cutanée' },
];

export const allChecklistSteps: ChecklistStep[] = [
  ...salpingectomyChecklistSteps,
];

const nativeSurgicalInterventions: SurgicalInterventionDefinition[] = [
  {
    id: 'salpingectomie',
    name: 'Salpingectomie',
    indications: ['geu', 'ligature_tubaire'],
    indicationOptions: [
      {
        id: 'native-salpingectomie-geu',
        label: 'Grossesse extra-utérine',
        active: true,
        isDefault: true,
      },
      {
        id: 'native-salpingectomie-ligature',
        label: 'Ligature tubaire',
        active: true,
      },
      {
        id: 'native-salpingectomie-autre',
        label: 'Autre',
        active: true,
        isOther: true,
      },
    ],
    allowedApproaches: ['coelioscopie', 'laparotomie', 'voie_vaginale', 'vnotes'],
    allowedEntryTechniques: ['trocart_direct', 'open', 'veress'],
    requiresLaterality: true,
    checklistSteps: salpingectomyChecklistSteps,
    keyStepIds: [
      'step-3',
      'step-4',
      'step-5',
      'step-7',
      'step-9',
      'step-10',
      'step-12',
    ],
    status: 'active',
    lateralityMode: 'right_left_bilateral',
    isCustom: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

export function getSurgicalInterventionDefinitions(
  customInterventions: SurgicalInterventionDefinition[] = []
) {
  const definitionsById = new Map<InterventionType, SurgicalInterventionDefinition>();
  const definitionIdByName = new Map<string, InterventionType>();

  [...nativeSurgicalInterventions, ...customInterventions].forEach((intervention) => {
    const normalizedIntervention =
      ensureSurgicalInterventionDefinitionShape(intervention);
    const nameKey = normalizeProcedureOptionName(normalizedIntervention.name);
    const existingId = nameKey ? definitionIdByName.get(nameKey) : undefined;
    const existingDefinition = existingId
      ? definitionsById.get(existingId)
      : undefined;

    if (
      existingDefinition &&
      existingDefinition.id !== normalizedIntervention.id
    ) {
      const shouldReplaceExisting =
        normalizedIntervention.isCustom && !existingDefinition.isCustom;

      if (!shouldReplaceExisting) {
        return;
      }

      definitionsById.delete(existingDefinition.id);
    }

    definitionsById.set(normalizedIntervention.id, normalizedIntervention);

    if (nameKey) {
      definitionIdByName.set(nameKey, normalizedIntervention.id);
    }
  });

  return Array.from(definitionsById.values());
}

function normalizeProcedureOptionName(name: string) {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('fr-FR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function getProcedureOptions(
  customInterventions: SurgicalInterventionDefinition[] = []
): ChoiceOption<InterventionType>[] {
  const optionsByName = new Map<string, ChoiceOption<InterventionType>>();

  getSurgicalInterventionDefinitions(customInterventions).forEach((intervention) => {
    const normalizedName = normalizeProcedureOptionName(intervention.name);
    const optionKey = normalizedName || intervention.id;

    if (optionsByName.has(optionKey)) {
      return;
    }

    optionsByName.set(optionKey, {
      value: intervention.id,
      label: intervention.name,
    });
  });

  return Array.from(optionsByName.values());
}

export function getProcedureLabel(
  procedure: InterventionType | null | undefined,
  customInterventions: SurgicalInterventionDefinition[] = [],
  fallback = 'Non renseigné'
) {
  if (!procedure) {
    return fallback;
  }

  const definition = getSurgicalInterventionDefinition(
    procedure,
    customInterventions
  );

  return definition?.name.trim() || fallback;
}

export function getSurgicalInterventionDefinition(
  procedure: InterventionType | null,
  customInterventions: SurgicalInterventionDefinition[] = []
) {
  if (!procedure) {
    return undefined;
  }

  return getSurgicalInterventionDefinitions(customInterventions).find(
    (intervention) => intervention.id === procedure
  );
}

export function getChecklistStepsForIntervention(
  procedure: InterventionType | null,
  indication: Indication | null,
  approach?: SurgicalApproach | null,
  entryTechnique?: EntryTechnique | null,
  customInterventions: SurgicalInterventionDefinition[] = []
) {
  if (!procedure) {
    return [];
  }

  const customIntervention = customInterventions.find(
    (intervention) => intervention.id === procedure
  );

  if (customIntervention) {
    const normalizedIntervention =
      ensureSurgicalInterventionDefinitionShape(customIntervention);
    const matchingApproachConfig =
      normalizedIntervention.approachConfigs?.find(
        (config) => config.active && config.approach === approach
      ) ?? null;

    if (matchingApproachConfig) {
      return [...matchingApproachConfig.steps]
        .sort((left, right) => left.order - right.order)
        .map((step) => ({
          id: step.id,
          label: step.label,
          applicableApproaches: [matchingApproachConfig.approach],
        }));
    }

    return normalizedIntervention.checklistSteps.filter((step) => {
      const applicableApproaches = step.applicableApproaches ?? [];

      return (
        applicableApproaches.length === 0 ||
        (approach != null && applicableApproaches.includes(approach))
      );
    });
  }

  if (
    procedure === 'salpingectomie' &&
    (indication === 'geu' || indication === 'ligature_tubaire')
  ) {
    return salpingectomyChecklistSteps.filter((step) => {
      if (
        step.id === 'step-3' &&
        !['coelioscopie', 'robot', 'vnotes'].includes(approach ?? '')
      ) {
        return false;
      }

      if (
        ['step-4', 'step-11', 'step-13'].includes(step.id) &&
        !['coelioscopie', 'robot'].includes(approach ?? '')
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

  return [];
}

export function getHistoricalChecklistSteps(
  intervention: SavedIntervention,
  fallbackDefinitions: SurgicalInterventionDefinition[] = []
) {
  const snapshotSteps =
    intervention.definitionSnapshot?.applicableChecklistSteps ?? [];

  if (snapshotSteps.length > 0) {
    return [...snapshotSteps].sort((left, right) => left.order - right.order);
  }

  return getChecklistStepsForIntervention(
    intervention.procedure,
    intervention.indication,
    intervention.approach,
    intervention.entryTechnique,
    fallbackDefinitions
  );
}

export function getHistoricalProcedureLabel(
  intervention: SavedIntervention,
  fallbackDefinitions: SurgicalInterventionDefinition[] = [],
  fallback = 'Non renseigné'
) {
  return (
    intervention.definitionSnapshot?.source.name?.trim() ||
    getProcedureLabel(intervention.procedure, fallbackDefinitions, fallback)
  );
}

export function hydrateAdminInterventionEvaluations(
  evaluations: Record<string, AdminInterventionEvaluation> = {}
) {
  return Object.fromEntries(
    Object.entries(evaluations).map(([interventionId, evaluation]) => [
      interventionId,
      {
        ...evaluation,
        seniorComment: evaluation.seniorComment ?? '',
      },
    ])
  ) as Record<string, AdminInterventionEvaluation>;
}

export const techniqueGuides: TechniqueGuide[] = [
  {
    id: 'guide-geu',
    kind: 'geu',
    title: 'Prise en charge chirurgicale d’une GEU',
    category: 'Chirurgie gynécologique',
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
    title: 'Colpocléisis',
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
            imageSrc: '/images/colpocleisis/colpectomie-premiere-etape.png',
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
            imageSrc: '/images/colpocleisis/colporraphie-etape-1.png',
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
            imageSrc: '/images/colpocleisis/colporraphie-etape-2.png',
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
            imageSrc: '/images/colpocleisis/fermeture-vaginale-final.png',
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

export function normalizeCredentialValue(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function getSeniorById(
  id: string | null | undefined,
  customSeniors: Senior[] = []
) {
  if (!id) {
    return null;
  }

  return getSelectableSeniors(customSeniors).find((senior) => senior.id === id) ?? null;
}
