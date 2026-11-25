import type { FlagExplanation } from './flag-explanation.ts';

export const environments = ['Current', 'Proposed'] as const;
export type Environment = typeof environments[number];
export type FlagEvaluation = { name: string; enabled: boolean; reason?: string; traits: Record<string, unknown> };

export type CaseResult = {
  environment: Environment;
  profile: string;
  variant: string | null;
  observedFlags?: Record<string, boolean>;
  flagEvaluation?: FlagEvaluation;
  outcome: 'pass' | 'fail' | 'setup-error';
  error?: { step: string; message: string };
  evidence?: { screenshot?: string; trace?: string; errors?: string[] };
};

export type RehearsalReport = {
  journey: string;
  startedAt: string;
  exitCode: number;
  status: string;
  cases: CaseResult[];
  comparisons: ReturnType<typeof compare>['profiles'];
  runErrors: string[];
  flagExplanation?: FlagExplanation;
};

export type RehearsalRun = { directory: string; report: RehearsalReport; terminal: string };

export function compare(cases: CaseResult[], profileIds: readonly string[]) {
  const profiles = profileIds.map((profile) => {
    const current = cases.find((item) => item.profile === profile && item.environment === 'Current');
    const proposed = cases.find((item) => item.profile === profile && item.environment === 'Proposed');
    const result = { profile, current: current?.outcome ?? null, proposed: proposed?.outcome ?? null };

    if (current?.outcome === 'fail') return { ...result, status: 'invalid-baseline' } as const;
    if (!current || !proposed || current.outcome === 'setup-error' || proposed.outcome === 'setup-error') {
      return { ...result, status: 'incomplete' } as const;
    }
    return { ...result, status: proposed.outcome === 'fail' ? 'regression' : 'pass' } as const;
  });

  const invalid = profiles.some(({ status }) => status === 'incomplete' || status === 'invalid-baseline');
  const regression = profiles.some(({ status }) => status === 'regression');
  const exitCode = invalid ? 2 : regression ? 1 : 0;
  return { exitCode, profiles };
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
