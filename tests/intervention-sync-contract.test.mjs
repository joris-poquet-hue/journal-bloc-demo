import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL(
    '../supabase/migrations/202607200001_atomic_intervention_realtime_authorization.sql',
    import.meta.url
  ),
  'utf8'
);
const pendingDeletionMigration = readFileSync(
  new URL(
    '../supabase/migrations/202607200002_pending_intervention_deletion.sql',
    import.meta.url
  ),
  'utf8'
);
const appContext = readFileSync(
  new URL('../src/context/AppContext.tsx', import.meta.url),
  'utf8'
);
const backendRepository = readFileSync(
  new URL('../src/services/backendRepository.ts', import.meta.url),
  'utf8'
);
const supabaseClient = readFileSync(
  new URL('../src/services/supabaseClient.ts', import.meta.url),
  'utf8'
);
const mobileShell = readFileSync(
  new URL('../mobile/WebAppShell.tsx', import.meta.url),
  'utf8'
);
const seniorDashboard = readFileSync(
  new URL('../src/screens/admin/SeniorDashboard.tsx', import.meta.url),
  'utf8'
);
const seniorDashboardModel = readFileSync(
  new URL('../src/screens/admin/seniorDashboardModel.ts', import.meta.url),
  'utf8'
);
const seniorDashboardNavigation = readFileSync(
  new URL('../src/screens/admin/seniorDashboardNavigation.ts', import.meta.url),
  'utf8'
);
const surgeryHistory = readFileSync(
  new URL('../src/screens/SurgeryHistoryScreen.tsx', import.meta.url),
  'utf8'
);
const profileScreen = readFileSync(
  new URL('../src/screens/ProfileScreen.tsx', import.meta.url),
  'utf8'
);
const surgeryInterventionCard = readFileSync(
  new URL('../src/components/SurgeryInterventionCard.tsx', import.meta.url),
  'utf8'
);
const adminScreen = readFileSync(
  new URL('../src/screens/AdminScreen.tsx', import.meta.url),
  'utf8'
);

test('la migration crée atomiquement intervention et demande d’évaluation', () => {
  assert.match(migration, /create table if not exists public\.evaluation_requests/i);
  assert.match(
    migration,
    /create or replace function public\.create_intervention_with_evaluation_request/i
  );
  assert.match(
    migration,
    /insert into public\.interventions[\s\S]*insert into public\.evaluation_requests/i
  );
  assert.match(migration, /client_mutation_id = p_client_mutation_id/i);
});

test('les autorisations Senior ne dépendent plus des favoris', () => {
  assert.doesNotMatch(migration, /senior_manages_internal/i);
  assert.match(migration, /public\.senior_can_read_internal\(internal_profile_id\)/i);
  assert.match(
    migration,
    /stored_intervention\.senior_profile_id is distinct from actor_profile_id/i
  );
  assert.match(
    migration,
    /actor_role <> 'senior'::public\.app_role/i
  );
  assert.match(migration, /list_visible_internal_directory/i);
  assert.match(
    migration,
    /create policy "profiles_select_visible"[\s\S]*public\.is_admin\(\)[\s\S]*id = public\.current_profile_id\(\)/i
  );
  assert.doesNotMatch(
    migration,
    /create policy "profiles_select_visible"[\s\S]*senior_can_read_internal\(id\)/i
  );
});

test('le client attend la confirmation Supabase avant le succès local', () => {
  const saveStart = appContext.indexOf('const saveIntervention = async');
  const serverConfirmation = appContext.indexOf(
    'await createBackendInterventionWithEvaluationRequest',
    saveStart
  );
  const localSuccess = appContext.indexOf(
    'setSavedInterventions',
    serverConfirmation
  );

  assert.ok(saveStart >= 0, 'saveIntervention doit être asynchrone');
  assert.ok(serverConfirmation > saveStart, 'la fonction atomique doit être appelée');
  assert.ok(
    localSuccess > serverConfirmation,
    'l’état local ne doit changer qu’après la réponse Supabase'
  );
  assert.doesNotMatch(appContext, /void syncSavedInterventionToDurableBackend/);
});

test('la suppression en attente est atomique, réservée au propriétaire et auditée', () => {
  assert.match(
    pendingDeletionMigration,
    /create or replace function public\.delete_pending_intervention/i
  );
  assert.match(
    pendingDeletionMigration,
    /profile\.role = 'internal'::public\.app_role[\s\S]*stored_intervention\.internal_profile_id is distinct from actor_profile\.id/i
  );
  assert.match(
    pendingDeletionMigration,
    /from public\.intervention_evaluations[\s\S]*déjà évaluée et ne peut plus être supprimée/i
  );
  assert.match(
    pendingDeletionMigration,
    /delete from public\.evaluation_requests[\s\S]*delete from public\.interventions/i
  );
  assert.match(
    pendingDeletionMigration,
    /Suppression d’une intervention en attente/
  );
  assert.match(
    pendingDeletionMigration,
    /drop policy if exists "interventions_delete_admin"/i
  );
  assert.match(
    pendingDeletionMigration,
    /revoke delete on table public\.interventions from authenticated/i
  );
});

test('le client ne retire l’intervention qu’après confirmation de la RPC', () => {
  const deleteStart = appContext.indexOf(
    'const deletePendingIntervention = async'
  );
  const serverConfirmation = appContext.indexOf(
    'await deletePendingBackendIntervention',
    deleteStart
  );
  const localRemoval = appContext.indexOf(
    'setSavedInterventions',
    serverConfirmation
  );

  assert.ok(deleteStart >= 0, 'la suppression Interne doit être exposée');
  assert.ok(serverConfirmation > deleteStart, 'la RPC atomique doit être appelée');
  assert.ok(
    localRemoval > serverConfirmation,
    'l’état local ne doit être retiré qu’après la confirmation Supabase'
  );
  assert.match(backendRepository, /rpc\/delete_pending_intervention/);
});

test('l’Interne supprime une intervention en attente depuis Mes données', () => {
  assert.match(
    surgeryHistory,
    /function openInterventionDetail[\s\S]{0,160}if \(!intervention\.isValidated\)/
  );
  assert.doesNotMatch(surgeryHistory, /deletePendingIntervention/);
  assert.match(
    profileScreen,
    /<AccountSection title="MES DONNÉES">[\s\S]*label="Interventions en attente"/
  );
  assert.match(profileScreen, /await deletePendingIntervention\(pendingDeletionCandidate\.id\)/);
  assert.match(profileScreen, /Supprimer et recommencer/);
  assert.match(profileScreen, /startNewIntervention\(\)/);
  assert.match(surgeryInterventionCard, /if \(isValidated && onPress\)/);
  assert.doesNotMatch(adminScreen, /Supprimer la sélection/);
  assert.doesNotMatch(adminScreen, /Réinitialiser les statistiques/);
});

test('la lecture Senior utilise tous les internes visibles de son établissement', () => {
  assert.match(
    backendRepository,
    /const seniorInternalIds =[\s\S]*loadBackendVisibleInternalProfiles\(signal\)/
  );
  assert.match(
    backendRepository,
    /profile\.role === 'admin'[\s\S]*\? adminInternalIds[\s\S]*: seniorInternalIds/
  );
});

test('la carte cyclique donne accès aux trois filtres et Tous les internes est la vue initiale', () => {
  assert.match(
    seniorDashboardModel,
    /\{ value: 'all', label: 'Tous les internes' \}[\s\S]*\{ value: 'mine', label: 'Mes internes' \}[\s\S]*\{ value: 'recent', label: 'Relations récentes' \}/
  );
  assert.match(seniorDashboardNavigation, /populationFilter: 'all'/);
  assert.match(
    seniorDashboard,
    /className="senior-internal-card senior-internal-card--selected senior-population-cycle-card"/
  );
  assert.match(
    seniorDashboard,
    /data-senior-population-filter=\{populationFilter\}/
  );
  assert.match(seniorDashboard, /onClick=\{cyclePopulationFilter\}/);
  assert.match(
    seniorDashboard,
    /Afficher ensuite : \$\{nextPopulationOption\.label\}/
  );
});

test('la réconciliation serveur et le retour au premier plan déclenchent une lecture de référence', () => {
  assert.match(supabaseClient, /subscribeToBackendRealtime/);
  assert.match(supabaseClient, /SERVER_RECONCILIATION/);
  assert.match(appContext, /BACKEND_RECONCILIATION_INTERVAL_MS = 5_000/);
  assert.match(appContext, /monjdb:app-foreground/);
  assert.match(mobileShell, /AppState\.addEventListener\('change'/);
  assert.match(mobileShell, /monjdb:app-foreground/);
});
