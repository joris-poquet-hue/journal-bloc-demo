const {
  authAdminRequest,
  restRequest,
} = require('./serverAuth.cjs');

function firstRpcRow(payload) {
  return Array.isArray(payload) ? payload[0] ?? null : payload ?? null;
}

function createRetryableDeletionError(message, cause) {
  const error = new Error(message);
  error.status = 502;
  error.cause = cause;
  error.retryable = true;
  return error;
}

function isUuid(value) {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)
  );
}

async function permanentlyDeleteAccount({
  adminIdentity,
  confirmationLoginId,
  deleteAuthUser = (authUserId) =>
    authAdminRequest(`admin/users/${encodeURIComponent(authUserId)}`, {
      method: 'DELETE',
    }),
  expectedVersion,
  profileId,
  profileExists = async (candidateProfileId) => {
    const rows = await restRequest('profiles', {
      searchParams: {
        id: `eq.${candidateProfileId}`,
        limit: '1',
        select: 'id',
      },
    });

    if (!Array.isArray(rows)) {
      throw new Error('Réponse Supabase invalide lors du contrôle du profil.');
    }

    return rows.length > 0;
  },
  finalizeDeletion = (deletionRequestId) =>
    restRequest('rpc/finalize_disabled_profile_deletion', {
      body: {
        p_actor_profile_id: adminIdentity.profile.id,
        p_deletion_request_id: deletionRequestId,
      },
      method: 'POST',
    }),
  prepareDeletion = () =>
    restRequest('rpc/prepare_disabled_profile_deletion', {
      body: {
        p_actor_profile_id: adminIdentity.profile.id,
        p_confirmation_login_id: confirmationLoginId,
        p_expected_version: expectedVersion,
        p_profile_id: profileId,
      },
      method: 'POST',
    }),
}) {
  if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
    const error = new Error(
      'La version du profil est obligatoire. Rechargez les données.'
    );
    error.status = 409;
    throw error;
  }

  if (!profileId) {
    const error = new Error('L’identifiant du profil est obligatoire.');
    error.status = 400;
    throw error;
  }

  if (!confirmationLoginId) {
    const error = new Error(
      'Saisissez l’identifiant de connexion exact pour confirmer la suppression.'
    );
    error.status = 400;
    throw error;
  }

  const deletionWasCommitted = async () => {
    try {
      return !(await profileExists(profileId));
    } catch {
      return false;
    }
  };

  let preparation;

  try {
    preparation = firstRpcRow(await prepareDeletion());
  } catch (error) {
    if (await deletionWasCommitted()) {
      return { alreadyDeleted: true, deletedProfileId: profileId };
    }

    throw error;
  }

  if (
    !preparation?.deletionRequestId ||
    preparation.profileId !== profileId
  ) {
    throw createRetryableDeletionError(
      'Supabase n’a pas confirmé la préparation du profil demandé.'
    );
  }

  if (
    preparation.authIdentityExists !== true &&
    preparation.authIdentityExists !== false
  ) {
    throw createRetryableDeletionError(
      'Supabase n’a pas confirmé l’état de l’identité de connexion.'
    );
  }

  if (
    preparation.authIdentityExists &&
    !isUuid(preparation.authUserId)
  ) {
    throw createRetryableDeletionError(
      'Supabase n’a pas fourni une identité de connexion valide.'
    );
  }

  if (preparation.authIdentityExists) {
    try {
      await deleteAuthUser(preparation.authUserId);
    } catch (error) {
      if (error?.status !== 404) {
        throw createRetryableDeletionError(
          'L’identité de connexion n’a pas pu être supprimée. Le profil reste désactivé et la suppression peut être réessayée.',
          error
        );
      }
    }
  }

  let finalized;

  try {
    finalized = firstRpcRow(
      await finalizeDeletion(preparation.deletionRequestId)
    );
  } catch (error) {
    if (await deletionWasCommitted()) {
      return { alreadyDeleted: true, deletedProfileId: profileId };
    }

    throw createRetryableDeletionError(
      'L’effacement final n’a pas pu être confirmé. Le profil reste désactivé et la suppression peut être réessayée.',
      error
    );
  }

  if (
    !finalized?.deletedProfileId ||
    finalized.deletedProfileId !== profileId
  ) {
    if (await deletionWasCommitted()) {
      return { alreadyDeleted: true, deletedProfileId: profileId };
    }

    throw createRetryableDeletionError(
      'Supabase n’a pas confirmé l’effacement définitif du profil.'
    );
  }

  return finalized;
}

module.exports = {
  firstRpcRow,
  permanentlyDeleteAccount,
};
