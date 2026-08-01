import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const migration = readSource(
  '../supabase/migrations/202607270001_security_hardening.sql'
);
const backendRepository = readSource('../src/services/backendRepository.ts');
const adminScreen = readSource('../src/screens/AdminScreen.tsx');

test('la suppression directe des profils est retirée et leur historique est protégé', () => {
  assert.match(
    migration,
    /drop policy if exists "profiles_admin_delete" on public\.profiles/i
  );
  assert.match(
    migration,
    /revoke delete on table public\.profiles from authenticated/i
  );
  assert.match(
    migration,
    /create or replace function public\.prevent_profile_history_delete/i
  );
  assert.match(
    migration,
    /before delete on public\.profiles[\s\S]*prevent_profile_history_delete/i
  );
  assert.match(
    migration,
    /from public\.interventions[\s\S]*from public\.intervention_evaluations[\s\S]*from public\.evaluation_requests/i
  );
});

test('le bloc-notes est lisible et modifiable uniquement par son Interne propriétaire', () => {
  const notebookPoliciesStart = migration.indexOf(
    'create policy "notebook_select_owner"'
  );
  const auditPoliciesStart = migration.indexOf(
    'create policy "activity_log_select_admin"'
  );
  const notebookPolicies = migration.slice(
    notebookPoliciesStart,
    auditPoliciesStart
  );

  assert.ok(notebookPoliciesStart >= 0);
  assert.ok(auditPoliciesStart > notebookPoliciesStart);
  assert.match(
    notebookPolicies,
    /profile_id = public\.current_profile_id\(\)/
  );
  assert.match(
    notebookPolicies,
    /public\.current_app_role\(\) = 'internal'::public\.app_role/
  );
  assert.doesNotMatch(notebookPolicies, /public\.is_admin\(\)/);
  assert.match(
    notebookPolicies,
    /revoke delete on table public\.notebook_documents from authenticated/i
  );
});

test('le journal d’audit est réservé aux Administrateurs et refuse les insertions libres', () => {
  assert.match(
    migration,
    /create policy "activity_log_select_admin"[\s\S]*using \(public\.is_admin\(\)\)/i
  );
  assert.match(
    migration,
    /revoke insert, update, delete on table public\.activity_log from authenticated/i
  );
  assert.match(
    migration,
    /create or replace function public\.record_user_activity_event/i
  );
  assert.match(migration, /case p_event_kind[\s\S]*Type d’événement non autorisé/i);
  assert.match(
    migration,
    /create or replace function public\.record_profile_login\(\)[\s\S]*Connexion au profil/i
  );
  assert.doesNotMatch(
    backendRepository,
    /insertRows<ActivityLogRow>\(\s*'activity_log'/i
  );
  assert.doesNotMatch(
    backendRepository,
    /'Connexion au profil': 'login'/
  );
  assert.match(backendRepository, /rpc\/record_user_activity_event/);
});

test('les trophées activés et les attributions manuelles sont protégés', () => {
  assert.match(
    migration,
    /create or replace function public\.protect_trophy_definition_lifecycle/i
  );
  assert.match(
    migration,
    /old\.ever_activated is distinct from false[\s\S]*from public\.trophy_awards/i
  );
  assert.match(
    migration,
    /revoke delete on table public\.trophy_definitions from authenticated/i
  );
  assert.match(
    migration,
    /create or replace function public\.delete_never_activated_trophy_draft/i
  );
  assert.match(
    migration,
    /revoke insert, update, delete on table public\.trophy_awards from authenticated/i
  );
  assert.match(
    backendRepository,
    /rpc\/delete_never_activated_trophy_draft/
  );
  assert.doesNotMatch(
    backendRepository,
    /deleteVersionedRows<TrophyDefinitionRow>/
  );
  assert.match(
    adminScreen,
    /trophy\.status === 'draft'[\s\S]*Supprimer le brouillon/
  );
});
