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

test('les écrans opérationnels ne présentent pas le nom du fournisseur de données', () => {
  const legalDocumentPath = new URL(
    '../src/screens/LegalInformationScreen.tsx',
    import.meta.url
  ).pathname;
  const userInterfaceFiles = [
    ...listTsxFiles(new URL('../src/screens/', import.meta.url)),
    ...listTsxFiles(new URL('../src/components/', import.meta.url)),
    new URL('../mobile/WebAppShell.tsx', import.meta.url),
  ].filter((fileUrl) => fileUrl.pathname !== legalDocumentPath);

  userInterfaceFiles.forEach((fileUrl) => {
    const source = readFileSync(fileUrl, 'utf8');

    assert.doesNotMatch(
      source,
      /\bSupabase\b/i,
      `${fileUrl.pathname} contient encore une mention visible du fournisseur`
    );
  });
});

test('la politique de confidentialité identifie le sous-traitant de données', () => {
  const source = readFileSync(
    new URL('../src/screens/LegalInformationScreen.tsx', import.meta.url),
    'utf8'
  );

  assert.match(source, /Supabase/);
});
