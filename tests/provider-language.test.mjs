import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

function listTsxFiles(directoryUrl) {
  return readdirSync(directoryUrl, { withFileTypes: true }).flatMap((entry) => {
    const entryUrl = new URL(`${entry.name}${entry.isDirectory() ? '/' : ''}`, directoryUrl);

    if (entry.isDirectory()) {
      return listTsxFiles(entryUrl);
    }

    return entry.name.endsWith('.tsx') ? [entryUrl] : [];
  });
}

test('les écrans ne présentent pas le nom du fournisseur de données', () => {
  const userInterfaceFiles = [
    ...listTsxFiles(new URL('../src/screens/', import.meta.url)),
    ...listTsxFiles(new URL('../src/components/', import.meta.url)),
    new URL('../mobile/WebAppShell.tsx', import.meta.url),
  ];

  userInterfaceFiles.forEach((fileUrl) => {
    const source = readFileSync(fileUrl, 'utf8');

    assert.doesNotMatch(
      source,
      /\bSupabase\b/i,
      `${fileUrl.pathname} contient encore une mention visible du fournisseur`
    );
  });
});
