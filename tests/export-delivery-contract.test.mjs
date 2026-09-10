import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

test('chaque rôle journalise ses exports avec leur portée et leur nombre de lignes', () => {
  const profileSource = readSource('../src/screens/ProfileScreen.tsx');
  const adminSource = readSource('../src/screens/AdminScreen.tsx');
  const seniorSource = readSource('../src/screens/admin/SeniorDashboard.tsx');

  assert.match(profileSource, /recordActivity\([\s\S]*Export XLSX[\s\S]*exportedCount/);
  assert.match(seniorSource, /recordActivity\([\s\S]*Export XLSX[\s\S]*exportedCount/);
  assert.match(
    adminSource,
    /recordActivity\([\s\S]*Export XLSX[\s\S]*recentRecordedCount/
  );
});

test('l’application native valide, partage puis supprime le XLSX temporaire', () => {
  const webDeliverySource = readSource('../src/utils/xlsx.ts');
  const mobileSource = readSource('../mobile/WebAppShell.tsx');

  assert.match(webDeliverySource, /MONJDB_FILE_EXPORT/);
  assert.match(webDeliverySource, /ReactNativeWebView/);
  assert.match(mobileSource, /isNativeFileExportMessage/);
  assert.match(mobileSource, /Sharing\.shareAsync/);
  assert.match(mobileSource, /file\.write\(message\.base64, \{ encoding: 'base64' \}\)/);
  assert.match(mobileSource, /finally \{[\s\S]*file\.delete\(\)/);
});
