export type AppScreen =
  | 'welcome'
  | 'trophies'
  | 'preblock'
  | 'surgery-history'
  | 'form'
  | 'profile'
  | 'notebook'
  | 'context-variables'
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
  contactEmail?: string | null;
  mustChangePassword?: boolean;
  institution: string;
  institutionId?: string | null;
  promotion: string;
  semester: string;
  avatarImageSrc?: string | null;
  createdAt: string;
  lastLoginAt: string | null;
  isActive?: boolean;
  updatedAt?: string;
  updatedByProfileId?: string | null;
  version?: number;
  loginCount?: number;
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
  institutionId: string;
  promotion: string;
  semester: string;
};

export type CreateInternalProfileResult = {
  success: boolean;
  message: string;
  accessKey?: string;
  profile?: InternalProfile;
};

export type UpdateInternalCredentialsInput = {
  currentPassword?: string;
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
  avatarImageSrc?: string | null;
};

export type UpdateInternalProfileSettingsResult = {
  success: boolean;
  message: string;
  profile?: InternalProfile;
};

export type BadgeTier = 'diamond' | 'gold' | 'silver' | 'bronze';

export type ProgressBadge = {
  awardedAt: string | null;
  current: number;
  id: string;
  imageSrc: string;
  isBinary?: boolean;
  isEarned: boolean;
  isLocked?: boolean;
  target: number;
  title: string;
};

export type NotebookDocument = {
  internalId: string;
  contentHtml: string;
  updatedAt: string;
  updatedByProfileId?: string | null;
  version?: number;
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
  | 'profile_login_count'
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
  createdByProfileId?: string | null;
  updatedByProfileId?: string | null;
  version?: number;
  everActivated?: boolean;
  activatedAt?: string | null;
  pendingDraft?: Omit<
    AdminTrophyDefinition,
    'pendingDraft' | 'draftBaseVersion' | 'draftVersion'
  > | null;
  draftBaseVersion?: number | null;
  draftVersion?: number | null;
};

export type TrophyAward = {
  id: string;
  trophyId: string;
  profileId: string;
  tier: BadgeTier | null;
  awardedAt: string;
  sourceInterventionId: string | null;
};

export type Senior = {
  id: string;
  firstName: string;
  lastName: string;
  loginId?: string;
  contactEmail?: string | null;
  mustChangePassword?: boolean;
  institution: string;
  institutionId?: string | null;
  createdAt?: string;
  isCustom?: boolean;
  lastLoginAt?: string | null;
  managedInternalIds?: string[];
  isActive?: boolean;
  updatedAt?: string;
  updatedByProfileId?: string | null;
  version?: number;
};

export type CreateSeniorProfileInput = {
  firstName: string;
  lastName: string;
  loginId: string;
  institutionId: string;
};

export type InstitutionStatus = 'active' | 'archived';

export type Institution = {
  id: string;
  name: string;
  status: InstitutionStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  updatedByProfileId: string | null;
  version: number;
};

export type CreateSeniorProfileResult = {
  success: boolean;
  message: string;
  accessKey?: string;
  senior?: Senior;
};

export type UpdateSeniorCredentialsInput = {
  currentPassword?: string;
  loginId: string;
  password: string;
  mustChangePassword?: boolean;
};

export type UpdateSeniorCredentialsResult = {
  success: boolean;
  message: string;
  senior?: Senior;
};

export type InterventionType = 'salpingectomie' | `custom-${string}`;
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
export type InterventionContextVariable =
  | 'urgence'
  | 'antecedent_chirurgie_abdominale'
  | 'complication_per_operatoire'
  | 'imc_superieur_30'
  | 'aucun_contexte_particulier';
export type ClinicalCountCategory = '0' | '1' | '2' | '3_plus';
export type InterventionClinicalContext = {
  schemaVersion: 2;
  patient: {
    ageYears: number | null;
    bmi: number | null;
    tobaccoUse: boolean | null;
    parity: ClinicalCountCategory | null;
  };
  history: {
    igh: boolean | null;
    pelvicPeritonitis: boolean | null;
    abdominopelvicSurgery: boolean | null;
    abdominopelvicSurgeryDetails: string;
    cesareanCount: ClinicalCountCategory | null;
  };
  intraoperative: {
    bloodLossMl: number | null;
    complication: boolean | null;
    complicationDetails: string;
  };
};
export type InterventionContextVariables =
  | InterventionContextVariable[]
  | InterventionClinicalContext;
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

export type SnapshotChecklistStep = ChecklistStep & {
  order: number;
  scored: boolean;
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
  ownerProfileId?: string | null;
  updatedByProfileId?: string | null;
  version?: number;
};

export type InterventionDefinitionSnapshot = {
  schemaVersion: number;
  capturedAt: string;
  source: {
    id: InterventionType;
    name: string;
    status: InterventionStatus;
    version: number;
  };
  definition: SurgicalInterventionDefinition;
  applicableChecklistSteps: SnapshotChecklistStep[];
  legacy?: {
    mode: 'current_catalog_assumption' | 'raw_checklist_fallback';
    reportHash?: string;
  };
};

export type CreateSurgicalInterventionInput = {
  name: string;
  indications: string[];
  allowedApproaches: SurgicalApproach[];
  allowedEntryTechniques: EntryTechnique[];
  requiresLaterality: boolean;
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
  startTime?: string | null;
  operativeDurationMinutes?: number | null;
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
  contextVariables: InterventionContextVariables;
  complexity: Complexity | null;
  role: GlobalRole | null;
  checklist: Record<string, ChecklistLevel | null>;
};

export type SavedIntervention = Omit<InterventionDraft, 'procedure'> & {
  id: string;
  procedure: InterventionType;
  savedAt: string;
  autonomyScore: number | null;
  autonomyScoreCalculatedAt?: string | null;
  autonomyScoreFormulaId?: string | null;
  clientMutationId?: string | null;
  createdByProfileId?: string;
  definitionSnapshot?: InterventionDefinitionSnapshot | null;
  definitionSnapshotSchemaVersion?: number | null;
  definitionVersion?: number | null;
  deletedAt?: string | null;
  updatedAt?: string;
  updatedByProfileId?: string | null;
  version?: number;
};

export type AdminPerformanceRating = '1' | '2' | '3' | '4' | '5';
export type AdminCategoryDifficultyRating = '1' | '2' | '3';

export type AdminInterventionEvaluation = {
  interventionId: string;
  checklist?: Record<string, ChecklistLevel | null> | null;
  globalPerformance: AdminPerformanceRating | null;
  categoryDifficulty: AdminCategoryDifficultyRating | null;
  seniorComment: string;
  updatedAt: string | null;
  createdAt?: string;
  seniorProfileId?: string | null;
  updatedByProfileId?: string | null;
  version?: number;
};

export type ActivityAnalyticsEvent = {
  kind: 'intervention_form' | 'senior_evaluation';
  sessionId: string;
  durationMs: number;
  clickCount: number;
  completedAt: string;
};

export type ActivityLogEntry = {
  id: string;
  actorId?: string | null;
  actorRole: SessionRole;
  actorLabel: string;
  action: string;
  targetType: string;
  targetLabel: string;
  updatedAt?: string;
  version?: number;
  createdAt: string;
  analyticsEvent?: ActivityAnalyticsEvent | null;
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
