import { expect, test } from '@playwright/test';

import { getRoleCredentials, loginAs } from '../helpers/auth';

const credentials = getRoleCredentials('senior');

test.describe('Parcours Senior', () => {
  test.skip(!credentials, 'Identifiants Senior E2E non configurés.');

  test('voit tous les internes par défaut et conserve les trois filtres', async ({
    page,
  }) => {
    await loginAs(page, credentials!);

    await expect(page.locator('main.senior-screen h1')).toContainText('Dr ');
    await expect(
      page.getByRole('heading', { name: 'Interventions à évaluer', level: 2 })
    ).toBeVisible();

    const populationFilter = page.locator('[data-senior-population-filter]');
    await expect(populationFilter).toHaveAttribute(
      'data-senior-population-filter',
      'all'
    );
    await expect(populationFilter).toContainText('Tous les internes');

    await populationFilter.click();
    await expect(populationFilter).toContainText('Mes internes');
    await populationFilter.click();
    await expect(populationFilter).toContainText('Relations récentes');
    await populationFilter.click();
    await expect(populationFilter).toContainText('Tous les internes');
  });
});
