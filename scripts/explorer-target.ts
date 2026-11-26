import { createHash } from 'node:crypto';
import { loadEnv } from 'vite';

export type ExplorerOwner = { name: string; organisation: number; project: number; baseline: string; environment?: number; pid: number };
type Resource = { id: number; name: string };
type Project = Resource & { organisation: number };
type Environment = Resource & { api_key: string; project: number };
type FeatureState = { id: number; enabled: boolean; feature: number | { id: number; name: string } };

export async function connectExplorer() {
  const env = loadEnv('explorer', process.cwd(), 'FLAGSMITH_');
  const api = new URL(env.FLAGSMITH_API_URL);
  if (!['http://localhost', 'http://127.0.0.1'].includes(`${api.protocol}//${api.hostname}`) ||
      api.pathname !== '/api/v1/' || api.username || api.password || api.search || api.hash) {
    throw new Error('Explorer requires the bootstrapped HTTP loopback Flagsmith instance.');
  }
  const version = await fetch(new URL('/version/', api), { redirect: 'error', signal: AbortSignal.timeout(5000) });
  if (!version.ok || !(await version.json()).self_hosted_data?.has_users) throw new Error('Bootstrap self-hosted Flagsmith first.');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  async function request<T>(path: string, method = 'GET', data?: object, signal?: AbortSignal): Promise<T> {
    const response = await fetch(new URL(path, api), {
      method, headers, body: data && JSON.stringify(data), redirect: 'error',
      signal: AbortSignal.any([AbortSignal.timeout(5000), ...(signal ? [signal] : [])]),
    });
    if (!response.ok) throw new Error(`Flagsmith ${method} ${path.split('?')[0].replace(/environments\/[^/]+/, 'environments/[key]')} returned HTTP ${response.status}`);
    return response.status === 204 ? undefined as T : await response.json() as T;
  }
  async function list<T>(path: string): Promise<T[]> {
    const results: T[] = [];
    for (let page = 1; page <= 20; page++) {
      const items = await request<T[] | { results: T[]; next: string | null }>(
        `${path}${path.includes('?') ? '&' : '?'}page=${page}`);
      if (Array.isArray(items)) return items;
      results.push(...items.results);
      if (!items.next) return results;
    }
    throw new Error('Flagsmith listing exceeded the Explorer pagination limit.');
  }
  const { key } = await request<{ key: string }>('auth/login/', 'POST',
    { email: env.FLAGSMITH_ADMIN_EMAIL, password: env.FLAGSMITH_ADMIN_PASSWORD });
  if (!key) throw new Error('Flagsmith dashboard authentication failed.');
  headers.Authorization = `Token ${key}`;
  const org = (await list<Resource>('organisations/')).find(item => item.name === 'Toggle Wars');
  if (!org) throw new Error('The bootstrapped Toggle Wars organisation is missing.');
  const projects = () => list<Project>(`projects/?organisation=${org.id}`);
  const demo = (await projects()).find(item => item.name === 'Flag Rehearsal' && item.organisation === org.id);
  if (!demo) throw new Error('Run npm run setup:demo before Explorer.');
  const envs = (project: number) => list<Environment>(`environments/?project=${project}`);
  const demoEnvs = await envs(demo.id);
  const protectedKeys = [env.FLAGSMITH_CURRENT_ENVIRONMENT_KEY, env.FLAGSMITH_PROPOSED_ENVIRONMENT_KEY];
  if (!['Current', 'Proposed'].every((name, i) => demoEnvs.some(e => e.name === name && e.api_key === protectedKeys[i])) ||
      protectedKeys[0] === protectedKeys[1]) throw new Error('SDK keys do not match the bootstrapped Current and Proposed environments.');

  const baseline = createHash('sha256').update(protectedKeys[0]).digest('hex');
  async function owned(owner: ExplorerOwner) {
    if (owner.organisation !== org!.id || owner.project !== demo!.id || owner.baseline !== baseline ||
        !/^Flag Rehearsal Explorer [a-f0-9-]{36}$/.test(owner.name)) {
      throw new Error('Explorer ownership marker does not match the bootstrapped project.');
    }
    const matches = (await envs(owner.project)).filter(e => e.name === owner.name && e.project === owner.project);
    if (matches.length > 1 || matches.some(e => protectedKeys.includes(e.api_key) ||
        (owner.environment !== undefined && owner.environment !== e.id))) {
      throw new Error(`Cannot verify ownership of ${owner.name}.`);
    }
    return matches[0];
  }
  return {
    api: api.href, ownerScope: { organisation: org.id, project: demo.id, baseline },
    async create(owner: ExplorerOwner, flags: readonly string[], remember: () => Promise<void>, signal?: AbortSignal) {
      if (await owned(owner)) throw new Error('Explorer environment already exists.');
      const features = await list<Resource & { type: string }>(`projects/${owner.project}/features/`);
      if (!flags.every(name => features.some(f => f.name === name && f.type === 'STANDARD'))) {
        throw new Error('Required Boolean flags are missing. Rerun npm run setup:demo.');
      }
      signal?.throwIfAborted();
      const target = await request<Environment>('environments/', 'POST', { name: owner.name, project: owner.project });
      owner.environment = target.id;
      await remember();
      const states = await list<FeatureState>(`environments/${target.api_key}/featurestates/`);
      return {
        key: target.api_key,
        async apply(values: Record<string, boolean>, active: AbortSignal) {
          for (const [name, enabled] of Object.entries(values)) {
            const feature = features.find(f => f.name === name);
            const state = states.find(s => (typeof s.feature === 'number' ? s.feature : s.feature.id) === feature?.id);
            if (!state || !flags.includes(name)) throw new Error(`Unknown Explorer flag ${name}`);
            if ((await owned(owner))?.api_key !== target.api_key) throw new Error('Explorer environment verification failed.');
            active.throwIfAborted();
            await request(`environments/${target.api_key}/featurestates/${state.id}/`, 'PATCH', { enabled }, active);
          }
        },
      };
    },
    async dispose(owner: ExplorerOwner) {
      const target = await owned(owner);
      if (target) await request(`environments/${target.api_key}/`, 'DELETE');
      if (await owned(owner)) throw new Error(`Explorer environment remains after deletion: ${owner.name}`);
    },
  };
}
