import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createServer } from 'vite';

import {
  buildEvaluationPeriodCounts,
  getCalendarDayDifference,
  getHourDifference,
} from '../src/utils/exportMetrics.ts';
import { createXlsxBlob } from '../src/utils/xlsx.ts';

function createIntervention(overrides = {}) {
  return {
    date: '2026-09-01',
    id: 'intervention-uuid-secret',
    savedAt: '2026-09-02T00:30:00.000Z',
    ...overrides,
  };
}

test('le délai intervention → saisie utilise les jours calendaires de Paris', () => {
  assert.equal(
    getCalendarDayDifference('2026-09-01', '2026-09-01T21:59:59.000Z'),
    0
  );
  assert.equal(
    getCalendarDayDifference('2026-09-01', '2026-09-01T22:00:00.000Z'),
    1
  );
  assert.equal(
    getHourDifference(
      '2026-09-02T00:30:00.000Z',
      '2026-09-02T06:30:00.000Z'
    ),
    6
  );
});

test('le taux porte sur la cohorte saisie et les évaluations de la période restent séparées', () => {
  const evaluatedIntervention = createIntervention();
  const pendingIntervention = createIntervention({
    id: 'pending-intervention',
    savedAt: '2026-09-05T08:00:00.000Z',
  });
  const olderIntervention = createIntervention({
    id: 'older-intervention',
    savedAt: '2026-08-01T08:00:00.000Z',
  });
  const evaluation = {
    categoryDifficulty: '2',
    globalPerformance: '4',
    seniorComment: '',
    updatedAt: '2026-09-03T08:00:00.000Z',
  };
  const counts = buildEvaluationPeriodCounts(
    [evaluatedIntervention, pendingIntervention, olderIntervention],
    {
      [evaluatedIntervention.id]: {
        ...evaluation,
        interventionId: evaluatedIntervention.id,
      },
      [olderIntervention.id]: {
        ...evaluation,
        interventionId: olderIntervention.id,
        updatedAt: '2026-09-04T08:00:00.000Z',
      },
    },
    '2026-09-01T00:00:00.000Z',
    '2026-09-30T23:59:59.999Z'
  );

  assert.deepEqual(counts, {
    evaluatedRecordedCount: 1,
    evaluationRate: 50,
    evaluationsPerformedCount: 2,
    recordedCount: 2,
  });
});

test('le générateur produit un vrai conteneur XLSX', async () => {
  const blob = createXlsxBlob([
    {
      name: 'Évaluations',
      rows: [
        ['Référence', 'Performance globale'],
        ['BLOC-000001', 4],
      ],
    },
  ]);
  const bytes = new Uint8Array(await blob.arrayBuffer());

  assert.equal(
    blob.type,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  assert.deepEqual(Array.from(bytes.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04]);
});

test('le libellé du niveau exporte sa description et non sa valeur numérique', async () => {
  const server = await createServer({
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });

  try {
    const { buildInterventionsWorksheets } = await server.ssrLoadModule(
      '/src/utils/interventionsXlsx.ts'
    );
    const intervention = {
      approach: 'coelioscopie',
      autonomyScore: null,
      checklist: { 'step-export': '2' },
      complexity: 5,
      context: 'programme',
      contextVariables: [],
      customIndication: null,
      date: '2026-09-01',
      definitionSnapshot: {
        applicableChecklistSteps: [
          {
            id: 'step-export',
            label: 'Étape de test',
            order: 1,
            scored: true,
          },
        ],
        definition: {},
        source: {
          id: 'procedure-test',
          name: 'Procédure de test',
          status: 'active',
          version: 1,
        },
      },
      entryTechnique: 'open',
      id: 'intervention-export',
      indication: 'geu',
      indicationComment: '',
      internalId: null,
      laterality: 'droite',
      procedure: 'procedure-test',
      role: 'operateur_principal',
      savedAt: '2026-09-01T10:00:00.000Z',
      seniorId: null,
    };
    const worksheets = buildInterventionsWorksheets([intervention], []);
    const stepsWorksheet = worksheets.find(
      (worksheet) => worksheet.name === 'Étapes opératoires'
    );

    assert.ok(stepsWorksheet);
    assert.equal(stepsWorksheet.rows[1][9], 2);
    assert.equal(
      stepsWorksheet.rows[1][10],
      'Réalisé avec assistance active du senior'
    );
  } finally {
    await server.close();
  }
});

test('les contrats de colonnes exportent l’évaluation complète sans identifiants privés', () => {
  const interventionExportSource = readFileSync(
    new URL('../src/utils/interventionsXlsx.ts', import.meta.url),
    'utf8'
  );
  const analyticsExportSource = readFileSync(
    new URL('../src/utils/analyticsExport.ts', import.meta.url),
    'utf8'
  );

  for (const expectedLabel of [
    'Prénom interne',
    'Nom interne',
    'Lieu de stage',
    'Prénom senior évaluateur',
    'Performance globale (1-5)',
    'Difficulté senior (1-3)',
    'Commentaire senior',
    "Score d'autonomie final (%)",
    'Score des étapes clés (0-4)',
    'Délai saisie → évaluation (heures)',
    'jours calendaires',
  ]) {
    assert.match(interventionExportSource, new RegExp(expectedLabel.replace(/[()]/g, '\\$&')));
  }

  for (const source of [interventionExportSource, analyticsExportSource]) {
    assert.doesNotMatch(source, /Identifiant de connexion|actor_id|intervention_id/);
  }
  assert.match(interventionExportSource, /evaluation\?\.seniorProfileId/);
  assert.match(interventionExportSource, /getAuthoritativeChecklist/);
  assert.match(analyticsExportSource, /Évaluations réalisées pendant la période/);
  assert.match(analyticsExportSource, /evaluatedRecordedCount/);
});
