import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const screenSource = fs.readFileSync(
  new URL('../src/screens/SurgeryHistoryScreen.tsx', import.meta.url),
  'utf8'
);

const stylesSource = fs.readFileSync(
  new URL('../src/styles.css', import.meta.url),
  'utf8'
);

test('le détail web regroupe l’identité et les informations opératoires', () => {
  assert.match(screenSource, /history-web-detail-hero__main/);
  assert.match(screenSource, /history-web-detail-hero__facts/);
  assert.match(screenSource, /<span>Indication<\/span>/);
  assert.match(screenSource, /<span>Voie d’abord<\/span>/);
});

test('la performance précède la difficulté dans la synthèse web', () => {
  const webSummary = screenSource.slice(
    screenSource.indexOf('history-web-score-banner__assessments'),
    screenSource.indexOf('history-web-score-banner__comment')
  );

  assert.ok(
    webSummary.indexOf('Performance de l’interne') <
      webSummary.indexOf('Difficulté de l’intervention')
  );
  assert.doesNotMatch(webSummary, /Niveau maximal sur les étapes applicables/);
  assert.doesNotMatch(webSummary, /Chaque série représente un niveau/);
});

test('les niveaux web utilisent des pastilles colorées et le mobile reste séparé', () => {
  assert.match(screenSource, /renderHistoryWebChecklistScale/);
  assert.match(screenSource, /history-web-step-scale__dot--selected/);
  assert.match(screenSource, /isNativeApp \? \(/);
  assert.match(stylesSource, /history-web-step-scale__dot--level-0/);
  assert.match(stylesSource, /history-web-step-scale__dot--level-4/);
  assert.match(stylesSource, /history-step-pill--level-4/);
});
