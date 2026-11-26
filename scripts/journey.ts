import type { Page } from '@playwright/test';
import { errorMessage, type CaseResult, type Environment, type RemoteValue, type FlagEvaluation } from './rehearsal-results.ts';

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
  observeRemoteValues(values: Record<string, RemoteValue>): void;
  observeFlags(values: Record<string, boolean>): void;
  observe(variant: string, evaluation?: FlagEvaluation): void;
};

export type JourneyRegistration = {
  name?: string;
  targetPath?: string;
  remoteValueNames?: readonly string[];
  flagNames?: readonly string[];
  explorer?: {
    flags: readonly string[];
    start(config: { api: string; environmentID: string }): Promise<{ url: string; close(): Promise<void> }>;
  };
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
  let remoteValues: Record<string, RemoteValue> | undefined;
  let observedFlags: Record<string, boolean> | undefined;
  const profile = identity.id;

  try {
    await run({
      page, url, environment, identity,
      setup(label) { step = label; outcome = 'setup-error'; },
      check(label) { step = label; outcome = 'fail'; },
      observeRemoteValues(values) { remoteValues = structuredClone(values); },
      observeFlags(values) { observedFlags = { ...values }; },
      observe(label, evaluation) { variant = label; flagEvaluation = evaluation; },
    });
    return { environment, profile, variant, flagEvaluation, observedFlags, remoteValues, outcome: 'pass' };
  } catch (error) {
    return { environment, profile, variant, flagEvaluation, observedFlags, remoteValues, outcome, error: { step, message: errorMessage(error) } };
  }
}
