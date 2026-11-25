import { expect, type Locator, type Page } from '@playwright/test';
import { profiles, type Profile } from '../src/profiles.ts';
import { executeJourney, type JourneyContext } from './journey.ts';
import type { Environment } from './rehearsal-results.ts';

async function waitForState(page: Page, expected: Locator) {
  const alert = page.getByRole('alert');
  await expected.or(alert).first().waitFor({ state: 'visible' });
  if (await alert.isVisible()) throw new Error((await alert.innerText()).trim());
}

export async function openDemoCheckout({ page, url, environment, identity, setup, observe }: JourneyContext) {
  setup('Open checkout');
  const response = await page.goto(url);
  if (!response?.ok()) throw new Error(`Checkout page returned HTTP ${response?.status() ?? 'unknown'}.`);

  setup('Select customer profile');
  await page.getByLabel('Customer profile').selectOption(identity.id);
  setup('Wait for flag evaluation');
  const heading = page.getByRole('heading', { name: /^(Classic|Express) checkout$/ });
  await waitForState(page, heading);
  await expect(page.getByRole('banner').getByText(environment, { exact: true })).toBeVisible();
  const variant = (await heading.innerText()) === 'Express checkout' ? 'Express' : 'Classic';
  const evaluated = await heading.evaluate((element) => {
    const { flagName, flagEnabled, flagReason, flagTraits } = element.closest('section')?.dataset ?? {};
    if (!flagName || (flagEnabled !== 'true' && flagEnabled !== 'false')) return undefined;
    try {
      const traits = JSON.parse(flagTraits ?? '{}');
      if (!traits || typeof traits !== 'object' || Array.isArray(traits)) return undefined;
      return { name: flagName, enabled: flagEnabled === 'true', reason: flagReason, traits };
    } catch {
      return undefined;
    }
  });
  observe(variant, evaluated);
  await expect(page.getByRole('button', { name: 'Continue to review' })).toBeEnabled();
  return variant;
}

export async function checkout(context: JourneyContext) {
  const { page, check } = context;
  const variant = await openDemoCheckout(context);
  check('Continue to review');
  await page.getByRole('button', { name: 'Continue to review' }).click();
  if (variant === 'Express') {
    check('Verify Express session');
    await waitForState(page, page.getByRole('heading', { name: 'Verify Express session', exact: true }));
    await page.getByRole('button', { name: 'Verify Express session', exact: true }).click();
  }
  await waitForState(page, page.getByRole('heading', { name: 'Review order', exact: true }));

  check('Place demo order');
  await page.getByRole('button', { name: 'Place demo order', exact: true }).click();
  check('Reach order confirmation');
  await waitForState(page, page.getByRole('heading', { name: 'Order confirmed', exact: true }));
}

export function runCheckout(page: Page, url: string, environment: Environment, profile: Profile) {
  return executeJourney(checkout, page, url, environment, { id: profile, traits: profiles[profile] });
}
