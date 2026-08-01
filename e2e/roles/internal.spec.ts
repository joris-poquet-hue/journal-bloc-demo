import { expect, test } from '@playwright/test';

import { getRoleCredentials, loginAs } from '../helpers/auth';

const credentials = getRoleCredentials('internal');

test.describe('Parcours Interne', () => {
  test.skip(!credentials, 'Identifiants Interne E2E non configurés.');

  test('ouvre le tableau de bord et consulte la progression', async ({ page }) => {
    await loginAs(page, credentials!);

    await expect(page.locator('main.dashboard-screen h1')).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Navigation principale' })
    ).toBeVisible();

    await page.getByRole('button', { name: 'Progression' }).click();
    await expect(
      page.getByRole('heading', {
        name: /Historique des blocs|Ma progression/,
        level: 1,
      })
    ).toBeVisible();

    await page.getByRole('button', { name: 'Profil' }).click();
    await expect(
      page.getByRole('heading', { name: 'Mon compte', level: 1 })
    ).toBeVisible();
  });
});
