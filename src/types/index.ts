export type AppScreen =
  | 'welcome'
  | 'trophies'
  | 'preblock'
  | 'surgery-history'
  | 'form'
  | 'profile'
  | 'notebook'
  | 'checklist'
  | 'summary'
  | 'admin';

export type SessionRole = 'internal' | 'admin' | 'senior';

export type SummaryMode = 'review' | 'confirmed';

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
  mustChangePassword?: boolean;
  promotion: string;
  semester: string;
  currentRotation: string;
  avatarImageSrc?: string | null;
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

export type UpdateInternalCredentialsInput = {
  loginId: string;
  password: string;
  mustChangePassword?: boolean;
};

export type UpdateInternalCredentialsResult = {
  success: boolean;
  message: string;
  profile?: InternalProfile;
};

export type UpdateInternalProfileSettingsInput = {
  semester?: string;
  currentRotation?: string;
  avatarImageSrc?: string | null;
};

export type UpdateInternalProfileSettingsResult = {
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

export type NotebookNote = {
  id: string;
  internalId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type NotebookDocument = {
  internalId: string;
  contentHtml: string;
  updatedAt: string;
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

export type TrophyStatus = 'draft' | 'active' | 'inactive';
export type TrophyType = 'operatoire' | 'special';
export type TrophyFormat = 'unique' | 'levels';
export type TrophyVisibility = 'visible' | 'surprise';
export type TrophyTrackedStatus = 'recorded' | 'evaluated';
export type TrophyOperativeScope = 'procedure' | 'approach';
export type TrophyConditionType =
  | 'first_recorded'
  | 'total_recorded'
  | 'total_evaluated'
  | 'procedure_count'
  | 'approach_count'
  | 'recording_time_range'
  | 'average_autonomy'
  | 'cross_procedure_autonomy'
  | 'distinct_procedures'
  | 'role'
  | 'intervention_status';

export type TrophyCondition = {
  id: string;
  type: TrophyConditionType;
  procedure?: InterventionType | '';
  approach?: SurgicalApproach | '';
  role?: GlobalRole | '';
  trackedStatus?: TrophyTrackedStatus;
  threshold?: number | null;
  autonomyMin?: number | null;
  distinctProcedureCount?: number | null;
  minEvaluatedPerProcedure?: number | null;
  startHour?: string;
  endHour?: string;
  interventionStatus?: 'evaluated' | 'pending' | '';
};

export type TrophyLevelDefinition = {
  tier: BadgeTier;
  label: string;
  trackedStatus: TrophyTrackedStatus;
  threshold: number | null;
  autonomyMin: number | null;
  imageSrc: string | null;
};

export type TrophyImageSet = {
  single: string | null;
  bronze: string | null;
  silver: string | null;
  gold: string | null;
  diamond: string | null;
};

export type AdminTrophyDefinition = {
  id: string;
  title: string;
  description: string;
  type: TrophyType;
  format: TrophyFormat;
  status: TrophyStatus;
  visibility: TrophyVisibility;
  operativeScope: TrophyOperativeScope;
  associatedProcedure: InterventionType | '';
  associatedApproach: SurgicalApproach | '';
  associatedIndication: Indication | '';
  trackedRole: GlobalRole | '';
  trackedInterventionStatus: TrophyTrackedStatus;
  conditions: TrophyCondition[];
  levels: TrophyLevelDefinition[];
  images: TrophyImageSet;
  createdAt: string;
  updatedAt: string;
};

export type Senior = {
  id: string;
  firstName: string;
  lastName: string;
  loginId?: string;
  password?: string;
  mustChangePassword?: boolean;
  createdAt?: string;
  isCustom?: boolean;
  lastLoginAt?: string | null;
  managedInternalIds?: string[];
};

export type CreateSeniorProfileInput = {
  firstName: string;
  lastName: string;
  loginId: string;
  password: string;
};

export type CreateSeniorProfileResult = {
  success: boolean;
  message: string;
  senior?: Senior;
};

export type UpdateSeniorCredentialsInput = {
  loginId: string;
  password: string;
  mustChangePassword?: boolean;
};

export type UpdateSeniorCredentialsResult = {
  success: boolean;
  message: string;
  senior?: Senior;
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
  | 'voie_vaginale'
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

export type InterventionStatus = 'active' | 'inactive' | 'archived';
export type InterventionLateralityMode =
  | 'none'
  | 'right_left'
  | 'right_left_bilateral';

export type InterventionIndicationOption = {
  id: string;
  label: string;
  active: boolean;
  isOther?: boolean;
  isDefault?: boolean;
};

export type InterventionEntryTechniqueOption = {
  id: string;
  label: EntryTechnique;
  active: boolean;
};

export type OperativeStepDefinition = {
  id: string;
  label: string;
  scored: boolean;
  order: number;
};

export type InterventionApproachConfig = {
  id: string;
  approach: SurgicalApproach;
  active: boolean;
  entryTechniques?: InterventionEntryTechniqueOption[];
  steps: OperativeStepDefinition[];
};

export type SurgicalInterventionDefinition = {
  id: InterventionType;
  name: string;
  indications: string[];
  indicationOptions?: InterventionIndicationOption[];
  allowedApproaches: SurgicalApproach[];
  allowedEntryTechniques: EntryTechnique[];
  requiresLaterality: boolean;
  checklistSteps: ChecklistStep[];
  keyStepIds: string[];
  status?: InterventionStatus;
  lateralityMode?: InterventionLateralityMode;
  approachConfigs?: InterventionApproachConfig[];
  isCustom?: boolean;
  createdAt?: string;
  updatedAt?: string;
  archivedAt?: string | null;
  usedCount?: number;
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
  status?: InterventionStatus;
  lateralityMode?: InterventionLateralityMode;
  indicationOptions?: InterventionIndicationOption[];
  approachConfigs?: InterventionApproachConfig[];
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
  procedure: InterventionType | null;
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

export type SavedIntervention = Omit<InterventionDraft, 'procedure'> & {
  id: string;
  procedure: InterventionType;
  savedAt: string;
  autonomyScore: number | null;
};

export type AdminPerformanceRating = '1' | '2' | '3' | '4' | '5';
export type AdminCategoryDifficultyRating = '1' | '2' | '3';

export type AdminInterventionEvaluation = {
  interventionId: string;
  globalPerformance: AdminPerformanceRating | null;
  categoryDifficulty: AdminCategoryDifficultyRating | null;
  seniorComment: string;
  updatedAt: string | null;
};

export type TestFeedback = {
  id: string;
  message: string;
  authorRole: SessionRole;
  authorLabel: string;
  createdAt: string;
};

export type ActivityLogEntry = {
  id: string;
  actorId?: string | null;
  actorRole: SessionRole;
  actorLabel: string;
  action: string;
  targetType: string;
  targetLabel: string;
  createdAt: string;
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
