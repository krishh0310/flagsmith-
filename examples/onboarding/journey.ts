import { buildOnboarding, previewOnboarding } from './preview.ts';
import { expect } from '@playwright/test';
import type { JourneyRegistration } from '../../scripts/journey.ts';

export const onboarding: JourneyRegistration = {
  name: 'Onboarding',
  flagNames: ['new_onboarding', 'save_onboarding_progress'],
  explorer: {
    flags: ['new_onboarding', 'save_onboarding_progress', 'show_onboarding_tips'],
    async start(config) {
      await buildOnboarding();
      const server = await previewOnboarding('explorer', 0, config);
      const address = server.httpServer.address();
      if (!address || typeof address === 'string') {
        await server.close();
        throw Error('Explorer preview has no TCP address');
      }
      return { url: `http://127.0.0.1:${address.port}`, close: () => server.close() };
    },
  },
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
    await expect(status).toHaveText(/Workspace ready: Demo studio|Cannot save workspace progress/);
    if ((await status.innerText()) !== 'Workspace ready: Demo studio') throw new Error(await status.innerText());
  },
};
