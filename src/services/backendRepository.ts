import type {
  AdminInterventionEvaluation,
  AdminTrophyDefinition,
  ChecklistLevel,
  Complexity,
  EntryTechnique,
  GlobalRole,
  Indication,
  InterventionContextVariables,
  InterventionDefinitionSnapshot,
  Institution,
  InterventionType,
  Laterality,
  Senior,
  SessionRole,
  SurgeryContext,
  SurgicalApproach,
  SurgicalInterventionDefinition,
} from '../types';
import type {
  BackendActivityLogEntry,
  BackendBootstrapPayload,
  BackendInterventionEvaluation,
  BackendNotebookDocument,
  BackendProfile,
  BackendReferenceData,
  BackendSavedIntervention,
  BackendSurgicalInterventionDefinition,
  BackendTrophyAward,
  BackendTrophyDefinition,
  BackendUserData,
  BackendUserNotification,
} from '../shared/backendTypes';
import {
  isSupabaseClientConfigured,
  selectSupabaseRows,
  supabaseRestRequest,
} from './supabaseClient';

type ProfileRow = {
  auth_user_id: string | null;
  avatar_image_src: string | null;
  created_at: string;
  first_name: string;
  id: string;
  institution: string | null;
  institution_id: string | null;
  is_active: boolean;
  last_login_at: string | null;
  last_name: string;
  login_id: string;
  metadata: unknown;
  must_change_password: boolean;
  promotion: string | null;
  role: SessionRole;
  semester: string | null;
  updated_at: string;
  updated_by_profile_id: string | null;
  version: number;
};

type AssignmentRow = {
  created_at: string;
  internal_profile_id: string;
  senior_profile_id: string;
  updated_at: string;
  updated_by_profile_id: string | null;
  version: number;
};

type SeniorDirectoryRow = {
  created_at: string;
  first_name: string;
  id: string;
  institution: string | null;
  institution_id: string | null;
  last_login_at: string | null;
  last_name: string;
};

type InternalDirectoryRow = {
  avatar_image_src: string | null;
  created_at: string;
  first_name: string;
  id: string;
  institution: string;
  institution_id: string;
  last_login_at?: string | null;
  last_name: string;
  login_count?: number | null;
  promotion: string | null;
  semester: string | null;
  updated_at: string;
  version: number;
};

type InstitutionRow = {
  archived_at: string | null;
  created_at: string;
  id: string;
  name: string;
  status: Institution['status'];
  updated_at: string;
  updated_by_profile_id: string | null;
  version: number;
};

type SurgicalDefinitionRow = {
  archived_at: string | null;
  created_at: string;
  definition: unknown;
  id: string;
  name: string;
  owner_profile_id: string | null;
  status: string;
  updated_at: string;
  updated_by_profile_id: string | null;
  version: number;
};

type InterventionRow = {
  approach: SurgicalApproach | null;
  autonomy_score: number | null;
  autonomy_score_calculated_at: string | null;
  autonomy_score_formula_id: string | null;
  checklist: Record<string, ChecklistLevel | null> | null;
  client_mutation_id: string | null;
  complexity: Complexity | null;
  context_variables: InterventionContextVariables | null;
  created_by_profile_id: string | null;
  custom_indication: string | null;
  deleted_at: string | null;
  definition_snapshot: InterventionDefinitionSnapshot | null;
  definition_snapshot_schema_version: number | null;
  definition_version: number | null;
  entry_technique: EntryTechnique | null;
  id: string;
  indication: Indication | null;
  indication_comment: string | null;
  internal_profile_id: string;
  intervention_date: string;
  intervention_start_time: string | null;
  laterality: Laterality | null;
  operative_duration_minutes: number | null;
  procedure_id: InterventionType;
  role: GlobalRole | null;
  saved_at: string;
  senior_profile_id: string | null;
  surgery_context: SurgeryContext | null;
  updated_at: string;
  updated_by_profile_id: string | null;
  version: number;
};

type EvaluationRow = {
  category_difficulty: AdminInterventionEvaluation['categoryDifficulty'];
  checklist: Record<string, ChecklistLevel | null> | null;
  created_at: string;
  global_performance: AdminInterventionEvaluation['globalPerformance'];
  intervention_id: string;
  senior_comment: string;
  senior_profile_id: string | null;
  updated_at: string | null;
  updated_by_profile_id: string | null;
  version: number;
};

type EvaluationRequestRow = {
  completed_at: string | null;
  created_at: string;
  created_by_profile_id: string | null;
  internal_profile_id: string;
  intervention_id: string;
  senior_profile_id: string;
  status: 'pending' | 'completed' | 'cancelled';
  updated_at: string;
  updated_by_profile_id: string | null;
  version: number;
};

type NotebookRow = {
  content_html: string;
  profile_id: string;
  updated_at: string;
  updated_by_profile_id: string | null;
  version: number;
};

type TrophyDefinitionRow = {
  created_at: string;
  created_by_profile_id: string | null;
  definition: unknown;
  id: string;
  status: string;
  title: string;
  updated_at: string;
  updated_by_profile_id: string | null;
  version: number;
  ever_activated?: boolean | null;
  activated_at?: string | null;
  pending_draft_definition?: unknown;
  pending_draft_version?: number | null;
  pending_draft_base_version?: number | null;
};

type TrophyAwardRow = {
  awarded_at: string;
  id: string;
  profile_id: string;
  source_intervention_id: string | null;
  tier: string | null;
  trophy_id: string;
  updated_at: string;
  updated_by_profile_id: string | null;
  version: number;
};

type UserNotificationRow = {
  body: string;
  created_at: string;
  id: string;
  kind: 'trophy_awarded';
  profile_id: string;
  read_at: string | null;
  tier: string | null;
  title: string;
  trophy_id: string;
};

type ActivityLogRow = {
  action: string;
  analytics_event: BackendActivityLogEntry['analyticsEvent'];
  actor_label: string;
  actor_role: SessionRole;
  created_at: string;
  id: string;
  profile_id: string | null;
  target_label: string;
  target_type: string;
  updated_at: string;
  version: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function getProfileContactEmail(metadata: unknown) {
  if (!isRecord(metadata) || typeof metadata.contactEmail !== 'string') {
    return null;
  }

  const contactEmail = metadata.contactEmail.trim();

  return contactEmail.length > 0 ? contactEmail : null;
}

function getProfileLoginCount(metadata: unknown) {
  if (!isRecord(metadata)) {
    return 0;
  }

  const value = metadata.loginCount;
  const count =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^\d+$/.test(value)
        ? Number(value)
        : 0;

  return Number.isSafeInteger(count) && count >= 0 ? count : 0;
}

function toInFilter(values: string[]) {
  return `in.(${values.join(',')})`;
}

function toBackendProfile(row: ProfileRow): BackendProfile {
  return {
    authUserId: row.auth_user_id,
    avatarImageSrc: row.avatar_image_src,
    contactEmail: getProfileContactEmail(row.metadata),
    createdAt: row.created_at,
    firstName: row.first_name,
    id: row.id,
    institution: row.institution,
    institutionId: row.institution_id,
    isActive: row.is_active,
    lastLoginAt: row.last_login_at,
    loginCount: getProfileLoginCount(row.metadata),
    lastName: row.last_name,
    loginId: row.login_id,
    mustChangePassword: row.must_change_password,
    promotion: row.promotion,
    role: row.role,
    semester: row.semester,
    updatedAt: row.updated_at,
    updatedByProfileId: row.updated_by_profile_id,
    version: row.version,
  };
}

function toSenior(row: ProfileRow): Senior {
  return {
    contactEmail: getProfileContactEmail(row.metadata),
    createdAt: row.created_at,
    firstName: row.first_name,
    id: row.id,
    institution: row.institution?.trim() || 'CHU de Nantes',
    institutionId: row.institution_id,
    isActive: row.is_active,
    isCustom: true,
    lastLoginAt: row.last_login_at,
    lastName: row.last_name,
    loginId: row.login_id,
    mustChangePassword: row.must_change_password,
    updatedAt: row.updated_at,
    updatedByProfileId: row.updated_by_profile_id,
    version: row.version,
  };
}

function toDirectorySenior(row: SeniorDirectoryRow): Senior {
  return {
    contactEmail: null,
    createdAt: row.created_at,
    firstName: row.first_name,
    id: row.id,
    institution: row.institution?.trim() || 'CHU de Nantes',
    institutionId: row.institution_id,
    isActive: true,
    isCustom: true,
    lastLoginAt: row.last_login_at,
    lastName: row.last_name,
    managedInternalIds: [],
  };
}

function toDirectoryInternal(row: InternalDirectoryRow): BackendProfile {
  return {
    authUserId: null,
    avatarImageSrc: row.avatar_image_src,
    contactEmail: null,
    createdAt: row.created_at,
    firstName: row.first_name,
    id: row.id,
    institution: row.institution,
    institutionId: row.institution_id,
    isActive: true,
    lastLoginAt: row.last_login_at ?? null,
    lastName: row.last_name,
    loginCount:
      Number.isSafeInteger(row.login_count) && (row.login_count ?? 0) >= 0
        ? row.login_count ?? 0
        : 0,
    loginId: '',
    mustChangePassword: false,
    promotion: row.promotion,
    role: 'internal',
    semester: row.semester,
    updatedAt: row.updated_at,
    updatedByProfileId: null,
    version: row.version,
  };
}

function toInstitution(row: InstitutionRow): Institution {
  return {
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    id: row.id,
    name: row.name,
    status: row.status,
    updatedAt: row.updated_at,
    updatedByProfileId: row.updated_by_profile_id,
    version: row.version,
  };
}

function toSurgicalDefinition(
  row: SurgicalDefinitionRow
): BackendSurgicalInterventionDefinition {
  const definition = isRecord(row.definition)
    ? (row.definition as SurgicalInterventionDefinition)
    : null;

  return {
    allowedApproaches: definition?.allowedApproaches ?? [],
    allowedEntryTechniques: definition?.allowedEntryTechniques ?? [],
    approachConfigs: definition?.approachConfigs,
    archivedAt: row.archived_at,
    checklistSteps: definition?.checklistSteps ?? [],
    createdAt: row.created_at,
    id: row.id as InterventionType,
    indicationOptions: definition?.indicationOptions,
    indications: definition?.indications ?? [],
    isCustom: definition?.isCustom ?? row.id.startsWith('custom-'),
    keyStepIds: definition?.keyStepIds ?? [],
    lateralityMode: definition?.lateralityMode,
    name: definition?.name ?? row.name,
    ownerProfileId: row.owner_profile_id,
    requiresLaterality: definition?.requiresLaterality ?? false,
    status: definition?.status ?? (row.status as SurgicalInterventionDefinition['status']),
    updatedAt: row.updated_at,
    updatedByProfileId: row.updated_by_profile_id,
    version: row.version,
    usedCount: definition?.usedCount,
  };
}

function toSavedIntervention(row: InterventionRow): BackendSavedIntervention {
  return {
    approach: row.approach,
    autonomyScore: row.autonomy_score,
    autonomyScoreCalculatedAt: row.autonomy_score_calculated_at,
    autonomyScoreFormulaId: row.autonomy_score_formula_id,
    checklist: row.checklist ?? {},
    clientMutationId: row.client_mutation_id,
    complexity: row.complexity,
    context: row.surgery_context,
    contextVariables: row.context_variables ?? [],
    createdByProfileId: row.created_by_profile_id ?? row.internal_profile_id,
    customIndication: row.custom_indication,
    date: row.intervention_date,
    deletedAt: row.deleted_at,
    definitionSnapshot: row.definition_snapshot,
    definitionSnapshotSchemaVersion: row.definition_snapshot_schema_version,
    definitionVersion: row.definition_version,
    entryTechnique: row.entry_technique,
    id: row.id,
    indication: row.indication,
    indicationComment: row.indication_comment ?? '',
    internalId: row.internal_profile_id,
    startTime: row.intervention_start_time,
    laterality: row.laterality,
    operativeDurationMinutes: row.operative_duration_minutes,
    procedure: row.procedure_id,
    role: row.role,
    savedAt: row.saved_at,
    seniorId: row.senior_profile_id,
    updatedAt: row.updated_at,
    updatedByProfileId: row.updated_by_profile_id,
    version: row.version,
  };
}

function toEvaluation(row: EvaluationRow): BackendInterventionEvaluation {
  return {
    categoryDifficulty: row.category_difficulty,
    checklist: row.checklist,
    createdAt: row.created_at,
    globalPerformance: row.global_performance,
    interventionId: row.intervention_id,
    seniorComment: row.senior_comment,
    seniorProfileId: row.senior_profile_id,
    updatedAt: row.updated_at,
    updatedByProfileId: row.updated_by_profile_id,
    version: row.version,
  };
}

function toNotebookDocument(row: NotebookRow): BackendNotebookDocument {
  return {
    contentHtml: row.content_html,
    internalId: row.profile_id,
    profileId: row.profile_id,
    updatedAt: row.updated_at,
    updatedByProfileId: row.updated_by_profile_id,
    version: row.version,
  };
}

function toProtectedTrophyImageUrl(trophyId: string, value: string | null) {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(
      value,
      globalThis.location?.origin ?? 'https://project1.invalid'
    );

    if (url.pathname === '/api/trophy-image') {
      return value;
    }

    const marker = '/storage/v1/object/public/trophy-images/';
    const markerIndex = url.pathname.indexOf(marker);

    if (markerIndex < 0) {
      return value;
    }

    const encodedPath = url.pathname.slice(markerIndex + marker.length);
    const path = encodedPath
      .split('/')
      .map((segment) => decodeURIComponent(segment))
      .join('/');

    return `/api/trophy-image?trophyId=${encodeURIComponent(
      trophyId
    )}&path=${encodeURIComponent(path)}`;
  } catch {
    return value;
  }
}

function protectTrophyDefinitionImages(
  trophyId: string,
  definition: AdminTrophyDefinition
) {
  const images = {
    bronze: toProtectedTrophyImageUrl(trophyId, definition.images?.bronze ?? null),
    diamond: toProtectedTrophyImageUrl(trophyId, definition.images?.diamond ?? null),
    gold: toProtectedTrophyImageUrl(trophyId, definition.images?.gold ?? null),
    silver: toProtectedTrophyImageUrl(trophyId, definition.images?.silver ?? null),
    single: toProtectedTrophyImageUrl(trophyId, definition.images?.single ?? null),
  };

  return {
    ...definition,
    images,
    levels: (definition.levels ?? []).map((level) => ({
      ...level,
      imageSrc:
        toProtectedTrophyImageUrl(trophyId, level.imageSrc) ??
        images[level.tier],
    })),
  };
}

function toTrophyDefinition(row: TrophyDefinitionRow): BackendTrophyDefinition {
  const definition = isRecord(row.definition)
    ? protectTrophyDefinitionImages(
        row.id,
        row.definition as AdminTrophyDefinition
      )
    : null;
  const pendingDraftDefinition = isRecord(row.pending_draft_definition)
    ? protectTrophyDefinitionImages(
        row.id,
        row.pending_draft_definition as AdminTrophyDefinition
      )
    : null;
  const pendingDraft = pendingDraftDefinition
    ? {
        ...pendingDraftDefinition,
        activatedAt: row.activated_at ?? null,
        everActivated: row.ever_activated === true,
        id: row.id,
        status: 'draft' as const,
        version: row.version,
      }
    : null;

  return {
    associatedApproach: definition?.associatedApproach ?? '',
    associatedIndication: definition?.associatedIndication ?? '',
    associatedProcedure: definition?.associatedProcedure ?? '',
    conditions: definition?.conditions ?? [],
    createdAt: definition?.createdAt ?? row.created_at,
    createdByProfileId: row.created_by_profile_id,
    updatedByProfileId: row.updated_by_profile_id,
    version: row.version,
    everActivated: row.ever_activated === true,
    activatedAt: row.activated_at ?? null,
    description: definition?.description ?? '',
    format: definition?.format ?? 'unique',
    id: row.id,
    images: definition?.images ?? {
      bronze: null,
      diamond: null,
      gold: null,
      silver: null,
      single: null,
    },
    levels: definition?.levels ?? [],
    operativeScope: definition?.operativeScope ?? 'procedure',
    status: definition?.status ?? (row.status as AdminTrophyDefinition['status']),
    title: definition?.title ?? row.title,
    trackedInterventionStatus:
      definition?.trackedInterventionStatus ?? 'recorded',
    trackedRole: definition?.trackedRole ?? '',
    type: definition?.type ?? 'operatoire',
    updatedAt: definition?.updatedAt ?? row.updated_at,
    visibility: definition?.visibility ?? 'visible',
    pendingDraft,
    draftBaseVersion: row.pending_draft_base_version ?? null,
    draftVersion: row.pending_draft_version ?? null,
  };
}

function toTrophyAward(row: TrophyAwardRow): BackendTrophyAward {
  return {
    awardedAt: row.awarded_at,
    id: row.id,
    profileId: row.profile_id,
    sourceInterventionId: row.source_intervention_id,
    tier:
      row.tier === 'bronze' ||
      row.tier === 'silver' ||
      row.tier === 'gold' ||
      row.tier === 'diamond'
        ? row.tier
        : null,
    trophyId: row.trophy_id,
    updatedAt: row.updated_at,
    updatedByProfileId: row.updated_by_profile_id,
    version: row.version,
  };
}

function toUserNotification(
  row: UserNotificationRow
): BackendUserNotification {
  return {
    body: row.body,
    createdAt: row.created_at,
    id: row.id,
    kind: row.kind,
    profileId: row.profile_id,
    readAt: row.read_at,
    tier:
      row.tier === 'bronze' ||
      row.tier === 'silver' ||
      row.tier === 'gold' ||
      row.tier === 'diamond'
        ? row.tier
        : null,
    title: row.title,
    trophyId: row.trophy_id,
  };
}

export async function loadBackendTrophyAwards(
  profileIds: string[],
  signal?: AbortSignal
) {
  const rows = await selectRowsByIds<TrophyAwardRow>(
    'trophy_awards',
    'profile_id',
    profileIds,
    {
      order: 'awarded_at.desc',
      signal,
    }
  );

  return rows.map(toTrophyAward);
}

function toActivityLogEntry(row: ActivityLogRow): BackendActivityLogEntry {
  return {
    action: row.action,
    analyticsEvent: row.analytics_event ?? null,
    actorLabel: row.actor_label,
    actorRole: row.actor_role,
    createdAt: row.created_at,
    id: row.id,
    profileId: row.profile_id,
    targetLabel: row.target_label,
    targetType: row.target_type,
    updatedAt: row.updated_at,
    version: row.version,
  };
}

async function selectRowsByIds<T>(
  table: string,
  column: string,
  ids: string[],
  options: {
    order?: string;
    select?: string;
    signal?: AbortSignal;
  } = {}
) {
  if (ids.length === 0) {
    return [];
  }

  return selectSupabaseRows<T>(table, {
    filters: {
      [column]: toInFilter(ids),
    },
    order: options.order,
    select: options.select,
    signal: options.signal,
  });
}

export function isDurableBackendConfigured() {
  return isSupabaseClientConfigured();
}

export async function loadBackendProfile(
  profileId: string,
  signal?: AbortSignal
) {
  const rows = await selectSupabaseRows<ProfileRow>('profiles', {
    filters: {
      id: `eq.${profileId}`,
      is_active: 'eq.true',
    },
    limit: 1,
    signal,
  });

  return rows[0] ? toBackendProfile(rows[0]) : null;
}

export async function loadBackendProfileByAuthUserId(
  authUserId: string,
  signal?: AbortSignal
) {
  const rows = await selectSupabaseRows<ProfileRow>('profiles', {
    filters: {
      auth_user_id: `eq.${authUserId}`,
      is_active: 'eq.true',
    },
    limit: 1,
    signal,
  });

  return rows[0] ? toBackendProfile(rows[0]) : null;
}

export async function loadBackendProfiles(signal?: AbortSignal) {
  const rows = await selectSupabaseRows<ProfileRow>('profiles', {
    filters: {
      is_active: 'eq.true',
    },
    order: 'last_name.asc,first_name.asc',
    signal,
  });

  return rows.map(toBackendProfile);
}

export async function loadBackendDisabledProfiles(signal?: AbortSignal) {
  const rows = await selectSupabaseRows<ProfileRow>('profiles', {
    filters: {
      is_active: 'eq.false',
    },
    order: 'updated_at.desc,last_name.asc,first_name.asc',
    signal,
  });

  return rows.map(toBackendProfile);
}

export async function loadBackendInstitutions(signal?: AbortSignal) {
  const rows = await selectSupabaseRows<InstitutionRow>('institutions', {
    order: 'status.asc,name.asc',
    signal,
  });

  return rows.map(toInstitution);
}

export async function createBackendInstitution(
  name: string,
  signal?: AbortSignal
) {
  const result = await supabaseRestRequest<InstitutionRow | InstitutionRow[]>(
    'rpc/create_institution',
    {
      body: { p_name: name },
      method: 'POST',
      signal,
    }
  );
  const row = Array.isArray(result) ? result[0] : result;

  if (!row) {
    throw new Error("Supabase n’a pas retourné l’établissement créé.");
  }

  return toInstitution(row);
}

export async function renameBackendInstitution(
  institutionId: string,
  name: string,
  expectedVersion: number,
  signal?: AbortSignal
) {
  const result = await supabaseRestRequest<InstitutionRow | InstitutionRow[]>(
    'rpc/rename_institution',
    {
      body: {
        p_expected_version: expectedVersion,
        p_institution_id: institutionId,
        p_name: name,
      },
      method: 'POST',
      signal,
    }
  );
  const row = Array.isArray(result) ? result[0] : result;

  if (!row) {
    throw new Error("Supabase n’a pas retourné l’établissement renommé.");
  }

  return toInstitution(row);
}

export async function archiveBackendInstitution(
  institutionId: string,
  expectedVersion: number,
  signal?: AbortSignal
) {
  const result = await supabaseRestRequest<InstitutionRow | InstitutionRow[]>(
    'rpc/archive_institution',
    {
      body: {
        p_expected_version: expectedVersion,
        p_institution_id: institutionId,
      },
      method: 'POST',
      signal,
    }
  );
  const row = Array.isArray(result) ? result[0] : result;

  if (!row) {
    throw new Error("Supabase n’a pas retourné l’établissement archivé.");
  }

  return toInstitution(row);
}

export async function moveBackendProfileToInstitution(
  profileId: string,
  institutionId: string,
  expectedProfileVersion: number,
  signal?: AbortSignal
) {
  const result = await supabaseRestRequest<ProfileRow | ProfileRow[]>(
    'rpc/move_profile_to_institution',
    {
      body: {
        p_expected_profile_version: expectedProfileVersion,
        p_institution_id: institutionId,
        p_profile_id: profileId,
      },
      method: 'POST',
      signal,
    }
  );
  const row = Array.isArray(result) ? result[0] : result;

  if (!row) {
    throw new Error('Supabase n’a pas retourné le profil déplacé.');
  }

  return toBackendProfile(row);
}

export async function loadBackendVisibleInternalProfiles(signal?: AbortSignal) {
  const result = await supabaseRestRequest<
    InternalDirectoryRow | InternalDirectoryRow[]
  >('rpc/list_visible_internal_directory', {
    body: {},
    method: 'POST',
    signal,
  });
  const rows = Array.isArray(result) ? result : result ? [result] : [];

  return rows.map(toDirectoryInternal);
}

export async function loadBackendSeniorAssignments(signal?: AbortSignal) {
  const rows = await selectSupabaseRows<AssignmentRow>(
    'senior_internal_assignments',
    { signal }
  );

  return rows.map((row) => ({
    createdAt: row.created_at,
    internalProfileId: row.internal_profile_id,
    seniorProfileId: row.senior_profile_id,
    updatedAt: row.updated_at,
    updatedByProfileId: row.updated_by_profile_id,
    version: row.version,
  }));
}

export async function completeBackendPasswordSetup(
  contactEmail: string,
  signal?: AbortSignal
) {
  await supabaseRestRequest<null>('rpc/complete_password_setup', {
    body: {
      p_contact_email: contactEmail,
    },
    method: 'POST',
    signal,
  });
}

export async function recordBackendProfileLogin(signal?: AbortSignal) {
  await supabaseRestRequest<null>('rpc/record_profile_login', {
    body: {},
    method: 'POST',
    signal,
  });
}

export async function loadBackendReferenceData(
  signal?: AbortSignal
): Promise<BackendReferenceData> {
  const [definitionRows, institutionRows, seniorRows, trophyRows] =
    await Promise.all([
    selectSupabaseRows<SurgicalDefinitionRow>(
      'surgical_intervention_definitions',
      {
        order: 'name.asc',
        signal,
      }
    ),
    selectSupabaseRows<InstitutionRow>('institutions', {
      order: 'status.asc,name.asc',
      signal,
    }),
    supabaseRestRequest<SeniorDirectoryRow[]>('rpc/list_senior_directory', {
      body: {},
      method: 'POST',
      signal,
    }),
    supabaseRestRequest<TrophyDefinitionRow[]>(
      'rpc/list_visible_trophy_definitions',
      {
        body: {},
        method: 'POST',
        signal,
      }
    ),
  ]);

  return {
    institutions: institutionRows.map(toInstitution),
    seniors: seniorRows.map(toDirectorySenior),
    surgicalInterventions: definitionRows.map(toSurgicalDefinition),
    trophyDefinitions: trophyRows.map(toTrophyDefinition),
  };
}

export async function loadBackendUserData(
  profileId: string,
  signal?: AbortSignal
): Promise<BackendUserData | null> {
  const profile = await loadBackendProfile(profileId, signal);

  if (!profile) {
    return null;
  }

  const assignmentRows =
    profile.role === 'senior'
      ? await selectSupabaseRows<AssignmentRow>('senior_internal_assignments', {
          filters: {
            senior_profile_id: `eq.${profile.id}`,
          },
          signal,
        })
      : [];
  const managedInternalIds = assignmentRows.map(
    (assignment) => assignment.internal_profile_id
  );
  const seniorInternalIds =
    profile.role === 'senior'
      ? (await loadBackendVisibleInternalProfiles(signal)).map(
          (candidate) => candidate.id
        )
      : [];
  const adminInternalIds =
    profile.role === 'admin'
      ? (await loadBackendProfiles(signal))
          .filter((candidate) => candidate.role === 'internal')
          .map((candidate) => candidate.id)
      : [];
  const readableInternalIds =
    profile.role === 'internal'
      ? [profile.id]
      : profile.role === 'admin'
        ? adminInternalIds
        : seniorInternalIds;

  const [
    interventionRows,
    notebookRows,
    trophyAwardRows,
    userNotificationRows,
    activityRows,
  ] =
    await Promise.all([
      selectRowsByIds<InterventionRow>(
        'interventions',
        'internal_profile_id',
        readableInternalIds,
        {
          order: 'intervention_date.desc,saved_at.desc',
          signal,
        }
      ),
      selectRowsByIds<NotebookRow>(
        'notebook_documents',
        'profile_id',
        readableInternalIds,
        {
          signal,
        }
      ),
      loadBackendTrophyAwards(readableInternalIds, signal),
      profile.role === 'internal'
        ? selectSupabaseRows<UserNotificationRow>('user_notifications', {
            filters: {
              profile_id: `eq.${profile.id}`,
              read_at: 'is.null',
            },
            order: 'created_at.desc',
            signal,
          })
        : Promise.resolve([]),
      profile.role === 'admin'
        ? selectSupabaseRows<ActivityLogRow>('activity_log', {
            order: 'created_at.desc',
            signal,
          })
        : selectRowsByIds<ActivityLogRow>(
            'activity_log',
            'profile_id',
            [profile.id],
            {
              order: 'created_at.desc',
              signal,
            }
          ),
    ]);

  const interventionIds = interventionRows.map((intervention) => intervention.id);
  const evaluationRows = await selectRowsByIds<EvaluationRow>(
    'intervention_evaluations',
    'intervention_id',
    interventionIds,
    {
      signal,
    }
  );

  return {
    activityLog: activityRows.map(toActivityLogEntry),
    evaluations: evaluationRows.map(toEvaluation),
    managedInternalIds,
    notebookDocuments: notebookRows.map(toNotebookDocument),
    profile,
    savedInterventions: interventionRows.map(toSavedIntervention),
    trophyAwards: trophyAwardRows,
    userNotifications: userNotificationRows.map(toUserNotification),
  };
}

export async function markBackendUserNotificationRead(
  notificationId: string,
  signal?: AbortSignal
) {
  await supabaseRestRequest<null>('rpc/mark_user_notification_read', {
    body: {
      p_notification_id: notificationId,
    },
    method: 'POST',
    signal,
  });
}

export async function loadBackendBootstrapPayload(
  profileId: string,
  signal?: AbortSignal
): Promise<BackendBootstrapPayload | null> {
  const [referenceData, userData] = await Promise.all([
    loadBackendReferenceData(signal),
    loadBackendUserData(profileId, signal),
  ]);

  if (!userData) {
    return null;
  }

  return {
    referenceData,
    userData,
  };
}

export async function createBackendInterventionWithEvaluationRequest(
  intervention: BackendSavedIntervention,
  signal?: AbortSignal
) {
  if (!intervention.clientMutationId) {
    throw new Error('Identifiant de tentative d’enregistrement manquant.');
  }

  const result = await supabaseRestRequest<{
    evaluationRequest: EvaluationRequestRow;
    intervention: InterventionRow;
  }>('rpc/create_intervention_v3', {
    body: {
      p_approach: intervention.approach,
      p_client_mutation_id: intervention.clientMutationId,
      p_complexity: intervention.complexity,
      p_context_variables: intervention.contextVariables,
      p_custom_indication: intervention.customIndication,
      p_entry_technique: intervention.entryTechnique,
      p_indication: intervention.indication,
      p_indication_comment: intervention.indicationComment,
      p_intervention_date: intervention.date,
      p_intervention_start_time: intervention.startTime,
      p_intervention_id: intervention.id,
      p_laterality: intervention.laterality,
      p_operative_duration_minutes: intervention.operativeDurationMinutes,
      p_procedure_id: intervention.procedure,
      p_role: intervention.role,
      p_senior_profile_id: intervention.seniorId,
      p_surgery_context: intervention.context,
    },
    method: 'POST',
    signal,
  });

  return toSavedIntervention(result.intervention);
}

export async function saveBackendEvaluation(
  evaluation: AdminInterventionEvaluation,
  interventionVersion: number,
  signal?: AbortSignal
) {
  const result = await supabaseRestRequest<{
    evaluation: EvaluationRow;
    intervention: InterventionRow;
  }>('rpc/save_intervention_evaluation_v2', {
    body: {
      p_category_difficulty: evaluation.categoryDifficulty,
      p_checklist: evaluation.checklist,
      p_expected_evaluation_version: evaluation.version ?? null,
      p_expected_intervention_version: interventionVersion,
      p_global_performance: evaluation.globalPerformance,
      p_intervention_id: evaluation.interventionId,
      p_senior_comment: evaluation.seniorComment,
    },
    method: 'POST',
    signal,
  });

  return {
    evaluation: toEvaluation(result.evaluation),
    intervention: toSavedIntervention(result.intervention),
  };
}

export async function upsertBackendNotebookDocument(
  document: BackendNotebookDocument,
  signal?: AbortSignal
) {
  const body = {
    content_html: document.contentHtml,
    profile_id: document.profileId,
    updated_at: document.updatedAt,
  };

  const rows = document.version
    ? await updateVersionedRows<NotebookRow>(
        'notebook_documents',
        { profile_id: document.profileId },
        document.version,
        body,
        signal
      )
    : await insertRows<NotebookRow>('notebook_documents', body, signal);

  return rows[0] ? toNotebookDocument(rows[0]) : null;
}

export class BackendVersionConflictError extends Error {
  constructor(resource: string) {
    super(
      `Une modification plus récente existe pour ${resource}. Rechargez les données avant de réessayer.`
    );
    this.name = 'BackendVersionConflictError';
  }
}

async function insertRows<T>(
  table: string,
  body: unknown,
  signal?: AbortSignal
) {
  try {
    return await supabaseRestRequest<T[]>(table, {
      body,
      headers: {
        Prefer: 'return=representation',
      },
      method: 'POST',
      signal,
    });
  } catch (error) {
    if (
      typeof error === 'object' &&
      error &&
      'status' in error &&
      Number(error.status) === 409
    ) {
      throw new BackendVersionConflictError(table);
    }

    throw error;
  }
}

async function updateVersionedRows<T>(
  table: string,
  identity: Record<string, string>,
  expectedVersion: number,
  body: unknown,
  signal?: AbortSignal
) {
  const rows = await supabaseRestRequest<T[]>(table, {
    body,
    headers: {
      Prefer: 'return=representation',
    },
    method: 'PATCH',
    searchParams: {
      ...Object.fromEntries(
        Object.entries(identity).map(([key, value]) => [key, `eq.${value}`])
      ),
      version: `eq.${expectedVersion}`,
    },
    signal,
  });

  if (rows.length === 0) {
    throw new BackendVersionConflictError(table);
  }

  return rows;
}

async function deleteVersionedRows<T>(
  table: string,
  identity: Record<string, string>,
  expectedVersion: number,
  signal?: AbortSignal
) {
  const rows = await supabaseRestRequest<T[]>(table, {
    headers: {
      Prefer: 'return=representation',
    },
    method: 'DELETE',
    searchParams: {
      ...Object.fromEntries(
        Object.entries(identity).map(([key, value]) => [key, `eq.${value}`])
      ),
      version: `eq.${expectedVersion}`,
    },
    signal,
  });

  if (rows.length === 0) {
    throw new BackendVersionConflictError(table);
  }

  return rows;
}

export async function saveBackendSurgicalDefinition(
  definition: SurgicalInterventionDefinition,
  signal?: AbortSignal
) {
  const now = new Date().toISOString();
  const body = {
    archived_at: definition.archivedAt ?? null,
    definition: {
      ...definition,
      updatedAt: now,
    },
    id: definition.id,
    name: definition.name,
    status: definition.status ?? 'active',
  };
  const rows = definition.version
    ? await updateVersionedRows<SurgicalDefinitionRow>(
        'surgical_intervention_definitions',
        { id: definition.id },
        definition.version,
        body,
        signal
      )
    : await insertRows<SurgicalDefinitionRow>(
        'surgical_intervention_definitions',
        {
          ...body,
          created_at: definition.createdAt ?? now,
          owner_profile_id: definition.ownerProfileId ?? null,
        },
        signal
      );

  return rows[0] ? toSurgicalDefinition(rows[0]) : null;
}

export async function deleteBackendSurgicalDefinition(
  definitionId: string,
  expectedVersion: number,
  signal?: AbortSignal
) {
  await deleteVersionedRows<SurgicalDefinitionRow>(
    'surgical_intervention_definitions',
    { id: definitionId },
    expectedVersion,
    signal
  );
}

export async function saveBackendTrophyDefinition(
  trophy: AdminTrophyDefinition,
  signal?: AbortSignal
) {
  const now = new Date().toISOString();
  const {
    draftBaseVersion: _discardedDraftBaseVersion,
    draftVersion: _discardedDraftVersion,
    pendingDraft: _discardedPendingDraft,
    everActivated: _discardedEverActivated,
    activatedAt: _discardedActivatedAt,
    ...cleanDefinition
  } = trophy;
  const draftResult = await supabaseRestRequest<{
    baseVersion: number;
    definition: TrophyDefinitionRow;
    draft?: unknown;
    draftVersion: number | null;
  }>('rpc/save_trophy_definition_draft', {
    body: {
      p_definition: {
        ...cleanDefinition,
        status: 'draft',
        updatedAt: now,
      },
      p_expected_definition_version: trophy.version ?? null,
      p_expected_draft_version: trophy.draftVersion ?? null,
      p_trophy_id: trophy.id,
    },
    method: 'POST',
    signal,
  });
  const draftRow: TrophyDefinitionRow = {
    ...draftResult.definition,
    pending_draft_base_version: draftResult.baseVersion,
    pending_draft_definition: draftResult.draft,
    pending_draft_version: draftResult.draftVersion,
  };

  if (trophy.status === 'draft') {
    return toTrophyDefinition(draftRow);
  }

  const publishResult = await supabaseRestRequest<
    TrophyDefinitionRow | TrophyDefinitionRow[]
  >('rpc/publish_trophy_definition_draft', {
    body: {
      p_expected_definition_version: draftResult.definition.version,
      p_expected_draft_version: draftResult.draftVersion,
      p_target_status: trophy.status,
      p_trophy_id: trophy.id,
    },
    method: 'POST',
    signal,
  });
  const publishedRow = Array.isArray(publishResult)
    ? publishResult[0]
    : publishResult;

  return publishedRow ? toTrophyDefinition(publishedRow) : null;
}

export async function deleteBackendTrophyDefinition(
  trophyId: string,
  expectedVersion: number,
  signal?: AbortSignal
) {
  await supabaseRestRequest<TrophyDefinitionRow | TrophyDefinitionRow[]>(
    'rpc/delete_never_activated_trophy_draft',
    {
      body: {
        p_expected_version: expectedVersion,
        p_trophy_id: trophyId,
      },
      method: 'POST',
      signal,
    }
  );
}

export async function deletePendingBackendIntervention(
  interventionId: string,
  expectedVersion: number,
  signal?: AbortSignal
) {
  return supabaseRestRequest<{
    evaluationRequest: EvaluationRequestRow;
    intervention: InterventionRow;
  }>('rpc/delete_pending_intervention', {
    body: {
      p_expected_intervention_version: expectedVersion,
      p_intervention_id: interventionId,
    },
    method: 'POST',
    signal,
  });
}

export async function replaceBackendSeniorAssignments(
  seniorProfileId: string,
  internalProfileIds: string[],
  signal?: AbortSignal
) {
  const currentRows = await selectSupabaseRows<AssignmentRow>(
    'senior_internal_assignments',
    {
      filters: {
        senior_profile_id: `eq.${seniorProfileId}`,
      },
      signal,
    }
  );
  const desiredIds = new Set(internalProfileIds);
  const currentIds = new Set(
    currentRows.map((assignment) => assignment.internal_profile_id)
  );

  for (const assignment of currentRows) {
    if (!desiredIds.has(assignment.internal_profile_id)) {
      await deleteVersionedRows<AssignmentRow>(
        'senior_internal_assignments',
        {
          internal_profile_id: assignment.internal_profile_id,
          senior_profile_id: seniorProfileId,
        },
        assignment.version,
        signal
      );
    }
  }

  for (const internalProfileId of desiredIds) {
    if (!currentIds.has(internalProfileId)) {
      await insertRows<AssignmentRow>(
        'senior_internal_assignments',
        {
          internal_profile_id: internalProfileId,
          senior_profile_id: seniorProfileId,
        },
        signal
      );
    }
  }

  return Array.from(desiredIds);
}

export async function replaceOwnBackendSeniorAssignments(
  internalProfileIds: string[],
  signal?: AbortSignal
) {
  return supabaseRestRequest<string[]>(
    'rpc/replace_own_senior_internal_assignments',
    {
      body: {
        internal_ids: internalProfileIds,
      },
      method: 'POST',
      signal,
    }
  );
}

export async function createBackendActivityLogEntry(
  entry: BackendActivityLogEntry,
  signal?: AbortSignal
) {
  const eventKind = getAllowedActivityEventKind(entry);

  if (!eventKind) {
    return null;
  }

  const result = await supabaseRestRequest<ActivityLogRow | ActivityLogRow[]>(
    'rpc/record_user_activity_event',
    {
      body: {
        p_analytics_event: entry.analyticsEvent ?? null,
        p_event_kind: eventKind,
        p_target_label: entry.targetLabel,
      },
      method: 'POST',
      signal,
    }
  );
  const savedEntry = Array.isArray(result) ? result[0] : result;

  return savedEntry ? toActivityLogEntry(savedEntry) : null;
}

function getAllowedActivityEventKind(entry: BackendActivityLogEntry) {
  if (entry.analyticsEvent?.kind === 'intervention_form') {
    return 'intervention_form_metrics';
  }

  if (entry.analyticsEvent?.kind === 'senior_evaluation') {
    return 'senior_evaluation_metrics';
  }

  const eventKindsByAction: Record<string, string> = {
    'Consultation de ses statistiques opératoires': 'view_own_statistics',
    'Consultation de ses trophées': 'view_trophies',
    'Consultation de son bloc-notes': 'view_notebook',
    'Consultation d’une fiche technique': 'view_technical_guide',
    'Consultation des statistiques d’un interne': 'view_internal_statistics',
    'Préparation d’un rappel e-mail': 'prepare_reminder_email',
  };

  return eventKindsByAction[entry.action] ?? null;
}

export async function updateOwnBackendProfileSettings(
  input: {
    avatarImageSrc?: string | null;
    expectedVersion: number;
    semester?: string;
    updateAvatar: boolean;
    updateSemester: boolean;
  },
  signal?: AbortSignal
) {
  const result = await supabaseRestRequest<ProfileRow | ProfileRow[]>(
    'rpc/update_own_profile_settings',
    {
      body: {
        p_avatar_image_src: input.avatarImageSrc ?? null,
        p_expected_version: input.expectedVersion,
        p_semester: input.semester ?? null,
        p_update_avatar: input.updateAvatar,
        p_update_semester: input.updateSemester,
      },
      method: 'POST',
      signal,
    }
  );
  const row = Array.isArray(result) ? result[0] : result;

  if (!row) {
    throw new BackendVersionConflictError('profiles');
  }

  return toBackendProfile(row);
}
