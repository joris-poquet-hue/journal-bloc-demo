import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const mobileRoot = resolve(projectRoot, 'mobile');
const allowedMobileVulnerabilityChain = new Set([
  '@expo/cli',
  '@expo/metro',
  '@expo/metro-config',
  '@react-native/community-cli-plugin',
  '@react-native/virtualized-lists',
  'expo',
  'image-size',
  'metro',
  'metro-config',
  'metro-transform-worker',
  'react-native',
]);

function runAudit(cwd) {
  const result = spawnSync('npm', ['audit', '--json'], {
    cwd,
    encoding: 'utf8',
  });

  let report;
  try {
    report = JSON.parse(result.stdout || '{}');
  } catch {
    throw new Error(`Réponse npm audit illisible pour ${cwd}.`);
  }

  if (report.error || report.message) {
    throw new Error(report.message || report.error?.summary || 'npm audit a échoué.');
  }

  return report;
}

function assertWebAudit(report) {
  const vulnerabilities = Object.keys(report.vulnerabilities ?? {});
  if (vulnerabilities.length > 0) {
    throw new Error(`Vulnérabilités web non corrigées : ${vulnerabilities.join(', ')}`);
  }
}

function assertMobileAudit(report) {
  const vulnerabilities = report.vulnerabilities ?? {};
  const unexpected = Object.keys(vulnerabilities).filter(
    (name) => !allowedMobileVulnerabilityChain.has(name)
  );

  if (unexpected.length > 0) {
    throw new Error(`Nouvelles vulnérabilités mobiles : ${unexpected.join(', ')}`);
  }

  const imageSize = vulnerabilities['image-size'];
  const advisories = (imageSize?.via ?? [])
    .filter((item) => typeof item === 'object')
    .map((item) => item.url);
  const expectedAdvisories = [
    'https://github.com/advisories/GHSA-5p2g-fcmc-qvqq',
    'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr',
  ];
  const containsOnlyExpectedAdvisories =
    advisories.length === expectedAdvisories.length &&
    advisories.every((url) => expectedAdvisories.includes(url));

  if (Object.keys(vulnerabilities).length > 0 && !containsOnlyExpectedAdvisories) {
    throw new Error('La chaîne mobile signalée ne correspond plus aux deux avis image-size connus.');
  }

  const patchPath = resolve(mobileRoot, 'patches/image-size+1.2.1.patch');
  if (!existsSync(patchPath)) {
    throw new Error('Le correctif local image-size est absent.');
  }

  const patch = readFileSync(patchPath, 'utf8');
  if (!patch.includes('Invalid ICNS entry length')) {
    throw new Error('Le correctif ICNS image-size attendu est incomplet.');
  }
}

assertWebAudit(runAudit(projectRoot));
assertMobileAudit(runAudit(mobileRoot));

console.log('Audit web : aucune vulnérabilité.');
console.log(
  'Audit mobile : deux avis image-size sans version corrigée en amont, chaîne strictement bornée et correctif local vérifié.'
);
