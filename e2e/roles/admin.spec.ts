import { expect, test } from '@playwright/test';

import { getRoleCredentials, loginAs } from '../helpers/auth';

const credentials = getRoleCredentials('admin');

test.describe('Parcours Administrateur', () => {
  test.skip(!credentials, 'Identifiants Administrateur E2E non configurés.');

  test('ouvre le tableau de bord et la gestion des profils sur ordinateur', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await loginAs(page, credentials!);

    await expect(
      page.getByRole('heading', { name: 'Espace administrateur', level: 1 })
    ).toBeVisible();
    await expect(page.locator('main.admin-workspace')).toBeVisible();

    await page
      .getByRole('button', { name: /Gestion des profils/ })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Gestion des profils', level: 1 })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', {
        name: 'Comptes désactivés',
        level: 2,
      })
    ).toBeVisible();
  });
});
