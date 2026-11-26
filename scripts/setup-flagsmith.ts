import { readFile, writeFile } from 'node:fs/promises';

const api = new URL(process.env.FLAGSMITH_API_URL || 'http://localhost:8000/api/v1/');
if (api.protocol !== 'http:' || !['localhost', '127.0.0.1'].includes(api.hostname) || api.username || api.password) {
  throw new Error('Set FLAGSMITH_API_URL to this demo’s HTTP loopback endpoint.');
}
const { origin } = api;
const organisationName = 'Toggle Wars';
const projectName = 'Flag Rehearsal';
const environmentNames = ['Current', 'Proposed'];

type Resource = { id: number; name: string };
type Environment = Resource & { api_key: string };
type Page<T> = { results: T[]; next: string | null };
type Condition = { property: string; operator: string; value: string };
type Segment = Resource & { rules: { type: string; rules: unknown[]; conditions: Condition[] }[] };
type Override = { priority: number; segment: { id: number }; enabled: boolean };
type FlagState = { environment_default: { enabled: boolean }; segment_overrides: Override[] };

async function request<T>(path: string, label: string, options: RequestInit = {}): Promise<T> {
  let response;
  try {
    response = await fetch(`${origin}${path}`, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new Error(`${label} could not reach Flagsmith at ${origin}. Check that Docker Compose is healthy.`);
  }
  if (!response.ok) {
    throw new Error(`${label} failed (HTTP ${response.status}).`);
  }
  return (await response.json()) as T;
}

async function setup() {
  const order = process.argv[2];
  if (order !== undefined && order !== 'broken' && order !== 'fixed' && order !== 'onboarding-broken' && order !== 'onboarding-fixed' && order !== 'pricing-broken' && order !== 'pricing-fixed') {
    throw new Error('Usage: npm run setup:flagsmith -- [broken | fixed | onboarding-broken | onboarding-fixed | pricing-broken | pricing-fixed]');
  }
  const email = process.env.FLAGSMITH_ADMIN_EMAIL;
  const password = process.env.FLAGSMITH_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('Set FLAGSMITH_ADMIN_EMAIL and FLAGSMITH_ADMIN_PASSWORD in .env.');
  }

  const version = await request<{ self_hosted_data?: { has_users: boolean } }>(
    '/version/',
    'Check initial setup',
  );
  const hasUsers = version.self_hosted_data?.has_users;
  if (typeof hasUsers !== 'boolean') {
    throw new Error('Flagsmith did not report its self-hosted setup status.');
  }

  const credentials = hasUsers
    ? { email, password }
    : {
        email,
        password,
        re_password: password,
        first_name: 'Local',
        last_name: 'Admin',
        superuser: true,
      };
  const { key } = await request<{ key?: string }>(
    hasUsers ? '/api/v1/auth/login/' : '/api/v1/auth/users/',
    hasUsers ? 'Sign in with the local .env credentials' : 'Create the local admin',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    },
  );
  if (!key) {
    throw new Error('Flagsmith did not return a dashboard authentication token.');
  }

  const headers = { Authorization: `Token ${key}`, 'Content-Type': 'application/json' };
  const create = <T>(path: string, label: string, body: object) =>
    request<T>(`/api/v1/${path}`, label, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

  async function list<T>(path: string, label: string): Promise<T[]> {
    const results: T[] = [];
    const separator = path.includes('?') ? '&' : '?';
    for (let page = 1; ; page++) {
      const data = await request<T[] | Page<T>>(
        `/api/v1/${path}${separator}page=${page}`,
        label,
        { headers },
      );
      if (Array.isArray(data)) return data;
      results.push(...data.results);
      if (!data.next) return results;
    }
  }

  const organisations = await list<Resource>('organisations/', 'List organisations');
  const organisation =
    organisations.find(({ name }) => name === organisationName) ??
    (await create<Resource>('organisations/', 'Create Toggle Wars', { name: organisationName }));

  const projects = await list<Resource>(
    `projects/?organisation=${organisation.id}`,
    'List projects',
  );
  const project =
    projects.find(({ name }) => name === projectName) ??
    (await create<Resource>('projects/', 'Create Flag Rehearsal', {
      name: projectName,
      organisation: organisation.id,
    }));

  const environmentsPath = `environments/?project=${project.id}`;
  const environments = await list<Environment>(environmentsPath, 'List project environments');
  for (const name of environmentNames) {
    if (!environments.some((environment) => environment.name === name)) {
      await create<Environment>('environments/', `Create ${name}`, { name, project: project.id });
    }
  }

  const verified = await list<Environment>(environmentsPath, 'Verify project environments');
  const keys = new Set<string>();
  const sdkKeys = new Map<string, string>();
  for (const name of environmentNames) {
    const environment = verified.find((candidate) => candidate.name === name);
    if (!environment?.api_key || keys.has(environment.api_key)) {
      throw new Error(`Expected a distinct SDK key for ${name}.`);
    }
    keys.add(environment.api_key);
    if (!/^[A-Za-z0-9_-]+$/.test(environment.api_key)) throw new Error(`Invalid SDK key format for ${name}.`);
    sdkKeys.set(`FLAGSMITH_${name.toUpperCase()}_ENVIRONMENT_KEY`, environment.api_key);
    await request('/api/v1/flags/', `Check the ${name} SDK endpoint`, {
      headers: { 'X-Environment-Key': environment.api_key },
    });
    console.log(`${projectName} / ${name}: SDK endpoint verified`);
  }

  if (order) {
    const projectPath = `projects/${project.id}/`;
    const flags = await list<Resource>(projectPath + 'features/', 'List demo flags');
    const ensureFlag = async (flagName: string) => {
      const existing = flags.find(({ name }) => name === flagName);
      if (existing) return existing;
      const feature = await create<Resource>(projectPath + 'features/', `Create ${flagName}`, {
        name: flagName, type: 'STANDARD', default_enabled: false,
      });
      flags.push(feature);
      return feature;
    };
    for (const name of ['new_onboarding', 'save_onboarding_progress', 'show_onboarding_tips']) {
      await ensureFlag(name);
    }
    const existing = await list<Segment>(projectPath + 'segments/', 'List demo segments');
    const definitions = [
      { name: 'Paid plan', property: 'plan', operator: 'EQUAL', value: 'paid', enabled: true },
      { name: 'Older app version', property: 'app_version', operator: 'LESS_THAN', value: '2', enabled: false },
    ];
    if (order === 'fixed') definitions.reverse();
    const overrides: Override[] = [];
    for (const [priority, { name, property, operator, value, enabled }] of definitions.entries()) {
      const segment = existing.find((item) => item.name === name) ??
        await create<Segment>(projectPath + 'segments/', `Create ${name}`, {
          name, project: project.id, rules: [{ type: 'ALL', rules: [], conditions: [{ property, operator, value }] }],
        });
      const [rule] = segment.rules;
      const condition = rule?.conditions[0];
      if (
        segment.rules.length !== 1 || rule.type !== 'ALL' || rule.rules.length || rule.conditions.length !== 1 ||
        condition.property !== property || condition.operator !== operator || String(condition.value) !== value
      ) {
        throw new Error(`The existing ${name} segment differs from the demo definition. Check it in Flagsmith.`);
      }
      overrides.push({ priority, segment: { id: segment.id }, enabled });
    }

    if (order.startsWith('pricing-')) {
      const expectedOptions = [
        { type: 'int', integer_value: 10, default_percentage_allocation: 30 },
        { type: 'int', integer_value: 20, default_percentage_allocation: 20 },
      ];
      type Variant = { id: number; integer_value: number; default_percentage_allocation: number };
      type PricingFeature = Resource & { type: string; multivariate_options: Variant[] };
      const path = projectPath + 'features/';
      const existing = (flags as PricingFeature[]).find(item => item.name === 'pricing_discount');
      const feature = existing ?? await create<PricingFeature>(path, 'Create pricing_discount', {
        name: 'pricing_discount', type: 'MULTIVARIATE', default_enabled: true,
        initial_value: '0', multivariate_options: expectedOptions,
      });
      if (feature.type !== 'MULTIVARIATE' || feature.multivariate_options.length !== 2 ||
          !expectedOptions.every(option => feature.multivariate_options.some(variant =>
            variant.integer_value === option.integer_value &&
            Number(variant.default_percentage_allocation) === option.default_percentage_allocation))) {
        throw new Error('pricing_discount has unexpected variants or allocation.');
      }
      for (const name of environmentNames) {
        const value = name === 'Proposed' && order === 'pricing-broken' ? '35' : '0';
        const path = `/api/__future__/environments/${sdkKeys.get(`FLAGSMITH_${name.toUpperCase()}_ENVIRONMENT_KEY`)}/features/${feature.id}/`;
        const controls = { enabled: true, value: { type: 'integer', value },
          variants: feature.multivariate_options.map(({ id, default_percentage_allocation }) =>
            ({ id, weight: Number(default_percentage_allocation) })) };
        const existingState = await request<FlagState>(path, `Read ${name} pricing flag`, { headers });
        if (existingState.segment_overrides.length) throw new Error('Remove unrelated pricing overrides before seeding the demo.');
        const saved = await request<{ environment_default: typeof controls }>(path, `Save ${name} pricing flag`, {
          method: 'PATCH', headers, body: JSON.stringify({ environment_default: controls }),
        });
        if (saved.environment_default.value.value !== value ||
            !controls.variants.every(variant => saved.environment_default.variants.some(item =>
              item.id === variant.id && item.weight === variant.weight))) throw Error('Pricing configuration did not round trip.');
        console.log(`${name}: default discount ${value}% (50%), variants 10% (30%) and 20% (20%).`);
      }
    } else if (order.startsWith('onboarding-')) {
      const [paid, older] = overrides;
      for (const flagName of ['new_onboarding', 'save_onboarding_progress']) {
        const feature = await ensureFlag(flagName);
        for (const name of environmentNames) {
          const proposed = name === 'Proposed';
          const matches = flagName === 'new_onboarding'
            ? (proposed ? [paid] : [])
            : (proposed && order === 'onboarding-fixed' ? [older, paid] : [older]);
          const path = `/api/__future__/environments/${sdkKeys.get(`FLAGSMITH_${name.toUpperCase()}_ENVIRONMENT_KEY`)}/features/${feature.id}/`;
          await request(path, `Set ${name} ${flagName}`, {
            method: 'PATCH', headers, body: JSON.stringify({
              environment_default: { enabled: false },
              segment_overrides: matches.map(({ segment }, priority) => ({ segment, priority, enabled: true })),
            }),
          });
        }
      }
    } else {
      const flag = await ensureFlag('express_checkout');
      const flagPath = (name: string) =>
        `/api/__future__/environments/${sdkKeys.get(`FLAGSMITH_${name}_ENVIRONMENT_KEY`)}/features/${flag.id}/`;
      const current = await request<FlagState>(flagPath('CURRENT'), 'Read Current flag', { headers });
      if (current.environment_default.enabled || current.segment_overrides.length) {
        throw new Error('Current differs from the demo baseline. Check its default and overrides in Flagsmith.');
      }
      const path = flagPath('PROPOSED');
      const proposed = await request<FlagState>(path, 'Read Proposed flag', { headers });
      if (proposed.segment_overrides.some(({ segment }) => !overrides.some((item) => item.segment.id === segment.id))) {
        throw new Error('Proposed contains an unrelated override. Review it in Flagsmith.');
      }
      const saved = await request<FlagState>(path, 'Save Proposed demo rules', {
        method: 'PATCH', headers,
        body: JSON.stringify({ environment_default: { enabled: false }, segment_overrides: overrides }),
      });
      if (
        saved.environment_default.enabled || saved.segment_overrides.length !== overrides.length ||
        saved.segment_overrides.some((item, index) =>
          item.priority !== overrides[index].priority || item.enabled !== overrides[index].enabled ||
          item.segment.id !== overrides[index].segment.id)
      ) {
        throw new Error('Flagsmith did not return the requested override order.');
      }
      console.log(`Proposed ${order} order: ${definitions.map(({ name }) => name).join(' → ')}`);
    }
  }

  let config = await readFile('.env', 'utf8');
  for (const [name, value] of sdkKeys) {
    const line = new RegExp(`^${name}=.*$`, 'm');
    config = line.test(config) ? config.replace(line, `${name}=${value}`) : `${config.trimEnd()}\n${name}=${value}\n`;
  }
  await writeFile('.env', config, { mode: 0o600 });
  console.log('Saved both client-side SDK keys to .env.');
}

setup().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
