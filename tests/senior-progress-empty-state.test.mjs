import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const panelSource = readFileSync(
  new URL('../src/screens/admin/InternalStatisticsPanel.tsx', import.meta.url),
  'utf8'
);

test('la progression Senior conserve un seul état vide sur le web', () => {
  assert.match(
    panelSource,
    /const hasProgressVisualizationData =\s*autonomySeries\.length > 0 \|\| stepGroups\.length > 0/
  );
  assert.match(
    panelSource,
    /const shouldShowWebEvaluationEmptyState =[\s\S]*!isNativeApp[\s\S]*progressInterventions\.length > 0[\s\S]*!hasProgressVisualizationData/
  );
  assert.match(
    panelSource,
    /Aucune donnée évaluée pour cette sélection/
  );
  assert.match(
    panelSource,
    /progressInterventions\.length &&\s*\(isNativeApp \|\| hasProgressVisualizationData\)/
  );
});
