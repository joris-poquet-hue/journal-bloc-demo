import { expect, test } from '@playwright/test';

test.describe('Connexion publique', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/auth-logout', async (route) => {
      await route.fulfill({
        body: JSON.stringify({ success: true }),
        contentType: 'application/json',
        status: 200,
      });
    });
  });

  test('affiche une interface française exploitable au clavier', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/Journal de bord chirurgical/i);
    await expect(page.locator('html')).toHaveAttribute('lang', /^fr(?:-|$)/i);
    await expect(
      page.getByRole('region', { name: 'Connexion' })
    ).toBeVisible();
    await expect(page.getByLabel('Identifiant')).toBeVisible();
    await expect(page.getByLabel('Mot de passe ou clé d’accès')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Se connecter' })).toBeEnabled();
    await expect(
      page.getByRole('button', { name: 'Mot de passe oublié' })
    ).toBeEnabled();
    await expect(page.getByText('Version V0')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Contacter l’assistance par e-mail' })
    ).toHaveAttribute(
      'href',
      /^mailto:contact@monjournaldebloc\.fr\?subject=Contact/
    );

    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Identifiant')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Mot de passe ou clé d’accès')).toBeFocused();
  });

  test('conserve un message neutre sans divulguer l’existence du compte', async ({
    page,
  }) => {
    await page.route('**/api/auth-recovery', async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          message:
            'Si ce compte existe, un lien de réinitialisation a été envoyé à son adresse e-mail.',
          ok: true,
        }),
        contentType: 'application/json',
        status: 200,
      });
    });
    await page.goto('/');
    await page.getByLabel('Identifiant').fill('compte-e2e-inexistant');
    await page.getByRole('button', { name: 'Mot de passe oublié' }).click();

    await expect(page.getByRole('status')).toContainText(
      'Si ce compte existe, un lien de réinitialisation a été envoyé'
    );
  });
});
