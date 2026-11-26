import { expect } from '@playwright/test';
import type { JourneyRegistration } from '../../scripts/journey.ts';
import type { RemoteValue } from '../../scripts/rehearsal-results.ts';

export const approvedPrices: Readonly<Record<number, number>> = { 0: 100_000, 10: 90_000, 20: 80_000 };
export const pricing: JourneyRegistration = {
  name: 'Pricing',
  targetPath: '/pricing.html',
  remoteValueNames: ['pricing_discount'],
  identities: Array.from({ length: 16 }, (_, i) => ({ id: 'pricing-' + String(i + 1).padStart(2, '0') })),
  async run({ page, identity, url, setup, check, observe, observeRemoteValues }) {
    setup('Evaluate pricing discount');
    const target = new URL(url);
    target.searchParams.set('id', identity.id);
    await page.goto(target.href);
    const status = page.getByRole('status');
    await expect(status).toHaveAttribute('data-observed', /./);
    const { enabled, value } = JSON.parse((await status.getAttribute('data-observed'))!);
    const observation: RemoteValue = { enabled, value };
    if (value === undefined || value === null) {
      observeRemoteValues({ pricing_discount: observation });
      throw Error('The pricing_discount remote value is unavailable.');
    }
    const numeric = typeof value === 'number' ? value : typeof value === 'string' && /^-?\d+$/.test(value) ? Number(value) : NaN;
    const expected = approvedPrices[numeric];
    const rendered = await page.locator('#price').getAttribute('data-minor');
    observation.expectedMinor = expected;
    observation.renderedMinor = rendered === null ? undefined : Number(rendered);
    observation.valid = enabled === true && expected !== undefined;
    observeRemoteValues({ pricing_discount: observation });
    observe(`Discount ${typeof value === 'string' || typeof value === 'number' ? value : JSON.stringify(value)}`);
    check('Verify approved discount and rendered price');
    if (!observation.valid) throw Error(`Discount ${JSON.stringify(value)} is outside the approved price contract.`);
    expect(observation.renderedMinor).toBe(expected);
    await expect(page.locator('#price')).toHaveText(
      new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(expected / 100));
  },
};
