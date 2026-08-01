import assert from 'node:assert/strict';
import {
  generateKeyPairSync,
  verify,
} from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

function readSource(path) {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

const migration = readSource(
  '../supabase/migrations/202607270004_server_managed_sessions.sql'
);
const enforcementMigration = readSource(
  '../supabase/migrations/202607270005_enforce_server_managed_sessions.sql'
);
const lifecycleMigration = readSource(
  '../supabase/migrations/202608010001_reversible_account_lifecycle.sql'
);
const serverAuth = readSource('../src/serverAuth.cjs');
const webAuth = readSource('../src/services/supabaseClient.ts');
const appContext = readSource('../src/context/AppContext.tsx');
const loginApi = readSource('../api/auth-login.js');
const logoutApi = readSource('../api/auth-logout.js');
const sessionApi = readSource('../api/auth-session.js');
const adminUsersApi = readSource('../api/admin-users.js');
const backendApi = readSource('../api/backend.js');
const mobileBootstrapApi = readSource('../api/auth-mobile-bootstrap.js');
const mobileShell = readSource('../mobile/WebAppShell.tsx');
const mobileEntry = readSource('../mobile/index.ts');
const mobileConfig = readSource('../mobile/app.json');
const mobilePackage = readSource('../mobile/package.json');
const require = createRequire(import.meta.url);

test('le registre serveur conserve uniquement le hash du jeton opaque', () => {
  assert.match(migration, /create table if not exists public\.application_sessions/i);
  assert.match(migration, /token_hash text not null unique/i);
  assert.doesNotMatch(migration, /\brefresh_token\b/i);
  assert.doesNotMatch(migration, /\baccess_token\b/i);
  assert.match(serverAuth, /randomBytes\(32\)\.toString\('base64url'\)/);
  assert.match(serverAuth, /createHash\('sha256'\)/);
  assert.match(
    migration,
    /revoke all on table public\.application_sessions from anon, authenticated/i
  );
});

test('le jeton Data API ES256 est signé avec la clé privée importée et expire en deux minutes', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
  });
  const privateJwk = privateKey.export({ format: 'jwk' });
  privateJwk.kid = 'project1-integration-signing-key';
  const modulePath = require.resolve('../src/serverAuth.cjs');
  const previousSigningJwk = process.env.SUPABASE_SIGNING_PRIVATE_JWK;

  process.env.SUPABASE_SIGNING_PRIVATE_JWK = JSON.stringify(privateJwk);
  delete require.cache[modulePath];

  try {
    const { createSupabaseApplicationJwt } = require(modulePath);
    const token = createSupabaseApplicationJwt({
      profile: {
        auth_user_id: '00000000-0000-4000-8000-000000000001',
      },
      session: {
        session_id: '00000000-0000-4000-8000-000000000002',
      },
    });
    const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');
    const header = JSON.parse(
      Buffer.from(encodedHeader, 'base64url').toString('utf8')
    );
    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8')
    );

    assert.equal(header.alg, 'ES256');
    assert.equal(header.kid, privateJwk.kid);
    assert.equal(payload.role, 'authenticated');
    assert.equal(payload.app_session_id, '00000000-0000-4000-8000-000000000002');
    assert.equal(payload.exp - payload.iat, 120);
    assert.equal(
      verify(
        'sha256',
        Buffer.from(`${encodedHeader}.${encodedPayload}`),
        {
          dsaEncoding: 'ieee-p1363',
          key: publicKey,
        },
        Buffer.from(encodedSignature, 'base64url')
      ),
      true
    );
  } finally {
    delete require.cache[modulePath];

    if (previousSigningJwk === undefined) {
      delete process.env.SUPABASE_SIGNING_PRIVATE_JWK;
    } else {
      process.env.SUPABASE_SIGNING_PRIVATE_JWK = previousSigningJwk;
    }
  }
});

test('le cookie web est non persistant, HttpOnly, Secure et SameSite', () => {
  const setCookieStart = serverAuth.indexOf(
    'function setApplicationSessionCookie'
  );
  const clearCookieStart = serverAuth.indexOf(
    'function clearApplicationSessionCookie'
  );
  const setCookieSource = serverAuth.slice(setCookieStart, clearCookieStart);

  assert.ok(setCookieStart >= 0);
  assert.ok(clearCookieStart > setCookieStart);
  assert.match(
    serverAuth,
    /APPLICATION_SESSION_COOKIE_NAME = '__Host-monjdb_session'/
  );
  assert.match(setCookieSource, /APPLICATION_SESSION_COOKIE_NAME/);
  assert.match(setCookieSource, /'Path=\/'/);
  assert.match(setCookieSource, /'HttpOnly'/);
  assert.match(setCookieSource, /'Secure'/);
  assert.match(setCookieSource, /'SameSite=Lax'/);
  assert.doesNotMatch(setCookieSource, /Max-Age|Expires/i);
  assert.match(loginApi, /setApplicationSessionCookie/);
  assert.doesNotMatch(loginApi, /refresh_token/);
});

test('la session web expire côté serveur après trente minutes d’inactivité', () => {
  assert.match(serverAuth, /const WEB_IDLE_TIMEOUT_SECONDS = 30 \* 60/);
  assert.match(
    migration,
    /last_seen_at[\s\S]*make_interval\(secs => resolved_session\.idle_timeout_seconds\)/i
  );
  assert.match(migration, /revocation_reason = 'inactivity_timeout'/i);
  assert.match(sessionApi, /touch: true/);
  assert.match(webAuth, /'focus'[\s\S]*'keydown'[\s\S]*'pointerdown'[\s\S]*'touchstart'/);
  assert.match(webAuth, /APPLICATION_ACTIVITY_THROTTLE_MS/);
  assert.match(webAuth, /method: 'POST'/);
});

test('les accès Supabase du navigateur passent par le serveur sans jeton JavaScript persistant', () => {
  assert.doesNotMatch(webAuth, /\blocalStorage\b/);
  assert.doesNotMatch(webAuth, /\bsessionStorage\b/);
  assert.doesNotMatch(webAuth, /\brefresh_token\b/);
  assert.match(webAuth, /credentials: 'same-origin'/);
  assert.match(webAuth, /\/api\/backend/);
  assert.match(backendApi, /authenticateApplicationSession/);
  assert.match(backendApi, /createSupabaseApplicationJwt/);
  assert.match(backendApi, /Authorization: `Bearer \$\{jwt\}`/);
  assert.match(
    enforcementMigration,
    /auth\.jwt\(\) ->> 'app_session_id'[\s\S]*session_row\.revoked_at is null/i
  );
});

test('la déconnexion et la désactivation révoquent toutes les sessions', () => {
  assert.match(
    migration,
    /create or replace function public\.revoke_all_application_sessions/i
  );
  assert.match(
    migration,
    /create or replace function public\.revoke_application_session/i
  );
  assert.match(migration, /delete from auth\.sessions[\s\S]*user_id = target_auth_user_id/i);
  assert.match(logoutApi, /revokeAllApplicationSessions/);
  assert.match(logoutApi, /'voluntary_logout'/);
  assert.match(logoutApi, /body\?\.scope === 'current'/);
  assert.match(adminUsersApi, /changeAccountLifecycle/);
  assert.match(adminUsersApi, /request\.method === 'PUT'/);
  assert.match(
    lifecycleMigration,
    /update public\.application_sessions[\s\S]*revocation_reason[\s\S]*account_deactivated/i
  );
  assert.match(
    lifecycleMigration,
    /delete from auth\.sessions[\s\S]*user_id = target_profile\.auth_user_id/i
  );
  assert.match(webAuth, /MONJDB_SESSION_REVOKED/);
  assert.match(appContext, /monjdb:session-expired/);
});

test('le mobile conserve seulement le jeton opaque dans SecureStore avec biométrie optionnelle', () => {
  assert.match(mobileEntry, /WebAppShell/);
  assert.match(mobilePackage, /expo-local-authentication/);
  assert.match(mobilePackage, /expo-secure-store/);
  assert.match(mobileConfig, /expo-local-authentication/);
  assert.match(mobileConfig, /Face ID/);
  assert.match(mobileShell, /SecureStore\.WHEN_UNLOCKED_THIS_DEVICE_ONLY/);
  assert.match(mobileShell, /requireAuthentication: true/);
  assert.match(mobileShell, /LocalAuthentication\.authenticateAsync/);
  assert.match(mobileShell, /biometricsSecurityLevel: 'strong'/);
  assert.match(mobileShell, /MOBILE_SESSION_STORAGE_KEY/);
  assert.match(mobileShell, /MONJDB_SESSION_CREATED/);
  assert.match(mobileBootstrapApi, /client_kind !== 'mobile'/);
});

test('la WebView est éphémère et son script injecté ne duplique aucune logique métier', () => {
  const injectedScriptStart = mobileShell.indexOf(
    'const NATIVE_CONTEXT_SCRIPT'
  );
  const injectedScriptEnd = mobileShell.indexOf(
    'function canLoadInsideApp'
  );
  const injectedScript = mobileShell.slice(
    injectedScriptStart,
    injectedScriptEnd
  );

  assert.ok(injectedScriptStart >= 0);
  assert.ok(injectedScriptEnd > injectedScriptStart);
  assert.match(mobileShell, /\bincognito\b/);
  assert.match(mobileShell, /cacheEnabled=\{false\}/);
  assert.match(mobileShell, /sharedCookiesEnabled=\{false\}/);
  assert.match(mobileShell, /thirdPartyCookiesEnabled=\{false\}/);
  assert.doesNotMatch(injectedScript, /\bfetch\s*\(/);
  assert.doesNotMatch(injectedScript, /\blocalStorage\b/);
  assert.doesNotMatch(injectedScript, /\bsessionStorage\b/);
  assert.doesNotMatch(injectedScript, /\bAuthorization\b/);
  assert.doesNotMatch(injectedScript, /\bBearer\b/);
  assert.doesNotMatch(injectedScript, /\/rest\/v1\/|\/rpc\//);
});
