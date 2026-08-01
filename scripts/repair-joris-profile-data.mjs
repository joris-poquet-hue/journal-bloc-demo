#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TARGET_LOGIN_ID = 'joris.poquet';
const SOURCE_LOGIN_ID = 'jorispoquet';
const EXPECTED_SOURCE_PROFILE_ID = 'int-1783000234560';
const EXCLUDED_LEGACY_INTERVENTION_IDS = new Set(['1782902832044']);
const EXCLUDED_DURABLE_INTERVENTION_IDS = new Set([
  '361041b0-0a14-5bac-893b-36ad8a27f288',
]);
const APP_STATE_KEYS = [
  'internal_profiles',
  'saved_interventions',
  'custom_surgical_interventions',
  'custom_seniors',
  'admin_trophies',
  'admin_evaluations',
  'activity_log',
];
const DEFAULT_ENV_FILES = ['.env.local', '.env.production.local', '.env'];
const UUID_NAMESPACE = 'a538964a-c840-4385-852d-4a09b7fb55f4';

const args = new Set(process.argv.slice(2));
const applyChanges = args.has('--apply');
const explicitEnvFile = process.argv
  .slice(2)
  .find((argument) => argument.startsWith('--env-file='))
  ?.split('=')
  .slice(1)
  .join('=');

if (args.has('--help') || args.has('-h')) {
  console.log(`
Usage:
  node scripts/repair-joris-profile-data.mjs
  node scripts/repair-joris-profile-data.mjs --apply

Options:
  --apply              Apply the repair. Without it, the script is read-only.
  --env-file=<path>    Load Supabase credentials from this file.
`);
  process.exit(0);
}

loadEnv(explicitEnvFile);

const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
}

const state = await loadLegacyState();
const currentProfiles = await request('profiles', {
  searchParams: {
    select: '*',
  },
});
const targetProfile = currentProfiles.find(
  (profile) => normalizeLogin(profile.login_id) === normalizeLogin(TARGET_LOGIN_ID)
);
const sourceProfile = state.internal_profiles.find(
  (profile) => normalizeLogin(profile?.loginId) === normalizeLogin(SOURCE_LOGIN_ID)
);

assert(targetProfile, `Durable profile ${TARGET_LOGIN_ID} not found.`);
assert(targetProfile.role === 'internal', 'Target durable profile is not an internal.');
assert(sourceProfile, `Legacy profile ${SOURCE_LOGIN_ID} not found.`);
assert(
  sourceProfile.id === EXPECTED_SOURCE_PROFILE_ID,
  `Unexpected source profile id: ${sourceProfile.id}`
);
assert(
  typeof sourceProfile.avatarImageSrc === 'string' &&
    sourceProfile.avatarImageSrc.startsWith('data:image/'),
  'Legacy profile avatar is missing or invalid.'
);

const adminProfile = currentProfiles.find((profile) => profile.role === 'admin');
assert(adminProfile, 'Durable admin profile not found.');

const sourceInterventions = state.saved_interventions.filter(
  (intervention) =>
    intervention?.internalId === sourceProfile.id &&
    !EXCLUDED_LEGACY_INTERVENTION_IDS.has(String(intervention.id))
);

assert(sourceInterventions.length === 6, `Expected 6 interventions, found ${sourceInterventions.length}.`);
assert(
  !sourceInterventions.some((intervention) => intervention.date === '2026-07-01'),
  'A 1 July 2026 intervention unexpectedly exists in the source profile.'
);

const sourceProcedureIds = new Set(
  sourceInterventions.map((intervention) => String(intervention.procedure))
);
const surgicalDefinitions = state.custom_surgical_interventions
  .filter((definition) => sourceProcedureIds.has(String(definition?.id)))
  .map(toSurgicalDefinitionRow);

assert(
  surgicalDefinitions.length === sourceProcedureIds.size,
  'At least one procedure definition referenced by the interventions is missing.'
);

const sourceSeniorIds = new Set(
  sourceInterventions
    .map((intervention) => intervention.seniorId)
    .filter(Boolean)
);
const sourceSeniors = state.custom_seniors.filter((senior) =>
  sourceSeniorIds.has(senior?.id)
);
const seniorRows = sourceSeniors.map((senior) => {
  const existingProfile = currentProfiles.find(
    (profile) =>
      normalizeLogin(profile.login_id) === normalizeLogin(senior.loginId) ||
      profile.metadata?.legacy_id === senior.id
  );

  return {
    id: existingProfile?.id || uuidFromLegacyId('profile', senior.id),
    auth_user_id: existingProfile?.auth_user_id ?? null,
    role: 'senior',
    first_name: String(senior.firstName || '').trim(),
    last_name: String(senior.lastName || '').trim(),
    login_id: String(senior.loginId || '').trim(),
    promotion: null,
    semester: null,
    avatar_image_src: existingProfile?.avatar_image_src ?? null,
    must_change_password: existingProfile?.must_change_password ?? true,
    metadata: {
      ...(isObject(existingProfile?.metadata) ? existingProfile.metadata : {}),
      legacy_id: senior.id,
      repaired_from_legacy_at: new Date().toISOString(),
    },
    created_at: validIsoDate(senior.createdAt) || existingProfile?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    last_login_at: validIsoDate(senior.lastLoginAt) || existingProfile?.last_login_at || null,
  };
});
const seniorIdMap = new Map(
  sourceSeniors.map((senior, index) => [senior.id, seniorRows[index].id])
);

const interventionRows = sourceInterventions.map((intervention) => {
  const id = uuidFromLegacyId('intervention', intervention.id);
  assert(!EXCLUDED_DURABLE_INTERVENTION_IDS.has(id), `Excluded intervention ${id} would be restored.`);

  return {
    id,
    internal_profile_id: targetProfile.id,
    senior_profile_id: seniorIdMap.get(intervention.seniorId) ?? null,
    procedure_id: String(intervention.procedure),
    intervention_date:
      validDateOnly(intervention.date) ||
      validDateOnly(String(intervention.savedAt || '').slice(0, 10)),
    indication: nullableString(intervention.indication),
    indication_comment: String(intervention.indicationComment || ''),
    custom_indication: nullableString(intervention.customIndication),
    approach: nullableString(intervention.approach),
    entry_technique: nullableString(intervention.entryTechnique),
    laterality: nullableString(intervention.laterality),
    surgery_context: nullableString(intervention.context),
    complexity: nullableNumber(intervention.complexity),
    role: nullableString(intervention.role),
    checklist: isObject(intervention.checklist) ? intervention.checklist : {},
    autonomy_score: nullableNumber(intervention.autonomyScore),
    saved_at: validIsoDate(intervention.savedAt) || new Date().toISOString(),
    created_by_profile_id: targetProfile.id,
    updated_at: new Date().toISOString(),
    deleted_at: null,
    client_mutation_id: `legacy:${intervention.id}`,
  };
});

const interventionIdMap = new Map(
  sourceInterventions.map((intervention, index) => [intervention.id, interventionRows[index].id])
);
const evaluations = normalizeEvaluations(state.admin_evaluations)
  .filter((evaluation) => interventionIdMap.has(evaluation.interventionId))
  .map((evaluation) => {
    const intervention = sourceInterventions.find(
      (candidate) => candidate.id === evaluation.interventionId
    );

    return {
      intervention_id: interventionIdMap.get(evaluation.interventionId),
      senior_profile_id: seniorIdMap.get(intervention?.seniorId) ?? null,
      global_performance: nullableString(evaluation.globalPerformance),
      category_difficulty: nullableString(evaluation.categoryDifficulty),
      senior_comment: String(evaluation.seniorComment || ''),
      created_at: validIsoDate(evaluation.updatedAt) || new Date().toISOString(),
      updated_at: validIsoDate(evaluation.updatedAt) || new Date().toISOString(),
    };
  });

assert(evaluations.length === 5, `Expected 5 evaluations, found ${evaluations.length}.`);

const trophyDefinitions = state.admin_trophies.map((trophy) => ({
  id: String(trophy.id),
  title: String(trophy.title || trophy.id),
  status: String(trophy.status || 'draft'),
  definition: trophy,
  created_by_profile_id: adminProfile.id,
  created_at: validIsoDate(trophy.createdAt) || new Date().toISOString(),
  updated_at: validIsoDate(trophy.updatedAt) || new Date().toISOString(),
}));

assert(trophyDefinitions.length === 3, `Expected 3 trophy definitions, found ${trophyDefinitions.length}.`);

const assignments = sourceSeniors
  .filter((senior) => senior.managedInternalIds?.includes(sourceProfile.id))
  .map((senior) => ({
    senior_profile_id: seniorIdMap.get(senior.id),
    internal_profile_id: targetProfile.id,
    created_at: new Date().toISOString(),
  }));

const sourceActivityRows = state.activity_log
  .filter((entry) => entry?.actorId === sourceProfile.id && entry.id)
  .map((entry) => ({
    id: uuidFromLegacyId('activity', entry.id),
    profile_id: targetProfile.id,
    actor_role: normalizeRole(entry.actorRole),
    actor_label: String(entry.actorLabel || `${sourceProfile.firstName} ${sourceProfile.lastName}`).trim(),
    action: String(entry.action || ''),
    target_type: String(entry.targetType || ''),
    target_label: String(entry.targetLabel || ''),
    created_at: validIsoDate(entry.createdAt) || new Date().toISOString(),
  }));

const currentMetadata = isObject(targetProfile.metadata) ? targetProfile.metadata : {};
const previousLegacyId = nullableString(currentMetadata.legacy_id);
const repairedMetadata = {
  ...currentMetadata,
  achievement_badges: Array.isArray(sourceProfile.achievementBadges)
    ? sourceProfile.achievementBadges
    : [],
  badge_metrics: isObject(sourceProfile.badgeMetrics) ? sourceProfile.badgeMetrics : {},
  baseline_stats: isObject(sourceProfile.baselineStats) ? sourceProfile.baselineStats : {},
  legacy_aliases: [...new Set([previousLegacyId, sourceProfile.id].filter(Boolean))],
  legacy_id: sourceProfile.id,
  repaired_from_legacy_at: new Date().toISOString(),
};

printPlan({
  activityLog: sourceActivityRows,
  assignments,
  evaluations,
  interventionRows,
  seniorRows,
  surgicalDefinitions,
  sourceProfile,
  targetProfile,
  trophyDefinitions,
});

if (!applyChanges) {
  console.log('\nDry-run only. Re-run with --apply to write the repair.');
  process.exit(0);
}

await patchRows(
  'profiles',
  { id: `eq.${targetProfile.id}` },
  {
    avatar_image_src: sourceProfile.avatarImageSrc,
    metadata: repairedMetadata,
    updated_at: new Date().toISOString(),
  }
);
await upsertRows('profiles', seniorRows, 'id');
await upsertRows(
  'senior_internal_assignments',
  assignments,
  'senior_profile_id,internal_profile_id'
);
await upsertRows('surgical_intervention_definitions', surgicalDefinitions, 'id');
await upsertRows('trophy_definitions', trophyDefinitions, 'id');
await upsertRows('interventions', interventionRows, 'id');
await upsertRows('intervention_evaluations', evaluations, 'intervention_id');
await upsertRows('activity_log', sourceActivityRows, 'id');

await verifyRepair(targetProfile.id, interventionRows.map((row) => row.id));

async function loadLegacyState() {
  const rows = await request('app_state', {
    searchParams: { select: 'key,data' },
  });
  const byKey = new Map(rows.map((row) => [row.key, row.data]));

  return Object.fromEntries(
    APP_STATE_KEYS.map((key) => {
      const value = byKey.get(key);
      return [key, Array.isArray(value) || isObject(value) ? value : []];
    })
  );
}

function toSurgicalDefinitionRow(definition) {
  return {
    id: String(definition.id),
    name: String(definition.name || definition.id),
    status: String(definition.status || 'active'),
    definition,
    owner_profile_id: null,
    created_at: validIsoDate(definition.createdAt) || new Date().toISOString(),
    updated_at: validIsoDate(definition.updatedAt) || new Date().toISOString(),
    archived_at: validIsoDate(definition.archivedAt),
  };
}

async function verifyRepair(profileId, expectedInterventionIds) {
  const [profiles, interventions, trophies, evaluations] = await Promise.all([
    request('profiles', {
      searchParams: {
        id: `eq.${profileId}`,
        select: 'id,avatar_image_src,metadata',
      },
    }),
    request('interventions', {
      searchParams: {
        internal_profile_id: `eq.${profileId}`,
        deleted_at: 'is.null',
        select: 'id,intervention_date,procedure_id,senior_profile_id',
        order: 'intervention_date.desc',
      },
    }),
    request('trophy_definitions', {
      searchParams: { select: 'id,status' },
    }),
    request('intervention_evaluations', {
      searchParams: {
        intervention_id: `in.(${expectedInterventionIds.join(',')})`,
        select: 'intervention_id',
      },
    }),
  ]);

  const activeInterventionIds = new Set(interventions.map((row) => row.id));
  assert(profiles[0]?.avatar_image_src?.startsWith('data:image/'), 'Avatar verification failed.');
  assert(
    expectedInterventionIds.every((id) => activeInterventionIds.has(id)),
    'At least one repaired intervention is missing.'
  );
  assert(
    !activeInterventionIds.has('361041b0-0a14-5bac-893b-36ad8a27f288'),
    'The deleted 1 July intervention was unexpectedly restored.'
  );
  assert(trophies.length >= 3, 'Trophy definition verification failed.');
  assert(evaluations.length === 5, 'Evaluation verification failed.');

  console.log('\nVerification passed:');
  console.log(`- profile avatar: restored (${profiles[0].avatar_image_src.length} bytes)`);
  console.log(`- active interventions for profile: ${interventions.length}`);
  console.log('- deleted 1 July intervention: absent');
  console.log(`- repaired evaluations: ${evaluations.length}`);
  console.log(`- trophy definitions: ${trophies.length}`);
}

async function patchRows(tableName, filters, body) {
  await request(tableName, {
    body,
    headers: { Prefer: 'return=minimal' },
    method: 'PATCH',
    searchParams: filters,
  });
  console.log(`- ${tableName}: target row updated`);
}

async function upsertRows(tableName, rows, onConflict) {
  if (rows.length === 0) {
    console.log(`- ${tableName}: no rows`);
    return;
  }

  for (let index = 0; index < rows.length; index += 100) {
    await request(tableName, {
      body: rows.slice(index, index + 100),
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      method: 'POST',
      searchParams: { on_conflict: onConflict },
    });
  }

  console.log(`- ${tableName}: ${rows.length} rows upserted`);
}

async function request(path, options = {}) {
  const searchParams = new URLSearchParams(options.searchParams || {});
  const response = await fetch(
    `${supabaseUrl}/rest/v1/${path}${searchParams.size ? `?${searchParams}` : ''}`,
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
    const payload = await response.text();
    throw new Error(`${path}: ${response.status} ${payload}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function printPlan(plan) {
  console.log(`\nJoris profile repair (${applyChanges ? 'apply' : 'dry-run'})`);
  console.log('------------------------------------------------------------');
  console.log(`target durable profile: ${plan.targetProfile.id} (${TARGET_LOGIN_ID})`);
  console.log(`source legacy profile: ${plan.sourceProfile.id} (${SOURCE_LOGIN_ID})`);
  console.log(`avatar bytes: ${plan.sourceProfile.avatarImageSrc.length}`);
  console.log(`senior profiles: ${plan.seniorRows.length}`);
  console.log(`senior assignments: ${plan.assignments.length}`);
  console.log(`procedure definitions: ${plan.surgicalDefinitions.length}`);
  console.log(`interventions: ${plan.interventionRows.length}`);
  console.log(`evaluations: ${plan.evaluations.length}`);
  console.log(`trophy definitions: ${plan.trophyDefinitions.length}`);
  console.log(`profile activity rows: ${plan.activityLog.length}`);
  console.log('excluded intervention 2026-07-01: yes');
}

function loadEnv(envFile) {
  const selectedFile = (envFile ? [envFile] : DEFAULT_ENV_FILES)
    .map((filePath) => resolve(process.cwd(), filePath))
    .find(existsSync);

  if (!selectedFile) return;

  for (const line of readFileSync(selectedFile, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    if (!key || process.env[key] != null) continue;
    process.env[key] = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
}

function uuidFromLegacyId(kind, value) {
  const hash = createHash('sha1')
    .update(`${UUID_NAMESPACE}:${kind}:${value}`)
    .digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString('hex').slice(0, 32);
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}

function normalizeEvaluations(value) {
  if (Array.isArray(value)) return value.filter(isObject);
  if (isObject(value)) return Object.values(value).filter(isObject);
  return [];
}

function normalizeLogin(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeRole(value) {
  return ['internal', 'senior', 'admin'].includes(value) ? value : 'internal';
}

function nullableString(value) {
  return value == null || value === '' ? null : String(value);
}

function nullableNumber(value) {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function validIsoDate(value) {
  return typeof value === 'string' && value && !Number.isNaN(Date.parse(value))
    ? value
    : null;
}

function validDateOnly(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? value
    : null;
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
