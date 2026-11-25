import { onboarding } from "./examples/onboarding/journey.ts";
import { checkout } from './scripts/checkout-journey.ts';
import { flagSmoke } from './scripts/flag-smoke-journey.ts';
import type { JourneyRegistration } from './scripts/journey.ts';
import { profileIds, profiles } from './src/profiles.ts';

const identities = profileIds.map((id) => ({ id, traits: profiles[id] }));

export const defaultJourney = 'checkout';
export const journeys: Record<string, JourneyRegistration> = {
  onboarding,
  checkout: { identities, run: checkout, explainFlag: 'express_checkout' },
  'flag-smoke': { identities, run: flagSmoke },
};
