import {
  allChecklistSteps,
  defaultComplexityRating,
  getApproachOptionsForIndication,
  normalizeComplexityRating,
} from '../data/mockData';
import { createEmptyClinicalContext } from '../data/contextVariables';
import type {
  ActivityLogEntry,
  AdminInterventionEvaluation,
  AdminTrophyDefinition,
  ChecklistLevel,
  InterventionDraft,
  InternalProfile,
  NotebookDocument,
  SavedIntervention,
  Senior,
  SurgicalApproach,
  SurgicalInterventionDefinition,
} from '../types';
import { ensureTrophyDefinitionShape } from '../utils/adminTrophies';
import { getTodayIsoDate } from '../utils/date';
import { ensureSurgicalInterventionDefinitionShape } from '../utils/surgicalInterventions';
import type {
  BackendActivityLogEntry,
  BackendNotebookDocument,
  BackendProfile,
  BackendSavedIntervention,
} from '../shared/backendTypes';
import type { SupabaseLoginProfile } from '../services/supabaseClient';

export function hydrateInternalProfile(profile: InternalProfile) {
  const {
    currentRotation: _discardedCurrentRotation,
    password: _discardedPassword,
    ...safeProfile
  } = profile as InternalProfile & {
    currentRotation?: string;
    password?: string;
  };

  return {
    ...safeProfile,
    avatarImageSrc: profile.avatarImageSrc ?? null,
    contactEmail: profile.contactEmail?.trim() || null,
    institution: profile.institution?.trim() || 'CHU de Nantes',
    lastLoginAt: profile.lastLoginAt ?? null,
    loginCount: Math.max(0, profile.loginCount ?? (profile.lastLoginAt ? 1 : 0)),
    mustChangePassword: profile.mustChangePassword ?? profile.lastLoginAt == null,
    baselineStats: {
      totalInterventions: profile.baselineStats?.totalInterventions ?? 0,
      primaryOperatorCount: profile.baselineStats?.primaryOperatorCount ?? 0,
      primaryAssistantCount:
        profile.baselineStats?.primaryAssistantCount ?? 0,
    },
  };
}

export function hydrateInternalProfiles(profiles: InternalProfile[]) {
  return profiles.map(hydrateInternalProfile);
}

export function hydrateCustomSeniors(customSeniors: Senior[]) {
  return customSeniors
    .filter(
      (senior) =>
        senior.isActive !== false &&
        Boolean(senior.id?.trim()) &&
        Boolean(senior.firstName?.trim()) &&
        Boolean(senior.lastName?.trim())
    )
    .map((senior) => {
      const { password: _discardedPassword, ...safeSenior } = senior as Senior & {
        password?: string;
      };

      return {
        ...safeSenior,
        contactEmail: senior.contactEmail?.trim() || null,
        firstName: senior.firstName.trim(),
        institution: senior.institution?.trim() || 'CHU de Nantes',
        lastName: senior.lastName.trim(),
        loginId: senior.loginId?.trim(),
        mustChangePassword: senior.mustChangePassword ?? true,
        createdAt: senior.createdAt ?? new Date().toISOString(),
        isCustom: true,
        lastLoginAt: senior.lastLoginAt ?? null,
        managedInternalIds: Array.isArray(senior.managedInternalIds)
          ? senior.managedInternalIds.filter((id) => typeof id === 'string')
          : [],
      };
    });
}

export function hydrateNotebookDocuments(documents: NotebookDocument[]) {
  return documents
    .filter(
      (document) =>
        typeof document?.internalId === 'string' &&
        typeof document?.contentHtml === 'string' &&
        typeof document?.updatedAt === 'string'
    )
    .map((document) => ({
      internalId: document.internalId,
      contentHtml: document.contentHtml,
      updatedAt: document.updatedAt,
      updatedByProfileId: document.updatedByProfileId ?? null,
      version: document.version,
    }));
}

export function evaluationsArrayToRecord(
  evaluations: AdminInterventionEvaluation[]
) {
  return Object.fromEntries(
    evaluations.map((evaluation) => [evaluation.interventionId, evaluation])
  ) as Record<string, AdminInterventionEvaluation>;
}

function hydrateSavedIntervention(intervention: SavedIntervention) {
  return {
    ...intervention,
    contextVariables: intervention.contextVariables ?? [],
    customIndication: intervention.customIndication ?? null,
    autonomyScore: intervention.autonomyScore ?? null,
    complexity:
      normalizeComplexityRating(
        intervention.complexity as Parameters<typeof normalizeComplexityRating>[0]
      ) ?? defaultComplexityRating,
  };
}

export function hydrateSavedInterventions(interventions: SavedIntervention[]) {
  return interventions
    .map(hydrateSavedIntervention)
    .sort((left, right) => right.savedAt.localeCompare(left.savedAt));
}

export function hydrateSurgicalInterventionDefinitions(
  interventions: SurgicalInterventionDefinition[]
) {
  return interventions.map((intervention) =>
    ensureSurgicalInterventionDefinitionShape(intervention)
  );
}

export function mergeRecordsById<T extends { id: string }>(
  current: T[],
  incoming: T[]
) {
  const recordsById = new Map(current.map((record) => [record.id, record]));

  incoming.forEach((record) => {
    recordsById.set(record.id, {
      ...recordsById.get(record.id),
      ...record,
    });
  });

  return Array.from(recordsById.values());
}

export function sanitizeContactEmail(value: string) {
  return value.trim().toLocaleLowerCase('fr-FR');
}

export function isValidContactEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function toInternalProfile(profile: BackendProfile): InternalProfile {
  return hydrateInternalProfile({
    avatarImageSrc: profile.avatarImageSrc,
    contactEmail: profile.contactEmail,
    createdAt: profile.createdAt,
    firstName: profile.firstName,
    id: profile.id,
    institution: profile.institution?.trim() || 'CHU de Nantes',
    institutionId: profile.institutionId,
    isActive: profile.isActive,
    lastLoginAt: profile.lastLoginAt,
    lastName: profile.lastName,
    loginCount: profile.loginCount,
    loginId: profile.loginId,
    mustChangePassword: profile.mustChangePassword,
    promotion: profile.promotion ?? '',
    semester: profile.semester ?? '',
    updatedAt: profile.updatedAt,
    updatedByProfileId: profile.updatedByProfileId,
    version: profile.version,
  });
}

export function toSeniorProfile(profile: BackendProfile): Senior {
  return {
    contactEmail: profile.contactEmail,
    createdAt: profile.createdAt,
    firstName: profile.firstName,
    id: profile.id,
    institution: profile.institution?.trim() || 'CHU de Nantes',
    institutionId: profile.institutionId,
    isActive: profile.isActive,
    isCustom: true,
    lastLoginAt: profile.lastLoginAt,
    lastName: profile.lastName,
    loginId: profile.loginId,
    managedInternalIds: [],
    mustChangePassword: profile.mustChangePassword,
    updatedAt: profile.updatedAt,
    updatedByProfileId: profile.updatedByProfileId,
    version: profile.version,
  };
}

export function toBackendProfileFromLogin(
  profile: SupabaseLoginProfile
): BackendProfile {
  return {
    authUserId: profile.authUserId,
    avatarImageSrc: profile.avatarImageSrc,
    contactEmail: profile.contactEmail,
    createdAt: profile.createdAt,
    firstName: profile.firstName,
    id: profile.id,
    institution: profile.institution,
    institutionId: profile.institutionId,
    isActive: profile.isActive,
    lastLoginAt: profile.lastLoginAt,
    lastName: profile.lastName,
    loginCount: profile.loginCount,
    loginId: profile.loginId,
    mustChangePassword: profile.mustChangePassword,
    promotion: profile.promotion,
    role: profile.role,
    semester: profile.semester,
    updatedAt: profile.updatedAt,
    updatedByProfileId: profile.updatedByProfileId,
    version: profile.version,
  };
}

function createClientUuid() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (value) =>
    (
      Number(value) ^
      ((Math.random() * 16) >> (Number(value) / 4))
    ).toString(16)
  );
}

export function createSavedInterventionId() {
  return createClientUuid();
}

export function createActivityLogEntryId() {
  return createClientUuid();
}

export function toLocalSavedIntervention(
  intervention: BackendSavedIntervention,
  localInternalId: string
): SavedIntervention {
  return {
    ...intervention,
    internalId: localInternalId,
  };
}

export function toLocalNotebookDocument(
  document: BackendNotebookDocument,
  localInternalId: string
): NotebookDocument {
  return {
    contentHtml: document.contentHtml,
    internalId: localInternalId,
    updatedAt: document.updatedAt,
    updatedByProfileId: document.updatedByProfileId,
    version: document.version,
  };
}

export function toLocalActivityEntry(
  entry: BackendActivityLogEntry
): ActivityLogEntry {
  return {
    action: entry.action,
    actorId: entry.actorId ?? entry.profileId ?? null,
    actorLabel: entry.actorLabel,
    actorRole: entry.actorRole,
    analyticsEvent: entry.analyticsEvent ?? null,
    createdAt: entry.createdAt,
    id: entry.id,
    targetLabel: entry.targetLabel,
    targetType: entry.targetType,
    updatedAt: entry.updatedAt,
    version: entry.version,
  };
}

export function hydrateAdminTrophies(trophies: AdminTrophyDefinition[]) {
  return trophies.map((trophy) => ensureTrophyDefinitionShape(trophy));
}

export function upsertSeniorRecord(currentSeniors: Senior[], senior: Senior) {
  const nextSeniors = currentSeniors.filter((item) => item.id !== senior.id);
  return [senior, ...nextSeniors];
}

export function createEmptyChecklist() {
  return allChecklistSteps.reduce<Record<string, ChecklistLevel | null>>(
    (accumulator, step) => {
      accumulator[step.id] = null;
      return accumulator;
    },
    {}
  );
}

export function getAvailableApproachesForDraft(
  draft: InterventionDraft,
  interventionDefinition?: SurgicalInterventionDefinition
): SurgicalApproach[] {
  if (!draft.procedure) {
    return [];
  }

  if (draft.procedure === 'salpingectomie') {
    const approachesForIndication = getApproachOptionsForIndication(
      draft.indication
    ).map((option) => option.value);

    return interventionDefinition?.isCustom
      ? approachesForIndication.filter((approach) =>
          interventionDefinition.allowedApproaches.includes(approach)
        )
      : approachesForIndication;
  }

  return interventionDefinition?.allowedApproaches ?? [];
}

export function createInitialDraft(internalId: string | null): InterventionDraft {
  return {
    date: getTodayIsoDate(),
    internalId,
    seniorId: null,
    procedure: null,
    indication: null,
    indicationComment: '',
    customIndication: null,
    approach: null,
    entryTechnique: null,
    laterality: null,
    context: null,
    contextVariables: createEmptyClinicalContext(),
    complexity: defaultComplexityRating,
    role: null,
    checklist: createEmptyChecklist(),
  };
}
