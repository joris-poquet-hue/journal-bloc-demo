import { expect, test } from '@playwright/test';

import {
  getRoleCredentials,
  isMutationE2EEnabled,
  loginAs,
} from '../helpers/auth';

const credentials = getRoleCredentials('internal');
const mutationE2EEnabled = isMutationE2EEnabled();

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

  test('enregistre puis restaure réellement le bloc-notes', async ({ page }) => {
    test.skip(
      !mutationE2EEnabled,
      'Les mutations E2E ne sont activées que sur une base isolée.'
    );

    await loginAs(page, credentials!);
    await page.getByRole('button', { name: 'Bloc-notes' }).click();
    await expect(
      page.getByRole('heading', { name: 'Bloc-notes', level: 1 })
    ).toBeVisible();

    const editor = page.getByTestId('notebook-editor');
    const saveStatus = page.getByTestId('notebook-save-status');
    const originalHtml = await editor.evaluate((element) => element.innerHTML);
    const marker = `Mutation E2E ${Date.now()}`;
    const waitForSaveResponse = () =>
      page.waitForResponse(
        (response) => {
          const url = new URL(response.url());

          return (
            url.pathname === '/api/backend' &&
            url.searchParams.get('path') === 'notebook_documents' &&
            ['PATCH', 'POST'].includes(response.request().method())
          );
        },
        { timeout: 30_000 }
      );

    try {
      const saveResponsePromise = waitForSaveResponse();
      await editor.evaluate((element, text) => {
        const paragraph = document.createElement('p');
        paragraph.textContent = text;
        element.append(paragraph);
        element.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            data: text,
            inputType: 'insertText',
          })
        );
      }, marker);
      const saveResponse = await saveResponsePromise;

      expect(saveResponse.ok()).toBeTruthy();
      await expect(saveStatus).toContainText('Enregistré');

      await page.reload();
      await expect(
        page.getByRole('navigation', { name: 'Navigation principale' })
      ).toBeVisible({ timeout: 20_000 });
      await page.getByRole('button', { name: 'Bloc-notes' }).click();
      await expect(page.getByTestId('notebook-editor')).toContainText(marker);
    } finally {
      const activeEditor = page.getByTestId('notebook-editor');
      const cleanupResponsePromise = waitForSaveResponse();

      await activeEditor.evaluate((element, html) => {
        element.innerHTML = html;
        element.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            inputType: 'deleteContent',
          })
        );
      }, originalHtml);

      const cleanupResponse = await cleanupResponsePromise;
      expect(cleanupResponse.ok()).toBeTruthy();
      await expect(page.getByTestId('notebook-save-status')).toContainText(
        'Enregistré'
      );
    }
  });

  test('crée, relit puis supprime une intervention complète', async ({ page }) => {
    test.skip(
      !mutationE2EEnabled,
      'Les mutations E2E ne sont activées que sur une base isolée.'
    );

    await loginAs(page, credentials!);
    await page.getByRole('button', { name: 'Ajouter une intervention' }).click();
    await expect(
      page.getByRole('heading', { name: /Construis ta fiche opératoire|Ajouter une intervention/ })
    ).toBeVisible();

    const seniorSelect = page.getByLabel('Senior superviseur');
    const seniorValue = await seniorSelect.locator('option').evaluateAll((options) =>
      options
        .map((option) => (option as HTMLOptionElement).value)
        .find((value) => value.length > 0) ?? ''
    );
    expect(seniorValue).not.toBe('');
    await seniorSelect.selectOption(seniorValue);
    await page.getByLabel('Intervention').selectOption('salpingectomie');
    await page.getByRole('button', { name: 'GEU', exact: true }).click();
    await page.getByLabel('Voie d’abord').selectOption('laparotomie');
    await page.getByRole('button', { name: 'Bloc programmé' }).click();
    await page.getByRole('button', { name: 'Opérateur principal' }).click();
    await page.getByRole('button', { name: 'Gauche' }).click();
    await page.getByRole('button', { name: 'Continuer' }).click();

    await expect(
      page.getByRole('heading', { name: 'Variables de contexte' })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Continuer' }).click();
    await expect(
      page.getByRole('heading', { name: 'Récapitulatif avant enregistrement' })
    ).toBeVisible();

    const createResponsePromise = page.waitForResponse(
      (response) => {
        const url = new URL(response.url());
        return (
          url.pathname === '/api/backend' &&
          url.searchParams.get('path') === 'rpc/create_intervention_v3' &&
          response.request().method() === 'POST'
        );
      },
      { timeout: 30_000 }
    );
    await page.getByRole('button', { name: 'Enregistrer l’intervention' }).click();
    const createResponse = await createResponsePromise;
    expect(createResponse.ok()).toBeTruthy();
    const created = (await createResponse.json()) as {
      intervention?: { id?: string; version?: number };
    };
    const interventionId = created.intervention?.id ?? '';
    const interventionVersion = created.intervention?.version ?? 0;
    expect(interventionId).not.toBe('');
    expect(interventionVersion).toBeGreaterThan(0);

    try {
      await expect(
        page.getByRole('navigation', { name: 'Navigation principale' })
      ).toBeVisible();
      const readResponse = await page.request.get(
        `/api/backend?path=interventions&id=eq.${encodeURIComponent(interventionId)}&select=id,version,deleted_at`
      );
      expect(readResponse.ok()).toBeTruthy();
      const rows = (await readResponse.json()) as Array<{ id: string }>;
      expect(rows.some((row) => row.id === interventionId)).toBeTruthy();
    } finally {
      const cleanupResponse = await page.request.post(
        '/api/backend?path=rpc/delete_pending_intervention',
        {
          data: {
            p_expected_intervention_version: interventionVersion,
            p_intervention_id: interventionId,
          },
        }
      );
      expect(cleanupResponse.ok()).toBeTruthy();
    }
  });
});
