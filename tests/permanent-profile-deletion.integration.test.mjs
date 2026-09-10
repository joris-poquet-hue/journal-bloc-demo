import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';

import pg from 'pg';

const allowRestoreDrillTests = process.env.PROJECT1_RESTORE_DRILL === '1';
const connectionString =
  process.env.SUPABASE_TEST_POSTGRES_URL ||
  (allowRestoreDrillTests
    ? process.env.SUPABASE_POSTGRES_URL_NON_POOLING
    : undefined);
const requireTestDatabase = process.env.REQUIRE_SUPABASE_TEST_DB === '1';
const migrationDirectory = new URL('../supabase/migrations/', import.meta.url);
const migrationFiles = readdirSync(migrationDirectory)
  .filter((fileName) => fileName.endsWith('.sql'))
  .sort((left, right) => left.localeCompare(right));

if (requireTestDatabase && !connectionString) {
  throw new Error(
    'SUPABASE_TEST_POSTGRES_URL est requis pour les tests d’intégration Supabase.'
  );
}

if (
  connectionString &&
  !allowRestoreDrillTests &&
  [
    process.env.SUPABASE_POSTGRES_URL_NON_POOLING,
    process.env.SUPABASE_POSTGRES_URL,
  ]
    .filter(Boolean)
    .some((productionUrl) =>
      databaseUrlsMatch(connectionString, productionUrl)
    )
) {
  throw new Error(
    'Le test de suppression définitive refuse toute URL identique à la production.'
  );
}

if (connectionString && allowRestoreDrillTests) {
  const testProjectRef = process.env.SUPABASE_TEST_PROJECT_REF?.trim();
  const databaseUrl = new URL(connectionString);
  const connectionIdentifiesTestProject = Boolean(
    testProjectRef &&
      (databaseUrl.hostname.includes(testProjectRef) ||
        decodeURIComponent(databaseUrl.username)
          .split('.')
          .includes(testProjectRef))
  );

  if (!connectionIdentifiesTestProject) {
    throw new Error(
      'Le test de restauration exige un SUPABASE_TEST_PROJECT_REF correspondant à la base isolée.'
    );
  }
}

test(
  'suppression définitive transactionnelle d’un profil désactivé et de ses données liées',
  { skip: !connectionString },
  async () => {
    const databaseUrl = new URL(connectionString);
    const isLocalDatabase = ['127.0.0.1', '::1', 'localhost'].includes(
      databaseUrl.hostname
    );

    if (
      !isLocalDatabase &&
      process.env.ALLOW_REMOTE_SUPABASE_TESTS !== '1'
    ) {
      throw new Error(
        'Les tests distants sont bloqués. Utilisez une base locale ou définissez explicitement ALLOW_REMOTE_SUPABASE_TESTS=1 pour la base isolée.'
      );
    }

    const client = new pg.Client({
      connectionString: isLocalDatabase
        ? connectionString
        : stripSslMode(connectionString),
      ssl: isLocalDatabase ? false : { rejectUnauthorized: false },
    });
    const fixture = createFixture();

    await client.connect();
    await client.query('begin');

    try {
      await applyMissingMigrations(client);
      await clearRequestContext(client);
      await createDeletionFixture(client, fixture);

      await expectDatabaseError(client, '55000', () =>
        client.query(
          `select public.prepare_disabled_profile_deletion(
             $1::uuid, $2::bigint, $3::uuid, $4::text
           )`,
          [
            fixture.target.profileId,
            1,
            fixture.admin.profileId,
            fixture.target.loginId,
          ]
        )
      );

      await expectDatabaseError(client, '42501', () =>
        client.query(
          `select public.prepare_disabled_profile_deletion(
             $1::uuid, $2::bigint, $1::uuid, $3::text
           )`,
          [
            fixture.admin.profileId,
            1,
            fixture.admin.loginId,
          ]
        )
      );

      const targetVersion = await readProfileVersion(
        client,
        fixture.target.profileId
      );
      await setServiceRoleContext(client);
      const deactivatedProfile = await client.query(
        `select saved_profile.is_active
         from public.set_profile_account_lifecycle(
           $1::uuid, $2::bigint, false, $3::uuid
         ) saved_profile`,
        [
          fixture.target.profileId,
          targetVersion,
          fixture.admin.profileId,
        ]
      );
      assert.equal(deactivatedProfile.rows[0].is_active, false);
      await clearRequestContext(client);

      const deactivatedVersion = await readProfileVersion(
        client,
        fixture.target.profileId
      );

      await expectDatabaseError(client, '22023', () =>
        client.query(
          `select public.prepare_disabled_profile_deletion(
             $1::uuid, $2::bigint, $3::uuid, $4::text
           )`,
          [
            fixture.target.profileId,
            deactivatedVersion,
            fixture.admin.profileId,
            fixture.target.loginId.toUpperCase(),
          ]
        )
      );

      const preparedResult = await client.query(
        `select public.prepare_disabled_profile_deletion(
           $1::uuid, $2::bigint, $3::uuid, $4::text
         ) as result`,
        [
          fixture.target.profileId,
          deactivatedVersion,
          fixture.admin.profileId,
          fixture.target.loginId,
        ]
      );
      const prepared = preparedResult.rows[0].result;

      assert.equal(prepared.profileId, fixture.target.profileId);
      assert.equal(prepared.authUserId, fixture.target.authUserId);
      assert.equal(prepared.authIdentityExists, true);
      assert.ok(prepared.deletionRequestId);

      const detachedTarget = await client.query(
        `select auth_user_id, is_active
         from public.profiles
         where id = $1`,
        [fixture.target.profileId]
      );
      assert.equal(detachedTarget.rows[0].auth_user_id, null);
      assert.equal(detachedTarget.rows[0].is_active, false);

      await clearSagaFlags(client);
      await expectDatabaseError(client, '55000', () =>
        client.query(
          `update public.profiles
           set first_name = 'Mutation concurrente interdite'
           where id = $1`,
          [fixture.target.profileId]
        )
      );

      await expectDatabaseError(client, '55000', () =>
        client.query(
          `select public.finalize_disabled_profile_deletion(
             $1::uuid, $2::uuid
           )`,
          [prepared.deletionRequestId, fixture.admin.profileId]
        )
      );

      await client.query('delete from auth.users where id = $1', [
        fixture.target.authUserId,
      ]);

      const finalizedResult = await client.query(
        `select public.finalize_disabled_profile_deletion(
           $1::uuid, $2::uuid
         ) as result`,
        [prepared.deletionRequestId, fixture.admin.profileId]
      );
      const finalized = finalizedResult.rows[0].result;

      assert.equal(finalized.deleted, true);
      assert.equal(finalized.deletedProfileId, fixture.target.profileId);

      await verifyDeletedIdentityAndDirectData(client, fixture);
      await verifySharedClinicalDeletion(client, fixture);
      await verifySharedDataPreservedAndAnonymized(client, fixture);
      await verifyNotificationsAndTrophies(client, fixture);
      await verifyActivityTargetForeignKey(client, fixture.target.profileId);
      await verifyNoResidualProfileForeignKeys(client, fixture.target.profileId);
    } finally {
      await client.query('reset role').catch(() => {});
      await client.query('rollback').catch(() => {});
      await client.end();
    }
  }
);

function createFixture() {
  const suffix = randomUUID();
  const institution = {
    id: randomUUID(),
    name: `Établissement suppression ${suffix}`,
  };

  return {
    admin: createProfile('admin', null, 'Alice', `Admin-${suffix}`),
    affectedInternal: createProfile(
      'internal',
      institution,
      'Inès',
      `Affectée-${suffix}`
    ),
    affectedInterventionId: randomUUID(),
    institution,
    formulaId: randomUUID(),
    keptLegacyGestureId: `legacy-gesture-kept-${suffix}`,
    procedureId: `custom-deletion-${suffix}`,
    sharedMessageId: randomUUID(),
    sharedMessageNotificationId: randomUUID(),
    survivorInternal: createProfile(
      'internal',
      institution,
      'Sofia',
      `Conservée-${suffix}`
    ),
    survivorInterventionId: randomUUID(),
    survivorSenior: createProfile(
      'senior',
      institution,
      'Samir',
      `Conservé-${suffix}`
    ),
    target: createProfile(
      'senior',
      institution,
      'Sarah',
      `Supprimée-${suffix}`
    ),
    targetLegacyId: `legacy-target-${suffix}`,
    targetActivityId: randomUUID(),
    targetedMessageId: randomUUID(),
    targetedMessageNotificationId: randomUUID(),
    trophyId: `trophy-deletion-${suffix}`,
    unrelatedActivityId: randomUUID(),
  };
}

function createProfile(role, institution, firstName, lastName) {
  const profileId = randomUUID();

  return {
    authUserId: randomUUID(),
    firstName,
    institution: institution?.name ?? null,
    institutionId: institution?.id ?? null,
    lastName,
    loginId: `suppression-${role}-${profileId}`,
    profileId,
    role,
  };
}

async function applyMissingMigrations(client) {
  await client.query(`
    create table if not exists public.app_schema_migrations (
      migration_name text primary key,
      applied_at timestamptz not null default now()
    )
  `);
  await client.query(
    'alter table public.app_schema_migrations enable row level security'
  );

  const appliedRows = await client.query(
    'select migration_name from public.app_schema_migrations'
  );
  const appliedNames = new Set(
    appliedRows.rows.map((row) => row.migration_name)
  );

  for (const fileName of migrationFiles) {
    const migrationName = `supabase/migrations/${fileName}`;

    if (appliedNames.has(migrationName)) {
      continue;
    }

    const migrationSql = stripTopLevelTransactionStatements(
      readFileSync(new URL(fileName, migrationDirectory), 'utf8')
    );
    await client.query(migrationSql);
    await client.query(
      `insert into public.app_schema_migrations (migration_name)
       values ($1)`,
      [migrationName]
    );
    appliedNames.add(migrationName);
  }
}

async function createDeletionFixture(client, fixture) {
  await client.query(
    `insert into public.institutions (id, name)
     values ($1, $2)`,
    [fixture.institution.id, fixture.institution.name]
  );

  for (const profile of [
    fixture.admin,
    fixture.target,
    fixture.affectedInternal,
    fixture.survivorInternal,
    fixture.survivorSenior,
  ]) {
    const profileMetadata =
      profile.profileId === fixture.target.profileId
        ? { legacy_id: fixture.targetLegacyId }
        : profile.profileId === fixture.survivorInternal.profileId
          ? {
              accountLifecycle: {
                deactivatedByProfileId: fixture.target.profileId,
                reactivatedByProfileId: fixture.target.profileId,
                status: 'active',
              },
            }
          : {};

    await client.query(
      `insert into auth.users (
         id, aud, role, raw_app_meta_data, created_at, updated_at
       ) values (
         $1, 'authenticated', 'authenticated',
         '{"pending_activation":false}'::jsonb, now(), now()
       )`,
      [profile.authUserId]
    );
    await client.query(
      `insert into public.profiles (
         id,
         auth_user_id,
         role,
         first_name,
         last_name,
         login_id,
         institution,
         institution_id,
         must_change_password,
         is_active,
         metadata,
         updated_by_profile_id
       ) values (
         $1,
         $2,
         $3::public.app_role,
         $4,
         $5,
         $6,
         $7,
         $8,
         false,
         true,
         $9::jsonb,
         $10
       )`,
      [
        profile.profileId,
        profile.authUserId,
        profile.role,
        profile.firstName,
        profile.lastName,
        profile.loginId,
        profile.institution,
        profile.institutionId,
        JSON.stringify(profileMetadata),
        profile.profileId === fixture.survivorInternal.profileId
          ? fixture.target.profileId
          : null,
      ]
    );
  }

  await client.query(
    `update public.institutions
     set
       created_by_profile_id = $1,
       updated_by_profile_id = $1
     where id = $2`,
    [fixture.target.profileId, fixture.institution.id]
  );

  const procedureDefinition = {
    allowedApproaches: ['voie_vaginale'],
    allowedEntryTechniques: [],
    audit: {
      createdByProfileId: fixture.target.profileId,
      nested: { updated_by_profile_id: fixture.target.profileId },
    },
    checklistSteps: [{ id: 'step-1', label: 'Étape de test' }],
    indications: ['Cas synthétique'],
    keyStepIds: ['step-1'],
    name: 'Intervention de suppression',
    ownerProfileId: fixture.target.profileId,
    requiresLaterality: false,
    status: 'active',
  };
  await client.query(
    `insert into public.surgical_intervention_definitions (
       id,
       name,
       status,
       definition,
       owner_profile_id,
       updated_by_profile_id
     ) values ($1, $2, 'active', $3::jsonb, $4, $4)`,
    [
      fixture.procedureId,
      'Intervention de suppression',
      JSON.stringify(procedureDefinition),
      fixture.target.profileId,
    ]
  );

  const trophyDefinition = {
    audit: {
      created_by_profile_id: fixture.target.profileId,
      ownerProfileId: fixture.target.profileId,
    },
    conditions: [{ type: 'first_recorded' }],
    format: 'unique',
    id: fixture.trophyId,
    images: { single: '/images/test-trophy.png' },
    status: 'active',
    title: 'Première intervention de suppression',
    visibility: 'visible',
  };
  await client.query(
    `insert into public.trophy_definitions (
       id,
       title,
       status,
       definition,
       created_by_profile_id,
       updated_by_profile_id
     ) values ($1, $2, 'active', $3::jsonb, $4, $4)`,
    [
      fixture.trophyId,
      trophyDefinition.title,
      JSON.stringify(trophyDefinition),
      fixture.target.profileId,
    ]
  );
  await client.query(
    `insert into public.trophy_definition_versions (
       trophy_id,
       definition_version,
       definition,
       publication_status,
       published_by_profile_id
     ) values ($1, 1, $2::jsonb, 'published', $3)`,
    [
      fixture.trophyId,
      JSON.stringify(trophyDefinition),
      fixture.target.profileId,
    ]
  );
  await client.query(
    `insert into public.trophy_definition_drafts (
       trophy_id,
       definition,
       base_version,
       created_by_profile_id,
       updated_by_profile_id
     ) values ($1, $2::jsonb, 1, $3, $3)`,
    [
      fixture.trophyId,
      JSON.stringify({
        ...trophyDefinition,
        status: 'draft',
        updatedByProfileId: fixture.target.profileId,
      }),
      fixture.target.profileId,
    ]
  );

  await client.query(
    `insert into public.autonomy_score_formulas (
       id,
       formula_version,
       status,
       definition,
       published_at,
       retired_at,
       created_by_profile_id,
       updated_by_profile_id
     )
     select
       $1,
       coalesce(max(formula_version), 0) + 1,
       'retired',
       $2::jsonb,
       now() - interval '1 day',
       now(),
       $3,
       $3
     from public.autonomy_score_formulas`,
    [
      fixture.formulaId,
      JSON.stringify({
        audit: { publishedByProfileId: fixture.target.profileId },
        schemaVersion: 1,
      }),
      fixture.target.profileId,
    ]
  );

  await insertClinicalGraph(client, {
    createdByProfileId: fixture.affectedInternal.profileId,
    internalProfile: fixture.affectedInternal,
    interventionId: fixture.affectedInterventionId,
    procedureDefinition,
    procedureId: fixture.procedureId,
    seniorProfile: fixture.target,
    snapshotAuditProfileId: fixture.target.profileId,
  });
  await insertClinicalGraph(client, {
    createdByProfileId: fixture.survivorInternal.profileId,
    internalProfile: fixture.survivorInternal,
    interventionId: fixture.survivorInterventionId,
    procedureDefinition,
    procedureId: fixture.procedureId,
    seniorProfile: fixture.survivorSenior,
    snapshotAuditProfileId: fixture.target.profileId,
  });

  const affectedAward = await client.query(
    `select id, source_intervention_id
     from public.trophy_awards
     where trophy_id = $1
       and profile_id = $2
       and tier = 'bronze'`,
    [fixture.trophyId, fixture.affectedInternal.profileId]
  );
  assert.equal(
    affectedAward.rowCount,
    1,
    'le trophée de l’Interne affecté doit exister avant la suppression'
  );
  assert.equal(
    affectedAward.rows[0].source_intervention_id,
    fixture.affectedInterventionId
  );

  await client.query(
    `insert into public.notebook_documents (
       profile_id, content_html, updated_by_profile_id
     ) values ($1, '<p>Donnée personnelle à supprimer</p>', $1)`,
    [fixture.target.profileId]
  );
  await client.query(
    `insert into public.senior_internal_assignments (
       senior_profile_id,
       internal_profile_id,
       created_by_profile_id,
       updated_by_profile_id
     ) values ($1, $2, $1, $1)`,
    [fixture.target.profileId, fixture.affectedInternal.profileId]
  );
  await client.query(
    `insert into public.application_sessions (
       profile_id,
       auth_user_id,
       token_hash,
       client_kind,
       idle_timeout_seconds
     ) values ($1, $2, $3, 'web', 1800)`,
    [
      fixture.target.profileId,
      fixture.target.authUserId,
      createHash('sha256')
        .update(`permanent-deletion:${fixture.target.profileId}`)
        .digest('hex'),
    ]
  );
  await client.query(
    `insert into public.push_subscriptions (
       profile_id, expo_push_token, device_id, platform
     ) values ($1, $2, $3, 'ios')`,
    [
      fixture.target.profileId,
      `ExponentPushToken[${randomUUID()}]`,
      `deletion-device-${randomUUID()}`,
    ]
  );
  await client.query(
    `insert into public.test_feedback (
       author_profile_id,
       profile_id,
       author_role,
       author_label,
       message,
       updated_by_profile_id
     ) values ($1, $1, 'senior'::public.app_role, $2, $3, $1)`,
    [
      fixture.target.profileId,
      `${fixture.target.firstName} ${fixture.target.lastName}`,
      'Trace personnelle synthétique',
    ]
  );

  await createMessagesAndNotifications(client, fixture);
  await createActivityFixture(client, fixture);
  await createLegacyAppStateFixture(client, fixture);
  await clearRequestContext(client);
}

async function createLegacyAppStateFixture(client, fixture) {
  await client.query(`
    create table if not exists public.app_state (
      key text primary key,
      data jsonb not null default '[]'::jsonb,
      updated_at timestamptz not null default now()
    )
  `);

  await client.query(
    `insert into public.app_state (key, data)
     values
       ('saved_obstetric_gestures', $1::jsonb),
       ('custom_surgical_interventions', $2::jsonb)
     on conflict (key) do update
     set data = excluded.data, updated_at = now()`,
    [
      JSON.stringify([
        {
          id: `legacy-gesture-internal-${fixture.targetLegacyId}`,
          internalId: fixture.targetLegacyId,
          label: 'Geste obstétrical Interne à supprimer',
        },
        {
          id: `legacy-gesture-senior-${fixture.targetLegacyId}`,
          label: 'Geste obstétrical Senior à supprimer',
          seniorId: fixture.targetLegacyId,
        },
        {
          id: fixture.keptLegacyGestureId,
          internalId: `legacy-${fixture.affectedInternal.profileId}`,
          label: 'Geste obstétrical témoin',
          seniorId: `legacy-${fixture.survivorSenior.profileId}`,
        },
      ]),
      JSON.stringify([
        {
          audit: { ownerProfileId: fixture.target.profileId },
          id: `legacy-catalogue-${fixture.procedureId}`,
          label: 'Référentiel historique conservé',
        },
      ]),
    ]
  );
}

async function insertClinicalGraph(
  client,
  {
    createdByProfileId,
    internalProfile,
    interventionId,
    procedureDefinition,
    procedureId,
    seniorProfile,
    snapshotAuditProfileId,
  }
) {
  const snapshot = {
    ...procedureDefinition,
    audit: {
      createdByProfileId: snapshotAuditProfileId,
      nested: { updated_by_profile_id: snapshotAuditProfileId },
    },
    ownerProfileId: snapshotAuditProfileId,
  };
  const contextVariables = {
    history: {},
    intraoperative: {},
    patient: {},
    schemaVersion: 2,
  };

  await clearRequestContext(client);
  await client.query(
    `insert into public.interventions (
       id,
       internal_profile_id,
       senior_profile_id,
       procedure_id,
       intervention_date,
       intervention_start_time,
       operative_duration_minutes,
       custom_indication,
       approach,
       surgery_context,
       complexity,
       role,
       checklist,
       context_variables,
       definition_snapshot,
       definition_snapshot_schema_version,
       definition_version,
       created_by_profile_id,
       updated_by_profile_id
     ) values (
       $1, $2, $3, $4, current_date, '08:30', 75,
       'Cas synthétique', 'voie_vaginale', 'programme', 5,
       'operateur_principal', '{"step-1":"4"}'::jsonb, $5::jsonb,
       $6::jsonb, 1, 1, $7, $8
     )`,
    [
      interventionId,
      internalProfile.profileId,
      seniorProfile.profileId,
      procedureId,
      JSON.stringify(contextVariables),
      JSON.stringify(snapshot),
      createdByProfileId,
      snapshotAuditProfileId,
    ]
  );
  await client.query(
    `insert into public.evaluation_requests (
       intervention_id,
       internal_profile_id,
       senior_profile_id,
       status,
       completed_at,
       created_by_profile_id,
       updated_by_profile_id
     ) values ($1, $2, $3, 'completed', now(), $2, $4)`,
    [
      interventionId,
      internalProfile.profileId,
      seniorProfile.profileId,
      snapshotAuditProfileId,
    ]
  );

  await setRequestActor(client, seniorProfile.authUserId);
  await client.query(
    `insert into public.intervention_evaluations (
       intervention_id,
       senior_profile_id,
       global_performance,
       category_difficulty,
       senior_comment,
       checklist
     ) values ($1, $2, '4', '2', 'Évaluation synthétique', $3::jsonb)`,
    [interventionId, seniorProfile.profileId, '{"step-1":"4"}']
  );
  await clearRequestContext(client);
}

async function createMessagesAndNotifications(client, fixture) {
  await client.query(
    `insert into public.admin_notification_messages (
       id,
       title,
       body,
       audience_type,
       audience_profile_id,
       deletion_policy,
       scheduled_at,
       status,
       created_by_profile_id,
       sent_at
     ) values (
       $1, 'Message ciblé', 'Donnée destinée au profil supprimé',
       'profile', $2, 'manual', now(), 'sent', $3, now()
     )`,
    [
      fixture.targetedMessageId,
      fixture.target.profileId,
      fixture.admin.profileId,
    ]
  );
  await client.query(
    `insert into public.admin_notification_messages (
       id,
       title,
       body,
       audience_type,
       deletion_policy,
       scheduled_at,
       status,
       created_by_profile_id,
       sent_at
     ) values (
       $1, 'Message partagé', 'Information collective à conserver',
       'all', 'manual', now(), 'sent', $2, now()
     )`,
    [fixture.sharedMessageId, fixture.target.profileId]
  );

  await client.query(
    `insert into public.user_notifications (
       id,
       profile_id,
       kind,
       admin_message_id,
       title,
       body,
       source_key,
       deletion_policy,
       push_status
     ) values
       (
         $1, $2, 'admin_message', $3, 'Message ciblé', 'À supprimer',
         $4, 'manual', 'unavailable'
       ),
       (
         $5, $6, 'admin_message', $7, 'Message partagé', 'À conserver',
         $8, 'manual', 'unavailable'
       )`,
    [
      fixture.targetedMessageNotificationId,
      fixture.target.profileId,
      fixture.targetedMessageId,
      `admin:${fixture.targetedMessageId}:${fixture.target.profileId}`,
      fixture.sharedMessageNotificationId,
      fixture.survivorInternal.profileId,
      fixture.sharedMessageId,
      `admin:${fixture.sharedMessageId}:${fixture.survivorInternal.profileId}`,
    ]
  );
}

async function createActivityFixture(client, fixture) {
  const targetDisplayName = `${fixture.target.firstName} ${fixture.target.lastName}`;

  await clearRequestContext(client);
  await setServiceRoleContext(client);

  try {
    await client.query(
      `insert into public.activity_log (
         id,
         profile_id,
         actor_role,
         actor_label,
         action,
         target_type,
         target_label,
         target_profile_id,
         created_by_profile_id,
         analytics_event
       ) values
         (
           $1, $2, 'senior'::public.app_role, $3, 'Action personnelle',
           'Profil', $3, $2, $2,
           jsonb_build_object('targetProfileId', $2::uuid)
         ),
         (
           gen_random_uuid(), $4, 'admin'::public.app_role, 'Administrateur',
           'Compte créé avec clé d’accès provisoire', 'Compte utilisateur', $3,
           $2, $4,
           jsonb_build_object('kind', 'profile_target', 'targetProfileId', $2::uuid)
         ),
         (
           gen_random_uuid(), $4, 'admin'::public.app_role, 'Administrateur',
           'Consultation ciblée', 'Profil', $3, $2,
           $4,
           jsonb_build_object('kind', 'profile_target', 'targetProfileId', $2::uuid)
         ),
         (
           $5, $4, 'admin'::public.app_role, 'Administrateur',
           'Audit indépendant', 'Référentiel', 'Conservé', null, $4,
           '{"kind":"unrelated"}'::jsonb
         )`,
      [
        fixture.targetActivityId,
        fixture.target.profileId,
        targetDisplayName,
        fixture.admin.profileId,
        fixture.unrelatedActivityId,
      ]
    );
  } finally {
    await clearRequestContext(client);
  }
}

async function verifyDeletedIdentityAndDirectData(client, fixture) {
  assert.equal(
    await countById(client, 'auth.users', 'id', fixture.target.authUserId),
    0
  );
  assert.equal(
    await countById(client, 'public.profiles', 'id', fixture.target.profileId),
    0
  );
  assert.equal(
    await countById(
      client,
      'public.profile_deletion_requests',
      'profile_id',
      fixture.target.profileId
    ),
    0
  );

  for (const [tableName, columnName] of [
    ['public.application_sessions', 'profile_id'],
    ['public.push_subscriptions', 'profile_id'],
    ['public.notebook_documents', 'profile_id'],
    ['public.trophy_awards', 'profile_id'],
    ['public.user_notifications', 'profile_id'],
  ]) {
    assert.equal(
      await countById(
        client,
        tableName,
        columnName,
        fixture.target.profileId
      ),
      0,
      `${tableName}.${columnName} ne doit plus référencer le profil supprimé`
    );
  }

  assert.equal(
    Number(
      (
        await client.query(
          `select count(*)::integer as count
           from public.senior_internal_assignments
           where senior_profile_id = $1 or internal_profile_id = $1`,
          [fixture.target.profileId]
        )
      ).rows[0].count
    ),
    0
  );
  assert.equal(
    Number(
      (
        await client.query(
          `select count(*)::integer as count
           from public.test_feedback
           where author_profile_id = $1 or profile_id = $1`,
          [fixture.target.profileId]
        )
      ).rows[0].count
    ),
    0
  );
  assert.equal(
    Number(
      (
        await client.query(
          `select count(*)::integer as count
           from public.activity_log
           where profile_id = $1
              or created_by_profile_id = $1
              or target_profile_id = $1
              or coalesce(analytics_event::text, '') like '%' || $1::text || '%'`,
          [fixture.target.profileId]
        )
      ).rows[0].count
    ),
    0,
    'les audits où le profil est acteur ou cible doivent être supprimés'
  );
}

async function verifyActivityTargetForeignKey(client, profileId) {
  const constraint = await client.query(
    `select constraint_row.confdeltype
     from pg_constraint constraint_row
     where constraint_row.conname = 'activity_log_target_profile_id_fkey'
       and constraint_row.conrelid = 'public.activity_log'::regclass`
  );
  assert.equal(constraint.rowCount, 1);
  assert.equal(
    constraint.rows[0].confdeltype,
    'c',
    'la cible relationnelle d’un audit doit être supprimée en cascade avec le profil'
  );
  assert.equal(
    await countById(
      client,
      'public.activity_log',
      'target_profile_id',
      profileId
    ),
    0,
    'aucune trace ciblée relationnelle ne doit survivre au profil'
  );
}

async function verifySharedClinicalDeletion(client, fixture) {
  for (const [tableName, columnName] of [
    ['public.interventions', 'id'],
    ['public.intervention_evaluations', 'intervention_id'],
    ['public.evaluation_requests', 'intervention_id'],
  ]) {
    assert.equal(
      await countById(
        client,
        tableName,
        columnName,
        fixture.affectedInterventionId
      ),
      0,
      `${tableName} doit perdre le dossier partagé avec le profil supprimé`
    );
    assert.equal(
      await countById(
        client,
        tableName,
        columnName,
        fixture.survivorInterventionId
      ),
      1,
      `${tableName} doit conserver le dossier clinique indépendant`
    );
  }

  assert.equal(
    await countById(
      client,
      'public.profiles',
      'id',
      fixture.affectedInternal.profileId
    ),
    1,
    'le tiers propriétaire de l’intervention partagée doit rester présent'
  );
}

async function verifySharedDataPreservedAndAnonymized(client, fixture) {
  const procedure = await client.query(
    `select owner_profile_id, updated_by_profile_id, definition
     from public.surgical_intervention_definitions
     where id = $1`,
    [fixture.procedureId]
  );
  assert.equal(procedure.rowCount, 1);
  assert.equal(procedure.rows[0].owner_profile_id, null);
  assert.equal(procedure.rows[0].updated_by_profile_id, null);
  assertJsonDoesNotContainProfile(procedure.rows[0].definition, fixture.target);

  const survivorIntervention = await client.query(
    `select updated_by_profile_id, definition_snapshot
     from public.interventions
     where id = $1`,
    [fixture.survivorInterventionId]
  );
  assert.equal(survivorIntervention.rowCount, 1);
  assert.equal(survivorIntervention.rows[0].updated_by_profile_id, null);
  assertJsonDoesNotContainProfile(
    survivorIntervention.rows[0].definition_snapshot,
    fixture.target
  );

  const trophy = await client.query(
    `select created_by_profile_id, updated_by_profile_id, definition
     from public.trophy_definitions
     where id = $1`,
    [fixture.trophyId]
  );
  assert.equal(trophy.rowCount, 1);
  assert.equal(trophy.rows[0].created_by_profile_id, null);
  assert.equal(trophy.rows[0].updated_by_profile_id, null);
  assertJsonDoesNotContainProfile(trophy.rows[0].definition, fixture.target);

  const versionAndDraft = await client.query(
    `select definition, published_by_profile_id as profile_reference
     from public.trophy_definition_versions
     where trophy_id = $1
     union all
     select definition, updated_by_profile_id as profile_reference
     from public.trophy_definition_drafts
     where trophy_id = $1`,
    [fixture.trophyId]
  );
  assert.equal(versionAndDraft.rowCount, 2);
  for (const row of versionAndDraft.rows) {
    assert.equal(row.profile_reference, null);
    assertJsonDoesNotContainProfile(row.definition, fixture.target);
  }

  const formula = await client.query(
    `select definition, created_by_profile_id, updated_by_profile_id
     from public.autonomy_score_formulas
     where id = $1`,
    [fixture.formulaId]
  );
  assert.equal(formula.rowCount, 1);
  assert.equal(formula.rows[0].created_by_profile_id, null);
  assert.equal(formula.rows[0].updated_by_profile_id, null);
  assertJsonDoesNotContainProfile(formula.rows[0].definition, fixture.target);

  const institution = await client.query(
    `select created_by_profile_id, updated_by_profile_id
     from public.institutions
     where id = $1`,
    [fixture.institution.id]
  );
  assert.equal(institution.rowCount, 1);
  assert.equal(institution.rows[0].created_by_profile_id, null);
  assert.equal(institution.rows[0].updated_by_profile_id, null);

  const survivorProfile = await client.query(
    `select metadata, updated_by_profile_id
     from public.profiles
     where id = $1`,
    [fixture.survivorInternal.profileId]
  );
  assert.equal(survivorProfile.rows[0].updated_by_profile_id, null);
  assertJsonDoesNotContainProfile(
    survivorProfile.rows[0].metadata,
    fixture.target
  );

  assert.equal(
    await countById(
      client,
      'public.admin_notification_messages',
      'id',
      fixture.targetedMessageId
    ),
    0,
    'le message exclusivement ciblé doit être supprimé'
  );
  const sharedMessage = await client.query(
    `select created_by_profile_id
     from public.admin_notification_messages
     where id = $1`,
    [fixture.sharedMessageId]
  );
  assert.equal(sharedMessage.rowCount, 1);
  assert.equal(
    sharedMessage.rows[0].created_by_profile_id,
    null,
    'le message partagé survit avec son auteur anonymisé'
  );

  assert.equal(
    await countById(
      client,
      'public.activity_log',
      'id',
      fixture.unrelatedActivityId
    ),
    1,
    'un audit indépendant doit être conservé'
  );

  const legacyGestures = await client.query(
    `select data
     from public.app_state
     where key = 'saved_obstetric_gestures'`
  );
  assert.deepEqual(
    legacyGestures.rows[0].data.map((gesture) => gesture.id),
    [fixture.keptLegacyGestureId],
    'les gestes obstétricaux legacy liés au profil doivent disparaître sans retirer le témoin'
  );

  const legacyCatalogue = await client.query(
    `select data
     from public.app_state
     where key = 'custom_surgical_interventions'`
  );
  assert.equal(legacyCatalogue.rows[0].data.length, 1);
  assertJsonDoesNotContainProfile(
    legacyCatalogue.rows[0].data,
    fixture.target
  );
}

async function verifyNotificationsAndTrophies(client, fixture) {
  assert.equal(
    await countById(
      client,
      'public.user_notifications',
      'admin_message_id',
      fixture.targetedMessageId
    ),
    0
  );
  assert.equal(
    await countById(
      client,
      'public.user_notifications',
      'id',
      fixture.sharedMessageNotificationId
    ),
    1,
    'la notification hors cible d’un message partagé doit être conservée'
  );
  assert.equal(
    await countById(
      client,
      'public.user_notifications',
      'evaluation_id',
      fixture.affectedInterventionId
    ),
    0,
    'la notification de l’évaluation supprimée ne doit pas devenir orpheline'
  );
  assert.equal(
    await countById(
      client,
      'public.user_notifications',
      'evaluation_id',
      fixture.survivorInterventionId
    ),
    1,
    'la notification d’une évaluation indépendante doit rester présente'
  );

  assert.equal(
    Number(
      (
        await client.query(
          `select count(*)::integer as count
           from public.trophy_awards
           where trophy_id = $1
             and profile_id = $2`,
          [fixture.trophyId, fixture.affectedInternal.profileId]
        )
      ).rows[0].count
    ),
    0,
    'les trophées dépendant de l’intervention partagée supprimée doivent être recalculés'
  );
  const survivorAward = await client.query(
    `select source_intervention_id
     from public.trophy_awards
     where trophy_id = $1
       and profile_id = $2
       and tier = 'bronze'`,
    [fixture.trophyId, fixture.survivorInternal.profileId]
  );
  assert.equal(survivorAward.rowCount, 1);
  assert.equal(
    survivorAward.rows[0].source_intervention_id,
    fixture.survivorInterventionId
  );

  const orphanAwardNotifications = await client.query(
    `select count(*)::integer as count
     from public.user_notifications notification
     where notification.kind = 'trophy_awarded'
       and notification.profile_id = $1
       and not exists (
         select 1
         from public.trophy_awards award
         where award.id = notification.award_event_id
       )`,
    [fixture.affectedInternal.profileId]
  );
  assert.equal(
    Number(orphanAwardNotifications.rows[0].count),
    0,
    'aucune notification de trophée ne doit référencer une attribution supprimée'
  );
}

async function verifyNoResidualProfileForeignKeys(client, profileId) {
  const references = await client.query(
    `select
       namespace.nspname as schema_name,
       relation.relname as table_name,
       attribute.attname as column_name
     from pg_constraint constraint_row
     join pg_class relation
       on relation.oid = constraint_row.conrelid
     join pg_namespace namespace
       on namespace.oid = relation.relnamespace
     join pg_attribute attribute
       on attribute.attrelid = constraint_row.conrelid
      and attribute.attnum = constraint_row.conkey[1]
     where constraint_row.contype = 'f'
       and constraint_row.confrelid = 'public.profiles'::regclass
       and array_length(constraint_row.conkey, 1) = 1`
  );

  for (const reference of references.rows) {
    const result = await client.query(
      `select count(*)::integer as count
       from ${quoteIdentifier(reference.schema_name)}.${quoteIdentifier(
         reference.table_name
       )}
       where ${quoteIdentifier(reference.column_name)} = $1`,
      [profileId]
    );
    assert.equal(
      Number(result.rows[0].count),
      0,
      `référence FK résiduelle dans ${reference.schema_name}.${reference.table_name}.${reference.column_name}`
    );
  }
}

async function readProfileVersion(client, profileId) {
  const result = await client.query(
    'select version from public.profiles where id = $1',
    [profileId]
  );

  return Number(result.rows[0].version);
}

async function countById(client, tableName, columnName, value) {
  const [schemaName, relationName] = tableName.split('.');
  const result = await client.query(
    `select count(*)::integer as count
     from ${quoteIdentifier(schemaName)}.${quoteIdentifier(relationName)}
     where ${quoteIdentifier(columnName)} = $1`,
    [value]
  );

  return Number(result.rows[0].count);
}

async function setRequestActor(client, authUserId) {
  const sessionId = randomUUID();
  const tokenHash = createHash('sha256')
    .update(`fixture-session:${sessionId}`)
    .digest('hex');

  await client.query(
    `insert into public.application_sessions (
       id,
       profile_id,
       auth_user_id,
       token_hash,
       client_kind,
       idle_timeout_seconds
     )
     select $1, profile.id, profile.auth_user_id, $2, 'web', 1800
     from public.profiles profile
     where profile.auth_user_id = $3`,
    [sessionId, tokenHash, authUserId]
  );
  await client.query(
    `select
       set_config('request.jwt.claim.sub', $1, true),
       set_config('request.jwt.claim.role', 'authenticated', true),
       set_config(
         'request.jwt.claims',
         jsonb_build_object(
           'sub', $1::text,
           'role', 'authenticated',
           'app_session_id', $2::text
         )::text,
         true
       )`,
    [authUserId, sessionId]
  );
}

async function setServiceRoleContext(client) {
  await client.query(
    `select
       set_config('request.jwt.claim.sub', '', true),
       set_config('request.jwt.claim.role', 'service_role', true),
       set_config(
         'request.jwt.claims',
         '{"role":"service_role"}',
         true
       )`
  );
}

async function clearRequestContext(client) {
  await client.query('reset role');
  await client.query(
    `select
       set_config('request.jwt.claim.sub', '', true),
       set_config('request.jwt.claim.role', '', true),
       set_config('request.jwt.claims', '{}', true)`
  );
  await clearSagaFlags(client);
}

async function clearSagaFlags(client) {
  await client.query(
    `select
       set_config('app.allow_profile_account_lifecycle', '', true),
       set_config('app.allow_profile_permanent_deletion', '', true),
       set_config('monjdb.suppress_trophy_notifications', '', true)`
  );
}

async function expectDatabaseError(client, expectedCode, operation) {
  await client.query('savepoint expected_database_error');

  try {
    await assert.rejects(operation, (error) => error?.code === expectedCode);
  } finally {
    await client.query('rollback to savepoint expected_database_error');
    await client.query('release savepoint expected_database_error');
  }
}

function assertJsonDoesNotContainProfile(document, profile) {
  assert.ok(
    !JSON.stringify(document).includes(profile.profileId),
    `le JSON partagé ne doit plus contenir ${profile.profileId}`
  );
}

function stripTopLevelTransactionStatements(sql) {
  return sql.replace(/^\s*(?:begin|commit)\s*;\s*$/gim, '');
}

function stripSslMode(value) {
  const url = new URL(value);
  url.searchParams.delete('sslmode');
  return url.toString();
}

function databaseUrlsMatch(left, right) {
  try {
    return stripSslMode(left) === stripSslMode(right);
  } catch {
    return left === right;
  }
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}
