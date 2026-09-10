import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL(
    '../supabase/migrations/202609010001_permanent_profile_deletion.sql',
    import.meta.url
  ),
  'utf8'
);

test('la suppression définitive utilise une saga Auth récupérable', () => {
  assert.match(
    migration,
    /create table if not exists public\.profile_deletion_requests/i
  );
  assert.match(migration, /auth_user_id uuid unique/i);
  assert.doesNotMatch(
    migration,
    /profile_deletion_requests[\s\S]{0,500}auth_user_id uuid not null/i
  );
  assert.doesNotMatch(
    migration,
    /profile_deletion_requests[\s\S]{0,500}references auth\.users/i
  );
  assert.match(
    migration,
    /create or replace function public\.prepare_disabled_profile_deletion/i
  );
  assert.match(
    migration,
    /create or replace function public\.finalize_disabled_profile_deletion/i
  );
  assert.match(
    migration,
    /if deletion_request\.id is not null[\s\S]*'alreadyPrepared', true/i
  );
  assert.match(
    migration,
    /insert into public\.profile_deletion_requests[\s\S]*update public\.profiles[\s\S]*auth_user_id = null/i
  );
  assert.match(
    migration,
    /case when target_profile\.auth_user_id is null[\s\S]*target_profile\.version/i
  );
});

test('prepare exige un Administrateur actif, une cible inactive, la version et une confirmation exacte', () => {
  assert.match(
    migration,
    /profile\.role = 'admin'::public\.app_role[\s\S]*profile\.is_active[\s\S]*for share/i
  );
  assert.match(
    migration,
    /where profile\.id = p_profile_id[\s\S]*for update/i
  );
  assert.match(
    migration,
    /target_profile\.id = actor_profile\.id[\s\S]*ne peut pas être supprimé/i
  );
  assert.match(
    migration,
    /if target_profile\.is_active[\s\S]*doit être désactivé/i
  );
  assert.match(
    migration,
    /normalized_confirmation[\s\S]*is distinct from target_profile\.login_id::text/i
  );
  assert.doesNotMatch(
    migration,
    /normalized_confirmation::extensions\.citext/i
  );
  assert.match(
    migration,
    /target_profile\.version <> p_expected_version[\s\S]*40001/i
  );
});

test('finalize refuse tant que Auth existe et respecte les gardes immuables', () => {
  assert.match(
    migration,
    /from auth\.users auth_user[\s\S]*auth_user\.id = deletion_request\.auth_user_id[\s\S]*doit être supprimée avant la finalisation/i
  );
  assert.match(
    migration,
    /profile_permanent_deletion_is_allowed\(\)[\s\S]*current_setting\('app\.allow_profile_permanent_deletion'/i
  );
  assert.match(
    migration,
    /protect_intervention_immutability[\s\S]*profile_permanent_deletion_is_allowed\(\)[\s\S]*tg_op in \('UPDATE', 'DELETE'\)/i
  );
  assert.match(
    migration,
    /protect_evaluation_immutability[\s\S]*profile_permanent_deletion_is_allowed\(\)[\s\S]*tg_op in \('UPDATE', 'DELETE'\)/i
  );
  const auditStart = migration.indexOf(
    'create or replace function public.audit_versioned_record()'
  );
  const auditEnd = migration.indexOf(
    'create or replace function public.prevent_profile_history_delete()',
    auditStart
  );
  const auditFunction = migration.slice(auditStart, auditEnd);
  assert.match(
    auditFunction,
    /current_setting\('app\.allow_profile_permanent_deletion'[\s\S]*new\.version := old\.version[\s\S]*new\.updated_at := old\.updated_at[\s\S]*return new[\s\S]*new\.version := old\.version \+ 1[\s\S]*new\.updated_at := now\(\)[\s\S]*new\.updated_by_profile_id := coalesce/i
  );
  assert.doesNotMatch(
    auditFunction,
    /profile_permanent_deletion_is_allowed\(\)/i
  );
  assert.match(
    migration,
    /prevent_profile_history_delete[\s\S]*profile_permanent_deletion_is_allowed\(\)[\s\S]*interval '15 minutes'[\s\S]*pending_activation/i
  );
});

test('le rollback direct reste limité à un profil pending neuf et vide', () => {
  const guardStart = migration.indexOf(
    'create or replace function public.prevent_profile_history_delete()'
  );
  const guardEnd = migration.indexOf(
    'create or replace function public.protect_profile_account_lifecycle()',
    guardStart
  );
  const guard = migration.slice(guardStart, guardEnd);

  assert.ok(guardStart >= 0 && guardEnd > guardStart);
  assert.match(guard, /old\.created_at[\s\S]*interval '15 minutes'/i);
  assert.match(guard, /raw_app_meta_data[\s\S]*pending_activation/i);
  assert.match(
    guard,
    /auth\.jwt\(\) ->> 'role'[\s\S]*current_setting\('request\.jwt\.claim\.role'[\s\S]*= 'service_role'/i
  );
  assert.match(guard, /and not exists \([\s\S]*public\.interventions/i);
  assert.match(guard, /and not exists \([\s\S]*public\.application_sessions/i);
  assert.match(
    guard,
    /public\.admin_notification_messages[\s\S]*audience_profile_id = old\.id[\s\S]*created_by_profile_id = old\.id/i
  );
  assert.match(
    guard,
    /raise exception[\s\S]*finalisation atomique de suppression définitive/i
  );
});

test('un profil préparé est verrouillé contre toute mise à jour concurrente', () => {
  const guardStart = migration.indexOf(
    'create or replace function public.protect_profile_account_lifecycle()'
  );
  const guardEnd = migration.indexOf(
    'create or replace function public.protect_intervention_immutability()',
    guardStart
  );
  const guard = migration.slice(guardStart, guardEnd);

  assert.ok(guardStart >= 0 && guardEnd > guardStart);
  assert.match(
    guard,
    /not public\.profile_permanent_deletion_is_allowed\(\)[\s\S]*profile_deletion_requests[\s\S]*suppression définitive en cours/i
  );
  assert.match(
    guard,
    /drop trigger if exists protect_profile_account_lifecycle[\s\S]*create trigger protect_profile_account_lifecycle[\s\S]*before update on public\.profiles/i
  );
  assert.match(
    migration,
    /insert into public\.profile_deletion_requests[\s\S]*set_config\([\s\S]*app\.allow_profile_permanent_deletion[\s\S]*update public\.profiles/i
  );
});

test('les phases SQL concurrentes sont sérialisées sans dérive de version', () => {
  const prepareStart = migration.indexOf(
    'create or replace function public.prepare_disabled_profile_deletion('
  );
  const finalizeStart = migration.indexOf(
    'create or replace function public.finalize_disabled_profile_deletion('
  );
  const prepare = migration.slice(prepareStart, finalizeStart);
  const finalize = migration.slice(finalizeStart);
  const prepareAdvisoryLockIndex = prepare.indexOf(
    "pg_advisory_xact_lock(\n    hashtext('project1-profile-permanent-deletion')"
  );
  const prepareProfileLockIndex = prepare.indexOf(
    'where profile.id = p_actor_profile_id'
  );
  const advisoryLockIndex = finalize.indexOf(
    "pg_advisory_xact_lock(\n    hashtext('project1-profile-permanent-deletion')"
  );
  const targetLockIndex = finalize.indexOf(
    'where profile.id = deletion_request.profile_id\n  for update'
  );

  assert.ok(prepareStart >= 0 && finalizeStart > prepareStart);
  assert.ok(
    prepareAdvisoryLockIndex >= 0 &&
      prepareAdvisoryLockIndex < prepareProfileLockIndex
  );
  assert.ok(advisoryLockIndex >= 0 && advisoryLockIndex < targetLockIndex);
  assert.doesNotMatch(finalize, /update public\.profile_deletion_requests pending_request/i);
});

test('une auto-référence updated_by historique de la cible est neutralisée', () => {
  assert.match(
    migration,
    /update public\.profiles profile\s+set updated_by_profile_id = null\s+where profile\.id = target_profile\.id\s+and profile\.updated_by_profile_id = target_profile\.id;/i
  );
});

test('les interventions de la cible, leurs évaluations et leur progression sont purgées de façon cohérente', () => {
  assert.match(
    migration,
    /intervention\.internal_profile_id = target_profile\.id[\s\S]*or intervention\.senior_profile_id = target_profile\.id/i
  );
  assert.match(
    migration,
    /delete from public\.evaluation_requests[\s\S]*delete from public\.intervention_evaluations[\s\S]*delete from public\.interventions/i
  );
  assert.match(
    migration,
    /foreach affected_internal_profile_id[\s\S]*rebuild_profile_trophy_awards/i
  );
  assert.match(
    migration,
    /delete from public\.user_notifications[\s\S]*notification\.evaluation_id = any\(affected_intervention_ids\)/i
  );
  assert.match(
    migration,
    /notification\.kind = 'trophy_awarded'[\s\S]*notification\.award_event_id = any\(affected_trophy_award_ids\)[\s\S]*notification\.profile_id = any\(affected_internal_profile_ids\)[\s\S]*not exists[\s\S]*public\.trophy_awards/i
  );
  assert.match(
    migration,
    /select coalesce\(array_agg\(award\.id\)[\s\S]*into affected_trophy_award_ids[\s\S]*award\.profile_id = any\(affected_internal_profile_ids\)/i
  );
});

test('la saga neutralise les rebuilds trophées ligne par ligne puis reconstruit en lot', () => {
  const triggerStart = migration.indexOf(
    'create or replace function public.refresh_trophies_after_intervention_change()'
  );
  const triggerEnd = migration.indexOf(
    'create or replace function public.prepare_disabled_profile_deletion(',
    triggerStart
  );
  const triggerFunction = migration.slice(triggerStart, triggerEnd);

  assert.ok(triggerStart >= 0 && triggerEnd > triggerStart);
  assert.match(
    triggerFunction,
    /current_setting\('app\.allow_profile_permanent_deletion'[\s\S]*return case when tg_op = 'DELETE' then old else new end[\s\S]*rebuild_profile_trophy_awards/i
  );
  assert.match(
    migration,
    /foreach affected_internal_profile_id in array affected_internal_profile_ids[\s\S]*rebuild_profile_trophy_awards/i
  );
});

test('les traces nominatives ambiguës ne déclenchent aucune sur-suppression', () => {
  assert.doesNotMatch(migration, /target_display_name_is_unique/i);
  assert.doesNotMatch(
    migration,
    /activity\.target_label\s*=\s*target_display_name/i
  );
  assert.doesNotMatch(
    migration,
    /item\s*->>\s*'targetLabel'\s*=\s*target_display_name/i
  );
});

test('les nouvelles activités ciblant un profil dérivent identité et visibilité côté SQL', () => {
  const rpcStart = migration.indexOf(
    'create or replace function public.record_profile_target_activity_event('
  );
  const rpcEnd = migration.indexOf(
    'create or replace function public.prepare_disabled_profile_deletion(',
    rpcStart
  );
  const rpc = migration.slice(rpcStart, rpcEnd);

  assert.ok(rpcStart >= 0 && rpcEnd > rpcStart);
  assert.match(rpc, /profile\.id = public\.current_profile_id\(\)[\s\S]*profile\.is_active/i);
  assert.match(rpc, /where profile\.id = p_target_profile_id[\s\S]*for share/i);
  assert.match(
    rpc,
    /view_internal_statistics[\s\S]*target_profile\.role <> 'internal'[\s\S]*can_read_internal\(target_profile\.id\)/i
  );
  assert.match(
    rpc,
    /prepare_reminder_email[\s\S]*actor\.role <> 'admin'[\s\S]*target_profile\.role not in/i
  );
  assert.match(
    rpc,
    /target_profile\.first_name[\s\S]*target_profile\.last_name[\s\S]*'kind', 'profile_target'[\s\S]*'targetProfileId', target_profile\.id/i
  );
  assert.match(
    rpc,
    /target_label,[\s\S]*target_profile_id,[\s\S]*values[\s\S]*target_profile\.id/i
  );
  assert.match(
    rpc,
    /revoke all on function public\.record_profile_target_activity_event\(text, uuid\)[\s\S]*grant execute[\s\S]*to authenticated, service_role/i
  );
});

test('les activités ciblées portent une FK cascade robuste aux courses', () => {
  assert.match(
    migration,
    /alter table public\.activity_log[\s\S]*add column if not exists target_profile_id uuid/i
  );
  assert.match(
    migration,
    /constraint activity_log_target_profile_id_fkey[\s\S]*foreign key \(target_profile_id\)[\s\S]*references public\.profiles\(id\)[\s\S]*on delete cascade/i
  );
  assert.match(
    migration,
    /create index if not exists activity_log_target_profile_id_idx[\s\S]*target_profile_id/i
  );
  assert.match(
    migration,
    /activity\.analytics_event ->> 'targetProfileId'[\s\S]*delete from public\.activity_log[\s\S]*activity\.target_profile_id = target_profile\.id/i
  );
  const linkerStart = migration.indexOf(
    'create or replace function public.link_institution_move_activity_target()'
  );
  const linkerEnd = migration.indexOf(
    'create or replace function public.profile_permanent_deletion_is_allowed()',
    linkerStart
  );
  const linker = migration.slice(linkerStart, linkerEnd);

  assert.ok(linkerStart >= 0 && linkerEnd > linkerStart);
  assert.match(
    linker,
    /new\.analytics_event ->> 'targetProfileId'[\s\S]*analytics_target_id_text::uuid[\s\S]*new\.target_profile_id := analytics_target_id/i
  );
  assert.match(
    linker,
    /new\.target_profile_id is distinct from analytics_target_id[\s\S]*identifiants de profil cible de l’audit sont incohérents/i
  );
});

test('un changement d’établissement journalise durablement le profil déplacé', () => {
  const captureStart = migration.indexOf(
    'create or replace function public.capture_institution_move_activity_target()'
  );
  const captureEnd = migration.indexOf(
    'create or replace function public.profile_permanent_deletion_is_allowed()',
    captureStart
  );
  const triggers = migration.slice(captureStart, captureEnd);

  assert.ok(captureStart >= 0 && captureEnd > captureStart);
  assert.match(
    triggers,
    /current_setting\('app\.allow_institution_move'[\s\S]*old\.institution_id is distinct from new\.institution_id[\s\S]*app\.institution_move_target_profile_id[\s\S]*new\.id::text/i
  );
  assert.match(
    triggers,
    /after update of institution_id on public\.profiles[\s\S]*capture_institution_move_activity_target/i
  );
  assert.match(
    triggers,
    /new\.action = 'Changement d’établissement'[\s\S]*app\.institution_move_target_profile_id[\s\S]*new\.target_profile_id := captured_target_id[\s\S]*'targetProfileId', captured_target_id/i
  );
  assert.match(
    triggers,
    /before insert on public\.activity_log[\s\S]*link_institution_move_activity_target/i
  );
  assert.match(
    triggers,
    /revoke all on function public\.capture_institution_move_activity_target\(\)[\s\S]*revoke all on function public\.link_institution_move_activity_target\(\)[\s\S]*from public, anon, authenticated, service_role/i
  );
});

test('la confirmation e-mail pending fusionne les métadonnées sous verrou', () => {
  const rpcStart = migration.indexOf(
    'create or replace function public.store_pending_email_confirmation('
  );
  const rpcEnd = migration.indexOf(
    'create or replace function public.prepare_disabled_profile_deletion(',
    rpcStart
  );
  const rpc = migration.slice(rpcStart, rpcEnd);

  assert.ok(rpcStart >= 0 && rpcEnd > rpcStart);
  assert.match(rpc, /where profile\.id = p_profile_id[\s\S]*for update/i);
  assert.match(
    rpc,
    /profile_deletion_requests[\s\S]*suppression définitive est en cours/i
  );
  assert.match(
    rpc,
    /metadata = coalesce\(profile\.metadata, '\{\}'::jsonb\) \|\| jsonb_build_object\([\s\S]*pendingContactEmail[\s\S]*pendingEmailPurpose[\s\S]*pendingEmailRequestedAt/i
  );
  assert.doesNotMatch(rpc, /metadata:\s*\{\s*\.\.\./i);
  assert.match(
    rpc,
    /revoke all on function public\.store_pending_email_confirmation\([\s\S]*from public, anon, authenticated, service_role[\s\S]*grant execute[\s\S]*to service_role/i
  );
});

test('les audits d’évaluation identifiés seulement par intervention sont supprimés', () => {
  assert.match(
    migration,
    /activity\.target_type = 'Intervention'[\s\S]*activity\.target_label = affected\.intervention_id::text/i
  );
});

test('seuls les messages admin exclusivement ciblés sont supprimés', () => {
  assert.match(
    migration,
    /alter table public\.admin_notification_messages[\s\S]*alter column created_by_profile_id drop not null/i
  );
  assert.match(
    migration,
    /delete from public\.admin_notification_messages message\s+where message\.audience_profile_id = target_profile\.id;/i
  );
  const messageDelete = migration.match(
    /delete from public\.admin_notification_messages[\s\S]*?;/i
  )?.[0] ?? '';
  assert.doesNotMatch(messageDelete, /created_by_profile_id/i);
  assert.match(
    migration,
    /update public\.admin_notification_messages message\s+set created_by_profile_id = null\s+where message\.created_by_profile_id = target_profile\.id;/i
  );
});

test('chaque table portant une FK profiles est explicitement couverte', () => {
  const profileForeignKeyTables = [
    'profiles',
    'senior_internal_assignments',
    'surgical_intervention_definitions',
    'interventions',
    'intervention_evaluations',
    'notebook_documents',
    'trophy_definitions',
    'trophy_awards',
    'activity_log',
    'test_feedback',
    'evaluation_requests',
    'institutions',
    'application_sessions',
    'autonomy_score_formulas',
    'trophy_definition_drafts',
    'trophy_definition_versions',
    'user_notifications',
    'push_subscriptions',
    'admin_notification_messages',
    'profile_deletion_requests',
  ];

  for (const tableName of profileForeignKeyTables) {
    assert.match(
      migration,
      new RegExp(`public\\.${tableName}\\b`, 'i'),
      `La purge doit couvrir ${tableName}.`
    );
  }

  assert.match(
    migration,
    /constraint_row\.confrelid = 'public\.profiles'::regclass[\s\S]*Référence résiduelle/i
  );
});

test('les copies héritées sont purgées sans supprimer les référentiels globaux', () => {
  assert.match(migration, /to_regclass\('public\.app_state'\) is not null/i);
  for (const stateKey of [
    'internal_profiles',
    'custom_seniors',
    'saved_interventions',
    'saved_obstetric_gestures',
    'notebook_documents',
    'admin_evaluations',
    'activity_log',
  ]) {
    assert.match(migration, new RegExp(`'${stateKey}'`));
  }
  assert.match(
    migration,
    /update public\.app_state state[\s\S]*data = public\.scrub_profile_audit_json\(state\.data, target_profile\.id\)[\s\S]*state\.key in \([\s\S]*'custom_surgical_interventions'[\s\S]*'admin_trophies'/i
  );
  assert.doesNotMatch(
    migration,
    /delete from public\.app_state[\s\S]*custom_surgical_interventions|delete from public\.app_state[\s\S]*admin_trophies/i
  );
  assert.match(
    migration,
    /state\.key = 'saved_interventions'[\s\S]*nullif\(item ->> 'id', ''\) is not null/i
  );
  assert.match(
    migration,
    /state\.key = 'saved_obstetric_gestures'[\s\S]{0,2500}item ->> 'internalId'[\s\S]*item ->> 'seniorId'|item ->> 'internalId'[\s\S]*item ->> 'seniorId'[\s\S]{0,2500}state\.key = 'saved_obstetric_gestures'/i
  );
  assert.doesNotMatch(
    migration,
    /profile_item\s*->>\s*'loginId'[\s\S]*target_profile\.login_id/i
  );
  assert.doesNotMatch(
    migration,
    /item\s*->>\s*'loginId'[\s\S]{0,120}target_profile\.login_id/i
  );
});

test('les UUID auteur et modificateur sont retirés récursivement des JSON conservés', () => {
  assert.match(
    migration,
    /create or replace function public\.scrub_profile_audit_json\([\s\S]*ownerProfileId[\s\S]*owner_profile_id[\s\S]*createdByProfileId[\s\S]*created_by_profile_id[\s\S]*updatedByProfileId[\s\S]*updated_by_profile_id/i
  );
  assert.match(
    migration,
    /jsonb_agg\([\s\S]*order by item\.ordinality[\s\S]*jsonb_array_elements\(p_document\) with ordinality/i
  );

  for (const jsonTarget of [
    'definition.definition',
    'intervention.definition_snapshot',
    'formula.definition',
    'draft.definition',
    'version_row.definition',
  ]) {
    assert.match(
      migration,
      new RegExp(
        `scrub_profile_audit_json\\([\\s\\S]{0,120}${jsonTarget.replaceAll('.', '\\.')}`,
        'i'
      ),
      `Le JSON ${jsonTarget} doit être nettoyé.`
    );
  }

  assert.match(
    migration,
    /revoke all on function public\.scrub_profile_audit_json\(jsonb, uuid\)[\s\S]*from public, anon, authenticated/i
  );
  const draftUpdate = migration.match(
    /update public\.trophy_definition_drafts draft[\s\S]*?;/i
  )?.[0] ?? '';
  assert.doesNotMatch(draftUpdate, /version = draft\.version \+ 1|updated_at =/i);
  assert.doesNotMatch(migration, /insert into public\.trophy_definition_versions/i);
});

test('la télémétrie anti-abus expirée suit une rétention privée et idempotente', () => {
  const purgeStart = migration.indexOf(
    'create or replace function public.purge_expired_auth_rate_limits()'
  );
  const purgeEnd = migration.indexOf(
    'comment on table public.profile_deletion_requests',
    purgeStart
  );
  const purgeBlock = migration.slice(purgeStart, purgeEnd);

  assert.ok(purgeStart >= 0 && purgeEnd > purgeStart);
  assert.match(
    purgeBlock,
    /delete from public\.auth_rate_limits[\s\S]*updated_at < purge_time - interval '1 hour'[\s\S]*blocked_until is null[\s\S]*blocked_until <= purge_time/i
  );
  assert.match(
    purgeBlock,
    /get diagnostics deleted_row_count = row_count[\s\S]*return deleted_row_count/i
  );
  assert.match(
    purgeBlock,
    /revoke all on function public\.purge_expired_auth_rate_limits\(\)[\s\S]*from public, anon, authenticated, service_role/i
  );
  assert.match(
    purgeBlock,
    /create extension if not exists pg_cron[\s\S]*if not exists \([\s\S]*from cron\.job[\s\S]*jobname = 'monjdb-purge-expired-auth-rate-limits'[\s\S]*cron\.schedule\([\s\S]*'0 \* \* \* \*'[\s\S]*select public\.purge_expired_auth_rate_limits\(\);/i
  );
});

test('les RPC destructives sont réservées au service_role', () => {
  assert.match(
    migration,
    /'deletedProfileId', target_profile\.id/i
  );
  assert.match(
    migration,
    /revoke all on function public\.prepare_disabled_profile_deletion\([\s\S]*from public, anon, authenticated[\s\S]*grant execute[\s\S]*to service_role/i
  );
  assert.match(
    migration,
    /revoke all on function public\.finalize_disabled_profile_deletion\(uuid, uuid\)[\s\S]*from public, anon, authenticated[\s\S]*grant execute[\s\S]*to service_role/i
  );
  assert.match(
    migration,
    /alter table public\.profile_deletion_requests enable row level security/i
  );
  assert.match(
    migration,
    /revoke all on table public\.profile_deletion_requests[\s\S]*from public, anon, authenticated, service_role/i
  );
  assert.doesNotMatch(
    migration,
    /grant (?:select|insert|update|delete)[\s\S]*profile_deletion_requests[\s\S]*to service_role/i
  );
});
