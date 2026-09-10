import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const migration = readSource(
  '../supabase/migrations/202607290002_context_variables_senior_checklist_formula.sql'
);
const structuredContextMigration = readSource(
  '../supabase/migrations/202607290003_structured_clinical_context_and_operating_time.sql'
);
const optionalContextMigration = readSource(
  '../supabase/migrations/202607290004_optional_structured_clinical_context.sql'
);
const requiredSurgeryContextMigration = readSource(
  '../supabase/migrations/202607290005_required_surgery_context.sql'
);
const operatingTimeRetirementMigration = readSource(
  '../supabase/migrations/202609080001_require_email_confirmation_remove_operating_time.sql'
);
const types = readSource('../src/types/index.ts');
const mockData = readSource('../src/data/mockData.ts');
const navigator = readSource('../src/navigation/AppNavigator.tsx');
const appContext = readSource('../src/context/AppContext.tsx');
const form = readSource('../src/screens/InterventionFormScreen.tsx');
const complexitySlider = readSource('../src/components/ComplexitySlider.tsx');
const contextScreen = readSource('../src/screens/ContextVariablesScreen.tsx');
const summary = readSource('../src/screens/SummaryScreen.tsx');
const adminScreen = readSource('../src/screens/AdminScreen.tsx');
const seniorChecklistEditor = readSource(
  '../src/screens/admin/SeniorChecklistEditor.tsx'
);
const clinicalContextOverview = readSource(
  '../src/components/ClinicalContextOverview.tsx'
);
const internalStatisticsPanel = readSource(
  '../src/screens/admin/InternalStatisticsPanel.tsx'
);
const surgeryHistory = readSource('../src/screens/SurgeryHistoryScreen.tsx');
const repository = readSource('../src/services/backendRepository.ts');
const formula = readSource('../src/utils/autonomyScoreFormula.ts');
const validation = readSource('../src/utils/validation.ts');

test('le parcours Interne utilise le contexte clinique structuré sans checklist', () => {
  assert.match(types, /\| 'context-variables'/);
  assert.doesNotMatch(types, /\| 'checklist'/);
  assert.match(navigator, /screen === 'context-variables'/);
  assert.doesNotMatch(navigator, /screens\/ChecklistScreen/);
  assert.match(form, /goToContextVariables/);
  assert.match(contextScreen, /Variables de contexte/);
  assert.match(contextScreen, /Patiente/);
  assert.match(contextScreen, /Antécédents/);
  assert.match(contextScreen, /Per-opératoire/);
  assert.match(contextScreen, /type="range"/);
  assert.match(contextScreen, /Saignement per-opératoire/);
  assert.match(summary, /getClinicalContextSummaryRows/);
  assert.doesNotMatch(summary, /checklistProgress/);
});

test('le contexte structuré reste enregistré sans horaires ni durée opératoire', () => {
  assert.match(
    structuredContextMigration,
    /add column if not exists intervention_start_time time without time zone/i
  );
  assert.match(
    structuredContextMigration,
    /add column if not exists operative_duration_minutes integer/i
  );
  assert.match(
    structuredContextMigration,
    /validate_structured_clinical_context/i
  );
  assert.match(structuredContextMigration, /p_context_variables ->> 'schemaVersion' <> '2'/i);
  assert.match(structuredContextMigration, /mod\(blood_loss_ml, 50\) <> 0/i);
  assert.match(structuredContextMigration, /create_intervention_v3/i);
  assert.match(structuredContextMigration, /clinicalContextDefinition/i);
  assert.match(repository, /rpc\/create_intervention_v3/);
  assert.match(repository, /p_context_variables: intervention\.contextVariables/);
  assert.match(
    repository,
    /p_intervention_start_time: '00:00'/
  );
  assert.match(
    repository,
    /p_operative_duration_minutes: 1/
  );
  assert.doesNotMatch(types, /startTime|operativeDurationMinutes/);
  assert.doesNotMatch(form, /startTime|operativeDurationMinutes/);
  assert.doesNotMatch(validation, /startTime|operativeDurationMinutes/);
  assert.doesNotMatch(summary, /Heure de l’intervention|Durée de l’intervention/);
  assert.match(
    appContext,
    /const goToForm = \(\) => \{[\s\S]*setDraft\(createInitialDraft\(selectedInternal\.id\)\)/
  );
  assert.match(
    operatingTimeRetirementMigration,
    /new\.intervention_start_time := null;[\s\S]*new\.operative_duration_minutes := null;/
  );
  assert.match(
    operatingTimeRetirementMigration,
    /before insert on public\.interventions/
  );
  assert.match(
    operatingTimeRetirementMigration,
    /update public\.interventions[\s\S]*intervention_start_time = null,[\s\S]*operative_duration_minutes = null/
  );
  assert.match(
    operatingTimeRetirementMigration,
    /- 'interventionTimingDefinition'/
  );
  const createInterventionCall = repository.match(
    /rpc\/create_intervention_v3[\s\S]*?return toSavedIntervention/
  )?.[0];
  assert.ok(createInterventionCall);
  assert.doesNotMatch(createInterventionCall, /p_checklist/);
});

test('les variables de contexte sont facultatives mais les valeurs fournies restent validées', () => {
  assert.match(contextScreen, /Ces informations sont facultatives/);
  assert.doesNotMatch(contextScreen, /disabled=\{!completion\.isComplete\}/);
  assert.match(contextScreen, /onClick=\{\(\) => onChange\(null\)\}/);
  assert.doesNotMatch(summary, /isClinicalContextComplete/);
  assert.doesNotMatch(validation, /isClinicalContextComplete/);
  assert.match(
    optionalContextMigration,
    /not in \('number', 'null'\)/i
  );
  assert.match(
    optionalContextMigration,
    /'required', false/i
  );
  assert.match(
    optionalContextMigration,
    /optional_clinical_context_definition_snapshot/i
  );
});

test('le cadre opératoire est choisi explicitement et la difficulté suit le curseur', () => {
  assert.match(form, /Cadre de l’intervention/);
  assert.match(form, /surgeryContextOptions/);
  assert.match(form, /updateDraftField\('context', option\.value\)/);
  assert.match(mockData, /Bloc programmé/);
  assert.match(mockData, /Urgence/);
  assert.match(validation, /if \(!draft\.context\)/);
  assert.match(summary, /Cadre de l’intervention/);
  assert.match(summary, /formatSurgeryContext/);
  assert.match(internalStatisticsPanel, /formatSurgeryContext\(intervention\.context\)/);
  assert.match(
    surgeryHistory,
    /formatSurgeryContext\(selectedDetail\.intervention\.context\)/
  );
  assert.match(
    internalStatisticsPanel,
    /surgery-context-badge--\$\{[\s\S]*intervention\.context \?\? 'unknown'/
  );
  assert.match(
    surgeryHistory,
    /history-web-detail-hero__status[\s\S]*formatSurgeryContext\(selectedDetail\.intervention\.context\)/
  );
  assert.match(complexitySlider, /<output/);
  assert.match(complexitySlider, /\{safeValue\} \/ 10/);
  assert.doesNotMatch(
    complexitySlider,
    /Difficulté ressentie\s*:\s*<strong>/
  );
  assert.match(
    requiredSurgeryContextMigration,
    /p_surgery_context is null[\s\S]*p_surgery_context not in \('urgence', 'programme'\)/i
  );
  assert.match(
    requiredSurgeryContextMigration,
    /'derivedFromIndication', false/i
  );
  assert.doesNotMatch(
    requiredSurgeryContextMigration,
    /Le contexte attendu est/
  );
});

test('la checklist complète appartient au Senior désigné', () => {
  assert.match(
    migration,
    /add column if not exists checklist jsonb[\s\S]*set checklist = intervention\.checklist/i
  );
  assert.match(migration, /validate_senior_evaluation_checklist/i);
  assert.match(
    migration,
    /Checklist Senior incomplète ou incompatible/i
  );
  assert.match(migration, /\('NA', '0', '1', '2', '3', '4'\)/i);
  assert.match(migration, /save_intervention_evaluation_v2/i);
  assert.match(repository, /rpc\/save_intervention_evaluation_v2/);
  assert.match(repository, /p_checklist: evaluation\.checklist/);
  assert.match(adminScreen, /Autonomie par temps opératoire/);
  assert.match(seniorChecklistEditor, /function SeniorChecklistEditor/);
  assert.match(seniorChecklistEditor, /type="range"/);
  assert.match(seniorChecklistEditor, /Assistance active du senior/);
  assert.match(seniorChecklistEditor, /NA/);
  assert.match(
    seniorChecklistEditor,
    /selectedLevel === 'NA' \? null : 'NA'/
  );
  assert.match(adminScreen, /missingChecklistSteps/);
  assert.match(adminScreen, /senior-evaluation-clinical-overview/);
  assert.doesNotMatch(adminScreen, /Durée opératoire/);
  assert.match(adminScreen, /Voir les autres variables/);
  assert.doesNotMatch(adminScreen, /Repères de l’intervention/);
  assert.match(contextScreen, /Complication per-opératoire/);
  assert.doesNotMatch(adminScreen, /Voir le détail de l’auto-évaluation/);
});

test('le contexte clinique est harmonisé dans les historiques web Senior et Interne', () => {
  assert.match(clinicalContextOverview, /Âge/);
  assert.match(clinicalContextOverview, /IMC/);
  assert.doesNotMatch(clinicalContextOverview, /Durée opératoire/);
  assert.match(clinicalContextOverview, /Saignement/);
  assert.doesNotMatch(
    clinicalContextOverview,
    /Synthèse des variables renseignées/
  );
  assert.match(clinicalContextOverview, /Voir les autres variables/);
  assert.match(
    internalStatisticsPanel,
    /senior-history-web-detail__clinical-context/
  );
  assert.match(
    surgeryHistory,
    /history-web-detail-hero__clinical-context/
  );
});

test('la saisie web ne réaffiche pas les textes retirés du formulaire', () => {
  assert.doesNotMatch(
    form,
    /Les informations se résument automatiquement à droite\./
  );
  assert.doesNotMatch(
    form,
    /Commence par le cadre, puis précise l’acte\./
  );
  assert.doesNotMatch(form, /Résumé en direct/);
});

test('la formule publiée compte uniquement la composante autonomie', () => {
  assert.match(migration, /'autonomyWeight', 1/);
  assert.match(migration, /'performanceWeight', 0/);
  assert.match(
    migration,
    /'difficultyCoefficients', jsonb_build_object\('1', 1, '2', 1, '3', 1\)/
  );
  assert.match(
    migration,
    /authoritative_checklist := coalesce\([\s\S]*p_evaluation\.checklist/i
  );
  assert.match(
    migration,
    /recalculate_all_intervention_scores[\s\S]*rebuild_all_trophy_awards/i
  );
  assert.match(formula, /return Math\.round\(clampScore\(autonomyComponent\)\)/);
  assert.doesNotMatch(formula, /0\.4|0\.6|0\.95|1\.05/);
});

test('les anciens RPC ne peuvent plus contourner le nouveau parcours', () => {
  assert.match(
    migration,
    /revoke execute on function public\.create_intervention\(/i
  );
  assert.match(
    migration,
    /revoke execute on function public\.save_intervention_evaluation\(/i
  );
  assert.match(
    migration,
    /new\.context_variables is distinct from old\.context_variables/i
  );
  assert.match(
    structuredContextMigration,
    /revoke execute on function public\.create_intervention_v2/i
  );
  assert.match(
    structuredContextMigration,
    /new\.intervention_start_time is distinct from old\.intervention_start_time/i
  );
});
