import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [clientSource, endpointSource, serverSource] = await Promise.all([
  readFile(new URL('../src/observability.ts', import.meta.url), 'utf8'),
  readFile(new URL('../src/serverClientTelemetry.cjs', import.meta.url), 'utf8'),
  readFile(new URL('../src/serverObservability.cjs', import.meta.url), 'utf8'),
]);

test('la télémétrie client envoie uniquement catégorie et Web Vitals', () => {
  assert.match(clientSource, /'CLS' \| 'INP' \| 'LCP'/);
  assert.match(clientSource, /unhandled-rejection/);
  assert.doesNotMatch(clientSource, /event\.message|event\.filename|stack|userAgent/);
});

test('le serveur exige une session et une liste blanche stricte', () => {
  assert.match(endpointSource, /authenticateBusinessApplicationSession/);
  assert.match(endpointSource, /ALLOWED_KINDS/);
  assert.match(endpointSource, /ALLOWED_METRICS/);
  assert.doesNotMatch(endpointSource, /body\?\.(message|stack|url|userId|email)/);
});

test('les erreurs structurées excluent message et pile', () => {
  assert.match(serverSource, /getSafeErrorDetails/);
  assert.match(serverSource, /errorCode/);
  assert.doesNotMatch(serverSource, /error\?\.(message|stack)/);
  assert.doesNotMatch(serverSource, /webhook|https?:\/\//i);
});
