import { isDeepStrictEqual } from 'node:util';
import { environments, type CaseResult, type Environment, type FlagEvaluation } from './rehearsal-results.ts';

export type Condition = { property: string; operator: string; value: string | null };
type Override = { id: number; name: string; priority: number; enabled: boolean; condition: Condition | null };
export type FlagSnapshot = Record<Environment, { defaultEnabled: boolean; overrides: Override[] }>;

type Decision = {
  enabled?: boolean;
  matching: Override[];
  winner?: number;
  verified: boolean;
};

export type ProfileExplanation = {
  profile: string;
  status: 'verified' | 'unverified';
  reason?: string;
  decisions: Record<Environment, Decision>;
};

export type FlagExplanation = {
  flag: string;
  rules?: FlagSnapshot;
  profiles: ProfileExplanation[];
};

function matches(condition: Condition | null, traits: FlagEvaluation['traits']): boolean | undefined {
  if (!condition || typeof condition.value !== 'string') return undefined;
  const value = traits[condition.property];
  if (condition.operator === 'EQUAL' && typeof value === 'string') return value === condition.value;
  if (condition.operator === 'LESS_THAN' && typeof value === 'number' && condition.value.trim()) {
    const limit = Number(condition.value);
    if (Number.isFinite(limit)) return value < limit;
  }
  return undefined;
}

export function explainFlag(
  flag: string,
  before: FlagSnapshot | undefined,
  after: FlagSnapshot | undefined,
  cases: readonly CaseResult[],
  ids: readonly string[],
): FlagExplanation {
  const stable = !!before && !!after && isDeepStrictEqual(before, after);

  function decide(profile: string, environment: Environment): Decision {
    const observed = cases.find((result) => result.profile === profile && result.environment === environment);
    const evaluation = observed?.flagEvaluation?.name === flag ? observed.flagEvaluation : undefined;
    const rules = before?.[environment];
    const matching: Override[] = [];
    if (!rules || !evaluation) return { enabled: evaluation?.enabled, matching, verified: false };
    const supported = rules.overrides.map((override) => matches(override.condition, evaluation.traits));
    matching.push(...rules.overrides.filter((_, index) => supported[index] === true));
    const first = matching[0];
    const enabled = first?.enabled ?? rules.defaultEnabled;
    const reason = first ? `TARGETING_MATCH; segment=${first.name}` : 'DEFAULT';
    const reasonAgrees = evaluation.reason === reason ||
      (rules.overrides.length === 0 && evaluation.reason === 'STATIC');
    const rendered = enabled ? 'Express' : 'Classic';
    const verified = stable && !supported.includes(undefined) &&
      evaluation.enabled === enabled && reasonAgrees && observed?.variant === rendered;
    return { enabled: evaluation.enabled, matching, winner: verified ? first?.id : undefined, verified };
  }

  const profiles = ids.map((profile): ProfileExplanation => {
    const decisions = { Current: decide(profile, 'Current'), Proposed: decide(profile, 'Proposed') };
    const verified = environments.every((environment) => decisions[environment].verified);
    return {
      profile, decisions, status: verified ? 'verified' : 'unverified',
      reason: verified ? undefined : !before || !after
        ? 'Could not read the Flagsmith rules before and after the run.'
        : !stable
          ? 'The Flagsmith rules changed during the run.'
          : 'The saved rules, Flagsmith evaluation reason, and rendered checkout could not all be confirmed.',
    };
  });
  return { flag, rules: before, profiles };
}
