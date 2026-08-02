import type {
  ActivityLogEntry,
  AdminInterventionEvaluation,
  AdminTrophyDefinition,
  GlobalRole,
  Indication,
  Institution,
  InterventionType,
  NotebookDocument,
  SavedIntervention,
  Senior,
  SessionRole,
  SurgicalApproach,
  SurgicalInterventionDefinition,
  TrophyAward,
} from '../types';

export type BackendRole = SessionRole;

export type BackendProfile = {
  id: string;
  authUserId: string | null;
  role: BackendRole;
  firstName: string;
  lastName: string;
  loginId: string;
  contactEmail: string | null;
  institution: string | null;
  institutionId: string | null;
  promotion: string | null;
  semester: string | null;
  avatarImageSrc: string | null;
  mustChangePassword: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  updatedByProfileId: string | null;
  version: number;
  lastLoginAt: string | null;
  loginCount: number;
};

export type BackendSeniorAssignment = {
  seniorProfileId: string;
  internalProfileId: string;
  createdAt: string;
  updatedAt: string;
  updatedByProfileId: string | null;
  version: number;
};

export type BackendSurgicalInterventionDefinition =
  SurgicalInterventionDefinition & {
    ownerProfileId: string | null;
    createdAt: string;
    updatedAt: string;
    updatedByProfileId: string | null;
    version: number;
  };

export type BackendSavedIntervention = SavedIntervention & {
  createdByProfileId: string;
  updatedAt: string;
  deletedAt: string | null;
  clientMutationId: string | null;
  updatedByProfileId: string | null;
  version: number;
};

export type BackendInterventionEvaluation = AdminInterventionEvaluation & {
  seniorProfileId: string | null;
  createdAt: string;
  updatedByProfileId: string | null;
  version: number;
};

export type BackendNotebookDocument = NotebookDocument & {
  profileId: string;
  updatedByProfileId: string | null;
  version: number;
};

export type BackendTrophyDefinition = AdminTrophyDefinition & {
  createdByProfileId: string | null;
  updatedByProfileId: string | null;
  version: number;
};

export type BackendTrophyAward = TrophyAward & {
  updatedAt: string;
  updatedByProfileId: string | null;
  version: number;
};

export type BackendUserNotification = {
  actionLabel: string | null;
  actionTarget: string | null;
  actionType: 'external_url' | 'internal_path' | 'intervention' | 'trophy' | null;
  adminMessageId: string | null;
  body: string;
  celebratedAt: string | null;
  createdAt: string;
  deletionPolicy: 'manual' | 'on_read';
  evaluationId: string | null;
  id: string;
  kind: 'admin_message' | 'evaluation_completed' | 'trophy_awarded';
  profileId: string;
  readAt: string | null;
  tier: TrophyAward['tier'] | null;
  title: string;
  trophyId: string | null;
};

export type BackendAdminNotificationMessage = {
  actionLabel: string | null;
  actionTarget: string | null;
  actionType: 'external_url' | 'internal_path' | null;
  audienceInstitutionId: string | null;
  audienceProfileId: string | null;
  audienceRole: 'internal' | 'senior' | null;
  audienceType: 'all' | 'institution' | 'profile' | 'role';
  body: string;
  cancelledAt: string | null;
  createdAt: string;
  deletionPolicy: 'manual' | 'on_read';
  id: string;
  readCount: number;
  recipientCount: number;
  retractedAt: string | null;
  scheduledAt: string;
  sentAt: string | null;
  status: 'cancelled' | 'retracted' | 'scheduled' | 'sending' | 'sent';
  title: string;
  unreadCount: number;
  updatedAt: string;
};

export type BackendAdminNotificationMessageInput = {
  actionLabel?: string | null;
  actionTarget?: string | null;
  actionType?: 'external_url' | 'internal_path' | null;
  audienceInstitutionId?: string | null;
  audienceProfileId?: string | null;
  audienceRole?: 'internal' | 'senior' | null;
  audienceType: BackendAdminNotificationMessage['audienceType'];
  body: string;
  deletionPolicy: BackendAdminNotificationMessage['deletionPolicy'];
  scheduledAt?: string | null;
  title: string;
};

export type BackendActivityLogEntry = ActivityLogEntry & {
  profileId: string | null;
  version: number;
};

export type BackendReferenceData = {
  institutions: Institution[];
  surgicalInterventions: BackendSurgicalInterventionDefinition[];
  seniors: Senior[];
  trophyDefinitions: BackendTrophyDefinition[];
};

export type BackendUserData = {
  profile: BackendProfile;
  managedInternalIds: string[];
  savedInterventions: BackendSavedIntervention[];
  evaluations: BackendInterventionEvaluation[];
  notebookDocuments: BackendNotebookDocument[];
  trophyAwards: BackendTrophyAward[];
  userNotifications: BackendUserNotification[];
  activityLog: BackendActivityLogEntry[];
};

export type BackendBootstrapPayload = {
  referenceData: BackendReferenceData;
  userData: BackendUserData;
};

export type BackendInterventionWriteInput = {
  internalProfileId: string;
  seniorProfileId: string | null;
  procedure: InterventionType;
  indication: Indication | null;
  approach: SurgicalApproach | null;
  role: GlobalRole | null;
  payload: SavedIntervention;
  clientMutationId: string;
};
