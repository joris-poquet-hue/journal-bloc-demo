import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  compensateFailedAccountCreation,
  deletionResponseContainsProfile,
} = require('../src/serverAccountCreationCompensation.cjs');

function buildInput(overrides = {}) {
  return {
    authUserId: '11111111-1111-4111-8111-111111111111',
    deleteAuthUser: async () => {},
    deleteProfile: async () => [{ id: 'target-profile' }],
    profileExists: async () => false,
    profileId: 'target-profile',
    ...overrides,
  };
}

test('reconnaît uniquement une confirmation de suppression portant sur le profil créé', () => {
  assert.equal(
    deletionResponseContainsProfile([{ id: 'target-profile' }], 'target-profile'),
    true
  );
  assert.equal(
    deletionResponseContainsProfile([{ id: 'another-profile' }], 'target-profile'),
    false
  );
  assert.equal(deletionResponseContainsProfile(null, 'target-profile'), false);
});

test('supprime Auth seulement après la confirmation exacte du DELETE profil', async () => {
  const calls = [];

  await compensateFailedAccountCreation(
    buildInput({
      deleteAuthUser: async (authUserId) => calls.push(['auth', authUserId]),
      deleteProfile: async (profileId) => {
        calls.push(['profile', profileId]);
        return [{ id: profileId }];
      },
      profileExists: async () => {
        calls.push(['verify']);
        return true;
      },
    })
  );

  assert.deepEqual(calls, [
    ['profile', 'target-profile'],
    ['auth', '11111111-1111-4111-8111-111111111111'],
  ]);
});

test('une réponse DELETE perdue est récupérée par une lecture confirmant la disparition', async () => {
  const calls = [];

  await compensateFailedAccountCreation(
    buildInput({
      deleteAuthUser: async () => calls.push('auth'),
      deleteProfile: async () => {
        calls.push('profile');
        throw new Error('réponse perdue');
      },
      profileExists: async () => {
        calls.push('verify');
        return false;
      },
    })
  );

  assert.deepEqual(calls, ['profile', 'verify', 'auth']);
});

test('préserve Auth si le profil existe encore après l’échec de compensation', async () => {
  let authDeletionCalled = false;

  await assert.rejects(
    compensateFailedAccountCreation(
      buildInput({
        deleteAuthUser: async () => {
          authDeletionCalled = true;
        },
        deleteProfile: async () => [],
        profileExists: async () => true,
      })
    ),
    (error) =>
      error.status === 502 &&
      error.retryable === true &&
      /identité de connexion provisoire a été conservée/.test(error.message)
  );

  assert.equal(authDeletionCalled, false);
});

test('préserve Auth si la disparition du profil ne peut pas être vérifiée', async () => {
  let authDeletionCalled = false;

  await assert.rejects(
    compensateFailedAccountCreation(
      buildInput({
        deleteAuthUser: async () => {
          authDeletionCalled = true;
        },
        deleteProfile: async () => {
          throw new Error('DELETE indisponible');
        },
        profileExists: async () => {
          throw new Error('lecture indisponible');
        },
      })
    ),
    (error) => error.status === 502 && error.retryable === true
  );

  assert.equal(authDeletionCalled, false);
});

test('nettoie Auth directement lorsque le profil n’a jamais été créé', async () => {
  const calls = [];

  await compensateFailedAccountCreation(
    buildInput({
      deleteAuthUser: async () => calls.push('auth'),
      deleteProfile: async () => calls.push('profile'),
      profileId: null,
    })
  );

  assert.deepEqual(calls, ['auth']);
});

test('signale un nettoyage Auth non confirmé après disparition du profil', async () => {
  await assert.rejects(
    compensateFailedAccountCreation(
      buildInput({
        deleteAuthUser: async () => {
          const error = new Error('Auth indisponible');
          error.status = 503;
          throw error;
        },
      })
    ),
    (error) =>
      error.status === 502 &&
      error.retryable === true &&
      /intervention Administrateur est requise/.test(error.message)
  );
});

test('un 404 Auth confirme que l’identité provisoire est déjà absente', async () => {
  await compensateFailedAccountCreation(
    buildInput({
      deleteAuthUser: async () => {
        const error = new Error('absente');
        error.status = 404;
        throw error;
      },
    })
  );
});
