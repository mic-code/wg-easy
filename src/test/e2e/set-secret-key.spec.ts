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

async function navigateToClientDetail(page: Page, clientId: number, clientName: string) {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1000);

  const clientLink = page.locator(`a[href="/clients/${clientId}"]`);
  await clientLink.waitFor({ state: 'visible', timeout: 10000 });
  await clientLink.click();
  await page.waitForURL(`/clients/${clientId}`, { timeout: 10000 });

  await page.locator('text=' + clientName).first().waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(1000);
}

test.describe('Set Secret Key', () => {
  test('should set a specific pre-shared key via UI and verify it is persisted', async ({ page, context }) => {
    await login(page);
    const request = context.request;

    const client = await createClientViaApi(request);
    const presharedKeyBefore = extractPresharedKey(await getClientConfig(request, client.id));
    expect(presharedKeyBefore).toBeTruthy();

    await navigateToClientDetail(page, client.id, client.name);

    const setKeyButton = page.locator('input[type="button"]').filter({ hasText: /set secret key/i });
    await expect(setKeyButton.first()).toBeVisible({ timeout: 10000 });
    await setKeyButton.first().scrollIntoViewIfNeeded();
    await setKeyButton.first().click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const specificKey = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    const keyInput = dialog.locator('#preSharedKey');
    await keyInput.fill(specificKey);

    const confirmButton = dialog.locator('button').filter({ hasText: /set secret key/i });
    await confirmButton.click();

    await expect(dialog).not.toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(2000);

    const presharedKeyAfter = extractPresharedKey(await getClientConfig(request, client.id));
    expect(presharedKeyAfter).toBe(specificKey);

    const presharedKeyRecheck = extractPresharedKey(await getClientConfig(request, client.id));
    expect(presharedKeyRecheck).toBe(specificKey);
  });

  test('should generate a new key via the Generate button and verify it changes', async ({ page, context }) => {
    await login(page);
    const request = context.request;

    const client = await createClientViaApi(request);
    const presharedKeyBefore = extractPresharedKey(await getClientConfig(request, client.id));
    expect(presharedKeyBefore).toBeTruthy();

    await navigateToClientDetail(page, client.id, client.name);

    const setKeyButton = page.locator('input[type="button"]').filter({ hasText: /set secret key/i });
    await expect(setKeyButton.first()).toBeVisible({ timeout: 10000 });
    await setKeyButton.first().scrollIntoViewIfNeeded();
    await setKeyButton.first().click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const generateButton = dialog.locator('input[type="button"]').filter({ hasText: /generate/i });
    await generateButton.click();
    await page.waitForTimeout(1000);

    const keyInput = dialog.locator('#preSharedKey');
    const generatedKey = await keyInput.inputValue();
    expect(generatedKey).toBeTruthy();
    expect(generatedKey.length).toBeGreaterThanOrEqual(43);

    const confirmButton = dialog.locator('button').filter({ hasText: /set secret key/i });
    await confirmButton.click();

    await expect(dialog).not.toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(2000);

    const presharedKeyAfter = extractPresharedKey(await getClientConfig(request, client.id));
    expect(presharedKeyAfter).toBe(generatedKey);
    expect(presharedKeyAfter).not.toBe(presharedKeyBefore);
  });

  test('should cancel and keep the same pre-shared key', async ({ page, context }) => {
    await login(page);
    const request = context.request;

    const client = await createClientViaApi(request);
    const presharedKeyBefore = extractPresharedKey(await getClientConfig(request, client.id));

    await navigateToClientDetail(page, client.id, client.name);

    const setKeyButton = page.locator('input[type="button"]').filter({ hasText: /set secret key/i });
    await expect(setKeyButton.first()).toBeVisible({ timeout: 10000 });
    await setKeyButton.first().scrollIntoViewIfNeeded();
    await setKeyButton.first().click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const keyInput = dialog.locator('#preSharedKey');
    await keyInput.fill('BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=');

    const cancelButton = dialog.locator('button').filter({ hasText: /cancel/i });
    await cancelButton.click();

    await expect(dialog).not.toBeVisible({ timeout: 5000 });

    const presharedKeyAfter = extractPresharedKey(await getClientConfig(request, client.id));
    expect(presharedKeyAfter).toBe(presharedKeyBefore);
  });

  test('should call the setSecretKey API endpoint directly and verify key change is persisted', async ({ page, context }) => {
    await login(page);
    const request = context.request;

    const client = await createClientViaApi(request);
    const presharedKeyBefore = extractPresharedKey(await getClientConfig(request, client.id));
    expect(presharedKeyBefore).toBeTruthy();

    const genResponse = await request.get('/api/client/generateSecretKey');
    expect(genResponse.ok()).toBeTruthy();
    const { preSharedKey: specificKey } = await genResponse.json();

    const response = await request.post(`/api/client/${client.id}/setSecretKey`, {
      data: { preSharedKey: specificKey },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);

    const presharedKeyAfter = extractPresharedKey(await getClientConfig(request, client.id));
    expect(presharedKeyAfter).toBe(specificKey);
    expect(presharedKeyAfter).not.toBe(presharedKeyBefore);

    const presharedKeyRecheck = extractPresharedKey(await getClientConfig(request, client.id));
    expect(presharedKeyRecheck).toBe(specificKey);
  });

  test('should reject an invalid pre-shared key via the API', async ({ page, context }) => {
    await login(page);
    const request = context.request;

    const client = await createClientViaApi(request);
    const presharedKeyBefore = extractPresharedKey(await getClientConfig(request, client.id));

    const response = await request.post(`/api/client/${client.id}/setSecretKey`, {
      data: { preSharedKey: 'not-a-valid-key' },
    });
    expect(response.ok()).toBeFalsy();

    const presharedKeyAfter = extractPresharedKey(await getClientConfig(request, client.id));
    expect(presharedKeyAfter).toBe(presharedKeyBefore);
  });
});
