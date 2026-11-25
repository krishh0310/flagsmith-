import type { Page } from '@playwright/test';
import { errorMessage, type CaseResult, type Environment, type FlagEvaluation } from './rehearsal-results.ts';

export type Identity = {
  id: string;
  traits?: Record<string, string | number | boolean>;
};

export type JourneyContext = {
  page: Page;
  url: string;
  environment: Environment;
  identity: Identity;
  setup(step: string): void;
  check(step: string): void;
  observe(variant: string, evaluation?: FlagEvaluation): void;
};

export type JourneyRegistration = {
  identities: readonly Identity[];
  urls?: Record<Environment, string>;
  explainFlag?: string;
  run(context: JourneyContext): Promise<void>;
};

export async function executeJourney(
  run: JourneyRegistration['run'],
  page: Page,
  url: string,
  environment: Environment,
  identity: Identity,
): Promise<CaseResult> {
  page.setDefaultTimeout(10_000);
  page.setDefaultNavigationTimeout(10_000);
  let step = 'Start journey';
  let outcome: 'setup-error' | 'fail' = 'setup-error';
  let variant: string | null = null;
  let flagEvaluation: FlagEvaluation | undefined;
  const profile = identity.id;

  try {
    await run({
      page, url, environment, identity,
      setup(label) { step = label; outcome = 'setup-error'; },
      check(label) { step = label; outcome = 'fail'; },
      observe(label, evaluation) { variant = label; flagEvaluation = evaluation; },
    });
    return { environment, profile, variant, flagEvaluation, outcome: 'pass' };
  } catch (error) {
    return { environment, profile, variant, flagEvaluation, outcome, error: { step, message: errorMessage(error) } };
  }
}
