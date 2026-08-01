const {
  SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL,
  serviceHeaders,
} = require('./serverAuth.cjs');

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_PUSH_TOKEN_PATTERN =
  /^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/;
const EXPO_PUSH_TOKEN_REDACTION_PATTERN =
  /(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]/g;
const MAX_NOTIFICATIONS_PER_DISPATCH = 20;
const MAX_DEVICES_PER_NOTIFICATION = 20;

function isPushDeliveryConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function sanitizePushError(value) {
  return String(value || 'Échec de l’envoi de la notification.')
    .replace(EXPO_PUSH_TOKEN_REDACTION_PATTERN, '[jeton masqué]')
    .slice(0, 500);
}

async function parseJsonResponse(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function claimPendingPushNotifications(limit) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/rpc/claim_pending_push_notifications`,
    {
      body: JSON.stringify({
        p_limit: Math.max(
          1,
          Math.min(Number(limit) || MAX_NOTIFICATIONS_PER_DISPATCH, 50)
        ),
      }),
      headers: serviceHeaders({
        Accept: 'application/json',
        'Content-Type': 'application/json',
      }),
      method: 'POST',
    }
  );
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      sanitizePushError(
        payload?.message ||
          payload?.error ||
          'Impossible de réserver les notifications à envoyer.'
      )
    );
  }

  return Array.isArray(payload) ? payload : [];
}

async function updateNotification(notificationId, changes) {
  const searchParams = new URLSearchParams({
    id: `eq.${notificationId}`,
  });
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/user_notifications?${searchParams.toString()}`,
    {
      body: JSON.stringify(changes),
      headers: serviceHeaders({
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      }),
      method: 'PATCH',
    }
  );

  if (!response.ok) {
    throw new Error('Impossible de finaliser la notification push.');
  }
}

async function deactivatePushToken(expoPushToken) {
  const searchParams = new URLSearchParams({
    expo_push_token: `eq.${expoPushToken}`,
  });

  await fetch(
    `${SUPABASE_URL}/rest/v1/push_subscriptions?${searchParams.toString()}`,
    {
      body: JSON.stringify({
        is_active: false,
        updated_at: new Date().toISOString(),
      }),
      headers: serviceHeaders({
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      }),
      method: 'PATCH',
    }
  ).catch(() => undefined);
}

async function sendNotification(notification) {
  const tokens = Array.isArray(notification.expo_push_tokens)
    ? notification.expo_push_tokens
        .filter(
          (token, index, allTokens) =>
            EXPO_PUSH_TOKEN_PATTERN.test(token) &&
            allTokens.indexOf(token) === index
        )
        .slice(0, MAX_DEVICES_PER_NOTIFICATION)
    : [];

  if (tokens.length === 0) {
    await updateNotification(notification.notification_id, {
      push_error: 'Aucun appareil autorisé pour les notifications.',
      push_status: 'unavailable',
    });
    return { failed: 0, sent: 0, unavailable: 1 };
  }

  const response = await fetch(EXPO_PUSH_URL, {
    body: JSON.stringify(
      tokens.map((token) => ({
        body: String(notification.body || '').slice(0, 180),
        channelId: 'trophies',
        data: {
          destination: 'trophies',
          notificationId: notification.notification_id,
        },
        priority: 'high',
        sound: 'default',
        title: String(notification.title || 'Mon Journal de Bloc').slice(0, 80),
        to: token,
      }))
    ),
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
      ...(process.env.EXPO_ACCESS_TOKEN
        ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
        : {}),
    },
    method: 'POST',
  });
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new Error(
      sanitizePushError(
        payload?.errors?.[0]?.message ||
          payload?.message ||
          `Le service Expo a répondu avec le statut ${response.status}.`
      )
    );
  }

  const tickets = Array.isArray(payload?.data)
    ? payload.data
    : payload?.data
      ? [payload.data]
      : [];
  const acceptedTicketIds = [];
  const errors = [];
  const invalidTokens = [];

  tickets.forEach((ticket, index) => {
    if (ticket?.status === 'ok' && typeof ticket.id === 'string') {
      acceptedTicketIds.push(ticket.id);
      return;
    }

    const errorCode = ticket?.details?.error;

    if (errorCode === 'DeviceNotRegistered' && tokens[index]) {
      invalidTokens.push(tokens[index]);
    }

    errors.push(
      sanitizePushError(
        ticket?.message || errorCode || 'Notification refusée par Expo.'
      )
    );
  });

  await Promise.all(invalidTokens.map(deactivatePushToken));

  if (acceptedTicketIds.length === 0) {
    throw new Error(errors.join(' · ') || 'Aucune notification acceptée par Expo.');
  }

  await updateNotification(notification.notification_id, {
    push_error: errors.length > 0 ? errors.join(' · ').slice(0, 500) : null,
    push_status: 'sent',
    push_ticket_ids: acceptedTicketIds,
  });

  return {
    failed: errors.length,
    sent: acceptedTicketIds.length,
    unavailable: 0,
  };
}

async function markNotificationForRetry(notification, error) {
  const attempts = Math.max(1, Number(notification.push_attempts) || 1);
  const exhausted = attempts >= 5;
  const retryDelayMinutes = Math.min(2 ** attempts, 15);

  await updateNotification(notification.notification_id, {
    push_error: sanitizePushError(error?.message || error),
    push_next_attempt_at: new Date(
      Date.now() + retryDelayMinutes * 60 * 1000
    ).toISOString(),
    push_status: exhausted ? 'failed' : 'pending',
  });
}

async function dispatchPendingPushNotifications(options = {}) {
  if (!isPushDeliveryConfigured()) {
    return { claimed: 0, failed: 0, sent: 0, unavailable: 0 };
  }

  const notifications = await claimPendingPushNotifications(options.limit);
  const summary = {
    claimed: notifications.length,
    failed: 0,
    sent: 0,
    unavailable: 0,
  };

  for (const notification of notifications) {
    try {
      const delivery = await sendNotification(notification);
      summary.failed += delivery.failed;
      summary.sent += delivery.sent;
      summary.unavailable += delivery.unavailable;
    } catch (error) {
      summary.failed += 1;
      await markNotificationForRetry(notification, error);
    }
  }

  return summary;
}

async function deactivatePushSubscriptionsForProfile(profileId) {
  if (!isPushDeliveryConfigured() || !profileId) {
    return;
  }

  const searchParams = new URLSearchParams({
    profile_id: `eq.${profileId}`,
  });
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/push_subscriptions?${searchParams.toString()}`,
    {
      body: JSON.stringify({
        is_active: false,
        updated_at: new Date().toISOString(),
      }),
      headers: serviceHeaders({
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      }),
      method: 'PATCH',
    }
  );

  if (!response.ok && response.status !== 404) {
    throw new Error('Impossible de désactiver les notifications de ce profil.');
  }
}

module.exports = {
  deactivatePushSubscriptionsForProfile,
  dispatchPendingPushNotifications,
  isPushDeliveryConfigured,
};
