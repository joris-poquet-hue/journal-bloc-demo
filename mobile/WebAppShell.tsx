import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  type AppStateStatus,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  WebView,
  type WebViewMessageEvent,
  type WebViewNavigation,
} from 'react-native-webview';

const DEFAULT_WEB_APP_URL = 'https://monjournaldebloc.fr';

function normalizeWebAppOrigin(value: string | undefined) {
  const configuredUrl = value?.trim() || DEFAULT_WEB_APP_URL;

  try {
    return new URL(configuredUrl).origin;
  } catch {
    return DEFAULT_WEB_APP_URL;
  }
}

const WEB_APP_ORIGIN = normalizeWebAppOrigin(
  process.env.EXPO_PUBLIC_MONJDB_WEB_URL
);
const MOBILE_APP_URL = `${WEB_APP_ORIGIN}/?native-app=1`;
const WEB_APP_HOSTNAME = new URL(WEB_APP_ORIGIN).hostname.replace(/^www\./, '');
const MOBILE_SESSION_STORAGE_KEY = 'monjdb.mobile-session.v1';
const MOBILE_BIOMETRIC_PREFERENCE_KEY = 'monjdb.mobile-biometric.v1';
const MOBILE_PUSH_DEVICE_ID_KEY = 'monjdb.mobile-push-device-id.v1';
const MOBILE_SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const STANDARD_SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};
const BIOMETRIC_SECURE_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  authenticationPrompt: 'Authentifie-toi pour ouvrir Mon Journal de Bloc.',
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  requireAuthentication: true,
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: false,
    shouldShowList: false,
  }),
});

function isNotificationPermissionGranted(
  permission: Notifications.NotificationPermissionsStatus
) {
  if (permission.granted) {
    return true;
  }

  const iosStatus = permission.ios?.status;

  return (
    iosStatus === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL
  );
}

async function getOrCreatePushDeviceId() {
  const storedDeviceId = await SecureStore.getItemAsync(
    MOBILE_PUSH_DEVICE_ID_KEY,
    STANDARD_SECURE_STORE_OPTIONS
  );

  if (storedDeviceId) {
    return storedDeviceId;
  }

  const deviceId = Crypto.randomUUID().replaceAll('-', '');
  await SecureStore.setItemAsync(
    MOBILE_PUSH_DEVICE_ID_KEY,
    deviceId,
    STANDARD_SECURE_STORE_OPTIONS
  );

  return deviceId;
}

async function registerPushNotifications(sessionToken: string) {
  if (
    !['ios', 'android'].includes(Platform.OS) ||
    !MOBILE_SESSION_TOKEN_PATTERN.test(sessionToken)
  ) {
    return;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('trophies', {
      importance: Notifications.AndroidImportance.HIGH,
      lightColor: '#00A9C7',
      name: 'Trophées',
      vibrationPattern: [0, 200, 120, 200],
    });
  }

  let permission = await Notifications.getPermissionsAsync();

  if (
    !isNotificationPermissionGranted(permission) &&
    permission.status === 'undetermined'
  ) {
    permission = await Notifications.requestPermissionsAsync();
  }

  if (!isNotificationPermissionGranted(permission)) {
    return;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  if (!projectId) {
    throw new Error('Identifiant EAS introuvable.');
  }

  const [expoPushToken, deviceId] = await Promise.all([
    Notifications.getExpoPushTokenAsync({ projectId }),
    getOrCreatePushDeviceId(),
  ]);
  const response = await fetch(`${WEB_APP_ORIGIN}/api/push-subscription`, {
    body: JSON.stringify({
      deviceId,
      expoPushToken: expoPushToken.data,
      platform: Platform.OS,
    }),
    headers: {
      Authorization: `Session ${sessionToken}`,
      'Content-Type': 'application/json',
      'X-Monjdb-Native-App': '1',
    },
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Impossible d’enregistrer les notifications de cet appareil.');
  }
}

const NATIVE_CONTEXT_SCRIPT = `
  (() => {
    window.__MONJDB_NATIVE_APP__ = true;
    window.__MONJDB_NATIVE_PLATFORM__ = ${JSON.stringify(Platform.OS)};

    if (document.documentElement) {
      document.documentElement.lang = 'fr-FR';
    }

    const nativeStyle = document.createElement('style');
    nativeStyle.id = 'monjdb-native-overrides';
    nativeStyle.textContent = [
      '.login-page .login-brand__copy { width: 100%; }',
      '.login-page .login-brand__title { font-size: clamp(0.75rem, 3.5vw, 0.94rem) !important; letter-spacing: -0.025em; white-space: nowrap; }',
      '.login-page .login-brand__subtitle { font-size: clamp(0.63rem, 3.1vw, 0.86rem) !important; letter-spacing: -0.025em; white-space: nowrap; }',
      '.dashboard-home-header { display: none !important; }',
      '.dashboard-screen .dashboard-card__header { align-items: center !important; flex-wrap: nowrap; }',
      '.dashboard-screen .dashboard-card__header h2 { flex: 1 1 auto; min-width: 0; white-space: nowrap; }',
      '.dashboard-screen .dashboard-card__link { flex: 0 0 auto; flex-wrap: nowrap !important; max-width: none !important; white-space: nowrap !important; word-break: keep-all; }',
      '.dashboard-screen .monjdb-native-history-header { align-items: flex-start !important; gap: 6px !important; }',
      '.dashboard-screen .monjdb-native-history-header h2 { font-size: 1.02rem !important; letter-spacing: normal; white-space: normal !important; }',
      '.dashboard-screen .monjdb-native-history-link { gap: 4px !important; font-size: 0.875rem !important; }',
      '.dashboard-screen .dashboard-empty { width: 100%; text-align: center !important; }',
      '.bottom-nav { min-height: 64px !important; align-items: center !important; padding: 6px 9px !important; border-radius: 26px !important; }',
      '.bottom-nav__item { gap: 0 !important; }',
      '.bottom-nav__item { min-height: 48px !important; padding: 6px 2px !important; }',
      '.bottom-nav__add { min-height: 52px !important; height: 52px !important; justify-content: center !important; padding: 0 2px !important; }',
      '.bottom-nav__add-circle { width: 52px !important; height: 52px !important; border-width: 3px !important; transform: translateY(-8px) !important; }',
      '.app-shell--with-bottom-nav .screen-shell { padding-bottom: calc(108px + env(safe-area-inset-bottom)) !important; }',
      '.bottom-nav__item > span, .bottom-nav__add-label { position: absolute !important; width: 1px !important; height: 1px !important; padding: 0 !important; margin: -1px !important; overflow: hidden !important; clip: rect(0, 0, 0, 0) !important; white-space: nowrap !important; border: 0 !important; }',
      'body:has(.trophy-screen) .bottom-nav .bottom-nav__item:first-of-type { color: #0b5360 !important; background: linear-gradient(180deg, rgba(220, 240, 241, 0.85) 0%, rgba(232, 242, 243, 0.76) 100%) !important; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.75) !important; }',
      'body:has(.trophy-screen) .bottom-nav .bottom-nav__item:nth-of-type(2) { color: #60708a !important; background: transparent !important; box-shadow: none !important; }',
      '.history-calendar__day { -webkit-appearance: none; -webkit-tap-highlight-color: transparent; }',
      '.history-calendar__day--selected, .history-calendar__day--selected:hover, .history-calendar__day--selected:focus, .history-calendar__day--selected:focus-visible, .history-calendar__day--selected:active { background: linear-gradient(180deg, #0f6e7c 0%, #0b5360 100%) !important; color: #ffffff !important; -webkit-text-fill-color: #ffffff !important; }',
      '.history-day-card .monjdb-native-empty-day { width: 100%; text-align: center !important; }',
      '.monjdb-native-empty-progress { width: 100%; text-align: center !important; }',
      '.monjdb-native-history-detail-screen .monjdb-native-history-score-section .history-score-card { grid-template-columns: 108px minmax(0, 1fr) !important; align-items: center !important; gap: 16px !important; }',
      '.monjdb-native-history-detail-screen .monjdb-native-history-score-section .history-score-gauge { width: 108px !important; justify-self: start !important; }',
      '.monjdb-native-history-detail-screen .monjdb-native-history-score-section .history-score-card__copy { min-width: 0; }',
      '.history-senior-evaluation__row { grid-template-columns: minmax(0, 1fr) !important; align-items: start !important; justify-items: start !important; gap: 8px !important; padding-block: 10px !important; }',
      '.history-senior-evaluation__row > strong { max-width: 100%; justify-self: start !important; white-space: normal; }',
      '.monjdb-native-history-detail-screen .monjdb-native-history-original-back { display: none !important; }',
      '.monjdb-native-history-detail-screen .monjdb-native-history-back-button { align-self: flex-start; min-height: 42px; display: inline-flex; align-items: center; gap: 5px; padding: 0 12px; border: 1px solid rgba(216, 231, 239, 0.84) !important; border-radius: 14px; background: rgba(255, 255, 255, 0.84) !important; color: #0b5360 !important; font-size: 0.96rem; font-weight: 800; box-shadow: 0 10px 20px rgba(7, 26, 61, 0.05); }',
      '.monjdb-native-history-detail-screen .monjdb-native-history-back-button svg { width: 25px; height: 25px; }',
      '.monjdb-native-history-detail-screen .history-detail-card { order: 1; }',
      '.monjdb-native-history-detail-screen .monjdb-native-history-score-section { order: 2; }',
      '.monjdb-native-history-detail-screen .monjdb-native-history-senior-section { order: 3; }',
      '.monjdb-native-history-detail-screen .monjdb-native-history-self-section { order: 4; }',
      '.monjdb-native-history-detail-screen .history-detail-card__header { grid-template-columns: 66px minmax(0, 1fr) !important; align-items: center !important; gap: 16px !important; padding-bottom: 18px !important; }',
      '.monjdb-native-history-detail-screen .history-detail-card__header .approach-icon { width: 66px !important; height: 66px !important; }',
      '.monjdb-native-history-detail-screen .history-detail-card__summary { min-width: 0; display: flex; flex-direction: column; align-items: flex-start; }',
      '.monjdb-native-history-detail-screen .history-detail-card__date { margin-bottom: 7px; color: #60708a !important; font-size: 0.74rem !important; font-weight: 850 !important; letter-spacing: 0.055em; line-height: 1.2; text-transform: uppercase; }',
      '.monjdb-native-history-detail-screen .history-detail-card__header h2 { margin: 0 0 6px !important; color: #071a3d; font-size: 1.18rem !important; font-weight: 900 !important; line-height: 1.18; }',
      '.monjdb-native-history-detail-screen .history-detail-card__senior { color: #475a78 !important; font-size: 0.9rem !important; font-weight: 650 !important; }',
      '.monjdb-native-history-detail-screen .monjdb-native-hidden-history-detail-copy, .monjdb-native-history-detail-screen .monjdb-native-hidden-history-detail-status, .monjdb-native-history-detail-screen .monjdb-native-hidden-history-detail-row { display: none !important; }',
      '.monjdb-native-history-detail-screen .history-detail-grid { gap: 0 !important; padding-top: 6px !important; }',
      '.monjdb-native-history-detail-screen .history-detail-row { grid-template-columns: minmax(96px, 0.72fr) minmax(0, 1.28fr) !important; gap: 14px !important; min-height: 50px; padding: 10px 0; border-bottom: 1px solid rgba(216, 231, 239, 0.72); }',
      '.monjdb-native-history-detail-screen .history-detail-row:last-child { border-bottom: 0; padding-bottom: 4px; }',
      '.monjdb-native-history-detail-screen .history-detail-row > span { color: #60708a; font-weight: 750; }',
      '.monjdb-native-history-detail-screen .history-detail-row > strong { color: #071a3d; font-weight: 850; text-align: right; }',
      '.monjdb-native-hidden-difficulty-info { display: none !important; }',
      '.monjdb-native-hidden-approach-label { display: none !important; }',
      '.approach-icon { background: #e2f7fb !important; }',
      '.dashboard-trophy-strip.monjdb-native-single-trophy { justify-content: center; }',
      '.dashboard-screen .dashboard-trophy-strip { align-items: stretch !important; }',
      '.dashboard-screen .dashboard-trophy-strip > [role="listitem"] { align-self: stretch; height: 100%; }',
      '.dashboard-screen .dashboard-trophy-strip .internal-trophy-card { height: 100%; box-sizing: border-box; }',
      '.dashboard-screen .dashboard-trophy-strip .internal-trophy-card__copy strong, .trophy-screen .trophy-card-grid .internal-trophy-card__copy strong { min-height: 2.36em; display: flex; align-items: flex-start; justify-content: center; }',
      '.dashboard-screen .internal-trophy-card__image, .trophy-screen .internal-trophy-card__image { transform: scale(var(--monjdb-native-trophy-image-scale, 1)); transform-origin: center; }',
      '.monjdb-native-service-line { display: block; white-space: nowrap; font-size: 0.9rem; letter-spacing: -0.02em; }',
      '.monjdb-native-institution-line { display: block; margin-top: 2px; font-size: 0.9rem; }',
      '.monjdb-native-settings-message { margin: 0; color: #0b6b79; font-size: 0.88rem; font-weight: 750; line-height: 1.45; }',
      '.monjdb-native-settings-message--error { color: #c2414b; }',
      '.monjdb-native-settings-loading { padding: 28px 8px; color: #60708a; text-align: center; }',
      '.senior-screen:not(.senior-evaluation-screen) .screen-hero__row { position: relative; min-height: 136px; padding: 24px 22px !important; overflow: visible; background: radial-gradient(circle at top right, rgba(236, 173, 142, 0.18) 0, transparent 34%), linear-gradient(180deg, #fffefb 0%, #fbf6ef 100%) !important; }',
      '.senior-screen:not(.senior-evaluation-screen) .screen-hero__row::after { content: ""; position: absolute; right: 0; bottom: 0; width: 96px; height: 96px; border-radius: 50%; background: radial-gradient(circle, rgba(12, 91, 104, 0.11) 0%, rgba(12, 91, 104, 0) 74%); pointer-events: none; }',
      '.senior-screen:not(.senior-evaluation-screen) .screen-hero__copy { position: relative; z-index: 1; align-items: flex-start; gap: 7px !important; }',
      '.senior-screen:not(.senior-evaluation-screen) .monjdb-native-senior-eyebrow { color: #0b6b79; font-size: 0.82rem; font-weight: 800; line-height: 1.2; letter-spacing: 0.02em; }',
      '.senior-screen:not(.senior-evaluation-screen) .screen-hero__title { color: #071a3d; font-size: clamp(1.78rem, 7.2vw, 2.3rem) !important; line-height: 1.04 !important; font-weight: 850 !important; letter-spacing: 0; }',
      '.senior-screen:not(.senior-evaluation-screen) .screen-hero__subtitle { margin: 0; line-height: 1.32 !important; }',
      '.senior-screen:not(.senior-evaluation-screen) .monjdb-native-service-line { color: #082c34; font-size: 0.98rem; font-weight: 780; }',
      '.senior-screen:not(.senior-evaluation-screen) .monjdb-native-institution-line { color: #7b8e9c; font-size: 0.88rem; font-weight: 600; }',
      '.senior-screen:not(.senior-evaluation-screen) .screen-hero__action { position: relative; z-index: 2; }',
      '.senior-screen .monjdb-native-hidden-progress-panels { display: none !important; }',
      '.senior-screen .monjdb-native-hidden-empty-selection { display: none !important; }',
      '.senior-screen .monjdb-native-hidden-empty-stat-title { display: none !important; }',
      '.senior-screen .monjdb-native-hidden-pending-title { display: none !important; }',
      '.senior-screen .monjdb-native-hidden-empty-internal-title { display: none !important; }',
      '.senior-screen .senior-section-card:has(.monjdb-native-empty-internal-message) .section-card__content { gap: 10px !important; }',
      '.senior-screen .senior-section-card:has(.monjdb-native-empty-internal-message) .senior-internal-strip { display: none !important; min-height: 0 !important; padding: 0 !important; }',
      '.senior-screen .monjdb-native-hidden-footer-actions { display: none !important; }',
      '.senior-evaluation-screen .senior-evaluation-screen__back-button, .senior-evaluation-screen .senior-evaluation-actions__secondary { display: none !important; }',
      '.senior-evaluation-screen .senior-rating-description { text-align: justify !important; text-align-last: left; hyphens: auto; }',
      '.senior-screen .validation-box > span, .senior-screen .validation-box > p { text-align: justify !important; text-align-last: left; hyphens: auto; }',
      '.senior-screen .section-card__header:has(.monjdb-native-refresh-button) { position: relative; align-items: center; }',
      '.senior-screen .section-card__header:has(.monjdb-native-refresh-button) .section-card__header-main { padding-right: 36px; }',
      '.senior-screen .section-card__header:has(.monjdb-native-refresh-button) .section-card__header-action { position: absolute; top: 50%; right: 0; transform: translateY(-50%); }',
      '.senior-screen .monjdb-native-refresh-button { position: relative; width: 28px; height: 28px; min-height: 28px; display: inline-flex; align-items: center; justify-content: center; padding: 0; border: 1px solid rgba(0, 169, 199, 0.24); border-radius: 50%; background: rgba(0, 169, 199, 0.08); color: #0b6b79; line-height: 1; }',
      '.senior-screen .monjdb-native-refresh-button::before { content: ""; position: absolute; inset: -8px; }',
      '.senior-screen .monjdb-native-refresh-button svg { width: 14px; height: 14px; }',
      '.senior-screen .monjdb-native-refresh-button:disabled { opacity: 0.58; }',
      '.senior-screen .monjdb-native-refresh-button--loading svg { animation: monjdb-native-spin 700ms linear infinite; }',
      '@keyframes monjdb-native-spin { to { transform: rotate(360deg); } }',
      '.senior-screen .admin-profile-stats-tabs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); width: 100%; box-sizing: border-box; gap: 4px; }',
      '.senior-screen .admin-profile-stats-tab { width: 100%; min-width: 0; box-sizing: border-box; padding-inline: 10px; }',
      '.senior-screen .admin-profile-step-row { display: grid; grid-template-columns: minmax(0, 1fr) 44px !important; grid-template-areas: "label ." "bar value"; align-items: center; column-gap: 10px; row-gap: 8px; }',
      '.senior-screen .admin-profile-step-row > span { grid-area: label; width: 100%; min-width: 0; max-width: 100%; white-space: normal; font-size: 0.9rem; line-height: 1.3; overflow-wrap: anywhere; word-break: break-word; hyphens: auto; }',
      '.senior-screen .admin-profile-step-row__bar { grid-area: bar; width: 100%; }',
      '.senior-screen .admin-profile-step-row > strong { grid-area: value; justify-self: end; text-align: right; white-space: nowrap; }',
      '.senior-screen .admin-profile-history-card__status--pending { display: flex; width: 100%; box-sizing: border-box; justify-content: center; text-align: center; }',
      '.senior-screen .admin-profile-history-card__step { align-items: center; }',
      '.senior-screen .monjdb-native-history-level { width: 38px; min-width: 38px; height: 38px; display: inline-grid; place-items: center; padding: 0; border-radius: 50%; color: #ffffff; font-size: 0.92rem; font-weight: 900; line-height: 1; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.24), 0 8px 14px rgba(7, 26, 61, 0.1); }',
      '.senior-screen .monjdb-native-history-level--na, .senior-screen .monjdb-native-history-level--empty { background: #e6edf4; color: #597086; }',
      '.senior-screen .monjdb-native-history-level--level-0 { background: linear-gradient(180deg, #ef4444, #dc2626); }',
      '.senior-screen .monjdb-native-history-level--level-1 { background: linear-gradient(180deg, #f97316, #ea580c); }',
      '.senior-screen .monjdb-native-history-level--level-2 { background: linear-gradient(180deg, #f59e0b, #d97706); }',
      '.senior-screen .monjdb-native-history-level--level-3 { background: linear-gradient(180deg, #a3c614, #65a30d); }',
      '.senior-screen .monjdb-native-history-level--level-4 { background: linear-gradient(180deg, #22c55e, #15803d); }',
      '.trophy-screen .trophy-summary-card__item { gap: 8px; }',
      '.trophy-screen .trophy-card-grid { width: 100%; display: flex !important; align-items: stretch; justify-content: flex-start !important; gap: 12px; padding: 2px 2px 10px; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x proximity; overscroll-behavior-x: contain; scrollbar-color: rgba(80, 100, 132, 0.5) rgba(216, 229, 237, 0.62); scrollbar-width: thin; -webkit-overflow-scrolling: touch; }',
      '.trophy-screen .trophy-card-grid::-webkit-scrollbar { height: 4px; }',
      '.trophy-screen .trophy-card-grid::-webkit-scrollbar-track { border-radius: 999px; background: rgba(216, 229, 237, 0.62); }',
      '.trophy-screen .trophy-card-grid::-webkit-scrollbar-thumb { border-radius: 999px; background: rgba(80, 100, 132, 0.5); }',
      '.trophy-screen .trophy-card-grid > .internal-trophy-card { flex: 0 0 min(43vw, 172px); width: min(43vw, 172px); height: 232px !important; min-height: 232px; max-height: 232px; align-self: stretch; scroll-snap-align: start; }',
      '.trophy-section-sheet .trophy-section-sheet__grid { gap: 10px; }',
      '.trophy-screen .internal-trophy-card { max-width: 172px; box-sizing: border-box; gap: 10px; padding: 12px; border-radius: 20px; }',
      '.trophy-screen .internal-trophy-card__visual { padding: 10px; border-radius: 17px; }',
      '.trophy-screen .internal-trophy-card__image { width: min(100%, 104px); height: 104px; object-fit: contain; }',
      '.trophy-screen .internal-trophy-card__mystery { width: 72px; height: 72px; border-radius: 20px; font-size: 2rem; }',
      '.trophy-screen .internal-trophy-card__copy { gap: 6px; }',
      '.trophy-screen .internal-trophy-card__copy strong { font-size: 0.92rem; line-height: 1.2; }',
      '.trophy-screen .internal-trophy-card__progress { width: 100%; height: 5px; }',
      '.trophy-detail-dialog__progress { width: min(100%, 230px); height: 7px; margin: 2px 0 0; }',
      '.trophy-detail-backdrop[data-monjdb-native-detail-source="true"] { visibility: hidden !important; pointer-events: none !important; }',
      '.monjdb-native-portal-detail-backdrop { position: fixed !important; inset: 0 !important; z-index: 120 !important; width: 100vw !important; height: 100dvh !important; min-height: 100vh; display: grid !important; place-items: center !important; box-sizing: border-box !important; padding: max(16px, env(safe-area-inset-top)) 16px max(16px, env(safe-area-inset-bottom)) !important; overflow: auto !important; background: rgba(7, 26, 61, 0.32) !important; backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); }',
      '.monjdb-native-portal-detail-backdrop .trophy-detail-dialog { width: min(100%, 440px) !important; max-width: 440px !important; max-height: calc(100dvh - max(32px, env(safe-area-inset-top)) - max(32px, env(safe-area-inset-bottom))) !important; box-sizing: border-box !important; margin: auto !important; flex: none !important; }',
      '.monjdb-native-next-tier-dialog .trophy-detail-dialog__copy { width: 100%; }',
      '.monjdb-native-next-tier-dialog .trophy-detail-dialog__copy p { text-align: center; }',
      '.trophy-detail-dialog__visual .internal-trophy-card__mystery { width: 92px; height: 92px; border-radius: 24px; font-size: 2.5rem; }',
      '.trophy-screen .trophy-section__header h2 { min-width: 0; }',
      '.trophy-screen .monjdb-native-trophy-progress-title { line-height: 1.08; }',
      '.trophy-screen .monjdb-native-trophy-progress-title__line { display: block; white-space: nowrap; }',
      '.trophy-screen .trophy-section__link { flex: 0 0 auto; color: #00a9c7; white-space: nowrap; }',
      '.trophy-screen .monjdb-native-hidden-progress-show-all { display: none !important; }',
      '.trophy-section-sheet { position: relative; width: min(calc(100vw - 20px), 460px); max-height: min(calc(100dvh - 48px), 760px); gap: 0; padding: 52px 12px 14px; overflow: hidden; border: 1px solid rgba(206, 190, 155, 0.52); border-radius: 28px; background: radial-gradient(circle at 16% 8%, rgba(255, 255, 255, 0.96) 0%, transparent 28%), repeating-linear-gradient(0deg, rgba(126, 97, 52, 0.025) 0, rgba(126, 97, 52, 0.025) 1px, transparent 1px, transparent 24px), linear-gradient(180deg, #fffdf7 0%, #f8f1e3 100%); box-shadow: 0 30px 64px rgba(7, 26, 61, 0.24), inset 10px 0 18px rgba(117, 84, 39, 0.035); }',
      '.trophy-section-sheet .account-sheet__header { position: absolute; top: 10px; right: 10px; z-index: 4; display: block; }',
      '.trophy-section-sheet .account-sheet__heading { display: none !important; }',
      '.trophy-section-sheet .account-sheet__close { width: 36px; height: 36px; border-radius: 12px; background: rgba(255, 253, 247, 0.94); box-shadow: 0 8px 18px rgba(74, 55, 29, 0.12); }',
      '.trophy-section-sheet .account-sheet__close svg { width: 18px; height: 18px; }',
      '.trophy-section-sheet .trophy-section-sheet__grid { height: min(calc(100dvh - 128px), 590px); display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)) !important; grid-template-rows: repeat(5, minmax(0, 1fr)); grid-auto-rows: minmax(104px, 1fr); gap: 8px; padding: 2px; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: none; }',
      '.trophy-section-sheet .trophy-section-sheet__grid::-webkit-scrollbar { display: none; }',
      '.trophy-section-sheet .internal-trophy-card { width: 100%; height: 100%; min-height: 0; max-width: none; display: grid; grid-template-rows: minmax(0, 1fr) auto; align-items: stretch; gap: 4px; margin: 0; padding: 6px; border-radius: 15px; box-shadow: 0 7px 14px rgba(58, 45, 28, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.92); }',
      '.trophy-section-sheet .internal-trophy-card__visual { width: 100%; min-height: 0; aspect-ratio: auto; padding: 3px; border-radius: 11px; }',
      '.trophy-section-sheet .internal-trophy-card__image { width: min(100%, 54px); max-height: 54px; }',
      '.trophy-section-sheet .internal-trophy-card__mystery { width: 46px; height: 46px; border-radius: 13px; font-size: 1.55rem; }',
      '.trophy-section-sheet .internal-trophy-card__copy { min-height: 25px; gap: 3px; justify-content: flex-start; }',
      '.trophy-section-sheet .internal-trophy-card__copy strong { display: -webkit-box; overflow: hidden; color: #31405f; font-size: 0.62rem; line-height: 1.08; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }',
      '.trophy-section-sheet .internal-trophy-card__progress { width: 100%; height: 3px; margin: 0; }',
      '.trophy-section-sheet .monjdb-native-collection-slot { min-width: 0; min-height: 0; border: 1px dashed rgba(132, 104, 62, 0.2); border-radius: 15px; background: linear-gradient(180deg, rgba(255, 255, 255, 0.28), rgba(221, 204, 172, 0.11)); box-shadow: inset 0 1px 6px rgba(90, 65, 30, 0.045); pointer-events: none; }',
      '.trophy-section-sheet.monjdb-native-earned-collection .internal-trophy-card { grid-template-rows: minmax(0, 1fr); border-style: dashed; border-color: rgba(132, 104, 62, 0.2); background: linear-gradient(180deg, rgba(255, 255, 255, 0.5), rgba(221, 204, 172, 0.08)); box-shadow: inset 0 1px 6px rgba(90, 65, 30, 0.045); }',
      '.trophy-section-sheet.monjdb-native-earned-collection .internal-trophy-card__copy { display: none !important; }',
      '.trophy-section-sheet.monjdb-native-earned-collection .internal-trophy-card__visual { background: transparent; box-shadow: none; }',
      '.trophy-section-sheet.monjdb-native-earned-collection .internal-trophy-card__image { width: min(100%, 62px); max-height: 62px; }',
      '.monjdb-native-photo-crop-form .account-photo-cropper__viewport { width: 220px !important; height: 220px !important; box-sizing: content-box !important; position: relative; touch-action: none; cursor: grab; user-select: none; -webkit-user-select: none; overscroll-behavior: contain; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.92), 0 14px 30px rgba(7, 26, 61, 0.1); }',
      '.monjdb-native-photo-crop-form .account-photo-cropper__viewport:active { cursor: grabbing; }',
      '.monjdb-native-photo-crop-form .account-photo-cropper__image { pointer-events: none; -webkit-user-drag: none; }',
      '.monjdb-native-photo-crop-form .monjdb-native-photo-crop-control { display: none !important; }',
      '.monjdb-native-photo-crop-form .account-photo-cropper__meta span { max-width: 260px; color: #0b6b79; font-weight: 760; }',
      '.monjdb-native-photo-crop-form .account-sheet__actions--split { display: flex !important; flex-direction: column !important; grid-template-columns: none !important; }',
      '.monjdb-native-photo-crop-form .account-sheet__actions--split .flow-button { width: 100%; }',
      '.monjdb-native-photo-crop-form .account-sheet__actions--split .flow-button--primary { order: 1; }',
      '.monjdb-native-photo-crop-form .account-sheet__actions--split .flow-button--secondary { order: 2; }',
      '.account-profile-card { grid-template-columns: minmax(0, 1fr) 82px !important; align-items: center !important; gap: 14px !important; }',
      '.account-profile-card__copy { grid-column: 1; grid-row: 1; }',
      '.account-profile-card h2 { font-size: clamp(1.55rem, 7vw, 1.95rem) !important; }',
      '.account-profile-card__badge { grid-column: 2; grid-row: 1; width: 82px !important; height: 82px !important; align-self: center !important; justify-self: end !important; }',
    ].join(' ');
    (document.head || document.documentElement).appendChild(nativeStyle);

  })();
  true;
`;
function canLoadInsideApp(url: string) {
  if (url === 'about:blank') {
    return true;
  }

  try {
    const target = new URL(url);
    const targetHostname = target.hostname.replace(/^www\./, '');

    return target.protocol === 'https:' && targetHostname === WEB_APP_HOSTNAME;
  } catch {
    return false;
  }
}

export default function WebAppShell() {
  const [reloadKey, setReloadKey] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSessionReady, setIsSessionReady] = useState(false);
  const [restoredSessionToken, setRestoredSessionToken] = useState<string | null>(
    null
  );
  const webViewRef = useRef<WebView>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState ?? 'active');
  const pushRegistrationSessionRef = useRef<string | null>(null);
  const source = useMemo(
    () =>
      restoredSessionToken
        ? {
            headers: {
              Authorization: `Session ${restoredSessionToken}`,
              'X-Monjdb-Native-App': '1',
            },
            uri: `${WEB_APP_ORIGIN}/api/auth-mobile-bootstrap`,
          }
        : {
            headers: {
              'X-Monjdb-Native-App': '1',
            },
            uri: MOBILE_APP_URL,
          },
    [restoredSessionToken]
  );

  useEffect(() => {
    let isCancelled = false;

    const restoreMobileSession = async () => {
      try {
        const biometricPreference = await SecureStore.getItemAsync(
          MOBILE_BIOMETRIC_PREFERENCE_KEY
        );
        const token = await SecureStore.getItemAsync(
          MOBILE_SESSION_STORAGE_KEY,
          biometricPreference === 'enabled'
            ? BIOMETRIC_SECURE_STORE_OPTIONS
            : STANDARD_SECURE_STORE_OPTIONS
        );

        if (!isCancelled) {
          setRestoredSessionToken(
            token && MOBILE_SESSION_TOKEN_PATTERN.test(token) ? token : null
          );
        }
      } catch {
        if (!isCancelled) {
          setRestoredSessionToken(null);
        }
      } finally {
        if (!isCancelled) {
          setIsSessionReady(true);
        }
      }
    };

    void restoreMobileSession();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      !restoredSessionToken ||
      pushRegistrationSessionRef.current === restoredSessionToken
    ) {
      return;
    }

    pushRegistrationSessionRef.current = restoredSessionToken;
    void registerPushNotifications(restoredSessionToken).catch(() => {
      pushRegistrationSessionRef.current = null;
    });
  }, [restoredSessionToken]);

  useEffect(() => {
    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener(() => {
        webViewRef.current?.injectJavaScript(`
          window.dispatchEvent(new Event('monjdb:app-foreground'));
          true;
        `);
      });

    return () => responseSubscription.remove();
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (
        (previousState === 'inactive' || previousState === 'background') &&
        nextState === 'active'
      ) {
        webViewRef.current?.injectJavaScript(`
          window.dispatchEvent(new Event('monjdb:app-foreground'));
          true;
        `);
      }
    });

    return () => subscription.remove();
  }, []);

  function handleNavigationRequest(request: WebViewNavigation) {
    if (canLoadInsideApp(request.url)) {
      return true;
    }

    if (/^(https?:|mailto:|tel:)/i.test(request.url)) {
      void Linking.openURL(request.url);
    }

    return false;
  }

  function retry() {
    setLoadError(null);
    setReloadKey((current) => current + 1);
  }

  async function clearStoredMobileSession() {
    await Promise.all([
      SecureStore.deleteItemAsync(MOBILE_SESSION_STORAGE_KEY),
      SecureStore.deleteItemAsync(MOBILE_BIOMETRIC_PREFERENCE_KEY),
    ]).catch(() => undefined);
    setRestoredSessionToken(null);
  }

  function askToEnableBiometrics() {
    return new Promise<boolean>((resolve) => {
      Alert.alert(
        'Connexion biométrique',
        'Souhaites-tu utiliser Face ID, Touch ID ou la biométrie Android sur cet appareil ?',
        [
          {
            onPress: () => resolve(false),
            style: 'cancel',
            text: 'Plus tard',
          },
          {
            onPress: () => resolve(true),
            text: 'Activer',
          },
        ],
        {
          cancelable: false,
        }
      );
    });
  }

  async function storeMobileSession(token: string) {
    await SecureStore.setItemAsync(
      MOBILE_SESSION_STORAGE_KEY,
      token,
      STANDARD_SECURE_STORE_OPTIONS
    );

    const currentPreference = await SecureStore.getItemAsync(
      MOBILE_BIOMETRIC_PREFERENCE_KEY
    );

    if (currentPreference === 'enabled') {
      await SecureStore.setItemAsync(
        MOBILE_SESSION_STORAGE_KEY,
        token,
        BIOMETRIC_SECURE_STORE_OPTIONS
      );
      return;
    }

    const [hasHardware, isEnrolled] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
    ]);

    if (!hasHardware || !isEnrolled || !(await askToEnableBiometrics())) {
      await SecureStore.setItemAsync(
        MOBILE_BIOMETRIC_PREFERENCE_KEY,
        'disabled',
        STANDARD_SECURE_STORE_OPTIONS
      );
      return;
    }

    const authentication = await LocalAuthentication.authenticateAsync({
      biometricsSecurityLevel: 'strong',
      disableDeviceFallback: true,
      fallbackLabel: '',
      promptMessage: 'Active la connexion biométrique',
    });

    if (!authentication.success) {
      return;
    }

    await SecureStore.setItemAsync(
      MOBILE_SESSION_STORAGE_KEY,
      token,
      BIOMETRIC_SECURE_STORE_OPTIONS
    );
    await SecureStore.setItemAsync(
      MOBILE_BIOMETRIC_PREFERENCE_KEY,
      'enabled',
      STANDARD_SECURE_STORE_OPTIONS
    );
  }

  function handleWebMessage(event: WebViewMessageEvent) {
    try {
      const message = JSON.parse(event.nativeEvent.data) as {
        token?: string;
        type?: string;
      };

      if (
        message.type === 'MONJDB_SESSION_CREATED' &&
        message.token &&
        MOBILE_SESSION_TOKEN_PATTERN.test(message.token)
      ) {
        void storeMobileSession(message.token).catch(() => undefined);
        pushRegistrationSessionRef.current = message.token;
        void registerPushNotifications(message.token).catch(() => {
          pushRegistrationSessionRef.current = null;
        });
        return;
      }

      if (message.type === 'MONJDB_SESSION_REVOKED') {
        pushRegistrationSessionRef.current = null;
        void clearStoredMobileSession();
      }
    } catch {
      // Ignore messages that are not part of the restricted native session bridge.
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      {isSessionReady ? (
        <WebView
          key={reloadKey}
          ref={webViewRef}
          allowsBackForwardNavigationGestures
          allowsInlineMediaPlayback
          applicationNameForUserAgent="MonJournalDeBlocMobile/1.0"
          cacheEnabled={false}
          domStorageEnabled
          incognito
          injectedJavaScriptBeforeContentLoaded={NATIVE_CONTEXT_SCRIPT}
          javaScriptEnabled
          onContentProcessDidTerminate={retry}
          onError={() =>
            setLoadError(
              "L'application ne parvient pas à joindre Mon Journal de Bloc."
            )
          }
          onHttpError={(event) => {
            if (
              event.nativeEvent.statusCode === 401 &&
              event.nativeEvent.url.includes('/api/auth-mobile-bootstrap')
            ) {
              void clearStoredMobileSession().then(() => {
                setLoadError(null);
                setReloadKey((current) => current + 1);
              });
              return;
            }

            setLoadError(
              `Le service est momentanément indisponible (${event.nativeEvent.statusCode}).`
            );
          }}
          onMessage={handleWebMessage}
          onShouldStartLoadWithRequest={handleNavigationRequest}
          pullToRefreshEnabled
          renderLoading={() => (
            <View style={styles.loadingState}>
              <ActivityIndicator color="#08AFC5" size="large" />
              <Text style={styles.loadingText}>
                Chargement de Mon Journal de Bloc…
              </Text>
            </View>
          )}
          setSupportMultipleWindows={false}
          sharedCookiesEnabled={false}
          source={source}
          startInLoadingState
          style={styles.webView}
          thirdPartyCookiesEnabled={false}
        />
      ) : (
        <View style={styles.loadingState}>
          <ActivityIndicator color="#08AFC5" size="large" />
          <Text style={styles.loadingText}>Ouverture sécurisée…</Text>
        </View>
      )}

      {loadError ? (
        <View style={styles.errorState}>
          <Text style={styles.errorTitle}>Connexion impossible</Text>
          <Text style={styles.errorText}>{loadError}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={retry}
            style={styles.retryButton}
          >
            <Text style={styles.retryButtonText}>Réessayer</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#EFF9FC',
    flex: 1,
  },
  errorState: {
    alignItems: 'center',
    backgroundColor: '#EFF9FC',
    bottom: 0,
    gap: 14,
    justifyContent: 'center',
    left: 0,
    paddingHorizontal: 32,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  errorText: {
    color: '#50647A',
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
  },
  errorTitle: {
    color: '#08224A',
    fontSize: 24,
    fontWeight: '800',
  },
  loadingState: {
    alignItems: 'center',
    backgroundColor: '#EFF9FC',
    flex: 1,
    gap: 16,
    justifyContent: 'center',
  },
  loadingText: {
    color: '#50647A',
    fontSize: 16,
    fontWeight: '600',
  },
  retryButton: {
    backgroundColor: '#08224A',
    borderRadius: 18,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  webView: {
    backgroundColor: '#EFF9FC',
    flex: 1,
  },
});
