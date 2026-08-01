import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';
import { Children, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import {
  BarChart3,
  Bold,
  BookOpen,
  BriefcaseMedical,
  Camera,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock3,
  ClipboardList,
  Eye,
  FileSpreadsheet,
  GraduationCap,
  Gauge,
  Home,
  Highlighter,
  Info,
  List,
  ListOrdered,
  LockKeyhole,
  LogOut,
  MessageCircle,
  NotebookPen,
  NotebookTabs,
  Plus,
  Signpost,
  Sparkles,
  Stethoscope,
  Trash2,
  Trophy,
  Underline,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react-native';
import { buildSupportMailto } from './supportConfig';
import {
  ActivityIndicator,
  Animated,
  AppState,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  type ImageSourcePropType,
  type ImageStyle,
  type NativeSyntheticEvent,
  type TextInputSelectionChangeEventData,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

type SessionRole = 'internal' | 'senior' | 'admin';

type AuthSession = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: {
    id: string;
    email?: string;
  };
};

type ProfileRow = {
  avatar_image_src: string | null;
  current_rotation: string | null;
  first_name: string;
  id: string;
  last_name: string;
  login_id: string;
  promotion: string | null;
  role: SessionRole;
  semester: string | null;
};

type Profile = {
  avatarImageSrc: string | null;
  currentRotation: string | null;
  firstName: string;
  id: string;
  lastName: string;
  loginId: string;
  promotion: string | null;
  role: SessionRole;
  semester: string | null;
};

type SeniorProfileRow = {
  first_name: string;
  id: string;
  last_name: string;
};

type SeniorProfile = {
  firstName: string;
  id: string;
  lastName: string;
};

type InternalProfileSummaryRow = {
  current_rotation: string | null;
  first_name: string;
  id: string;
  last_name: string;
  semester: string | null;
};

type InternalProfileSummary = {
  currentRotation: string | null;
  firstName: string;
  id: string;
  lastName: string;
  semester: string | null;
};

type DashboardSummary = {
  activity: number;
  interventions: number;
  profiles: number;
  trophies: number;
};

type MobileScreen =
  | 'checklist'
  | 'dashboard'
  | 'guides'
  | 'history'
  | 'new-intervention'
  | 'notebook'
  | 'profile'
  | 'senior-evaluation'
  | 'summary'
  | 'trophies';

type ChecklistLevel = 'NA' | '0' | '1' | '2' | '3' | '4';
type AdminPerformanceRating = '1' | '2' | '3' | '4' | '5';
type AdminCategoryDifficultyRating = '1' | '2' | '3';

type ChecklistStep = {
  applicableApproaches?: string[];
  id: string;
  label: string;
};

type DefinitionChoiceOption = {
  label: string;
  value: string;
};

type NotebookDocumentRow = {
  content_html: string;
  profile_id: string;
  updated_at: string;
};

type NotebookDocument = {
  contentHtml: string;
  profileId: string;
  updatedAt: string;
};

type TrophyDefinitionRow = {
  definition: unknown;
  id: string;
  status: string;
  title: string;
};

type TrophyImageSet = {
  bronze: string | null;
  diamond: string | null;
  gold: string | null;
  silver: string | null;
  single: string | null;
};

type BadgeTier = 'bronze' | 'silver' | 'gold' | 'diamond';
type TrophyFormat = 'unique' | 'levels';
type TrophyStatus = 'draft' | 'active' | 'inactive';
type TrophyTrackedStatus = 'recorded' | 'evaluated';
type TrophyVisibility = 'visible' | 'surprise';
type TrophyConditionType =
  | 'approach_count'
  | 'average_autonomy'
  | 'cross_procedure_autonomy'
  | 'distinct_procedures'
  | 'first_recorded'
  | 'intervention_status'
  | 'procedure_count'
  | 'recording_time_range'
  | 'role'
  | 'total_evaluated'
  | 'total_recorded';

type TrophyCondition = {
  approach: string;
  autonomyMin: number | null;
  distinctProcedureCount: number | null;
  endHour: string;
  id: string;
  interventionStatus: 'evaluated' | 'pending' | '';
  minEvaluatedPerProcedure: number | null;
  procedure: string;
  role: string;
  startHour: string;
  threshold: number | null;
  trackedStatus: TrophyTrackedStatus;
  type: TrophyConditionType;
};

type TrophyLevelDefinition = {
  autonomyMin: number | null;
  imageSrc: string | null;
  label: string;
  threshold: number | null;
  tier: BadgeTier;
  trackedStatus: TrophyTrackedStatus;
};

type TrophyDefinition = {
  associatedApproach: string;
  associatedIndication: string;
  associatedProcedure: string;
  conditions: TrophyCondition[];
  description: string;
  format: TrophyFormat;
  id: string;
  images: TrophyImageSet;
  levels: TrophyLevelDefinition[];
  operativeScope: 'procedure' | 'approach';
  status: TrophyStatus;
  title: string;
  trackedInterventionStatus: TrophyTrackedStatus;
  trackedRole: string;
  visibility: TrophyVisibility;
};

type TrophyAwardRow = {
  awarded_at: string;
  id: string;
  profile_id: string;
  tier: string | null;
  trophy_id: string;
};

type TrophyAward = {
  awardedAt: string;
  id: string;
  profileId: string;
  tier: string | null;
  trophyId: string;
};

type SurgicalDefinitionRow = {
  definition: unknown;
  id: string;
  name: string;
  status: string;
};

type SurgicalDefinition = {
  allowedApproaches: string[];
  allowedEntryTechniques: string[];
  approachSteps: Record<string, ChecklistStep[]>;
  checklistSteps: ChecklistStep[];
  id: string;
  indicationOptions: DefinitionChoiceOption[];
  indications: string[];
  isCustom: boolean;
  keyStepIds: string[];
  name: string;
  requiresLaterality: boolean;
};

type RecentInterventionRow = {
  approach: string | null;
  autonomy_score: number | null;
  checklist: unknown;
  complexity: number | null;
  custom_indication: string | null;
  entry_technique: string | null;
  id: string;
  indication: string | null;
  indication_comment: string | null;
  internal_profile_id: string;
  intervention_date: string;
  laterality: string | null;
  procedure_id: string;
  role: string | null;
  saved_at: string;
  senior_profile_id: string | null;
  surgery_context: string | null;
};

type RecentIntervention = {
  approach: string | null;
  autonomyScore: number | null;
  checklist: Record<string, ChecklistLevel | null>;
  complexity: number | null;
  customIndication: string | null;
  date: string;
  entryTechnique: string | null;
  id: string;
  indication: string | null;
  indicationComment: string;
  internalProfileId: string;
  laterality: string | null;
  procedureId: string;
  procedureName: string;
  role: string | null;
  savedAt: string;
  seniorProfileId: string | null;
  surgeryContext: string | null;
};

type InterventionDraft = {
  approach: string | null;
  checklist: Record<string, ChecklistLevel | null>;
  complexity: number | null;
  customIndication: string;
  date: string;
  entryTechnique: string | null;
  indication: string | null;
  laterality: string | null;
  note: string;
  procedureId: string;
  role: string | null;
  seniorProfileId: string | null;
};

type InterventionEvaluationRow = {
  category_difficulty: AdminCategoryDifficultyRating | null;
  global_performance: AdminPerformanceRating | null;
  intervention_id: string;
  senior_comment: string;
  senior_profile_id: string | null;
  updated_at: string | null;
};

type InterventionEvaluation = {
  categoryDifficulty: AdminCategoryDifficultyRating | null;
  globalPerformance: AdminPerformanceRating | null;
  interventionId: string;
  seniorComment: string;
  seniorProfileId: string | null;
  updatedAt: string | null;
};

type SeniorEvaluationDraft = {
  categoryDifficulty: AdminCategoryDifficultyRating | null;
  globalPerformance: AdminPerformanceRating | null;
  seniorComment: string;
};

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const WEB_APP_ORIGIN = process.env.EXPO_PUBLIC_MONJDB_WEB_URL ?? 'https://www.monjournaldebloc.fr';
const MONJDB_LOGO = require('./assets/monjdb-logo-vertical.png');
const STORED_SESSION_KEY = 'monjdb.supabase_session.v1';
const APPROACH_ICON_SOURCES = {
  coelioscopie: require('./assets/approaches/icone_coelio.png'),
  hysteroscopie: require('./assets/approaches/icone_hystero.png'),
  laparotomie: require('./assets/approaches/icone_laparo.png'),
  robot: require('./assets/approaches/icone_robot.png'),
  voie_vaginale: require('./assets/approaches/icone_vb.png'),
  vnotes: require('./assets/approaches/icone_vN.png'),
};

const GUIDE_IMAGE_SOURCES = {
  '/images/geu/anatomie-geu.png': require('./assets/guides/geu/anatomie-geu.png'),
  '/images/geu/anatomie-legendee-geu.png': require('./assets/guides/geu/anatomie-legendee-geu.png'),
  '/images/geu/geu-distension-tubaire.png': require('./assets/guides/geu/geu-distension-tubaire.png'),
  '/images/geu/hematosalpinx-trophoblaste.png': require('./assets/guides/geu/hematosalpinx-trophoblaste.png'),
  '/images/geu/salpingectomie-trace.png': require('./assets/guides/geu/salpingectomie-trace.png'),
  '/images/geu/salpingectomie-technique-detail.png': require('./assets/guides/geu/salpingectomie-technique-detail.png'),
  '/images/geu/salpingotomie-temps.png': require('./assets/guides/geu/salpingotomie-temps.png'),
  '/images/geu/salpingotomie-technique-detail.png': require('./assets/guides/geu/salpingotomie-technique-detail.png'),
  '/images/colpocleisis/colpectomie-premiere-etape.png': require('./assets/guides/colpocleisis/colpectomie-premiere-etape.png'),
  '/images/colpocleisis/colporraphie-etape-1.png': require('./assets/guides/colpocleisis/colporraphie-etape-1.png'),
  '/images/colpocleisis/colporraphie-etape-2.png': require('./assets/guides/colpocleisis/colporraphie-etape-2.png'),
  '/images/colpocleisis/fermeture-vaginale-final.png': require('./assets/guides/colpocleisis/fermeture-vaginale-final.png'),
};

const BADGE_IMAGE_SOURCES = {
  '/images/badges/colpocleisis-as.png': require('./assets/badges/colpocleisis-as.png'),
  '/images/badges/colpocleisis-operateur-principal-1.png': require('./assets/badges/colpocleisis-operateur-principal-1.png'),
  '/images/badges/colpocleisis-operateur-principal-5.png': require('./assets/badges/colpocleisis-operateur-principal-5.png'),
  '/images/badges/colpocleisis-operateur-principal-10.png': require('./assets/badges/colpocleisis-operateur-principal-10.png'),
  '/images/badges/salpingectomie-as.png': require('./assets/badges/salpingectomie-as.png'),
  '/images/badges/salpingectomie-operateur-principal-1.png': require('./assets/badges/salpingectomie-operateur-principal-1.png'),
  '/images/badges/salpingectomie-operateur-principal-10.png': require('./assets/badges/salpingectomie-operateur-principal-10.png'),
  '/images/badges/salpingectomie-operateur-principal-20.png': require('./assets/badges/salpingectomie-operateur-principal-20.png'),
};

type MobileGuideSubsection = {
  bulletItems?: string[];
  eyebrow?: string;
  id: string;
  imageCaption?: string;
  imageSrc?: keyof typeof GUIDE_IMAGE_SOURCES;
  paragraphs: string[];
  title?: string;
};

type MobileGuideSection = {
  id: string;
  subsections: MobileGuideSubsection[];
  title: string;
};

type MobileTechniqueGuide = {
  approach: string;
  category: string;
  id: string;
  intro: string;
  sections: MobileGuideSection[];
  title: string;
};

const MOBILE_TECHNIQUE_GUIDES: MobileTechniqueGuide[] = [
  {
    approach: 'Cœlioscopie en première intention',
    category: 'Chirurgie gynécologique',
    id: 'guide-geu',
    intro:
      'Repères pratiques pour préparer un bloc de grossesse extra-utérine tubaire et choisir un geste cohérent avec l’état de la trompe, l’hémostase et le projet reproductif.',
    title: 'Prise en charge chirurgicale d’une GEU',
    sections: [
      {
        id: 'geu-section-1',
        title: 'Rappels anatomiques',
        subsections: [
          {
            id: 'geu-subsection-1',
            imageSrc: '/images/geu/anatomie-legendee-geu.png',
            paragraphs: [
              '1. Arcade infratubaire. 2. Artère tubaire médiale. 3. Ligament utéro-ovarien. 4. Artère utérine. 5. Artère tubaire latérale. 6. ligament infundibulo-ovarien. 7. artère ovarique. 8. ligament lombo-ovarien. U. utérus. O. ovaire. T. trompe. M. mésosalpinx. ①. Jonction interstitielle. ②. Isthme de la trompe. ③. Ampoule tubaire. ④. Infundibulum.',
            ],
          },
        ],
      },
      {
        id: 'geu-section-2',
        title: 'Salpingectomie vs Salpingotomie',
        subsections: [
          {
            id: 'geu-subsection-2',
            paragraphs: [
              'La salpingotomie (« césarienne tubaire ») permet de conserver une chance de grossesse avec la trompe concernée. Actuellement, les recommandations prônent une décision individualisée : conserver la trompe si elle est peu altérée et si la controlatérale est compromise ; réaliser une salpingectomie si la trompe est très endommagée, si la controlatérale est saine, ou en l’absence de désir de grossesse.',
            ],
          },
          {
            eyebrow: 'Littérature',
            id: 'geu-subsection-3',
            paragraphs: [
              'La salpingotomie conserve la trompe avec un risque de récidive légèrement plus élevé (8 %) que la salpingectomie (5 %). La décision dépend du projet de grossesse, des antécédents et de l’état des trompes (Mol, Femke et al. “The ESEP study: salpingostomy versus salpingectomy for tubal ectopic pregnancy; the impact on future fertility: a randomised controlled trial.” BMC women’s health vol. 8 11. 26 Jun. 2008, doi:10.1186/1472-6874-8-11).',
              'Aucune différence significative entre la salpingotomie et la salpingectomie en termes de durée opératoire ou d’hospitalisation, mais la salpingotomie entraîne un volume de saignement opératoire moindre (Wenjing, Lin, and Li Haibo. “Therapeutic effect of laparoscopic salpingotomy vs. salpingectomy on patients with ectopic pregnancy: A systematic review and meta-analysis.” Frontiers in surgery vol. 9 997490. 11 Oct. 2022, doi:10.3389/fsurg.2022.997490).',
            ],
          },
        ],
      },
      {
        id: 'geu-section-3',
        title: 'Salpingectomie',
        subsections: [
          {
            id: 'geu-subsection-4',
            imageSrc: '/images/geu/salpingectomie-technique-detail.png',
            paragraphs: [
              'Elle repose sur un principe de coagulation-section depuis l’infudibulum vers la jonction interstitielle. Le principal risque de la salpingectomie laparoscopique est la dévascularisation ovarienne. Il convient toujours de rester au ras de la trompe, à distance de l’arcade ovarienne et du ligament lombo-ovarien en utilisant une coagulation bipolaire.',
              'Il est important de ne pas induire de pathologie du moignon tubaire, ce qui implique une coagulation de la portion interstitielle au ras de l’utérus. Ce geste limite également le risque de GEU ultérieure soit au niveau interstitiel, soit au niveau du moignon restant. Le moignon tubaire utérin, soigneusement coagulé, doit être suffisamment long pour éviter une reperméabilisation tubaire spontanée, à l’origine d’une fistule utéropéritonéale.',
            ],
          },
        ],
      },
      {
        id: 'geu-section-4',
        title: 'Salpingotomie',
        subsections: [
          {
            id: 'geu-subsection-5',
            paragraphs: ['Elle répond à trois principes généraux :'],
          },
          {
            bulletItems: [
              'Ne pas traumatiser la trompe.',
              'Réaliser l’incision au niveau du bord anti-mésial.',
              'Se souvenir que la GEU est proximale et que l’hématosalpinx est distal.',
            ],
            id: 'geu-subsection-6',
            paragraphs: [],
          },
          {
            id: 'geu-subsection-7',
            imageSrc: '/images/geu/salpingotomie-technique-detail.png',
            paragraphs: [
              'La grossesse extra-utérine se développe dans l’épaisseur de la paroi tubaire, et non dans sa lumière. Il faut garder à l’esprit que la GEU est située en position proximale, tandis que l’hématosalpinx est distal.',
              'La trompe est saisie au niveau de son bord anti-mésial à l’aide d’une pince fine atraumatique. Une incision longitudinale est pratiquée sur 1 à 2 cm en fonction de la taille de la GEU, à la partie proximale de la voussure repérée. Une incision trop distale expose au risque de laisser persister du trophoblaste. L’ouverture est franche, réalisée à la pointe monopolaire en courant de section, jusqu’à apparition du trophoblaste ou de l’hématosalpinx.',
              'L’extraction se fait le plus souvent par aspiration. Une canule de lavage-aspiration de 10 mm est introduite dans la trompe : l’instillation de sérum décolle le trophoblaste et les caillots intratubaires, ensuite aspirés par mouvements de retrait et de rotation. L’extraction peut aussi être réalisée à la pince. Si celui-ci n’est pas entièrement aspiré, son extraction doit être réalisée dans un sac afin d’éviter toute dissémination péritonéale et la greffe d’implants trophoblastiques. La fermeture de la trompe n’est pas nécessaire.',
              'L’hémostase des berges peut être utile, par exemple avec une pince bipolaire fine. Une suture à l’aide de monocryl 3/0 est possible mais non obligatoire. En cas de saignement actif provenant du lit de la GEU, l’hémostase est souvent difficile : les tentatives répétées entraînent un risque important de lésions tubaires irréversibles. Dans ce contexte, une compression douce et des lavages au sérum physiologique chaud peuvent parfois suffire. En cas d’échec, il convient de recourir à un traitement radical, nécessaire dans environ 50 % des cas.',
              'Enfin, l’expression tubaire est à proscrire, y compris dans les avortements tubopéritonéaux, car elle augmente nettement le risque d’échec.',
            ],
          },
          {
            id: 'geu-subsection-8',
            paragraphs: [
              'A noter que les données de la littérature sont insuffisantes pour émettre une recommandation concernant l’ajout d’une injection systématique de MTX lors de la réalisation d’une salpingotomie en comparaison à la réalisation d’une salpingectomie seule pour la diminuer la morbidité ultérieure.',
            ],
          },
        ],
      },
    ],
  },
  {
    approach: 'Voie vaginale',
    category: 'Prolapsus génital',
    id: 'guide-colpocleisis',
    intro:
      'Repères synthétiques pour la fermeture vaginale dans la prise en charge d’un prolapsus avancé.',
    title: 'Colpoclésis',
    sections: [
      {
        id: 'colpo-section-1',
        title: 'Principe général',
        subsections: [
          {
            id: 'colpo-subsection-1',
            paragraphs: [
              'Le geste consiste à réséquer la muqueuse vaginale des parois antérieure et postérieure, puis à suturer ces zones de résection l’une à l’autre afin de fusionner les parois et de fermer le vagin sur toute sa hauteur.',
              'Lors de la suture, deux gouttières latérales sont ménagées pour permettre l’extériorisation des sécrétions cervico-utérines.',
            ],
          },
        ],
      },
      {
        id: 'colpo-section-2',
        title: 'Installation',
        subsections: [
          {
            id: 'colpo-subsection-2',
            paragraphs: [
              'L’intervention est habituellement réalisée sous anesthésie générale ou rachianesthésie, en position gynécologique.',
              'La vessie est vidée en début d’intervention ; cela peut être réalisé par sondage itératif au cours du geste ou par sonde à demeure selon les habitudes.',
              'Une antibioprophylaxie par céfazoline 2 g est recommandée.',
            ],
          },
        ],
      },
      {
        id: 'colpo-section-3',
        title: 'Première étape : Colpectomie',
        subsections: [
          {
            bulletItems: [
              'Colpectomie antérieure : rectangle dont la limite inférieure est située à 3 cm au-dessus de l’orifice externe du col et la limite supérieure à 3 cm sous le méat urétral ; hauteur habituelle 5 à 6 cm.',
              'Colpectomie postérieure : rectangle de taille et forme similaires, s’étendant d’environ 3 cm sous l’orifice externe du col jusqu’à environ 3 cm de la fourchette vulvaire.',
            ],
            id: 'colpo-subsection-3',
            imageSrc: '/images/colpocleisis/colpectomie-premiere-etape.png',
            paragraphs: [
              'Le col est saisi à la pince de Pozzi sur les berges antérieure et postérieure, afin d’extérioriser le prolapsus et d’exposer les parois vaginales.',
            ],
          },
          {
            id: 'colpo-subsection-4',
            paragraphs: [
              'Les dimensions sont adaptées au degré du prolapsus en conservant, de part et d’autre, une bande latérale de paroi vaginale d’environ 3 cm destinée à former les gouttières. La distance entre les parois latérales des deux rectangles doit rester d’au moins 1,5 cm pour permettre leur constitution.',
              'Une infiltration de lidocaïne adrénalinée 1 % au niveau des futures colpectomies facilite la dissection et limite le saignement.',
              'La colpectomie antérieure est réalisée au bistouri, avec une dissection plus aisée du col vers le méat urétral, et une hémostase sélective progressive. Le même geste est effectué en postérieur ; la dissection se fait au contact du cul-de-sac de Douglas et de la paroi antérieure du rectum, jusqu’à environ 3 cm de la fourchette.',
              'Les zones non réséquées constituent les deux bandes latérales. Un drain de Blake ou des crins de Florence peuvent être placés au contact de l’orifice externe du col pour matérialiser les gouttières.',
            ],
          },
        ],
      },
      {
        id: 'colpo-section-4',
        title: 'Deuxième étape : Fermeture',
        subsections: [
          {
            id: 'colpo-subsection-5',
            imageSrc: '/images/colpocleisis/colporraphie-etape-1.png',
            paragraphs: [
              'Points simples au Vicryl 2-0 rapprochant le bord inférieur du rectangle antérieur du bord supérieur du rectangle postérieur.',
              'La suture progresse surtout sur la largeur, de l’orifice externe du col vers les orifices des gouttières, en recouvrant le col et le prolapsus.',
            ],
            title: 'Colporraphie antéro-postérieure',
          },
          {
            id: 'colpo-subsection-5-image-2',
            imageSrc: '/images/colpocleisis/colporraphie-etape-2.png',
            paragraphs: [],
          },
          {
            id: 'colpo-subsection-6',
            imageSrc: '/images/colpocleisis/fermeture-vaginale-final.png',
            paragraphs: [
              'Rapprochement des rectangles deux à deux par points simples ou surjet au Vicryl 2-0.',
              'La suture prend successivement le rectangle supérieur puis le côté homolatéral du rectangle inférieur, puis de même controlatéralement.',
              'Le serrage reloule la zone réséquée vers l’intérieur, réintègre le col et le prolapsus dans le bassin, puis permet l’accolement final des berges.',
              'En fin de geste, le vagin est totalement fermé.',
              'Des points simples peuvent être réalisés tous les 1 cm entre le fascia de Halban et le fascia pré-rectal pour renforcer le montage.',
            ],
            title: 'Fermeture vaginale',
          },
        ],
      },
      {
        id: 'colpo-section-5',
        title: 'Suites opératoires',
        subsections: [
          {
            id: 'colpo-subsection-7',
            paragraphs: [
              'La sonde vésicale peut être retirée en post-opératoire immédiat ou maintenue jusqu’au lendemain, avec vérification de la reprise mictionnelle.',
              'Une mèche vaginale drainante peut être retirée le soir même ou le lendemain matin selon les habitudes du service.',
            ],
          },
        ],
      },
    ],
  },
];

type MobileIcon = ComponentType<{
  color?: string;
  size?: number;
  strokeWidth?: number;
}>;

function SurgicalMaskMobileIcon({
  color = colors.teal,
  size = 18,
  strokeWidth = 2.1,
}: {
  color?: string;
  size?: number;
  strokeWidth?: number;
}) {
  return (
    <Svg fill="none" height={size} stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} viewBox="0 0 24 24" width={size}>
      <Path d="M4.5 10.5C6.2 8.9 8.8 8 12 8s5.8.9 7.5 2.5" />
      <Path d="M6.5 10.5v4.2c0 .8.4 1.5 1 2l2.7 2c1.1.8 2.5.8 3.6 0l2.7-2c.6-.5 1-1.2 1-2v-4.2" />
      <Path d="M9 12.5h6" />
      <Path d="M9 15h6" />
      <Path d="M6.5 11.5H5a2 2 0 0 0-2 2" />
      <Path d="M17.5 11.5H19a2 2 0 0 1 2 2" />
    </Svg>
  );
}

const AUTH_EMAIL_BY_LOGIN_ID: Record<string, string> = {
  'joris.poquet': 'joris-poquet@hotmail.fr',
};

const WEB_ONLY_ADMIN_LOGINS = new Set(['adminbeta', 'joris.pqt@gmail.com']);

const ROLE_LABELS: Record<SessionRole, string> = {
  admin: 'Administrateur',
  internal: 'Interne',
  senior: 'Senior',
};

const TABLE_LABELS = {
  activity: 'Activite',
  interventions: 'Interventions',
  profiles: 'Profils',
  trophies: 'Trophées',
};

const APPROACH_LABELS: Record<string, string> = {
  coelioscopie: 'Cœlioscopie',
  hysteroscopie: 'Hystéroscopie',
  laparotomie: 'Laparotomie',
  robot: 'Robot',
  voie_vaginale: 'Voie vaginale',
  vnotes: 'vNotes',
};

const INDICATION_LABELS: Record<string, string> = {
  autre: 'Autre',
  geu: 'GEU',
  ligature_tubaire: 'Contraception définitive',
};

const INTERVENTION_ROLE_LABELS: Record<string, string> = {
  aide_principal: 'Aide principal',
  aide_secondaire: 'Aide secondaire',
  observateur: 'Observateur',
  operateur_principal: 'Opérateur principal',
};

const ENTRY_TECHNIQUE_LABELS: Record<string, string> = {
  open: 'Open',
  trocart_direct: 'Trocart direct',
  veress: 'Aiguille de Veress',
};

const LATERALITY_LABELS: Record<string, string> = {
  bilateral: 'Bilatéral',
  droite: 'Droite',
  gauche: 'Gauche',
};

const DEFAULT_APPROACHES = ['coelioscopie', 'laparotomie', 'voie_vaginale'];
const DEFAULT_ENTRY_TECHNIQUES = ['trocart_direct', 'open', 'veress'];
const DEFAULT_INDICATIONS = ['geu', 'ligature_tubaire', 'autre'];
const DEFAULT_LATERALITIES = ['gauche', 'bilateral', 'droite'];
const DEFAULT_ROLES = [
  'operateur_principal',
  'aide_principal',
  'aide_secondaire',
  'observateur',
];
const OTHER_SENIOR_OPTION_ID = 'sen-other';
const SEMESTER_OPTIONS = Array.from({ length: 12 }, (_, index) => ({
  label: `S${index + 1}`,
  value: `S${index + 1}`,
}));
const ROTATION_OPTIONS = [
  { label: 'Chirurgie', value: 'Stage de chirurgie' },
  { label: 'Pool obstétrical', value: 'Pool obstétrical' },
  { label: 'UGOMPS', value: 'UGOMPS' },
  { label: 'DAN', value: 'DAN' },
];
const COMPLEXITY_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const CHECKLIST_LEVEL_OPTIONS: Array<{
  description: string;
  detail: string;
  label: ChecklistLevel;
  value: ChecklistLevel;
}> = [
  {
    description: 'Non applicable',
    detail: 'Étape non concernée pour cette intervention.',
    label: 'NA',
    value: 'NA',
  },
  {
    description: 'Observé uniquement',
    detail: 'Le senior a réalisé l’étape. Je n’ai pas participé techniquement.',
    label: '0',
    value: '0',
  },
  {
    description: 'Montré et expliqué',
    detail:
      'Le senior a réalisé l’étape en me la montrant et en l’expliquant. Ma participation était limitée ou absente.',
    label: '1',
    value: '1',
  },
  {
    description: 'Réalisé avec assistance active du senior',
    detail:
      'J’ai réalisé l’étape avec une aide importante du senior : aide physique, correction du geste, reprise partielle ou guidage rapproché.',
    label: '2',
    value: '2',
  },
  {
    description: 'Réalisé avec assistance passive du senior',
    detail:
      'J’ai réalisé l’étape moi-même, avec seulement des consignes verbales ou des conseils ponctuels.',
    label: '3',
    value: '3',
  },
  {
    description: 'Réalisé sous supervision seule',
    detail:
      'J’ai réalisé l’étape en autonomie, le senior étant uniquement présent pour superviser et sécuriser si besoin.',
    label: '4',
    value: '4',
  },
];

const ADMIN_PERFORMANCE_OPTIONS: Array<{
  description: string;
  label: string;
  value: AdminPerformanceRating;
}> = [
  {
    description: 'L’interne n’était pas suffisamment préparé pour l’intervention.',
    label: '1 · Interne non préparé',
    value: '1',
  },
  {
    description:
      'L’interne ne connaissait pas suffisamment les étapes ou les principes de l’intervention.',
    label: '2 · Connaissance insuffisante de la procédure',
    value: '2',
  },
  {
    description:
      'L’interne a réalisé une partie de l’intervention avec un niveau correct, mais nécessite encore un accompagnement important.',
    label: '3 · Performance intermédiaire',
    value: '3',
  },
  {
    description:
      'La performance est compatible avec une progression vers une pratique autonome supervisée.',
    label: '4 · Performance compatible avec une future autonomie supervisée',
    value: '4',
  },
  {
    description:
      'La performance est nettement supérieure à celle attendue pour le niveau de formation.',
    label: '5 · Performance exceptionnelle',
    value: '5',
  },
];

const ADMIN_CATEGORY_DIFFICULTY_OPTIONS: Array<{
  description: string;
  label: string;
  value: AdminCategoryDifficultyRating;
}> = [
  {
    description:
      'Intervention techniquement simple par rapport aux autres interventions du même type.',
    label: '1 · Intervention simple',
    value: '1',
  },
  {
    description:
      'Intervention de difficulté habituelle ou modérée par rapport aux autres interventions du même type.',
    label: '2 · Intervention de difficulté intermédiaire',
    value: '2',
  },
  {
    description:
      'Intervention techniquement difficile par rapport aux autres interventions du même type.',
    label: '3 · Intervention difficile',
    value: '3',
  },
];

const SENIOR_PERFORMANCE_SHORT_LABELS: Record<AdminPerformanceRating, string> = {
  '1': 'Interne non préparé',
  '2': 'Connaissance insuffisante',
  '3': 'Performance intermédiaire',
  '4': 'Compatible autonomie supervisée',
  '5': 'Performance exceptionnelle',
};

const SENIOR_DIFFICULTY_SHORT_LABELS: Record<AdminCategoryDifficultyRating, string> = {
  '1': 'Simple',
  '2': 'Intermédiaire',
  '3': 'Difficile',
};

const DIFFICULTY_COEFFICIENTS: Record<AdminCategoryDifficultyRating, number> = {
  '1': 0.95,
  '2': 1,
  '3': 1.05,
};
const MINIMUM_KEY_STEP_COVERAGE = 0.75;
const INSUFFICIENT_KEY_STEP_COVERAGE_MESSAGE =
  "Score non calculable — vous n'avez pas enregistré suffisamment d'étapes";

function normalizeSupabaseUrl(url: string) {
  return url.replace(/\/+$/, '');
}

function getTodayInputDate() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function createMutationId(profileId: string) {
  return `mobile-${profileId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function readStringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

function readChecklistRecord(value: unknown) {
  if (!isRecord(value)) {
    return {};
  }

  return Object.entries(value).reduce<Record<string, ChecklistLevel | null>>(
    (checklist, [stepId, level]) => {
      if (
        level === null ||
        level === 'NA' ||
        level === '0' ||
        level === '1' ||
        level === '2' ||
        level === '3' ||
        level === '4'
      ) {
        checklist[stepId] = level;
      }

      return checklist;
    },
    {}
  );
}

function readChecklistSteps(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item, index): ChecklistStep[] => {
    if (!isRecord(item)) {
      return [];
    }

    const label = typeof item.label === 'string' ? item.label.trim() : '';

    if (!label) {
      return [];
    }

    return [
      {
        applicableApproaches: readStringArray(item.applicableApproaches),
        id: typeof item.id === 'string' && item.id ? item.id : `step-${index + 1}`,
        label,
      },
    ];
  });
}

function readApproachSteps(value: unknown) {
  if (!Array.isArray(value)) {
    return {};
  }

  return value.reduce<Record<string, ChecklistStep[]>>((stepsByApproach, config) => {
    if (!isRecord(config) || config.active === false || typeof config.approach !== 'string') {
      return stepsByApproach;
    }

    const approach = config.approach;
    const rawSteps = Array.isArray(config.steps) ? [...config.steps] : [];
    const steps = rawSteps
      .sort((left, right) => {
        const leftOrder = isRecord(left) && typeof left.order === 'number' ? left.order : 0;
        const rightOrder = isRecord(right) && typeof right.order === 'number' ? right.order : 0;
        return leftOrder - rightOrder;
      })
      .flatMap((step, index): ChecklistStep[] => {
        if (!isRecord(step)) {
          return [];
        }

        const label = typeof step.label === 'string' ? step.label.trim() : '';

        if (!label) {
          return [];
        }

        return [
          {
            applicableApproaches: [approach],
            id:
              typeof step.id === 'string' && step.id
                ? step.id
                : `${approach}-step-${index + 1}`,
            label,
          },
        ];
      });

    if (steps.length) {
      stepsByApproach[approach] = steps;
    }

    return stepsByApproach;
  }, {});
}

function humanize(value: string | null | undefined) {
  if (!value) {
    return 'Non renseigné';
  }

  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (firstLetter) => firstLetter.toUpperCase());
}

function normalizeSearchText(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr-FR')
    .trim();
}

function isTechnicalIndicationValue(value: string) {
  const normalizedValue = normalizeSearchText(value);
  return (
    normalizedValue.startsWith('intervention-indication-') ||
    normalizedValue.startsWith('intervention indication ')
  );
}

function isSalpingectomyDefinition(definition: SurgicalDefinition | null | undefined) {
  return (
    definition?.id === 'salpingectomie' ||
    normalizeSearchText(definition?.name).includes('salpingectomie')
  );
}

function sortIndicationsWithOtherLast(indications: string[]) {
  return [...new Set(indications.map((indication) => indication.trim()).filter(Boolean))].sort(
    (left, right) => {
      const leftIsOther = normalizeSearchText(left) === 'autre';
      const rightIsOther = normalizeSearchText(right) === 'autre';

      if (leftIsOther && !rightIsOther) {
        return 1;
      }

      if (!leftIsOther && rightIsOther) {
        return -1;
      }

      return labelForIndication(left).localeCompare(labelForIndication(right), 'fr-FR', {
        sensitivity: 'base',
      });
    }
  );
}

function sortDefinitionChoiceOptionsWithOtherLast(options: DefinitionChoiceOption[]) {
  return [...options].sort((left, right) => {
    const leftIsOther =
      normalizeSearchText(left.value) === 'autre' || normalizeSearchText(left.label) === 'autre';
    const rightIsOther =
      normalizeSearchText(right.value) === 'autre' || normalizeSearchText(right.label) === 'autre';

    if (leftIsOther && !rightIsOther) {
      return 1;
    }

    if (!leftIsOther && rightIsOther) {
      return -1;
    }

    return left.label.localeCompare(right.label, 'fr-FR', {
      sensitivity: 'base',
    });
  });
}

function dedupeDefinitionChoiceOptions(options: DefinitionChoiceOption[]) {
  const seenValues = new Set<string>();

  return options.filter((option) => {
    const value = option.value.trim();

    if (!value || isTechnicalIndicationValue(value) || seenValues.has(value)) {
      return false;
    }

    seenValues.add(value);
    return true;
  });
}

function getFallbackIndicationOptions(indications: string[]) {
  return sortIndicationsWithOtherLast(indications).map((value) => ({
    label: labelForIndication(value),
    value,
  }));
}

function getDefinitionIndicationOptions(
  definition: SurgicalDefinition | null | undefined
) {
  const options = definition?.indicationOptions?.length
    ? definition.indicationOptions
    : getFallbackIndicationOptions(definition?.indications ?? []);

  return sortDefinitionChoiceOptionsWithOtherLast(dedupeDefinitionChoiceOptions(options));
}

function getSalpingectomyIndicationOptions(
  definition: SurgicalDefinition | null | undefined
) {
  const synchronizedOptions = getDefinitionIndicationOptions(definition);
  return synchronizedOptions.length > 0
    ? synchronizedOptions
    : getFallbackIndicationOptions(DEFAULT_INDICATIONS);
}

function getSalpingectomyIndications(definition: SurgicalDefinition | null | undefined) {
  return getSalpingectomyIndicationOptions(definition).map((option) => option.value);
}

function labelForApproach(value: string | null | undefined) {
  return value ? APPROACH_LABELS[value] ?? humanize(value) : 'Voie non renseignée';
}

function labelForIndication(value: string | null | undefined) {
  return value ? INDICATION_LABELS[value] ?? humanize(value) : 'Indication non renseignée';
}

function labelForDefinitionIndication(
  definition: SurgicalDefinition | null | undefined,
  value: string | null | undefined
) {
  if (!value) {
    return labelForIndication(value);
  }

  return (
    getDefinitionIndicationOptions(definition).find((option) => option.value === value)?.label ??
    labelForIndication(value)
  );
}

function labelForEntryTechnique(value: string | null | undefined) {
  return value
    ? ENTRY_TECHNIQUE_LABELS[value] ?? humanize(value)
    : 'Technique non renseignée';
}

function labelForLaterality(value: string | null | undefined) {
  return value ? LATERALITY_LABELS[value] ?? humanize(value) : 'Latéralité non renseignée';
}

function getInterventionIndicationLabel(
  intervention: RecentIntervention,
  definition?: SurgicalDefinition | null
) {
  if (intervention.customIndication?.trim()) {
    return intervention.customIndication.trim();
  }

  if (intervention.indication === 'autre' && intervention.indicationComment.trim()) {
    return intervention.indicationComment.trim();
  }

  return labelForDefinitionIndication(definition, intervention.indication);
}

function labelForInterventionRole(value: string | null | undefined) {
  return value ? INTERVENTION_ROLE_LABELS[value] ?? humanize(value) : 'Rôle non renseigné';
}

function getApproachIconSource(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  return APPROACH_ICON_SOURCES[value as keyof typeof APPROACH_ICON_SOURCES] ?? null;
}

function formatDisplayDate(value: string) {
  const [year, month, day] = value.split('-');

  if (!year || !month || !day) {
    return value;
  }

  return `${day}/${month}/${year}`;
}

function formatLongDisplayDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
    .format(new Date(year, month - 1, day))
    .replace(/\./g, '')
    .toLocaleUpperCase('fr-FR');
}

const WEEKDAY_LABELS = ['LUN', 'MAR', 'MER', 'JEU', 'VEN', 'SAM', 'DIM'];

function parseIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);

  if (!year || !month || !day) {
    return new Date();
  }

  return new Date(year, month - 1, day);
}

function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function getMonthTitle(date: Date) {
  return new Intl.DateTimeFormat('fr-FR', {
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function getDayTitle(value: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    weekday: 'long',
    year: 'numeric',
  }).format(parseIsoDate(value));
}

function formatShortTime(value: string | Date) {
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(typeof value === 'string' ? new Date(value) : value);
}

function formatSaveTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const today = new Date();
  const isSameDay = date.toDateString() === today.toDateString();

  return isSameDay
    ? `aujourd’hui à ${formatShortTime(date)}`
    : `${getDayTitle(value.slice(0, 10))} à ${formatShortTime(date)}`;
}

function getCalendarDays(monthDate: Date) {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(
    monthDate.getFullYear(),
    monthDate.getMonth() + 1,
    0
  ).getDate();
  const visibleDayCount = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;

  return Array.from({ length: visibleDayCount }, (_, index) => {
    const day = index - mondayOffset + 1;
    return new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function decodeBasicHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'");
}

function notebookTextToHtml(value: string) {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return '';
  }

  function applyInlineFormatting(block: string) {
    return escapeHtml(block)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/__(.+?)__/g, '<u>$1</u>')
      .replace(/==(.+?)==/g, '<mark>$1</mark>');
  }

  return trimmedValue
    .split(/\n{2,}/)
    .map((block) => `<p>${applyInlineFormatting(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function notebookHtmlToText(value: string) {
  return decodeBasicHtmlEntities(
    value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>\s*<p[^>]*>/gi, '\n\n')
      .replace(/<\/?p[^>]*>/gi, '')
      .replace(/<hr[^>]*>/gi, '\n\n')
      .replace(/<[^>]+>/g, '')
  ).trim();
}

function getInitials(profile: Profile) {
  return `${profile.firstName[0] ?? ''}${profile.lastName[0] ?? ''}`.toUpperCase();
}

function formatSeniorProfileName(senior: SeniorProfile) {
  const lastName = senior.lastName.trim();
  const firstName = senior.firstName.trim();

  if (lastName) {
    return `Dr ${lastName}`;
  }

  return firstName ? `Dr ${firstName}` : 'Senior non renseigné';
}

function formatDraftSeniorName(seniorId: string | null, seniorProfiles: SeniorProfile[]) {
  if (seniorId === OTHER_SENIOR_OPTION_ID) {
    return 'Autre';
  }

  const senior = seniorProfiles.find((item) => item.id === seniorId) ?? null;
  return senior ? formatSeniorProfileName(senior) : 'Non renseigné';
}

function formatInterventionSeniorName(
  intervention: RecentIntervention,
  seniorProfiles: SeniorProfile[]
) {
  const senior =
    seniorProfiles.find((item) => item.id === intervention.seniorProfileId) ?? null;
  return senior ? formatSeniorProfileName(senior) : 'Senior non renseigné';
}

function escapeCsvCell(value: string | number | null | undefined) {
  const normalizedValue = String(value ?? '').replace(/\r?\n/g, ' ');
  return `"${normalizedValue.replace(/"/g, '""')}"`;
}

function buildMobileInterventionsCsv(
  interventions: RecentIntervention[],
  seniorProfiles: SeniorProfile[],
  definitions: SurgicalDefinition[],
  evaluations: Record<string, InterventionEvaluation>
) {
  const headers = [
    'Date',
    'Intervention',
    'Senior',
    "Voie d'abord",
    "Technique d'entrée",
    'Indication',
    'Latéralité',
    'Rôle',
    'Autonomie',
    'Difficulté',
    'Enregistrée le',
  ];
  const rows = interventions.map((intervention) => {
    const autonomyScore = calculateMobileAutonomyScore(
      intervention,
      definitions,
      evaluations[intervention.id]
    );

    return [
      formatDisplayDate(intervention.date),
      intervention.procedureName,
      formatInterventionSeniorName(intervention, seniorProfiles),
      labelForApproach(intervention.approach),
      intervention.entryTechnique ? labelForEntryTechnique(intervention.entryTechnique) : '',
      getInterventionIndicationLabel(intervention),
      intervention.laterality ? labelForLaterality(intervention.laterality) : '',
      labelForInterventionRole(intervention.role),
      autonomyScore != null ? autonomyScore.toFixed(1) : '',
      intervention.complexity ?? '',
      formatSaveTimestamp(intervention.savedAt) ?? intervention.savedAt,
    ];
  });

  return [headers, ...rows]
    .map((row) => row.map(escapeCsvCell).join(';'))
    .join('\n');
}

function formatInternalProfileName(profile: InternalProfileSummary | null | undefined) {
  if (!profile) {
    return 'Interne non retrouvé';
  }

  return `${profile.firstName} ${profile.lastName}`.trim() || 'Interne non renseigné';
}

function readDefinitionIndicationOptions(
  definition: Record<string, unknown>,
  definitionId: string
) {
  const fromOptions = Array.isArray(definition.indicationOptions)
    ? definition.indicationOptions.flatMap((option): DefinitionChoiceOption[] => {
        if (!isRecord(option) || option.active === false) {
          return [];
        }

        const value =
          readText(option.value) ||
          readText(option.id) ||
          readText(option.key) ||
          readText(option.label) ||
          readText(option.name) ||
          readText(option.title);
        const label =
          readText(option.label) ||
          readText(option.name) ||
          readText(option.title) ||
          labelForIndication(value);

        if (!value || isTechnicalIndicationValue(value)) {
          return [];
        }

        return [{ label, value }];
      })
    : [];
  const fromLegacyList = readStringArray(definition.indications).map((value) => ({
    label: labelForIndication(value),
    value,
  }));
  const merged = dedupeDefinitionChoiceOptions([...fromOptions, ...fromLegacyList]);

  if (merged.length > 0 || definitionId !== 'salpingectomie') {
    return merged;
  }

  return getFallbackIndicationOptions(DEFAULT_INDICATIONS);
}

function toSurgicalDefinition(row: SurgicalDefinitionRow): SurgicalDefinition {
  const definition = isRecord(row.definition) ? row.definition : {};
  const allowedApproaches = readStringArray(definition.allowedApproaches);
  const approachSteps = readApproachSteps(definition.approachConfigs);
  const indicationOptions = readDefinitionIndicationOptions(definition, row.id);

  return {
    allowedApproaches: allowedApproaches.length > 0 ? allowedApproaches : DEFAULT_APPROACHES,
    allowedEntryTechniques: readStringArray(definition.allowedEntryTechniques),
    approachSteps,
    checklistSteps: readChecklistSteps(definition.checklistSteps),
    id: row.id,
    indicationOptions,
    indications: indicationOptions.map((option) => option.value),
    isCustom: definition.isCustom === true || row.id.startsWith('custom-'),
    keyStepIds: readStringArray(definition.keyStepIds),
    name: typeof definition.name === 'string' ? definition.name : row.name,
    requiresLaterality: definition.requiresLaterality === true,
  };
}

function resolveLoginEmail(login: string) {
  const cleanLogin = login.trim().toLowerCase();

  if (WEB_ONLY_ADMIN_LOGINS.has(cleanLogin)) {
    throw new Error("La session admin est réservée à l'expérience web sur ordinateur.");
  }

  if (cleanLogin.includes('@')) {
    return cleanLogin;
  }

  return AUTH_EMAIL_BY_LOGIN_ID[cleanLogin] ?? null;
}

async function readError(response: Response) {
  const body = await response.text();

  if (!body) {
    return `Erreur Supabase ${response.status}`;
  }

  try {
    const parsed = JSON.parse(body) as {
      error?: string;
      error_description?: string;
      message?: string;
      msg?: string;
    };
    return parsed.error_description ?? parsed.message ?? parsed.msg ?? parsed.error ?? body;
  } catch {
    return body;
  }
}

function getLoginErrorMessage(caughtError: unknown) {
  if (!(caughtError instanceof Error)) {
    return 'Connexion impossible pour le moment.';
  }

  if (/invalid login credentials/i.test(caughtError.message)) {
    return 'Identifiant ou mot de passe incorrect. Affiche le mot de passe pour verifier la saisie, puis reessaie.';
  }

  return caughtError.message;
}

async function supabaseRequest(
  path: string,
  options: RequestInit = {},
  accessToken?: string
) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Configuration Supabase absente dans mobile/.env.local');
  }

  const headers = new Headers(options.headers);
  headers.set('apikey', SUPABASE_ANON_KEY);
  headers.set('Authorization', `Bearer ${accessToken ?? SUPABASE_ANON_KEY}`);

  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${normalizeSupabaseUrl(SUPABASE_URL)}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  return response;
}

async function signIn(login: string, password: string) {
  const email = resolveLoginEmail(login);

  if (!email) {
    throw new Error('Identifiant inconnu. Essaie joris.poquet ou un compte senior.');
  }

  const response = await supabaseRequest('/auth/v1/token?grant_type=password', {
    body: JSON.stringify({ email, password }),
    method: 'POST',
  });

  return (await response.json()) as AuthSession;
}

async function refreshSupabaseSession(refreshToken: string) {
  const response = await supabaseRequest('/auth/v1/token?grant_type=refresh_token', {
    body: JSON.stringify({ refresh_token: refreshToken }),
    method: 'POST',
  });

  return (await response.json()) as AuthSession;
}

function toProfile(row: ProfileRow): Profile {
  return {
    avatarImageSrc: row.avatar_image_src,
    currentRotation: row.current_rotation,
    firstName: row.first_name,
    id: row.id,
    lastName: row.last_name,
    loginId: row.login_id,
    promotion: row.promotion,
    role: row.role,
    semester: row.semester,
  };
}

async function loadProfile(session: AuthSession) {
  const authUserId = encodeURIComponent(session.user.id);
  const response = await supabaseRequest(
    `/rest/v1/profiles?select=id,role,first_name,last_name,login_id,promotion,semester,current_rotation,avatar_image_src&auth_user_id=eq.${authUserId}&limit=1`,
    undefined,
    session.access_token
  );
  const rows = (await response.json()) as ProfileRow[];

  if (!rows[0]) {
    throw new Error('Profil applicatif introuvable pour cette session.');
  }

  const profile = toProfile(rows[0]);

  if (profile.role === 'admin') {
    throw new Error("La session admin est réservée à l'expérience web sur ordinateur.");
  }

  return profile;
}

type ProfileSettingsInput = {
  currentRotation: string;
  semester: string;
};

type PasswordUpdateInput = {
  currentPassword: string;
  nextPassword: string;
};

async function updateMobileProfileSettings(
  profile: Profile,
  input: ProfileSettingsInput,
  accessToken: string
) {
  const semester = input.semester.trim();
  const currentRotation = input.currentRotation.trim();

  if (!semester || !currentRotation) {
    throw new Error('Renseigne ton semestre et ton stage actuel.');
  }

  const profileId = encodeURIComponent(profile.id);
  const response = await supabaseRequest(
    `/rest/v1/profiles?id=eq.${profileId}&select=id,role,first_name,last_name,login_id,promotion,semester,current_rotation,avatar_image_src`,
    {
      body: JSON.stringify({
        current_rotation: currentRotation,
        semester,
      }),
      headers: {
        Prefer: 'return=representation',
      },
      method: 'PATCH',
    },
    accessToken
  );
  const rows = (await response.json()) as ProfileRow[];

  return rows[0] ? toProfile(rows[0]) : { ...profile, currentRotation, semester };
}

async function updateMobileAvatarImage(
  profile: Profile,
  avatarImageSrc: string | null,
  accessToken: string
) {
  const profileId = encodeURIComponent(profile.id);
  const response = await supabaseRequest(
    `/rest/v1/profiles?id=eq.${profileId}&select=id,role,first_name,last_name,login_id,promotion,semester,current_rotation,avatar_image_src`,
    {
      body: JSON.stringify({
        avatar_image_src: avatarImageSrc,
      }),
      headers: {
        Prefer: 'return=representation',
      },
      method: 'PATCH',
    },
    accessToken
  );
  const rows = (await response.json()) as ProfileRow[];

  return rows[0] ? toProfile(rows[0]) : { ...profile, avatarImageSrc };
}

async function updateMobileAccountPassword(nextPassword: string, accessToken: string) {
  await supabaseRequest(
    '/auth/v1/user',
    {
      body: JSON.stringify({ password: nextPassword }),
      method: 'PUT',
    },
    accessToken
  );
}

function parseContentRangeCount(value: string | null) {
  if (!value) {
    return 0;
  }

  const total = value.split('/')[1];
  const parsed = Number(total);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function countRows(table: string, accessToken: string, filters: string[] = []) {
  const query = ['select=id', ...filters].join('&');
  const response = await supabaseRequest(
    `/rest/v1/${table}?${query}`,
    {
      headers: {
        Prefer: 'count=exact',
        Range: '0-0',
        'Range-Unit': 'items',
      },
    },
    accessToken
  );

  return parseContentRangeCount(response.headers.get('content-range'));
}

async function loadDashboardSummary(profile: Profile, accessToken: string) {
  const profileId = encodeURIComponent(profile.id);
  const interventionFilters =
    profile.role === 'admin'
      ? ['deleted_at=is.null']
      : profile.role === 'senior'
        ? [`senior_profile_id=eq.${profileId}`, 'deleted_at=is.null']
        : [`internal_profile_id=eq.${profileId}`, 'deleted_at=is.null'];
  const activityFilters =
    profile.role === 'admin' ? [] : [`profile_id=eq.${profileId}`];
  const trophyFilters =
    profile.role === 'admin' ? [] : [`profile_id=eq.${profileId}`];
  const profileFilters =
    profile.role === 'admin'
      ? []
      : profile.role === 'senior'
        ? ['role=eq.internal']
        : [`id=eq.${profileId}`];

  const [interventions, activity, profiles, trophies] = await Promise.all([
    countRows('interventions', accessToken, interventionFilters),
    countRows('activity_log', accessToken, activityFilters),
    countRows('profiles', accessToken, profileFilters),
    countRows('trophy_awards', accessToken, trophyFilters),
  ]);

  return {
    activity,
    interventions,
    profiles,
    trophies,
  };
}

function toNotebookDocument(row: NotebookDocumentRow): NotebookDocument {
  return {
    contentHtml: row.content_html,
    profileId: row.profile_id,
    updatedAt: row.updated_at,
  };
}

function readText(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

function readNullableNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readTrophyTrackedStatus(value: unknown, fallback: TrophyTrackedStatus): TrophyTrackedStatus {
  return value === 'recorded' || value === 'evaluated' ? value : fallback;
}

function readBadgeTier(value: unknown, fallback: BadgeTier): BadgeTier {
  return value === 'diamond' || value === 'gold' || value === 'silver' || value === 'bronze'
    ? value
    : fallback;
}

function readTrophyConditionType(value: unknown): TrophyConditionType {
  const allowedTypes: TrophyConditionType[] = [
    'approach_count',
    'average_autonomy',
    'cross_procedure_autonomy',
    'distinct_procedures',
    'first_recorded',
    'intervention_status',
    'procedure_count',
    'recording_time_range',
    'role',
    'total_evaluated',
    'total_recorded',
  ];
  return typeof value === 'string' && allowedTypes.includes(value as TrophyConditionType)
    ? (value as TrophyConditionType)
    : 'total_recorded';
}

function readTrophyConditions(value: unknown): TrophyCondition[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).map((condition, index) => {
    const type = readTrophyConditionType(condition.type);
    const interventionStatus =
      condition.interventionStatus === 'evaluated' || condition.interventionStatus === 'pending'
        ? condition.interventionStatus
        : '';

    return {
      approach: readText(condition.approach),
      autonomyMin: readNullableNumber(condition.autonomyMin),
      distinctProcedureCount: readNullableNumber(condition.distinctProcedureCount),
      endHour: readText(condition.endHour, '06:00'),
      id: readText(condition.id, `mobile-trophy-condition-${index}`),
      interventionStatus,
      minEvaluatedPerProcedure: readNullableNumber(condition.minEvaluatedPerProcedure),
      procedure: readText(condition.procedure),
      role: readText(condition.role),
      startHour: readText(condition.startHour, '00:00'),
      threshold: readNullableNumber(condition.threshold),
      trackedStatus: readTrophyTrackedStatus(
        condition.trackedStatus,
        type === 'total_evaluated' ? 'evaluated' : 'recorded'
      ),
      type,
    };
  });
}

function readTrophyLevels(value: unknown): TrophyLevelDefinition[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord).map((level, index) => ({
    autonomyMin: readNullableNumber(level.autonomyMin),
    imageSrc: typeof level.imageSrc === 'string' ? level.imageSrc : null,
    label: readText(level.label),
    threshold: readNullableNumber(level.threshold),
    tier: readBadgeTier(level.tier, index === 0 ? 'bronze' : index === 1 ? 'silver' : index === 2 ? 'gold' : 'diamond'),
    trackedStatus: readTrophyTrackedStatus(level.trackedStatus, 'evaluated'),
  }));
}

function readTrophyImageSet(value: unknown): TrophyImageSet {
  const images = isRecord(value) ? value : {};

  function readImage(key: keyof TrophyImageSet) {
    return typeof images[key] === 'string' ? images[key] : null;
  }

  return {
    bronze: readImage('bronze'),
    diamond: readImage('diamond'),
    gold: readImage('gold'),
    silver: readImage('silver'),
    single: readImage('single'),
  };
}

type TrophyImageSource = ImageSourcePropType | null;

function resolveRemoteImageUri(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  if (/^(https?:|data:image\/)/i.test(value)) {
    return value;
  }

  if (value.startsWith('/')) {
    return `${WEB_APP_ORIGIN}${value}`;
  }

  return null;
}

function getBadgeImageSource(value: string | null | undefined): TrophyImageSource {
  if (!value) {
    return null;
  }

  if (value in BADGE_IMAGE_SOURCES) {
    return BADGE_IMAGE_SOURCES[value as keyof typeof BADGE_IMAGE_SOURCES];
  }

  const remoteUri = resolveRemoteImageUri(value);
  return remoteUri ? { uri: remoteUri } : null;
}

function getTrophyImageSource(definition: TrophyDefinition, tier?: string | null) {
  const images = definition.images;
  const preferredImage =
    tier === 'diamond'
      ? images.diamond ?? images.gold ?? images.silver ?? images.bronze ?? images.single
      : tier === 'gold'
        ? images.gold ?? images.silver ?? images.bronze ?? images.diamond ?? images.single
        : tier === 'silver'
          ? images.silver ?? images.bronze ?? images.gold ?? images.diamond ?? images.single
          : tier === 'bronze'
            ? images.bronze ?? images.silver ?? images.gold ?? images.diamond ?? images.single
            : images.single ?? images.bronze ?? images.silver ?? images.gold ?? images.diamond;

  return getBadgeImageSource(preferredImage);
}

function toTrophyDefinition(row: TrophyDefinitionRow): TrophyDefinition {
  const definition = isRecord(row.definition) ? row.definition : {};
  const trophyType = readText(definition.type, 'operatoire');
  const fallbackFormat = trophyType === 'operatoire' ? 'levels' : 'unique';
  const format =
    definition.format === 'unique' || definition.format === 'levels'
      ? definition.format
      : fallbackFormat;
  const status =
    definition.status === 'draft' ||
    definition.status === 'active' ||
    definition.status === 'inactive'
      ? definition.status
      : row.status === 'draft' || row.status === 'active' || row.status === 'inactive'
        ? row.status
        : 'draft';
  const visibility =
    definition.visibility === 'visible' || definition.visibility === 'surprise'
      ? definition.visibility
      : trophyType === 'operatoire'
        ? 'visible'
        : 'surprise';

  return {
    associatedApproach: readText(definition.associatedApproach),
    associatedIndication: readText(definition.associatedIndication),
    associatedProcedure: readText(definition.associatedProcedure),
    conditions: readTrophyConditions(definition.conditions),
    description: readText(definition.description),
    format,
    id: row.id,
    images: readTrophyImageSet(definition.images),
    levels: format === 'levels' ? readTrophyLevels(definition.levels) : [],
    operativeScope: definition.operativeScope === 'approach' ? 'approach' : 'procedure',
    status,
    title: readText(definition.title, row.title),
    trackedInterventionStatus: readTrophyTrackedStatus(
      definition.trackedInterventionStatus,
      'evaluated'
    ),
    trackedRole: readText(definition.trackedRole, 'operateur_principal'),
    visibility,
  };
}

function toTrophyAward(row: TrophyAwardRow): TrophyAward {
  return {
    awardedAt: row.awarded_at,
    id: row.id,
    profileId: row.profile_id,
    tier: row.tier,
    trophyId: row.trophy_id,
  };
}

function getActiveTrophyDefinitions(trophyDefinitions: TrophyDefinition[]) {
  return trophyDefinitions.filter((definition) => definition.status === 'active');
}

type TrophyProgressSnapshot = {
  awardedAt: string | null;
  nextThreshold: number | null;
  nextTier: BadgeTier | null;
  progressCurrent: number | null;
  progressTarget: number | null;
  unlockedTier: BadgeTier | null;
};

type TrophyDisplayStatus = 'earned' | 'progress';

type TrophyDisplayModel = {
  awardedAt: string | null;
  description: string;
  id: string;
  imageSrc: TrophyImageSource;
  progressCurrent: number | null;
  progressTarget: number | null;
  section: TrophyDisplayStatus;
  subtitle: string;
  title: string;
  unlockedTier: BadgeTier | null;
};

function matchesTrophyTrackedStatus(
  intervention: RecentIntervention,
  evaluations: Record<string, InterventionEvaluation>,
  trackedStatus: TrophyTrackedStatus
) {
  if (trackedStatus === 'recorded') {
    return true;
  }

  return hasCompleteEvaluation(evaluations[intervention.id]);
}

function matchesTrophyRole(intervention: RecentIntervention, role: string) {
  return !role || intervention.role === role;
}

function matchesTrophyBaseFilters(
  intervention: RecentIntervention,
  definition: TrophyDefinition,
  evaluations: Record<string, InterventionEvaluation>,
  options?: {
    ignoreTrackedStatus?: boolean;
  }
) {
  if (
    definition.operativeScope === 'procedure' &&
    definition.associatedProcedure &&
    intervention.procedureId !== definition.associatedProcedure
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

  if (!matchesTrophyRole(intervention, definition.trackedRole)) {
    return false;
  }

  if (options?.ignoreTrackedStatus) {
    return true;
  }

  return matchesTrophyTrackedStatus(
    intervention,
    evaluations,
    definition.trackedInterventionStatus
  );
}

function getRelevantTrophyInterventions(
  definition: TrophyDefinition,
  profile: Profile,
  interventions: RecentIntervention[],
  evaluations: Record<string, InterventionEvaluation>,
  options?: {
    ignoreTrackedStatus?: boolean;
  }
) {
  return interventions.filter(
    (intervention) =>
      intervention.internalProfileId === profile.id &&
      matchesTrophyBaseFilters(intervention, definition, evaluations, options)
  );
}

function getAverageAutonomy(
  interventions: RecentIntervention[],
  definitions: SurgicalDefinition[],
  evaluations: Record<string, InterventionEvaluation>
) {
  const scores = interventions
    .map((intervention) =>
      calculateMobileAutonomyScore(
        intervention,
        definitions,
        evaluations[intervention.id]
      )
    )
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

function getCountProgressForTrophyCondition(
  condition: TrophyCondition,
  definition: TrophyDefinition,
  profile: Profile,
  interventions: RecentIntervention[],
  evaluations: Record<string, InterventionEvaluation>
) {
  const profileInterventions = interventions.filter(
    (intervention) => intervention.internalProfileId === profile.id
  );
  const filteredByRole = condition.role
    ? profileInterventions.filter((intervention) => intervention.role === condition.role)
    : profileInterventions;
  const filteredByStatus =
    condition.trackedStatus != null
      ? filteredByRole.filter((intervention) =>
          matchesTrophyTrackedStatus(intervention, evaluations, condition.trackedStatus)
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
        matchesTrophyTrackedStatus(intervention, evaluations, 'evaluated')
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
          intervention.procedureId === (condition.procedure || definition.associatedProcedure)
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
        matchesTrophyRole(intervention, condition.role)
      );
      const seenProcedures = new Set<string>();
      let awardedAt: string | null = null;

      sortedInterventions.forEach((intervention) => {
        if (awardedAt) {
          return;
        }

        seenProcedures.add(intervention.procedureId);

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

function doesTrophyConditionMatchProfile(
  condition: TrophyCondition,
  definition: TrophyDefinition,
  profile: Profile,
  interventions: RecentIntervention[],
  evaluations: Record<string, InterventionEvaluation>,
  definitions: SurgicalDefinition[]
) {
  const profileInterventions = interventions.filter(
    (intervention) => intervention.internalProfileId === profile.id
  );
  const filteredByRole = condition.role
    ? profileInterventions.filter((intervention) => intervention.role === condition.role)
    : profileInterventions;
  const filteredByStatus =
    condition.trackedStatus != null
      ? filteredByRole.filter((intervention) =>
          matchesTrophyTrackedStatus(intervention, evaluations, condition.trackedStatus)
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
        matchesTrophyTrackedStatus(intervention, evaluations, 'evaluated')
      ).length >= threshold;
    case 'procedure_count':
      return filteredByStatus.filter(
        (intervention) =>
          intervention.procedureId === (condition.procedure || definition.associatedProcedure)
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
          matchesTrophyTrackedStatus(intervention, evaluations, 'evaluated')
        ),
        definitions,
        evaluations
      );

      return average != null && average >= (condition.autonomyMin ?? 0);
    }
    case 'cross_procedure_autonomy': {
      const qualifyingInterventions = filteredByStatus.filter((intervention) =>
        matchesTrophyTrackedStatus(intervention, evaluations, 'evaluated')
      );
      const perProcedure = new Map<string, { count: number; scores: number[] }>();

      qualifyingInterventions.forEach((intervention) => {
        const current = perProcedure.get(intervention.procedureId) ?? {
          count: 0,
          scores: [],
        };

        current.count += 1;

        const autonomyScore = calculateMobileAutonomyScore(
          intervention,
          definitions,
          evaluations[intervention.id]
        );

        if (autonomyScore != null) {
          current.scores.push(autonomyScore);
        }

        perProcedure.set(intervention.procedureId, current);
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
          .filter((intervention) => matchesTrophyRole(intervention, condition.role))
          .map((intervention) => intervention.procedureId)
      ).size;

      return distinctCount >= (condition.distinctProcedureCount ?? threshold);
    }
    case 'role':
      return profileInterventions.some((intervention) =>
        matchesTrophyRole(intervention, condition.role)
      );
    case 'intervention_status':
      if (condition.interventionStatus === 'pending') {
        return profileInterventions.some(
          (intervention) => !matchesTrophyTrackedStatus(intervention, evaluations, 'evaluated')
        );
      }

      if (condition.interventionStatus === 'evaluated') {
        return profileInterventions.some((intervention) =>
          matchesTrophyTrackedStatus(intervention, evaluations, 'evaluated')
        );
      }

      return false;
    default:
      return false;
  }
}

function getUnlockedTrophyTierForProfile(
  definition: TrophyDefinition,
  profile: Profile,
  interventions: RecentIntervention[],
  evaluations: Record<string, InterventionEvaluation>,
  definitions: SurgicalDefinition[]
) {
  if (definition.status !== 'active') {
    return null;
  }

  if (definition.format === 'levels') {
    const relevantInterventions = getRelevantTrophyInterventions(
      definition,
      profile,
      interventions,
      evaluations
    );
    let highestTier: BadgeTier | null = null;

    definition.levels.forEach((level) => {
      const threshold = level.threshold ?? 0;
      const matchingInterventions = relevantInterventions.filter((intervention) =>
        matchesTrophyTrackedStatus(
          intervention,
          evaluations,
          definition.trackedInterventionStatus
        )
      );
      const averageAutonomy = getAverageAutonomy(
        matchingInterventions,
        definitions,
        evaluations
      );

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
    doesTrophyConditionMatchProfile(
      condition,
      definition,
      profile,
      interventions,
      evaluations,
      definitions
    )
  );

  return allConditionsMatch ? 'bronze' : null;
}

function getTrophyProgressSnapshotForProfile(
  definition: TrophyDefinition,
  profile: Profile,
  interventions: RecentIntervention[],
  evaluations: Record<string, InterventionEvaluation>,
  definitions: SurgicalDefinition[]
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
    const progressInterventions = getRelevantTrophyInterventions(
      definition,
      profile,
      interventions,
      evaluations,
      { ignoreTrackedStatus: true }
    ).sort((left, right) => left.savedAt.localeCompare(right.savedAt));
    const unlockInterventions = getRelevantTrophyInterventions(
      definition,
      profile,
      interventions,
      evaluations
    ).sort((left, right) => left.savedAt.localeCompare(right.savedAt));
    const currentCount = progressInterventions.length;
    const unlockCount = unlockInterventions.length;
    const averageAutonomy = getAverageAutonomy(
      unlockInterventions,
      definitions,
      evaluations
    );
    let unlockedTier: BadgeTier | null = null;
    let awardedAt: string | null = null;
    let nextTier: BadgeTier | null = null;
    let nextThreshold: number | null = null;
    const lastRelevantIntervention =
      unlockInterventions.length > 0
        ? unlockInterventions[unlockInterventions.length - 1]
        : null;

    definition.levels.forEach((level) => {
      const threshold = level.threshold ?? 0;
      const autonomySatisfied =
        level.autonomyMin == null ||
        (averageAutonomy != null && averageAutonomy >= level.autonomyMin);
      const levelUnlocked = unlockCount >= threshold && autonomySatisfied;

      if (levelUnlocked) {
        unlockedTier = level.tier;
        awardedAt =
          unlockInterventions[Math.max(0, threshold - 1)]?.savedAt ??
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
    evaluations,
    definitions
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
    const relevantInterventions = getRelevantTrophyInterventions(
      definition,
      profile,
      interventions,
      evaluations
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

  const progress = getCountProgressForTrophyCondition(
    progressCondition,
    definition,
    profile,
    interventions,
    evaluations
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

function getTrophyTierLabel(tier: BadgeTier) {
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

function getTrophyImageValueForDisplay(
  definition: TrophyDefinition,
  unlockedTier: BadgeTier | null,
  nextTier: BadgeTier | null
) {
  if (definition.format === 'levels') {
    const tierToShow = unlockedTier ?? nextTier ?? 'bronze';

    if (tierToShow === 'diamond') {
      return definition.images.diamond ?? definition.images.gold ?? definition.images.silver ?? definition.images.bronze ?? definition.images.single;
    }

    if (tierToShow === 'gold') {
      return definition.images.gold ?? definition.images.silver ?? definition.images.bronze ?? definition.images.diamond ?? definition.images.single;
    }

    if (tierToShow === 'silver') {
      return definition.images.silver ?? definition.images.bronze ?? definition.images.gold ?? definition.images.diamond ?? definition.images.single;
    }

    return definition.images.bronze ?? definition.images.silver ?? definition.images.gold ?? definition.images.diamond ?? definition.images.single;
  }

  return definition.images.single;
}

function toTrophyTimestamp(value: string | null) {
  if (!value) {
    return 0;
  }

  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? 0 : timestamp;
}

function buildMobileTrophyDisplay({
  definitions,
  evaluations,
  profile,
  recentInterventions,
  trophyDefinitions,
}: {
  definitions: SurgicalDefinition[];
  evaluations: Record<string, InterventionEvaluation>;
  profile: Profile;
  recentInterventions: RecentIntervention[];
  trophyDefinitions: TrophyDefinition[];
}) {
  const displayModels = getActiveTrophyDefinitions(trophyDefinitions)
    .map((definition) => {
      const snapshot = getTrophyProgressSnapshotForProfile(
        definition,
        profile,
        recentInterventions,
        evaluations,
        definitions
      );
      const isEarned = snapshot.unlockedTier != null;

      if (definition.visibility === 'surprise' && !isEarned) {
        return null;
      }

      const section: TrophyDisplayStatus = isEarned ? 'earned' : 'progress';
      const imageValue = isEarned
        ? getTrophyImageValueForDisplay(definition, snapshot.unlockedTier, snapshot.nextTier)
        : null;
      const subtitle = isEarned
          ? definition.format === 'levels' && snapshot.unlockedTier
            ? `Niveau ${getTrophyTierLabel(snapshot.unlockedTier)}`
            : definition.description || 'Trophée débloqué'
          : definition.format === 'levels' && snapshot.nextTier
            ? `Prochain palier : ${getTrophyTierLabel(snapshot.nextTier)}`
            : definition.description || 'Trophée actif en cours de déblocage.';

      return {
        awardedAt: snapshot.awardedAt,
        description: definition.description,
        id: definition.id,
        imageSrc: getBadgeImageSource(imageValue),
        progressCurrent: section === 'progress' ? snapshot.progressCurrent : null,
        progressTarget: section === 'progress' ? snapshot.progressTarget : null,
        section,
        subtitle,
        title: definition.title || 'Trophée sans titre',
        unlockedTier: snapshot.unlockedTier,
      } satisfies TrophyDisplayModel;
    })
    .filter((item) => item !== null)
    .sort((left, right) => toTrophyTimestamp(right.awardedAt) - toTrophyTimestamp(left.awardedAt));

  return {
    earned: displayModels.filter((item) => item.section === 'earned'),
    progress: displayModels.filter((item) => item.section === 'progress'),
  };
}

function getChecklistStepsForDraft(
  draft: InterventionDraft,
  definitions: SurgicalDefinition[]
) {
  const definition = definitions.find((item) => item.id === draft.procedureId);

  if (!definition) {
    return [];
  }

  const approachSteps = draft.approach ? definition.approachSteps[draft.approach] : null;

  if (approachSteps?.length) {
    return approachSteps;
  }

  return definition.checklistSteps.filter((step) => {
    const applicableApproaches = step.applicableApproaches ?? [];

    return (
      applicableApproaches.length === 0 ||
      (draft.approach != null && applicableApproaches.includes(draft.approach))
    );
  });
}

function getChecklistProgress(draft: InterventionDraft, definitions: SurgicalDefinition[]) {
  const steps = getChecklistStepsForDraft(draft, definitions);
  const completed = steps.filter((step) => draft.checklist[step.id] != null).length;
  const total = steps.length;

  return {
    applicable: total > 0,
    completed,
    isComplete: total === 0 || completed === total,
    steps,
    total,
  };
}

function getChecklistAverage(levels: Array<ChecklistLevel | null | undefined>) {
  const numericLevels = levels
    .filter((level): level is Exclude<ChecklistLevel, 'NA'> =>
      Boolean(level && level !== 'NA')
    )
    .map((level) => Number(level))
    .filter((level) => Number.isFinite(level));

  if (!numericLevels.length) {
    return null;
  }

  return numericLevels.reduce((sum, level) => sum + level, 0) / numericLevels.length;
}

function formatChecklistAverage(value: number | null) {
  return value == null ? '—' : `${value.toFixed(1)} / 4`;
}

function getChecklistLevelDescription(level: ChecklistLevel | null | undefined) {
  if (!level) {
    return 'Non renseigné';
  }

  return CHECKLIST_LEVEL_OPTIONS.find((option) => option.value === level)?.description ?? level;
}

function getChecklistLevelBadgeLabel(level: ChecklistLevel | null | undefined) {
  if (!level) {
    return 'Non renseigné';
  }

  return level === 'NA' ? 'NA' : `Niveau ${level}`;
}

function hasCompleteEvaluation(evaluation: InterventionEvaluation | undefined) {
  return Boolean(evaluation?.globalPerformance && evaluation.categoryDifficulty);
}

function getInterventionChecklistSteps(
  intervention: RecentIntervention,
  definitions: SurgicalDefinition[]
) {
  const definition = definitions.find((item) => item.id === intervention.procedureId);

  if (!definition) {
    return [];
  }

  const approachSteps = intervention.approach
    ? definition.approachSteps[intervention.approach]
    : null;

  if (approachSteps?.length) {
    return approachSteps;
  }

  return definition.checklistSteps.filter((step) => {
    const applicableApproaches = step.applicableApproaches ?? [];

    return (
      applicableApproaches.length === 0 ||
      (intervention.approach != null && applicableApproaches.includes(intervention.approach))
    );
  });
}

function getInterventionChecklistAverage(
  intervention: RecentIntervention,
  definitions: SurgicalDefinition[]
) {
  const definition = definitions.find((item) => item.id === intervention.procedureId);
  const steps = getInterventionChecklistSteps(intervention, definitions);
  const keyStepIds = new Set(definition?.keyStepIds ?? []);
  const applicableKeySteps = steps.filter((step) => keyStepIds.has(step.id));
  const evaluatedKeyStepLevels = applicableKeySteps
    .map((step) => intervention.checklist[step.id])
    .filter((level): level is Exclude<ChecklistLevel, 'NA'> =>
      Boolean(level && level !== 'NA')
    );

  if (
    applicableKeySteps.length === 0 ||
    evaluatedKeyStepLevels.length / applicableKeySteps.length <
      MINIMUM_KEY_STEP_COVERAGE
  ) {
    return null;
  }

  return getChecklistAverage(evaluatedKeyStepLevels);
}

function calculateAutonomyScoreFromComponents(
  keyStepAverage: number,
  globalPerformance: AdminPerformanceRating,
  categoryDifficulty: AdminCategoryDifficultyRating
) {
  const autonomyComponent = (keyStepAverage / 4) * 100;
  const performanceComponent = ((Number(globalPerformance) - 1) / 4) * 100;
  const score =
    (0.4 * autonomyComponent + 0.6 * performanceComponent) *
    DIFFICULTY_COEFFICIENTS[categoryDifficulty];

  return Math.min(100, Math.max(0, Math.round(score)));
}

function calculateMobileAutonomyScore(
  intervention: RecentIntervention,
  definitions: SurgicalDefinition[],
  evaluation: InterventionEvaluation | undefined
) {
  const keyStepAverage = getInterventionChecklistAverage(intervention, definitions);

  if (keyStepAverage == null) {
    return null;
  }

  if (
    !evaluation?.globalPerformance ||
    !evaluation.categoryDifficulty
  ) {
    return null;
  }

  return calculateAutonomyScoreFromComponents(
    keyStepAverage,
    evaluation.globalPerformance,
    evaluation.categoryDifficulty
  );
}

function formatAutonomyScore(score: number | null | undefined) {
  return score == null ? 'Non calculable' : `${Math.round(score)} / 100`;
}

function averageNumbers(values: number[]) {
  if (!values.length) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getPerformanceShortLabel(value: AdminPerformanceRating | null | undefined) {
  return value ? SENIOR_PERFORMANCE_SHORT_LABELS[value] : 'Non renseignée';
}

function getDifficultyShortLabel(value: AdminCategoryDifficultyRating | null | undefined) {
  return value ? SENIOR_DIFFICULTY_SHORT_LABELS[value] : 'Non renseignée';
}

function buildMobileStepStats(
  interventions: RecentIntervention[],
  definitions: SurgicalDefinition[]
) {
  const aggregates = new Map<
    string,
    {
      count: number;
      label: string;
      total: number;
    }
  >();

  interventions.forEach((intervention) => {
    getInterventionChecklistSteps(intervention, definitions).forEach((step) => {
      const level = intervention.checklist[step.id];

      if (!level || level === 'NA') {
        return;
      }

      const numericLevel = Number(level);

      if (!Number.isFinite(numericLevel)) {
        return;
      }

      const current = aggregates.get(step.id) ?? {
        count: 0,
        label: step.label,
        total: 0,
      };

      aggregates.set(step.id, {
        ...current,
        count: current.count + 1,
        total: current.total + numericLevel,
      });
    });
  });

  return Array.from(aggregates.entries())
    .map(([id, aggregate]) => ({
      average: aggregate.total / aggregate.count,
      count: aggregate.count,
      id,
      label: aggregate.label,
    }))
    .sort((left, right) => left.average - right.average);
}

function getLevelTone(level: ChecklistLevel) {
  if (level === 'NA') {
    return 'na';
  }

  return `level${level}` as const;
}

function getLevelPillStyle(level: ChecklistLevel) {
  if (level === 'NA') {
    return styles.flowLevelPill_na;
  }

  if (level === '0') {
    return styles.flowLevelPill_level0;
  }

  if (level === '1') {
    return styles.flowLevelPill_level1;
  }

  if (level === '2') {
    return styles.flowLevelPill_level2;
  }

  if (level === '3') {
    return styles.flowLevelPill_level3;
  }

  return styles.flowLevelPill_level4;
}

function createInitialInterventionDraft(
  definitions: SurgicalDefinition[],
  seniorProfiles: SeniorProfile[]
): InterventionDraft {
  const firstDefinition = definitions[0];
  const initialApproach = firstDefinition?.allowedApproaches[0] ?? null;
  const initialIsSalpingectomy = isSalpingectomyDefinition(firstDefinition);
  const initialSalpingectomyIndications = getSalpingectomyIndications(firstDefinition);
  const initialEntryTechniques = firstDefinition?.allowedEntryTechniques.length
    ? firstDefinition.allowedEntryTechniques
    : DEFAULT_ENTRY_TECHNIQUES;
  const shouldInitializeEntryTechnique =
    initialApproach === 'coelioscopie' || initialApproach === 'robot';

  return {
    approach: initialApproach,
    checklist: {},
    complexity: 5,
    customIndication:
      !initialIsSalpingectomy && firstDefinition?.isCustom
        ? firstDefinition.indications[0] ?? ''
        : '',
    date: getTodayInputDate(),
    entryTechnique: shouldInitializeEntryTechnique ? initialEntryTechniques[0] ?? null : null,
    indication: initialIsSalpingectomy ? initialSalpingectomyIndications[0] ?? null : null,
    laterality:
      initialIsSalpingectomy || firstDefinition?.requiresLaterality
        ? DEFAULT_LATERALITIES[0]
        : null,
    note: '',
    procedureId: firstDefinition?.id ?? '',
    role: 'operateur_principal',
    seniorProfileId: seniorProfiles[0]?.id ?? null,
  };
}

function getDefinitionForDraft(
  draft: InterventionDraft,
  definitions: SurgicalDefinition[]
) {
  return definitions.find((definition) => definition.id === draft.procedureId) ?? null;
}

function getAvailableEntryTechniques(definition: SurgicalDefinition | null | undefined) {
  return definition?.allowedEntryTechniques.length
    ? definition.allowedEntryTechniques
    : DEFAULT_ENTRY_TECHNIQUES;
}

function shouldShowEntryTechniqueForDraft(
  draft: InterventionDraft,
  definitions: SurgicalDefinition[]
) {
  return draft.approach === 'coelioscopie' || draft.approach === 'robot';
}

function shouldRequireLateralityForDraft(
  draft: InterventionDraft,
  definitions: SurgicalDefinition[]
) {
  const definition = getDefinitionForDraft(draft, definitions);
  return isSalpingectomyDefinition(definition) || Boolean(definition?.requiresLaterality);
}

function getInterventionDraftMissingFields(
  draft: InterventionDraft,
  definitions: SurgicalDefinition[]
) {
  const missingFields = [];

  if (!draft.date) {
    missingFields.push('date');
  }

  if (!draft.seniorProfileId) {
    missingFields.push('senior');
  }

  if (!draft.procedureId) {
    missingFields.push('intervention');
  }

  if (draft.complexity == null) {
    missingFields.push('difficulté');
  }

  if (!draft.role) {
    missingFields.push('rôle');
  }

  if (shouldShowEntryTechniqueForDraft(draft, definitions) && !draft.entryTechnique) {
    missingFields.push("technique d’entrée");
  }

  if (shouldRequireLateralityForDraft(draft, definitions) && !draft.laterality) {
    missingFields.push('latéralité');
  }

  return missingFields;
}

function isInterventionDraftReady(
  draft: InterventionDraft,
  definitions: SurgicalDefinition[]
) {
  return Boolean(
    draft.date &&
      draft.procedureId &&
      draft.seniorProfileId &&
      draft.role &&
      draft.complexity != null &&
      getInterventionDraftMissingFields(draft, definitions).length === 0
  );
}

async function loadNotebookDocument(profile: Profile, accessToken: string) {
  const profileId = encodeURIComponent(profile.id);
  const response = await supabaseRequest(
    `/rest/v1/notebook_documents?select=profile_id,content_html,updated_at&profile_id=eq.${profileId}&limit=1`,
    undefined,
    accessToken
  );
  const rows = (await response.json()) as NotebookDocumentRow[];
  return rows[0] ? toNotebookDocument(rows[0]) : null;
}

async function loadTrophyDefinitions(accessToken: string) {
  const response = await supabaseRequest(
    '/rest/v1/trophy_definitions?select=id,title,status,definition&order=title.asc',
    undefined,
    accessToken
  );
  const rows = (await response.json()) as TrophyDefinitionRow[];
  return rows.map(toTrophyDefinition);
}

async function loadTrophyAwards(profile: Profile, accessToken: string) {
  const filters = profile.role === 'internal' ? `&profile_id=eq.${encodeURIComponent(profile.id)}` : '';
  const response = await supabaseRequest(
    `/rest/v1/trophy_awards?select=id,trophy_id,profile_id,tier,awarded_at&order=awarded_at.desc${filters}`,
    undefined,
    accessToken
  );
  const rows = (await response.json()) as TrophyAwardRow[];
  return rows.map(toTrophyAward);
}

async function loadSurgicalDefinitions(accessToken: string) {
  const response = await supabaseRequest(
    '/rest/v1/surgical_intervention_definitions?select=id,name,status,definition&status=neq.archived&order=name.asc',
    undefined,
    accessToken
  );
  const rows = (await response.json()) as SurgicalDefinitionRow[];
  return rows.map(toSurgicalDefinition);
}

async function loadSeniorProfiles(accessToken: string) {
  const response = await supabaseRequest(
    '/rest/v1/profiles?select=id,first_name,last_name&role=eq.senior&order=last_name.asc,first_name.asc',
    undefined,
    accessToken
  );
  const rows = (await response.json()) as SeniorProfileRow[];

  return rows.map((row) => ({
    firstName: row.first_name,
    id: row.id,
    lastName: row.last_name,
  }));
}

async function loadInternalProfiles(profile: Profile, accessToken: string) {
  if (profile.role !== 'senior') {
    return [];
  }

  const response = await supabaseRequest(
    '/rest/v1/profiles?select=id,first_name,last_name,semester,current_rotation&role=eq.internal&order=last_name.asc,first_name.asc',
    undefined,
    accessToken
  );
  const rows = (await response.json()) as InternalProfileSummaryRow[];

  return rows.map((row) => ({
    currentRotation: row.current_rotation,
    firstName: row.first_name,
    id: row.id,
    lastName: row.last_name,
    semester: row.semester,
  }));
}

function toRecentIntervention(
  row: RecentInterventionRow,
  definitions: SurgicalDefinition[]
): RecentIntervention {
  const definition = definitions.find((item) => item.id === row.procedure_id);

  return {
    approach: row.approach,
    autonomyScore: row.autonomy_score,
    checklist: readChecklistRecord(row.checklist),
    complexity: row.complexity,
    customIndication: row.custom_indication,
    date: row.intervention_date,
    entryTechnique: row.entry_technique,
    id: row.id,
    indication: row.indication,
    indicationComment: row.indication_comment ?? '',
    internalProfileId: row.internal_profile_id,
    laterality: row.laterality,
    procedureId: row.procedure_id,
    procedureName: definition?.name ?? humanize(row.procedure_id),
    role: row.role,
    savedAt: row.saved_at,
    seniorProfileId: row.senior_profile_id,
    surgeryContext: row.surgery_context,
  };
}

async function loadRecentInterventions(
  profile: Profile,
  definitions: SurgicalDefinition[],
  accessToken: string
) {
  const profileId = encodeURIComponent(profile.id);
  const filters =
    profile.role === 'internal'
      ? [`internal_profile_id=eq.${profileId}`]
      : profile.role === 'senior'
        ? [`senior_profile_id=eq.${profileId}`]
        : [];
  const query = [
    'select=id,internal_profile_id,senior_profile_id,procedure_id,intervention_date,approach,entry_technique,laterality,surgery_context,role,indication,indication_comment,custom_indication,complexity,checklist,autonomy_score,saved_at',
    'deleted_at=is.null',
    'order=intervention_date.desc,saved_at.desc',
    'limit=80',
    ...filters,
  ].join('&');
  const response = await supabaseRequest(
    `/rest/v1/interventions?${query}`,
    undefined,
    accessToken
  );
  const rows = (await response.json()) as RecentInterventionRow[];
  return rows.map((row) => toRecentIntervention(row, definitions));
}

function toInterventionEvaluation(row: InterventionEvaluationRow): InterventionEvaluation {
  return {
    categoryDifficulty: row.category_difficulty,
    globalPerformance: row.global_performance,
    interventionId: row.intervention_id,
    seniorComment: row.senior_comment ?? '',
    seniorProfileId: row.senior_profile_id,
    updatedAt: row.updated_at,
  };
}

async function loadInterventionEvaluations(
  interventions: RecentIntervention[],
  accessToken: string
) {
  if (!interventions.length) {
    return {};
  }

  const ids = interventions.map((intervention) => intervention.id).join(',');
  const response = await supabaseRequest(
    `/rest/v1/intervention_evaluations?select=intervention_id,senior_profile_id,global_performance,category_difficulty,senior_comment,updated_at&intervention_id=in.(${ids})`,
    undefined,
    accessToken
  );
  const rows = (await response.json()) as InterventionEvaluationRow[];

  return rows.reduce<Record<string, InterventionEvaluation>>((record, row) => {
    const evaluation = toInterventionEvaluation(row);
    record[evaluation.interventionId] = evaluation;
    return record;
  }, {});
}

async function upsertMobileEvaluation(
  profile: Profile,
  intervention: RecentIntervention,
  draft: SeniorEvaluationDraft,
  accessToken: string
) {
  if (profile.role !== 'senior') {
    throw new Error("L’évaluation mobile est réservée aux comptes seniors.");
  }

  if (!draft.globalPerformance || !draft.categoryDifficulty) {
    throw new Error('Sélectionne une performance et une difficulté avant de valider.');
  }

  const response = await supabaseRequest(
    '/rest/v1/intervention_evaluations?on_conflict=intervention_id',
    {
      body: JSON.stringify({
        category_difficulty: draft.categoryDifficulty,
        global_performance: draft.globalPerformance,
        intervention_id: intervention.id,
        senior_comment: draft.seniorComment.trim(),
        senior_profile_id: profile.id,
        updated_at: new Date().toISOString(),
      }),
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      method: 'POST',
    },
    accessToken
  );
  const rows = (await response.json()) as InterventionEvaluationRow[];

  if (!rows[0]) {
    throw new Error("L’évaluation n’a pas pu être enregistrée.");
  }

  return toInterventionEvaluation(rows[0]);
}

async function createMobileIntervention(
  profile: Profile,
  draft: InterventionDraft,
  accessToken: string
) {
  if (profile.role !== 'internal') {
    throw new Error('La saisie mobile est activee pour le compte interne.');
  }

  if (!draft.procedureId || !draft.date || !draft.role || !draft.seniorProfileId) {
    throw new Error('Choisis au minimum une intervention, une date, un senior et ton rôle.');
  }

  const savedAt = new Date().toISOString();
  const seniorProfileId =
    draft.seniorProfileId === OTHER_SENIOR_OPTION_ID ? null : draft.seniorProfileId;
  const body = {
    approach: draft.approach,
    autonomy_score: null,
    checklist: draft.checklist,
    client_mutation_id: createMutationId(profile.id),
    complexity: draft.complexity,
    created_by_profile_id: profile.id,
    custom_indication: draft.customIndication.trim() || null,
    deleted_at: null,
    entry_technique: draft.entryTechnique,
    indication: draft.indication,
    indication_comment: draft.note.trim(),
    internal_profile_id: profile.id,
    intervention_date: draft.date,
    laterality: draft.laterality,
    procedure_id: draft.procedureId,
    role: draft.role,
    saved_at: savedAt,
    senior_profile_id: seniorProfileId,
    surgery_context: null,
  };

  const response = await supabaseRequest(
    '/rest/v1/interventions',
    {
      body: JSON.stringify(body),
      headers: {
        Prefer: 'return=representation',
      },
      method: 'POST',
    },
    accessToken
  );
  return (await response.json()) as RecentInterventionRow[];
}

async function upsertNotebookDocument(
  profile: Profile,
  contentHtml: string,
  accessToken: string
) {
  const response = await supabaseRequest(
    '/rest/v1/notebook_documents',
    {
      body: JSON.stringify({
        content_html: contentHtml,
        profile_id: profile.id,
        updated_at: new Date().toISOString(),
      }),
      headers: {
        Prefer: 'resolution=merge-duplicates,return=representation',
      },
      method: 'POST',
    },
    accessToken
  );
  const rows = (await response.json()) as NotebookDocumentRow[];
  return rows[0] ? toNotebookDocument(rows[0]) : null;
}

export default function App() {
  const reveal = useRef(new Animated.Value(0)).current;
  const [definitions, setDefinitions] = useState<SurgicalDefinition[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [evaluations, setEvaluations] = useState<Record<string, InterventionEvaluation>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [internalProfiles, setInternalProfiles] = useState<InternalProfileSummary[]>([]);
  const [isEvaluationSaving, setIsEvaluationSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isNotebookSaving, setIsNotebookSaving] = useState(false);
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [interventionDraft, setInterventionDraft] = useState<InterventionDraft | null>(null);
  const [login, setLogin] = useState('joris.poquet');
  const [notebookDocument, setNotebookDocument] = useState<NotebookDocument | null>(null);
  const [notebookError, setNotebookError] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [recentInterventions, setRecentInterventions] = useState<RecentIntervention[]>([]);
  const [screen, setScreen] = useState<MobileScreen>('dashboard');
  const [selectedEvaluationInterventionId, setSelectedEvaluationInterventionId] = useState<string | null>(null);
  const [seniorProfiles, setSeniorProfiles] = useState<SeniorProfile[]>([]);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [trophyAwards, setTrophyAwards] = useState<TrophyAward[]>([]);
  const [trophyDefinitions, setTrophyDefinitions] = useState<TrophyDefinition[]>([]);

  useEffect(() => {
    reveal.setValue(0);
    Animated.timing(reveal, {
      duration: 520,
      toValue: 1,
      useNativeDriver: true,
    }).start();
  }, [profile, reveal]);

  const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
  const isConnected = Boolean(profile && session);

  useEffect(() => {
    let isCancelled = false;

    async function restoreStoredSession() {
      if (!isConfigured) {
        setIsRestoringSession(false);
        return;
      }

      setIsRestoringSession(true);

      try {
        const storedSessionPayload = await SecureStore.getItemAsync(STORED_SESSION_KEY);

        if (!storedSessionPayload) {
          return;
        }

        const storedSession = JSON.parse(storedSessionPayload) as AuthSession;

        if (!storedSession.refresh_token) {
          await SecureStore.deleteItemAsync(STORED_SESSION_KEY);
          return;
        }

        const refreshedSession = await refreshSupabaseSession(storedSession.refresh_token);

        if (isCancelled) {
          return;
        }

        await hydrateAuthenticatedSession(refreshedSession);
        await SecureStore.setItemAsync(
          STORED_SESSION_KEY,
          JSON.stringify(refreshedSession)
        );
      } catch {
        await SecureStore.deleteItemAsync(STORED_SESSION_KEY);
      } finally {
        if (!isCancelled) {
          setIsRestoringSession(false);
        }
      }
    }

    void restoreStoredSession();

    return () => {
      isCancelled = true;
    };
  }, [isConfigured]);

  function handleMobileNavigation(nextScreen: MobileScreen) {
    setError(null);
    setFormError(null);

    if (nextScreen === 'new-intervention' && screen !== 'checklist' && screen !== 'summary') {
      setInterventionDraft(createInitialInterventionDraft(definitions, seniorProfiles));
    }

    setScreen(nextScreen);
  }

  async function hydrateAuthenticatedSession(nextSession: AuthSession) {
    const nextProfile = await loadProfile(nextSession);
    const nextDefinitions = await loadSurgicalDefinitions(nextSession.access_token);
    const [
      nextSummary,
      nextRecentInterventions,
      nextNotebookDocument,
      nextSeniorProfiles,
      nextInternalProfiles,
      nextTrophyDefinitions,
      nextTrophyAwards,
    ] = await Promise.all([
      loadDashboardSummary(nextProfile, nextSession.access_token),
      loadRecentInterventions(nextProfile, nextDefinitions, nextSession.access_token),
      loadNotebookDocument(nextProfile, nextSession.access_token),
      loadSeniorProfiles(nextSession.access_token).catch(() => []),
      loadInternalProfiles(nextProfile, nextSession.access_token).catch(() => []),
      loadTrophyDefinitions(nextSession.access_token),
      loadTrophyAwards(nextProfile, nextSession.access_token),
    ]);
    const nextEvaluations = await loadInterventionEvaluations(
      nextRecentInterventions,
      nextSession.access_token
    );

    setDefinitions(nextDefinitions);
    setEvaluationError(null);
    setEvaluations(nextEvaluations);
    setInternalProfiles(nextInternalProfiles);
    setNotebookDocument(nextNotebookDocument);
    setNotebookError(null);
    setRecentInterventions(nextRecentInterventions);
    setSeniorProfiles(nextSeniorProfiles);
    setSession(nextSession);
    setProfile(nextProfile);
    setScreen('dashboard');
    setSelectedEvaluationInterventionId(null);
    setSummary(nextSummary);
    setTrophyAwards(nextTrophyAwards);
    setTrophyDefinitions(nextTrophyDefinitions);
  }

  async function handleSignIn() {
    setError(null);
    const cleanPassword = password.trim();

    if (!cleanPassword) {
      setError('Renseigne ton mot de passe.');
      return;
    }

    setIsLoading(true);

    try {
      const nextSession = await signIn(login, cleanPassword);
      await hydrateAuthenticatedSession(nextSession);
      await SecureStore.setItemAsync(STORED_SESSION_KEY, JSON.stringify(nextSession));
      setPassword('');
      setSuccessMessage(null);
    } catch (caughtError) {
      setError(getLoginErrorMessage(caughtError));
    } finally {
      setIsLoading(false);
    }
  }

  function handleSignOut() {
    void SecureStore.deleteItemAsync(STORED_SESSION_KEY);
    setError(null);
    setProfile(null);
    setEvaluations({});
    setEvaluationError(null);
    setRecentInterventions([]);
    setInternalProfiles([]);
    setSeniorProfiles([]);
    setNotebookDocument(null);
    setNotebookError(null);
    setScreen('dashboard');
    setSession(null);
    setSummary(null);
    setTrophyAwards([]);
    setTrophyDefinitions([]);
    setDefinitions([]);
    setInterventionDraft(null);
    setSelectedEvaluationInterventionId(null);
    setFormError(null);
    setSuccessMessage(null);
    setLogin('joris.poquet');
  }

  async function refreshSessionData(
    nextProfile: Profile,
    accessToken: string
  ) {
    const nextDefinitions = await loadSurgicalDefinitions(accessToken);
    const [
      nextSummary,
      nextRecentInterventions,
      nextNotebookDocument,
      nextSeniorProfiles,
      nextInternalProfiles,
      nextTrophyDefinitions,
      nextTrophyAwards,
    ] = await Promise.all([
      loadDashboardSummary(nextProfile, accessToken),
      loadRecentInterventions(nextProfile, nextDefinitions, accessToken),
      loadNotebookDocument(nextProfile, accessToken),
      loadSeniorProfiles(accessToken).catch(() => []),
      loadInternalProfiles(nextProfile, accessToken).catch(() => []),
      loadTrophyDefinitions(accessToken),
      loadTrophyAwards(nextProfile, accessToken),
    ]);
    const nextEvaluations = await loadInterventionEvaluations(
      nextRecentInterventions,
      accessToken
    );

    setDefinitions(nextDefinitions);
    setSummary(nextSummary);
    setRecentInterventions(nextRecentInterventions);
    setNotebookDocument(nextNotebookDocument);
    setSeniorProfiles(nextSeniorProfiles);
    setInternalProfiles(nextInternalProfiles);
    setTrophyDefinitions(nextTrophyDefinitions);
    setTrophyAwards(nextTrophyAwards);
    setEvaluations(nextEvaluations);
  }

  useEffect(() => {
    if (!profile || !session) {
      return undefined;
    }

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        return;
      }

      void refreshSessionData(profile, session.access_token).catch((caughtError) => {
        console.warn('Mobile foreground sync failed', caughtError);
      });
    });

    return () => {
      subscription.remove();
    };
  }, [profile, session]);

  function handleOpenSeniorEvaluation(interventionId: string) {
    setEvaluationError(null);
    setSelectedEvaluationInterventionId(interventionId);
    setScreen('senior-evaluation');
  }

  async function handleSaveSeniorEvaluation(
    intervention: RecentIntervention,
    draft: SeniorEvaluationDraft
  ) {
    if (!profile || !session) {
      setEvaluationError('Session mobile introuvable. Reconnecte-toi puis reessaie.');
      return;
    }

    setEvaluationError(null);
    setIsEvaluationSaving(true);

    try {
      const nextEvaluation = await upsertMobileEvaluation(
        profile,
        intervention,
        draft,
        session.access_token
      );
      setEvaluations((currentEvaluations) => ({
        ...currentEvaluations,
        [nextEvaluation.interventionId]: nextEvaluation,
      }));
      setSuccessMessage('Évaluation senior validée.');
      await refreshSessionData(profile, session.access_token);
      setSelectedEvaluationInterventionId(null);
      setScreen('dashboard');
    } catch (caughtError) {
      setEvaluationError(
        caughtError instanceof Error
          ? caughtError.message
          : "Impossible d'enregistrer cette évaluation."
      );
    } finally {
      setIsEvaluationSaving(false);
    }
  }

  function handleContinueFromInterventionForm(draft: InterventionDraft) {
    setFormError(null);

    const missingFields = getInterventionDraftMissingFields(draft, definitions);

    if (missingFields.length > 0) {
      setFormError(`Champs à compléter : ${missingFields.join(', ')}.`);
      return;
    }

    setInterventionDraft(draft);
    setScreen('checklist');
  }

  function handleUpdateInterventionDraft(nextDraft: InterventionDraft) {
    setInterventionDraft(nextDraft);
  }

  async function handleCreateIntervention(draft: InterventionDraft) {
    if (!profile || !session) {
      setFormError('Session mobile introuvable. Reconnecte-toi puis reessaie.');
      return;
    }

    setFormError(null);

    const missingFields = getInterventionDraftMissingFields(draft, definitions);

    if (missingFields.length > 0) {
      setFormError(`Champs à compléter : ${missingFields.join(', ')}.`);
      return;
    }

    setIsSaving(true);

    try {
      await createMobileIntervention(profile, draft, session.access_token);
      await refreshSessionData(profile, session.access_token);
      setSuccessMessage('Intervention enregistrée et synchronisée.');
      setInterventionDraft(null);
      setScreen('history');
    } catch (caughtError) {
      setFormError(
        caughtError instanceof Error
          ? caughtError.message
          : "Impossible d'enregistrer cette intervention."
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveNotebookText(text: string) {
    if (!profile || !session) {
      setNotebookError('Session mobile introuvable. Reconnecte-toi puis reessaie.');
      return;
    }

    setNotebookError(null);
    setIsNotebookSaving(true);

    try {
      const nextDocument = await upsertNotebookDocument(
        profile,
        notebookTextToHtml(text),
        session.access_token
      );
      setNotebookDocument(nextDocument);
      setSuccessMessage('Bloc-notes synchronise.');
    } catch (caughtError) {
      setNotebookError(
        caughtError instanceof Error
          ? caughtError.message
          : "Impossible d'enregistrer le bloc-notes."
      );
    } finally {
      setIsNotebookSaving(false);
    }
  }

  async function handleUpdateProfileSettings(input: ProfileSettingsInput) {
    if (!profile || !session) {
      throw new Error('Session mobile introuvable. Reconnecte-toi puis reessaie.');
    }

    setIsProfileSaving(true);

    try {
      const nextProfile = await updateMobileProfileSettings(
        profile,
        input,
        session.access_token
      );
      setProfile(nextProfile);
      await refreshSessionData(nextProfile, session.access_token);
      setSuccessMessage('Profil synchronisé.');
    } finally {
      setIsProfileSaving(false);
    }
  }

  async function handleUpdateAvatarImage(avatarImageSrc: string | null) {
    if (!profile || !session) {
      throw new Error('Session mobile introuvable. Reconnecte-toi puis reessaie.');
    }

    setIsProfileSaving(true);

    try {
      const nextProfile = await updateMobileAvatarImage(
        profile,
        avatarImageSrc,
        session.access_token
      );
      setProfile(nextProfile);
      await refreshSessionData(nextProfile, session.access_token);
      setSuccessMessage(
        avatarImageSrc ? 'Photo de profil synchronisée.' : 'Photo de profil supprimée.'
      );
    } finally {
      setIsProfileSaving(false);
    }
  }

  async function handleUpdatePassword(input: PasswordUpdateInput) {
    if (!profile || !session) {
      throw new Error('Session mobile introuvable. Reconnecte-toi puis reessaie.');
    }

    const currentPassword = input.currentPassword.trim();
    const nextPassword = input.nextPassword.trim();

    setIsProfileSaving(true);

    try {
      try {
        await signIn(profile.loginId, currentPassword);
      } catch {
        throw new Error('Le mot de passe actuel est incorrect.');
      }

      await updateMobileAccountPassword(nextPassword, session.access_token);
      setSuccessMessage('Mot de passe mis à jour.');
    } finally {
      setIsProfileSaving(false);
    }
  }

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboard}
        >
          <ScrollView
            contentContainerStyle={[
              styles.scrollContent,
              isConnected ? styles.scrollContentAuthenticated : styles.scrollContentCentered,
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.backgroundHalo} />
            <View style={styles.backgroundShard} />
            <Animated.View
              style={[
                styles.screen,
                {
                  opacity: reveal,
                  transform: [
                    {
                      translateY: reveal.interpolate({
                        inputRange: [0, 1],
                        outputRange: [16, 0],
                      }),
                    },
                  ],
                },
              ]}
            >
              {!isConfigured ? (
                <ConfigurationNotice />
              ) : isRestoringSession ? (
                <RestoringSessionNotice />
              ) : profile && session ? (
                <>
                  {screen === 'dashboard' ? (
                    <DashboardScreen
                      definitions={definitions}
                      evaluations={evaluations}
                      internalProfiles={internalProfiles}
                      onNavigate={handleMobileNavigation}
                      onOpenSeniorEvaluation={handleOpenSeniorEvaluation}
                      onSignOut={handleSignOut}
                      profile={profile}
                      recentInterventions={recentInterventions}
                      seniorProfiles={seniorProfiles}
                      successMessage={successMessage}
                      summary={summary}
                      trophyDefinitions={trophyDefinitions}
                    />
                  ) : null}
                  {screen === 'senior-evaluation' ? (
                    <SeniorEvaluationScreen
                      definitions={definitions}
                      error={evaluationError}
                      evaluation={
                        selectedEvaluationInterventionId
                          ? evaluations[selectedEvaluationInterventionId]
                          : undefined
                      }
                      internalProfiles={internalProfiles}
                      intervention={
                        recentInterventions.find(
                          (intervention) =>
                            intervention.id === selectedEvaluationInterventionId
                        ) ?? null
                      }
                      isSaving={isEvaluationSaving}
                      onBack={() => {
                        setEvaluationError(null);
                        setSelectedEvaluationInterventionId(null);
                        setScreen('dashboard');
                      }}
                      onSave={handleSaveSeniorEvaluation}
                    />
                  ) : null}
                  {screen === 'new-intervention' ? (
                    <NewInterventionScreen
                      definitions={definitions}
                      error={formError}
                      initialDraft={interventionDraft}
                      onBack={() => {
                        setFormError(null);
                        setScreen('dashboard');
                      }}
                      onContinue={handleContinueFromInterventionForm}
                      profile={profile}
                      seniorProfiles={seniorProfiles}
                    />
                  ) : null}
                  {screen === 'checklist' && interventionDraft ? (
                    <ChecklistScreen
                      definitions={definitions}
                      draft={interventionDraft}
                      onBack={() => handleMobileNavigation('new-intervention')}
                      onContinue={() => handleMobileNavigation('summary')}
                      onDraftChange={handleUpdateInterventionDraft}
                    />
                  ) : null}
                  {screen === 'summary' && interventionDraft ? (
                    <SummaryScreen
                      definitions={definitions}
                      draft={interventionDraft}
                      error={formError}
                      isSaving={isSaving}
                      onBack={() => handleMobileNavigation('checklist')}
                      onSubmit={() => handleCreateIntervention(interventionDraft)}
                      seniorProfiles={seniorProfiles}
                    />
                  ) : null}
                  {screen === 'history' ? (
                    <HistoryScreen
                      definitions={definitions}
                      evaluations={evaluations}
                      interventions={recentInterventions}
                      profile={profile}
                      seniorProfiles={seniorProfiles}
                      trophyDefinitions={trophyDefinitions}
                    />
                  ) : null}
                  {screen === 'trophies' ? (
                    <TrophiesScreen
                      definitions={definitions}
                      evaluations={evaluations}
                      profile={profile}
                      recentInterventions={recentInterventions}
                      onBack={() => handleMobileNavigation('dashboard')}
                      trophyDefinitions={trophyDefinitions}
                    />
                  ) : null}
                  {screen === 'guides' ? (
                    <GuidesScreen />
                  ) : null}
                  {screen === 'profile' ? (
                    <ProfileScreen
                      definitions={definitions}
                      evaluations={evaluations}
                      isSaving={isProfileSaving}
                      onSignOut={handleSignOut}
                      onUpdateAvatarImage={handleUpdateAvatarImage}
                      onUpdatePassword={handleUpdatePassword}
                      onUpdateProfileSettings={handleUpdateProfileSettings}
                      profile={profile}
                      recentInterventions={recentInterventions}
                      seniorProfiles={seniorProfiles}
                      summary={summary}
                    />
                  ) : null}
                  {screen === 'notebook' ? (
                    <NotebookScreen
                      document={notebookDocument}
                      error={notebookError}
                      isSaving={isNotebookSaving}
                      onBack={() => handleMobileNavigation('dashboard')}
                      onSave={handleSaveNotebookText}
                      recentInterventions={recentInterventions}
                    />
                  ) : null}
                </>
              ) : (
                <LoginScreen
                  error={error}
                  isLoading={isLoading}
                  login={login}
                  onLoginChange={setLogin}
                  onPasswordChange={setPassword}
                  onSubmit={handleSignIn}
                  password={password}
                />
              )}
            </Animated.View>
          </ScrollView>
          {profile && session && profile.role === 'internal' ? (
            <MobileBottomNavigation
              activeScreen={screen}
              canCreateIntervention={profile.role === 'internal'}
              onNavigate={handleMobileNavigation}
            />
          ) : null}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function ConfigurationNotice() {
  return (
    <View style={styles.noticeCard}>
      <Text style={styles.kicker}>Configuration requise</Text>
      <Text style={styles.title}>Supabase n'est pas encore branche dans Expo.</Text>
      <Text style={styles.noticeText}>
        Ajoute les variables EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_ANON_KEY
        dans mobile/.env.local, puis relance Expo.
      </Text>
    </View>
  );
}

function RestoringSessionNotice() {
  return (
    <View style={styles.noticeCard}>
      <ActivityIndicator color={colors.teal} />
      <Text style={styles.cardTitle}>Connexion en cours</Text>
      <Text style={styles.noticeText}>
        On restaure ta session sécurisée et les données synchronisées.
      </Text>
    </View>
  );
}

type LoginScreenProps = {
  error: string | null;
  isLoading: boolean;
  login: string;
  onLoginChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: () => void;
  password: string;
};

function LoginScreen({
  error,
  isLoading,
  login,
  onLoginChange,
  onPasswordChange,
  onSubmit,
  password,
}: LoginScreenProps) {
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  return (
    <View style={styles.loginLayout}>
      <View style={styles.brandBlock}>
        <Image
          accessibilityLabel="Mon Journal de Bloc"
          resizeMode="contain"
          source={MONJDB_LOGO}
          style={styles.brandLogo as ImageStyle}
        />
      </View>

      <View style={styles.loginCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Connexion</Text>
        </View>

        <Text style={styles.label}>Identifiant</Text>
        <TextInput
          autoCapitalize="none"
          autoComplete="username"
          autoCorrect={false}
          onChangeText={onLoginChange}
          placeholder="joris.poquet ou email senior"
          placeholderTextColor={colors.muted}
          style={styles.input}
          value={login}
        />

        <Text style={styles.label}>Mot de passe</Text>
        <TextInput
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect={false}
          onChangeText={onPasswordChange}
          placeholder="Mot de passe"
          placeholderTextColor={colors.muted}
          secureTextEntry={!isPasswordVisible}
          spellCheck={false}
          style={styles.input}
          textContentType="none"
          value={password}
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => setIsPasswordVisible((currentValue) => !currentValue)}
          style={styles.passwordVisibilityButton}
        >
          <Text style={styles.passwordVisibilityText}>
            {isPasswordVisible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
          </Text>
        </Pressable>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          disabled={isLoading}
          onPress={onSubmit}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.primaryButtonPressed,
            isLoading && styles.primaryButtonDisabled,
          ]}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.paper} />
          ) : (
            <Text style={styles.primaryButtonText}>Entrer dans l'app</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

type DashboardScreenProps = {
  definitions: SurgicalDefinition[];
  evaluations: Record<string, InterventionEvaluation>;
  internalProfiles: InternalProfileSummary[];
  onNavigate: (screen: MobileScreen) => void;
  onOpenSeniorEvaluation: (interventionId: string) => void;
  onSignOut: () => void;
  profile: Profile;
  recentInterventions: RecentIntervention[];
  seniorProfiles: SeniorProfile[];
  successMessage: string | null;
  summary: DashboardSummary | null;
  trophyDefinitions: TrophyDefinition[];
};

function DashboardScreen({
  definitions,
  evaluations,
  internalProfiles,
  onNavigate,
  onOpenSeniorEvaluation,
  onSignOut,
  profile,
  recentInterventions,
  seniorProfiles,
  successMessage,
  summary,
  trophyDefinitions,
}: DashboardScreenProps) {
  const fullName = `${profile.firstName} ${profile.lastName}`;
  const isInternal = profile.role === 'internal';
  const latestInterventions = recentInterventions.slice(0, 5);
  const pendingSeniorEvaluations = recentInterventions
    .filter((intervention) => !hasCompleteEvaluation(evaluations[intervention.id]))
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt));
  const evaluatedSeniorInterventions = recentInterventions.filter((intervention) =>
    hasCompleteEvaluation(evaluations[intervention.id])
  );
  const trophyDisplay = buildMobileTrophyDisplay({
    definitions,
    evaluations,
    profile,
    recentInterventions,
    trophyDefinitions,
  });
  const trophyPreview = [
    ...trophyDisplay.earned.map((item) => ({
      id: item.id,
      imageSrc: item.imageSrc,
      isEarned: true,
      meta: item.awardedAt
        ? `Obtenu le ${formatDisplayDate(item.awardedAt.slice(0, 10))}`
        : item.subtitle,
      title: item.title,
    })),
    ...trophyDisplay.progress.map((item) => ({
      id: item.id,
      imageSrc: item.imageSrc,
      isEarned: false,
      meta: item.subtitle,
      title: item.title,
    })),
  ].slice(0, 3);
  const statusLabel = isInternal
    ? `Interne · ${profile.semester ?? 'Semestre non renseigné'}`
    : 'Senior';
  const rotationLabel = isInternal
    ? profile.currentRotation ?? 'Rotation non renseignée'
    : 'Interventions attribuées';

  return (
    <View style={styles.homeLayout}>
      <View style={styles.homeHeader}>
        <Text
          adjustsFontSizeToFit
          minimumFontScale={0.84}
          numberOfLines={1}
          style={styles.homeTitle}
        >
          Mon Journal de Bloc
        </Text>
      </View>

      {successMessage ? (
        <View style={styles.successBanner}>
          <Text style={styles.successText}>{successMessage}</Text>
        </View>
      ) : null}

      <View style={styles.homeProfileCard}>
        <View style={styles.homeProfileCopy}>
          <Text style={styles.homeEyebrow}>Bonjour</Text>
          <Text style={styles.homeProfileName}>
            {isInternal ? fullName : `Dr ${fullName}`}
          </Text>
          <Text style={styles.homeProfileStatus}>{statusLabel}</Text>
          <Text style={styles.homeProfileMeta}>{rotationLabel}</Text>
          <Text style={styles.homeProfileHospital}>CHU de Nantes</Text>
        </View>
        <View style={styles.homeAvatar}>
          <Text style={styles.homeAvatarText}>{getInitials(profile)}</Text>
        </View>
      </View>

      {isInternal ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => onNavigate('notebook')}
          style={({ pressed }) => [styles.homeNoteLink, pressed && styles.homePressed]}
        >
          <View style={styles.homeNoteIcon}>
            <NotebookTabs color="#B87D04" size={30} strokeWidth={2.1} />
          </View>
          <View style={styles.homeNoteCopy}>
            <Text style={styles.homeNoteTitle}>Bloc-notes</Text>
            <Text style={styles.homeNoteSubtitle}>Notes personnelles</Text>
          </View>
          <ChevronRight color="#344665" size={24} strokeWidth={2.1} />
        </Pressable>
      ) : null}

      {isInternal ? (
        <View style={styles.homeCard}>
          <HomeSectionHeader
            actionLabel="Voir la vitrine"
            onAction={() => onNavigate('trophies')}
            title="Derniers trophées"
          />
          {trophyPreview.length ? (
            <View style={styles.homeTrophyStrip}>
              {trophyPreview.map((item) => (
                <HomeTrophyPreviewCard item={item} key={item.id} />
              ))}
            </View>
          ) : (
            <View style={styles.homeEmptyState}>
              <View style={styles.homeEmptyIcon}>
                <Trophy color={colors.teal} size={24} strokeWidth={2.1} />
              </View>
              <Text style={styles.homeEmptyTitle}>Aucun trophée actif pour le moment</Text>
              <Text style={styles.homeEmptyText}>
                Les trophées apparaîtront ici dès qu’ils seront activés dans le catalogue administrateur.
              </Text>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.homeCard}>
          <HomeSectionHeader title="Suivi des internes" />
          <View style={styles.homeMetricGrid}>
            <View style={styles.homeMetricCard}>
              <Text style={styles.homeMetricValue}>{pendingSeniorEvaluations.length}</Text>
              <Text style={styles.homeMetricLabel}>À évaluer</Text>
            </View>
            <View style={styles.homeMetricCard}>
              <Text style={styles.homeMetricValue}>{evaluatedSeniorInterventions.length}</Text>
              <Text style={styles.homeMetricLabel}>Évaluées</Text>
            </View>
          </View>
        </View>
      )}

      <View style={styles.homeCard}>
        {isInternal ? (
          <HomeSectionHeader
            actionLabel="Voir l'historique"
            onAction={() => onNavigate('history')}
            title="Dernières interventions"
          />
        ) : (
          <HomeSectionHeader title="Interventions à évaluer" />
        )}
        {isInternal && latestInterventions.length ? (
          <View style={styles.homeInterventionList}>
            {latestInterventions.map((intervention) => (
              <HomeInterventionCard
                evaluation={evaluations[intervention.id]}
                intervention={intervention}
                key={intervention.id}
                seniorProfiles={seniorProfiles}
              />
            ))}
          </View>
        ) : null}
        {!isInternal && pendingSeniorEvaluations.length ? (
          <View style={styles.homeInterventionList}>
            {pendingSeniorEvaluations.slice(0, 5).map((intervention) => (
              <SeniorEvaluationPreviewCard
                evaluation={evaluations[intervention.id]}
                internalProfiles={internalProfiles}
                intervention={intervention}
                key={intervention.id}
                onPress={() => onOpenSeniorEvaluation(intervention.id)}
              />
            ))}
          </View>
        ) : null}
        {(isInternal && !latestInterventions.length) ||
        (!isInternal && !pendingSeniorEvaluations.length) ? (
          <Text style={styles.homeEmptyLine}>
            {isInternal
              ? 'Aucune intervention enregistrée'
              : 'Aucune intervention en attente d’évaluation.'}
          </Text>
        ) : null}
      </View>

      <Pressable accessibilityRole="button" onPress={onSignOut} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Déconnexion</Text>
      </Pressable>
    </View>
  );
}

type HomeSectionHeaderProps = {
  actionLabel?: string;
  onAction?: () => void;
  title: string;
};

function HomeSectionHeader({ actionLabel, onAction, title }: HomeSectionHeaderProps) {
  return (
    <View style={styles.homeCardHeader}>
      <Text style={styles.homeCardTitle}>{title}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={styles.homeCardLink}>
          <Text numberOfLines={2} style={styles.homeCardLinkText}>
            {actionLabel}
          </Text>
          <ChevronRight color={colors.teal} size={18} strokeWidth={2.4} />
        </Pressable>
      ) : null}
    </View>
  );
}

function MobileSurgeryInterventionCard({
  dateMetaLabel,
  evaluation,
  intervention,
  isSelected = false,
  onPress,
  seniorProfiles,
}: {
  dateMetaLabel?: string;
  evaluation: InterventionEvaluation | undefined;
  intervention: RecentIntervention;
  isSelected?: boolean;
  onPress?: () => void;
  seniorProfiles: SeniorProfile[];
}) {
  const approachIconSource = getApproachIconSource(intervention.approach);
  const isValidated = hasCompleteEvaluation(evaluation);
  const cardContent = (
    <>
      <View style={styles.mobileInterventionMedallion}>
        {approachIconSource ? (
          <Image
            resizeMode="contain"
            source={approachIconSource}
            style={styles.mobileInterventionApproachImage as ImageStyle}
          />
        ) : (
          <ClipboardList color={colors.teal} size={30} strokeWidth={2.1} />
        )}
      </View>
      <View style={styles.mobileInterventionContent}>
        <Text style={styles.mobileInterventionDateLine}>
          {formatLongDisplayDate(intervention.date)}
          {dateMetaLabel ? (
            <Text style={styles.mobileInterventionDateMeta}> • {dateMetaLabel}</Text>
          ) : null}
        </Text>
        <Text style={styles.mobileInterventionTitle}>{intervention.procedureName}</Text>
        <Text style={styles.mobileInterventionSenior}>
          {formatInterventionSeniorName(intervention, seniorProfiles)}
        </Text>
      </View>
      <View style={styles.mobileInterventionStatus}>
        {isValidated ? (
          <ChevronRight color={colors.deep} size={20} strokeWidth={2.2} />
        ) : (
          <View
            accessibilityLabel="En attente d’évaluation"
            accessibilityRole="image"
            style={styles.mobileInterventionLockIndicator}
          >
            <LockKeyhole color={colors.teal} size={15} strokeWidth={2.2} />
          </View>
        )}
      </View>
    </>
  );
  const cardStyles = [
    styles.mobileInterventionCard,
    isSelected ? styles.mobileInterventionCardSelected : null,
    !isValidated ? styles.mobileInterventionCardLocked : null,
  ];

  if (isValidated && onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          ...cardStyles,
          pressed && styles.mobileInterventionCardPressed,
        ]}
      >
        {cardContent}
      </Pressable>
    );
  }

  return <View style={cardStyles}>{cardContent}</View>;
}

function HomeInterventionCard({
  evaluation,
  intervention,
  seniorProfiles,
}: {
  evaluation: InterventionEvaluation | undefined;
  intervention: RecentIntervention;
  seniorProfiles: SeniorProfile[];
}) {
  return (
    <MobileSurgeryInterventionCard
      evaluation={evaluation}
      intervention={intervention}
      seniorProfiles={seniorProfiles}
    />
  );
}

function SeniorEvaluationPreviewCard({
  evaluation,
  internalProfiles,
  intervention,
  onPress,
}: {
  evaluation: InterventionEvaluation | undefined;
  internalProfiles: InternalProfileSummary[];
  intervention: RecentIntervention;
  onPress: () => void;
}) {
  const approachIconSource = getApproachIconSource(intervention.approach);
  const internalProfile =
    internalProfiles.find((profile) => profile.id === intervention.internalProfileId) ?? null;
  const isEvaluated = hasCompleteEvaluation(evaluation);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.seniorEvaluationPreviewCard,
        pressed && styles.homePressed,
      ]}
    >
      <View style={styles.homeInterventionMedallion}>
        {approachIconSource ? (
          <Image
            resizeMode="contain"
            source={approachIconSource}
            style={styles.homeInterventionApproachImage as ImageStyle}
          />
        ) : (
          <ClipboardList color={colors.teal} size={32} strokeWidth={2.1} />
        )}
      </View>
      <View style={styles.seniorEvaluationPreviewCopy}>
        <Text style={styles.homeInterventionDate}>
          {formatLongDisplayDate(intervention.date)}
        </Text>
        <Text style={styles.homeInterventionTitle}>{intervention.procedureName}</Text>
        <Text style={styles.homeInterventionMeta}>
          {labelForApproach(intervention.approach)} - {formatInternalProfileName(internalProfile)}
        </Text>
      </View>
      <View
        style={[
          styles.seniorEvaluationStatusPill,
          isEvaluated && styles.seniorEvaluationStatusPillDone,
        ]}
      >
        <Text
          style={[
            styles.seniorEvaluationStatusText,
            isEvaluated && styles.seniorEvaluationStatusTextDone,
          ]}
        >
          {isEvaluated ? 'Validée' : 'Évaluer'}
        </Text>
        <ChevronRight
          color={isEvaluated ? colors.teal : colors.paper}
          size={16}
          strokeWidth={2.4}
        />
      </View>
    </Pressable>
  );
}

function HomeTrophyPreviewCard({
  item,
}: {
  item: {
    id: string;
    imageSrc: TrophyImageSource;
    isEarned: boolean;
    meta: string;
    title: string;
  };
}) {
  return (
    <View style={styles.homeTrophyCard}>
      <View style={[styles.trophyIcon, !item.isEarned && styles.trophyIconMuted]}>
        {item.imageSrc ? (
          <Image
            resizeMode="contain"
            source={item.imageSrc}
            style={[
              styles.trophyImage as ImageStyle,
              !item.isEarned && (styles.trophyImageMuted as ImageStyle),
            ]}
          />
        ) : (
          <Trophy
            color={item.isEarned ? colors.teal : '#7C8DA6'}
            size={24}
            strokeWidth={2.1}
          />
        )}
      </View>
      <View style={styles.trophyCopy}>
        <Text style={styles.trophyTitle}>{item.title}</Text>
        <Text style={styles.trophyMeta}>{item.meta}</Text>
      </View>
    </View>
  );
}

type MobileBottomNavigationProps = {
  activeScreen: MobileScreen;
  canCreateIntervention: boolean;
  onNavigate: (screen: MobileScreen) => void;
};

function MobileBottomNavigation({
  activeScreen,
  canCreateIntervention,
  onNavigate,
}: MobileBottomNavigationProps) {
  const isAdding =
    activeScreen === 'new-intervention' ||
    activeScreen === 'checklist' ||
    activeScreen === 'summary';
  const isProgression = activeScreen === 'history' || activeScreen === 'trophies';

  return (
    <View style={styles.bottomNav}>
      <BottomNavItem
        Icon={Home}
        isActive={activeScreen === 'dashboard'}
        label="Accueil"
        onPress={() => onNavigate('dashboard')}
      />
      <BottomNavItem
        Icon={BarChart3}
        isActive={isProgression}
        label="Progression"
        onPress={() => onNavigate('history')}
      />
      <Pressable
        accessibilityLabel="Ajouter une intervention"
        accessibilityRole="button"
        disabled={!canCreateIntervention}
        onPress={() => onNavigate('new-intervention')}
        style={[styles.bottomNavAdd, !canCreateIntervention && styles.bottomNavDisabled]}
      >
        <View style={[styles.bottomNavAddCircle, isAdding && styles.bottomNavAddCircleActive]}>
          <Plus color={colors.paper} size={29} strokeWidth={2.4} />
        </View>
        <Text style={[styles.bottomNavAddLabel, isAdding && styles.bottomNavLabelActive]}>
          Ajouter
        </Text>
      </Pressable>
      <BottomNavItem
        Icon={BookOpen}
        isActive={activeScreen === 'guides'}
        label="Fiches"
        onPress={() => onNavigate('guides')}
      />
      <BottomNavItem
        Icon={UserRound}
        isActive={activeScreen === 'profile'}
        label="Profil"
        onPress={() => onNavigate('profile')}
      />
    </View>
  );
}

type BottomNavItemProps = {
  disabled?: boolean;
  Icon: MobileIcon;
  isActive?: boolean;
  label: string;
  onPress?: () => void;
};

function BottomNavItem({
  disabled = false,
  Icon,
  isActive = false,
  label,
  onPress,
}: BottomNavItemProps) {
  const color = isActive ? '#0B5360' : '#60708A';

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={[styles.bottomNavItem, isActive && styles.bottomNavItemActive, disabled && styles.bottomNavDisabled]}
    >
      <Icon color={color} size={25} strokeWidth={2.1} />
      <Text style={[styles.bottomNavLabel, isActive && styles.bottomNavLabelActive]}>{label}</Text>
    </Pressable>
  );
}

type TrophiesScreenProps = {
  definitions: SurgicalDefinition[];
  evaluations: Record<string, InterventionEvaluation>;
  onBack: () => void;
  profile: Profile;
  recentInterventions: RecentIntervention[];
  trophyDefinitions: TrophyDefinition[];
};

type TrophySectionId = 'earned' | 'progress';

type MobileTrophyItem = {
  icon: 'clock' | 'lock' | 'trophy';
  id: string;
  imageSrc: TrophyImageSource;
  meta: string;
  title: string;
};

function TrophiesScreen({
  definitions,
  evaluations,
  onBack,
  profile,
  recentInterventions,
  trophyDefinitions,
}: TrophiesScreenProps) {
  const [activeSectionSheet, setActiveSectionSheet] = useState<TrophySectionId | null>(
    null
  );
  const trophyDisplay = buildMobileTrophyDisplay({
    definitions,
    evaluations,
    profile,
    recentInterventions,
    trophyDefinitions,
  });
  const hasAnyTrophies =
    trophyDisplay.earned.length > 0 ||
    trophyDisplay.progress.length > 0;
  const trophySections: Array<{
    description: string;
    id: TrophySectionId;
    items: MobileTrophyItem[];
    title: string;
  }> = [
    {
      description: 'Tous les trophées actifs obtenus au fil de ta progression.',
      id: 'earned',
      items: trophyDisplay.earned.map((item) => ({
        icon: 'trophy',
        id: item.id,
        imageSrc: item.imageSrc,
        meta: item.awardedAt
          ? `Obtenu le ${formatDisplayDate(item.awardedAt.slice(0, 10))}${
              item.unlockedTier ? ` - ${getTrophyTierLabel(item.unlockedTier)}` : ''
            }`
          : item.subtitle,
        title: item.title,
      })),
      title: 'Récemment débloqués',
    },
    {
      description:
        'Les trophées actifs visibles qui progressent encore vers leur prochain palier.',
      id: 'progress',
      items: trophyDisplay.progress.map((item) => ({
        icon: 'clock',
        id: item.id,
        imageSrc: item.imageSrc,
        meta: item.subtitle,
        title: item.title,
      })),
      title: 'En cours',
    },
  ];
  const activeSection =
    trophySections.find((section) => section.id === activeSectionSheet) ?? null;

  return (
    <View style={styles.homeLayout}>
      <HeaderBar onBack={onBack} title="Mes trophées" />

      <View style={styles.trophyHeroCard}>
        <View style={styles.trophyHeroIcon}>
          <Trophy color={colors.teal} size={30} strokeWidth={2.05} />
        </View>
        <View style={styles.trophyHeroCopy}>
          <Text style={styles.trophyHeroTitle}>Mes trophées</Text>
          <Text style={styles.trophyHeroSubtitle}>
            Les trophées obtenus lors de ta progression au bloc.
          </Text>
        </View>
      </View>

      <View style={styles.trophySummaryCard}>
        <View style={styles.trophySummaryItem}>
          <View style={styles.trophySummaryIconGold}>
            <Trophy color="#B87500" size={23} strokeWidth={2.05} />
          </View>
          <View>
            <Text style={styles.trophySummaryValue}>{trophyDisplay.earned.length}</Text>
            <Text style={styles.trophySummaryLabel}>débloqués</Text>
          </View>
        </View>
        <View style={styles.trophySummaryDivider} />
        <View style={styles.trophySummaryItem}>
          <View style={styles.trophySummaryIconClock}>
            <Clock3 color={colors.teal} size={23} strokeWidth={2.05} />
          </View>
          <View>
            <Text style={styles.trophySummaryValue}>{trophyDisplay.progress.length}</Text>
            <Text style={styles.trophySummaryLabel}>en cours</Text>
          </View>
        </View>
      </View>

      {hasAnyTrophies ? (
        <>
          {trophySections
            .filter((section) => section.items.length > 0)
            .map((section) => (
              <View key={section.id} style={styles.homeCard}>
                <HomeSectionHeader
                  actionLabel={section.items.length > 3 ? 'Voir tout' : undefined}
                  onAction={
                    section.items.length > 3
                      ? () => setActiveSectionSheet(section.id)
                      : undefined
                  }
                  title={section.title}
                />
                <View style={styles.trophyList}>
                  {section.items.slice(0, 3).map((item) => (
                    <TrophyListItem item={item} key={item.id} />
                  ))}
                </View>
              </View>
            ))}
        </>
      ) : (
        <View style={styles.homeEmptyState}>
          <View style={styles.homeEmptyIcon}>
            <Trophy color={colors.teal} size={24} strokeWidth={2.1} />
          </View>
          <Text style={styles.homeEmptyTitle}>Aucun trophée actif pour le moment</Text>
          <Text style={styles.homeEmptyText}>
            Les trophées apparaîtront ici dès qu’ils seront activés dans le catalogue administrateur.
          </Text>
        </View>
      )}

      {activeSection ? (
        <Modal animationType="fade" transparent visible>
          <Pressable
            accessibilityLabel="Fermer le panneau trophées"
            accessibilityRole="button"
            onPress={() => setActiveSectionSheet(null)}
            style={styles.trophySheetBackdrop}
          >
            <Pressable accessibilityRole="none" style={styles.trophySheetModalContent}>
              <ScrollView
                contentContainerStyle={styles.trophySheetScrollContent}
                showsVerticalScrollIndicator={false}
              >
                <TrophySectionSheet
                  description={activeSection.description}
                  items={activeSection.items}
                  onClose={() => setActiveSectionSheet(null)}
                  title={activeSection.title}
                />
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

function TrophyListItem({ item }: { item: MobileTrophyItem }) {
  const icon =
    item.icon === 'trophy' ? (
      <Trophy color={colors.teal} size={24} strokeWidth={2.1} />
    ) : item.icon === 'clock' ? (
      <Clock3 color={colors.teal} size={24} strokeWidth={2.1} />
    ) : (
      <LockKeyhole color="#7C8DA6" size={23} strokeWidth={2.1} />
    );

  return (
    <View style={styles.trophyCard}>
      <View style={item.icon === 'trophy' ? styles.trophyIcon : styles.trophyIconMuted}>
        {item.imageSrc ? (
          <Image
            resizeMode="contain"
            source={item.imageSrc}
            style={[
              styles.trophyImage as ImageStyle,
              item.icon !== 'trophy' && (styles.trophyImageMuted as ImageStyle),
            ]}
          />
        ) : (
          icon
        )}
      </View>
      <View style={styles.trophyCopy}>
        <Text style={styles.trophyTitle}>{item.title}</Text>
        <Text style={styles.trophyMeta}>{item.meta}</Text>
      </View>
    </View>
  );
}

function TrophySectionSheet({
  description,
  items,
  onClose,
  title,
}: {
  description: string;
  items: MobileTrophyItem[];
  onClose: () => void;
  title: string;
}) {
  return (
    <View style={styles.trophySheet}>
      <View style={styles.trophySheetHeader}>
        <View style={styles.accountSheetHeading}>
          <Text style={styles.accountSheetEyebrow}>Mes trophées</Text>
          <Text style={styles.accountSheetTitle}>{title}</Text>
          <Text style={styles.accountSheetDescription}>
            {description} {items.length} trophée{items.length > 1 ? 's' : ''} affiché
            {items.length > 1 ? 's' : ''}.
          </Text>
        </View>
        <Pressable accessibilityLabel="Fermer" accessibilityRole="button" onPress={onClose} style={styles.trophySheetClose}>
          <X color={colors.teal} size={20} strokeWidth={2.2} />
        </Pressable>
      </View>
      <View style={styles.trophyList}>
        {items.map((item) => (
          <TrophyListItem item={item} key={item.id} />
        ))}
      </View>
    </View>
  );
}

function GuidesScreen() {
  const [expandedFigure, setExpandedFigure] = useState<{
    caption: string;
    source: ImageSourcePropType;
    title: string;
  } | null>(null);
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);
  const selectedGuide =
    MOBILE_TECHNIQUE_GUIDES.find((guide) => guide.id === selectedGuideId) ?? null;
  const sortedGuides = [...MOBILE_TECHNIQUE_GUIDES].sort((left, right) =>
    left.title.localeCompare(right.title, 'fr', { sensitivity: 'base' })
  );

  if (selectedGuide) {
    const detailTitle =
      selectedGuide.id === 'guide-geu'
        ? 'GEU : fiche technique'
        : `${selectedGuide.title} : fiche technique`;
    const detailSubtitle =
      selectedGuide.id === 'guide-geu'
        ? 'Repères synthétiques pour la prise en charge chirurgicale d’une grossesse extra-utérine.'
        : null;

    return (
      <View style={styles.homeLayout}>
        <ScreenHero subtitle={detailSubtitle ?? undefined} title={detailTitle} />

        {selectedGuide.sections.map((section) => (
          <View key={section.id} style={styles.guideSectionCard}>
            <Text style={styles.guideSectionTitle}>{section.title}</Text>
            <View style={styles.guideSectionStack}>
              {section.subsections.map((subsection) => (
                <GuideSubsection
                  key={subsection.id}
                  onOpenFigure={setExpandedFigure}
                  subsection={subsection}
                />
              ))}
            </View>
          </View>
        ))}

        <Pressable
          accessibilityRole="button"
          onPress={() => setSelectedGuideId(null)}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>Retour aux fiches</Text>
        </Pressable>

        {expandedFigure ? (
          <Modal animationType="fade" transparent visible>
            <Pressable
              accessibilityLabel="Fermer l’image agrandie"
              accessibilityRole="button"
              onPress={() => setExpandedFigure(null)}
              style={styles.guideLightboxBackdrop}
            >
              <Pressable accessibilityRole="none" style={styles.guideLightboxContent}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setExpandedFigure(null)}
                  style={styles.guideLightboxClose}
                >
                  <Text style={styles.guideLightboxCloseText}>Fermer</Text>
                </Pressable>
                <Image
                  resizeMode="contain"
                  source={expandedFigure.source}
                  style={styles.guideLightboxImage as ImageStyle}
                />
                {expandedFigure.caption ? (
                  <Text style={styles.guideLightboxCaption}>
                    {expandedFigure.caption}
                  </Text>
                ) : null}
              </Pressable>
            </Pressable>
          </Modal>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.homeLayout}>
      <ScreenHero
        subtitle="Consulte une fiche de rappel avant l’intervention."
        title="Fiches techniques"
      />
      {MOBILE_TECHNIQUE_GUIDES.length ? (
        <View style={styles.guideList}>
          {sortedGuides.map((guide) => (
            <Pressable
              accessibilityRole="button"
              key={guide.id}
              onPress={() => setSelectedGuideId(guide.id)}
              style={({ pressed }) => [styles.guideCard, pressed && styles.homePressed]}
            >
              <View style={styles.guideCopy}>
                <Text style={styles.guideTitle}>{guide.title}</Text>
              </View>
              <ChevronRight color="#344665" size={22} strokeWidth={2.1} />
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.homeEmptyState}>
          <View style={styles.homeEmptyIcon}>
            <Sparkles color={colors.teal} size={24} strokeWidth={2.1} />
          </View>
          <Text style={styles.homeEmptyTitle}>Bientôt disponible</Text>
          <Text style={styles.homeEmptyText}>
            Les prochaines fiches seront ajoutées dans cet espace.
          </Text>
        </View>
      )}
    </View>
  );
}

function GuideSubsection({
  onOpenFigure,
  subsection,
}: {
  onOpenFigure: (figure: {
    caption: string;
    source: ImageSourcePropType;
    title: string;
  }) => void;
  subsection: MobileGuideSubsection;
}) {
  const imageSource = subsection.imageSrc ? GUIDE_IMAGE_SOURCES[subsection.imageSrc] : null;
  const imageTitle = subsection.title || subsection.eyebrow || 'Illustration';

  return (
    <View style={styles.guideSubsection}>
      {subsection.eyebrow ? (
        <Text style={styles.guideSubsectionEyebrow}>{subsection.eyebrow}</Text>
      ) : null}
      {subsection.title ? (
        <Text style={styles.guideSubsectionTitle}>{subsection.title}</Text>
      ) : null}
      {subsection.paragraphs.map((paragraph) => (
        <Text key={paragraph} style={styles.guideParagraph}>
          {paragraph}
        </Text>
      ))}
      {subsection.bulletItems?.length ? (
        <View style={styles.guideBulletList}>
          {subsection.bulletItems.map((item) => (
            <View key={item} style={styles.guideBulletRow}>
              <Text style={styles.guideBulletDot}>•</Text>
              <Text style={styles.guideBulletText}>{item}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {imageSource ? (
        <View style={styles.guideFigure}>
          <Pressable
            accessibilityLabel="Agrandir l’image"
            accessibilityRole="button"
            onPress={() =>
              onOpenFigure({
                caption: subsection.imageCaption ?? '',
                source: imageSource,
                title: imageTitle,
              })
            }
            style={styles.guideFigureButton}
          >
            <Image resizeMode="contain" source={imageSource} style={styles.guideFigureImage as ImageStyle} />
          </Pressable>
          {subsection.imageCaption ? (
            <Text style={styles.guideFigureCaption}>{subsection.imageCaption}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

type ProfileScreenProps = {
  definitions: SurgicalDefinition[];
  evaluations: Record<string, InterventionEvaluation>;
  isSaving: boolean;
  onSignOut: () => void;
  onUpdateAvatarImage: (avatarImageSrc: string | null) => Promise<void>;
  onUpdatePassword: (input: PasswordUpdateInput) => Promise<void>;
  onUpdateProfileSettings: (input: ProfileSettingsInput) => Promise<void>;
  profile: Profile;
  recentInterventions: RecentIntervention[];
  seniorProfiles: SeniorProfile[];
  summary: DashboardSummary | null;
};

type AccountSheetId =
  | 'about'
  | 'export'
  | 'password'
  | 'photo'
  | 'support'
  | 'training'
  | null;

type NewInterventionSelectId = 'approach' | 'entryTechnique' | 'procedure' | 'senior' | null;

function ProfileScreen({
  definitions,
  evaluations,
  isSaving,
  onSignOut,
  onUpdateAvatarImage,
  onUpdatePassword,
  onUpdateProfileSettings,
  profile,
  recentInterventions,
  seniorProfiles,
  summary,
}: ProfileScreenProps) {
  const [activeSheet, setActiveSheet] = useState<AccountSheetId>(null);
  const fullName = `${profile.firstName} ${profile.lastName}`;
  const statusLabel =
    profile.role === 'internal'
      ? `Interne – ${profile.semester ?? 'Semestre non renseigné'}`
      : ROLE_LABELS[profile.role];

  function closeSheet() {
    setActiveSheet(null);
  }

  function handleSupportPress(subjectValue: string, messageValue: string) {
    const subject = subjectValue.trim() || 'Support Mon Journal de Bloc';
    const body =
      [
        `Nom : ${fullName}`,
        `Semestre : ${profile.semester ?? ''}`,
        `Stage : ${profile.currentRotation ?? ''}`,
        '',
        messageValue.trim(),
      ]
        .filter(Boolean)
        .join('\n');
    void Linking.openURL(buildSupportMailto({ body, subject }));
    closeSheet();
  }

  return (
    <View style={styles.homeLayout}>
      <ScreenHero title="Mon compte" />
      <View style={styles.accountProfileCard}>
        <View style={styles.accountProfileCopy}>
          <Text style={styles.accountProfileName}>{fullName}</Text>
          <Text style={styles.accountProfileStatus}>{statusLabel}</Text>
          <Text style={styles.accountProfileMeta}>
            {profile.currentRotation ?? 'Rotation non renseignée'}
          </Text>
          <Text style={styles.accountProfileMeta}>CHU de Nantes</Text>
        </View>
        <View style={styles.accountAvatar}>
          {profile.avatarImageSrc ? (
            <Image
              resizeMode="cover"
              source={{ uri: profile.avatarImageSrc }}
              style={styles.accountAvatarImage as ImageStyle}
            />
          ) : (
            <Text style={styles.homeAvatarText}>{getInitials(profile)}</Text>
          )}
        </View>
      </View>

      <AccountSection title="PARAMÈTRES">
        <AccountActionRow
          description="Modifier mon semestre et mon stage"
          Icon={GraduationCap}
          label="Formation"
          onPress={() => setActiveSheet('training')}
        />
        <AccountActionRow
          description="Choisir ou remplacer ma photo de profil"
          Icon={Camera}
          label="Modifier photo de profil"
          onPress={() => setActiveSheet('photo')}
        />
        <AccountActionRow
          description="Modifier mon mot de passe"
          Icon={LockKeyhole}
          label="Mot de passe"
          onPress={() => setActiveSheet('password')}
        />
      </AccountSection>

      <AccountSection title="MES DONNÉES">
        <AccountActionRow
          description="Télécharger mes données de bloc"
          Icon={FileSpreadsheet}
          label="Exporter mes statistiques"
          onPress={() => setActiveSheet('export')}
        />
      </AccountSection>

      <AccountSection title="SUPPORT">
        <AccountActionRow
          description="Signaler un bug ou proposer une amélioration"
          Icon={MessageCircle}
          label="Contacter le support"
          onPress={() => setActiveSheet('support')}
        />
      </AccountSection>

      <AccountSection title="À PROPOS">
        <AccountActionRow
          description="Version, mentions légales et confidentialité"
          Icon={Info}
          label="À propos de ce site"
          onPress={() => setActiveSheet('about')}
        />
      </AccountSection>

      <Pressable accessibilityRole="button" onPress={onSignOut} style={styles.accountLogoutButton}>
        <LogOut color="#B42318" size={22} strokeWidth={2.1} />
        <Text style={styles.accountLogoutText}>Se déconnecter</Text>
      </Pressable>

      {activeSheet ? (
        <Modal animationType="fade" transparent visible={activeSheet != null}>
          <Pressable
            accessibilityRole="button"
            onPress={closeSheet}
            style={styles.accountSheetBackdrop}
          >
            <Pressable accessibilityRole="none" style={styles.accountSheetModalContent}>
              <ScrollView
                contentContainerStyle={styles.accountSheetScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <AccountSheet
                  definitions={definitions}
                  evaluations={evaluations}
                isSaving={isSaving}
                onClose={closeSheet}
                onSupportPress={handleSupportPress}
                onUpdateAvatarImage={onUpdateAvatarImage}
                onUpdatePassword={onUpdatePassword}
                  onUpdateProfileSettings={onUpdateProfileSettings}
                  profile={profile}
                  recentInterventions={recentInterventions}
                  seniorProfiles={seniorProfiles}
                  sheet={activeSheet}
                  summary={summary}
                />
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

function AccountSheet({
  definitions,
  evaluations,
  isSaving,
  onClose,
  onSupportPress,
  onUpdateAvatarImage,
  onUpdatePassword,
  onUpdateProfileSettings,
  profile,
  recentInterventions,
  seniorProfiles,
  sheet,
  summary,
}: {
  definitions: SurgicalDefinition[];
  evaluations: Record<string, InterventionEvaluation>;
  isSaving: boolean;
  onClose: () => void;
  onSupportPress: (subject: string, message: string) => void;
  onUpdateAvatarImage: (avatarImageSrc: string | null) => Promise<void>;
  onUpdatePassword: (input: PasswordUpdateInput) => Promise<void>;
  onUpdateProfileSettings: (input: ProfileSettingsInput) => Promise<void>;
  profile: Profile;
  recentInterventions: RecentIntervention[];
  seniorProfiles: SeniorProfile[];
  sheet: Exclude<AccountSheetId, null>;
  summary: DashboardSummary | null;
}) {
  const [feedback, setFeedback] = useState<{ message: string; tone: 'error' | 'success' } | null>(null);
  const [passwordForm, setPasswordForm] = useState({
    confirmPassword: '',
    currentPassword: '',
    nextPassword: '',
  });
  const [supportForm, setSupportForm] = useState({
    message: '',
    subject: '',
  });
  const [trainingForm, setTrainingForm] = useState({
    currentRotation: profile.currentRotation ?? '',
    semester: profile.semester ?? '',
  });
  const titleBySheet: Record<Exclude<AccountSheetId, null>, string> = {
    about: 'À propos de Mon Journal de Bloc',
    export: 'Exporter mes statistiques',
    password: 'Mot de passe',
    photo: 'Photo de profil',
    support: 'Contacter le support',
    training: 'Formation',
  };
  const descriptionBySheet: Partial<Record<Exclude<AccountSheetId, null>, string>> = {
    export: 'Exporte tes données personnelles dans un format compatible Excel.',
    password: 'Modifie ton mot de passe à tout moment.',
    photo: 'Choisir ou remplacer ma photo de profil.',
    training: 'Mets à jour tes informations profil.',
  };

  useEffect(() => {
    setFeedback(null);

    if (sheet === 'training') {
      setTrainingForm({
        currentRotation: profile.currentRotation ?? '',
        semester: profile.semester ?? '',
      });
    }

    if (sheet === 'password') {
      setPasswordForm({
        confirmPassword: '',
        currentPassword: '',
        nextPassword: '',
      });
    }

    if (sheet === 'support') {
      setSupportForm({
        message: '',
        subject: '',
      });
    }
  }, [profile.currentRotation, profile.semester, sheet]);

  async function handleTrainingSubmit() {
    setFeedback(null);

    try {
      await onUpdateProfileSettings(trainingForm);
      onClose();
    } catch (caughtError) {
      setFeedback({
        message:
          caughtError instanceof Error
            ? caughtError.message
            : 'Impossible de mettre à jour la formation.',
        tone: 'error',
      });
    }
  }

  async function handlePasswordSubmit() {
    const currentPassword = passwordForm.currentPassword.trim();
    const nextPassword = passwordForm.nextPassword.trim();

    setFeedback(null);

    if (!currentPassword) {
      setFeedback({ message: 'Renseigne ton mot de passe actuel.', tone: 'error' });
      return;
    }

    if (nextPassword.length < 4) {
      setFeedback({
        message: 'Le nouveau mot de passe doit contenir au moins 4 caractères.',
        tone: 'error',
      });
      return;
    }

    if (passwordForm.nextPassword !== passwordForm.confirmPassword) {
      setFeedback({
        message: 'La confirmation du nouveau mot de passe ne correspond pas.',
        tone: 'error',
      });
      return;
    }

    try {
      await onUpdatePassword({ currentPassword, nextPassword });
      onClose();
    } catch (caughtError) {
      setFeedback({
        message:
          caughtError instanceof Error
            ? caughtError.message
            : 'Impossible de mettre à jour le mot de passe.',
        tone: 'error',
      });
    }
  }

  async function handleExportPress() {
    setFeedback(null);

    if (!recentInterventions.length) {
      setFeedback({
        message: 'Aucune intervention n’est encore disponible pour l’export.',
        tone: 'error',
      });
      return;
    }

    try {
      await Share.share({
        message: buildMobileInterventionsCsv(
          recentInterventions,
          seniorProfiles,
          definitions,
          evaluations
        ),
        title: 'Export Mon Journal de Bloc',
      });
      onClose();
    } catch (caughtError) {
      setFeedback({
        message:
          caughtError instanceof Error
            ? caughtError.message
            : 'Impossible de préparer l’export.',
        tone: 'error',
      });
    }
  }

  function handleSupportSubmit() {
    onSupportPress(supportForm.subject, supportForm.message);
  }

  async function handlePickAvatarImage() {
    setFeedback(null);

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        setFeedback({
          message: 'Autorise l’accès aux photos pour choisir une image de profil.',
          tone: 'error',
        });
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        base64: true,
        mediaTypes: ['images'],
        quality: 0.78,
      });

      if (result.canceled) {
        return;
      }

      const asset = result.assets[0];

      if (!asset?.base64) {
        setFeedback({
          message: 'Impossible de lire cette image. Essaie avec une autre photo.',
          tone: 'error',
        });
        return;
      }

      const mimeType = asset.mimeType ?? 'image/jpeg';

      await onUpdateAvatarImage(`data:${mimeType};base64,${asset.base64}`);
      setFeedback({
        message: 'La photo de profil a bien été mise à jour.',
        tone: 'success',
      });
    } catch (caughtError) {
      setFeedback({
        message:
          caughtError instanceof Error
            ? caughtError.message
            : 'Impossible de mettre à jour la photo de profil.',
        tone: 'error',
      });
    }
  }

  async function handleRemoveAvatarImage() {
    setFeedback(null);

    try {
      await onUpdateAvatarImage(null);
      setFeedback({
        message: 'La photo de profil a bien été supprimée.',
        tone: 'success',
      });
    } catch (caughtError) {
      setFeedback({
        message:
          caughtError instanceof Error
            ? caughtError.message
            : 'Impossible de supprimer la photo de profil.',
        tone: 'error',
      });
    }
  }

  return (
    <View style={styles.accountSheet}>
      <View style={styles.accountSheetHeader}>
        <View style={styles.accountSheetHeading}>
          <Text style={styles.accountSheetTitle}>{titleBySheet[sheet]}</Text>
          {descriptionBySheet[sheet] ? (
            <Text style={styles.accountSheetDescription}>{descriptionBySheet[sheet]}</Text>
          ) : null}
        </View>
        <Pressable accessibilityRole="button" onPress={onClose} style={styles.accountSheetClose}>
          <X color={colors.muted} size={22} strokeWidth={2.2} />
        </Pressable>
      </View>

      {feedback ? (
        <Text
          style={[
            styles.accountFeedback,
            feedback.tone === 'success' ? styles.accountFeedbackSuccess : styles.accountFeedbackError,
          ]}
        >
          {feedback.message}
        </Text>
      ) : null}

      {sheet === 'training' ? (
        <View style={styles.accountSheetForm}>
          <AccountSheetSelect
            label="Semestre"
            onChange={(value) =>
              setTrainingForm((current) => ({ ...current, semester: value }))
            }
            options={SEMESTER_OPTIONS}
            value={trainingForm.semester}
          />
          <AccountSheetSelect
            label="Stage actuel"
            onChange={(value) =>
              setTrainingForm((current) => ({ ...current, currentRotation: value }))
            }
            options={ROTATION_OPTIONS}
            value={trainingForm.currentRotation}
          />
          <AccountSheetActions>
            <AccountSheetPrimaryButton
              disabled={isSaving}
              isLoading={isSaving}
              label="Enregistrer"
              onPress={handleTrainingSubmit}
            />
          </AccountSheetActions>
        </View>
      ) : null}

      {sheet === 'photo' ? (
        <View style={styles.accountSheetForm}>
          <View style={styles.accountPhotoCropper}>
            <View style={styles.accountPhotoViewport}>
              {profile.avatarImageSrc ? (
                <Image
                  resizeMode="cover"
                  source={{ uri: profile.avatarImageSrc }}
                  style={styles.accountAvatarImage as ImageStyle}
                />
              ) : (
                <Text style={styles.homeAvatarText}>{getInitials(profile)}</Text>
              )}
            </View>
            <View style={styles.accountPhotoMeta}>
              <Text style={styles.accountPhotoMetaTitle}>Photo de profil</Text>
              <Text style={styles.accountPhotoMetaText}>
                Choisis une image depuis ton téléphone. Elle sera recadrée en carré
                puis synchronisée avec ton profil web et mobile.
              </Text>
            </View>
          </View>
          <View style={styles.accountSheetActionsSplit}>
            <AccountSheetSecondaryButton
              disabled={isSaving || !profile.avatarImageSrc}
              label="Supprimer"
              onPress={handleRemoveAvatarImage}
            />
            <AccountSheetPrimaryButton
              disabled={isSaving}
              isLoading={isSaving}
              label="Choisir une photo"
              onPress={handlePickAvatarImage}
            />
          </View>
        </View>
      ) : null}

      {sheet === 'password' ? (
        <View style={styles.accountSheetForm}>
          <AccountSheetTextInput
            label="Mot de passe actuel"
            onChangeText={(value) =>
              setPasswordForm((current) => ({ ...current, currentPassword: value }))
            }
            secureTextEntry
            value={passwordForm.currentPassword}
          />
          <AccountSheetTextInput
            label="Nouveau mot de passe"
            onChangeText={(value) =>
              setPasswordForm((current) => ({ ...current, nextPassword: value }))
            }
            secureTextEntry
            value={passwordForm.nextPassword}
          />
          <AccountSheetTextInput
            label="Confirmer le nouveau mot de passe"
            onChangeText={(value) =>
              setPasswordForm((current) => ({ ...current, confirmPassword: value }))
            }
            secureTextEntry
            value={passwordForm.confirmPassword}
          />
          <AccountSheetActions>
            <AccountSheetPrimaryButton
              disabled={isSaving}
              isLoading={isSaving}
              label="Mettre à jour"
              onPress={handlePasswordSubmit}
            />
          </AccountSheetActions>
        </View>
      ) : null}

      {sheet === 'export' ? (
        <View style={styles.accountSheetStack}>
          <Text style={styles.accountSheetText}>
            {summary?.interventions
              ? `${summary.interventions} intervention(s) seront incluses dans le fichier.`
              : 'Aucune intervention enregistrée pour le moment.'}
          </Text>
          <AccountSheetActions>
            <AccountSheetPrimaryButton
              label="Télécharger le fichier Excel"
              onPress={handleExportPress}
            />
          </AccountSheetActions>
        </View>
      ) : null}

      {sheet === 'support' ? (
        <View style={styles.accountSheetForm}>
          <AccountSheetTextInput
            label="Objet"
            onChangeText={(value) =>
              setSupportForm((current) => ({ ...current, subject: value }))
            }
            value={supportForm.subject}
          />
          <AccountSheetTextInput
            label="Message"
            multiline
            onChangeText={(value) =>
              setSupportForm((current) => ({ ...current, message: value }))
            }
            value={supportForm.message}
          />
          <AccountSheetActions>
            <AccountSheetPrimaryButton label="Envoyer" onPress={handleSupportSubmit} />
          </AccountSheetActions>
        </View>
      ) : null}

      {sheet === 'about' ? (
        <View style={styles.accountAboutList}>
          <AccountAboutRow label="Version" value="1.0.0" />
          <AccountAboutRow label="Mentions légales" value="À rédiger" />
          <AccountAboutRow label="Politique de confidentialité" value="À rédiger" />
        </View>
      ) : null}
    </View>
  );
}

type NotebookScreenProps = {
  document: NotebookDocument | null;
  error: string | null;
  isSaving: boolean;
  onBack: () => void;
  onSave: (text: string) => void;
  recentInterventions: RecentIntervention[];
};

function NotebookScreen({
  document,
  error,
  isSaving,
  onBack,
  onSave,
  recentInterventions,
}: NotebookScreenProps) {
  const [text, setText] = useState(() => notebookHtmlToText(document?.contentHtml ?? ''));
  const [isInterventionPanelOpen, setIsInterventionPanelOpen] = useState(false);
  const [selection, setSelection] = useState({ end: 0, start: 0 });
  const lastSavedLabel = formatSaveTimestamp(document?.updatedAt);
  const saveStatusLabel = isSaving
    ? 'Enregistrement...'
    : lastSavedLabel
      ? `Enregistré ${lastSavedLabel}`
      : 'Bloc-notes prêt';

  useEffect(() => {
    setText(notebookHtmlToText(document?.contentHtml ?? ''));
  }, [document?.updatedAt, document?.contentHtml]);

  function insertFreeNote() {
    const now = new Date();
    const noteBlock = `${getDayTitle(toIsoDate(now))} - ${formatShortTime(now)}\n\n`;
    setText((currentText) => `${noteBlock}${currentText ? `\n\n${currentText}` : ''}`);
  }

  function handleSelectionChange(
    event: NativeSyntheticEvent<TextInputSelectionChangeEventData>
  ) {
    setSelection(event.nativeEvent.selection);
  }

  function replaceSelection(nextValue: string, cursorOffset = nextValue.length) {
    const start = Math.min(selection.start, selection.end);
    const end = Math.max(selection.start, selection.end);

    setText((currentText) => {
      const nextText = `${currentText.slice(0, start)}${nextValue}${currentText.slice(end)}`;
      const nextCursor = start + cursorOffset;

      setSelection({ end: nextCursor, start: nextCursor });
      return nextText;
    });
  }

  function wrapSelection(prefix: string, suffix = prefix, placeholder = 'texte') {
    const start = Math.min(selection.start, selection.end);
    const end = Math.max(selection.start, selection.end);
    const selectedText = text.slice(start, end) || placeholder;
    const nextValue = `${prefix}${selectedText}${suffix}`;

    replaceSelection(nextValue, prefix.length + selectedText.length);
  }

  function insertListPrefix(prefix: string) {
    const start = Math.min(selection.start, selection.end);
    const needsLineBreak = start > 0 && text[start - 1] !== '\n';
    const nextValue = `${needsLineBreak ? '\n' : ''}${prefix}`;

    replaceSelection(nextValue);
  }

  function insertInterventionNote(intervention: RecentIntervention) {
    const noteBlock = [
      `${getDayTitle(intervention.date)} - ${intervention.procedureName}`,
      `Voie d'abord : ${labelForApproach(intervention.approach)}`,
      `Rôle : ${labelForInterventionRole(intervention.role)}`,
      `Note ajoutée à ${formatShortTime(new Date())}`,
      '',
    ].join('\n');

    setText((currentText) => `${noteBlock}${currentText ? `\n\n${currentText}` : ''}`);
    setIsInterventionPanelOpen(false);
  }

  function clearNotebook() {
    setText('');
    onSave('');
  }

  return (
    <View style={styles.homeLayout}>
      <HeaderBar onBack={onBack} title="Bloc-notes" />
      <View style={styles.notebookEditorCard}>
          <View style={styles.notebookToolbar}>
            <View style={styles.notebookToolbarGroup}>
            <NotebookToolButton Icon={Bold} label="Gras" onPress={() => wrapSelection('**')} />
            <NotebookToolButton
              Icon={Underline}
              label="Souligné"
              onPress={() => wrapSelection('__')}
            />
            <NotebookToolButton
              Icon={Highlighter}
              isHighlight
              label="Surligner"
              onPress={() => wrapSelection('==')}
            />
            <NotebookToolButton
              Icon={List}
              label="Liste à puces"
              onPress={() => insertListPrefix('• ')}
            />
            <NotebookToolButton
              Icon={ListOrdered}
              label="Liste numérotée"
              onPress={() => insertListPrefix('1. ')}
            />
          </View>

          <View style={styles.notebookToolbarActions}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsInterventionPanelOpen(true)}
              style={styles.notebookInsertButton}
            >
              <BriefcaseMedical color={colors.clay} size={18} strokeWidth={2.05} />
              <Text style={styles.notebookInsertButtonText}>Note intervention</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={insertFreeNote}
              style={[styles.notebookInsertButton, styles.notebookInsertButtonFree]}
            >
              <NotebookPen color={colors.deep} size={18} strokeWidth={2.05} />
              <Text style={[styles.notebookInsertButtonText, styles.notebookInsertButtonFreeText]}>
                Note libre
              </Text>
            </Pressable>
          </View>
        </View>

        <TextInput
          multiline
          onChangeText={setText}
          onSelectionChange={handleSelectionChange}
          placeholder="Ajoute ici tes notes de bloc, rappels techniques ou points à revoir..."
          placeholderTextColor={colors.muted}
          selection={selection}
          style={styles.notebookTextArea}
          textAlignVertical="top"
          value={text}
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <View style={styles.notebookFooter}>
          <View style={styles.notebookFooterMeta}>
            <Text style={styles.notebookCounter}>{text.trim().length} caractères</Text>
            <View style={styles.notebookSaveIndicator}>
              {isSaving ? (
                <ActivityIndicator color={colors.teal} size="small" />
              ) : lastSavedLabel ? (
                <CheckCircle2 color={colors.teal} size={16} strokeWidth={2.1} />
              ) : null}
              <Text style={styles.notebookSaveIndicatorText}>{saveStatusLabel}</Text>
            </View>
          </View>
          <Pressable
            accessibilityRole="button"
            disabled={isSaving}
            onPress={clearNotebook}
            style={styles.notebookClearButton}
          >
            <Trash2 color="#B42318" size={17} strokeWidth={2.1} />
            <Text style={styles.notebookClearText}>Vider le bloc note</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            disabled={isSaving}
            onPress={() => onSave(text)}
            style={[styles.notebookSaveButton, isSaving && styles.primaryButtonDisabled]}
          >
            {isSaving ? (
              <ActivityIndicator color={colors.paper} />
            ) : (
              <Text style={styles.notebookSaveText}>Sauvegarder</Text>
            )}
          </Pressable>
        </View>
      </View>

      {isInterventionPanelOpen ? (
        <View style={styles.notebookPanel}>
          <View style={styles.notebookPanelHeader}>
            <View>
              <Text style={styles.notebookPanelEyebrow}>Note intervention</Text>
              <Text style={styles.notebookPanelTitle}>Dernières interventions</Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setIsInterventionPanelOpen(false)}
              style={styles.notebookPanelClose}
            >
              <Text style={styles.notebookPanelCloseText}>Fermer</Text>
            </Pressable>
          </View>

          {recentInterventions.length ? (
            <View style={styles.notebookPanelList}>
              {recentInterventions.slice(0, 3).map((intervention) => (
                <Pressable
                  accessibilityRole="button"
                  key={intervention.id}
                  onPress={() => insertInterventionNote(intervention)}
                  style={styles.notebookPanelItem}
                >
                  <Text style={styles.notebookPanelItemDate}>
                    {getDayTitle(intervention.date)}
                  </Text>
                  <Text style={styles.notebookPanelItemTitle}>
                    {intervention.procedureName}
                  </Text>
                  <Text style={styles.notebookPanelItemMeta}>
                    Voie : {labelForApproach(intervention.approach)} · Enregistrée à{' '}
                    {formatShortTime(intervention.savedAt)}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.homeEmptyLine}>
              Aucune intervention enregistrée pour le moment.
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

function NotebookToolButton({
  Icon,
  isHighlight = false,
  label,
  onPress,
}: {
  Icon: MobileIcon;
  isHighlight?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.notebookToolButton, isHighlight && styles.notebookToolButtonHighlight]}
    >
      <Icon color={colors.deep} size={18} strokeWidth={2.15} />
    </Pressable>
  );
}

function ScreenHero({ subtitle, title }: { subtitle?: string; title: string }) {
  return (
    <View style={styles.screenHero}>
      <Text style={styles.screenHeroTitle}>{title}</Text>
      {subtitle ? <Text style={styles.screenHeroSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function AccountSheetActions({ children }: { children: ReactNode }) {
  return <View style={styles.accountSheetActions}>{children}</View>;
}

function AccountSheetPrimaryButton({
  disabled = false,
  isLoading = false,
  label,
  onPress,
}: {
  disabled?: boolean;
  isLoading?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.accountSheetPrimaryButton, disabled && styles.primaryButtonDisabled]}
    >
      {isLoading ? (
        <ActivityIndicator color={colors.paper} size="small" />
      ) : (
        <Text style={styles.accountSheetPrimaryButtonText}>{label}</Text>
      )}
    </Pressable>
  );
}

function AccountSheetSecondaryButton({
  disabled = false,
  label,
  onPress,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.accountSheetSecondaryButton, disabled && styles.primaryButtonDisabled]}
    >
      <Text style={styles.accountSheetSecondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

function AccountSheetField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.accountSheetField}>
      <Text style={styles.accountSheetFieldLabel}>{label}</Text>
      <View style={styles.accountSheetInput}>
        <Text style={styles.accountSheetInputText}>{value}</Text>
      </View>
    </View>
  );
}

function AccountSheetSelect({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange?: (value: string) => void;
  options?: Array<{ label: string; value: string }>;
  value: string;
}) {
  const selectedOption = options?.find((option) => option.value === value);

  return (
    <View style={styles.accountSheetField}>
      <Text style={styles.accountSheetFieldLabel}>{label}</Text>
      <View style={styles.accountSheetSelectWrap}>
        <Text style={styles.accountSheetInputText}>
          {selectedOption?.label ?? (value || 'Non renseigné')}
        </Text>
        <ChevronDown color={colors.muted} size={18} strokeWidth={2.2} />
      </View>
      {options?.length ? (
        <View style={styles.accountSheetOptionList}>
          {options.map((option) => {
            const isSelected = option.value === value;

            return (
              <Pressable
                accessibilityRole="button"
                key={option.value}
                onPress={() => onChange?.(option.value)}
                style={[
                  styles.accountSheetOption,
                  isSelected && styles.accountSheetOptionSelected,
                ]}
              >
                <Text
                  style={[
                    styles.accountSheetOptionText,
                    isSelected && styles.accountSheetOptionTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function AccountSheetTextInput({
  label,
  multiline = false,
  onChangeText,
  secureTextEntry = false,
  value,
}: {
  label: string;
  multiline?: boolean;
  onChangeText?: (value: string) => void;
  secureTextEntry?: boolean;
  value?: string;
}) {
  return (
    <View style={styles.accountSheetField}>
      <Text style={styles.accountSheetFieldLabel}>{label}</Text>
      <TextInput
        multiline={multiline}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        style={[styles.accountSheetTextInput, multiline && styles.accountSheetTextarea]}
        value={value}
      />
    </View>
  );
}

function AccountAboutRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.accountAboutRow}>
      <Text style={styles.accountAboutLabel}>{label}</Text>
      <Text style={styles.accountAboutValue}>{value}</Text>
    </View>
  );
}

function AccountSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <View style={styles.accountSection}>
      <Text style={styles.accountSectionTitle}>{title}</Text>
      <View style={styles.accountListCard}>{children}</View>
    </View>
  );
}

function AccountActionRow({
  description,
  Icon,
  label,
  onPress,
}: {
  description: string;
  Icon: MobileIcon;
  label: string;
  onPress?: () => void;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={styles.accountActionRow}
    >
      <View style={styles.accountActionIcon}>
        <Icon color={colors.teal} size={22} strokeWidth={2.05} />
      </View>
      <View style={styles.accountActionCopy}>
        <Text style={styles.accountActionLabel}>{label}</Text>
        <Text style={styles.accountActionDescription}>{description}</Text>
      </View>
      <ChevronRight color="#344665" size={22} strokeWidth={2.1} />
    </Pressable>
  );
}

type MetricCardProps = {
  label: string;
  value: number | undefined;
};

function MetricCard({ label, value }: MetricCardProps) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricValue}>{value ?? '-'}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

type ActionCardProps = {
  description: string;
  disabled?: boolean;
  onPress?: () => void;
  title: string;
};

function ActionCard({ description, disabled = false, onPress, title }: ActionCardProps) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionCard,
        pressed && styles.actionCardPressed,
        disabled && styles.actionCardDisabled,
      ]}
    >
      <Text style={styles.actionTitle}>{title}</Text>
      <Text style={styles.actionDescription}>{description}</Text>
    </Pressable>
  );
}

type NewInterventionScreenProps = {
  definitions: SurgicalDefinition[];
  error: string | null;
  initialDraft: InterventionDraft | null;
  onBack: () => void;
  onContinue: (draft: InterventionDraft) => void;
  profile: Profile;
  seniorProfiles: SeniorProfile[];
};

function NewInterventionScreen({
  definitions,
  error,
  initialDraft,
  onBack,
  onContinue,
  profile,
  seniorProfiles,
}: NewInterventionScreenProps) {
  const firstDefinition = definitions[0];
  const [draft, setDraft] = useState<InterventionDraft>(() =>
    initialDraft ?? createInitialInterventionDraft(definitions, seniorProfiles)
  );
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [openSelect, setOpenSelect] = useState<NewInterventionSelectId>(null);
  const selectedDefinition =
    definitions.find((definition) => definition.id === draft.procedureId) ??
    firstDefinition;
  const isSalpingectomy = isSalpingectomyDefinition(selectedDefinition);
  const salpingectomyIndicationOptions =
    getSalpingectomyIndicationOptions(selectedDefinition);
  const customIndicationOptions = getDefinitionIndicationOptions(selectedDefinition);
  const shouldShowCustomIndication =
    !isSalpingectomy &&
    Boolean(selectedDefinition?.isCustom) &&
    Boolean(customIndicationOptions.length);
  const availableApproaches =
    selectedDefinition?.allowedApproaches.length ? selectedDefinition.allowedApproaches : DEFAULT_APPROACHES;
  const indicationOptions = isSalpingectomy
    ? salpingectomyIndicationOptions
    : shouldShowCustomIndication
      ? customIndicationOptions
      : [];
  const selectedIndicationValue = isSalpingectomy
    ? draft.indication
    : draft.customIndication.trim() || null;
  const availableEntryTechniques = getAvailableEntryTechniques(selectedDefinition);
  const shouldShowEntryTechnique = shouldShowEntryTechniqueForDraft(draft, definitions);
  const shouldShowLaterality = shouldRequireLateralityForDraft(draft, definitions);
  const draftMissingFields = getInterventionDraftMissingFields(draft, definitions);
  const isDraftReady = draftMissingFields.length === 0;
  const seniorOptions = [
    ...seniorProfiles.map((senior) => ({
      label: formatSeniorProfileName(senior),
      value: senior.id,
    })),
    {
      label: 'Autre',
      value: OTHER_SENIOR_OPTION_ID,
    },
  ];
  const procedureOptions = definitions.map((definition) => ({
    label: definition.name,
    value: definition.id,
  }));
  const approachOptions = availableApproaches.map((approach) => ({
    label: labelForApproach(approach),
    value: approach,
  }));
  const entryTechniqueOptions = availableEntryTechniques.map((entryTechnique) => ({
    label: labelForEntryTechnique(entryTechnique),
    value: entryTechnique,
  }));
  const selectedSeniorLabel =
    seniorOptions.find((option) => option.value === draft.seniorProfileId)?.label ?? null;
  const selectedProcedureLabel =
    procedureOptions.find((option) => option.value === draft.procedureId)?.label ?? null;
  const selectedApproachLabel =
    approachOptions.find((option) => option.value === draft.approach)?.label ?? null;
  const selectedEntryTechniqueLabel =
    entryTechniqueOptions.find((option) => option.value === draft.entryTechnique)?.label ?? null;

  useEffect(() => {
    if (!draft.procedureId && firstDefinition) {
      const firstApproach = firstDefinition.allowedApproaches[0] ?? null;
      const firstEntryTechniques = getAvailableEntryTechniques(firstDefinition);
      const firstIsSalpingectomy = isSalpingectomyDefinition(firstDefinition);
      const firstSalpingectomyIndications = getSalpingectomyIndications(firstDefinition);
      const firstIndicationOptions = getDefinitionIndicationOptions(firstDefinition);
      setDraft((currentDraft) => ({
        ...currentDraft,
        approach: firstApproach,
        customIndication:
          !firstIsSalpingectomy && firstDefinition.isCustom
            ? firstIndicationOptions[0]?.value ?? ''
            : '',
        entryTechnique:
          firstApproach === 'coelioscopie' || firstApproach === 'robot'
            ? firstEntryTechniques[0] ?? null
            : null,
        indication: firstIsSalpingectomy ? firstSalpingectomyIndications[0] ?? null : null,
        laterality:
          firstIsSalpingectomy || firstDefinition.requiresLaterality
            ? currentDraft.laterality ?? DEFAULT_LATERALITIES[0]
            : null,
        procedureId: firstDefinition.id,
      }));
    }
  }, [draft.procedureId, firstDefinition]);

  useEffect(() => {
    if (!draft.seniorProfileId && seniorProfiles[0]) {
      setDraft((currentDraft) => ({
        ...currentDraft,
        seniorProfileId: seniorProfiles[0].id,
      }));
    }
  }, [draft.seniorProfileId, seniorProfiles]);

  function updateProcedure(procedureId: string) {
    const nextDefinition = definitions.find((definition) => definition.id === procedureId);
    const nextApproach = nextDefinition?.allowedApproaches[0] ?? null;
    const nextEntryTechniques = getAvailableEntryTechniques(nextDefinition);
    const nextIsSalpingectomy = isSalpingectomyDefinition(nextDefinition);
    const nextSalpingectomyIndications = getSalpingectomyIndications(nextDefinition);
    const nextIndicationOptions = getDefinitionIndicationOptions(nextDefinition);
    const nextRequiresLaterality =
      nextIsSalpingectomy || Boolean(nextDefinition?.requiresLaterality);

    setDraft((currentDraft) => ({
      ...currentDraft,
      approach: nextApproach,
      checklist: {},
      entryTechnique:
        nextApproach === 'coelioscopie' || nextApproach === 'robot'
          ? nextEntryTechniques[0] ?? null
          : null,
      customIndication:
        !nextIsSalpingectomy && nextDefinition?.isCustom
          ? nextIndicationOptions[0]?.value ?? ''
          : '',
      indication: nextIsSalpingectomy ? nextSalpingectomyIndications[0] ?? null : null,
      laterality: nextRequiresLaterality ? currentDraft.laterality ?? DEFAULT_LATERALITIES[0] : null,
      note: '',
      procedureId,
    }));
  }

  function updateApproach(approach: string) {
    const nextEntryTechniques = getAvailableEntryTechniques(selectedDefinition);

    setDraft((currentDraft) => ({
      ...currentDraft,
      approach,
      checklist: {},
      entryTechnique:
        approach === 'coelioscopie' || approach === 'robot'
          ? currentDraft.entryTechnique && nextEntryTechniques.includes(currentDraft.entryTechnique)
            ? currentDraft.entryTechnique
            : nextEntryTechniques[0] ?? null
          : null,
    }));
  }

  if (profile.role !== 'internal') {
    return (
      <View style={styles.dashboardLayout}>
        <HeaderBar onBack={onBack} title="Nouvelle intervention" />
        <View style={styles.noticeCard}>
          <Text style={styles.kicker}>Accès limité</Text>
          <Text style={styles.cardTitle}>Saisie réservée au compte interne</Text>
          <Text style={styles.noticeText}>
            Le compte admin peut superviser les données, mais la création mobile
            d'interventions est limitée à joris.poquet pour éviter les erreurs de rattachement.
          </Text>
        </View>
      </View>
    );
  }

  if (definitions.length === 0) {
    return (
      <View style={styles.dashboardLayout}>
        <HeaderBar onBack={onBack} title="Nouvelle intervention" />
        <View style={styles.noticeCard}>
          <Text style={styles.kicker}>Catalogue vide</Text>
          <Text style={styles.cardTitle}>Aucune intervention disponible</Text>
          <Text style={styles.noticeText}>
            Le catalogue doit contenir au moins une définition active avant de saisir.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.dashboardLayout, styles.interventionFlowLayout]}>
      <FlowHeader step={1} title="Ajouter une intervention" />

      <MobileFlowCard Icon={CalendarDays} title="Date de l’intervention">
        <Pressable
          accessibilityLabel="Date de l’intervention"
          accessibilityRole="button"
          onPress={() => setIsDatePickerOpen(true)}
          style={styles.flowInputShell}
        >
          <Text style={styles.flowInputDisplay}>{formatDisplayDate(draft.date)}</Text>
        </Pressable>
        <FlowDatePickerSheet
          onChange={(date) => setDraft((currentDraft) => ({ ...currentDraft, date }))}
          onClose={() => setIsDatePickerOpen(false)}
          value={draft.date}
          visible={isDatePickerOpen}
        />
      </MobileFlowCard>

      <MobileFlowCard Icon={UserRound} title="Senior">
        {seniorOptions.length ? (
          <FlowSelectField
            isOpen={openSelect === 'senior'}
            onPress={() => setOpenSelect((current) => (current === 'senior' ? null : 'senior'))}
            onSelect={(value) => {
              setDraft((currentDraft) => ({
                ...currentDraft,
                seniorProfileId: value,
              }));
              setOpenSelect(null);
            }}
            options={seniorOptions}
            placeholder="Sélectionne un senior"
            value={draft.seniorProfileId}
            valueLabel={selectedSeniorLabel}
          />
        ) : (
          <Text style={styles.flowEmptyState}>Aucun senior disponible pour le moment.</Text>
        )}
      </MobileFlowCard>

      <MobileFlowCard
        description="Évalue la difficulté globale selon ton ressenti, de 1 à 10."
        Icon={Gauge}
        title="Difficulté ressentie"
      >
        <ComplexitySliderLike
          onChange={(complexity) =>
            setDraft((currentDraft) => ({
              ...currentDraft,
              complexity,
            }))
          }
          value={draft.complexity ?? 5}
        />
      </MobileFlowCard>

      <View style={styles.mobileFlowGrid}>
        <MobileFlowCard Icon={SurgicalMaskMobileIcon} title="Intervention">
          <FlowSelectField
            isOpen={openSelect === 'procedure'}
            onPress={() => setOpenSelect((current) => (current === 'procedure' ? null : 'procedure'))}
            onSelect={(value) => {
              updateProcedure(value);
              setOpenSelect(null);
            }}
            options={procedureOptions}
            placeholder="Sélectionne une intervention"
            value={draft.procedureId}
            valueLabel={selectedProcedureLabel}
          />
        </MobileFlowCard>

        <MobileFlowCard
          empty={indicationOptions.length === 0}
          Icon={ClipboardList}
          title="Indication"
        >
          {indicationOptions.length ? (
            <View style={styles.flowChoiceStack}>
              {indicationOptions.map((option) => (
                <FlowChoicePill
                  key={option.value}
                  label={option.label}
                  onPress={() =>
                    setDraft((currentDraft) => ({
                      ...currentDraft,
                      customIndication: isSalpingectomy ? '' : option.value,
                      indication: isSalpingectomy ? option.value : null,
                      note:
                        isSalpingectomy && option.value !== 'autre'
                          ? ''
                          : currentDraft.note,
                    }))
                  }
                  selected={selectedIndicationValue === option.value}
                />
              ))}
            </View>
          ) : (
            <Text style={styles.flowEmptyState}>
              Aucune indication n'est à renseigner pour cette intervention.
            </Text>
          )}
        </MobileFlowCard>
      </View>

      {isSalpingectomy && draft.indication === 'autre' ? (
        <MobileFlowCard
          description="Tu peux préciser l’indication en quelques mots."
          title="Précision libre"
        >
          <TextInput
            multiline
            onChangeText={(value) =>
              setDraft((currentDraft) => ({ ...currentDraft, note: value }))
            }
            placeholder="Exemple : contexte particulier"
            placeholderTextColor={colors.muted}
            style={[styles.flowInputControl, styles.textarea]}
            value={draft.note}
          />
        </MobileFlowCard>
      ) : null}

      <MobileFlowCard
        empty={availableApproaches.length === 0}
        Icon={Eye}
        title="Voie d’abord et technique d’entrée"
      >
        {availableApproaches.length ? (
          <View style={styles.flowFieldStack}>
            <Text style={styles.flowFieldLabel}>Voie d’abord</Text>
            <FlowSelectField
              isOpen={openSelect === 'approach'}
              onPress={() => setOpenSelect((current) => (current === 'approach' ? null : 'approach'))}
              onSelect={(value) => {
                updateApproach(value);
                setOpenSelect(null);
              }}
              options={approachOptions}
              placeholder="Choisir"
              value={draft.approach}
              valueLabel={selectedApproachLabel}
            />

            {shouldShowEntryTechnique ? (
              <>
                <Text style={styles.flowFieldLabel}>Technique d’entrée</Text>
                <FlowSelectField
                  isOpen={openSelect === 'entryTechnique'}
                  onPress={() =>
                    setOpenSelect((current) =>
                      current === 'entryTechnique' ? null : 'entryTechnique'
                    )
                  }
                  onSelect={(value) => {
                    setDraft((currentDraft) => ({
                      ...currentDraft,
                      entryTechnique: value,
                    }));
                    setOpenSelect(null);
                  }}
                  options={entryTechniqueOptions}
                  placeholder="Choisir"
                  value={draft.entryTechnique}
                  valueLabel={selectedEntryTechniqueLabel}
                />
              </>
            ) : (
              <View style={styles.flowNoteBox}>
                <Text style={styles.flowNoteBoxLabel}>Technique d’entrée</Text>
              </View>
            )}
          </View>
        ) : (
          <Text style={styles.flowEmptyState}>
            Aucune voie d’abord n’est à renseigner pour cette intervention.
          </Text>
        )}
      </MobileFlowCard>

      <View style={styles.mobileFlowGrid}>
        <MobileFlowCard
          description="Rôle que tu as eu sur au moins la moitié de l'intervention."
          Icon={UsersRound}
          title="Rôle global"
        >
          <View style={[styles.flowChoiceStack, styles.flowChoiceStackRole]}>
            {DEFAULT_ROLES.map((role) => (
              <FlowChoicePill
                key={role}
                label={labelForInterventionRole(role)}
                onPress={() =>
                  setDraft((currentDraft) => ({
                    ...currentDraft,
                    role,
                  }))
                }
                selected={draft.role === role}
                variant="role"
              />
            ))}
          </View>
        </MobileFlowCard>

        {shouldShowLaterality ? (
          <MobileFlowCard Icon={Signpost} title="Latéralité">
            <View style={[styles.flowChoiceStack, styles.flowChoiceStackLaterality]}>
              {DEFAULT_LATERALITIES.map((laterality) => (
                <FlowChoicePill
                  key={laterality}
                  label={labelForLaterality(laterality)}
                  onPress={() =>
                    setDraft((currentDraft) => ({
                      ...currentDraft,
                      laterality,
                    }))
                  }
                  selected={draft.laterality === laterality}
                  variant="laterality"
                />
              ))}
            </View>
          </MobileFlowCard>
        ) : null}
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.flowActionBlock}>
        <Text
          style={[
            styles.flowActionHint,
            isDraftReady && styles.flowActionHintReady,
          ]}
        >
          {isDraftReady
            ? 'Tous les champs requis sont renseignés.'
            : `Champs à compléter : ${draftMissingFields.join(', ')}.`}
        </Text>
        <Pressable
          accessibilityRole="button"
          disabled={!isDraftReady}
          onPress={() => onContinue(draft)}
          style={({ pressed }) => [
            styles.primaryButton,
            styles.flowActionPrimary,
            pressed && styles.primaryButtonPressed,
            !isDraftReady && styles.primaryButtonDisabled,
            !isDraftReady && styles.flowActionPrimaryDisabled,
          ]}
        >
          <Text style={styles.primaryButtonText}>Continuer</Text>
        </Pressable>
      </View>
    </View>
  );
}

type ChecklistScreenProps = {
  definitions: SurgicalDefinition[];
  draft: InterventionDraft;
  onBack: () => void;
  onContinue: () => void;
  onDraftChange: (draft: InterventionDraft) => void;
};

function ChecklistScreen({
  definitions,
  draft,
  onBack,
  onContinue,
  onDraftChange,
}: ChecklistScreenProps) {
  const [isScaleOpen, setIsScaleOpen] = useState(false);
  const progress = getChecklistProgress(draft, definitions);
  const autonomyAverage = getChecklistAverage(
    progress.steps.map((step) => draft.checklist[step.id])
  );

  function updateChecklistLevel(stepId: string, level: ChecklistLevel) {
    onDraftChange({
      ...draft,
      checklist: {
        ...draft.checklist,
        [stepId]: level,
      },
    });
  }

  function setAllChecklistLevels(level: ChecklistLevel) {
    onDraftChange({
      ...draft,
      checklist: progress.steps.reduce<Record<string, ChecklistLevel | null>>(
        (nextChecklist, step) => ({
          ...nextChecklist,
          [step.id]: level,
        }),
        { ...draft.checklist }
      ),
    });
  }

  return (
    <View style={styles.dashboardLayout}>
      <FlowHeader
        step={2}
        subtitle="Renseigne ton niveau d’autonomie étape par étape."
        title="Checklist technique"
      />

      <View style={styles.flowCard}>
        <View style={styles.flowCardHeader}>
          <View style={styles.flowCardIcon}>
            <BookOpen color={colors.teal} size={23} strokeWidth={2.1} />
          </View>
          <View style={styles.flowCardTitleBlock}>
            <Text style={styles.flowCardTitle}>Barème d’autonomie</Text>
          </View>
          <Pressable
            accessibilityLabel={isScaleOpen ? 'Masquer le barème' : 'Afficher le barème'}
            accessibilityRole="button"
            onPress={() => setIsScaleOpen((currentValue) => !currentValue)}
            style={styles.flowIconToggle}
          >
            {isScaleOpen ? (
              <ChevronUp color={colors.teal} size={18} strokeWidth={2.2} />
            ) : (
              <ChevronDown color={colors.teal} size={18} strokeWidth={2.2} />
            )}
          </Pressable>
        </View>

        {isScaleOpen ? (
          <View style={styles.flowScaleList}>
            {CHECKLIST_LEVEL_OPTIONS.map((level) => (
              <View key={level.value} style={styles.flowScaleItem}>
                <Text style={styles.flowScaleTitle}>
                  {level.label} · {level.description}
                </Text>
                <Text style={styles.flowScaleText}>{level.detail}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      {progress.applicable ? (
        <>
          <View style={styles.flowCard}>
            <Text style={styles.flowCardTitle}>Remplissage rapide</Text>
            <Text style={styles.flowCardDescription}>
              Applique un niveau à toutes les étapes, puis ajuste si besoin.
            </Text>
            <View style={styles.flowLevelList}>
              {CHECKLIST_LEVEL_OPTIONS.map((level) => (
                <ChecklistLevelButton
                  key={level.value}
                  level={level.value}
                  onPress={() => setAllChecklistLevels(level.value)}
                />
              ))}
            </View>
          </View>

          <View style={styles.flowCard}>
            <Text style={styles.flowCardTitle}>Étapes de l’intervention</Text>
            <View style={styles.flowChecklistTable}>
              {progress.steps.map((step) => (
                <View key={step.id} style={styles.flowChecklistRow}>
                  <Text style={styles.flowChecklistLabel}>{step.label}</Text>
                  <View style={styles.flowChecklistActions}>
                    {CHECKLIST_LEVEL_OPTIONS.map((level) => (
                      <ChecklistLevelButton
                        key={level.value}
                        level={level.value}
                        onPress={() => updateChecklistLevel(step.id, level.value)}
                        selected={draft.checklist[step.id] === level.value}
                      />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          </View>
        </>
      ) : (
        <View style={styles.flowCard}>
          <Text style={styles.flowCardTitle}>Étapes de l’intervention</Text>
          <Text style={styles.homeEmptyLine}>
            Aucune checklist spécifique n’est définie pour cette intervention.
            Tu peux poursuivre directement vers le récapitulatif.
          </Text>
        </View>
      )}

      <View style={styles.flowSummaryCard}>
        <View>
          <Text style={styles.flowSummaryHeadline}>
            {progress.completed} / {progress.total} étapes renseignées
          </Text>
          <Text style={styles.flowSummaryCaption}>Autonomie moyenne</Text>
        </View>
        <Text style={styles.flowScoreBadge}>{formatChecklistAverage(autonomyAverage)}</Text>
      </View>

      <View style={styles.flowActionsSplit}>
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Retour à l’étape 1</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!progress.isComplete}
          onPress={onContinue}
          style={[
            styles.primaryButton,
            styles.flowActionButton,
            !progress.isComplete && styles.primaryButtonDisabled,
          ]}
        >
          <Text style={styles.primaryButtonText}>Continuer</Text>
        </Pressable>
      </View>
    </View>
  );
}

type SummaryScreenProps = {
  definitions: SurgicalDefinition[];
  draft: InterventionDraft;
  error: string | null;
  isSaving: boolean;
  onBack: () => void;
  onSubmit: () => void;
  seniorProfiles: SeniorProfile[];
};

function SummaryScreen({
  definitions,
  draft,
  error,
  isSaving,
  onBack,
  onSubmit,
  seniorProfiles,
}: SummaryScreenProps) {
  const definition = definitions.find((item) => item.id === draft.procedureId);
  const seniorLabel = formatDraftSeniorName(draft.seniorProfileId, seniorProfiles);
  const progress = getChecklistProgress(draft, definitions);
  const isReadyToValidate = progress.isComplete && isInterventionDraftReady(draft, definitions);
  const isSalpingectomy = isSalpingectomyDefinition(definition);
  const indicationLabel = isSalpingectomy
    ? draft.indication === 'autre' && draft.note.trim()
      ? `Autre · ${draft.note.trim()}`
      : labelForDefinitionIndication(definition, draft.indication)
    : draft.customIndication.trim() || 'Non renseigné';
  const approachLabel = labelForApproach(draft.approach);
  const approachSummary =
    draft.approach && draft.entryTechnique
      ? `${approachLabel} – ${labelForEntryTechnique(draft.entryTechnique)}`
      : approachLabel;
  const lateralityLabel = shouldRequireLateralityForDraft(draft, definitions)
    ? labelForLaterality(draft.laterality)
    : 'Non applicable';

  return (
    <View style={styles.dashboardLayout}>
      <FlowHeader
        onBack={onBack}
        step={3}
        subtitle="Vérifie les informations et confirme l’enregistrement si tout est correct."
        title="Récapitulatif avant enregistrement"
      />

      <View style={styles.flowCard}>
        <SummaryInfoRow label="Date" value={formatDisplayDate(draft.date)} />
        <SummaryInfoRow
          label="Senior"
          value={seniorLabel}
        />
        <SummaryInfoRow
          label="Intervention"
          value={definition?.name ?? humanize(draft.procedureId)}
        />
        <SummaryInfoRow label="Indication" value={indicationLabel} />
        <SummaryInfoRow label="Voie d’abord" value={approachSummary} />
        <SummaryInfoRow
          label="Rôle global"
          value={labelForInterventionRole(draft.role)}
        />
        <SummaryInfoRow label="Latéralité" value={lateralityLabel} />
        <SummaryInfoRow
          label="Difficulté ressentie"
          value={draft.complexity != null ? `${draft.complexity} / 10` : 'Non renseignée'}
        />
      </View>

      <View style={styles.flowSuccessCard}>
        <View style={styles.flowSuccessIcon}>
          <CheckCircle2 color={colors.paper} size={26} strokeWidth={2.4} />
        </View>
        <View style={styles.flowSuccessCopy}>
          <Text style={styles.flowSuccessTitle}>
            {isReadyToValidate ? 'Prêt à valider' : 'Récapitulatif incomplet'}
          </Text>
        </View>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Pressable
        accessibilityRole="button"
        disabled={!isReadyToValidate || isSaving}
        onPress={onSubmit}
        style={[
          styles.primaryButton,
          (!isReadyToValidate || isSaving) && styles.primaryButtonDisabled,
        ]}
      >
        {isSaving ? (
          <ActivityIndicator color={colors.paper} />
        ) : (
          <Text style={styles.primaryButtonText}>Enregistrer l’intervention</Text>
        )}
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Retour à l’étape 2</Text>
      </Pressable>
    </View>
  );
}

type SeniorEvaluationScreenProps = {
  definitions: SurgicalDefinition[];
  error: string | null;
  evaluation: InterventionEvaluation | undefined;
  internalProfiles: InternalProfileSummary[];
  intervention: RecentIntervention | null;
  isSaving: boolean;
  onBack: () => void;
  onSave: (intervention: RecentIntervention, draft: SeniorEvaluationDraft) => void;
};

function SeniorEvaluationScreen({
  definitions,
  error,
  evaluation,
  internalProfiles,
  intervention,
  isSaving,
  onBack,
  onSave,
}: SeniorEvaluationScreenProps) {
  const [draft, setDraft] = useState<SeniorEvaluationDraft>({
    categoryDifficulty: evaluation?.categoryDifficulty ?? null,
    globalPerformance: evaluation?.globalPerformance ?? null,
    seniorComment: evaluation?.seniorComment ?? '',
  });
  const [isAutoEvaluationOpen, setIsAutoEvaluationOpen] = useState(true);

  useEffect(() => {
    setDraft({
      categoryDifficulty: evaluation?.categoryDifficulty ?? null,
      globalPerformance: evaluation?.globalPerformance ?? null,
      seniorComment: evaluation?.seniorComment ?? '',
    });
  }, [evaluation?.categoryDifficulty, evaluation?.globalPerformance, evaluation?.seniorComment]);

  if (!intervention) {
    return (
      <View style={styles.homeLayout}>
        <HeaderBar onBack={onBack} title="Évaluer l’interne" />
        <View style={styles.noticeCard}>
          <Text style={styles.kicker}>Intervention introuvable</Text>
          <Text style={styles.noticeText}>
            Cette intervention n’est plus disponible dans les données synchronisées.
          </Text>
        </View>
      </View>
    );
  }

  const internalProfile =
    internalProfiles.find((profile) => profile.id === intervention.internalProfileId) ?? null;
  const definition =
    definitions.find((item) => item.id === intervention.procedureId) ?? null;
  const checklistSteps = getInterventionChecklistSteps(intervention, definitions);
  const keyStepAverage = getInterventionChecklistAverage(intervention, definitions);
  const selectedPerformanceOption = draft.globalPerformance
    ? ADMIN_PERFORMANCE_OPTIONS.find((option) => option.value === draft.globalPerformance)
    : null;
  const selectedDifficultyOption = draft.categoryDifficulty
    ? ADMIN_CATEGORY_DIFFICULTY_OPTIONS.find((option) => option.value === draft.categoryDifficulty)
    : null;
  const computedAutonomyScore = calculateMobileAutonomyScore(
    intervention,
    definitions,
    {
      categoryDifficulty: draft.categoryDifficulty,
      globalPerformance: draft.globalPerformance,
      interventionId: intervention.id,
      seniorComment: draft.seniorComment,
      seniorProfileId: intervention.seniorProfileId,
      updatedAt: evaluation?.updatedAt ?? null,
    }
  );
  const approachIconSource = getApproachIconSource(intervention.approach);
  const canValidate = Boolean(draft.globalPerformance && draft.categoryDifficulty);

  function updateDraft(nextDraft: Partial<SeniorEvaluationDraft>) {
    setDraft((currentDraft) => ({
      ...currentDraft,
      ...nextDraft,
    }));
  }

  return (
    <View style={styles.homeLayout}>
      <HeaderBar onBack={onBack} title="Évaluer l’interne" />

      <View style={styles.seniorEvaluationSummaryCard}>
        <View style={styles.seniorEvaluationSummaryMain}>
          <View style={styles.homeInterventionMedallion}>
            {approachIconSource ? (
              <Image
                resizeMode="contain"
                source={approachIconSource}
                style={styles.homeInterventionApproachImage as ImageStyle}
              />
            ) : (
              <ClipboardList color={colors.teal} size={32} strokeWidth={2.1} />
            )}
          </View>
          <View style={styles.seniorEvaluationSummaryCopy}>
            <Text style={styles.homeInterventionDate}>
              {formatLongDisplayDate(intervention.date)}
            </Text>
            <Text style={styles.seniorEvaluationSummaryTitle}>
              {intervention.procedureName}
            </Text>
            <Text style={styles.homeInterventionMeta}>
              {formatInternalProfileName(internalProfile)} -{' '}
              {labelForInterventionRole(intervention.role)}
            </Text>
            <Text style={styles.homeInterventionMeta}>
              Indication : {getInterventionIndicationLabel(intervention, definition)}
            </Text>
          </View>
        </View>
        <View style={styles.seniorEvaluationScoreBox}>
          <CheckCircle2 color={colors.teal} size={22} strokeWidth={2.2} />
          <View>
            <Text style={styles.seniorEvaluationScoreValue}>
              {formatChecklistAverage(keyStepAverage)}
            </Text>
            <Text style={styles.seniorEvaluationScoreLabel}>Auto-évaluation</Text>
          </View>
        </View>
      </View>

      <View style={styles.seniorEvaluationPanel}>
        <Pressable
          accessibilityRole="button"
          onPress={() => setIsAutoEvaluationOpen((currentValue) => !currentValue)}
          style={styles.seniorEvaluationToggle}
        >
          <Text style={styles.seniorEvaluationPanelTitle}>
            Détail de l’auto-évaluation
          </Text>
          <Text style={styles.seniorEvaluationToggleText}>
            {isAutoEvaluationOpen ? 'Masquer' : 'Voir'}
          </Text>
        </Pressable>

        {isAutoEvaluationOpen ? (
          <View style={styles.seniorAutoEvaluationList}>
            {checklistSteps.length ? (
              checklistSteps.map((step) => {
                const level = intervention.checklist[step.id];

                return (
                  <View key={step.id} style={styles.seniorAutoEvaluationRow}>
                    <Text style={styles.seniorAutoEvaluationStep}>{step.label}</Text>
                    <Text style={styles.seniorAutoEvaluationBadge}>
                      {getChecklistLevelBadgeLabel(level)}
                    </Text>
                    <Text style={styles.seniorAutoEvaluationDescription}>
                      {getChecklistLevelDescription(level)}
                    </Text>
                  </View>
                );
              })
            ) : (
              <Text style={styles.homeEmptyLine}>
                Aucun temps opératoire clé défini pour cette intervention.
              </Text>
            )}
          </View>
        ) : null}
      </View>

      <View style={styles.seniorEvaluationPanel}>
        <Text style={styles.seniorEvaluationPanelTitle}>
          1. Performance chirurgicale globale
        </Text>
        <View style={styles.seniorRatingGrid}>
          {ADMIN_PERFORMANCE_OPTIONS.map((option) => (
            <SeniorRatingOption
              key={option.value}
              label={SENIOR_PERFORMANCE_SHORT_LABELS[option.value]}
              marker={option.value}
              onPress={() => updateDraft({ globalPerformance: option.value })}
              selected={draft.globalPerformance === option.value}
            />
          ))}
        </View>
        {selectedPerformanceOption ? (
          <Text style={styles.seniorRatingDescription}>
            {selectedPerformanceOption.description}
          </Text>
        ) : null}
      </View>

      <View style={styles.seniorEvaluationPanel}>
        <Text style={styles.seniorEvaluationPanelTitle}>
          2. Difficulté chirurgicale intra-catégorie
        </Text>
        <View style={styles.seniorRatingGrid}>
          {ADMIN_CATEGORY_DIFFICULTY_OPTIONS.map((option) => (
            <SeniorRatingOption
              key={option.value}
              label={SENIOR_DIFFICULTY_SHORT_LABELS[option.value]}
              marker={'★'.repeat(Number(option.value))}
              onPress={() => updateDraft({ categoryDifficulty: option.value })}
              selected={draft.categoryDifficulty === option.value}
            />
          ))}
        </View>
        {selectedDifficultyOption ? (
          <Text style={styles.seniorRatingDescription}>
            {selectedDifficultyOption.description}
          </Text>
        ) : null}
      </View>

      <View style={styles.seniorEvaluationPanel}>
        <Text style={styles.seniorEvaluationPanelTitle}>
          3. Commentaire senior
        </Text>
        <TextInput
          maxLength={200}
          multiline
          onChangeText={(value) => updateDraft({ seniorComment: value })}
          placeholder="Points forts, axes d’amélioration, objectif pour la suite…"
          placeholderTextColor={colors.muted}
          style={[styles.input, styles.seniorCommentInput]}
          value={draft.seniorComment}
        />
        <Text style={styles.seniorCommentCounter}>
          {draft.seniorComment.length} / 200
        </Text>
      </View>

      <View style={styles.seniorEvaluationResultCard}>
        <View style={styles.seniorEvaluationResultCopy}>
          <Text style={styles.seniorEvaluationResultLabel}>Score opératoire estimé</Text>
          <Text
            style={[
              styles.seniorEvaluationResultValue,
              keyStepAverage == null && styles.seniorEvaluationResultValueUnavailable,
            ]}
          >
            {keyStepAverage == null
              ? INSUFFICIENT_KEY_STEP_COVERAGE_MESSAGE
              : formatAutonomyScore(computedAutonomyScore)}
          </Text>
        </View>
        <View
          style={[
            styles.seniorEvaluationStatusPill,
            canValidate && styles.seniorEvaluationStatusPillDone,
          ]}
        >
          <Text
            style={[
              styles.seniorEvaluationStatusText,
              canValidate && styles.seniorEvaluationStatusTextDone,
            ]}
          >
            {canValidate ? 'Prêt' : 'Incomplet'}
          </Text>
        </View>
      </View>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <Pressable
        accessibilityRole="button"
        disabled={!canValidate || isSaving}
        onPress={() => onSave(intervention, draft)}
        style={[styles.primaryButton, (!canValidate || isSaving) && styles.primaryButtonDisabled]}
      >
        {isSaving ? (
          <ActivityIndicator color={colors.paper} />
        ) : (
          <View style={styles.seniorEvaluationSubmitContent}>
            <Check color={colors.paper} size={20} strokeWidth={2.3} />
            <Text style={styles.primaryButtonText}>Valider l’évaluation</Text>
          </View>
        )}
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.secondaryButton}>
        <Text style={styles.secondaryButtonText}>Retour à l’espace senior</Text>
      </Pressable>
    </View>
  );
}

function SeniorRatingOption({
  label,
  marker,
  onPress,
  selected,
}: {
  label: string;
  marker: string;
  onPress: () => void;
  selected: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.seniorRatingOption,
        selected && styles.seniorRatingOptionSelected,
      ]}
    >
      <Text
        style={[
          styles.seniorRatingMarker,
          selected && styles.seniorRatingMarkerSelected,
        ]}
      >
        {marker}
      </Text>
      <Text
        style={[
          styles.seniorRatingLabel,
          selected && styles.seniorRatingLabelSelected,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

type HistoryScreenProps = {
  definitions: SurgicalDefinition[];
  evaluations: Record<string, InterventionEvaluation>;
  interventions: RecentIntervention[];
  profile: Profile;
  seniorProfiles: SeniorProfile[];
  trophyDefinitions: TrophyDefinition[];
};

function HistoryScreen({
  definitions,
  evaluations,
  interventions,
  profile,
  seniorProfiles,
  trophyDefinitions,
}: HistoryScreenProps) {
  const sortedInterventions = [...interventions].sort((left, right) => {
    const dateDelta = right.date.localeCompare(left.date);
    return dateDelta !== 0 ? dateDelta : right.savedAt.localeCompare(left.savedAt);
  });
  const initialDate = sortedInterventions[0]?.date ?? getTodayInputDate();
  const [viewMode, setViewMode] = useState<'calendar' | 'progress'>('calendar');
  const [progressSubTab, setProgressSubTab] = useState<'autonomy' | 'steps' | 'trophies'>(
    'autonomy'
  );
  const [detailInterventionId, setDetailInterventionId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const date = parseIsoDate(initialDate);
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });
  const interventionsByDate = sortedInterventions.reduce(
    (map, intervention) => {
      const dayInterventions = map.get(intervention.date) ?? [];
      dayInterventions.push(intervention);
      map.set(intervention.date, dayInterventions);
      return map;
    },
    new Map<string, RecentIntervention[]>()
  );
  const selectedDayInterventions = interventionsByDate.get(selectedDate) ?? [];
  const calendarDays = getCalendarDays(visibleMonth);
  const detailIntervention =
    sortedInterventions.find((intervention) => intervention.id === detailInterventionId) ??
    null;
  const detailEvaluation = detailIntervention
    ? evaluations[detailIntervention.id]
    : undefined;
  const evaluatedDetailIntervention =
    detailIntervention && hasCompleteEvaluation(detailEvaluation)
      ? detailIntervention
      : null;
  const scoredInterventions = sortedInterventions
    .map((intervention, index) => {
      const evaluation = evaluations[intervention.id];
      const score = calculateMobileAutonomyScore(intervention, definitions, evaluation);

      return hasCompleteEvaluation(evaluation) && score != null
        ? {
            index: sortedInterventions.length - index,
            intervention,
            score,
          }
        : null;
    })
    .filter(
      (item): item is { index: number; intervention: RecentIntervention; score: number } =>
        item != null
    )
    .reverse();
  const evaluatedCount = sortedInterventions.filter((intervention) =>
    hasCompleteEvaluation(evaluations[intervention.id])
  ).length;
  const pendingCount = Math.max(0, sortedInterventions.length - evaluatedCount);
  const averageScore = averageNumbers(scoredInterventions.map((item) => item.score));
  const latestScore = scoredInterventions[scoredInterventions.length - 1]?.score ?? null;
  const stepStats = buildMobileStepStats(sortedInterventions, definitions);
  const trophyDisplay = buildMobileTrophyDisplay({
    definitions,
    evaluations,
    profile,
    recentInterventions: sortedInterventions,
    trophyDefinitions,
  });
  const visibleTrophyProgress = trophyDisplay.progress;

  function moveVisibleMonth(offset: number) {
    setVisibleMonth((currentMonth) => {
      const nextMonth = new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth() + offset,
        1
      );
      const firstInterventionInMonth = sortedInterventions.find((intervention) => {
        const interventionDate = parseIsoDate(intervention.date);
        return (
          interventionDate.getFullYear() === nextMonth.getFullYear() &&
          interventionDate.getMonth() === nextMonth.getMonth()
        );
      });

      setSelectedDate(firstInterventionInMonth?.date ?? toIsoDate(nextMonth));
      setDetailInterventionId(null);
      return nextMonth;
    });
  }

  if (evaluatedDetailIntervention) {
    return (
      <View style={styles.homeLayout}>
        <HeaderBar
          onBack={() => setDetailInterventionId(null)}
          title="Détail de l’intervention"
        />
        <InterventionDetailCard
          definitions={definitions}
          evaluation={detailEvaluation}
          intervention={evaluatedDetailIntervention}
          seniorProfiles={seniorProfiles}
        />
      </View>
    );
  }

  return (
    <View style={styles.homeLayout}>
      <ScreenHero title={viewMode === 'calendar' ? 'Historique des blocs' : 'Ma progression'} />

      <View style={styles.historyViewSwitch} accessibilityLabel="Mode d'affichage">
        <Pressable
          accessibilityRole="button"
          onPress={() => setViewMode('calendar')}
          style={[
            styles.historyViewSwitchItem,
            viewMode === 'calendar' && styles.historyViewSwitchItemActive,
          ]}
        >
          <Text
            style={[
              styles.historyViewSwitchText,
              viewMode === 'calendar' && styles.historyViewSwitchTextActive,
            ]}
          >
            Calendrier
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => setViewMode('progress')}
          style={[
            styles.historyViewSwitchItem,
            viewMode === 'progress' && styles.historyViewSwitchItemActive,
          ]}
        >
          <Text
            style={[
              styles.historyViewSwitchText,
              viewMode === 'progress' && styles.historyViewSwitchTextActive,
            ]}
          >
            Progression
          </Text>
        </Pressable>
      </View>

      {viewMode === 'calendar' ? (
        <>
          <View style={styles.historyCalendarCard}>
            <View style={styles.historyCalendarHeader}>
              <Pressable
                accessibilityLabel="Mois précédent"
                accessibilityRole="button"
                onPress={() => moveVisibleMonth(-1)}
                style={styles.historyCalendarArrow}
              >
                <ChevronLeft color={colors.deep} size={22} strokeWidth={2.1} />
              </Pressable>
              <Text style={styles.historyCalendarTitle}>{getMonthTitle(visibleMonth)}</Text>
              <Pressable
                accessibilityLabel="Mois suivant"
                accessibilityRole="button"
                onPress={() => moveVisibleMonth(1)}
                style={styles.historyCalendarArrow}
              >
                <ChevronRight color={colors.deep} size={22} strokeWidth={2.1} />
              </Pressable>
            </View>

            <View style={styles.historyCalendarGrid}>
              {WEEKDAY_LABELS.map((label) => (
                <Text key={label} style={styles.historyCalendarWeekday}>
                  {label}
                </Text>
              ))}
              {calendarDays.map((date) => {
                const dateKey = toIsoDate(date);
                const dayInterventions = interventionsByDate.get(dateKey) ?? [];
                const interventionsCount = dayInterventions.length;
                const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();
                const isSelected = dateKey === selectedDate;

                return (
                  <Pressable
                    accessibilityRole="button"
                  key={dateKey}
                  onPress={() => {
                    setSelectedDate(dateKey);
                    setDetailInterventionId(null);
                  }}
                    style={[
                      styles.historyCalendarDay,
                      !isCurrentMonth && styles.historyCalendarDayMuted,
                      interventionsCount > 0 && styles.historyCalendarDayMarked,
                      isSelected && styles.historyCalendarDaySelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.historyCalendarDayText,
                        !isCurrentMonth && styles.historyCalendarDayTextMuted,
                        isSelected && styles.historyCalendarDayTextSelected,
                      ]}
                    >
                      {date.getDate()}
                    </Text>
                    {interventionsCount > 0 ? (
                      <View
                        style={[
                          styles.historyCalendarDot,
                          isSelected && styles.historyCalendarDotSelected,
                        ]}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.homeCard}>
            <HomeSectionHeader title={getDayTitle(selectedDate)} />
            {selectedDayInterventions.length ? (
              <View style={styles.homeInterventionList}>
                {selectedDayInterventions.map((intervention) => (
                  <HistoryInterventionCard
                    evaluation={evaluations[intervention.id]}
                    intervention={intervention}
                    isSelected={false}
                    key={intervention.id}
                    onPress={
                      hasCompleteEvaluation(evaluations[intervention.id])
                        ? () => setDetailInterventionId(intervention.id)
                        : undefined
                    }
                    seniorProfiles={seniorProfiles}
                  />
                ))}
              </View>
            ) : (
              <Text style={styles.homeEmptyLine}>
                Aucune intervention enregistrée ce jour-là.
              </Text>
            )}
          </View>

          {selectedDayInterventions.some(
            (intervention) => !hasCompleteEvaluation(evaluations[intervention.id])
          ) ? (
            <Text style={styles.homeEmptyLine}>
              Les détails d’une intervention sont accessibles après validation senior.
            </Text>
          ) : null}
        </>
      ) : (
        <View style={styles.progressDashboard}>
          <View style={styles.progressMetricGrid}>
            <ProgressMetricCard
              label="Interventions"
              value={`${sortedInterventions.length}`}
            />
            <ProgressMetricCard label="Validées" value={`${evaluatedCount}`} />
            <ProgressMetricCard label="À évaluer" value={`${pendingCount}`} />
          </View>

          <View style={styles.progressSubtabs}>
            <Pressable
              accessibilityRole="button"
              onPress={() => setProgressSubTab('autonomy')}
              style={[
                styles.progressSubtabItem,
                progressSubTab === 'autonomy' && styles.progressSubtabItemActive,
              ]}
            >
              <BarChart3
                color={progressSubTab === 'autonomy' ? colors.paper : colors.clay}
                size={18}
                strokeWidth={2.1}
              />
              <Text
                style={[
                  styles.progressSubtabText,
                  progressSubTab === 'autonomy' && styles.progressSubtabTextActive,
                ]}
              >
                Évolution autonomie
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setProgressSubTab('steps')}
              style={[
                styles.progressSubtabItem,
                progressSubTab === 'steps' && styles.progressSubtabItemActive,
              ]}
            >
              <Clock3
                color={progressSubTab === 'steps' ? colors.paper : colors.clay}
                size={18}
                strokeWidth={2.1}
              />
              <Text
                style={[
                  styles.progressSubtabText,
                  progressSubTab === 'steps' && styles.progressSubtabTextActive,
                ]}
              >
                Temps opératoires
              </Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setProgressSubTab('trophies')}
              style={[
                styles.progressSubtabItem,
                progressSubTab === 'trophies' && styles.progressSubtabItemActive,
              ]}
            >
              <Trophy
                color={progressSubTab === 'trophies' ? colors.paper : colors.clay}
                size={18}
                strokeWidth={2.1}
              />
              <Text
                style={[
                  styles.progressSubtabText,
                  progressSubTab === 'trophies' && styles.progressSubtabTextActive,
                ]}
              >
                Trophées
              </Text>
            </Pressable>
          </View>

          <View style={styles.homeCard}>
            <HomeSectionHeader
              title={
                progressSubTab === 'steps'
                  ? 'Analyse par temps opératoire'
                  : progressSubTab === 'trophies'
                    ? 'Trophées'
                    : "Score d'autonomie opératoire"
              }
            />
            {progressSubTab === 'autonomy' ? (
              scoredInterventions.length ? (
                <View style={styles.progressPanelStack}>
                  <View style={styles.progressScoreSummary}>
                    <View>
                      <Text style={styles.progressScoreLabel}>Score moyen</Text>
                      <Text style={styles.progressScoreValue}>
                        {formatAutonomyScore(averageScore)}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.progressScoreLabel}>Dernier score</Text>
                      <Text style={styles.progressScoreValue}>
                        {formatAutonomyScore(latestScore)}
                      </Text>
                    </View>
                  </View>
                  {scoredInterventions.slice(-8).map((item) => (
                    <ProgressScoreRow
                      intervention={item.intervention}
                      key={item.intervention.id}
                      score={item.score}
                    />
                  ))}
                </View>
              ) : (
                <Text style={styles.homeEmptyLine}>
                  {evaluatedCount > 0
                    ? INSUFFICIENT_KEY_STEP_COVERAGE_MESSAGE
                    : 'Aucune intervention validée par un senior pour le moment.'}
                </Text>
              )
            ) : null}

            {progressSubTab === 'steps' ? (
              stepStats.length ? (
                <View style={styles.progressPanelStack}>
                  {stepStats.slice(0, 8).map((stat) => (
                    <StepStatRow key={stat.id} stat={stat} />
                  ))}
                </View>
              ) : (
                <Text style={styles.homeEmptyLine}>
                  Les temps opératoires apparaîtront après les prochaines checklists.
                </Text>
              )
            ) : null}

            {progressSubTab === 'trophies' ? (
              trophyDisplay.earned.length || visibleTrophyProgress.length ? (
                <View style={styles.trophyList}>
                  {trophyDisplay.earned.slice(0, 4).map((item) => (
                    <TrophyListItem
                      item={{
                        icon: 'trophy',
                        id: item.id,
                        imageSrc: item.imageSrc,
                        meta: item.awardedAt
                          ? `Obtenu le ${formatDisplayDate(item.awardedAt.slice(0, 10))}`
                          : item.subtitle,
                        title: item.title,
                      }}
                      key={item.id}
                    />
                  ))}
                  {visibleTrophyProgress.slice(0, 4).map((item) => (
                    <TrophyListItem
                      item={{
                        icon: 'clock',
                        id: item.id,
                        imageSrc: item.imageSrc,
                        meta: item.subtitle,
                        title: item.title,
                      }}
                      key={item.id}
                    />
                  ))}
                </View>
              ) : (
                <Text style={styles.homeEmptyLine}>
                  Aucun trophée actif pour le moment.
                </Text>
              )
            ) : null}
          </View>
        </View>
      )}
    </View>
  );
}

function HistoryInterventionCard({
  evaluation,
  intervention,
  isSelected,
  onPress,
  seniorProfiles,
}: {
  evaluation: InterventionEvaluation | undefined;
  intervention: RecentIntervention;
  isSelected: boolean;
  onPress?: () => void;
  seniorProfiles: SeniorProfile[];
}) {
  return (
    <MobileSurgeryInterventionCard
      dateMetaLabel={formatShortTime(intervention.savedAt)}
      evaluation={evaluation}
      intervention={intervention}
      isSelected={isSelected}
      onPress={onPress}
      seniorProfiles={seniorProfiles}
    />
  );
}

function InterventionDetailCard({
  definitions,
  evaluation,
  intervention,
  seniorProfiles,
}: {
  definitions: SurgicalDefinition[];
  evaluation: InterventionEvaluation | undefined;
  intervention: RecentIntervention;
  seniorProfiles: SeniorProfile[];
}) {
  const senior = seniorProfiles.find((profile) => profile.id === intervention.seniorProfileId);
  const definition =
    definitions.find((item) => item.id === intervention.procedureId) ?? null;
  const checklistSteps = getInterventionChecklistSteps(intervention, definitions);
  const keyStepAverage = getInterventionChecklistAverage(intervention, definitions);
  const score = calculateMobileAutonomyScore(intervention, definitions, evaluation);

  return (
    <View style={styles.historyDetailCard}>
      <HomeSectionHeader title="Détail de l’intervention" />
      <View style={styles.historyDetailRows}>
        <SummaryInfoRow label="Intervention" value={intervention.procedureName} />
        <SummaryInfoRow label="Date" value={formatDisplayDate(intervention.date)} />
        <SummaryInfoRow label="Senior" value={senior ? formatSeniorProfileName(senior) : 'Autre'} />
        <SummaryInfoRow
          label="Indication"
          value={getInterventionIndicationLabel(intervention, definition)}
        />
        <SummaryInfoRow label="Voie d’abord" value={labelForApproach(intervention.approach)} />
        {intervention.entryTechnique ? (
          <SummaryInfoRow
            label="Technique d’entrée"
            value={labelForEntryTechnique(intervention.entryTechnique)}
          />
        ) : null}
        <SummaryInfoRow label="Rôle global" value={labelForInterventionRole(intervention.role)} />
        {intervention.laterality ? (
          <SummaryInfoRow label="Latéralité" value={labelForLaterality(intervention.laterality)} />
        ) : null}
        <SummaryInfoRow
          label="Difficulté ressentie"
          value={intervention.complexity != null ? `${intervention.complexity} / 10` : 'Non renseignée'}
        />
      </View>

      <View style={styles.historyEvaluationPanel}>
        <Text style={styles.historyEvaluationTitle}>Évaluation senior</Text>
        {hasCompleteEvaluation(evaluation) ? (
          <>
            <View style={styles.historyEvaluationGrid}>
              <View style={styles.historyEvaluationMetric}>
                <Text style={styles.historyEvaluationMetricValue}>
                  {keyStepAverage == null
                    ? INSUFFICIENT_KEY_STEP_COVERAGE_MESSAGE
                    : formatAutonomyScore(score)}
                </Text>
                <Text style={styles.historyEvaluationMetricLabel}>Score opératoire</Text>
              </View>
              <View style={styles.historyEvaluationMetric}>
                <Text style={styles.historyEvaluationMetricValue}>
                  {getPerformanceShortLabel(evaluation?.globalPerformance)}
                </Text>
                <Text style={styles.historyEvaluationMetricLabel}>Performance</Text>
              </View>
              <View style={styles.historyEvaluationMetric}>
                <Text style={styles.historyEvaluationMetricValue}>
                  {getDifficultyShortLabel(evaluation?.categoryDifficulty)}
                </Text>
                <Text style={styles.historyEvaluationMetricLabel}>Difficulté</Text>
              </View>
            </View>
            {evaluation?.seniorComment ? (
              <View style={styles.historyEvaluationComment}>
                <Text style={styles.historyEvaluationCommentLabel}>Commentaire</Text>
                <Text style={styles.historyEvaluationCommentText}>
                  {evaluation.seniorComment}
                </Text>
              </View>
            ) : null}
          </>
        ) : (
          <Text style={styles.homeEmptyLine}>
            Cette intervention attend encore l’évaluation senior.
          </Text>
        )}
      </View>

      <View style={styles.historyEvaluationPanel}>
        <Text style={styles.historyEvaluationTitle}>Auto-évaluation technique</Text>
        {checklistSteps.length ? (
          <View style={styles.seniorAutoEvaluationList}>
            {checklistSteps.map((step) => {
              const level = intervention.checklist[step.id];

              return (
                <View key={step.id} style={styles.seniorAutoEvaluationRow}>
                  <Text style={styles.seniorAutoEvaluationStep}>{step.label}</Text>
                  <Text style={styles.seniorAutoEvaluationBadge}>
                    {getChecklistLevelBadgeLabel(level)}
                  </Text>
                  <Text style={styles.seniorAutoEvaluationDescription}>
                    {getChecklistLevelDescription(level)}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.homeEmptyLine}>
            Aucune checklist spécifique n’est définie pour cette intervention.
          </Text>
        )}
      </View>
    </View>
  );
}

function ProgressMetricCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.progressMetricCard}>
      <Text style={styles.progressMetricValue}>{value}</Text>
      <Text style={styles.progressMetricLabel}>{label}</Text>
    </View>
  );
}

function ProgressScoreRow({
  intervention,
  score,
}: {
  intervention: RecentIntervention;
  score: number;
}) {
  return (
    <View style={styles.progressScoreRow}>
      <View style={styles.progressScoreRowHeader}>
        <Text style={styles.progressScoreRowTitle}>{intervention.procedureName}</Text>
        <Text style={styles.progressScoreRowValue}>{Math.round(score)} / 100</Text>
      </View>
      <Text style={styles.progressScoreRowMeta}>
        {formatDisplayDate(intervention.date)} - {labelForApproach(intervention.approach)}
      </Text>
      <View style={styles.progressBarTrack}>
        <View style={[styles.progressBarFill, { width: `${Math.min(100, Math.max(0, score))}%` }]} />
      </View>
    </View>
  );
}

function StepStatRow({
  stat,
}: {
  stat: {
    average: number;
    count: number;
    id: string;
    label: string;
  };
}) {
  const percentage = (stat.average / 4) * 100;

  return (
    <View style={styles.progressScoreRow}>
      <View style={styles.progressScoreRowHeader}>
        <Text style={styles.progressScoreRowTitle}>{stat.label}</Text>
        <Text style={styles.progressScoreRowValue}>{stat.average.toFixed(1)} / 4</Text>
      </View>
      <Text style={styles.progressScoreRowMeta}>{stat.count} saisie(s)</Text>
      <View style={styles.progressBarTrack}>
        <View style={[styles.progressBarFill, { width: `${Math.min(100, Math.max(0, percentage))}%` }]} />
      </View>
    </View>
  );
}

type HeaderBarProps = {
  onBack: () => void;
  title: string;
};

function FlowHeader({
  onBack,
  step,
  subtitle,
  title,
}: {
  onBack?: () => void;
  step: number;
  subtitle?: string;
  title: string;
}) {
  return (
    <View style={styles.flowHeader}>
      {onBack ? (
        <HeaderBar onBack={onBack} title={title} />
      ) : (
        <Text style={styles.flowHeaderTitle}>{title}</Text>
      )}
      <View style={styles.flowProgressBlock}>
        <View style={styles.flowProgress}>
          <View style={styles.flowProgressLine} />
          {[1, 2, 3].map((item) => (
            <View
              key={item}
              style={[
                styles.flowProgressDot,
                item < step && styles.flowProgressDotComplete,
                item === step && styles.flowProgressDotActive,
              ]}
            />
          ))}
        </View>
        <Text style={styles.flowStepText}>Étape {step} sur 3</Text>
      </View>
      {subtitle ? <Text style={styles.screenHeroSubtitle}>{subtitle}</Text> : null}
    </View>
  );
}

function FlowDatePickerSheet({
  onChange,
  onClose,
  value,
  visible,
}: {
  onChange: (value: string) => void;
  onClose: () => void;
  value: string;
  visible: boolean;
}) {
  const selectedDate = parseIsoDate(value);
  const [visibleMonth, setVisibleMonth] = useState(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  );

  useEffect(() => {
    if (visible) {
      const nextDate = parseIsoDate(value);
      setVisibleMonth(new Date(nextDate.getFullYear(), nextDate.getMonth(), 1));
    }
  }, [value, visible]);

  function moveVisibleMonth(offset: number) {
    setVisibleMonth((currentMonth) =>
      new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1)
    );
  }

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.datePickerOverlay}>
        <Pressable accessibilityLabel="Fermer le calendrier" onPress={onClose} style={styles.datePickerBackdrop} />
        <View style={styles.datePickerSheet}>
          <View style={styles.datePickerSheetHeader}>
            <View>
              <Text style={styles.datePickerEyebrow}>Date</Text>
              <Text style={styles.datePickerTitle}>Date de l’intervention</Text>
            </View>
            <Pressable accessibilityLabel="Fermer" accessibilityRole="button" onPress={onClose} style={styles.datePickerClose}>
              <X color={colors.teal} size={20} strokeWidth={2.2} />
            </Pressable>
          </View>

          <View style={styles.historyCalendarHeader}>
            <Pressable
              accessibilityLabel="Mois précédent"
              accessibilityRole="button"
              onPress={() => moveVisibleMonth(-1)}
              style={styles.historyCalendarArrow}
            >
              <ChevronLeft color={colors.deep} size={22} strokeWidth={2.1} />
            </Pressable>
            <Text style={styles.historyCalendarTitle}>{getMonthTitle(visibleMonth)}</Text>
            <Pressable
              accessibilityLabel="Mois suivant"
              accessibilityRole="button"
              onPress={() => moveVisibleMonth(1)}
              style={styles.historyCalendarArrow}
            >
              <ChevronRight color={colors.deep} size={22} strokeWidth={2.1} />
            </Pressable>
          </View>

          <View style={styles.historyCalendarGrid}>
            {WEEKDAY_LABELS.map((label) => (
              <Text key={label} style={styles.historyCalendarWeekday}>
                {label}
              </Text>
            ))}
            {getCalendarDays(visibleMonth).map((date) => {
              const dateKey = toIsoDate(date);
              const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();
              const isSelected = dateKey === value;

              return (
                <Pressable
                  accessibilityRole="button"
                  key={dateKey}
                  onPress={() => {
                    onChange(dateKey);
                    onClose();
                  }}
                  style={[
                    styles.historyCalendarDay,
                    !isCurrentMonth && styles.historyCalendarDayMuted,
                    isSelected && styles.historyCalendarDaySelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.historyCalendarDayText,
                      !isCurrentMonth && styles.historyCalendarDayTextMuted,
                      isSelected && styles.historyCalendarDayTextSelected,
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ComplexitySliderLike({
  onChange,
  value,
}: {
  onChange: (value: number) => void;
  value: number;
}) {
  const progress = `${Math.max(0, Math.min(100, ((value - 1) / 9) * 100))}%` as `${number}%`;

  return (
    <View style={styles.complexitySlider}>
      <View style={styles.complexitySliderHeader}>
        <Text style={styles.complexitySliderValue}>{value}</Text>
        <Text style={styles.complexitySliderCaption}>/ 10</Text>
      </View>
      <View style={styles.complexityTrack}>
        <View style={[styles.complexityTrackFill, { width: progress }]} />
        <View style={[styles.complexityThumb, { left: progress }]} />
        <View style={styles.complexityTouchRow}>
          {COMPLEXITY_OPTIONS.map((complexity) => (
            <Pressable
              accessibilityLabel={`Difficulté ${complexity} sur 10`}
              accessibilityRole="button"
              key={complexity}
              onPress={() => onChange(complexity)}
              style={styles.complexityTouchTarget}
            />
          ))}
        </View>
      </View>
      <View style={styles.complexityScaleLabels}>
        <Text style={styles.complexityScaleLabel}>1</Text>
        <Text style={styles.complexityScaleLabel}>10</Text>
      </View>
    </View>
  );
}

function MobileFlowCard({
  children,
  description,
  empty = false,
  Icon,
  title,
}: {
  children: ReactNode;
  description?: string;
  empty?: boolean;
  Icon?: MobileIcon;
  title: string;
}) {
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const hasContent = Children.toArray(children).length > 0;

  return (
    <View style={[styles.flowCard, empty && styles.flowCardEmpty]}>
      <View style={[styles.flowCardHeader, empty && styles.flowCardHeaderEmpty]}>
        <View style={styles.flowCardHeading}>
          {Icon ? (
            <View style={styles.flowCardIcon}>
              <Icon color={colors.teal} size={18} strokeWidth={2.1} />
            </View>
          ) : null}
          <View style={styles.flowCardTitleBlock}>
            <View style={styles.flowCardTitleRow}>
              <Text style={styles.flowCardTitle}>{title}</Text>
              {description ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setIsInfoOpen((current) => !current)}
                  style={styles.flowCardInfoButton}
                >
                  <Info color={colors.teal} size={11} strokeWidth={2.1} />
                </Pressable>
              ) : null}
            </View>
            {description && isInfoOpen ? (
              <Text style={styles.flowCardInfoTooltip}>{description}</Text>
            ) : null}
          </View>
        </View>
      </View>
      {hasContent ? (
        <View style={[styles.flowCardContent, empty && styles.flowCardContentEmpty]}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

function FlowSelectField({
  isOpen,
  onPress,
  onSelect,
  options,
  placeholder,
  value,
  valueLabel,
}: {
  isOpen: boolean;
  onPress: () => void;
  onSelect: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  placeholder: string;
  value: string | null;
  valueLabel: string | null;
}) {
  return (
    <View style={styles.flowSelectField}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.flowSelectControl,
          isOpen && styles.flowSelectControlOpen,
          pressed && styles.choiceChipPressed,
        ]}
      >
        <Text
          style={[
            styles.flowSelectValue,
            !valueLabel && styles.flowSelectValuePlaceholder,
          ]}
        >
          {valueLabel ?? placeholder}
        </Text>
        <View style={styles.flowSelectChevron}>
          <ChevronDown color={colors.teal} size={19} strokeWidth={2.2} />
        </View>
      </Pressable>
      {isOpen ? (
        <View style={styles.flowSelectMenu}>
          {options.map((option) => {
            const selected = value === option.value;

            return (
              <Pressable
                accessibilityRole="button"
                key={option.value}
                onPress={() => onSelect(option.value)}
                style={({ pressed }) => [
                  styles.flowSelectMenuItem,
                  selected && styles.flowSelectMenuItemSelected,
                  pressed && styles.choiceChipPressed,
                ]}
              >
                <Text
                  style={[
                    styles.flowSelectMenuItemText,
                    selected && styles.flowSelectMenuItemTextSelected,
                  ]}
                >
                  {option.label}
                </Text>
                {selected ? <Check color={colors.teal} size={17} strokeWidth={2.4} /> : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function FlowChoicePill({
  label,
  onPress,
  selected,
  variant,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
  variant?: 'laterality' | 'role';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.flowChoicePill,
        variant === 'role' && styles.flowChoicePillRole,
        variant === 'laterality' && styles.flowChoicePillLaterality,
        selected && styles.flowChoicePillSelected,
        pressed && styles.choiceChipPressed,
      ]}
    >
      <Text style={[styles.flowChoicePillText, selected && styles.flowChoicePillTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

function ChecklistLevelButton({
  level,
  onPress,
  selected = false,
}: {
  level: ChecklistLevel;
  onPress: () => void;
  selected?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        styles.flowLevelPill,
        getLevelPillStyle(level),
        selected && styles.flowLevelPillSelected,
      ]}
    >
      <Text style={[styles.flowLevelPillText, selected && styles.flowLevelPillTextSelected]}>
        {level}
      </Text>
    </Pressable>
  );
}

function SummaryInfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.flowSummaryRow}>
      <Text style={styles.flowSummaryRowLabel}>{label}</Text>
      <Text style={styles.flowSummaryRowValue}>{value}</Text>
    </View>
  );
}

function HeaderBar({ onBack, title }: HeaderBarProps) {
  return (
    <View style={styles.headerBar}>
      <Pressable accessibilityRole="button" onPress={onBack} style={styles.backButton}>
        <Text style={styles.backButtonText}>Retour</Text>
      </Pressable>
      <Text style={styles.headerTitle}>{title}</Text>
    </View>
  );
}

type ChoiceChipProps = {
  label: string;
  onPress: () => void;
  selected: boolean;
};

function ChoiceChip({ label, onPress, selected }: ChoiceChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.choiceChip,
        selected && styles.choiceChipSelected,
        pressed && styles.choiceChipPressed,
      ]}
    >
      <Text style={[styles.choiceChipText, selected && styles.choiceChipTextSelected]}>
        {label}
      </Text>
    </Pressable>
  );
}

const colors = {
  clay: '#0B6B79',
  deep: '#071A3D',
  foam: '#D8F2F8',
  ink: '#071A3D',
  line: '#D8E7EF',
  muted: '#5A6D79',
  paper: '#FFFFFF',
  sand: '#EEF8FB',
  teal: '#00A9C7',
};

const headingFont = Platform.select({
  android: 'serif',
  default: 'serif',
  ios: 'Avenir Next',
});

const bodyFont = Platform.select({
  android: 'sans-serif',
  default: 'sans-serif',
  ios: 'Avenir Next',
});

const styles = StyleSheet.create({
  accountActionCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  accountActionDescription: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 13,
    lineHeight: 18,
  },
  accountActionIcon: {
    alignItems: 'center',
    backgroundColor: '#E7F7FB',
    borderRadius: 17,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  accountActionLabel: {
    color: colors.ink,
    fontFamily: headingFont,
    fontSize: 16,
    fontWeight: '900',
  },
  accountActionRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 72,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  accountAboutLabel: {
    color: colors.ink,
    fontFamily: bodyFont,
    fontSize: 14,
    fontWeight: '900',
  },
  accountAboutList: {
    gap: 10,
  },
  accountAboutRow: {
    backgroundColor: '#F8FCFD',
    borderColor: colors.line,
    borderRadius: 17,
    borderWidth: 1,
    gap: 4,
    padding: 13,
  },
  accountAboutValue: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 13,
    lineHeight: 18,
  },
  accountAvatar: {
    alignItems: 'center',
    backgroundColor: '#0B5360',
    borderRadius: 46,
    height: 92,
    justifyContent: 'center',
    shadowColor: '#0B5360',
    shadowOffset: { height: 16, width: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 30,
    width: 92,
  },
  accountAvatarImage: {
    borderRadius: 999,
    height: '100%',
    width: '100%',
  },
  accountFeedback: {
    borderRadius: 15,
    fontFamily: bodyFont,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 19,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  accountFeedbackError: {
    backgroundColor: '#FFE8DF',
    color: '#9D3F24',
  },
  accountFeedbackSuccess: {
    backgroundColor: '#E7F8F2',
    color: '#0A6B4D',
  },
  accountListCard: {
    backgroundColor: colors.paper,
    borderColor: 'rgba(216, 231, 239, 0.82)',
    borderRadius: 24,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#071A3D',
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 32,
  },
  accountLogoutButton: {
    alignItems: 'center',
    backgroundColor: '#FFF5F3',
    borderColor: '#F6C8BF',
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    minHeight: 62,
  },
  accountLogoutText: {
    color: '#B42318',
    fontFamily: bodyFont,
    fontSize: 15,
    fontWeight: '900',
  },
  accountProfileCard: {
    alignItems: 'center',
    backgroundColor: '#FFFEFB',
    borderColor: 'rgba(216, 231, 239, 0.82)',
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 22,
    shadowColor: '#071A3D',
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 42,
  },
  accountProfileCopy: {
    flex: 1,
    gap: 7,
    minWidth: 0,
  },
  accountProfileMeta: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 19,
  },
  accountProfileName: {
    color: colors.ink,
    fontFamily: headingFont,
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 30,
  },
  accountProfileStatus: {
    color: '#082C34',
    fontFamily: bodyFont,
    fontSize: 15,
    fontWeight: '800',
  },
  accountSection: {
    gap: 9,
  },
  accountSectionTitle: {
    color: '#0B6B79',
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.3,
    paddingHorizontal: 4,
  },
  accountSheet: {
    backgroundColor: colors.paper,
    borderColor: 'rgba(216, 231, 239, 0.92)',
    borderRadius: 28,
    borderWidth: 1,
    gap: 18,
    padding: 18,
    shadowColor: '#071A3D',
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 42,
  },
  accountSheetBackdrop: {
    backgroundColor: 'rgba(7, 26, 61, 0.42)',
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  accountSheetModalContent: {
    maxHeight: '86%',
    width: '100%',
  },
  accountSheetScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  accountSheetActions: {
    marginTop: 4,
  },
  accountSheetActionsSplit: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  accountSheetClose: {
    alignItems: 'center',
    backgroundColor: '#F8FCFD',
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    width: 42,
  },
  accountSheetCloseText: {
    color: colors.teal,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '900',
  },
  accountSheetDescription: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 4,
  },
  accountSheetField: {
    gap: 7,
  },
  accountSheetFieldLabel: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  accountSheetForm: {
    gap: 13,
  },
  accountSheetEyebrow: {
    color: colors.clay,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  accountSheetHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  accountSheetHeading: {
    flex: 1,
    minWidth: 0,
  },
  accountSheetInput: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 17,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 14,
  },
  accountSheetInputText: {
    color: colors.ink,
    fontFamily: bodyFont,
    fontSize: 15,
    fontWeight: '800',
  },
  accountSheetPrimaryButton: {
    alignItems: 'center',
    backgroundColor: colors.teal,
    borderRadius: 17,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
  },
  accountSheetPrimaryButtonText: {
    color: colors.paper,
    fontFamily: bodyFont,
    fontSize: 14,
    fontWeight: '900',
  },
  accountSheetOption: {
    backgroundColor: '#F8FCFD',
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  accountSheetOptionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  accountSheetOptionSelected: {
    backgroundColor: '#E7F8F2',
    borderColor: 'rgba(0, 175, 196, 0.42)',
  },
  accountSheetOptionText: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 13,
    fontWeight: '800',
  },
  accountSheetOptionTextSelected: {
    color: colors.teal,
  },
  accountSheetSecondaryButton: {
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 50,
  },
  accountSheetSecondaryButtonText: {
    color: colors.clay,
    fontFamily: bodyFont,
    fontSize: 14,
    fontWeight: '900',
  },
  accountSheetSelectWrap: {
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 52,
    paddingHorizontal: 14,
  },
  accountSheetStack: {
    gap: 13,
  },
  accountSheetText: {
    color: colors.ink,
    fontFamily: bodyFont,
    fontSize: 14,
    lineHeight: 21,
  },
  accountSheetTextInput: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 17,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: bodyFont,
    fontSize: 15,
    minHeight: 52,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  accountSheetTextarea: {
    minHeight: 126,
    textAlignVertical: 'top',
  },
  accountSheetRow: {
    alignItems: 'flex-start',
    borderBottomColor: '#EAF2F6',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    paddingVertical: 11,
  },
  accountSheetRowLabel: {
    color: colors.muted,
    flex: 1,
    fontFamily: bodyFont,
    fontSize: 13,
    fontWeight: '800',
  },
  accountSheetRowValue: {
    color: colors.ink,
    flex: 1.25,
    fontFamily: bodyFont,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 19,
    textAlign: 'right',
  },
  accountSheetRows: {
    gap: 0,
  },
  accountSheetTitle: {
    color: colors.ink,
    fontFamily: headingFont,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 26,
    marginTop: 3,
  },
  accountPhotoCropper: {
    alignItems: 'center',
    backgroundColor: '#F8FCFD',
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    gap: 13,
    padding: 14,
  },
  accountPhotoMeta: {
    alignItems: 'center',
    gap: 3,
  },
  accountPhotoMetaText: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  accountPhotoMetaTitle: {
    color: colors.ink,
    fontFamily: bodyFont,
    fontSize: 14,
    fontWeight: '900',
  },
  accountPhotoViewport: {
    alignItems: 'center',
    backgroundColor: '#0B5360',
    borderRadius: 72,
    height: 144,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 144,
  },
  actionCard: {
    backgroundColor: 'rgba(255, 253, 248, 0.88)',
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
    shadowColor: colors.deep,
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  actionCardDisabled: {
    opacity: 0.56,
  },
  actionCardPressed: {
    transform: [{ scale: 0.99 }],
  },
  actionDescription: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 7,
  },
  actionGrid: {
    gap: 12,
  },
  actionTitle: {
    color: colors.ink,
    fontFamily: headingFont,
    fontSize: 17,
    fontWeight: '700',
  },
  backgroundHalo: {
    backgroundColor: colors.foam,
    borderRadius: 170,
    height: 280,
    opacity: 0.9,
    position: 'absolute',
    right: -86,
    top: -70,
    width: 280,
  },
  backgroundShard: {
    backgroundColor: '#D8F2F8',
    borderRadius: 90,
    bottom: 96,
    height: 160,
    left: -82,
    opacity: 0.48,
    position: 'absolute',
    transform: [{ rotate: '-18deg' }],
    width: 210,
  },
  bottomNav: {
    alignItems: 'flex-end',
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderColor: 'rgba(213, 226, 231, 0.92)',
    borderRadius: 32,
    borderWidth: 1,
    bottom: 12,
    flexDirection: 'row',
    gap: 4,
    left: 11,
    minHeight: 82,
    paddingHorizontal: 9,
    paddingVertical: 9,
    position: 'absolute',
    right: 11,
    shadowColor: '#0B1F2E',
    shadowOffset: { height: 26, width: 0 },
    shadowOpacity: 0.14,
    shadowRadius: 44,
  },
  bottomNavAdd: {
    alignItems: 'center',
    flex: 1,
    gap: 3,
    justifyContent: 'flex-end',
    minHeight: 70,
    paddingBottom: 3,
  },
  bottomNavAddCircle: {
    alignItems: 'center',
    backgroundColor: '#0B5360',
    borderColor: '#FFFFFF',
    borderRadius: 29,
    borderWidth: 4,
    height: 58,
    justifyContent: 'center',
    shadowColor: '#0B5360',
    shadowOffset: { height: 16, width: 0 },
    shadowOpacity: 0.24,
    shadowRadius: 28,
    transform: [{ translateY: -15 }],
    width: 58,
  },
  bottomNavAddCircleActive: {
    backgroundColor: colors.teal,
  },
  bottomNavAddLabel: {
    color: '#60708A',
    fontFamily: bodyFont,
    fontSize: 10,
    fontWeight: '800',
    marginTop: -15,
  },
  bottomNavDisabled: {
    opacity: 0.68,
  },
  bottomNavItem: {
    alignItems: 'center',
    borderRadius: 18,
    flex: 1,
    gap: 5,
    justifyContent: 'center',
    minHeight: 58,
    paddingHorizontal: 2,
    paddingVertical: 7,
  },
  bottomNavItemActive: {
    backgroundColor: 'rgba(220, 240, 241, 0.85)',
  },
  bottomNavLabel: {
    color: '#60708A',
    fontFamily: bodyFont,
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
  bottomNavLabelActive: {
    color: '#0B5360',
  },
  backButton: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  backButtonText: {
    color: colors.teal,
    fontFamily: bodyFont,
    fontSize: 13,
    fontWeight: '800',
  },
  brandBlock: {
    alignItems: 'center',
    gap: 12,
  },
  brandLogo: {
    height: 250,
    width: 230,
  },
  homeAvatar: {
    alignItems: 'center',
    backgroundColor: '#0B5360',
    borderColor: 'rgba(11, 83, 96, 0.08)',
    borderRadius: 48,
    borderWidth: 1,
    height: 92,
    justifyContent: 'center',
    shadowColor: '#0B5360',
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.2,
    shadowRadius: 34,
    width: 92,
  },
  homeAvatarText: {
    color: colors.paper,
    fontFamily: headingFont,
    fontSize: 34,
    fontWeight: '900',
  },
  homeCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    borderColor: 'rgba(216, 231, 239, 0.82)',
    borderRadius: 26,
    borderWidth: 1,
    gap: 18,
    paddingHorizontal: 18,
    paddingVertical: 20,
    shadowColor: '#071A3D',
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 42,
  },
  homeCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  homeCardLink: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: 4,
    justifyContent: 'flex-end',
    width: 142,
  },
  homeCardLinkText: {
    color: colors.teal,
    fontFamily: bodyFont,
    fontSize: 13,
    fontWeight: '800',
    flex: 1,
    lineHeight: 17,
    textAlign: 'right',
  },
  homeCardTitle: {
    color: colors.ink,
    flex: 1,
    flexShrink: 1,
    fontFamily: headingFont,
    fontSize: 17,
    fontWeight: '900',
    minWidth: 0,
  },
  homeEmptyIcon: {
    alignItems: 'center',
    backgroundColor: '#E7F7FB',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  homeEmptyLine: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 14,
    lineHeight: 20,
  },
  homeEmptyState: {
    alignItems: 'flex-start',
    backgroundColor: '#F8FCFD',
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  homeEmptyText: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 13,
    lineHeight: 19,
  },
  homeEmptyTitle: {
    color: colors.ink,
    fontFamily: bodyFont,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  homeEyebrow: {
    color: '#0B6B79',
    fontFamily: bodyFont,
    fontSize: 13,
    fontWeight: '800',
  },
  homeHeader: {
    paddingHorizontal: 4,
    paddingTop: 6,
    width: '100%',
  },
  homeInterventionCard: {
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderColor: '#D9ECF6',
    borderRadius: 26,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
    shadowColor: '#071B45',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 24,
  },
  homeInterventionCopy: {
    flex: 1,
    gap: 7,
    minWidth: 0,
  },
  homeInterventionDate: {
    color: '#6E8398',
    fontFamily: bodyFont,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  homeInterventionList: {
    gap: 14,
  },
  mobileInterventionCard: {
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderColor: '#D9ECF6',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
    shadowColor: '#071B45',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 24,
  },
  mobileInterventionCardLocked: {
    backgroundColor: '#FCFEFF',
  },
  mobileInterventionCardPressed: {
    opacity: 0.78,
    transform: [{ scale: 0.992 }],
  },
  mobileInterventionCardSelected: {
    borderColor: colors.teal,
    borderWidth: 2,
  },
  mobileInterventionMedallion: {
    alignItems: 'center',
    backgroundColor: '#EEF8FD',
    borderColor: '#D9ECF6',
    borderRadius: 32,
    borderWidth: 1,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  mobileInterventionApproachImage: {
    height: 40,
    width: 40,
  },
  mobileInterventionContent: {
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  mobileInterventionDateLine: {
    color: '#6E8398',
    fontFamily: bodyFont,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    lineHeight: 12,
    textTransform: 'uppercase',
  },
  mobileInterventionDateMeta: {
    color: '#6E8398',
    fontFamily: bodyFont,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.4,
    lineHeight: 12,
  },
  mobileInterventionTitle: {
    color: '#071B45',
    fontFamily: headingFont,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 18,
  },
  mobileInterventionSenior: {
    color: '#5B6F86',
    fontFamily: bodyFont,
    fontSize: 13,
    lineHeight: 17,
  },
  mobileInterventionStatus: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 20,
  },
  mobileInterventionLockIndicator: {
    alignItems: 'center',
    backgroundColor: '#E7F7FB',
    borderRadius: 999,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  homeInterventionLock: {
    alignItems: 'center',
    backgroundColor: '#FFF1DF',
    borderRadius: 14,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  homeInterventionMedallion: {
    alignItems: 'center',
    backgroundColor: '#EEF8FD',
    borderColor: '#D9ECF6',
    borderRadius: 34,
    borderWidth: 1,
    height: 62,
    justifyContent: 'center',
    width: 62,
  },
  homeInterventionApproachImage: {
    height: 44,
    width: 44,
  },
  homeInterventionMeta: {
    color: '#5B6F86',
    fontFamily: bodyFont,
    fontSize: 13,
    lineHeight: 18,
  },
  homeInterventionStatus: {
    alignItems: 'center',
    backgroundColor: '#FFF1DF',
    borderRadius: 16,
    gap: 3,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  homeInterventionStatusDone: {
    backgroundColor: '#E7F7FB',
  },
  homeInterventionStatusText: {
    color: '#B85C00',
    fontFamily: bodyFont,
    fontSize: 10,
    fontWeight: '900',
  },
  homeInterventionStatusTextDone: {
    color: colors.teal,
  },
  homeInterventionTitle: {
    color: '#071B45',
    fontFamily: headingFont,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 20,
  },
  seniorAutoEvaluationBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E7F7FB',
    borderRadius: 999,
    color: colors.clay,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  seniorAutoEvaluationDescription: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 13,
    lineHeight: 18,
  },
  seniorAutoEvaluationList: {
    gap: 10,
  },
  seniorAutoEvaluationRow: {
    backgroundColor: '#F8FCFD',
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    gap: 7,
    padding: 13,
  },
  seniorAutoEvaluationStep: {
    color: colors.ink,
    fontFamily: bodyFont,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 19,
  },
  seniorCommentCounter: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'right',
  },
  seniorCommentInput: {
    minHeight: 118,
    textAlignVertical: 'top',
  },
  seniorEvaluationPanel: {
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    borderColor: 'rgba(216, 231, 239, 0.88)',
    borderRadius: 26,
    borderWidth: 1,
    gap: 14,
    padding: 18,
    shadowColor: '#071A3D',
    shadowOffset: { height: 16, width: 0 },
    shadowOpacity: 0.07,
    shadowRadius: 34,
  },
  seniorEvaluationPanelTitle: {
    color: colors.ink,
    flex: 1,
    fontFamily: headingFont,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 22,
  },
  seniorEvaluationPreviewCard: {
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderColor: '#D9ECF6',
    borderRadius: 26,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
    shadowColor: '#071B45',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 24,
  },
  seniorEvaluationPreviewCopy: {
    flex: 1,
    gap: 7,
    minWidth: 0,
  },
  seniorEvaluationResultCard: {
    alignItems: 'center',
    backgroundColor: '#FFFEFB',
    borderColor: 'rgba(216, 231, 239, 0.88)',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    padding: 16,
  },
  seniorEvaluationResultCopy: {
    flex: 1,
    minWidth: 0,
  },
  seniorEvaluationResultLabel: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 13,
    fontWeight: '800',
  },
  seniorEvaluationResultValue: {
    color: colors.ink,
    fontFamily: headingFont,
    fontSize: 24,
    fontWeight: '900',
    marginTop: 4,
  },
  seniorEvaluationResultValueUnavailable: {
    fontFamily: bodyFont,
    fontSize: 15,
    lineHeight: 21,
  },
  seniorEvaluationScoreBox: {
    alignItems: 'center',
    backgroundColor: '#F8FCFD',
    borderColor: colors.line,
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  seniorEvaluationScoreLabel: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '800',
  },
  seniorEvaluationScoreValue: {
    color: colors.ink,
    fontFamily: bodyFont,
    fontSize: 15,
    fontWeight: '900',
  },
  seniorEvaluationStatusPill: {
    alignItems: 'center',
    backgroundColor: colors.teal,
    borderRadius: 999,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  seniorEvaluationStatusPillDone: {
    backgroundColor: '#E7F7FB',
  },
  seniorEvaluationStatusText: {
    color: colors.paper,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '900',
  },
  seniorEvaluationStatusTextDone: {
    color: colors.teal,
  },
  seniorEvaluationSubmitContent: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  seniorEvaluationSummaryCard: {
    backgroundColor: '#FFFEFB',
    borderColor: 'rgba(216, 231, 239, 0.82)',
    borderRadius: 28,
    borderWidth: 1,
    gap: 16,
    padding: 18,
    shadowColor: '#071A3D',
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 42,
  },
  seniorEvaluationSummaryCopy: {
    flex: 1,
    gap: 7,
    minWidth: 0,
  },
  seniorEvaluationSummaryMain: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  seniorEvaluationSummaryTitle: {
    color: colors.ink,
    fontFamily: headingFont,
    fontSize: 22,
    fontWeight: '900',
    lineHeight: 26,
  },
  seniorEvaluationToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  seniorEvaluationToggleText: {
    color: colors.teal,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '900',
  },
  seniorRatingDescription: {
    backgroundColor: '#F8FCFD',
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 13,
    lineHeight: 19,
    padding: 12,
  },
  seniorRatingGrid: {
    gap: 10,
  },
  seniorRatingLabel: {
    color: colors.ink,
    flex: 1,
    fontFamily: bodyFont,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 19,
  },
  seniorRatingLabelSelected: {
    color: colors.paper,
  },
  seniorRatingMarker: {
    color: colors.teal,
    fontFamily: headingFont,
    fontSize: 18,
    fontWeight: '900',
    minWidth: 36,
  },
  seniorRatingMarkerSelected: {
    color: colors.paper,
  },
  seniorRatingOption: {
    alignItems: 'center',
    backgroundColor: '#F8FCFD',
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  seniorRatingOptionSelected: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  homeLayout: {
    gap: 18,
    width: '100%',
  },
  homeMetricCard: {
    backgroundColor: '#F8FCFD',
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    flex: 1,
    padding: 16,
  },
  homeMetricGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  homeMetricLabel: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 13,
    marginTop: 4,
  },
  homeMetricValue: {
    color: colors.deep,
    fontFamily: headingFont,
    fontSize: 30,
    fontWeight: '900',
  },
  homeNoteCopy: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  homeNoteIcon: {
    alignItems: 'center',
    backgroundColor: '#FFEFCA',
    borderRadius: 18,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  homeNoteLink: {
    alignItems: 'center',
    backgroundColor: '#FFFEFB',
    borderColor: 'rgba(216, 231, 239, 0.82)',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 16,
    minHeight: 92,
    padding: 18,
    shadowColor: '#071A3D',
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 42,
  },
  homeNoteSubtitle: {
    color: '#475A78',
    fontFamily: bodyFont,
    fontSize: 14,
    lineHeight: 19,
  },
  homeNoteTitle: {
    color: colors.ink,
    fontFamily: headingFont,
    fontSize: 17,
    fontWeight: '900',
  },
  homePressed: {
    transform: [{ translateY: -1 }],
  },
  homeProfileCard: {
    alignItems: 'center',
    backgroundColor: '#FFFEFB',
    borderColor: 'rgba(216, 231, 239, 0.82)',
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'space-between',
    minHeight: 136,
    overflow: 'hidden',
    paddingHorizontal: 20,
    paddingVertical: 22,
    shadowColor: '#071A3D',
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 42,
  },
  homeProfileCopy: {
    alignItems: 'flex-start',
    flex: 1,
    gap: 7,
    minWidth: 0,
  },
  homeProfileHospital: {
    color: '#7B8E9C',
    fontFamily: bodyFont,
    fontSize: 13,
    fontWeight: '700',
  },
  homeProfileMeta: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  homeProfileName: {
    color: colors.ink,
    fontFamily: headingFont,
    fontSize: 28,
    fontWeight: '900',
    lineHeight: 31,
  },
  homeProfileStatus: {
    color: '#082C34',
    fontFamily: bodyFont,
    fontSize: 15,
    fontWeight: '800',
  },
  homeTitle: {
    alignSelf: 'stretch',
    color: '#082C34',
    fontFamily: headingFont,
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: -1.05,
    lineHeight: 34,
    width: '100%',
  },
  homeTrophyCard: {
    alignItems: 'center',
    backgroundColor: '#F8FCFD',
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  homeTrophyStrip: {
    gap: 12,
  },
  cardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  cardTitle: {
    color: colors.ink,
    fontFamily: headingFont,
    fontSize: 21,
    fontWeight: '800',
  },
  choiceChip: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  choiceChipPressed: {
    transform: [{ scale: 0.98 }],
  },
  choiceChipSelected: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  choiceChipText: {
    color: colors.deep,
    fontFamily: bodyFont,
    fontSize: 13,
    fontWeight: '800',
  },
  choiceChipTextSelected: {
    color: colors.paper,
  },
  choiceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
    marginTop: 10,
  },
  complexityOption: {
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    minWidth: 42,
  },
  complexityOptionSelected: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
    shadowColor: colors.teal,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
  },
  complexityOptionText: {
    color: colors.deep,
    fontFamily: bodyFont,
    fontSize: 13,
    fontWeight: '900',
  },
  complexityOptionTextSelected: {
    color: colors.paper,
  },
  complexityScale: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  complexityScaleLabel: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '900',
  },
  complexityScaleLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  complexitySlider: {
    gap: 13,
  },
  complexitySliderCaption: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 15,
    fontWeight: '900',
  },
  complexitySliderHeader: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 5,
  },
  complexitySliderValue: {
    color: colors.ink,
    fontFamily: headingFont,
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 34,
  },
  complexityThumb: {
    backgroundColor: colors.paper,
    borderColor: colors.teal,
    borderRadius: 12,
    borderWidth: 4,
    height: 24,
    marginLeft: -12,
    position: 'absolute',
    top: -8,
    width: 24,
  },
  complexityTouchRow: {
    flexDirection: 'row',
    height: 38,
    left: 0,
    position: 'absolute',
    right: 0,
    top: -15,
  },
  complexityTouchTarget: {
    flex: 1,
  },
  complexityTrack: {
    backgroundColor: '#D8E7EF',
    borderRadius: 999,
    height: 8,
    marginTop: 7,
  },
  complexityTrackFill: {
    backgroundColor: colors.teal,
    borderRadius: 999,
    height: 8,
  },
  dashboardHeader: {
    gap: 16,
  },
  dashboardLayout: {
    gap: 18,
  },
  datePickerBackdrop: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  datePickerClose: {
    alignItems: 'center',
    backgroundColor: '#EAF8FC',
    borderColor: 'rgba(0, 175, 196, 0.14)',
    borderRadius: 14,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  datePickerEyebrow: {
    color: colors.teal,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  datePickerOverlay: {
    backgroundColor: 'rgba(7, 26, 61, 0.26)',
    flex: 1,
    justifyContent: 'center',
    padding: 18,
  },
  datePickerSheet: {
    backgroundColor: colors.paper,
    borderColor: 'rgba(216, 231, 239, 0.94)',
    borderRadius: 28,
    borderWidth: 1,
    gap: 18,
    padding: 16,
    shadowColor: '#071A3D',
    shadowOffset: { height: 20, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 44,
  },
  datePickerSheetHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  datePickerTitle: {
    color: colors.ink,
    fontFamily: headingFont,
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 25,
  },
  interventionFlowLayout: {
    gap: 14,
  },
  errorText: {
    backgroundColor: '#FFE8DF',
    borderRadius: 14,
    color: '#9D3F24',
    fontFamily: bodyFont,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 12,
    padding: 12,
  },
  fieldHelper: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 6,
  },
  flowActionBlock: {
    gap: 12,
  },
  flowActionButton: {
    flex: 1,
    marginTop: 0,
  },
  flowActionHint: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 14,
    lineHeight: 21,
  },
  flowActionHintReady: {
    color: '#178C62',
  },
  flowActionPrimary: {
    backgroundColor: '#0F6E7C',
    marginTop: 0,
    shadowColor: '#0B5360',
    shadowOffset: { height: 16, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 28,
  },
  flowActionPrimaryDisabled: {
    opacity: 0.46,
  },
  flowActionsSplit: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  flowCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    borderColor: 'rgba(216, 231, 239, 0.88)',
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    shadowColor: '#071A3D',
    shadowOffset: { height: 16, width: 0 },
    shadowOpacity: 0.07,
    shadowRadius: 34,
  },
  flowCardEmpty: {
    backgroundColor: '#F8FCFD',
  },
  flowCardDescription: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 13,
    lineHeight: 19,
  },
  flowCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  flowCardHeaderEmpty: {
    marginBottom: 10,
  },
  flowCardHeading: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    minWidth: 0,
  },
  flowCardIcon: {
    alignItems: 'center',
    backgroundColor: '#E7F7FB',
    borderRadius: 12,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  flowCardInfoButton: {
    alignItems: 'center',
    backgroundColor: 'rgba(234, 248, 252, 0.82)',
    borderColor: 'rgba(0, 175, 196, 0.14)',
    borderRadius: 999,
    borderWidth: 1,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  flowCardInfoTooltip: {
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  flowCardContent: {
    gap: 14,
  },
  flowCardContentEmpty: {
    gap: 0,
  },
  flowCardTitle: {
    color: colors.ink,
    fontFamily: headingFont,
    fontSize: 17,
    fontWeight: '800',
    lineHeight: 22,
  },
  flowCardTitleBlock: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  flowCardTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minWidth: 0,
  },
  flowChoiceStack: {
    gap: 8,
  },
  flowChoiceStackLaterality: {
    flexDirection: 'row',
    gap: 10,
  },
  flowChoiceStackRole: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  flowChoicePill: {
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  flowChoicePillLaterality: {
    flex: 1,
  },
  flowChoicePillRole: {
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: 52,
  },
  flowChoicePillSelected: {
    backgroundColor: '#EAF8FC',
    borderColor: colors.teal,
  },
  flowChoicePillText: {
    color: colors.ink,
    fontFamily: bodyFont,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
    textAlign: 'center',
  },
  flowChoicePillTextSelected: {
    color: '#007E97',
  },
  flowChecklistActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  flowChecklistLabel: {
    color: colors.ink,
    fontFamily: bodyFont,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 20,
  },
  flowChecklistRow: {
    backgroundColor: '#F8FCFD',
    borderColor: colors.line,
    borderRadius: 20,
    borderWidth: 1,
    gap: 12,
    padding: 14,
  },
  flowChecklistTable: {
    gap: 12,
  },
  flowHeader: {
    gap: 12,
    paddingHorizontal: 2,
    paddingTop: 4,
  },
  flowHeaderTitle: {
    color: colors.ink,
    fontFamily: headingFont,
    fontSize: 32,
    fontWeight: '800',
    lineHeight: 35,
  },
  flowEmptyState: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 14,
    lineHeight: 20,
  },
  flowFieldLabel: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  flowFieldStack: {
    gap: 11,
  },
  flowIconToggle: {
    backgroundColor: '#F8FCFD',
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  flowIconToggleText: {
    color: colors.teal,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '900',
  },
  flowLevelList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  flowLevelPill: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    minWidth: 44,
    paddingHorizontal: 12,
  },
  flowLevelPill_level0: {
    backgroundColor: '#FFF5F3',
    borderColor: '#F6C8BF',
  },
  flowLevelPill_level1: {
    backgroundColor: '#FFF1DF',
    borderColor: '#F0C08E',
  },
  flowLevelPill_level2: {
    backgroundColor: '#FFF9D8',
    borderColor: '#E8D98A',
  },
  flowLevelPill_level3: {
    backgroundColor: '#EAF8EC',
    borderColor: '#BDE5C3',
  },
  flowLevelPill_level4: {
    backgroundColor: '#E7F7FB',
    borderColor: '#A7DDE8',
  },
  flowLevelPill_na: {
    backgroundColor: '#EEF4F7',
    borderColor: colors.line,
  },
  flowLevelPillSelected: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  flowLevelPillText: {
    color: colors.deep,
    fontFamily: bodyFont,
    fontSize: 13,
    fontWeight: '900',
  },
  flowLevelPillTextSelected: {
    color: colors.paper,
  },
  flowInputControl: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 17,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: bodyFont,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  flowInputDateControl: {
    color: '#18345F',
    flex: 1,
    fontFamily: bodyFont,
    fontSize: 16,
    fontWeight: '800',
    minHeight: 56,
    paddingHorizontal: 16,
    textAlign: 'center',
    width: '100%',
  },
  flowInputDisplay: {
    color: '#18345F',
    fontFamily: bodyFont,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.15,
    lineHeight: 56,
    textAlign: 'center',
  },
  flowInputShell: {
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 58,
    overflow: 'hidden',
    paddingHorizontal: 16,
  },
  flowNoteBox: {
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderColor: '#D4E4EE',
    borderRadius: 16,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 62,
    paddingHorizontal: 16,
  },
  flowNoteBoxLabel: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 13,
    fontWeight: '800',
    width: '100%',
  },
  flowNoteBoxText: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 13,
    lineHeight: 18,
  },
  flowProgress: {
    alignItems: 'center',
    alignSelf: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    position: 'relative',
    width: 180,
  },
  flowProgressBlock: {
    alignItems: 'center',
    gap: 10,
    paddingBottom: 4,
    paddingTop: 2,
  },
  flowProgressDot: {
    backgroundColor: colors.paper,
    borderColor: '#B7C8D7',
    borderRadius: 8,
    borderWidth: 2,
    height: 16,
    width: 16,
    zIndex: 1,
  },
  flowProgressDotActive: {
    borderColor: colors.teal,
    shadowColor: colors.teal,
    shadowOffset: { height: 0, width: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
  },
  flowProgressDotComplete: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  flowProgressLine: {
    backgroundColor: '#B7C8D7',
    height: 2,
    left: 10,
    position: 'absolute',
    right: 10,
  },
  flowScaleItem: {
    backgroundColor: '#F8FCFD',
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    gap: 5,
    padding: 13,
  },
  flowScaleList: {
    gap: 10,
  },
  flowSelectControl: {
    alignItems: 'center',
    backgroundColor: '#FBFDFE',
    borderColor: '#D4E4EE',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    minHeight: 62,
    paddingLeft: 16,
    paddingRight: 8,
    paddingVertical: 4,
  },
  flowSelectControlOpen: {
    borderColor: '#A7DDE8',
    shadowColor: colors.teal,
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
  },
  flowSelectField: {
    gap: 8,
  },
  flowSelectChevron: {
    alignItems: 'center',
    backgroundColor: '#EAF8FC',
    borderRadius: 14,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  flowSelectMenu: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 17,
    borderWidth: 1,
    overflow: 'hidden',
  },
  flowSelectMenuItem: {
    alignItems: 'center',
    borderBottomColor: '#EAF2F6',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  flowSelectMenuItemSelected: {
    backgroundColor: '#E7F7FB',
  },
  flowSelectMenuItemText: {
    color: colors.ink,
    flex: 1,
    fontFamily: bodyFont,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 19,
  },
  flowSelectMenuItemTextSelected: {
    color: colors.clay,
    fontWeight: '900',
  },
  flowSelectValue: {
    color: colors.ink,
    flex: 1,
    fontFamily: bodyFont,
    fontSize: 16,
    fontWeight: '700',
  },
  flowSelectValuePlaceholder: {
    color: colors.muted,
  },
  flowScaleText: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 13,
    lineHeight: 18,
  },
  flowScaleTitle: {
    color: colors.ink,
    fontFamily: bodyFont,
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 18,
  },
  flowScoreBadge: {
    backgroundColor: colors.teal,
    borderRadius: 999,
    color: colors.paper,
    fontFamily: bodyFont,
    fontSize: 15,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  flowStepPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#E7F7FB',
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 7,
  },
  flowStepText: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 14,
    fontWeight: '700',
  },
  flowSuccessCard: {
    alignItems: 'center',
    backgroundColor: '#E7F7FB',
    borderColor: '#A7DDE8',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 13,
    padding: 16,
  },
  flowSuccessCopy: {
    flex: 1,
    gap: 4,
  },
  flowSuccessIcon: {
    alignItems: 'center',
    backgroundColor: colors.teal,
    borderRadius: 20,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  flowSuccessText: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 13,
    lineHeight: 18,
  },
  flowSuccessTitle: {
    color: colors.ink,
    fontFamily: headingFont,
    fontSize: 17,
    fontWeight: '900',
  },
  flowSummaryCaption: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 13,
    marginTop: 3,
  },
  flowSummaryCard: {
    alignItems: 'center',
    backgroundColor: '#FFFEFB',
    borderColor: 'rgba(216, 231, 239, 0.88)',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    padding: 16,
  },
  flowSummaryHeadline: {
    color: colors.ink,
    fontFamily: headingFont,
    fontSize: 17,
    fontWeight: '900',
  },
  flowSummaryRow: {
    alignItems: 'flex-start',
    borderBottomColor: '#EAF2F6',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 14,
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  flowSummaryRowLabel: {
    color: colors.muted,
    flex: 1,
    fontFamily: bodyFont,
    fontSize: 13,
    fontWeight: '800',
  },
  flowSummaryRowValue: {
    color: colors.ink,
    flex: 1.3,
    fontFamily: bodyFont,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 19,
    textAlign: 'right',
  },
  emptyState: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 28,
    borderWidth: 1,
    padding: 22,
  },
  formCard: {
    backgroundColor: 'rgba(255, 253, 248, 0.96)',
    borderColor: colors.line,
    borderRadius: 28,
    borderWidth: 1,
    padding: 20,
    shadowColor: colors.deep,
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.09,
    shadowRadius: 24,
  },
  guideCard: {
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderColor: 'rgba(216, 231, 239, 0.82)',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    padding: 16,
    shadowColor: '#071A3D',
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 28,
  },
  guideChip: {
    backgroundColor: '#F8FCFD',
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  guideChipGrid: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  guideChipText: {
    color: colors.deep,
    fontFamily: bodyFont,
    fontSize: 13,
    fontWeight: '800',
  },
  guideCopy: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  guideList: {
    gap: 12,
  },
  guideTitle: {
    color: colors.ink,
    fontFamily: headingFont,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 21,
  },
  guideDetailText: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 15,
    lineHeight: 22,
  },
  guideDetailTitle: {
    color: colors.ink,
    fontFamily: headingFont,
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 30,
  },
  guideFigure: {
    backgroundColor: '#F8FCFD',
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    marginTop: 4,
    overflow: 'hidden',
    padding: 10,
  },
  guideFigureButton: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  guideFigureCaption: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    paddingHorizontal: 4,
    paddingTop: 8,
    textAlign: 'center',
  },
  guideFigureImage: {
    height: 220,
    width: '100%',
  },
  guideLightboxBackdrop: {
    backgroundColor: 'rgba(7, 26, 61, 0.78)',
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  guideLightboxCaption: {
    color: colors.paper,
    fontFamily: bodyFont,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  guideLightboxClose: {
    alignSelf: 'flex-end',
    backgroundColor: colors.paper,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  guideLightboxCloseText: {
    color: colors.teal,
    fontFamily: bodyFont,
    fontSize: 13,
    fontWeight: '900',
  },
  guideLightboxContent: {
    gap: 14,
  },
  guideLightboxImage: {
    height: 470,
    width: '100%',
  },
  guideHeroApproach: {
    alignSelf: 'flex-start',
    backgroundColor: '#E7F7FB',
    borderRadius: 999,
    color: colors.clay,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  guideHeroCard: {
    backgroundColor: '#FFFEFB',
    borderColor: 'rgba(216, 231, 239, 0.82)',
    borderRadius: 28,
    borderWidth: 1,
    gap: 11,
    padding: 20,
    shadowColor: '#071A3D',
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 42,
  },
  guideHeroCategory: {
    color: colors.clay,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  guideBulletDot: {
    color: colors.teal,
    fontFamily: bodyFont,
    fontSize: 18,
    fontWeight: '900',
    lineHeight: 22,
  },
  guideBulletList: {
    gap: 8,
  },
  guideBulletRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 8,
  },
  guideBulletText: {
    color: colors.ink,
    flex: 1,
    fontFamily: bodyFont,
    fontSize: 14,
    lineHeight: 21,
  },
  guideParagraph: {
    color: colors.ink,
    fontFamily: bodyFont,
    fontSize: 14,
    lineHeight: 22,
  },
  guideSectionCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    borderColor: 'rgba(216, 231, 239, 0.82)',
    borderRadius: 26,
    borderWidth: 1,
    gap: 15,
    padding: 18,
    shadowColor: '#071A3D',
    shadowOffset: { height: 14, width: 0 },
    shadowOpacity: 0.06,
    shadowRadius: 32,
  },
  guideSectionStack: {
    gap: 17,
  },
  guideSectionTitle: {
    color: colors.ink,
    fontFamily: headingFont,
    fontSize: 21,
    fontWeight: '900',
    lineHeight: 25,
  },
  guideSubsection: {
    gap: 10,
  },
  guideSubsectionEyebrow: {
    color: colors.clay,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  guideSubsectionTitle: {
    color: colors.deep,
    fontFamily: headingFont,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 21,
  },
  headerBar: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  headerTitle: {
    color: colors.ink,
    flex: 1,
    fontFamily: headingFont,
    fontSize: 25,
    fontWeight: '900',
  },
  historyCalendarArrow: {
    alignItems: 'center',
    backgroundColor: '#F8FCFD',
    borderColor: colors.line,
    borderRadius: 16,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  historyCalendarCard: {
    backgroundColor: colors.paper,
    borderColor: 'rgba(216, 231, 239, 0.9)',
    borderRadius: 28,
    borderWidth: 1,
    gap: 18,
    padding: 16,
    shadowColor: '#071A3D',
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 42,
  },
  historyCalendarDay: {
    alignItems: 'center',
    aspectRatio: 1,
    borderRadius: 17,
    justifyContent: 'center',
    position: 'relative',
    width: '14.2857%',
  },
  historyCalendarDayMarked: {
    backgroundColor: '#E7F7FB',
  },
  historyCalendarDayMuted: {
    opacity: 0.38,
  },
  historyCalendarDaySelected: {
    backgroundColor: colors.teal,
    shadowColor: colors.teal,
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
  },
  historyCalendarDayText: {
    color: colors.deep,
    fontFamily: bodyFont,
    fontSize: 14,
    fontWeight: '800',
  },
  historyCalendarDayTextMuted: {
    color: colors.muted,
  },
  historyCalendarDayTextSelected: {
    color: colors.paper,
  },
  historyCalendarDot: {
    backgroundColor: colors.teal,
    borderRadius: 4,
    bottom: 7,
    height: 5,
    position: 'absolute',
    width: 5,
  },
  historyCalendarDotSelected: {
    backgroundColor: colors.paper,
  },
  historyCalendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 6,
  },
  historyCalendarHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  historyCalendarTitle: {
    color: colors.ink,
    flex: 1,
    fontFamily: headingFont,
    fontSize: 20,
    fontWeight: '900',
    textAlign: 'center',
    textTransform: 'capitalize',
  },
  historyCalendarWeekday: {
    color: '#7B8E9C',
    fontFamily: bodyFont,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
    marginBottom: 2,
    textAlign: 'center',
    width: '14.2857%',
  },
  historyDetailCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    borderColor: 'rgba(216, 231, 239, 0.86)',
    borderRadius: 28,
    borderWidth: 1,
    gap: 18,
    padding: 18,
    shadowColor: '#071A3D',
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 42,
  },
  historyDetailRows: {
    backgroundColor: '#F8FCFD',
    borderColor: colors.line,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  historyEvaluationBadge: {
    backgroundColor: '#FFF1DF',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  historyEvaluationBadgeDone: {
    backgroundColor: '#E7F7FB',
  },
  historyEvaluationBadgeText: {
    color: '#B85C00',
    fontFamily: bodyFont,
    fontSize: 11,
    fontWeight: '900',
  },
  historyEvaluationBadgeTextDone: {
    color: colors.teal,
  },
  historyEvaluationComment: {
    backgroundColor: '#FFFEFB',
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
    padding: 13,
  },
  historyEvaluationCommentLabel: {
    color: colors.clay,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  historyEvaluationCommentText: {
    color: colors.ink,
    fontFamily: bodyFont,
    fontSize: 14,
    lineHeight: 20,
  },
  historyEvaluationGrid: {
    gap: 10,
  },
  historyEvaluationMetric: {
    backgroundColor: '#FFFEFB',
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    gap: 4,
    padding: 13,
  },
  historyEvaluationMetricLabel: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '800',
  },
  historyEvaluationMetricValue: {
    color: colors.ink,
    fontFamily: headingFont,
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 22,
  },
  historyEvaluationPanel: {
    backgroundColor: '#F8FCFD',
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    gap: 13,
    padding: 14,
  },
  historyEvaluationTitle: {
    color: colors.ink,
    fontFamily: headingFont,
    fontSize: 18,
    fontWeight: '900',
  },
  historyInterventionCard: {
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderColor: '#D9ECF6',
    borderRadius: 26,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
    shadowColor: '#071B45',
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.05,
    shadowRadius: 24,
  },
  historyInterventionCardSelected: {
    borderColor: colors.teal,
    borderWidth: 2,
  },
  historyCard: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    padding: 16,
  },
  historyCardTop: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  historyDate: {
    color: colors.clay,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '800',
  },
  historyList: {
    gap: 12,
  },
  historyMeta: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 7,
  },
  historyTitle: {
    color: colors.ink,
    flex: 1,
    fontFamily: headingFont,
    fontSize: 18,
    fontWeight: '800',
  },
  historyViewSwitch: {
    backgroundColor: '#DDF2F5',
    borderRadius: 999,
    flexDirection: 'row',
    padding: 5,
  },
  historyViewSwitchItem: {
    alignItems: 'center',
    borderRadius: 999,
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
  },
  historyViewSwitchItemActive: {
    backgroundColor: colors.paper,
    shadowColor: '#071A3D',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  historyViewSwitchText: {
    color: colors.clay,
    fontFamily: bodyFont,
    fontSize: 14,
    fontWeight: '900',
  },
  historyViewSwitchTextActive: {
    color: colors.deep,
  },
  input: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 17,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: bodyFont,
    fontSize: 16,
    marginTop: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  keyboard: {
    flex: 1,
  },
  kicker: {
    color: colors.clay,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  label: {
    color: colors.deep,
    fontFamily: bodyFont,
    fontSize: 13,
    fontWeight: '800',
    marginTop: 14,
  },
  loginCard: {
    backgroundColor: 'rgba(255, 253, 248, 0.96)',
    borderColor: colors.line,
    borderRadius: 30,
    borderWidth: 1,
    padding: 22,
    shadowColor: colors.deep,
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.13,
    shadowRadius: 30,
  },
  loginLayout: {
    gap: 26,
  },
  metricCard: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    minWidth: '47%',
    padding: 16,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 18,
  },
  metricLabel: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 13,
    marginTop: 4,
  },
  metricValue: {
    color: colors.deep,
    fontFamily: headingFont,
    fontSize: 30,
    fontWeight: '900',
  },
  mobileFlowGrid: {
    gap: 18,
  },
  notebookCounter: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 13,
    fontWeight: '700',
  },
  notebookEditorCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.97)',
    borderColor: 'rgba(216, 231, 239, 0.82)',
    borderRadius: 28,
    borderWidth: 1,
    gap: 16,
    padding: 16,
    shadowColor: '#071A3D',
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 42,
  },
  notebookFooter: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  notebookFooterMeta: {
    flex: 1,
    gap: 7,
    minWidth: 170,
  },
  notebookClearButton: {
    alignItems: 'center',
    backgroundColor: '#FFF5F3',
    borderColor: '#F6C8BF',
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  notebookClearText: {
    color: '#B42318',
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '900',
  },
  notebookInsertButton: {
    alignItems: 'center',
    backgroundColor: '#E7F7FB',
    borderColor: '#CBEAF1',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 7,
    minHeight: 42,
    paddingHorizontal: 12,
  },
  notebookInsertButtonFree: {
    backgroundColor: '#FFEFCA',
    borderColor: '#F6DBA0',
  },
  notebookInsertButtonFreeText: {
    color: colors.deep,
  },
  notebookInsertButtonText: {
    color: colors.clay,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '900',
  },
  notebookSaveButton: {
    alignItems: 'center',
    backgroundColor: colors.teal,
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 46,
    minWidth: 138,
    paddingHorizontal: 16,
  },
  notebookSaveText: {
    color: colors.paper,
    fontFamily: bodyFont,
    fontSize: 14,
    fontWeight: '900',
  },
  notebookSaveIndicator: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  notebookSaveIndicatorText: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '800',
    lineHeight: 16,
  },
  notebookTextArea: {
    backgroundColor: '#F8FCFD',
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    color: colors.ink,
    fontFamily: bodyFont,
    fontSize: 16,
    lineHeight: 23,
    minHeight: 300,
    padding: 16,
  },
  notebookToolbar: {
    alignItems: 'flex-start',
    backgroundColor: '#F8FCFD',
    borderRadius: 20,
    gap: 12,
    padding: 12,
  },
  notebookToolbarActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 9,
  },
  notebookToolbarGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  notebookToolButton: {
    alignItems: 'center',
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 14,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  notebookToolButtonHighlight: {
    backgroundColor: '#FFF0C8',
    borderColor: '#F2D798',
  },
  notebookPanel: {
    backgroundColor: colors.paper,
    borderColor: 'rgba(216, 231, 239, 0.9)',
    borderRadius: 28,
    borderWidth: 1,
    gap: 16,
    padding: 18,
    shadowColor: '#071A3D',
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 42,
  },
  notebookPanelClose: {
    backgroundColor: '#F8FCFD',
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  notebookPanelCloseText: {
    color: colors.teal,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '900',
  },
  notebookPanelEyebrow: {
    color: colors.clay,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  notebookPanelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  notebookPanelItem: {
    backgroundColor: '#F8FCFD',
    borderColor: colors.line,
    borderRadius: 20,
    borderWidth: 1,
    gap: 5,
    padding: 14,
  },
  notebookPanelItemDate: {
    color: colors.clay,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'capitalize',
  },
  notebookPanelItemMeta: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 12,
    lineHeight: 17,
  },
  notebookPanelItemTitle: {
    color: colors.ink,
    fontFamily: headingFont,
    fontSize: 16,
    fontWeight: '900',
  },
  notebookPanelList: {
    gap: 10,
  },
  notebookPanelTitle: {
    color: colors.ink,
    fontFamily: headingFont,
    fontSize: 22,
    fontWeight: '900',
    marginTop: 3,
  },
  noticeCard: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 28,
    borderWidth: 1,
    padding: 24,
  },
  noticeText: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 15,
    lineHeight: 22,
    marginTop: 14,
  },
  panel: {
    backgroundColor: colors.deep,
    borderRadius: 30,
    padding: 22,
  },
  panelText: {
    color: '#C8D8D1',
    fontFamily: bodyFont,
    fontSize: 14,
    lineHeight: 21,
    marginTop: 8,
  },
  panelTitle: {
    color: colors.paper,
    fontFamily: headingFont,
    fontSize: 22,
    fontWeight: '800',
  },
  passwordVisibilityButton: {
    alignSelf: 'flex-start',
    marginTop: 10,
    paddingVertical: 4,
  },
  passwordVisibilityText: {
    color: colors.teal,
    fontFamily: bodyFont,
    fontSize: 13,
    fontWeight: '800',
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.teal,
    borderRadius: 18,
    justifyContent: 'center',
    marginTop: 18,
    minHeight: 54,
  },
  primaryButtonDisabled: {
    opacity: 0.72,
  },
  primaryButtonPressed: {
    transform: [{ scale: 0.99 }],
  },
  primaryButtonText: {
    color: colors.paper,
    fontFamily: bodyFont,
    fontSize: 16,
    fontWeight: '800',
  },
  progressDashboard: {
    gap: 16,
  },
  progressBarFill: {
    backgroundColor: colors.teal,
    borderRadius: 999,
    height: 8,
  },
  progressBarTrack: {
    backgroundColor: '#EAF2F6',
    borderRadius: 999,
    height: 8,
    overflow: 'hidden',
  },
  progressMetricCard: {
    backgroundColor: colors.paper,
    borderColor: colors.line,
    borderRadius: 20,
    borderWidth: 1,
    flex: 1,
    minWidth: 96,
    padding: 14,
  },
  progressMetricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  progressMetricLabel: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '800',
    marginTop: 3,
  },
  progressMetricValue: {
    color: colors.ink,
    fontFamily: headingFont,
    fontSize: 25,
    fontWeight: '900',
  },
  progressPanelStack: {
    gap: 12,
  },
  progressScoreLabel: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '800',
  },
  progressScoreRow: {
    backgroundColor: '#F8FCFD',
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    padding: 13,
  },
  progressScoreRowHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  progressScoreRowMeta: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '700',
  },
  progressScoreRowTitle: {
    color: colors.ink,
    flex: 1,
    fontFamily: bodyFont,
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 19,
  },
  progressScoreRowValue: {
    color: colors.teal,
    fontFamily: bodyFont,
    fontSize: 14,
    fontWeight: '900',
  },
  progressScoreSummary: {
    backgroundColor: '#E7F7FB',
    borderColor: '#A7DDE8',
    borderRadius: 20,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    padding: 14,
  },
  progressScoreValue: {
    color: colors.ink,
    fontFamily: headingFont,
    fontSize: 20,
    fontWeight: '900',
    marginTop: 3,
  },
  progressSubtabItem: {
    alignItems: 'center',
    backgroundColor: '#F8FCFD',
    borderColor: colors.line,
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    gap: 6,
    justifyContent: 'center',
    minHeight: 76,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  progressSubtabItemActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
    shadowColor: colors.teal,
    shadowOffset: { height: 12, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
  },
  progressSubtabText: {
    color: colors.clay,
    fontFamily: bodyFont,
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 14,
    textAlign: 'center',
  },
  progressSubtabTextActive: {
    color: colors.paper,
  },
  progressSubtabs: {
    flexDirection: 'row',
    gap: 8,
  },
  profileSubtitle: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 16,
    lineHeight: 23,
  },
  rolePill: {
    justifyContent: 'center',
    alignSelf: 'flex-start',
    backgroundColor: colors.foam,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  rolePillText: {
    color: colors.deep,
    fontFamily: bodyFont,
    fontSize: 12,
    fontWeight: '800',
  },
  screenHero: {
    gap: 8,
    paddingHorizontal: 4,
    paddingTop: 6,
  },
  screenHeroSubtitle: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 15,
    lineHeight: 22,
  },
  screenHeroTitle: {
    color: '#082C34',
    fontFamily: headingFont,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1,
    lineHeight: 36,
  },
  safeArea: {
    backgroundColor: colors.sand,
    flex: 1,
  },
  screen: {
    flex: 1,
    width: '100%',
  },
  scrollContent: {
    flexGrow: 1,
    minHeight: '100%',
    padding: 22,
  },
  scrollContentAuthenticated: {
    paddingBottom: 122,
    paddingTop: 24,
  },
  scrollContentCentered: {
    justifyContent: 'center',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: colors.teal,
    borderRadius: 18,
    borderWidth: 1,
    minHeight: 52,
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: colors.teal,
    fontFamily: bodyFont,
    fontSize: 15,
    fontWeight: '800',
  },
  successBanner: {
    backgroundColor: colors.foam,
    borderColor: '#B9D6CA',
    borderRadius: 20,
    borderWidth: 1,
    padding: 14,
  },
  successText: {
    color: colors.deep,
    fontFamily: bodyFont,
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 20,
  },
  title: {
    color: colors.ink,
    fontFamily: headingFont,
    fontSize: 36,
    fontWeight: '900',
    letterSpacing: -1.1,
  },
  trophyCard: {
    alignItems: 'center',
    backgroundColor: '#F8FCFD',
    borderColor: colors.line,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    padding: 14,
  },
  trophyCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  trophyIcon: {
    alignItems: 'center',
    backgroundColor: '#E7F7FB',
    borderRadius: 18,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  trophyHeroCard: {
    alignItems: 'center',
    backgroundColor: '#FFFEFB',
    borderColor: 'rgba(216, 231, 239, 0.82)',
    borderRadius: 30,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 22,
    shadowColor: '#071A3D',
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 42,
  },
  trophyHeroCopy: {
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  trophyHeroIcon: {
    alignItems: 'center',
    backgroundColor: '#E7F7FB',
    borderRadius: 24,
    height: 62,
    justifyContent: 'center',
    width: 62,
  },
  trophyHeroSubtitle: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 14,
    lineHeight: 20,
  },
  trophyHeroTitle: {
    color: colors.ink,
    fontFamily: headingFont,
    fontSize: 24,
    fontWeight: '900',
  },
  trophyIconMuted: {
    alignItems: 'center',
    backgroundColor: '#EEF4F7',
    borderRadius: 18,
    height: 50,
    justifyContent: 'center',
    width: 50,
  },
  trophyImage: {
    height: 42,
    width: 42,
  },
  trophyImageMuted: {
    opacity: 0.58,
  },
  trophyList: {
    gap: 12,
  },
  trophySheet: {
    backgroundColor: colors.paper,
    borderColor: 'rgba(216, 231, 239, 0.92)',
    borderRadius: 28,
    borderWidth: 1,
    gap: 18,
    padding: 18,
    shadowColor: '#071A3D',
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 42,
  },
  trophySheetBackdrop: {
    backgroundColor: 'rgba(7, 26, 61, 0.42)',
    flex: 1,
    justifyContent: 'center',
    padding: 16,
  },
  trophySheetClose: {
    alignItems: 'center',
    backgroundColor: '#F8FCFD',
    borderColor: colors.line,
    borderRadius: 999,
    borderWidth: 1,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
  trophySheetHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  trophySheetModalContent: {
    maxHeight: '86%',
    width: '100%',
  },
  trophySheetScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  trophyMeta: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 13,
    lineHeight: 18,
  },
  trophyTitle: {
    color: colors.ink,
    fontFamily: headingFont,
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 20,
  },
  trophySummaryCard: {
    alignItems: 'center',
    backgroundColor: '#F8FCFD',
    borderColor: colors.line,
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 16,
  },
  trophySummaryDivider: {
    backgroundColor: colors.line,
    height: 44,
    marginHorizontal: 14,
    width: 1,
  },
  trophySummaryIconClock: {
    alignItems: 'center',
    backgroundColor: '#E7F7FB',
    borderRadius: 18,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  trophySummaryIconGold: {
    alignItems: 'center',
    backgroundColor: '#FFF0C7',
    borderRadius: 18,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  trophySummaryItem: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 11,
  },
  trophySummaryLabel: {
    color: colors.muted,
    fontFamily: bodyFont,
    fontSize: 13,
    fontWeight: '700',
  },
  trophySummaryValue: {
    color: colors.deep,
    fontFamily: headingFont,
    fontSize: 26,
    fontWeight: '900',
    lineHeight: 29,
  },
  textarea: {
    minHeight: 98,
    paddingTop: 14,
    textAlignVertical: 'top',
  },
});
