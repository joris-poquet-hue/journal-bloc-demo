import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const WCAG_AA_TAGS = [
  'wcag2a',
  'wcag2aa',
  'wcag21a',
  'wcag21aa',
  'wcag22aa',
];

test('la page de connexion ne présente aucune violation WCAG A ou AA détectable', async ({
  page,
}) => {
  await page.route('**/api/auth-logout', async (route) => {
    await route.fulfill({
      body: JSON.stringify({ success: true }),
      contentType: 'application/json',
      status: 200,
    });
  });
  await page.goto('/');

  const results = await new AxeBuilder({ page })
    .withTags(WCAG_AA_TAGS)
    .analyze();

  expect(results.violations).toEqual([]);
});
