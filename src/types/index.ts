export type AppScreen =
  | 'welcome'
  | 'badges'
  | 'preblock'
  | 'surgery-history'
  | 'form'
  | 'obstetric-journal'
  | 'checklist'
  | 'summary'
  | 'admin'
  | 'obstetric-portal';

export type SessionRole = 'internal' | 'admin' | 'senior';

export type SummaryMode = 'review' | 'confirmed';

export type PreBlockContext = 'surgery' | 'obstetric';

export type ChoiceOption<T extends string = string> = {
  value: T;
  label: string;
  description?: string;
};

export type InternalProfile = {
  id: string;
  firstName: string;
  lastName: string;
  loginId: string;
  password: string;
  promotion: string;
  semester: string;
  currentRotation: string;
  createdAt: string;
  lastLoginAt: string | null;
  achievementBadges?: AchievementBadge[];
  badgeMetrics?: {
    primarySalpingectomyCount: number;
    primaryColpocleisisCount: number;
  };
  baselineStats?: {
    totalInterventions: number;
    primaryOperatorCount: number;
    primaryAssistantCount: number;
  };
};

export type CreateInternalProfileInput = {
  firstName: string;
  lastName: string;
  loginId: string;
  password: string;
  promotion: string;
  semester: string;
  currentRotation: string;
};

export type CreateInternalProfileResult = {
  success: boolean;
  message: string;
  profile?: InternalProfile;
};

export type BadgeMetricKey =
  | 'primary_salpingectomy'
  | 'master_salpingectomy'
  | 'master_colpocleisis'
  | 'primary_colpocleisis';

export type BadgeTier = 'diamond' | 'gold' | 'silver' | 'bronze';

export type AchievementBadge = {
  id: string;
  metricKey: BadgeMetricKey;
  title: string;
  tier: BadgeTier;
  target: number;
  awardedAt: string;
  imageSrc: string;
};

export type ProgressBadge = {
  id: string;
  metricKey: BadgeMetricKey;
  title: string;
  tier: BadgeTier;
  target: number;
  current: number;
  awardedAt: string | null;
  imageSrc: string;
  isEarned: boolean;
  isLocked?: boolean;
  isBinary?: boolean;
  progressLabel: string;
};

export type BadgeCatalogItem = {
  id: string;
  title: string;
  tier: BadgeTier;
  metricKey: BadgeMetricKey;
  target: number;
  imageSrc: string;
  criteria: string;
  prerequisiteTitle?: string;
};

export type Senior = {
  id: string;
  firstName: string;
  lastName: string;
  loginId: string;
  password: string;
};

export type InterventionType = 'salpingectomie' | 'colpoclesis' | `custom-${string}`;
export type Indication =
  | 'geu'
  | 'ligature_tubaire'
  | 'autre';
export type SurgicalApproach =
  | 'coelioscopie'
  | 'hysteroscopie'
  | 'laparotomie'
  | 'robot'
  | 'vnotes';
export type EntryTechnique = 'trocart_direct' | 'open' | 'veress';
export type Laterality = 'droite' | 'gauche' | 'bilateral';
export type SurgeryContext = 'urgence' | 'programme';
export type Complexity = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type GlobalRole =
  | 'operateur_principal'
  | 'aide_principal'
  | 'aide_secondaire'
  | 'observateur';
export type ChecklistLevel = 'NA' | '0' | '1' | '2' | '3' | '4';

export type ChecklistStep = {
  id: string;
  label: string;
  applicableApproaches?: SurgicalApproach[];
};

export type SurgicalInterventionDefinition = {
  id: InterventionType;
  name: string;
  indications: string[];
  allowedApproaches: SurgicalApproach[];
  allowedEntryTechniques: EntryTechnique[];
  requiresLaterality: boolean;
  checklistSteps: ChecklistStep[];
  keyStepIds: string[];
  isCustom?: boolean;
  createdAt?: string;
};

export type CreateSurgicalInterventionInput = {
  name: string;
  indications: string[];
  allowedApproaches: SurgicalApproach[];
  allowedEntryTechniques: EntryTechnique[];
  requiresLaterality: boolean;
  customChecklistSteps: string[];
  keyStepLabels: string[];
  stepOrderLabels: string[];
  stepApproachLabels: Record<string, SurgicalApproach[]>;
};

export type CreateSurgicalInterventionResult = {
  success: boolean;
  message: string;
  intervention?: SurgicalInterventionDefinition;
};

export type InterventionDraft = {
  date: string;
  internalId: string | null;
  seniorId: string | null;
  procedure: InterventionType;
  indication: Indication | null;
  indicationComment: string;
  customIndication: string | null;
  approach: SurgicalApproach | null;
  entryTechnique: EntryTechnique | null;
  laterality: Laterality | null;
  context: SurgeryContext | null;
  complexity: Complexity | null;
  role: GlobalRole | null;
  checklist: Record<string, ChecklistLevel | null>;
};

export type SavedIntervention = InterventionDraft & {
  id: string;
  savedAt: string;
  autonomyScore: number | null;
};

export type AdminPerformanceRating = '1' | '2' | '3' | '4' | '5';
export type AdminCategoryDifficultyRating = '1' | '2' | '3';

export type AdminInterventionEvaluation = {
  interventionId: string;
  globalPerformance: AdminPerformanceRating | null;
  categoryDifficulty: AdminCategoryDifficultyRating | null;
  updatedAt: string | null;
};

export type ObstetricJournalDraft = {
  date: string;
  internalId: string | null;
  seniorId: string | null;
  gesture: string;
  instrumentalExtraction: string | null;
  vacuumType: string | null;
  forcepsType: string | null;
  indication: string;
};

export type SavedObstetricGesture = ObstetricJournalDraft & {
  id: string;
  savedAt: string;
};

export type ChecklistProgress = {
  applicable: boolean;
  completed: number;
  total: number;
  isComplete: boolean;
};

export type TechniqueGuideSection = {
  id: string;
  title: string;
  subsections: TechniqueGuideSubsection[];
};

export type TechniqueGuideSubsection = {
  id: string;
  title: string;
  eyebrow?: string;
  paragraphs: string[];
  bulletItems?: string[];
  imageSrc?: string;
  imageCaption?: string;
  textStyle: TechniqueGuideTextStyle;
};

export type TechniqueGuideTextStyle = {
  fontFamily: 'sans' | 'serif' | 'mono' | 'display';
  color: 'primary' | 'muted' | 'accent' | 'blue' | 'green' | 'gold';
  size: 'sm' | 'md' | 'lg';
  bold: boolean;
  italic: boolean;
};

export type TechniqueGuideFigures = {
  anatomy?: string;
  salpingectomy?: string;
  salpingotomy?: string;
};

export type TechniqueGuide = {
  id: string;
  kind: 'geu' | 'custom';
  title: string;
  category: string;
  approach: string;
  intro: string;
  anatomyText?: string;
  anatomyHighlights?: string[];
  comparisonOverview?: string;
  indications?: string[];
  literatureHighlights?: string[];
  preoperativeAssessment?: string[];
  salpingotomyTechniqueIntro?: string;
  salpingotomyGeneralPrinciples?: string[];
  salpingotomyTechniqueParagraphs?: string[];
  salpingotomyTechniqueNote?: string;
  salpingotomyPrinciples?: string[];
  salpingectomyPrinciples?: string[];
  vigilancePoints?: string[];
  figures?: TechniqueGuideFigures;
  sections?: TechniqueGuideSection[];
};
