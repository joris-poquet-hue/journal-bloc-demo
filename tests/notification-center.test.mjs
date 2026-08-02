import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const migration = readSource(
  '../supabase/migrations/202608020002_common_notification_center.sql'
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
  assert.match(migration, /retract_admin_notification_message/);
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
  assert.match(welcomeScreen, /notification\.actionType === 'trophy'/);
  assert.match(welcomeScreen, /notification\.actionType === 'intervention'/);
  assert.match(appContext, /historyNavigationInterventionId/);
  assert.match(appContext, /trophyNavigationId/);
});
