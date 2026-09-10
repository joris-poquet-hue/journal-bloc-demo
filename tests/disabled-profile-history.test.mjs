import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const adminScreen = readSource('../src/screens/AdminScreen.tsx');
const adminAnalyticsModel = readSource(
  '../src/screens/admin/adminAnalyticsModel.ts'
);
const backendRepository = readSource('../src/services/backendRepository.ts');
const adminAccountService = readSource('../src/services/adminAccountService.ts');

test('le dépôt charge séparément les profils inactifs pour l’Administrateur', () => {
  const functionStart = backendRepository.indexOf(
    'export async function loadBackendDisabledProfiles'
  );
  const functionEnd = backendRepository.indexOf(
    '\nexport async function loadBackendInstitutions',
    functionStart
  );
  const source = backendRepository.slice(functionStart, functionEnd);

  assert.ok(functionStart >= 0);
  assert.match(source, /selectSupabaseRows<ProfileRow>\('profiles'/);
  assert.match(source, /is_active: 'eq\.false'/);
  assert.match(source, /updated_at\.desc/);
});

test('l’interface Admin affiche les comptes désactivés et permet leur réactivation', () => {
  assert.match(adminScreen, /Comptes désactivés/);
  assert.match(adminScreen, /La désactivation conserve le compte/);
  assert.match(adminScreen, /pour être réactivés ou[\s\S]*supprimés définitivement/);
  assert.doesNotMatch(
    adminScreen,
    /Les comptes désactivés apparaîtront ici sans être supprimés/
  );
  assert.match(adminScreen, /loadBackendDisabledProfiles/);
  assert.match(adminScreen, /profile\.role === 'internal'/);
  assert.match(adminScreen, /handleReactivateProfile/);
  assert.match(adminScreen, /Réactiver/);
  assert.match(adminAccountService, /action: 'deactivate' \| 'reactivate'/);
  assert.match(adminAccountService, /reactivateAdminAccount/);
  assert.match(adminAccountService, /\/api\/admin-users/);
  assert.match(adminAccountService, /method: 'PUT'/);

  const historyStart = adminScreen.indexOf(
    'title="Comptes désactivés"'
  );
  const historyEnd = adminScreen.indexOf(
    '\n          </SectionCard>',
    historyStart
  );
  const historySource = adminScreen.slice(historyStart, historyEnd);

  assert.match(historySource, /onClick=.*handleReactivateProfile/i);
  assert.doesNotMatch(historySource, /profile\.contactEmail|profile\.loginId/);
  assert.doesNotMatch(historySource, />\s*\{profile\.authUserId\}\s*</);
});

test('la suppression définitive est proposée uniquement depuis un profil désactivé', () => {
  const profilesPageStart = adminScreen.indexOf('title="Gestion des profils"');
  const historyStart = adminScreen.indexOf('title="Comptes désactivés"');
  const historyEnd = adminScreen.indexOf(
    '\n          </SectionCard>',
    historyStart
  );
  const activeProfilesSource = adminScreen.slice(profilesPageStart, historyStart);
  const disabledProfilesSource = adminScreen.slice(historyStart, historyEnd);

  assert.ok(profilesPageStart >= 0);
  assert.ok(historyStart > profilesPageStart);
  assert.ok(historyEnd > historyStart);
  assert.doesNotMatch(activeProfilesSource, /Supprimer définitivement/);
  assert.match(disabledProfilesSource, /openPermanentDeletionDialog/);
  assert.match(disabledProfilesSource, /Supprimer définitivement/);
});

test('la confirmation de suppression est forte, accessible et conserve les erreurs', () => {
  assert.match(adminScreen, /role="alertdialog"/);
  assert.match(adminScreen, /aria-modal="true"/);
  assert.match(adminScreen, /aria-labelledby="admin-profile-deletion-title"/);
  assert.match(adminScreen, /Action irréversible/);
  assert.match(
    adminScreen,
    /interventions et[\s\S]*évaluations partagées avec d’autres profils/
  );
  assert.match(adminScreen, /permanentDeletionTarget\.loginId/);
  assert.match(
    adminScreen,
    /permanentDeletionConfirmation\.trim\(\)\s*!==\s*permanentDeletionTarget\.loginId/
  );
  assert.match(adminScreen, /Suppression en cours…/);
  assert.match(adminScreen, /permanentDeletionError[\s\S]*role="alert"/);
  assert.match(
    adminScreen,
    /setDisabledProfiles\(\(current\) =>[\s\S]*current\.filter/
  );
  assert.match(
    adminScreen,
    /deleteAdminAccountPermanently\([\s\S]*await refreshBackendData\(\)/
  );
  assert.match(
    adminScreen,
    /a bien été supprimé définitivement, mais les données affichées n’ont pas pu être actualisées/
  );
  assert.match(adminScreen, /disabledProfilesFeedbackRef\.current\?\.focus\(\)/);
  assert.match(adminScreen, /aria-atomic="true"[\s\S]*aria-live="polite"/);
  assert.match(adminScreen, /createPortal\(/);
  assert.match(adminScreen, /pageContainer\.inert = true/);
  assert.match(adminScreen, /pageContainer\.setAttribute\('aria-hidden', 'true'\)/);
  assert.match(adminScreen, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(adminScreen, /document\.body\.style\.overflow = previousBodyOverflow/);
  assert.match(adminScreen, /pageContainer\.inert = previousInert/);
});

test('le service client utilise le contrat dédié de suppression définitive', () => {
  const functionStart = adminAccountService.indexOf(
    'export async function deleteAdminAccountPermanently'
  );
  const functionSource = adminAccountService.slice(functionStart);

  assert.ok(functionStart >= 0);
  assert.match(functionSource, /action: 'delete_permanently'/);
  assert.match(functionSource, /confirmationLogin/);
  assert.match(functionSource, /expectedVersion/);
  assert.match(functionSource, /profileId/);
  assert.match(functionSource, /method: 'POST'/);
  assert.match(functionSource, /result\?\.success !== true/);
  assert.match(functionSource, /result\.deletedProfileId !== profileId/);
  assert.doesNotMatch(functionSource, /deletedProfileId:\s*result\.deletedProfileId \?\?/);
});

test('les activités visant un profil conservent son UUID sans fausser les mesures', () => {
  assert.match(
    adminScreen,
    /Consultation des statistiques d’un interne[\s\S]*kind: 'profile_target'[\s\S]*targetProfileId: profile\.id/
  );
  assert.match(
    adminScreen,
    /Préparation d’un rappel e-mail[\s\S]*kind: 'profile_target'[\s\S]*targetProfileId: profile\.profileId/
  );
  assert.match(
    backendRepository,
    /entry\.analyticsEvent\?\.kind === 'profile_target'[\s\S]*rpc\/record_profile_target_activity_event/
  );

  const analyticsGuardStart = adminAnalyticsModel.indexOf(
    'function isAnalyticsTrackingEntry'
  );
  const analyticsGuardEnd = adminAnalyticsModel.indexOf('\n}', analyticsGuardStart);
  const analyticsGuard = adminAnalyticsModel.slice(
    analyticsGuardStart,
    analyticsGuardEnd
  );

  assert.match(analyticsGuard, /kind === 'intervention_form'/);
  assert.match(analyticsGuard, /kind === 'senior_evaluation'/);
  assert.doesNotMatch(analyticsGuard, /Boolean\(entry\.analyticsEvent\)/);
});

test('les sérialiseurs ne recopient plus les UUID d’audit dans les définitions JSON', () => {
  const surgicalStart = backendRepository.indexOf(
    'export async function saveBackendSurgicalDefinition'
  );
  const surgicalEnd = backendRepository.indexOf(
    '\nexport async function deleteBackendSurgicalDefinition',
    surgicalStart
  );
  const trophyStart = backendRepository.indexOf(
    'export async function saveBackendTrophyDefinition'
  );
  const trophyEnd = backendRepository.indexOf(
    '\nexport async function deleteBackendTrophyDefinition',
    trophyStart
  );
  const surgicalSource = backendRepository.slice(surgicalStart, surgicalEnd);
  const trophySource = backendRepository.slice(trophyStart, trophyEnd);

  assert.match(surgicalSource, /ownerProfileId: _discardedOwnerProfileId/);
  assert.match(surgicalSource, /updatedByProfileId: _discardedUpdatedByProfileId/);
  assert.match(surgicalSource, /definition: \{[\s\S]*\.\.\.cleanDefinition/);
  assert.match(trophySource, /createdByProfileId: _discardedCreatedByProfileId/);
  assert.match(trophySource, /updatedByProfileId: _discardedUpdatedByProfileId/);
  assert.match(trophySource, /p_definition: \{[\s\S]*\.\.\.cleanDefinition/);
});
