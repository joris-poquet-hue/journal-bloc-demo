import { expect, type Page } from '@playwright/test';
import { createHmac } from 'node:crypto';

export type TestedRole = 'internal' | 'senior' | 'admin';

type Credentials = {
  loginId: string;
  mfaSecret?: string;
  password: string;
};

function decodeBase32(value: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const normalized = value.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';

  for (const character of normalized) {
    bits += alphabet.indexOf(character).toString(2).padStart(5, '0');
  }

  return Buffer.from(
    bits.match(/.{8}/g)?.map((byte) => Number.parseInt(byte, 2)) ?? []
  );
}

function createTotp(secret: string) {
  const counterBytes = Buffer.alloc(8);
  counterBytes.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac('sha1', decodeBase32(secret))
    .update(counterBytes)
    .digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    (((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff)) %
    1_000_000;

  return String(code).padStart(6, '0');
}

const ENV_PREFIX_BY_ROLE: Record<TestedRole, string> = {
  internal: 'E2E_INTERNAL',
  senior: 'E2E_SENIOR',
  admin: 'E2E_ADMIN',
};

if (process.env.REQUIRE_AUTHENTICATED_E2E === '1') {
  const authenticatedBaseUrl = process.env.E2E_AUTH_BASE_URL?.trim();

  if (!authenticatedBaseUrl) {
    throw new Error(
      'E2E_AUTH_BASE_URL est obligatoire pour les parcours authentifiés.'
    );
  }

  const hostname = new URL(authenticatedBaseUrl).hostname.replace(/^www\./, '');

  if (hostname === 'monjournaldebloc.fr') {
    throw new Error(
      'Les E2E authentifiés sont interdits sur la production. Configurez un déploiement relié à la base isolée.'
    );
  }
}

export function isMutationE2EEnabled() {
  if (process.env.REQUIRE_MUTATION_E2E !== '1') {
    return false;
  }

  const authenticatedBaseUrl = process.env.E2E_AUTH_BASE_URL?.trim();

  if (!authenticatedBaseUrl) {
    throw new Error(
      'E2E_AUTH_BASE_URL est obligatoire pour les parcours E2E avec mutations.'
    );
  }

  const hostname = new URL(authenticatedBaseUrl).hostname.replace(/^www\./, '');
  const isLocalTarget = ['127.0.0.1', '::1', 'localhost'].includes(hostname);

  if (hostname === 'monjournaldebloc.fr') {
    throw new Error('Les mutations E2E sont strictement interdites en production.');
  }

  if (!isLocalTarget && process.env.ALLOW_REMOTE_MUTATION_E2E !== '1') {
    throw new Error(
      'Une cible distante de mutation E2E exige ALLOW_REMOTE_MUTATION_E2E=1.'
    );
  }

  return true;
}

export function getRoleCredentials(role: TestedRole): Credentials | null {
  const prefix = ENV_PREFIX_BY_ROLE[role];
  const loginId = process.env[`${prefix}_LOGIN_ID`]?.trim();
  const password = process.env[`${prefix}_PASSWORD`];
  const mfaSecret = process.env[`${prefix}_MFA_SECRET`]?.trim();

  if (!loginId || !password) {
    if (process.env.REQUIRE_AUTHENTICATED_E2E === '1') {
      throw new Error(
        `Les variables ${prefix}_LOGIN_ID et ${prefix}_PASSWORD sont obligatoires pour les E2E authentifiés.`
      );
    }

    return null;
  }

  return { loginId, mfaSecret, password };
}

export async function dismissTrophyCelebrationIfPresent(page: Page) {
  const closeButton = page.getByRole('button', {
    name: 'Fermer la célébration',
  });

  if (await closeButton.isVisible()) {
    await closeButton.click();
    await expect(closeButton).toBeHidden();
  }
}

export async function loginAs(page: Page, credentials: Credentials) {
  await page.goto('/');
  await page.getByLabel('Identifiant').fill(credentials.loginId);
  await page.getByLabel('Mot de passe ou clé d’accès').fill(credentials.password);
  const loginResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes('/api/auth-login') &&
      response.request().method() === 'POST',
    { timeout: 30_000 }
  );

  await page.getByRole('button', { name: 'Se connecter' }).click();

  const loginResponse = await loginResponsePromise;
  if (!loginResponse.ok()) {
    const responseText = (await loginResponse.text()).trim().slice(0, 300);
    throw new Error(
      `La connexion E2E a échoué avec le statut ${loginResponse.status()}` +
        (responseText ? ` : ${responseText}` : '.')
    );
  }

  if (loginResponse.status() === 202) {
    if (!credentials.mfaSecret) {
      throw new Error(
        'Ce compte E2E exige la double authentification, mais son secret MFA de test n’est pas configuré.'
      );
    }

    await page.getByLabel('Code de vérification').fill(
      createTotp(credentials.mfaSecret)
    );
    const verificationResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/api/auth-login') &&
        response.request().method() === 'POST',
      { timeout: 30_000 }
    );
    await page.getByRole('button', { name: 'Vérifier et se connecter' }).click();
    const verificationResponse = await verificationResponsePromise;

    if (!verificationResponse.ok()) {
      throw new Error(
        `La vérification MFA E2E a échoué avec le statut ${verificationResponse.status()}.`
      );
    }
  }
  await expect(page.getByRole('region', { name: 'Connexion' })).toBeHidden({
    timeout: 20_000,
  });
  await expect(page.getByRole('alert')).toHaveCount(0);
  await dismissTrophyCelebrationIfPresent(page);
}
