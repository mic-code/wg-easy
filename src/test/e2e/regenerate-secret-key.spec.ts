import { expect, test, type Page, type APIRequestContext } from '@playwright/test';

const CREDENTIALS = { username: 'admin', password: 'adminadmin123' };

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
  return { id: result.clientId, name };
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

async function navigateToClientDetail(page: Page, clientId: number) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  const clientLink = page.locator(`a[href="/clients/${clientId}"]`);
  await clientLink.waitFor({ state: 'visible', timeout: 10000 });
  await clientLink.click();
  await page.waitForURL(`/clients/${clientId}`, { timeout: 10000 });
}

async function waitForClientDetailPage(page: Page, clientName: string) {
  await page.locator('text=' + clientName).first().waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(1000);
}

async function getRegenerateButton(page: Page) {
  return page.locator('input[type="button"]').filter({ hasText: /regenerate secret key/i });
}

test.describe('Regenerate Secret Key', () => {
  test('should regenerate preshared key via UI and verify it is persisted in configuration', async ({ page, context }) => {
    await login(page);
    const request = context.request;

    const client = await createClientViaApi(request);

    const presharedKeyBefore = extractPresharedKey(await getClientConfig(request, client.id));
    expect(presharedKeyBefore).toBeTruthy();

    await navigateToClientDetail(page, client.id);
    await waitForClientDetailPage(page, client.name);

    const regenerateButton = await getRegenerateButton(page);
    await expect(regenerateButton.first()).toBeVisible({ timeout: 10000 });
    await regenerateButton.first().scrollIntoViewIfNeeded();
    await regenerateButton.first().click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    await expect(dialog).toContainText(/are you sure/i);
    await expect(dialog).toContainText(client.name);
    await expect(dialog).toContainText(/download their configuration again/i);

    const confirmButton = dialog.locator('button').filter({ hasText: /regenerate secret key/i });
    await confirmButton.click();

    await expect(dialog).not.toBeVisible({ timeout: 5000 });

    await page.waitForTimeout(2000);

    const presharedKeyAfter = extractPresharedKey(await getClientConfig(request, client.id));
    expect(presharedKeyAfter).toBeTruthy();
    expect(presharedKeyAfter).not.toBe(presharedKeyBefore);

    const presharedKeyRecheck = extractPresharedKey(await getClientConfig(request, client.id));
    expect(presharedKeyRecheck).toBe(presharedKeyAfter);
  });

  test('should cancel regeneration and keep the same preshared key', async ({ page, context }) => {
    await login(page);
    const request = context.request;

    const client = await createClientViaApi(request);

    const presharedKeyBefore = extractPresharedKey(await getClientConfig(request, client.id));

    await navigateToClientDetail(page, client.id);
    await waitForClientDetailPage(page, client.name);

    const regenerateButton = await getRegenerateButton(page);
    await expect(regenerateButton.first()).toBeVisible({ timeout: 10000 });
    await regenerateButton.first().scrollIntoViewIfNeeded();
    await regenerateButton.first().click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const cancelButton = dialog.locator('button').filter({ hasText: /cancel/i });
    await cancelButton.click();

    await expect(dialog).not.toBeVisible({ timeout: 5000 });

    const presharedKeyAfter = extractPresharedKey(await getClientConfig(request, client.id));
    expect(presharedKeyAfter).toBe(presharedKeyBefore);
  });

  test('should call the regenerate API endpoint directly and verify key change is persisted', async ({ page, context }) => {
    await login(page);
    const request = context.request;

    const client = await createClientViaApi(request);

    const presharedKeyBefore = extractPresharedKey(await getClientConfig(request, client.id));
    expect(presharedKeyBefore).toBeTruthy();

    const response = await request.post(`/api/client/${client.id}/regenerateSecretKey`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);

    const presharedKeyAfter = extractPresharedKey(await getClientConfig(request, client.id));
    expect(presharedKeyAfter).toBeTruthy();
    expect(presharedKeyAfter).not.toBe(presharedKeyBefore);

    const presharedKeyRecheck = extractPresharedKey(await getClientConfig(request, client.id));
    expect(presharedKeyRecheck).toBe(presharedKeyAfter);
  });
});