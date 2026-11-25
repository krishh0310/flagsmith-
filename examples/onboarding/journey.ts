import { expect } from '@playwright/test';
import type { JourneyRegistration } from '../../scripts/journey.ts';

export const onboarding: JourneyRegistration = {
  urls: { Current: 'http://127.0.0.1:4181', Proposed: 'http://127.0.0.1:4182' },
  identities: [
    { id: 'starter', traits: { plan: 'free', app_version: 2 } },
    { id: 'pilot', traits: { plan: 'paid', app_version: 1 } },
    { id: 'team', traits: { plan: 'paid', app_version: 2 } },
  ],
  async run({ page, identity, url, setup, check, observe, observeFlags }) {
    setup('Evaluate onboarding flags');
    const target = new URL(url);
    target.search = new URLSearchParams({ id: identity.id, plan: String(identity.traits?.plan),
      version: String(identity.traits?.app_version) }).toString();
    await page.goto(target.href);
    const status = page.getByRole('status');
    await expect(status).toHaveAttribute('data-flags', /./);
    observeFlags(JSON.parse((await status.getAttribute('data-flags'))!));
    observe(await status.innerText());
    check('Continue workspace onboarding');
    await page.getByLabel('Workspace name').fill('Demo studio');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(status).toHaveText('Workspace ready: Demo studio');
  },
};
