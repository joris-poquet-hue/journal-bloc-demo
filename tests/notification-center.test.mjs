import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const migration = readSource(
  '../supabase/migrations/202608020002_common_notification_center.sql'
);
const internalLinkRemovalMigration = readSource(
  '../supabase/migrations/202608120001_remove_admin_internal_notification_links.sql'
);
const notificationStatisticsMigration = readSource(
  '../supabase/migrations/202608120002_admin_notification_statistics.sql'
);
const irreversibleMessagesMigration = readSource(
  '../supabase/migrations/202608120003_irreversible_admin_notifications.sql'
);
const context = readSource('../CONTEXTE_PROJET.md');
const appContext = readSource('../src/context/AppContext.tsx');
const repository = readSource('../src/services/backendRepository.ts');
const notificationCenter = readSource(
  '../src/components/NotificationCenter.tsx'
);
const notificationAvatar = readSource(
  '../src/components/NotificationAvatarButton.tsx'
);
const welcomeScreen = readSource('../src/screens/WelcomeScreen.tsx');
const seniorDashboard = readSource(
  '../src/screens/admin/SeniorDashboard.tsx'
);
const adminScreen = readSource('../src/screens/AdminScreen.tsx');
const adminManager = readSource(
  '../src/screens/admin/AdminNotificationsManager.tsx'
);

test('les notifications automatiques sont dédupliquées et réservées à l’Interne', () => {
  assert.match(
    migration,
    /Vous avez obtenu un nouveau trophée : '\s*\|\|\s*definition\.title\s*\|\|\s*' !/
  );
  assert.match(
    migration,
    /Une évaluation a été complétée par/
  );
  assert.match(
    migration,
    /profile\.role = 'internal'::public\.app_role/
  );
  assert.match(
    migration,
    /internal_profile\.role = 'internal'::public\.app_role\s+and internal_profile\.is_active/
  );
  assert.match(migration, /'evaluation:' \|\| new\.intervention_id::text/);
  assert.match(migration, /user_notifications_source_key_idx/);
  assert.match(migration, /on conflict \(source_key\) do nothing/);
  assert.match(context, /Le Senior ne reçoit aucune notification automatique/);
  assert.match(context, /L'Administrateur ne reçoit aucune notification/);
});

test('les messages Administrateur couvrent les quatre ciblages et la programmation', () => {
  assert.match(
    migration,
    /audience_type in \('all', 'role', 'institution', 'profile'\)/
  );
  assert.match(
    migration,
    /profile\.role in \('internal'::public\.app_role, 'senior'::public\.app_role\)/
  );
  assert.match(migration, /and profile\.is_active/);
  assert.match(migration, /create_admin_notification_message/);
  assert.match(migration, /update_admin_notification_message/);
  assert.match(migration, /cancel_admin_notification_message/);
  assert.match(migration, /dispatch_due_admin_notification_messages/);
  assert.match(migration, /cron\.schedule/);
  assert.match(migration, /action_type = 'external_url' and action_target ~\* '\^https:\/\/'/);
  assert.match(adminManager, /Tous les utilisateurs/);
  assert.match(adminManager, /Par établissement/);
  assert.match(adminManager, /Un utilisateur précis/);
  assert.match(adminManager, /Programmer/);
  assert.match(adminManager, /Aperçu/);
  assert.match(adminManager, /destinataire/);
});

test('un message Administrateur exige une confirmation et devient définitif après envoi', () => {
  assert.match(adminManager, /aria-modal="true"/);
  assert.match(adminManager, /Confirmer l’envoi/);
  assert.match(adminManager, /Confirmer la programmation/);
  assert.match(adminManager, /Destinataires estimés/);
  assert.match(adminManager, /ne pourra plus être retiré/);
  assert.doesNotMatch(adminManager, /retractBackendAdminNotificationMessage/);
  assert.doesNotMatch(adminManager, />\s*Retirer\s*</);
  assert.doesNotMatch(repository, /retractBackendAdminNotificationMessage/);
  assert.match(
    irreversibleMessagesMigration,
    /revoke all on function public\.retract_admin_notification_message\(uuid\)/
  );
  assert.match(
    irreversibleMessagesMigration,
    /drop function if exists public\.retract_admin_notification_message\(uuid\)/
  );
  assert.match(context, /fenêtre récapitulative[\s\S]*confirmation explicite/);
  assert.match(context, /il ne peut plus être retiré des centres de notifications/);
});

test('la lecture respecte les deux politiques de conservation', () => {
  assert.match(migration, /deletion_policy in \('on_read', 'manual'\)/);
  assert.match(
    migration,
    /when notification\.deletion_policy = 'on_read'[\s\S]*deleted_at/
  );
  assert.match(migration, /mark_all_user_notifications_read/);
  assert.match(
    migration,
    /notification\.deletion_policy = 'manual'/
  );
  assert.match(notificationCenter, /Tout marquer comme lu/);
  assert.match(notificationCenter, /notification-center__item--unread/);
  assert.match(notificationCenter, /notification-center__delete/);
  assert.match(appContext, /notification\.deletionPolicy === 'on_read'/);
  assert.match(repository, /rpc\/mark_user_notification_read/);
  assert.match(repository, /rpc\/delete_user_notification/);
});

test('l’Interne et le Senior partagent le centre, sans centre Administrateur', () => {
  assert.match(welcomeScreen, /<NotificationAvatarButton/);
  assert.match(welcomeScreen, /<NotificationCenter/);
  assert.match(seniorDashboard, /<NotificationAvatarButton/);
  assert.match(seniorDashboard, /<NotificationCenter/);
  assert.match(notificationAvatar, /notification-avatar-button--unread/);
  assert.match(notificationAvatar, /notification-avatar-button__count/);
  assert.doesNotMatch(adminScreen, /<NotificationCenter/);
  assert.match(adminScreen, /<AdminNotificationsManager/);
});

test('les actions ouvrent les détails métier et signalent les liens externes', () => {
  assert.match(notificationCenter, /window\.open\([^)]*'_blank'/s);
  assert.match(notificationCenter, /<ExternalLink/);
  assert.match(notificationCenter, /notification\.actionLabel/);
  assert.match(notificationCenter, /notification-center__action/);
  assert.ok(
    notificationCenter.indexOf('window.open(') <
      notificationCenter.indexOf('await onRead(notification.id)')
  );
  assert.match(welcomeScreen, /notification\.actionType === 'trophy'/);
  assert.match(welcomeScreen, /notification\.actionType === 'intervention'/);
  assert.match(appContext, /historyNavigationInterventionId/);
  assert.match(appContext, /trophyNavigationId/);
});

test('les statistiques Administrateur sont agrégées côté Supabase', () => {
  assert.match(
    repository,
    /rpc\/list_admin_notification_messages_with_stats/
  );
  assert.match(
    notificationStatisticsMigration,
    /message\.status = 'scheduled'[\s\S]*admin_notification_recipient_ids/
  );
  assert.match(
    notificationStatisticsMigration,
    /count\(\*\) filter \(where notification\.read_at is null\)/
  );
  assert.match(
    notificationStatisticsMigration,
    /count\(\*\) filter \(where notification\.read_at is not null\)/
  );

  const loaderSource = repository.slice(
    repository.indexOf('export async function loadBackendAdminNotificationMessages'),
    repository.indexOf('export async function countBackendAdminNotificationRecipients')
  );

  assert.doesNotMatch(loaderSource, /selectSupabaseRows/);
  assert.doesNotMatch(loaderSource, /user_notifications/);
});

test('les messages Administrateur ne proposent plus de destination interne', () => {
  assert.doesNotMatch(adminManager, /internal_path|Page de l.application/);
  assert.doesNotMatch(welcomeScreen, /internal_path/);
  assert.doesNotMatch(seniorDashboard, /internal_path/);
  assert.match(
    internalLinkRemovalMigration,
    /where action_type = 'internal_path'/
  );
  assert.match(
    internalLinkRemovalMigration,
    /action_type in \('trophy', 'intervention', 'external_url'\)/
  );
  assert.match(context, /ne proposent aucun lien interne/);
});
