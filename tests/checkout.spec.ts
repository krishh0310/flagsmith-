import { expect, test } from '@playwright/test';
import { runCheckout } from '../scripts/checkout-journey.ts';
import { profileIds, profiles } from '../src/profiles.ts';

for (const [environment, port] of [['Current', 4173], ['Proposed', 4174]] as const) {
  for (const profile of profileIds) {
    test(`${environment} / ${profile} follows the live flag decision`, async ({ page }) => {
      const responsePromise = page.waitForResponse((response) => {
        const request = response.request();
        return new URL(request.url()).pathname.endsWith('/identities/') &&
          request.method() === 'POST' && request.postDataJSON()?.identifier === profile;
      });
      const [result, response] = await Promise.all([
        runCheckout(page, `http://127.0.0.1:${port}`, environment, profile),
        responsePromise,
      ]);
      expect(response.ok()).toBe(true);
      const profileTraits = Object.entries(profiles[profile]).map(([key, value]) =>
        expect.objectContaining({ trait_key: key, trait_value: value }),
      );
      expect(response.request().postDataJSON().traits).toEqual(expect.arrayContaining(profileTraits));

      const { flags } = await response.json();
      const flag = flags.find((entry: { feature: { name: string } }) => entry.feature.name === 'express_checkout');
      expect(typeof flag?.enabled).toBe('boolean');
      expect(result.variant).toBe(flag.enabled ? 'Express' : 'Classic');

      if (flag.enabled && profiles[profile].app_version === 1) {
        expect(result.outcome).toBe('fail');
        expect(result.error?.step).toBe('Verify Express session');
        expect(result.error?.message).toContain('App version 2 or later is required');
        await expect(page.getByRole('button', { name: 'Place demo order' })).toHaveCount(0);
      } else {
        expect(result.outcome, result.error?.message).toBe('pass');
      }
    });
  }
}

test('checkout waits for the identified evaluation', async ({ page }) => {
  const evaluation = Promise.withResolvers<void>();
  await page.route('**/identities/', async (route) => {
    await evaluation.promise;
    await route.continue();
  });
  await page.goto('http://127.0.0.1:4174');
  await page.getByLabel('Customer profile').selectOption('paid-latest');
  const checkout = page.getByRole('button', { name: 'Continue to review' });
  try {
    await expect(page.getByRole('status')).toContainText('Evaluating express_checkout');
    await expect(checkout).toBeDisabled();
  } finally {
    evaluation.resolve();
  }
  await expect(checkout).toBeEnabled();
  await expect(page.getByRole('heading', { name: /^(Classic|Express) checkout$/ })).toBeVisible();
});

test('a failed evaluation prevents checkout', async ({ page }) => {
  await page.route('**/identities/', (route) => route.abort());
  await page.goto('http://127.0.0.1:4174');
  await page.getByLabel('Customer profile').selectOption('paid-latest');
  await expect(page.getByRole('alert')).toContainText('Setup error');
  await expect(page.getByRole('heading', { name: 'Classic checkout' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue to review' })).toBeDisabled();
});

test('a missing flag prevents checkout', async ({ page }) => {
  await page.route('**/identities/', (route) => route.fulfill({
    json: { flags: [], traits: [], identifier: 'paid-latest' },
  }));
  const result = await runCheckout(page, 'http://127.0.0.1:4174', 'Proposed', 'paid-latest');
  expect(result).toMatchObject({ outcome: 'setup-error', variant: null });
  await expect(page.getByRole('alert')).toContainText('express_checkout is missing');
  await expect(page.getByRole('button', { name: 'Continue to review' })).toBeDisabled();
});

test('a missing Proposed SDK key is a setup error with no checkout variant', async ({ page }) => {
  await page.route('**/checkout-config.json', (route) => route.fulfill({
    json: { environment: 'Proposed', api: 'http://localhost:8000/api/v1/' },
  }));
  const result = await runCheckout(page, 'http://127.0.0.1:4174', 'Proposed', 'paid-latest');
  expect(result).toMatchObject({ outcome: 'setup-error', variant: null });
  await expect(page.getByRole('heading', { name: /^(Classic|Express) checkout$/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue to review' })).toBeDisabled();
});
