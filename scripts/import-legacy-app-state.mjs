#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const APP_STATE_KEYS = [
  'internal_profiles',
  'saved_interventions',
  'notebook_documents',
  'custom_surgical_interventions',
  'custom_seniors',
  'admin_trophies',
  'admin_evaluations',
  'activity_log',
];

const DEFAULT_ENV_FILES = ['.env.local', '.env.production.local', '.env'];
const UUID_NAMESPACE = 'a538964a-c840-4385-852d-4a09b7fb55f4';
const DEFAULT_ADMIN_LOGIN_ID = 'adminbeta';

const args = new Set(process.argv.slice(2));
const applyChanges = args.has('--apply');
const shouldShowHelp = args.has('--help') || args.has('-h');
const explicitEnvFile = process.argv
  .slice(2)
  .find((arg) => arg.startsWith('--env-file='))
  ?.split('=')
  .slice(1)
  .join('=');

if (shouldShowHelp) {
  printHelp();
  process.exit(0);
}

loadEnv(explicitEnvFile);

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Add them to the environment or pass --env-file=.env.local.'
  );
  process.exit(1);
}

const migrationState = {
  warnings: [],
};

const legacyState = await loadLegacyAppState();
const plan = buildMigrationPlan(legacyState);

printPlan(plan);

if (!applyChanges) {
  console.log('\nDry run only. Re-run with --apply to write rows to Supabase.');
  process.exit(0);
}

await applyMigrationPlan(plan);
console.log('\nLegacy app_state import completed.');

function printHelp() {
  console.log(`
Usage:
  npm run migrate:legacy:dry-run
  npm run migrate:legacy:apply
  node scripts/import-legacy-app-state.mjs --env-file=.env.local

Options:
  --apply              Write transformed rows to the durable Supabase tables.
  --env-file=<path>    Load Supabase env vars from a specific file.
  --help               Show this help message.

The script is dry-run by default.
`);
}

function loadEnv(envFile) {
  const envFiles = envFile ? [envFile] : DEFAULT_ENV_FILES;
  const selectedEnvFile = envFiles
    .map((filePath) => resolve(process.cwd(), filePath))
    .find((filePath) => existsSync(filePath));

  if (!selectedEnvFile) {
    return;
  }

  const content = readFileSync(selectedEnvFile, 'utf8');

  for (const line of content.split(/\r?\n/)) {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmedLine.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    const rawValue = trimmedLine.slice(separatorIndex + 1).trim();

    if (!key || process.env[key] != null) {
      continue;
    }

    process.env[key] = rawValue.replace(/^["']|["']$/g, '');
  }
}

async function loadLegacyAppState() {
  const rows = await supabaseRestRequest('app_state', {
    searchParams: {
      select: 'key,data',
    },
  });
  const rowMap = new Map(rows.map((row) => [row.key, row.data]));

  return Object.fromEntries(
    APP_STATE_KEYS.map((key) => {
      const value = rowMap.get(key);

      return [key, Array.isArray(value) ? value : []];
    })
  );
}

function buildMigrationPlan(state) {
  const now = new Date().toISOString();
  const legacyProfileIds = new Map();
  const legacyInterventionIds = new Map();
  const profilesByLogin = new Set();
  const profiles = [];
  const seniorAssignments = [];
  const surgicalDefinitionsById = new Map();
  const trophyDefinitionsById = new Map();

  const adminProfileId = uuidFromLegacyId('profile', 'admin');
  profiles.push({
    id: adminProfileId,
    auth_user_id: null,
    role: 'admin',
    first_name: 'Admin',
    last_name: '',
    login_id: process.env.LEGACY_ADMIN_LOGIN_ID || DEFAULT_ADMIN_LOGIN_ID,
    institution: null,
    promotion: null,
    semester: null,
    avatar_image_src: null,
    must_change_password: true,
    metadata: {
      legacy_id: 'admin',
      migration_note: 'Auth user must be linked after data import.',
    },
    created_at: now,
    updated_at: now,
    last_login_at: null,
  });
  legacyProfileIds.set('admin', adminProfileId);
  profilesByLogin.add(normalizeCredentialValue(profiles[0].login_id));

  for (const profile of state.internal_profiles) {
    if (!isObject(profile) || !profile.id || !profile.loginId) {
      warn('Skipped invalid internal profile.');
      continue;
    }

    const loginId = String(profile.loginId).trim();
    const normalizedLogin = normalizeCredentialValue(loginId);

    if (!normalizedLogin || profilesByLogin.has(normalizedLogin)) {
      warn(`Skipped duplicate internal login: ${loginId || profile.id}`);
      continue;
    }

    const profileId = uuidFromLegacyId('profile', profile.id);
    legacyProfileIds.set(profile.id, profileId);
    profilesByLogin.add(normalizedLogin);
    profiles.push({
      id: profileId,
      auth_user_id: null,
      role: 'internal',
      first_name: String(profile.firstName || '').trim(),
      last_name: String(profile.lastName || '').trim(),
      login_id: loginId,
      institution: toNullableString(profile.institution) || 'CHU de Nantes',
      promotion: toNullableString(profile.promotion),
      semester: toNullableString(profile.semester),
      avatar_image_src: toNullableString(profile.avatarImageSrc),
      must_change_password: Boolean(profile.mustChangePassword),
      metadata: {
        achievement_badges: asArray(profile.achievementBadges),
        badge_metrics: isObject(profile.badgeMetrics) ? profile.badgeMetrics : {},
        baseline_stats: isObject(profile.baselineStats) ? profile.baselineStats : {},
        legacy_id: profile.id,
        migration_note: 'Auth user must be linked after data import.',
      },
      created_at: validIsoDate(profile.createdAt) || now,
      updated_at: now,
      last_login_at: validIsoDate(profile.lastLoginAt),
    });
  }

  for (const senior of state.custom_seniors) {
    if (!isObject(senior) || !senior.id || !senior.loginId) {
      warn('Skipped invalid senior profile.');
      continue;
    }

    const loginId = String(senior.loginId).trim();
    const normalizedLogin = normalizeCredentialValue(loginId);

    if (!normalizedLogin || profilesByLogin.has(normalizedLogin)) {
      warn(`Skipped duplicate senior login: ${loginId || senior.id}`);
      continue;
    }

    const profileId = uuidFromLegacyId('profile', senior.id);
    legacyProfileIds.set(senior.id, profileId);
    profilesByLogin.add(normalizedLogin);
    profiles.push({
      id: profileId,
      auth_user_id: null,
      role: 'senior',
      first_name: String(senior.firstName || '').trim(),
      last_name: String(senior.lastName || '').trim(),
      login_id: loginId,
      institution: toNullableString(senior.institution) || 'CHU de Nantes',
      promotion: null,
      semester: null,
      avatar_image_src: null,
      must_change_password: Boolean(senior.mustChangePassword ?? true),
      metadata: {
        legacy_id: senior.id,
        migration_note: 'Auth user must be linked after data import.',
      },
      created_at: validIsoDate(senior.createdAt) || now,
      updated_at: now,
      last_login_at: validIsoDate(senior.lastLoginAt),
    });

    for (const internalId of asArray(senior.managedInternalIds)) {
      const internalProfileId = legacyProfileIds.get(internalId);

      if (!internalProfileId) {
        warn(
          `Skipped senior assignment ${senior.id} -> ${internalId}: internal profile not found.`
        );
        continue;
      }

      seniorAssignments.push({
        senior_profile_id: profileId,
        internal_profile_id: internalProfileId,
        created_at: now,
      });
    }
  }

  for (const definition of state.custom_surgical_interventions) {
    if (!isObject(definition) || !definition.id) {
      warn('Skipped invalid surgical intervention definition.');
      continue;
    }

    addSurgicalDefinition(surgicalDefinitionsById, definition, now);
  }

  const interventions = [];

  for (const intervention of state.saved_interventions) {
    if (
      !isObject(intervention) ||
      !intervention.id ||
      !intervention.internalId ||
      !intervention.procedure
    ) {
      warn('Skipped invalid saved intervention.');
      continue;
    }

    const internalProfileId = legacyProfileIds.get(intervention.internalId);

    if (!internalProfileId) {
      warn(
        `Skipped intervention ${intervention.id}: internal profile ${intervention.internalId} not found.`
      );
      continue;
    }

    if (!surgicalDefinitionsById.has(intervention.procedure)) {
      addSurgicalDefinition(
        surgicalDefinitionsById,
        createPlaceholderSurgicalDefinition(intervention.procedure, now),
        now
      );
    }

    const interventionId = uuidFromLegacyId('intervention', intervention.id);
    legacyInterventionIds.set(intervention.id, interventionId);

    interventions.push({
      id: interventionId,
      internal_profile_id: internalProfileId,
      senior_profile_id:
        intervention.seniorId && legacyProfileIds.has(intervention.seniorId)
          ? legacyProfileIds.get(intervention.seniorId)
          : null,
      procedure_id: intervention.procedure,
      intervention_date:
        validDateOnly(intervention.date) ||
        validDateOnly(String(intervention.savedAt || '').slice(0, 10)) ||
        now.slice(0, 10),
      indication: toNullableString(intervention.indication),
      indication_comment: String(intervention.indicationComment || ''),
      custom_indication: toNullableString(intervention.customIndication),
      approach: toNullableString(intervention.approach),
      entry_technique: toNullableString(intervention.entryTechnique),
      laterality: toNullableString(intervention.laterality),
      surgery_context: toNullableString(intervention.context),
      complexity: toNullableNumber(intervention.complexity),
      role: toNullableString(intervention.role),
      checklist: isObject(intervention.checklist) ? intervention.checklist : {},
      autonomy_score: toNullableNumber(intervention.autonomyScore),
      saved_at: validIsoDate(intervention.savedAt) || now,
      created_by_profile_id: internalProfileId,
      updated_at: now,
      deleted_at: null,
      client_mutation_id: `legacy:${intervention.id}`,
    });
  }

  const evaluations = normalizeEvaluations(state.admin_evaluations)
    .map((evaluation) => {
      if (!evaluation.interventionId) {
        warn('Skipped evaluation without interventionId.');
        return null;
      }

      const interventionId = legacyInterventionIds.get(evaluation.interventionId);

      if (!interventionId) {
        warn(`Skipped evaluation for ${evaluation.interventionId}: intervention not found.`);
        return null;
      }

      const intervention = state.saved_interventions.find(
        (item) => isObject(item) && item.id === evaluation.interventionId
      );

      return {
        intervention_id: interventionId,
        senior_profile_id:
          intervention?.seniorId && legacyProfileIds.has(intervention.seniorId)
            ? legacyProfileIds.get(intervention.seniorId)
            : null,
        global_performance: toNullableString(evaluation.globalPerformance),
        category_difficulty: toNullableString(evaluation.categoryDifficulty),
        senior_comment: String(evaluation.seniorComment || ''),
        created_at: validIsoDate(evaluation.updatedAt) || now,
        updated_at: validIsoDate(evaluation.updatedAt),
      };
    })
    .filter(Boolean);

  const notebookDocuments = state.notebook_documents
    .map((document) => {
      if (!isObject(document) || !document.internalId) {
        warn('Skipped invalid notebook document.');
        return null;
      }

      const profileId = legacyProfileIds.get(document.internalId);

      if (!profileId) {
        warn(`Skipped notebook document for ${document.internalId}: profile not found.`);
        return null;
      }

      return {
        profile_id: profileId,
        content_html: String(document.contentHtml || ''),
        updated_at: validIsoDate(document.updatedAt) || now,
      };
    })
    .filter(Boolean);

  for (const trophy of state.admin_trophies) {
    if (!isObject(trophy) || !trophy.id) {
      warn('Skipped invalid admin trophy.');
      continue;
    }

    trophyDefinitionsById.set(trophy.id, {
      id: trophy.id,
      title: String(trophy.title || trophy.id),
      status: String(trophy.status || 'draft'),
      definition: trophy,
      created_by_profile_id: adminProfileId,
      created_at: validIsoDate(trophy.createdAt) || now,
      updated_at: validIsoDate(trophy.updatedAt) || now,
    });
  }

  const trophyAwards = [];

  for (const profile of state.internal_profiles) {
    if (!isObject(profile) || !profile.id) {
      continue;
    }

    const profileId = legacyProfileIds.get(profile.id);

    if (!profileId) {
      continue;
    }

    for (const badge of asArray(profile.achievementBadges)) {
      if (!isObject(badge) || !badge.id) {
        continue;
      }

      if (!trophyDefinitionsById.has(badge.id)) {
        const trophy = createBadgeTrophyDefinition(badge, now, adminProfileId);
        trophyDefinitionsById.set(trophy.id, trophy);
      }

      trophyAwards.push({
        id: uuidFromLegacyId(
          'trophy_award',
          `${profile.id}:${badge.id}:${badge.tier || 'single'}`
        ),
        trophy_id: badge.id,
        profile_id: profileId,
        tier: toNullableString(badge.tier),
        awarded_at: validIsoDate(badge.awardedAt) || now,
        source_intervention_id: null,
      });
    }
  }

  const activityLog = state.activity_log
    .map((entry) => {
      if (!isObject(entry) || !entry.id) {
        warn('Skipped invalid activity log entry.');
        return null;
      }

      return {
        id: uuidFromLegacyId('activity', entry.id),
        profile_id:
          entry.actorId && legacyProfileIds.has(entry.actorId)
            ? legacyProfileIds.get(entry.actorId)
            : null,
        actor_role: String(entry.actorRole || 'admin'),
        actor_label: String(entry.actorLabel || ''),
        action: String(entry.action || ''),
        target_type: String(entry.targetType || ''),
        target_label: String(entry.targetLabel || ''),
        created_at: validIsoDate(entry.createdAt) || now,
      };
    })
    .filter(Boolean);

  const legacyImports = APP_STATE_KEYS.map((key) => ({
    id: uuidFromLegacyId('legacy_import', key),
    source_key: key,
    source_row: {
      data: state[key],
      imported_by: 'scripts/import-legacy-app-state.mjs',
    },
    imported_at: applyChanges ? now : null,
    import_error: null,
    created_at: now,
  }));

  return {
    activityLog,
    evaluations,
    interventions,
    legacyImports,
    notebookDocuments,
    profiles,
    seniorAssignments,
    surgicalDefinitions: [...surgicalDefinitionsById.values()],
    trophyAwards,
    trophyDefinitions: [...trophyDefinitionsById.values()],
    warnings: migrationState.warnings,
  };
}

function addSurgicalDefinition(definitionMap, definition, now) {
  definitionMap.set(definition.id, {
    id: definition.id,
    name: String(definition.name || definition.id),
    status: String(definition.status || 'active'),
    definition,
    owner_profile_id: null,
    created_at: validIsoDate(definition.createdAt) || now,
    updated_at: validIsoDate(definition.updatedAt) || now,
    archived_at: validIsoDate(definition.archivedAt),
  });
}

function createPlaceholderSurgicalDefinition(procedureId, now) {
  return {
    id: procedureId,
    name: getProcedureFallbackName(procedureId),
    indications: [],
    allowedApproaches: [],
    allowedEntryTechniques: [],
    requiresLaterality: false,
    checklistSteps: [],
    keyStepIds: [],
    status: 'active',
    isCustom: String(procedureId).startsWith('custom-'),
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  };
}

function getProcedureFallbackName(procedureId) {
  if (procedureId === 'salpingectomie') {
    return 'Salpingectomie';
  }

  if (procedureId === 'colpoclesis') {
    return 'Colpoclesis';
  }

  return String(procedureId).replace(/^custom-/, '').replace(/[-_]+/g, ' ');
}

function createBadgeTrophyDefinition(badge, now, adminProfileId) {
  const definition = {
    id: badge.id,
    title: String(badge.title || badge.id),
    description: String(badge.criteria || ''),
    type: 'special',
    format: 'unique',
    status: 'active',
    visibility: 'visible',
    operativeScope: 'procedure',
    associatedProcedure: '',
    associatedApproach: '',
    associatedIndication: '',
    trackedRole: '',
    trackedInterventionStatus: 'recorded',
    conditions: [],
    levels: [],
    images: {
      single: badge.imageSrc || null,
      bronze: null,
      silver: null,
      gold: null,
      diamond: null,
    },
    createdAt: now,
    updatedAt: now,
  };

  return {
    id: badge.id,
    title: definition.title,
    status: 'active',
    definition,
    created_by_profile_id: adminProfileId,
    created_at: now,
    updated_at: now,
  };
}

function normalizeEvaluations(value) {
  if (Array.isArray(value)) {
    return value.filter(isObject);
  }

  if (isObject(value)) {
    return Object.values(value).filter(isObject);
  }

  return [];
}

async function applyMigrationPlan(plan) {
  await upsertRows('profiles', plan.profiles, 'id');
  await upsertRows(
    'senior_internal_assignments',
    plan.seniorAssignments,
    'senior_profile_id,internal_profile_id'
  );
  await upsertRows('surgical_intervention_definitions', plan.surgicalDefinitions, 'id');
  await upsertRows('interventions', plan.interventions, 'id');
  await upsertRows('intervention_evaluations', plan.evaluations, 'intervention_id');
  await upsertRows('notebook_documents', plan.notebookDocuments, 'profile_id');
  await upsertRows('trophy_definitions', plan.trophyDefinitions, 'id');
  await upsertRows('trophy_awards', plan.trophyAwards, 'id');
  await upsertRows('activity_log', plan.activityLog, 'id');
  await upsertRows('legacy_app_state_imports', plan.legacyImports, 'id');
}

async function upsertRows(tableName, rows, onConflict) {
  if (rows.length === 0) {
    console.log(`- ${tableName}: no rows`);
    return;
  }

  const chunks = chunk(rows, 100);
  let written = 0;

  for (const rowsChunk of chunks) {
    await supabaseRestRequest(tableName, {
      body: rowsChunk,
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      method: 'POST',
      searchParams: {
        on_conflict: onConflict,
      },
    });
    written += rowsChunk.length;
  }

  console.log(`- ${tableName}: ${written} rows upserted`);
}

function printPlan(plan) {
  console.log(`\nLegacy app_state import plan (${applyChanges ? 'apply' : 'dry-run'})`);
  console.log('------------------------------------------------------------');
  console.log(`profiles: ${plan.profiles.length}`);
  console.log(`senior_internal_assignments: ${plan.seniorAssignments.length}`);
  console.log(`surgical_intervention_definitions: ${plan.surgicalDefinitions.length}`);
  console.log(`interventions: ${plan.interventions.length}`);
  console.log(`intervention_evaluations: ${plan.evaluations.length}`);
  console.log(`notebook_documents: ${plan.notebookDocuments.length}`);
  console.log(`trophy_definitions: ${plan.trophyDefinitions.length}`);
  console.log(`trophy_awards: ${plan.trophyAwards.length}`);
  console.log(`activity_log: ${plan.activityLog.length}`);
  console.log(`legacy_app_state_imports: ${plan.legacyImports.length}`);

  if (plan.warnings.length > 0) {
    console.log('\nWarnings:');
    for (const warning of plan.warnings) {
      console.log(`- ${warning}`);
    }
  }
}

async function supabaseRestRequest(path, options = {}) {
  const searchParams = new URLSearchParams(options.searchParams || {});
  const queryString = searchParams.toString();
  const response = await fetch(
    `${supabaseUrl}/rest/v1/${path}${queryString ? `?${queryString}` : ''}`,
    {
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...options.headers,
      },
      method: options.method || 'GET',
    }
  );

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message =
      payload?.message ||
      payload?.error ||
      `Supabase request failed with status ${response.status}`;

    throw new Error(`${path}: ${message}`);
  }

  if (response.status === 204) {
    return null;
  }

  const text = await response.text();

  return text ? JSON.parse(text) : null;
}

function uuidFromLegacyId(kind, value) {
  const input = `${UUID_NAMESPACE}:${kind}:${value}`;
  const hash = createHash('sha1').update(input).digest();

  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;

  const hex = hash.toString('hex').slice(0, 32);

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

function normalizeCredentialValue(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function validIsoDate(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return null;
  }

  return Number.isNaN(Date.parse(value)) ? null : value;
}

function validDateOnly(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : null;
}

function toNullableString(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  return String(value);
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function chunk(values, size) {
  const chunks = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

function warn(message) {
  migrationState.warnings.push(message);
}
