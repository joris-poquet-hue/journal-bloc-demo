import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const vercelConfig = JSON.parse(
  readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')
);

test('les réponses Vercel déclarent les principaux en-têtes navigateur', () => {
  const globalRule = vercelConfig.headers?.find(
    (rule) => rule.source === '/(.*)'
  );

  assert.ok(globalRule, 'une règle globale doit couvrir toutes les routes');

  const headers = new Map(
    globalRule.headers.map((header) => [header.key.toLowerCase(), header.value])
  );
  const expectedHeaders = [
    'content-security-policy',
    'x-frame-options',
    'x-content-type-options',
    'referrer-policy',
    'permissions-policy',
    'strict-transport-security',
  ];

  expectedHeaders.forEach((headerName) => {
    assert.ok(headers.has(headerName), `${headerName} doit être configuré`);
  });
  assert.equal(headers.get('x-frame-options'), 'DENY');
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.equal(headers.get('referrer-policy'), 'no-referrer');

  const contentSecurityPolicy = headers.get('content-security-policy');
  assert.match(contentSecurityPolicy, /default-src 'self'/);
  assert.match(contentSecurityPolicy, /object-src 'none'/);
  assert.match(contentSecurityPolicy, /frame-ancestors 'none'/);
  assert.match(contentSecurityPolicy, /base-uri 'self'/);
});
