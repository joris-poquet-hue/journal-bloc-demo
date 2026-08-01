import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const migration = readSource(
  '../supabase/migrations/202607270002_official_institutions.sql'
);
const adminApi = readSource('../api/admin-users.js');
const appContext = readSource('../src/context/AppContext.tsx');
const backendRepository = readSource('../src/services/backendRepository.ts');
const adminScreen = readSource('../src/screens/AdminScreen.tsx');
const supabaseClient = readSource('../src/services/supabaseClient.ts');

test('le référentiel possède un identifiant stable et interdit la suppression physique', () => {
  assert.match(
    migration,
    /create table if not exists public\.institutions[\s\S]*id uuid primary key/i
  );
  assert.match(
    migration,
    /status text not null default 'active'[\s\S]*archived_at timestamptz/i
  );
  assert.match(
    migration,
    /create unique index if not exists institutions_name_unique_idx[\s\S]*lower\(name\)/i
  );
  assert.match(
    migration,
    /create or replace function public\.prevent_institution_delete/i
  );
  assert.match(
    migration,
    /before delete on public\.institutions[\s\S]*prevent_institution_delete/i
  );
});

test('profiles.institution_id est ajouté et le texte historique reste synchronisé', () => {
  assert.match(
    migration,
    /add column if not exists institution_id uuid[\s\S]*references public\.institutions\(id\) on delete restrict/i
  );
  assert.match(
    migration,
    /create or replace function public\.sync_profile_institution_reference/i
  );
  assert.match(
    migration,
    /new\.institution_id := resolved_institution\.id[\s\S]*new\.institution := resolved_institution\.name/i
  );
  assert.match(
    migration,
    /Migration interrompue : rattachements non validés/i
  );
});

test('les autorisations Senior comparent les identifiants et jamais les favoris', () => {
  assert.match(
    migration,
    /senior_profile\.institution_id is not distinct[\s\S]*internal_profile\.institution_id/i
  );
  assert.match(
    migration,
    /public\.senior_can_read_internal\(internal_profile_id\)/i
  );
  assert.match(
    migration,
    /list_visible_internal_directory[\s\S]*profile\.institution_id = public\.current_profile_institution_id\(\)/i
  );
  assert.match(
    migration,
    /replace_own_senior_internal_assignments[\s\S]*internal_profile\.institution_id is distinct[\s\S]*senior_profile\.institution_id/i
  );
  assert.doesNotMatch(
    migration,
    /senior_manages_internal\(internal_id\)[\s\S]*returns boolean/i
  );
});

test('le déplacement est atomique, nettoie les favoris obsolètes et écrit l’audit', () => {
  assert.match(
    migration,
    /create or replace function public\.move_profile_to_institution/i
  );
  assert.match(
    migration,
    /set_config\('app\.allow_institution_move', 'on', true\)[\s\S]*update public\.profiles/i
  );
  assert.match(
    migration,
    /delete from public\.senior_internal_assignments[\s\S]*institution_id is distinct/i
  );
  assert.match(migration, /'Changement d’établissement'/i);
  assert.match(
    migration,
    /Utilisez la fonction atomique de déplacement d’établissement/i
  );
});

test('l’Administrateur utilise uniquement la liste officielle dans le client', () => {
  assert.match(adminApi, /institutionId: String\(body\?\.institutionId/);
  assert.doesNotMatch(
    adminApi,
    /institution: String\(body\?\.institution/
  );
  assert.match(adminApi, /findActiveInstitution\(input\.institutionId\)/);
  assert.match(
    adminScreen,
    /handleCreateFieldChange\('institutionId'[\s\S]*activeInstitutions\.map/
  );
  assert.match(
    adminScreen,
    /handleCreateSeniorFieldChange\([\s\S]*'institutionId'[\s\S]*activeInstitutions\.map/
  );
  assert.match(adminScreen, /title="Établissements"/);
  assert.match(backendRepository, /rpc\/move_profile_to_institution/);
  assert.match(appContext, /await moveBackendProfileToInstitution/);
});

test('le référentiel est rechargé automatiquement sur le web et l’application', () => {
  assert.match(
    migration,
    /alter publication supabase_realtime add table public\.institutions/i
  );
  assert.match(
    supabaseClient,
    /SERVER_RECONCILIATION/
  );
  assert.match(
    appContext,
    /BACKEND_RECONCILIATION_INTERVAL_MS = 5_000[\s\S]*sessionRole === 'admin'[\s\S]*setInstitutions\(payload\.referenceData\.institutions\)/
  );
});
