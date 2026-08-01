import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const panelSource = await readFile(
  new URL('../src/screens/admin/InternalStatisticsPanel.tsx', import.meta.url),
  'utf8'
);

test('l’historique web conserve la liste et le dossier sélectionné côte à côte', () => {
  assert.match(panelSource, /senior-history-web-workspace/);
  assert.match(panelSource, /senior-history-web-list/);
  assert.match(panelSource, /senior-history-web-detail/);
  assert.match(panelSource, /webSelectedHistoryIntervention/);
});

test('une intervention en attente reste verrouillée dans l’historique', () => {
  assert.match(panelSource, /disabled=\{status === 'pending'\}/);
  assert.match(
    panelSource,
    /Les interventions en attente restent verrouillées jusqu’à/
  );
});

test('la nouvelle disposition web ne remplace pas le détail natif dédié', () => {
  assert.match(panelSource, /isNativeApp \? \(/);
  assert.match(panelSource, /monjdb-native-history-card--detail/);
  assert.match(panelSource, /monjdb-native-history-detail-back/);
});

test('le détail web affiche les niveaux par pastilles et les évaluations globales', () => {
  assert.match(panelSource, /renderSeniorHistoryChecklistScale\(level\)/);
  assert.match(panelSource, /history-web-step-scale__dot--selected/);
  assert.match(panelSource, /Performance de l’interne/);
  assert.match(panelSource, /Difficulté de l’intervention/);
  assert.doesNotMatch(panelSource, /Autonomie par temps opératoire/);
});
