import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const migration = readSource(
  '../supabase/migrations/202607290001_trophy_authority_versioning_notifications.sql'
);
const optionalDescriptionMigration = readSource(
  '../supabase/migrations/202608020001_optional_trophy_descriptions.sql'
);
const legacyRepairMigration = readSource(
  '../supabase/migrations/202607290000_repair_legacy_trophy_definitions.sql'
);
const backendRepository = readSource('../src/services/backendRepository.ts');
const appContext = readSource('../src/context/AppContext.tsx');
const adminScreen = readSource('../src/screens/AdminScreen.tsx');
const trophyDisplay = readSource('../src/utils/trophyDisplay.ts');
const trophiesScreen = readSource('../src/screens/TrophiesScreen.tsx');
const trophyRules = readSource('../src/utils/adminTrophies.ts');
const legacyMobile = readSource('../mobile/App.tsx');
const imageApi = readSource('../api/trophy-image.js');
const backendApi = readSource('../api/backend.js');
const pushApi = readSource('../api/push-subscription.js');
const pushDispatcher = readSource('../src/pushNotifications.cjs');
const mobileShell = readSource('../mobile/WebAppShell.tsx');

test('Supabase est l’unique autorité des définitions et des attributions', () => {
  assert.match(
    migration,
    /revoke select, insert, update, delete[\s\S]*on table public\.trophy_definitions[\s\S]*from authenticated/i
  );
  assert.match(
    migration,
    /revoke insert, update, delete[\s\S]*on table public\.trophy_awards[\s\S]*from authenticated/i
  );
  assert.match(
    backendRepository,
    /rpc\/list_visible_trophy_definitions/
  );
  assert.match(trophyDisplay, /const profileAwards = trophyAwards\.filter/);
  assert.match(
    adminScreen,
    /const authoritativeAwards[\s\S]*trophyAwards\.filter/
  );
  assert.doesNotMatch(
    trophyDisplay,
    /snapshot\.awardedAt[\s\S]{0,80}isEarned/
  );
});

test('la réparation historique accepte une base sans anciens trophées', () => {
  assert.match(
    legacyRepairMigration,
    /Le trophée historique Salpingectomie est absent : aucune réparation nécessaire/i
  );
  assert.match(
    legacyRepairMigration,
    /Le trophée historique Aspiration est absent : aucune réparation nécessaire/i
  );
  assert.doesNotMatch(
    legacyRepairMigration,
    /raise exception 'Le trophée historique (Salpingectomie|Aspiration) est introuvable/i
  );
});

test('la progression par connexions vient du compteur serveur partagé', () => {
  assert.match(
    migration,
    /create function public\.list_visible_internal_directory\(\)[\s\S]*login_count integer[\s\S]*from public\.activity_log activity/
  );
  assert.match(backendRepository, /loginCount: getProfileLoginCount/);
  assert.match(appContext, /loginCount: profile\.loginCount/);
});

test('les secrets sont absents du catalogue, des compteurs et du mobile avant obtention', () => {
  assert.match(
    migration,
    /visibility', 'visible'\) <> 'surprise'[\s\S]*from public\.trophy_awards/
  );
  assert.match(
    trophyDisplay,
    /trophy\.visibility === 'surprise' && !isEarned[\s\S]*return null/
  );
  assert.doesNotMatch(legacyMobile, /Trophée secret/);
  assert.doesNotMatch(legacyMobile, /section:\s*'secret'/);
  assert.match(
    migration,
    /drop policy if exists "trophy_images_public_read" on storage\.objects/
  );
  assert.match(imageApi, /canReadSurpriseTrophy/);
  assert.match(imageApi, /Cache-Control', 'private, no-store'/);
  assert.match(
    migration,
    /images d’un trophée surprise doivent utiliser le stockage protégé/
  );
});

test('les quatre niveaux sont stricts, homogènes et comptés séparément', () => {
  assert.match(
    migration,
    /array\['bronze', 'silver', 'gold', 'diamond'\][\s\S]*strictement croissants/
  );
  assert.match(
    migration,
    /Tous les niveaux doivent suivre la même règle métier/
  );
  assert.match(
    trophyRules,
    /index === 2 \? 30 : 40/
  );
  assert.match(trophyRules, /trackedStatuses\.size > 1/);
  assert.match(
    trophyRules,
    /Le minimum d’autonomie ne peut pas diminuer entre deux niveaux/
  );
  assert.match(
    migration,
    /Les niveaux doivent suivre le statut d’intervention défini pour le trophée/
  );
  assert.match(trophyDisplay, /earnedLevelKeys\.size/);
  assert.match(
    trophyDisplay,
    /const highestAward = \[\.\.\.definitionAwards\]\.sort/
  );
});

test('la collection reste simple tout en ouvrant les niveaux déjà obtenus', () => {
  assert.doesNotMatch(trophiesScreen, /trophy-collection-stack__layer/);
  assert.match(trophiesScreen, /item\.earnedTiers\.length > 1/);
  assert.match(trophiesScreen, /function TrophyTierGallery/);
});

test('la description est facultative côté client et côté Supabase', () => {
  assert.doesNotMatch(
    trophyRules,
    /errors\.push\('La description du trophée est obligatoire\.'\)/
  );
  assert.match(
    optionalDescriptionMigration,
    /updated_body := replace\([\s\S]*required_description_block/
  );
  assert.match(
    optionalDescriptionMigration,
    /la description est facultative/i
  );
});

test('une progression visible ne révèle rien avant un progrès réel', () => {
  assert.match(trophyDisplay, /snapshot\.hasStarted/);
  assert.match(trophyRules, /hasStarted:/);
  assert.match(trophyRules, /'profile_login_count'/);
});

test('un trophée actif est édité en brouillon puis publié atomiquement', () => {
  assert.match(
    migration,
    /create table if not exists public\.trophy_definition_drafts/
  );
  assert.match(
    migration,
    /create table if not exists public\.trophy_definition_versions/
  );
  assert.match(
    migration,
    /create or replace function public\.publish_trophy_definition_draft/
  );
  assert.match(
    migration,
    /validate_trophy_definition_for_publication[\s\S]*update public\.trophy_definitions[\s\S]*rebuild_all_trophy_awards[\s\S]*Publication atomique d’une version de trophée/
  );
  assert.match(
    backendRepository,
    /rpc\/save_trophy_definition_draft[\s\S]*rpc\/publish_trophy_definition_draft/
  );
  assert.match(
    adminScreen,
    /const targetStatus(?:: TrophyStatus)? =[\s\S]*existingTrophy\.status === 'draft'[\s\S]*existingTrophy\.pendingDraft[\s\S]*status: targetStatus/
  );
  assert.match(
    adminScreen,
    /Version non publiée reprise[\s\S]*Publier la version/
  );
});

test('le recalcul conserve l’historique désactivé et date l’événement déterminant', () => {
  assert.match(
    migration,
    /greatest\([\s\S]*trophy\.activated_at[\s\S]*level_result\.event_at/
  );
  assert.match(
    migration,
    /source_intervention_id = excluded\.source_intervention_id/
  );
  assert.match(
    migration,
    /definition\.status = 'active'[\s\S]*not exists \([\s\S]*project1_desired_trophy_awards/
  );
  assert.match(
    migration,
    /lag\(state\.is_met, 1, false\)[\s\S]*latest_achievement/
  );
  assert.doesNotMatch(
    migration,
    /if p_target_status = 'active' then\s+delete from public\.trophy_awards/
  );
});

test('les obtentions génèrent une notification durable et une célébration lisible', () => {
  assert.match(
    migration,
    /create table if not exists public\.user_notifications/
  );
  assert.match(
    migration,
    /after insert on public\.trophy_awards[\s\S]*referencing new table as inserted_awards/
  );
  assert.match(
    migration,
    /award_event_id uuid not null unique/
  );
  assert.match(
    backendRepository,
    /user_notifications[\s\S]*read_at: 'is\.null'/
  );
  assert.match(
    appContext,
    /showLatestUnreadTrophyNotification[\s\S]*markBackendUserNotificationRead/
  );
  assert.doesNotMatch(migration, /send.*email|mailto:/i);
});

test('les notifications mobiles sont enregistrées et envoyées sans exposer les jetons', () => {
  assert.match(
    migration,
    /create or replace function public\.register_push_subscription/
  );
  assert.match(
    migration,
    /create or replace function public\.claim_pending_push_notifications/
  );
  assert.match(
    migration,
    /grant execute on function public\.claim_pending_push_notifications\(integer\)[\s\S]*to service_role/
  );
  assert.match(pushApi, /identity\.session\.client_kind !== 'mobile'/);
  assert.match(pushApi, /rpc\/register_push_subscription/);
  assert.match(pushDispatcher, /https:\/\/exp\.host\/--\/api\/v2\/push\/send/);
  assert.match(backendApi, /dispatchPendingPushNotifications/);
  assert.doesNotMatch(pushDispatcher, /console\.(?:log|info)\([^)]*expoPushToken/);
  assert.match(mobileShell, /Notifications\.getExpoPushTokenAsync/);
  assert.match(mobileShell, /permission\.status === 'undetermined'/);
});
