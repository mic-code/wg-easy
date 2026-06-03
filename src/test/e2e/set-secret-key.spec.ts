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

function extractPrivateKey(config: string): string | null {
  const match = config.match(/PrivateKey\s*=\s*([^\s]+)/);
  return match?.[1] ?? null;
}

function extractPublicKey(config: string): string | null {
  const match = config.match(/PublicKey\s*=\s*([^\s]+)/);
  return match?.[1] ?? null;
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

test.describe('Set Private Key', () => {
  test('should set a specific private key via UI and verify it is persisted', async ({ page, context }) => {
    await login(page);
    const request = context.request;

    const client = await createClientViaApi(request);
    const privateKeyBefore = extractPrivateKey(await getClientConfig(request, client.id));
    expect(privateKeyBefore).toBeTruthy();

    await navigateToClientDetail(page, client.id, client.name);

    const setKeyButton = page.locator('input[type="button"]').filter({ hasText: /set private key/i });
    await expect(setKeyButton.first()).toBeVisible({ timeout: 10000 });
    await setKeyButton.first().scrollIntoViewIfNeeded();
    await setKeyButton.first().click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const specificKey = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';
    const keyInput = dialog.locator('#privateKey');
    await keyInput.fill(specificKey);

    const confirmButton = dialog.locator('button').filter({ hasText: /set private key/i });
    await confirmButton.click();

    await expect(dialog).not.toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(2000);

    const privateKeyAfter = extractPrivateKey(await getClientConfig(request, client.id));
    expect(privateKeyAfter).toBe(specificKey);

    const privateKeyRecheck = extractPrivateKey(await getClientConfig(request, client.id));
    expect(privateKeyRecheck).toBe(specificKey);
  });

  test('should generate a new key via the Generate button and verify it changes', async ({ page, context }) => {
    await login(page);
    const request = context.request;

    const client = await createClientViaApi(request);
    const privateKeyBefore = extractPrivateKey(await getClientConfig(request, client.id));
    expect(privateKeyBefore).toBeTruthy();

    await navigateToClientDetail(page, client.id, client.name);

    const setKeyButton = page.locator('input[type="button"]').filter({ hasText: /set private key/i });
    await expect(setKeyButton.first()).toBeVisible({ timeout: 10000 });
    await setKeyButton.first().scrollIntoViewIfNeeded();
    await setKeyButton.first().click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const generateButton = dialog.locator('input[type="button"]').filter({ hasText: /generate/i });
    await generateButton.click();
    await page.waitForTimeout(1000);

    const keyInput = dialog.locator('#privateKey');
    const generatedKey = await keyInput.inputValue();
    expect(generatedKey).toBeTruthy();
    expect(generatedKey.length).toBeGreaterThanOrEqual(43);

    const confirmButton = dialog.locator('button').filter({ hasText: /set private key/i });
    await confirmButton.click();

    await expect(dialog).not.toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(2000);

    const privateKeyAfter = extractPrivateKey(await getClientConfig(request, client.id));
    expect(privateKeyAfter).toBe(generatedKey);
    expect(privateKeyAfter).not.toBe(privateKeyBefore);
  });

  test('should cancel and keep the same private key', async ({ page, context }) => {
    await login(page);
    const request = context.request;

    const client = await createClientViaApi(request);
    const privateKeyBefore = extractPrivateKey(await getClientConfig(request, client.id));

    await navigateToClientDetail(page, client.id, client.name);

    const setKeyButton = page.locator('input[type="button"]').filter({ hasText: /set private key/i });
    await expect(setKeyButton.first()).toBeVisible({ timeout: 10000 });
    await setKeyButton.first().scrollIntoViewIfNeeded();
    await setKeyButton.first().click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const keyInput = dialog.locator('#privateKey');
    await keyInput.fill('BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=');

    const cancelButton = dialog.locator('button').filter({ hasText: /cancel/i });
    await cancelButton.click();

    await expect(dialog).not.toBeVisible({ timeout: 5000 });

    const privateKeyAfter = extractPrivateKey(await getClientConfig(request, client.id));
    expect(privateKeyAfter).toBe(privateKeyBefore);
  });

  test('should call the setSecretKey API endpoint directly and verify key change is persisted', async ({ page, context }) => {
    await login(page);
    const request = context.request;

    const client = await createClientViaApi(request);
    const privateKeyBefore = extractPrivateKey(await getClientConfig(request, client.id));
    expect(privateKeyBefore).toBeTruthy();

    const genResponse = await request.get('/api/client/generateSecretKey');
    expect(genResponse.ok()).toBeTruthy();
    const { privateKey: specificKey } = await genResponse.json();

    const response = await request.post(`/api/client/${client.id}/setSecretKey`, {
      data: { privateKey: specificKey },
    });
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.success).toBe(true);

    const privateKeyAfter = extractPrivateKey(await getClientConfig(request, client.id));
    expect(privateKeyAfter).toBe(specificKey);
    expect(privateKeyAfter).not.toBe(privateKeyBefore);

    const privateKeyRecheck = extractPrivateKey(await getClientConfig(request, client.id));
    expect(privateKeyRecheck).toBe(specificKey);
  });

  test('should reject an invalid private key via the API', async ({ page, context }) => {
    await login(page);
    const request = context.request;

    const client = await createClientViaApi(request);
    const privateKeyBefore = extractPrivateKey(await getClientConfig(request, client.id));

    const response = await request.post(`/api/client/${client.id}/setSecretKey`, {
      data: { privateKey: 'not-a-valid-key' },
    });
    expect(response.ok()).toBeFalsy();

    const privateKeyAfter = extractPrivateKey(await getClientConfig(request, client.id));
    expect(privateKeyAfter).toBe(privateKeyBefore);
  });

  test('should set private key via UI button and verify key persists after page refresh', async ({ page, context }) => {
    await login(page);
    const request = context.request;

    const client = await createClientViaApi(request);
    const privateKeyBefore = extractPrivateKey(await getClientConfig(request, client.id));
    expect(privateKeyBefore).toBeTruthy();

    await navigateToClientDetail(page, client.id, client.name);

    const setKeyButton = page.locator('input[type="button"]').filter({ hasText: /set private key/i });
    await expect(setKeyButton.first()).toBeVisible({ timeout: 10000 });
    await setKeyButton.first().scrollIntoViewIfNeeded();
    await setKeyButton.first().click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const generateButton = dialog.locator('input[type="button"]').filter({ hasText: /generate/i });
    await generateButton.click();
    await page.waitForTimeout(1000);

    const keyInput = dialog.locator('#privateKey');
    const generatedKey = await keyInput.inputValue();
    expect(generatedKey).toBeTruthy();
    expect(generatedKey.length).toBeGreaterThanOrEqual(43);

    const confirmButton = dialog.locator('button').filter({ hasText: /set private key/i });
    await confirmButton.click();

    await expect(dialog).not.toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(2000);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const privateKeyAfterRefresh = extractPrivateKey(await getClientConfig(request, client.id));
    expect(privateKeyAfterRefresh).toBe(generatedKey);
    expect(privateKeyAfterRefresh).not.toBe(privateKeyBefore);
  });

  test('should set private key via UI and verify the new key is shown in UI after refresh', async ({ page, context }) => {
    await login(page);
    const request = context.request;

    const client = await createClientViaApi(request);
    const privateKeyBefore = extractPrivateKey(await getClientConfig(request, client.id));
    expect(privateKeyBefore).toBeTruthy();

    await navigateToClientDetail(page, client.id, client.name);

    const setKeyButton = page.locator('input[type="button"]').filter({ hasText: /set private key/i });
    await expect(setKeyButton.first()).toBeVisible({ timeout: 10000 });
    await setKeyButton.first().scrollIntoViewIfNeeded();
    await setKeyButton.first().click();

    const dialog = page.locator('[role="dialog"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const generateButton = dialog.locator('input[type="button"]').filter({ hasText: /generate/i });
    await generateButton.click();
    await page.waitForTimeout(1000);

    const keyInput = dialog.locator('#privateKey');
    const generatedKey = await keyInput.inputValue();
    expect(generatedKey).toBeTruthy();
    expect(generatedKey.length).toBeGreaterThanOrEqual(43);

    const confirmButton = dialog.locator('button').filter({ hasText: /set private key/i });
    await confirmButton.click();

    await expect(dialog).not.toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(2000);

    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const viewConfigButton = page.locator('input[type="button"]').filter({ hasText: /view configuration/i });
    await expect(viewConfigButton.first()).toBeVisible({ timeout: 10000 });
    await viewConfigButton.first().scrollIntoViewIfNeeded();
    await viewConfigButton.first().click();

    const configDialog = page.locator('[role="dialog"]');
    await expect(configDialog).toBeVisible({ timeout: 5000 });

    const codeBlock = configDialog.locator('code, pre');
    await expect(codeBlock).toBeVisible({ timeout: 5000 });
    const configText = await codeBlock.textContent();

    const privateKeyInUI = extractPrivateKey(configText ?? '');
    expect(privateKeyInUI).toBe(generatedKey);
    expect(privateKeyInUI).not.toBe(privateKeyBefore);
  });
});
