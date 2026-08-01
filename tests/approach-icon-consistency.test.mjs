import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const styles = readFileSync(
  new URL('../src/styles.css', import.meta.url),
  'utf8'
);

test('toutes les voies d’abord partagent le même médaillon visuel', () => {
  const approachIconBlock = styles.match(
    /^\.approach-icon \{[\s\S]*?\n\}/m
  )?.[0];

  assert.ok(approachIconBlock);
  assert.match(approachIconBlock, /width: 48px/);
  assert.match(approachIconBlock, /height: 48px/);
  assert.match(approachIconBlock, /background: #eef8fd/);
  assert.doesNotMatch(styles, /\.approach-icon--vnotes \{\s*background:/);
  assert.doesNotMatch(styles, /\.approach-icon--robot \{\s*background:/);
  assert.match(
    styles,
    /\.approach-icon--vnotes \.approach-icon__image[\s\S]*?transform: scale\(2\)/
  );
});
