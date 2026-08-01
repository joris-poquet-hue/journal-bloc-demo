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
  body: string;
  createdAt: string;
  id: string;
  kind: 'trophy_awarded';
  profileId: string;
  readAt: string | null;
  tier: TrophyAward['tier'];
  title: string;
  trophyId: string;
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
