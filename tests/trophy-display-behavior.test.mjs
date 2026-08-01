import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'vite';

test('un trophée à niveaux reste en collection et progresse vers le palier suivant', async () => {
  const server = await createServer({
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  });

  try {
    const { buildTrophyDisplayModels } = await server.ssrLoadModule(
      '/src/utils/trophyDisplay.ts'
    );
    const profile = {
      createdAt: '2026-01-01T00:00:00.000Z',
      firstName: 'Joris',
      id: 'internal-joris',
      institution: 'CHU de Nantes',
      lastLoginAt: '2026-07-16T12:57:26.055Z',
      lastName: 'Poquet',
      loginId: 'joris',
      promotion: '2024',
      semester: 'S5',
    };
    const trophy = {
      activatedAt: '2026-07-01T00:00:00.000Z',
      associatedApproach: '',
      associatedIndication: '',
      associatedProcedure: 'salpingectomie',
      conditions: [],
      createdAt: '2026-07-01T00:00:00.000Z',
      description: 'Récompense ta progression en salpingectomie',
      format: 'levels',
      id: 'salpingectomie',
      images: {
        bronze: 'bronze.png',
        diamond: 'diamond.png',
        gold: 'gold.png',
        silver: 'silver.png',
        single: null,
      },
      levels: [
        {
          autonomyMin: null,
          imageSrc: 'bronze.png',
          label: 'Bronze',
          threshold: 1,
          tier: 'bronze',
          trackedStatus: 'evaluated',
        },
        {
          autonomyMin: null,
          imageSrc: 'silver.png',
          label: 'Argent',
          threshold: 2,
          tier: 'silver',
          trackedStatus: 'evaluated',
        },
        {
          autonomyMin: null,
          imageSrc: 'gold.png',
          label: 'Or',
          threshold: 30,
          tier: 'gold',
          trackedStatus: 'evaluated',
        },
        {
          autonomyMin: 80,
          imageSrc: 'diamond.png',
          label: 'Diamant',
          threshold: 31,
          tier: 'diamond',
          trackedStatus: 'evaluated',
        },
      ],
      operativeScope: 'procedure',
      status: 'active',
      title: 'Salpingectomie',
      trackedInterventionStatus: 'evaluated',
      trackedRole: 'operateur_principal',
      type: 'operatoire',
      updatedAt: '2026-07-01T00:00:00.000Z',
      visibility: 'visible',
    };
    const interventions = ['one', 'two'].map((id, index) => ({
      approach: 'coelioscopie',
      autonomyScore: 80,
      checklist: {},
      complexity: 5,
      context: 'programme',
      contextVariables: [],
      customIndication: null,
      date: `2026-07-${String(index + 1).padStart(2, '0')}`,
      entryTechnique: 'open',
      id,
      indication: 'geu',
      indicationComment: '',
      internalId: profile.id,
      laterality: 'droite',
      procedure: 'salpingectomie',
      role: 'operateur_principal',
      savedAt: `2026-07-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`,
      seniorId: 'senior',
    }));
    const evaluations = Object.fromEntries(
      interventions.map((intervention) => [
        intervention.id,
        {
          categoryDifficulty: '2',
          globalPerformance: '3',
          interventionId: intervention.id,
          seniorComment: '',
          updatedAt: intervention.savedAt,
        },
      ])
    );
    const trophyAwards = ['bronze', 'silver'].map((tier) => ({
      awardedAt: '2026-07-16T08:16:01.914Z',
      id: `award-${tier}`,
      profileId: profile.id,
      sourceInterventionId: null,
      tier,
      trophyId: trophy.id,
    }));

    const result = buildTrophyDisplayModels({
      adminEvaluations: evaluations,
      adminTrophies: [trophy],
      customSurgicalInterventions: [],
      profile,
      savedInterventions: interventions,
      trophyAwards,
    });

    assert.equal(result.earned.length, 1);
    assert.equal(result.earned[0].subtitle, 'Niveau Argent');
    assert.equal(result.earned[0].imageSrc, 'silver.png');
    assert.deepEqual(
      result.earned[0].earnedTiers.map(({ imageSrc, tier }) => ({
        imageSrc,
        tier,
      })),
      [
        { imageSrc: 'silver.png', tier: 'silver' },
        { imageSrc: 'bronze.png', tier: 'bronze' },
      ]
    );
    assert.equal(result.progress.length, 1);
    assert.equal(result.progress[0].subtitle, 'Prochain palier : Or');
    assert.equal(result.progress[0].progressCurrent, 2);
    assert.equal(result.progress[0].progressTarget, 30);
    assert.notEqual(result.earned[0].id, result.progress[0].id);
    assert.deepEqual(result.counts, { earned: 2, progress: 1 });
  } finally {
    await server.close();
  }
});
