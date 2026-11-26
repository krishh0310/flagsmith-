import { loadEnv } from 'vite';
import { environments, type Environment } from './rehearsal-results.ts';
import type { Condition, FlagSnapshot } from './flag-explanation.ts';
import { readDemoTargets } from './demo-config.ts';

type Rule = { type: string; conditions: Condition[]; rules: Rule[] };
type Segment = { id: number; name: string; rules: Rule[] };
type FlagState = {
  environment_default: { enabled: boolean; value?: { type: string; value: string } | null; variants?: { id: number; weight: number }[] };
  segment_overrides: { segment: { id: number }; priority: number; enabled: boolean }[];
};

type Detail = { id: number; name: string; multivariate_options?: { id: number; integer_value: number }[] };

async function withFlagConfiguration<T>(flag: string, resolve: (config: {
  feature: Detail; states: FlagState[]; project: string;
  read: <Result>(path: string) => Promise<Result>;
}) => Promise<T> | T): Promise<T | undefined> {
  try {
    const settings = loadEnv('production', process.cwd(), 'FLAGSMITH_');
    const origin = new URL(settings.FLAGSMITH_API_URL);
    if (origin.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(origin.hostname) ||
      origin.username || origin.password || !settings.FLAGSMITH_ADMIN_EMAIL || !settings.FLAGSMITH_ADMIN_PASSWORD) {
      return undefined;
    }
    const targets = readDemoTargets(process.cwd());
    const envKeys = Object.fromEntries(environments.map((name) => {
      const { api, environmentID } = targets[name];
      if (new URL(api).origin !== origin.origin || !environmentID) throw new Error('Different Flagsmith instance.');
      return [name, encodeURIComponent(environmentID)];
    })) as Record<Environment, string>;
    if (envKeys.Current === envKeys.Proposed) return undefined;

    async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
      const response = await fetch(new URL(path, origin), {
        ...options, signal: AbortSignal.timeout(3_000), redirect: 'error',
      });
      if (!response.ok) throw new Error('Flagsmith management request failed.');
      return (await response.json()) as T;
    }

    const { key } = await request<{ key?: string }>('/api/v1/auth/login/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: settings.FLAGSMITH_ADMIN_EMAIL, password: settings.FLAGSMITH_ADMIN_PASSWORD }),
    });
    if (!key) return undefined;
    const read = <T>(path: string) => request<T>(path, { headers: { Authorization: `Token ${key}` } });
    const [current, proposed] = await Promise.all(environments.map((name) =>
      read<{ name: string; project: number }>(`/api/v1/environments/${envKeys[name]}/`),
    ));
    if (current.name !== 'Current' || proposed.name !== 'Proposed' || current.project !== proposed.project) return undefined;

    const project = `/api/v1/projects/${current.project}`;
    let feature: Detail | undefined;
    for (let page = 1; !feature && page <= 20; page++) {
      const result = await read<{ results: Detail[]; next: string | null }>(
        `${project}/features/?page=${page}`,
      );
      feature = result.results.find(({ name }) => name === flag);
      if (!result.next) break;
    }
    if (!feature) return undefined;
    const states = await Promise.all(environments.map((name) =>
      read<FlagState>(`/api/__future__/environments/${envKeys[name]}/features/${feature.id}/`),
    ));
    return await resolve({ feature, states, project, read });
  } catch {
    return undefined;
  }
}

export async function readRemoteConfiguration(flag: string) {
  return withFlagConfiguration(flag, ({ feature, states }) => {
    if (states.some(state => state.segment_overrides.length)) return undefined;
    return Object.fromEntries(environments.map((name, index) => {
      const state = states[index].environment_default;
      return [name, { enabled: state.enabled, default: state.value,
        variants: state.variants?.map(({ id, weight }) => ({
          weight, value: feature.multivariate_options?.find(option => option.id === id)?.integer_value,
        })) }];
    }));
  });
}

export async function readFlagRules(flag: string): Promise<FlagSnapshot | undefined> {
  return withFlagConfiguration(flag, async ({ states, project, read }) => {
    const segmentIds = new Set(states.flatMap(({ segment_overrides }) => segment_overrides.map(({ segment }) => segment.id)));
    const segments = new Map(await Promise.all([...segmentIds].map(async (id) =>
      [id, await read<Segment>(`${project}/segments/${id}/`)] as const,
    )));

    function normalize(state: FlagState) {
      const { enabled: defaultEnabled } = state.environment_default;
      const overrides = state.segment_overrides.map(({ segment: { id }, priority, enabled }) => {
        const segment = segments.get(id);
        if (!segment) throw new Error('Missing rule definition.');
        const [rule] = segment.rules;
        const single = rule?.type === 'ALL' && segment.rules.length === 1 && !rule.rules.length && rule.conditions.length === 1
          ? rule.conditions[0] : null;
        const condition = single && { property: single.property, operator: single.operator, value: single.value };
        return { id, name: segment.name, priority, enabled, condition };
      }).sort((a, b) => a.priority - b.priority);
      if (typeof defaultEnabled !== 'boolean' || overrides.some(({ enabled, priority }) =>
        typeof enabled !== 'boolean' || !Number.isInteger(priority) || priority < 0) ||
        new Set(overrides.map(({ priority }) => priority)).size !== overrides.length ||
        new Set(overrides.map(({ name }) => name)).size !== overrides.length) {
        throw new Error('Unclear override priority.');
      }
      return { defaultEnabled, overrides };
    }

    return { Current: normalize(states[0]), Proposed: normalize(states[1]) };
  });
}
