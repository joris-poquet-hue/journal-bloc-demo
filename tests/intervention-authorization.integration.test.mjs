import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import pg from 'pg';

const allowProductionTransactionalTests =
  process.env.ALLOW_PRODUCTION_TRANSACTIONAL_TESTS === '1';
const allowRestoreDrillTests = process.env.PROJECT1_RESTORE_DRILL === '1';
const connectionString =
  process.env.SUPABASE_TEST_POSTGRES_URL ||
  (allowRestoreDrillTests
    ? process.env.SUPABASE_POSTGRES_URL_NON_POOLING
    : undefined) ||
  (allowProductionTransactionalTests
    ? process.env.SUPABASE_POSTGRES_URL_NON_POOLING
    : undefined);
const requireTestDatabase = process.env.REQUIRE_SUPABASE_TEST_DB === '1';
const securityHardeningMigration = readFileSync(
  new URL(
    '../supabase/migrations/202607270001_security_hardening.sql',
    import.meta.url
  ),
  'utf8'
);
const officialInstitutionsMigration = readFileSync(
  new URL(
    '../supabase/migrations/202607270002_official_institutions.sql',
    import.meta.url
  ),
  'utf8'
);
const pendingAccountActivationGuardMigration = readFileSync(
  new URL(
    '../supabase/migrations/202607270003_pending_account_activation_guard.sql',
    import.meta.url
  ),
  'utf8'
);
const serverManagedSessionsMigration = readFileSync(
  new URL(
    '../supabase/migrations/202607270004_server_managed_sessions.sql',
    import.meta.url
  ),
  'utf8'
);
const enforcedServerManagedSessionsMigration = readFileSync(
  new URL(
    '../supabase/migrations/202607270005_enforce_server_managed_sessions.sql',
    import.meta.url
  ),
  'utf8'
);
const interventionIntegrityFormulaMigration = readFileSync(
  new URL(
    '../supabase/migrations/202607270006_intervention_integrity_formula.sql',
    import.meta.url
  ),
  'utf8'
);
const enforcedInterventionScoreAuthorityMigration = readFileSync(
  new URL(
    '../supabase/migrations/202607270007_enforce_intervention_score_authority.sql',
    import.meta.url
  ),
  'utf8'
);
const fixedLegacySnapshotApplicationMigration = readFileSync(
  new URL(
    '../supabase/migrations/202607270008_fix_legacy_snapshot_application.sql',
    import.meta.url
  ),
  'utf8'
);
const integrationSessionByAuthUserId = new Map();

if (requireTestDatabase && !connectionString) {
  throw new Error(
    'SUPABASE_TEST_POSTGRES_URL est requis pour les tests d’intégration Supabase.'
  );
}

test(
  'parcours croisé Interne–Seniors, évaluation désignée et changement d’établissement',
  { skip: !connectionString },
  async () => {
    const databaseUrl = new URL(connectionString);
    const isLocalDatabase = ['127.0.0.1', '::1', 'localhost'].includes(
      databaseUrl.hostname
    );

    if (
      !isLocalDatabase &&
      process.env.ALLOW_REMOTE_SUPABASE_TESTS !== '1' &&
      !allowProductionTransactionalTests
    ) {
      throw new Error(
        'Les tests distants sont bloqués. Utilisez une base locale ou définissez explicitement ALLOW_REMOTE_SUPABASE_TESTS=1.'
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
      if (
        !(await isMigrationApplied(
          client,
          'supabase/migrations/202607270001_security_hardening.sql'
        ))
      ) {
        await client.query(securityHardeningMigration);
      }
      if (
        !(await isMigrationApplied(
          client,
          'supabase/migrations/202607270002_official_institutions.sql'
        ))
      ) {
        await client.query(officialInstitutionsMigration);
      }
      if (
        !(await isMigrationApplied(
          client,
          'supabase/migrations/202607270003_pending_account_activation_guard.sql'
        ))
      ) {
        await client.query(pendingAccountActivationGuardMigration);
      }
      if (
        !(await isMigrationApplied(
          client,
          'supabase/migrations/202607270004_server_managed_sessions.sql'
        ))
      ) {
        await client.query(serverManagedSessionsMigration);
      }
      if (
        !(await isMigrationApplied(
          client,
          'supabase/migrations/202607270005_enforce_server_managed_sessions.sql'
        ))
      ) {
        await client.query(enforcedServerManagedSessionsMigration);
      }
      if (
        !(await isMigrationApplied(
          client,
          'supabase/migrations/202607270006_intervention_integrity_formula.sql'
        ))
      ) {
        await client.query(interventionIntegrityFormulaMigration);
      }
      if (
        !(await isMigrationApplied(
          client,
          'supabase/migrations/202607270007_enforce_intervention_score_authority.sql'
        ))
      ) {
        await client.query(enforcedInterventionScoreAuthorityMigration);
      }
      if (
        !(await isMigrationApplied(
          client,
          'supabase/migrations/202607270008_fix_legacy_snapshot_application.sql'
        ))
      ) {
        await client.query(fixedLegacySnapshotApplicationMigration);
      }
      const interventionRpcRows = await client.query(
        `select procedure.proname, count(*)::integer as count
         from pg_proc procedure
         join pg_namespace namespace
           on namespace.oid = procedure.pronamespace
         where namespace.nspname = 'public'
           and procedure.proname = any($1::text[])
         group by procedure.proname`,
        [[
          'create_intervention',
          'save_intervention_evaluation',
          'create_intervention_with_evaluation_request',
          'save_intervention_evaluation_with_score',
        ]]
      );
      const interventionRpcCounts = new Map(
        interventionRpcRows.rows.map((row) => [row.proname, row.count])
      );
      assert.ok(
        (interventionRpcCounts.get('create_intervention') ?? 0) > 0,
        'le RPC canonique de création doit être installé'
      );
      assert.ok(
        (interventionRpcCounts.get('save_intervention_evaluation') ?? 0) > 0,
        'le RPC canonique d’évaluation doit être installé'
      );
      assert.equal(
        interventionRpcCounts.get(
          'create_intervention_with_evaluation_request'
        ) ?? 0,
        0,
        'l’ancien RPC de création doit être retiré'
      );
      assert.equal(
        interventionRpcCounts.get(
          'save_intervention_evaluation_with_score'
        ) ?? 0,
        0,
        'l’ancien RPC acceptant le score client doit être retiré'
      );
      await createProfilesAndProcedure(client, fixture);
      await verifyApplicationSessionLifecycle(client, fixture.internal);
      integrationSessionByAuthUserId.delete(fixture.internal.authUserId);

      await client.query(
        `update public.profiles
         set must_change_password = true
         where id = $1`,
        [fixture.internal.profileId]
      );
      await client.query(
        `update auth.users
         set raw_app_meta_data = '{"pending_activation":true}'::jsonb
         where id = $1`,
        [fixture.internal.authUserId]
      );
      const pendingSessionVisibility = await runAs(
        client,
        fixture.internal.authUserId,
        () =>
          client.query(
            `select
               public.current_profile_id() as current_profile_id,
               (select count(*)::integer from public.profiles) as profile_count,
               (
                 select count(*)::integer
                 from public.surgical_intervention_definitions
               ) as definition_count`
          )
      );
      assert.equal(
        pendingSessionVisibility.rows[0].current_profile_id,
        null,
        'une session en attente ne doit pas obtenir d’identité métier'
      );
      assert.equal(
        pendingSessionVisibility.rows[0].profile_count,
        0,
        'une session en attente ne doit lire aucun profil'
      );
      assert.equal(
        pendingSessionVisibility.rows[0].definition_count,
        0,
        'une session en attente ne doit lire aucun catalogue métier'
      );
      await expectDenied(
        client,
        fixture.internal.authUserId,
        () =>
          client.query(
            `select public.complete_password_setup('pending@example.test')`
          )
      );
      await client.query('reset role');
      await client.query(
        `update public.profiles
         set must_change_password = false
         where id = $1`,
        [fixture.internal.profileId]
      );
      await client.query(
        `update auth.users
         set
           email = 'activated@example.test',
           raw_app_meta_data = '{"pending_activation":false}'::jsonb
         where id = $1`,
        [fixture.internal.authUserId]
      );

      const renamedInstitutionA = `${fixture.institutionA.name} renommé`;
      await runAs(client, fixture.admin.authUserId, () =>
        client.query(
          `select public.rename_institution($1::uuid, $2::text, 1::bigint)`,
          [fixture.institutionA.id, renamedInstitutionA]
        )
      );
      const renamedProfiles = await client.query(
        `select count(*)::integer as count
         from public.profiles
         where institution_id = $1
           and institution = $2`,
        [fixture.institutionA.id, renamedInstitutionA]
      );
      assert.equal(
        renamedProfiles.rows[0].count,
        4,
        'renommer un établissement doit synchroniser le libellé sans changer les rattachements'
      );

      await runAs(client, fixture.internal.authUserId, () =>
        client.query(
          `insert into public.notebook_documents (profile_id, content_html)
           values ($1, '<p>Note privée de test</p>')`,
          [fixture.internal.profileId]
        )
      );
      assert.equal(
        await visibleNotebookCount(
          client,
          fixture.internal.authUserId,
          fixture.internal.profileId
        ),
        1,
        'l’Interne doit lire son propre bloc-notes'
      );
      assert.equal(
        await visibleNotebookCount(
          client,
          fixture.admin.authUserId,
          fixture.internal.profileId
        ),
        0,
        'l’Administrateur ne doit pas lire le bloc-notes privé'
      );
      const adminNotebookUpdate = await runAs(
        client,
        fixture.admin.authUserId,
        () =>
        client.query(
          `update public.notebook_documents
           set content_html = '<p>Modification interdite</p>'
           where profile_id = $1
           returning profile_id`,
          [fixture.internal.profileId]
        )
      );
      assert.equal(
        adminNotebookUpdate.rowCount,
        0,
        'l’Administrateur ne doit modifier aucune ligne du bloc-notes'
      );
      assert.equal(
        await readNotebookContent(
          client,
          fixture.internal.authUserId,
          fixture.internal.profileId
        ),
        '<p>Note privée de test</p>',
        'le contenu privé doit rester intact'
      );

      await runAs(client, fixture.internal.authUserId, () =>
        client.query(
          `select public.record_user_activity_event(
             'view_trophies', 'Valeur ignorée', null
           )`
        )
      );
      assert.equal(
        await visibleActivityCount(
          client,
          fixture.internal.authUserId,
          fixture.internal.profileId
        ),
        0,
        'un Interne ne doit pas lire le journal d’audit'
      );
      assert.equal(
        await visibleActivityCount(
          client,
          fixture.admin.authUserId,
          fixture.internal.profileId
        ),
        1,
        'l’Administrateur doit lire les événements contrôlés'
      );
      await runAs(client, fixture.internal.authUserId, () =>
        client.query('select public.record_profile_login()')
      );
      assert.equal(
        await visibleActivityCount(
          client,
          fixture.admin.authUserId,
          fixture.internal.profileId
        ),
        2,
        'la connexion doit être tracée par la fonction serveur'
      );
      await expectDatabaseError(
        client,
        fixture.internal.authUserId,
        '22023',
        () =>
          client.query(
            `select public.record_user_activity_event(
               'login', 'Espace administrateur', null
             )`
          )
      );
      await expectDenied(client, fixture.internal.authUserId, () =>
        insertForgedActivity(client, fixture.internal.profileId)
      );
      await expectDenied(client, fixture.admin.authUserId, () =>
        insertForgedActivity(client, fixture.admin.profileId)
      );

      await expectDenied(client, fixture.admin.authUserId, () =>
        client.query('delete from public.profiles where id = $1', [
          fixture.internal.profileId,
        ])
      );
      await expectOwnerDatabaseError(client, '55000', () =>
        client.query('delete from public.profiles where id = $1', [
          fixture.internal.profileId,
        ])
      );

      await expectDenied(client, fixture.admin.authUserId, () =>
        client.query('delete from public.trophy_definitions where id = $1', [
          fixture.draftTrophyId,
        ])
      );
      await runAs(client, fixture.admin.authUserId, () =>
        client.query(
          `select public.delete_never_activated_trophy_draft($1, $2)`,
          [fixture.draftTrophyId, 1]
        )
      );
      assert.equal(
        await trophyDefinitionCount(client, fixture.draftTrophyId),
        0,
        'un nouveau brouillon jamais activé peut être supprimé par la RPC'
      );
      await expectDatabaseError(
        client,
        fixture.admin.authUserId,
        '55000',
        () =>
          client.query(
            `select public.delete_never_activated_trophy_draft($1, $2)`,
            [fixture.activeTrophyId, 1]
          )
      );
      await expectDenied(client, fixture.admin.authUserId, () =>
        client.query(
          `insert into public.trophy_awards (
             trophy_id, profile_id, tier
           ) values ($1, $2, 'bronze')`,
          [fixture.activeTrophyId, fixture.internal.profileId]
        )
      );

      await expectDenied(client, fixture.internal.authUserId, () =>
        createIntervention(client, fixture, {
          interventionId: fixture.invalidInterventionId,
          mutationId: `test-invalid-${fixture.invalidInterventionId}`,
          seniorProfileId: fixture.newInstitutionSenior.profileId,
        })
      );
      assert.equal(
        await countRows(client, 'interventions', fixture.invalidInterventionId),
        0,
        'un Senior d’un autre établissement ne doit créer aucune intervention partielle'
      );

      await runAs(client, fixture.internal.authUserId, () =>
        createIntervention(client, fixture, {
          interventionId: fixture.interventionId,
          mutationId: fixture.mutationId,
          seniorProfileId: fixture.designatedSenior.profileId,
        })
      );

      const storedSnapshot = await client.query(
        `select
           definition_snapshot,
           definition_version,
           definition_snapshot_schema_version
         from public.interventions
         where id = $1`,
        [fixture.interventionId]
      );
      assert.equal(storedSnapshot.rows[0].definition_snapshot_schema_version, 1);
      assert.equal(Number(storedSnapshot.rows[0].definition_version), 1);
      assert.equal(
        storedSnapshot.rows[0].definition_snapshot.source.id,
        fixture.procedureId,
        'la fonction atomique doit figer la définition réellement utilisée'
      );

      await expectDatabaseError(
        client,
        fixture.internal.authUserId,
        '22023',
        () =>
          createIntervention(client, fixture, {
            checklist: { 'step-1': '3', 'step-injected': '4' },
            interventionId: randomUUID(),
            mutationId: `test-invalid-checklist-${randomUUID()}`,
            seniorProfileId: fixture.designatedSenior.profileId,
          })
      );
      await runAs(client, fixture.internal.authUserId, () =>
        createIntervention(client, fixture, {
          interventionId: fixture.interventionId,
          mutationId: fixture.mutationId,
          seniorProfileId: fixture.designatedSenior.profileId,
        })
      );

      assert.equal(await countRows(client, 'interventions', fixture.interventionId), 1);
      assert.equal(
        await countRows(client, 'evaluation_requests', fixture.interventionId),
        1,
        'la demande d’évaluation doit être créée dans la même transaction'
      );

      assert.equal(
        await visibleInterventionCount(
          client,
          fixture.designatedSenior.authUserId,
          fixture.interventionId
        ),
        1
      );
      assert.equal(
        await visibleInterventionCount(
          client,
          fixture.sameInstitutionSenior.authUserId,
          fixture.interventionId
        ),
        1,
        'un Senior du même établissement doit voir l’intervention sans favori'
      );
      assert.equal(
        await visibleInterventionCount(
          client,
          fixture.newInstitutionSenior.authUserId,
          fixture.interventionId
        ),
        0
      );
      assert.equal(
        await directlyVisibleInternalProfileCount(
          client,
          fixture.designatedSenior.authUserId,
          fixture.internal.profileId
        ),
        0,
        'un Senior ne doit pas pouvoir lire directement les champs privés du profil Interne'
      );
      assert.equal(
        await directoryInternalCount(
          client,
          fixture.designatedSenior.authUserId,
          fixture.internal.profileId
        ),
        1,
        'le répertoire pédagogique expurgé doit contenir l’Interne du même établissement'
      );

      await runAs(client, fixture.internal.authUserId, () =>
        createIntervention(client, fixture, {
          interventionId: fixture.pendingDeletionInterventionId,
          mutationId: fixture.pendingDeletionMutationId,
          seniorProfileId: fixture.designatedSenior.profileId,
        })
      );
      const pendingDeletionVersion = await readInterventionVersion(
        client,
        fixture.pendingDeletionInterventionId
      );

      await expectDenied(client, fixture.otherInternal.authUserId, () =>
        deletePendingIntervention(
          client,
          fixture.pendingDeletionInterventionId,
          pendingDeletionVersion
        )
      );
      await expectDenied(client, fixture.sameInstitutionSenior.authUserId, () =>
        deletePendingIntervention(
          client,
          fixture.pendingDeletionInterventionId,
          pendingDeletionVersion
        )
      );
      await expectDenied(client, fixture.admin.authUserId, () =>
        deletePendingIntervention(
          client,
          fixture.pendingDeletionInterventionId,
          pendingDeletionVersion
        )
      );

      await runAs(client, fixture.internal.authUserId, () =>
        deletePendingIntervention(
          client,
          fixture.pendingDeletionInterventionId,
          pendingDeletionVersion
        )
      );

      assert.equal(
        await countRows(
          client,
          'interventions',
          fixture.pendingDeletionInterventionId
        ),
        0,
        'l’intervention en attente doit être supprimée'
      );
      assert.equal(
        await countRows(
          client,
          'evaluation_requests',
          fixture.pendingDeletionInterventionId
        ),
        0,
        'la demande d’évaluation doit être supprimée dans la même transaction'
      );
      assert.equal(
        await pendingDeletionAuditCount(
          client,
          fixture.internal.profileId,
          fixture.procedureId
        ),
        1,
        'la suppression en attente doit être auditée'
      );

      const interventionVersion = await readInterventionVersion(
        client,
        fixture.interventionId
      );

      await expectDenied(client, fixture.sameInstitutionSenior.authUserId, () =>
        saveEvaluation(
          client,
          fixture,
          fixture.sameInstitutionSenior.profileId,
          interventionVersion
        )
      );
      await expectDenied(client, fixture.admin.authUserId, () =>
        saveEvaluation(
          client,
          fixture,
          fixture.designatedSenior.profileId,
          interventionVersion
        )
      );

      await runAs(client, fixture.designatedSenior.authUserId, () =>
        saveEvaluation(
          client,
          fixture,
          fixture.designatedSenior.profileId,
          interventionVersion
        )
      );

      const storedAuthoritativeScore = await client.query(
        `select
           autonomy_score::numeric as autonomy_score,
           autonomy_score_formula_id,
           autonomy_score_calculated_at
         from public.interventions
         where id = $1`,
        [fixture.interventionId]
      );
      assert.equal(Number(storedAuthoritativeScore.rows[0].autonomy_score), 75);
      assert.ok(storedAuthoritativeScore.rows[0].autonomy_score_formula_id);
      assert.ok(storedAuthoritativeScore.rows[0].autonomy_score_calculated_at);

      assert.equal(
        await countRows(client, 'intervention_evaluations', fixture.interventionId),
        1
      );
      assert.equal(
        await readEvaluationRequestStatus(client, fixture.interventionId),
        'completed'
      );
      assert.equal(
        await visibleEvaluationCount(
          client,
          fixture.internal.authUserId,
          fixture.interventionId
        ),
        1,
        'l’Interne doit voir immédiatement l’évaluation validée'
      );
      const evaluatedInterventionVersion = await readInterventionVersion(
        client,
        fixture.interventionId
      );

      await expectDatabaseError(
        client,
        fixture.internal.authUserId,
        '55000',
        () =>
          deletePendingIntervention(
            client,
            fixture.interventionId,
            evaluatedInterventionVersion
          )
      );
      await expectDenied(client, fixture.admin.authUserId, () =>
        client.query('delete from public.interventions where id = $1', [
          fixture.interventionId,
        ])
      );
      await expectDenied(client, fixture.admin.authUserId, () =>
        client.query(
          `update public.interventions
           set checklist = '{"step-1":"4"}'::jsonb
           where id = $1`,
          [fixture.interventionId]
        )
      );
      await expectDenied(client, fixture.admin.authUserId, () =>
        client.query(
          `update public.intervention_evaluations
           set global_performance = '5'
           where intervention_id = $1`,
          [fixture.interventionId]
        )
      );
      await expectOwnerDatabaseError(client, '55000', () =>
        client.query(
          `update public.intervention_evaluations
           set global_performance = '5'
           where intervention_id = $1`,
          [fixture.interventionId]
        )
      );

      await client.query('reset role');
      await client.query(
        `insert into public.senior_internal_assignments (
           senior_profile_id, internal_profile_id
         ) values ($1, $2)`,
        [fixture.designatedSenior.profileId, fixture.internal.profileId]
      );

      await expectDenied(client, fixture.admin.authUserId, () =>
        client.query(
          'update public.profiles set institution_id = $1 where id = $2',
          [fixture.institutionB.id, fixture.internal.profileId]
        )
      );

      const internalProfileVersion = await readProfileVersion(
        client,
        fixture.internal.profileId
      );
      await runAs(client, fixture.admin.authUserId, () =>
        client.query(
          `select public.move_profile_to_institution(
             $1::uuid, $2::uuid, $3::bigint
           )`,
          [
            fixture.internal.profileId,
            fixture.institutionB.id,
            internalProfileVersion,
          ]
        )
      );

      assert.equal(
        await visibleInterventionCount(
          client,
          fixture.designatedSenior.authUserId,
          fixture.interventionId
        ),
        0,
        'le Senior désigné de l’ancien établissement perd immédiatement la lecture'
      );
      assert.equal(
        await visibleInterventionCount(
          client,
          fixture.sameInstitutionSenior.authUserId,
          fixture.interventionId
        ),
        0,
        'tous les Seniors de l’ancien établissement perdent la lecture'
      );
      assert.equal(
        await visibleInterventionCount(
          client,
          fixture.newInstitutionSenior.authUserId,
          fixture.interventionId
        ),
        1,
        'le Senior du nouvel établissement récupère l’historique complet'
      );
      assert.equal(
        await visibleEvaluationCount(
          client,
          fixture.newInstitutionSenior.authUserId,
          fixture.interventionId
        ),
        1,
        'le nouvel établissement récupère également l’évaluation historique'
      );

      await client.query('reset role');
      const staleAssignmentCount = await client.query(
        `select count(*)::integer as count
         from public.senior_internal_assignments
         where internal_profile_id = $1`,
        [fixture.internal.profileId]
      );
      assert.equal(
        staleAssignmentCount.rows[0].count,
        0,
        'le déplacement doit retirer les favoris devenus incohérents'
      );

      const movementAudit = await client.query(
        `select count(*)::integer as count
         from public.activity_log
         where action = 'Changement d’établissement'
           and target_label like $1`,
        [`%${fixture.institutionB.name}`]
      );
      assert.equal(
        movementAudit.rows[0].count,
        1,
        'le déplacement atomique doit être inscrit une seule fois dans l’audit'
      );

      await runAs(client, fixture.admin.authUserId, () =>
        client.query(
          `select public.archive_institution($1::uuid, 1::bigint)`,
          [fixture.institutionB.id]
        )
      );
      assert.equal(
        await visibleInterventionCount(
          client,
          fixture.newInstitutionSenior.authUserId,
          fixture.interventionId
        ),
        1,
        'archiver l’établissement ne doit pas casser les accès historiques de ses comptes'
      );

      const otherInternalVersion = await readProfileVersion(
        client,
        fixture.otherInternal.profileId
      );
      await expectDatabaseError(
        client,
        fixture.admin.authUserId,
        '23514',
        () =>
          client.query(
            `select public.move_profile_to_institution(
               $1::uuid, $2::uuid, $3::bigint
             )`,
            [
              fixture.otherInternal.profileId,
              fixture.institutionB.id,
              otherInternalVersion,
            ]
          )
      );

      const publicationTables = await client.query(
        `select tablename
         from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'`
      );
      const publishedNames = new Set(
        publicationTables.rows.map((row) => row.tablename)
      );

      for (const tableName of [
        'profiles',
        'interventions',
        'intervention_evaluations',
        'evaluation_requests',
      ]) {
        assert.ok(
          publishedNames.has(tableName),
          `${tableName} doit être publié dans Supabase Realtime`
        );
      }
    } finally {
      await client.query('reset role').catch(() => {});
      await client.query('rollback').catch(() => {});
      await client.end();
    }
  }
);

function stripSslMode(value) {
  const url = new URL(value);
  url.searchParams.delete('sslmode');
  return url.toString();
}

async function isMigrationApplied(client, migrationName) {
  const registry = await client.query(
    `select to_regclass('public.app_schema_migrations') is not null as exists`
  );

  if (!registry.rows[0].exists) {
    return false;
  }

  const result = await client.query(
    `select exists (
       select 1
       from public.app_schema_migrations
       where migration_name = $1
     ) as applied`,
    [migrationName]
  );

  return result.rows[0].applied;
}

function createFixture() {
  const institutionA = {
    id: randomUUID(),
    name: `Établissement A ${randomUUID()}`,
  };
  const institutionB = {
    id: randomUUID(),
    name: `Établissement B ${randomUUID()}`,
  };

  return {
    admin: createProfile('admin', null),
    activeTrophyId: `trophy-active-${randomUUID()}`,
    designatedSenior: createProfile('senior', institutionA),
    draftTrophyId: `trophy-draft-${randomUUID()}`,
    institutionA,
    institutionB,
    internal: createProfile('internal', institutionA),
    interventionId: randomUUID(),
    invalidInterventionId: randomUUID(),
    mutationId: `test-${randomUUID()}`,
    newInstitutionSenior: createProfile('senior', institutionB),
    otherInternal: createProfile('internal', institutionA),
    pendingDeletionInterventionId: randomUUID(),
    pendingDeletionMutationId: `test-delete-${randomUUID()}`,
    procedureId: `custom-${randomUUID()}`,
    sameInstitutionSenior: createProfile('senior', institutionA),
  };
}

function createProfile(role, institution) {
  const profileId = randomUUID();

  return {
    authUserId: randomUUID(),
    institution: institution?.name ?? null,
    institutionId: institution?.id ?? null,
    loginId: `test-${role}-${profileId}`,
    profileId,
    role,
  };
}

async function createProfilesAndProcedure(client, fixture) {
  await client.query(
    `insert into public.institutions (id, name)
     values ($1, $2), ($3, $4)`,
    [
      fixture.institutionA.id,
      fixture.institutionA.name,
      fixture.institutionB.id,
      fixture.institutionB.name,
    ]
  );

  const profiles = [
    fixture.internal,
    fixture.otherInternal,
    fixture.designatedSenior,
    fixture.sameInstitutionSenior,
    fixture.newInstitutionSenior,
    fixture.admin,
  ];

  for (const profile of profiles) {
    await client.query(
      `insert into auth.users (
         id, aud, role, created_at, updated_at
       ) values ($1, 'authenticated', 'authenticated', now(), now())`,
      [profile.authUserId]
    );
    await client.query(
      `insert into public.profiles (
         id, auth_user_id, role, first_name, last_name, login_id,
         institution, institution_id, must_change_password, is_active
       ) values (
         $1, $2, $3::public.app_role, $4, $5, $6, $7, $8, false, true
       )`,
      [
        profile.profileId,
        profile.authUserId,
        profile.role,
        'Test',
        profile.role,
        profile.loginId,
        profile.institution,
        profile.institutionId,
      ]
    );
  }

  await client.query(
    `insert into public.surgical_intervention_definitions (
       id, name, status, definition
     ) values ($1, 'Intervention de test', 'active', $2::jsonb)`,
    [
      fixture.procedureId,
      JSON.stringify({
        allowedApproaches: ['voie_vaginale'],
        allowedEntryTechniques: [],
        checklistSteps: [{ id: 'step-1', label: 'Étape de test' }],
        indications: ['Test'],
        keyStepIds: ['step-1'],
        name: 'Intervention de test',
        requiresLaterality: false,
        status: 'active',
      }),
    ]
  );
  await client.query(
    `insert into public.trophy_definitions (
       id, title, status, definition, created_by_profile_id
     ) values
       ($1, 'Brouillon de test', 'draft', '{}'::jsonb, $3),
       ($2, 'Trophée actif de test', 'active', '{}'::jsonb, $3)`,
    [
      fixture.draftTrophyId,
      fixture.activeTrophyId,
      fixture.admin.profileId,
    ]
  );
}

async function impersonate(client, authUserId) {
  await client.query('reset role');
  let sessionId = integrationSessionByAuthUserId.get(authUserId);

  if (!sessionId) {
    sessionId = randomUUID();
    const tokenHash = createHash('sha256')
      .update(`integration-session:${sessionId}`)
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
       select
         $1::uuid,
         profile.id,
         profile.auth_user_id,
         $2,
         'web',
         1800
       from public.profiles profile
       where profile.auth_user_id = $3::uuid`,
      [sessionId, tokenHash, authUserId]
    );
    integrationSessionByAuthUserId.set(authUserId, sessionId);
  }

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
  await client.query('set local role authenticated');
}

async function verifyApplicationSessionLifecycle(client, internal) {
  const sessions = [
    { clientKind: 'web', id: randomUUID(), idleTimeout: 1800 },
    { clientKind: 'web', id: randomUUID(), idleTimeout: 1800 },
    { clientKind: 'mobile', id: randomUUID(), idleTimeout: null },
    { clientKind: 'mobile', id: randomUUID(), idleTimeout: null },
  ].map((session) => ({
    ...session,
    tokenHash: createHash('sha256')
      .update(`lifecycle:${session.id}`)
      .digest('hex'),
  }));

  for (const session of sessions) {
    await client.query(
      `insert into public.application_sessions (
         id,
         profile_id,
         auth_user_id,
         token_hash,
         client_kind,
         idle_timeout_seconds
       ) values ($1, $2, $3, $4, $5, $6)`,
      [
        session.id,
        internal.profileId,
        internal.authUserId,
        session.tokenHash,
        session.clientKind,
        session.idleTimeout,
      ]
    );
  }

  for (const session of sessions) {
    const resolved = await client.query(
      `select *
       from public.resolve_application_session($1, false)`,
      [session.tokenHash]
    );
    assert.equal(
      resolved.rowCount,
      1,
      'deux navigateurs et deux appareils doivent coexister'
    );
  }

  await client.query(
    `update public.application_sessions
     set last_seen_at = clock_timestamp() - interval '31 minutes'
     where id = $1`,
    [sessions[0].id]
  );
  const expiredBrowser = await client.query(
    `select *
     from public.resolve_application_session($1, false)`,
    [sessions[0].tokenHash]
  );
  assert.equal(
    expiredBrowser.rowCount,
    0,
    'seule la session web inactive doit expirer'
  );

  for (const session of sessions.slice(1)) {
    const stillActive = await client.query(
      `select *
       from public.resolve_application_session($1, false)`,
      [session.tokenHash]
    );
    assert.equal(
      stillActive.rowCount,
      1,
      'les autres navigateurs et appareils doivent rester connectés'
    );
  }

  await client.query(
    `select public.revoke_application_session($1, 'integration_cleanup')`,
    [sessions[1].id]
  );
  const cleanedBrowser = await client.query(
    `select *
     from public.resolve_application_session($1, false)`,
    [sessions[1].tokenHash]
  );
  assert.equal(
    cleanedBrowser.rowCount,
    0,
    'un nettoyage technique ne doit révoquer que la session courante'
  );

  for (const session of sessions.slice(2)) {
    const stillActive = await client.query(
      `select *
       from public.resolve_application_session($1, false)`,
      [session.tokenHash]
    );
    assert.equal(
      stillActive.rowCount,
      1,
      'le nettoyage d’un navigateur ne doit pas déconnecter les appareils mobiles'
    );
  }

  await client.query(
    `select public.revoke_all_application_sessions($1, 'integration_logout')`,
    [internal.profileId]
  );

  for (const session of sessions) {
    const revoked = await client.query(
      `select *
       from public.resolve_application_session($1, false)`,
      [session.tokenHash]
    );
    assert.equal(
      revoked.rowCount,
      0,
      'la déconnexion volontaire doit révoquer toutes les sessions'
    );
  }
}

async function runAs(client, authUserId, operation) {
  await impersonate(client, authUserId);

  try {
    return await operation();
  } finally {
    await client.query('reset role');
  }
}

async function expectDenied(client, authUserId, operation) {
  await client.query('reset role');
  await client.query('savepoint expected_denial');

  try {
    await impersonate(client, authUserId);
    await assert.rejects(operation, (error) => error?.code === '42501');
  } finally {
    await client.query('rollback to savepoint expected_denial');
    await client.query('release savepoint expected_denial');
    await client.query('reset role');
  }
}

async function expectDatabaseError(
  client,
  authUserId,
  expectedCode,
  operation
) {
  await client.query('reset role');
  await client.query('savepoint expected_database_error');

  try {
    await impersonate(client, authUserId);
    await assert.rejects(operation, (error) => error?.code === expectedCode);
  } finally {
    await client.query('rollback to savepoint expected_database_error');
    await client.query('release savepoint expected_database_error');
    await client.query('reset role');
  }
}

async function expectOwnerDatabaseError(client, expectedCode, operation) {
  await client.query('reset role');
  await client.query('savepoint expected_owner_database_error');

  try {
    await assert.rejects(operation, (error) => error?.code === expectedCode);
  } finally {
    await client.query('rollback to savepoint expected_owner_database_error');
    await client.query('release savepoint expected_owner_database_error');
    await client.query('reset role');
  }
}

async function createIntervention(
  client,
  fixture,
  { checklist = { 'step-1': '3' }, interventionId, mutationId, seniorProfileId }
) {
  return client.query(
    `select public.create_intervention(
       $1::uuid, $2::text, $3::uuid, $4::text, current_date, null::text,
       $5::text, $6::text, $7::text, $8::text, $9::text, $10::text,
       $11::integer, $12::text, $13::jsonb
     )`,
    [
      interventionId,
      mutationId,
      seniorProfileId,
      fixture.procedureId,
      '',
      'Test',
      'voie_vaginale',
      null,
      null,
      'programme',
      5,
      'operateur_principal',
      JSON.stringify(checklist),
    ]
  );
}

async function saveEvaluation(
  client,
  fixture,
  seniorProfileId,
  interventionVersion
) {
  return client.query(
    `select public.save_intervention_evaluation(
       $1::uuid, $2::bigint, null::bigint,
       '4'::text, '2'::text, 'Évaluation de test'::text
     )`,
    [fixture.interventionId, interventionVersion]
  );
}

async function deletePendingIntervention(
  client,
  interventionId,
  interventionVersion
) {
  return client.query(
    `select public.delete_pending_intervention($1::uuid, $2::bigint)`,
    [interventionId, interventionVersion]
  );
}

async function visibleInterventionCount(client, authUserId, interventionId) {
  const result = await runAs(client, authUserId, () =>
    client.query(
      'select count(*)::integer as count from public.interventions where id = $1',
      [interventionId]
    )
  );

  return result.rows[0].count;
}

async function visibleEvaluationCount(client, authUserId, interventionId) {
  const result = await runAs(client, authUserId, () =>
    client.query(
      `select count(*)::integer as count
       from public.intervention_evaluations
       where intervention_id = $1`,
      [interventionId]
    )
  );

  return result.rows[0].count;
}

async function directlyVisibleInternalProfileCount(client, authUserId, profileId) {
  const result = await runAs(client, authUserId, () =>
    client.query(
      'select count(*)::integer as count from public.profiles where id = $1',
      [profileId]
    )
  );

  return result.rows[0].count;
}

async function directoryInternalCount(client, authUserId, profileId) {
  const result = await runAs(client, authUserId, () =>
    client.query(
      `select count(*)::integer as count
       from public.list_visible_internal_directory()
       where id = $1`,
      [profileId]
    )
  );

  return result.rows[0].count;
}

async function visibleNotebookCount(client, authUserId, profileId) {
  const result = await runAs(client, authUserId, () =>
    client.query(
      `select count(*)::integer as count
       from public.notebook_documents
       where profile_id = $1`,
      [profileId]
    )
  );

  return result.rows[0].count;
}

async function readNotebookContent(client, authUserId, profileId) {
  const result = await runAs(client, authUserId, () =>
    client.query(
      `select content_html
       from public.notebook_documents
       where profile_id = $1`,
      [profileId]
    )
  );

  return result.rows[0]?.content_html ?? null;
}

async function visibleActivityCount(client, authUserId, profileId) {
  const result = await runAs(client, authUserId, () =>
    client.query(
      `select count(*)::integer as count
       from public.activity_log
       where profile_id = $1`,
      [profileId]
    )
  );

  return result.rows[0].count;
}

async function insertForgedActivity(client, profileId) {
  return client.query(
    `insert into public.activity_log (
       profile_id, actor_role, actor_label, action, target_type, target_label
     ) values (
       $1, 'admin'::public.app_role, 'Faux administrateur',
       'Action forgée', 'Test', 'Test'
     )`,
    [profileId]
  );
}

async function trophyDefinitionCount(client, trophyId) {
  await client.query('reset role');
  const result = await client.query(
    `select count(*)::integer as count
     from public.trophy_definitions
     where id = $1`,
    [trophyId]
  );

  return result.rows[0].count;
}

async function countRows(client, tableName, interventionId) {
  await client.query('reset role');
  const identifier = ['interventions', 'evaluation_requests', 'intervention_evaluations'].includes(
    tableName
  )
    ? tableName
    : null;

  if (!identifier) {
    throw new Error('Table de test non autorisée.');
  }

  const identityColumn =
    tableName === 'interventions' ? 'id' : 'intervention_id';
  const result = await client.query(
    `select count(*)::integer as count from public.${identifier} where ${identityColumn} = $1`,
    [interventionId]
  );

  return result.rows[0].count;
}

async function readInterventionVersion(client, interventionId) {
  await client.query('reset role');
  const result = await client.query(
    'select version from public.interventions where id = $1',
    [interventionId]
  );

  return result.rows[0].version;
}

async function readProfileVersion(client, profileId) {
  await client.query('reset role');
  const result = await client.query(
    'select version from public.profiles where id = $1',
    [profileId]
  );

  return result.rows[0].version;
}

async function readEvaluationRequestStatus(client, interventionId) {
  await client.query('reset role');
  const result = await client.query(
    'select status from public.evaluation_requests where intervention_id = $1',
    [interventionId]
  );

  return result.rows[0].status;
}

async function pendingDeletionAuditCount(
  client,
  profileId,
  procedureId
) {
  await client.query('reset role');
  const result = await client.query(
    `select count(*)::integer as count
     from public.activity_log
     where profile_id = $1
       and action = 'Suppression d’une intervention en attente'
       and target_label = $2`,
    [profileId, procedureId]
  );

  return result.rows[0].count;
}
