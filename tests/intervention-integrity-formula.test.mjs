import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const migration = readSource(
  '../supabase/migrations/202607270006_intervention_integrity_formula.sql'
);
const enforcementMigration = readSource(
  '../supabase/migrations/202607270007_enforce_intervention_score_authority.sql'
);
const historicalApplicationFixMigration = readSource(
  '../supabase/migrations/202607270008_fix_legacy_snapshot_application.sql'
);
const backendRepository = readSource('../src/services/backendRepository.ts');
const appContext = readSource('../src/context/AppContext.tsx');
const autonomyScore = readSource('../src/utils/autonomyScore.ts');
const legacySnapshotApplication = readSource(
  '../scripts/apply-legacy-intervention-snapshots.mjs'
);

test('chaque nouvelle intervention reçoit un instantané versionné dans la transaction atomique', () => {
  assert.match(
    migration,
    /add column if not exists definition_snapshot jsonb/i
  );
  assert.match(
    migration,
    /build_intervention_definition_snapshot[\s\S]*insert into public\.interventions[\s\S]*definition_snapshot/i
  );
  assert.match(
    migration,
    /definition_snapshot_schema_version[\s\S]*definition_version/i
  );
});

test('le serveur valide exactement les champs, étapes et niveaux de checklist', () => {
  assert.match(migration, /validate_intervention_submission/i);
  assert.match(
    migration,
    /Checklist incomplète ou incompatible avec la définition/i
  );
  assert.match(migration, /\('NA', '0', '1', '2', '3', '4'\)/i);
  assert.match(
    migration,
    /count\(distinct step ->> 'id'\)[\s\S]*étapes invalides ou dupliquées/i
  );
  assert.match(
    migration,
    /Voie d’abord incompatible[\s\S]*Technique d’entrée incompatible[\s\S]*Latéralité invalide/i
  );
});

test('le score accepté par le client est supprimé et le calcul devient exclusivement serveur', () => {
  const replacementFunctionStart = migration.indexOf(
    'create or replace function public.save_intervention_evaluation('
  );
  const replacementFunctionEnd = migration.indexOf(
    '-- Transitional wrapper: the legacy score',
    replacementFunctionStart
  );
  const replacementFunction = migration.slice(
    replacementFunctionStart,
    replacementFunctionEnd
  );

  assert.ok(replacementFunctionStart >= 0);
  assert.doesNotMatch(replacementFunction, /p_autonomy_score/i);
  assert.match(
    enforcementMigration,
    /drop function if exists public\.save_intervention_evaluation_with_score/i
  );
  assert.doesNotMatch(backendRepository, /p_autonomy_score/i);
  assert.match(migration, /calculate_intervention_autonomy_score/i);
  assert.match(
    migration,
    /autonomy_score = calculated_score[\s\S]*autonomy_score_formula_id/i
  );
  assert.match(
    autonomyScore,
    /return intervention\.autonomyScore \?\? null/
  );
  assert.doesNotMatch(
    appContext,
    /saveBackendEvaluation\([\s\S]{0,180}autonomyScore/
  );
});

test('les formules sont versionnées, publiées atomiquement et auditées', () => {
  assert.match(migration, /create table if not exists public\.autonomy_score_formulas/i);
  assert.match(
    migration,
    /create unique index if not exists autonomy_score_formulas_one_published_idx/i
  );
  assert.match(migration, /publish_autonomy_score_formula/i);
  assert.match(
    migration,
    /pg_advisory_xact_lock[\s\S]*status = 'retired'[\s\S]*insert into public\.autonomy_score_formulas[\s\S]*recalculate_all_intervention_scores[\s\S]*rebuild_all_trophy_awards/i
  );
  assert.match(migration, /Publication de la formule d’autonomie/i);
});

test('le rapport historique est en lecture seule et son écriture exige le hash et une confirmation', () => {
  assert.match(migration, /preview_legacy_intervention_snapshot_report/i);
  assert.match(migration, /reportHash/i);
  assert.match(migration, /raw_checklist_fallback/i);
  assert.match(migration, /apply_legacy_intervention_snapshots/i);
  assert.match(migration, /APPLIQUER HISTORIQUE HERITE/i);
  assert.match(
    migration,
    /Le rapport historique a changé\. Générez-le à nouveau\./i
  );
  assert.match(legacySnapshotApplication, /begin[\s\S]*rollback/i);
  assert.match(legacySnapshotApplication, /--confirm-owner-validation/i);
  assert.match(
    legacySnapshotApplication,
    /delete from public\.application_sessions/i
  );
  assert.match(
    historicalApplicationFixMigration,
    /catalog_definition as definition_record/i
  );
  assert.doesNotMatch(
    historicalApplicationFixMigration,
    /select[\s\S]{0,120}\bdefinition as definition_record/i
  );
});

test('les interventions et évaluations restent immuables même par une API Administrateur', () => {
  assert.match(migration, /protect_intervention_immutability/i);
  assert.match(migration, /protect_evaluation_immutability/i);
  assert.match(
    migration,
    /revoke insert, update, delete on table public\.interventions from authenticated/i
  );
  assert.match(
    migration,
    /revoke insert, update, delete on table public\.intervention_evaluations[\s\S]*from authenticated/i
  );
  assert.match(migration, /Une évaluation validée est définitive/i);
  assert.match(migration, /Les données brutes d’une intervention sont immuables/i);
});
