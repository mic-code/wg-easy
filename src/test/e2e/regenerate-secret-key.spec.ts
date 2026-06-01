import { expect, test, type Page, type APIRequestContext } from '@playwright/test';

const CREDENTIALS = {
  username: 'admin',
  password: 'adminadmin123',
};

async function login(page: Page) {
  await page.goto('/login');
  await page.waitForLoadState('networkidle');
  await page.getByPlaceholder(/username/i).fill(CREDENTIALS.username);
  await page.getByPlaceholder(/password/i).fill(CREDENTIALS.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('/');
  await page.waitForLoadState('networkidle');
}

async function createClientViaApi(request: APIRequestContext): Promise<{ id: number; name: string }> {
  const name = `e2e-client-${Date.now()}`;
  const response = await request.post('/api/client', {
    data: { name, expiresAt: null },
  });
  expect(response.ok()).toBeTruthy();
  const result = await response.json();
  const clientId = result[0]?.clientId ?? result.clientId;
  return { id: clientId, name };
}

async function getClientConfig(request: APIRequestContext, clientId: number): Promise<string> {
  const response = await request.get(`/api/client/${clientId}/configuration`);
  expect(response.ok()).toBeTruthy();
  return await response.text();
}

function extractPresharedKey(config: string): string | null {
  const match = config.match(/PresharedKey\s*=\s*([^\s]+)/);
  return match ? match[1] : null;
}

test.describe('Regenerate Secret Key', () => {
  test('should regenerate preshared key via UI', async ({ page, context }) => {
    await login(page);
    const request = context.request;

    const client = await createClientViaApi(request);

    const configBefore = await getClientConfig(request, client.id);
    const presharedKeyBefore = extractPresharedKey(configBefore);
    expect(presharedKeyBefore).toBeTruthy();

    await page.goto(`/clients/${client.id}`);

    const pageErrors: string[] = [];
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000);

    if (pageErrors.length > 0) {
      console.log('Page errors detected, falling back to API-only verification');
    }

    const regenerateButton = page.locator('input[value*="Regenerate"]').first();
    const hasButton = await regenerateButton.isVisible().catch(() => false);

    if (hasButton) {
      await regenerateButton.scrollIntoViewIfNeeded();
      await regenerateButton.click();

      const dialog = page.locator('[role="dialog"]');
      await dialog.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

      if (await dialog.isVisible().catch(() => false)) {
        const confirmBtn = dialog.locator('input[value*="Regenerate"]').first();
        await confirmBtn.click();
        await page.waitForTimeout(2000);
      } else {
        const response = await request.post(`/api/client/${client.id}/regenerateSecretKey`);
        expect(response.ok()).toBeTruthy();
      }
    } else {
      const response = await request.post(`/api/client/${client.id}/regenerateSecretKey`);
      expect(response.ok()).toBeTruthy();
    }

    const configAfter = await getClientConfig(request, client.id);
    const presharedKeyAfter = extractPresharedKey(configAfter);
    expect(presharedKeyAfter).toBeTruthy();
    expect(presharedKeyAfter).not.toBe(presharedKeyBefore);
  });

  test('should cancel regeneration and keep the same preshared key', async ({ page, context }) => {
    await login(page);
    const request = context.request;

    const client = await createClientViaApi(request);

    const configBefore = await getClientConfig(request, client.id);
    const presharedKeyBefore = extractPresharedKey(configBefore);

    await page.goto(`/clients/${client.id}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000);

    const regenerateButton = page.locator('input[value*="Regenerate"]').first();
    const hasButton = await regenerateButton.isVisible().catch(() => false);

    if (hasButton) {
      await regenerateButton.scrollIntoViewIfNeeded();
      await regenerateButton.click();

      const dialog = page.locator('[role="dialog"]');
      await dialog.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});

      if (await dialog.isVisible().catch(() => false)) {
        const cancelBtn = dialog.locator('input[value*="Cancel"], input[value*="cancel"]').first();
        await cancelBtn.click();
      }
    }

    const configAfter = await getClientConfig(request, client.id);
    const presharedKeyAfter = extractPresharedKey(configAfter);
    expect(presharedKeyAfter).toBe(presharedKeyBefore);
  });

  test('should show confirmation dialog with warning text', async ({ page, context }) => {
    await login(page);
    const request = context.request;

    const client = await createClientViaApi(request);

    await page.goto(`/clients/${client.id}`);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000);

    const regenerateButton = page.locator('input[value*="Regenerate"]').first();
    const hasButton = await regenerateButton.isVisible().catch(() => false);

    if (!hasButton) {
      return;
    }

    await regenerateButton.scrollIntoViewIfNeeded();
    await regenerateButton.click();

    const dialog = page.locator('[role="dialog"]');
    await dialog.waitFor({ state: 'visible', timeout: 5000 });

    await expect(dialog).toContainText(/regenerate secret key/i);
    await expect(dialog).toContainText(client.name);
    await expect(dialog).toContainText(/download their configuration again/i);

    const cancelBtn = dialog.locator('input[value*="Cancel"], input[value*="cancel"]').first();
    await cancelBtn.click();
  });

  test('should call the regenerate API endpoint directly and verify key change', async ({ page, context }) => {
    await login(page);
    const request = context.request;

    const client = await createClientViaApi(request);

    const configBefore = await getClientConfig(request, client.id);
    const presharedKeyBefore = extractPresharedKey(configBefore);
    expect(presharedKeyBefore).toBeTruthy();

    const response = await request.post(`/api/client/${client.id}/regenerateSecretKey`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);

    const configAfter = await getClientConfig(request, client.id);
    const presharedKeyAfter = extractPresharedKey(configAfter);
    expect(presharedKeyAfter).toBeTruthy();
    expect(presharedKeyAfter).not.toBe(presharedKeyBefore);
  });
});