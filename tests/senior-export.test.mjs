import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildSeniorInstitutionExportScope,
} from '../src/utils/seniorExportScope.ts';
import { readFileSync } from 'node:fs';

const institutionSenior = {
  contactEmail: 'senior-secret@example.test',
  firstName: 'Sophie',
  id: 'senior-institution-a',
  institution: 'CHU A',
  institutionId: 'institution-a',
  lastName: 'Martin',
  loginId: 'senior-secret-login',
};
const sameInstitutionInternal = {
  contactEmail: 'interne-secret@example.test',
  createdAt: '2026-07-01T08:00:00.000Z',
  firstName: 'Alice',
  id: 'internal-a',
  institution: 'CHU A',
  institutionId: 'institution-a',
  isActive: true,
  lastLoginAt: null,
  lastName: 'Durand',
  loginId: 'interne-secret-login',
  promotion: '2026',
  semester: '6e semestre',
};
const otherInstitutionInternal = {
  ...sameInstitutionInternal,
  contactEmail: 'autre-secret@example.test',
  firstName: 'Béatrice',
  id: 'internal-b',
  institution: 'CHU B',
  institutionId: 'institution-b',
  loginId: 'autre-secret-login',
};

function createIntervention(id, internalId) {
  return {
    approach: 'coelioscopie',
    autonomyScore: 3,
    checklist: {
      'step-1': '3',
    },
    complexity: '5',
    context: 'programme',
    customIndication: null,
    date: '2026-07-20',
    entryTechnique: 'open',
    id,
    indication: 'geu',
    indicationComment: '',
    internalId,
    laterality: 'droite',
    procedure: 'salpingectomie',
    role: 'operateur_principal',
    savedAt: '2026-07-20T09:00:00.000Z',
    seniorId: institutionSenior.id,
  };
}

test('l’export Senior est limité par l’identifiant stable de l’établissement', () => {
  const scope = buildSeniorInstitutionExportScope(
    institutionSenior,
    [
      createIntervention('intervention-a', sameInstitutionInternal.id),
      createIntervention('intervention-b', otherInstitutionInternal.id),
    ],
    [sameInstitutionInternal, otherInstitutionInternal],
    [institutionSenior]
  );

  assert.deepEqual(
    scope.internalProfiles.map((profile) => profile.id),
    [sameInstitutionInternal.id]
  );
  assert.deepEqual(
    scope.interventions.map((intervention) => intervention.id),
    ['intervention-a']
  );
  assert.equal(scope.internalProfiles[0].contactEmail, null);
  assert.equal(scope.internalProfiles[0].loginId, '');
  assert.equal(scope.selectableSeniors[0].contactEmail, null);
  assert.equal(scope.selectableSeniors[0].loginId, undefined);
});

test('le contrat du classeur Senior exclut les données privées', () => {
  const scope = buildSeniorInstitutionExportScope(
    institutionSenior,
    [createIntervention('intervention-a', sameInstitutionInternal.id)],
    [sameInstitutionInternal],
    [institutionSenior]
  );
  const exportSource = readFileSync(
    new URL('../src/utils/export.ts', import.meta.url),
    'utf8'
  );
  const serializedScope = JSON.stringify(scope);

  for (const secret of [
    'senior-secret@example.test',
    'senior-secret-login',
    'interne-secret@example.test',
    'interne-secret-login',
  ]) {
    assert.doesNotMatch(
      serializedScope,
      new RegExp(secret.replace('.', '\\.'))
    );
  }

  assert.match(serializedScope, /Alice/);
  assert.doesNotMatch(serializedScope, /Béatrice/);
  assert.doesNotMatch(
    exportSource,
    /E-mail|Adresse e-mail|Identifiant de connexion|Bloc-notes|Mot de passe|Clé d’accès/i
  );
});

test('un rattachement sans identifiant stable bloque l’export Senior', () => {
  assert.throws(
    () =>
      buildSeniorInstitutionExportScope(
        { ...institutionSenior, institutionId: null },
        [],
        [],
        []
      ),
    /établissement du Senior doit être identifié/
  );
});
