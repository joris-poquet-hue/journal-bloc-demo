const {
  authAdminRequest,
  restRequest,
} = require('./serverAuth.cjs');
const {
  synchronizeAuthAndProfileLifecycle,
} = require('./accountLifecycle.cjs');

async function findLifecycleProfile(profileId) {
  const rows = await restRequest('profiles', {
    searchParams: {
      id: `eq.${profileId}`,
      limit: '1',
      select: '*',
    },
  });

  return rows?.[0] ?? null;
}

async function changeAccountLifecycle({
  adminIdentity,
  expectedVersion,
  profileId,
  targetActive,
}) {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    const error = new Error(
      'La version du profil est obligatoire. Rechargez les données.'
    );
    error.status = 409;
    throw error;
  }

  const currentProfile = await findLifecycleProfile(profileId);

  if (!currentProfile) {
    const error = new Error('Ce profil est introuvable.');
    error.status = 404;
    throw error;
  }

  if (currentProfile.id === adminIdentity.profile.id && !targetActive) {
    const error = new Error(
      'Le compte administrateur connecté ne peut pas être désactivé.'
    );
    error.status = 409;
    throw error;
  }

  if (!currentProfile.auth_user_id) {
    const error = new Error(
      'Ce compte historique ne possède plus d’identité Supabase Auth et ne peut pas être réactivé automatiquement.'
    );
    error.status = 409;
    throw error;
  }

  if (Number(currentProfile.version) !== expectedVersion) {
    const error = new Error(
      'Ce profil a été modifié par une autre session. Rechargez les données.'
    );
    error.status = 409;
    throw error;
  }

  if (Boolean(currentProfile.is_active) === targetActive) {
    const error = new Error(
      targetActive
        ? 'Ce compte est déjà actif.'
        : 'Ce compte est déjà désactivé.'
    );
    error.status = 409;
    throw error;
  }

  const result = await synchronizeAuthAndProfileLifecycle({
    authUserId: currentProfile.auth_user_id,
    targetActive,
    updateAuthUser: (authUserId, attributes) =>
      authAdminRequest(`admin/users/${encodeURIComponent(authUserId)}`, {
        body: attributes,
        method: 'PUT',
      }),
    updateProfile: () =>
      restRequest('rpc/set_profile_account_lifecycle', {
        body: {
          p_actor_profile_id: adminIdentity.profile.id,
          p_expected_version: expectedVersion,
          p_profile_id: profileId,
          p_target_is_active: targetActive,
        },
        method: 'POST',
      }),
  });
  const updatedProfile = Array.isArray(result) ? result[0] : result;

  if (!updatedProfile) {
    const error = new Error(
      'Supabase n’a pas retourné le profil après le changement d’état.'
    );
    error.status = 502;
    throw error;
  }

  return updatedProfile;
}

module.exports = {
  changeAccountLifecycle,
  findLifecycleProfile,
};
