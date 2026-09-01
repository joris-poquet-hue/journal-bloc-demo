function createAccountCreationCompensationError(message, cause) {
  const error = new Error(message);
  error.status = 502;
  error.cause = cause;
  error.retryable = true;
  return error;
}

function deletionResponseContainsProfile(payload, profileId) {
  const rows = Array.isArray(payload) ? payload : payload ? [payload] : [];

  return rows.some((row) => row?.id === profileId);
}

async function compensateFailedAccountCreation({
  authUserId,
  deleteAuthUser,
  deleteProfile,
  profileExists,
  profileId,
}) {
  if (profileId) {
    let profileDeletionConfirmed = false;
    let profileDeletionError = null;

    try {
      profileDeletionConfirmed = deletionResponseContainsProfile(
        await deleteProfile(profileId),
        profileId
      );
    } catch (error) {
      profileDeletionError = error;
    }

    if (!profileDeletionConfirmed) {
      try {
        profileDeletionConfirmed = !(await profileExists(profileId));
      } catch (error) {
        profileDeletionError ??= error;
      }
    }

    if (!profileDeletionConfirmed) {
      throw createAccountCreationCompensationError(
        'La création du profil n’a pas pu être annulée de façon sûre. Son identité de connexion provisoire a été conservée. Rechargez les comptes avant toute nouvelle action.',
        profileDeletionError
      );
    }
  }

  if (!authUserId) {
    return;
  }

  try {
    await deleteAuthUser(authUserId);
  } catch (error) {
    if (error?.status === 404) {
      return;
    }

    throw createAccountCreationCompensationError(
      'Le profil incomplet a été retiré, mais son identité de connexion provisoire n’a pas pu être nettoyée. Une intervention Administrateur est requise avant de recréer ce compte.',
      error
    );
  }
}

module.exports = {
  compensateFailedAccountCreation,
  deletionResponseContainsProfile,
};
