import { expect, test } from '@playwright/test';

test.describe('Informations légales publiques', () => {
  test('réunit les mentions légales et la confidentialité sur une seule page', async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') {
        consoleErrors.push(message.text());
      }
    });

    await page.goto('/informations-legales');

    await expect(
      page.getByRole('heading', {
        level: 1,
        name: 'Informations légales et confidentialité',
      })
    ).toBeVisible();
    await expect(
      page.locator('.legal-page__title-row').getByRole('img', {
        name: 'Mon Journal de Bloc',
      })
    ).toHaveCount(0);
    await expect(
      page.locator('.legal-page__title-copy').getByText(
        'Mis à jour le 10 septembre 2026'
      )
    ).toBeVisible();
    await expect(page.locator('.legal-page__title-row > p')).toHaveCount(0);
    await expect(page.locator('.legal-page__title-row > svg')).toHaveCount(0);
    await expect(
      page.getByRole('navigation', { name: 'Sommaire de la page' })
    ).toHaveCount(0);
    await expect(
      page.getByText(
        'Une présentation claire de l’éditeur, du cadre d’utilisation du service et de la protection des données personnelles.'
      )
    ).toHaveCount(0);
    await expect(
      page.getByRole('heading', { level: 2, name: 'Mentions légales' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', {
        level: 2,
        name: 'Politique de confidentialité',
      })
    ).toBeVisible();
    await expect(page.getByText('Joris Poquet')).toHaveCount(1);
    await expect(
      page.getByText(/14 rue Nicolas Appert, 44100 Nantes, France/)
    ).toHaveCount(1);
    await expect(page.getByText('contact@monjournaldebloc.fr')).toHaveCount(1);
    await expect(
      page.getByRole('heading', { name: 'Finalités et bases légales' })
    ).toHaveCount(0);
    await expect(
      page.getByText(
        'Elles ne sont ni vendues ni exploitées à des fins de publicité ciblée.'
      )
    ).toBeVisible();
    await expect(
      page.getByText(/ne doivent jamais.*identifier.*une patiente/)
    ).toBeVisible();
    await expect(page).toHaveTitle(
      'Informations légales et confidentialité — Mon Journal de Bloc'
    );
    await expect(page.locator('vite-error-overlay')).toHaveCount(0);
    expect(consoleErrors).toEqual([]);
  });

  for (const legacyPath of [
    '/mentions-legales',
    '/politique-confidentialite',
  ]) {
    test(`${legacyPath} conserve l’accès au document unique`, async ({ page }) => {
      await page.goto(legacyPath);

      await expect(
        page.getByRole('heading', {
          level: 1,
          name: 'Informations légales et confidentialité',
        })
      ).toBeVisible();
      await expect(
        page.getByRole('heading', { level: 2, name: 'Mentions légales' })
      ).toBeVisible();
      await expect(
        page.getByRole('heading', {
          level: 2,
          name: 'Politique de confidentialité',
        })
      ).toBeVisible();
    });
  }
});
