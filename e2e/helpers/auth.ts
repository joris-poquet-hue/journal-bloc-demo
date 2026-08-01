import { expect, type Page } from '@playwright/test';

export type TestedRole = 'internal' | 'senior' | 'admin';

type Credentials = {
  loginId: string;
  password: string;
};

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
      'Les E2E authentifiés sont interdits sur la production. Configurez un déploiement relié à la base Supabase isolée.'
    );
  }
}

export function getRoleCredentials(role: TestedRole): Credentials | null {
  const prefix = ENV_PREFIX_BY_ROLE[role];
  const loginId = process.env[`${prefix}_LOGIN_ID`]?.trim();
  const password = process.env[`${prefix}_PASSWORD`];

  if (!loginId || !password) {
    if (process.env.REQUIRE_AUTHENTICATED_E2E === '1') {
      throw new Error(
        `Les variables ${prefix}_LOGIN_ID et ${prefix}_PASSWORD sont obligatoires pour les E2E authentifiés.`
      );
    }

    return null;
  }

  return { loginId, password };
}

export async function loginAs(page: Page, credentials: Credentials) {
  await page.goto('/');
  await page.getByLabel('Identifiant').fill(credentials.loginId);
  await page.getByLabel('Mot de passe ou clé d’accès').fill(credentials.password);
  await page.getByRole('button', { name: 'Se connecter' }).click();

  await expect(page.getByRole('button', { name: 'Se connecter' })).toBeHidden({
    timeout: 20_000,
  });
  await expect(page.getByRole('alert')).toHaveCount(0);
}
