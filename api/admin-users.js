const {
  authAdminRequest,
  getAuthUser,
  getRequestBody,
  isConfigured,
  requireAdmin,
  restRequest,
  sendJson,
  toPublicProfile,
} = require('../src/serverAuth.cjs');
const {
  generateAccessKey,
  generatePendingAuthEmail,
  toPendingAuthPassword,
} = require('../src/accessKey.cjs');
const {
  changeAccountLifecycle,
} = require('../src/serverAccountLifecycle.cjs');

const ALLOWED_ROLES = new Set(['internal', 'senior', 'admin']);

function sanitizeProfileInput(body) {
  return {
    expectedVersion: Number(body?.expectedVersion ?? 0),
    firstName: String(body?.firstName ?? '').trim(),
    institutionId: String(body?.institutionId ?? '').trim(),
    lastName: String(body?.lastName ?? '').trim(),
    loginId: String(body?.loginId ?? '').trim(),
    profileId: String(body?.profileId ?? '').trim(),
    promotion: String(body?.promotion ?? '').trim(),
    role: String(body?.role ?? '').trim(),
    semester: String(body?.semester ?? '').trim().toUpperCase(),
  };
}

async function findProfile(profileId) {
  const rows = await restRequest('profiles', {
    searchParams: {
      id: `eq.${profileId}`,
      limit: '1',
      select: '*',
    },
  });

  return rows?.[0] ?? null;
}

async function isLoginIdAvailable(loginId, ignoredProfileId = null) {
  const rows = await restRequest('profiles', {
    searchParams: {
      limit: '2',
      login_id: `eq.${loginId}`,
      select: 'id',
    },
  });

  return !(rows ?? []).some((profile) => profile.id !== ignoredProfileId);
}

async function findActiveInstitution(institutionId) {
  if (!institutionId) {
    return null;
  }

  const rows = await restRequest('institutions', {
    searchParams: {
      id: `eq.${institutionId}`,
      limit: '1',
      select: 'id,name,status',
      status: 'eq.active',
    },
  });

  return rows?.[0] ?? null;
}

function validateCommonInput(input) {
  if (!ALLOWED_ROLES.has(input.role)) {
    return 'Le rôle du compte n’est pas valide.';
  }

  if (!input.firstName || !input.lastName || !input.loginId) {
    return 'Le prénom, le nom et l’identifiant sont obligatoires.';
  }

  if (input.role === 'internal') {
    if (!input.promotion || !input.semester) {
      return 'La promotion et le semestre sont obligatoires pour un interne.';
    }
  }

  if (
    (input.role === 'internal' || input.role === 'senior') &&
    !input.institutionId
  ) {
    return 'Sélectionnez un établissement actif dans la liste officielle.';
  }

  return null;
}

async function createAccount(input, adminIdentity) {
  if (!(await isLoginIdAvailable(input.loginId))) {
    const error = new Error('Cet identifiant existe déjà.');
    error.status = 409;
    throw error;
  }

  let authUserId = null;
  let profileId = null;
  const accessKey = generateAccessKey();
  const pendingAuthEmail = generatePendingAuthEmail();
  const institution =
    input.role === 'internal' || input.role === 'senior'
      ? await findActiveInstitution(input.institutionId)
      : null;

  if (
    (input.role === 'internal' || input.role === 'senior') &&
    !institution
  ) {
    const error = new Error(
      'L’établissement sélectionné est introuvable ou archivé.'
    );
    error.status = 400;
    throw error;
  }

  try {
    const authPayload = await authAdminRequest('admin/users', {
      body: {
        app_metadata: {
          pending_activation: true,
        },
        email: pendingAuthEmail,
        email_confirm: true,
        password: toPendingAuthPassword(accessKey),
        user_metadata: {
          first_name: input.firstName,
          institution: institution?.name ?? null,
          institution_id: institution?.id ?? null,
          last_name: input.lastName,
          login_id: input.loginId,
          role: input.role,
        },
      },
      method: 'POST',
    });
    const authUser = authPayload?.user ?? authPayload;
    authUserId = authUser?.id ?? null;

    if (!authUserId) {
      throw new Error('Supabase Auth n’a pas retourné de compte utilisateur.');
    }

    const rows = await restRequest('profiles', {
      body: {
        auth_user_id: authUserId,
        first_name: input.firstName,
        institution_id: institution?.id ?? null,
        last_name: input.lastName,
        login_id: input.loginId,
        metadata: {},
        must_change_password: true,
        promotion: input.role === 'internal' ? input.promotion : null,
        role: input.role,
        semester: input.role === 'internal' ? input.semester : null,
        updated_by_profile_id: adminIdentity.profile.id,
      },
      headers: {
        Prefer: 'return=representation',
      },
      method: 'POST',
    });

    const profile = rows?.[0] ?? null;
    profileId = profile?.id ?? null;

    if (!profile) {
      throw new Error('Supabase n’a pas retourné le profil créé.');
    }

    await restRequest('activity_log', {
      body: {
        action: 'Compte créé avec clé d’accès provisoire',
        actor_label: `${adminIdentity.profile.first_name} ${adminIdentity.profile.last_name}`.trim(),
        actor_role: adminIdentity.profile.role,
        created_by_profile_id: adminIdentity.profile.id,
        profile_id: adminIdentity.profile.id,
        target_label: `${profile.first_name} ${profile.last_name}`.trim(),
        target_type: 'Compte utilisateur',
      },
      headers: {
        Prefer: 'return=minimal',
      },
      method: 'POST',
    });

    return { accessKey, profile };
  } catch (error) {
    if (profileId) {
      await restRequest('profiles', {
        method: 'DELETE',
        searchParams: {
          id: `eq.${profileId}`,
        },
      }).catch(() => null);
    }

    if (authUserId) {
      await authAdminRequest(`admin/users/${encodeURIComponent(authUserId)}`, {
        method: 'DELETE',
      }).catch(() => null);
    }

    throw error;
  }
}

async function updateAccount(input, adminIdentity) {
  const currentProfile = await findProfile(input.profileId);

  if (!currentProfile?.auth_user_id) {
    const error = new Error('Ce profil n’est pas relié à Supabase Auth.');
    error.status = 404;
    throw error;
  }

  if (!(await isLoginIdAvailable(input.loginId, input.profileId))) {
    const error = new Error('Cet identifiant existe déjà.');
    error.status = 409;
    throw error;
  }

  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    const error = new Error('La version du profil est obligatoire. Rechargez les données.');
    error.status = 409;
    throw error;
  }

  const institution =
    input.role === 'internal' || input.role === 'senior'
      ? await findActiveInstitution(input.institutionId)
      : null;

  if (
    (input.role === 'internal' || input.role === 'senior') &&
    !institution
  ) {
    const error = new Error(
      'L’établissement sélectionné est introuvable ou archivé.'
    );
    error.status = 400;
    throw error;
  }

  if (
    (input.role === 'internal' || input.role === 'senior') &&
    currentProfile.institution_id !== institution.id
  ) {
    const error = new Error(
      'Le déplacement d’établissement doit être confirmé par la fonction atomique.'
    );
    error.status = 409;
    throw error;
  }

  const currentAuthUser = await getAuthUser(currentProfile.auth_user_id);
  const authChanges = {
    user_metadata: {
      ...(currentAuthUser?.user_metadata ?? {}),
      first_name: input.firstName,
      institution: institution?.name ?? null,
      institution_id: institution?.id ?? null,
      last_name: input.lastName,
      login_id: input.loginId,
      role: input.role,
    },
  };

  await authAdminRequest(
    `admin/users/${encodeURIComponent(currentProfile.auth_user_id)}`,
    {
      body: authChanges,
      method: 'PUT',
    }
  );

  const rows = await restRequest('profiles', {
    body: {
      first_name: input.firstName,
      last_name: input.lastName,
      login_id: input.loginId,
      promotion: input.role === 'internal' ? input.promotion : null,
      role: input.role,
      semester: input.role === 'internal' ? input.semester : null,
      updated_by_profile_id: adminIdentity.profile.id,
    },
    headers: {
      Prefer: 'return=representation',
    },
    method: 'PATCH',
    searchParams: {
      id: `eq.${input.profileId}`,
      version: `eq.${input.expectedVersion}`,
    },
  });

  if (!rows?.length) {
    const error = new Error(
      'Ce profil a été modifié par une autre session. Rechargez les données.'
    );
    error.status = 409;
    throw error;
  }

  return rows?.[0] ?? null;
}

async function deactivateAccount(profileId, expectedVersion, adminIdentity) {
  return changeAccountLifecycle({
    adminIdentity,
    expectedVersion,
    profileId,
    targetActive: false,
  });
}

module.exports = async function handler(request, response) {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(request.method)) {
    response.setHeader('Allow', 'POST, PATCH, PUT, DELETE');
    return sendJson(response, 405, { error: 'Méthode non autorisée.' });
  }

  if (!isConfigured()) {
    return sendJson(response, 503, {
      error: 'L’authentification n’est pas configurée sur ce déploiement.',
    });
  }

  let adminIdentity;

  try {
    adminIdentity = await requireAdmin(request);
  } catch (error) {
    console.error('Unable to verify administrator session.', error);
    return sendJson(response, 503, { error: 'Impossible de vérifier la session.' });
  }

  if (!adminIdentity) {
    return sendJson(response, 403, { error: 'Un accès Administrateur est requis.' });
  }

  let body;

  try {
    body = await getRequestBody(request);
  } catch {
    return sendJson(response, 400, { error: 'Corps JSON invalide.' });
  }

  if (request.method === 'PUT') {
    const action = String(body?.action ?? '').trim();
    const expectedVersion = Number(body?.expectedVersion ?? 0);
    const profileId = String(body?.profileId ?? '').trim();

    if (!profileId) {
      return sendJson(response, 400, {
        error: 'L’identifiant du profil est obligatoire.',
      });
    }

    if (!['deactivate', 'reactivate'].includes(action)) {
      return sendJson(response, 400, {
        error: 'L’action de cycle de vie est invalide.',
      });
    }

    try {
      const profile = await changeAccountLifecycle({
        adminIdentity,
        expectedVersion,
        profileId,
        targetActive: action === 'reactivate',
      });

      return sendJson(response, 200, {
        action,
        profile: toPublicProfile(profile),
        success: true,
      });
    } catch (error) {
      console.error('Administrator account lifecycle operation failed.', error);
      return sendJson(response, error.status || 400, {
        error:
          error.message ||
          'Impossible de modifier l’état de ce compte.',
      });
    }
  }

  const input = sanitizeProfileInput(body);

  if (request.method === 'DELETE') {
    if (!input.profileId) {
      return sendJson(response, 400, { error: 'L’identifiant du profil est obligatoire.' });
    }

    try {
      const profile = await deactivateAccount(
        input.profileId,
        input.expectedVersion,
        adminIdentity
      );
      return sendJson(response, 200, {
        profile: toPublicProfile(profile),
        success: true,
      });
    } catch (error) {
      console.error('Administrator account deactivation failed.', error);
      return sendJson(response, error.status || 400, {
        error: error.message || 'Impossible de désactiver ce compte.',
      });
    }
  }

  const validationMessage = validateCommonInput(input);

  if (validationMessage) {
    return sendJson(response, 400, { error: validationMessage });
  }

  if (request.method === 'PATCH' && !input.profileId) {
    return sendJson(response, 400, { error: 'L’identifiant du profil est obligatoire.' });
  }

  try {
    const account =
      request.method === 'POST'
        ? await createAccount(input, adminIdentity)
        : { accessKey: null, profile: await updateAccount(input, adminIdentity) };

    if (!account.profile) {
      return sendJson(response, 502, { error: 'Impossible d’enregistrer le profil.' });
    }

    return sendJson(response, request.method === 'POST' ? 201 : 200, {
      ...(account.accessKey ? { accessKey: account.accessKey } : {}),
      profile: toPublicProfile(account.profile),
    });
  } catch (error) {
    console.error('Administrator account operation failed.', error);
    return sendJson(response, error.status || 400, {
      error: error.message || 'Impossible de gérer ce compte.',
    });
  }
};
