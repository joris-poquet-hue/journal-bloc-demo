const AUTH_ACCOUNT_BAN_DURATION = '876000h';

function buildAuthLifecycleAttributes(targetActive) {
  return {
    ban_duration: targetActive ? 'none' : AUTH_ACCOUNT_BAN_DURATION,
  };
}

async function synchronizeAuthAndProfileLifecycle({
  authUserId,
  targetActive,
  updateAuthUser,
  updateProfile,
}) {
  await updateAuthUser(
    authUserId,
    buildAuthLifecycleAttributes(targetActive)
  );

  try {
    return await updateProfile();
  } catch (error) {
    try {
      await updateAuthUser(
        authUserId,
        buildAuthLifecycleAttributes(!targetActive)
      );
    } catch (compensationError) {
      const synchronizationError = new Error(
        'Le changement du compte a échoué et son état Auth n’a pas pu être restauré automatiquement.'
      );
      synchronizationError.status = 502;
      synchronizationError.cause = error;
      synchronizationError.compensationError = compensationError;
      throw synchronizationError;
    }

    throw error;
  }
}

module.exports = {
  AUTH_ACCOUNT_BAN_DURATION,
  buildAuthLifecycleAttributes,
  synchronizeAuthAndProfileLifecycle,
};
