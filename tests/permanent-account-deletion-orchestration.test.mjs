import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  firstRpcRow,
  permanentlyDeleteAccount,
} = require('../src/serverPermanentAccountDeletion.cjs');

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const adminUsersApi = readSource('../api/admin-users.js');
const adminAccessKeyApi = readSource('../api/admin-access-key.js');
const authPasswordApi = readSource('../api/auth-password.js');
const immediateLoginMigration = readSource(
  '../supabase/migrations/202609010002_immediate_first_login.sql'
);
const AUTH_USER_ID = '11111111-1111-4111-8111-111111111111';

function buildInput(overrides = {}) {
  return {
    adminIdentity: { profile: { id: 'admin-profile' } },
    confirmationLoginId: 'profil.cible',
    expectedVersion: 7,
    profileId: 'target-profile',
    ...overrides,
  };
}

test('normalise les réponses RPC objet ou tableau', () => {
  assert.deepEqual(firstRpcRow([{ id: 'first' }]), { id: 'first' });
  assert.deepEqual(firstRpcRow({ id: 'single' }), { id: 'single' });
  assert.equal(firstRpcRow([]), null);
  assert.equal(firstRpcRow(null), null);
});

test('supprime Auth entre la préparation et la finalisation SQL', async () => {
  const calls = [];
  const result = await permanentlyDeleteAccount(
    buildInput({
      deleteAuthUser: async (authUserId) => {
        calls.push(['auth', authUserId]);
      },
      finalizeDeletion: async (requestId) => {
        calls.push(['finalize', requestId]);
        return { deletedProfileId: 'target-profile' };
      },
      prepareDeletion: async () => {
        calls.push(['prepare']);
        return {
          authIdentityExists: true,
          authUserId: AUTH_USER_ID,
          deletionRequestId: 'deletion-request',
          profileId: 'target-profile',
        };
      },
    })
  );

  assert.deepEqual(calls, [
    ['prepare'],
    ['auth', AUTH_USER_ID],
    ['finalize', 'deletion-request'],
  ]);
  assert.equal(result.deletedProfileId, 'target-profile');
});

test('une identité Auth déjà absente permet de reprendre la finalisation', async () => {
  let authDeletionCalled = false;
  const result = await permanentlyDeleteAccount(
    buildInput({
      deleteAuthUser: async () => {
        authDeletionCalled = true;
      },
      finalizeDeletion: async () => ({
        deletedProfileId: 'target-profile',
      }),
      prepareDeletion: async () => ({
        authIdentityExists: false,
        authUserId: AUTH_USER_ID,
        deletionRequestId: 'deletion-request',
        profileId: 'target-profile',
      }),
    })
  );

  assert.equal(authDeletionCalled, false);
  assert.equal(result.deletedProfileId, 'target-profile');
});

test('un 404 Auth est traité comme une suppression déjà réalisée', async () => {
  let finalized = false;
  await permanentlyDeleteAccount(
    buildInput({
      deleteAuthUser: async () => {
        const error = new Error('introuvable');
        error.status = 404;
        throw error;
      },
      finalizeDeletion: async () => {
        finalized = true;
        return { deletedProfileId: 'target-profile' };
      },
      prepareDeletion: async () => ({
        authIdentityExists: true,
        authUserId: AUTH_USER_ID,
        deletionRequestId: 'deletion-request',
        profileId: 'target-profile',
      }),
    })
  );

  assert.equal(finalized, true);
});

test('un échec Auth laisse la demande préparée réessayable sans effacer les données', async () => {
  let finalized = false;

  await assert.rejects(
    permanentlyDeleteAccount(
      buildInput({
        deleteAuthUser: async () => {
          const error = new Error('Auth indisponible');
          error.status = 503;
          throw error;
        },
        finalizeDeletion: async () => {
          finalized = true;
        },
        prepareDeletion: async () => ({
          authIdentityExists: true,
          authUserId: AUTH_USER_ID,
          deletionRequestId: 'deletion-request',
          profileId: 'target-profile',
        }),
      })
    ),
    (error) => error.status === 502 && error.retryable === true
  );

  assert.equal(finalized, false);
});

test('refuse une préparation liée à un autre profil avant de toucher Auth', async () => {
  let authDeletionCalled = false;
  let finalized = false;

  await assert.rejects(
    permanentlyDeleteAccount(
      buildInput({
        deleteAuthUser: async () => {
          authDeletionCalled = true;
        },
        finalizeDeletion: async () => {
          finalized = true;
        },
        prepareDeletion: async () => ({
          authIdentityExists: true,
          authUserId: AUTH_USER_ID,
          deletionRequestId: 'deletion-request-for-another-profile',
          profileId: 'another-profile',
        }),
      })
    ),
    (error) => error.status === 502 && error.retryable === true
  );

  assert.equal(authDeletionCalled, false);
  assert.equal(finalized, false);
});

test('refuse un état Auth présent sans UUID valide avant toute suppression', async () => {
  let authDeletionCalled = false;
  let finalized = false;

  await assert.rejects(
    permanentlyDeleteAccount(
      buildInput({
        deleteAuthUser: async () => {
          authDeletionCalled = true;
        },
        finalizeDeletion: async () => {
          finalized = true;
        },
        prepareDeletion: async () => ({
          authIdentityExists: true,
          authUserId: 'identite-invalide',
          deletionRequestId: 'deletion-request',
          profileId: 'target-profile',
        }),
      })
    ),
    (error) => error.status === 502 && error.retryable === true
  );

  assert.equal(authDeletionCalled, false);
  assert.equal(finalized, false);
});

test('refuse un état d’existence Auth indéterminé avant toute suppression', async () => {
  let authDeletionCalled = false;
  let finalized = false;

  await assert.rejects(
    permanentlyDeleteAccount(
      buildInput({
        deleteAuthUser: async () => {
          authDeletionCalled = true;
        },
        finalizeDeletion: async () => {
          finalized = true;
        },
        prepareDeletion: async () => ({
          authUserId: AUTH_USER_ID,
          deletionRequestId: 'deletion-request',
          profileId: 'target-profile',
        }),
      })
    ),
    (error) => error.status === 502 && error.retryable === true
  );

  assert.equal(authDeletionCalled, false);
  assert.equal(finalized, false);
});

test('refuse une confirmation SQL portant sur un autre profil', async () => {
  await assert.rejects(
    permanentlyDeleteAccount(
      buildInput({
        finalizeDeletion: async () => ({
          deletedProfileId: 'another-profile',
        }),
        prepareDeletion: async () => ({
          authIdentityExists: false,
          authUserId: null,
          deletionRequestId: 'deletion-request',
          profileId: 'target-profile',
        }),
        profileExists: async () => true,
      })
    ),
    (error) => error.status === 502 && error.retryable === true
  );
});

test('reconnaît un succès déjà commité si la réponse finale a été perdue', async () => {
  const result = await permanentlyDeleteAccount(
    buildInput({
      finalizeDeletion: async () => {
        throw new Error('connexion interrompue après commit');
      },
      prepareDeletion: async () => ({
        authIdentityExists: false,
        authUserId: null,
        deletionRequestId: 'deletion-request',
        profileId: 'target-profile',
      }),
      profileExists: async () => false,
    })
  );

  assert.deepEqual(result, {
    alreadyDeleted: true,
    deletedProfileId: 'target-profile',
  });
});

test('un nouvel appel est idempotent lorsque le profil a déjà disparu', async () => {
  const result = await permanentlyDeleteAccount(
    buildInput({
      prepareDeletion: async () => {
        const error = new Error('Profil introuvable.');
        error.status = 404;
        throw error;
      },
      profileExists: async () => false,
    })
  );

  assert.equal(result.deletedProfileId, 'target-profile');
  assert.equal(result.alreadyDeleted, true);
});

test('l’API réserve une action explicite à la suppression définitive', () => {
  assert.match(adminUsersApi, /action.*delete_permanently/s);
  assert.match(adminUsersApi, /permanentlyDeleteAccount/);
  assert.match(adminUsersApi, /confirmationLogin/);
  assert.match(adminUsersApi, /deletedProfileId/);
  assert.match(adminUsersApi, /retryable/);
});

test('les futures traces de cycle de vie identifient précisément le profil cible', () => {
  assert.match(adminUsersApi, /analytics_event:\s*\{/);
  assert.match(adminUsersApi, /kind:\s*'account_lifecycle'/);
  assert.match(adminUsersApi, /targetAuthUserId:/);
  assert.match(adminUsersApi, /targetProfileId:/);
  assert.match(adminUsersApi, /target_profile_id:/);

  assert.doesNotMatch(adminAccessKeyApi, /restRequest\('activity_log'/);
  assert.match(
    immediateLoginMigration,
    /Clé d’accès provisoire régénérée[\s\S]*'kind', 'account_lifecycle'[\s\S]*'targetAuthUserId'[\s\S]*'targetProfileId'/
  );
  assert.match(immediateLoginMigration, /target_profile_id/);
});

test('la demande e-mail fusionne le metadata côté SQL sans réintroduire un UUID supprimé', () => {
  const functionStart = authPasswordApi.indexOf(
    'async function storePendingEmailConfirmation'
  );
  const functionEnd = authPasswordApi.indexOf(
    '\nasync function recordEmailConfirmationRequest',
    functionStart
  );
  const source = authPasswordApi.slice(functionStart, functionEnd);

  assert.match(source, /rpc\/store_pending_email_confirmation/);
  assert.match(source, /p_profile_id: profile\.id/);
  assert.match(source, /method: 'POST'/);
  assert.doesNotMatch(source, /\.\.\.\(profile\.metadata/);
});
