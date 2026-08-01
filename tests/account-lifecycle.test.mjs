import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  AUTH_ACCOUNT_BAN_DURATION,
  buildAuthLifecycleAttributes,
  synchronizeAuthAndProfileLifecycle,
} = require('../src/accountLifecycle.cjs');

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const migration = readSource(
  '../supabase/migrations/202608010001_reversible_account_lifecycle.sql'
);
const lifecycleApi = readSource('../api/admin-account-lifecycle.js');
const legacyAdminApi = readSource('../api/admin-users.js');
const adminScreen = readSource('../src/screens/AdminScreen.tsx');

test('désactivation et réactivation utilisent le bannissement Auth réversible', () => {
  assert.equal(AUTH_ACCOUNT_BAN_DURATION, '876000h');
  assert.deepEqual(buildAuthLifecycleAttributes(false), {
    ban_duration: '876000h',
  });
  assert.deepEqual(buildAuthLifecycleAttributes(true), {
    ban_duration: 'none',
  });
});

test('la réactivation conserve l’identité Auth et met ensuite le profil à jour', async () => {
  const calls = [];
  const profile = {
    auth_user_id: 'auth-user-preserved',
    id: 'profile-reactivated',
    is_active: true,
  };

  const result = await synchronizeAuthAndProfileLifecycle({
    authUserId: profile.auth_user_id,
    targetActive: true,
    updateAuthUser: async (authUserId, attributes) => {
      calls.push(['auth', authUserId, attributes]);
    },
    updateProfile: async () => {
      calls.push(['profile', profile.id, true]);
      return profile;
    },
  });

  assert.equal(result, profile);
  assert.deepEqual(calls, [
    ['auth', 'auth-user-preserved', { ban_duration: 'none' }],
    ['profile', 'profile-reactivated', true],
  ]);
});

test('un échec de réactivation rebannit automatiquement la même identité Auth', async () => {
  const authUpdates = [];
  const databaseError = new Error('conflit de version');

  await assert.rejects(
    synchronizeAuthAndProfileLifecycle({
      authUserId: 'auth-user-preserved',
      targetActive: true,
      updateAuthUser: async (_authUserId, attributes) => {
        authUpdates.push(attributes);
      },
      updateProfile: async () => {
        throw databaseError;
      },
    }),
    (error) => error === databaseError
  );

  assert.deepEqual(authUpdates, [
    { ban_duration: 'none' },
    { ban_duration: '876000h' },
  ]);
});

test('un échec de désactivation restaure immédiatement l’accès Auth précédent', async () => {
  const authUpdates = [];

  await assert.rejects(
    synchronizeAuthAndProfileLifecycle({
      authUserId: 'auth-user-preserved',
      targetActive: false,
      updateAuthUser: async (_authUserId, attributes) => {
        authUpdates.push(attributes);
      },
      updateProfile: async () => {
        throw new Error('échec RPC');
      },
    }),
    /échec RPC/
  );

  assert.deepEqual(authUpdates, [
    { ban_duration: '876000h' },
    { ban_duration: 'none' },
  ]);
});

test('la migration protège l’identité, révoque les accès et audite les deux transitions', () => {
  assert.match(migration, /references auth\.users\(id\)[\s\S]*on delete restrict/i);
  assert.match(migration, /protect_profile_account_lifecycle/i);
  assert.match(migration, /L’identité Supabase Auth d’un profil ne peut pas être détachée/i);
  assert.match(migration, /set_profile_account_lifecycle/i);
  assert.match(migration, /update public\.application_sessions[\s\S]*account_deactivated/i);
  assert.match(migration, /delete from auth\.sessions/i);
  assert.match(migration, /update public\.push_subscriptions[\s\S]*is_active = false/i);
  assert.match(migration, /Compte désactivé/);
  assert.match(migration, /Compte réactivé/);
  assert.match(migration, /'kind', 'account_lifecycle'/);
  assert.match(migration, /'authIdentityPreserved', true/);
  assert.doesNotMatch(
    migration,
    /update public\.profiles[\s\S]{0,500}auth_user_id\s*=\s*null/i
  );
});

test('les deux API Admin passent par le cycle réversible sans supprimer l’utilisateur Auth', () => {
  const deactivateStart = legacyAdminApi.indexOf(
    'async function deactivateAccount'
  );
  const deactivateEnd = legacyAdminApi.indexOf(
    '\nmodule.exports =',
    deactivateStart
  );
  const deactivateSource = legacyAdminApi.slice(deactivateStart, deactivateEnd);

  assert.ok(deactivateStart >= 0);
  assert.ok(deactivateEnd > deactivateStart);
  assert.match(deactivateSource, /changeAccountLifecycle/);
  assert.doesNotMatch(deactivateSource, /authAdminRequest/);
  assert.doesNotMatch(deactivateSource, /method:\s*'DELETE'/);
  assert.doesNotMatch(deactivateSource, /auth_user_id\s*:\s*null/);
  assert.match(lifecycleApi, /action === 'reactivate'/);
  assert.match(lifecycleApi, /targetActive/);
  assert.match(adminScreen, /handleReactivateProfile/);
});
