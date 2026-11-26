import { randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium, type Browser } from '@playwright/test';
import { journeys } from '../rehearsal.config.ts';
import { connectExplorer, type ExplorerOwner } from './explorer-target.ts';
import { explorerLimits, planCombinations, type BooleanFlags } from './explorer-plan.ts';
import { rehearseCase } from './rehearsal.ts';
import { errorMessage, type CaseResult } from './rehearsal-results.ts';

export type ExplorerInput = { journey: string; profiles: string[]; flags: string[]; limit?: number };
type ExplorerCase = { id: string; configured: BooleanFlags; result: CaseResult };
type Investigation = { parent: string; flag?: string; status: 'reproduced' | 'recovered' | 'still failing' | 'flaky' | 'inconclusive'; attempt: ExplorerCase };
export type ExplorerReport = {
  id: string; input: ExplorerInput; plan: ReturnType<typeof planCombinations>;
  cases: ExplorerCase[]; investigations: Investigation[]; errors: string[];
  cleanup: { status: 'pending' | 'verified' | 'failed'; resource: string };
  exitCode: number;
};

const output = 'rehearsal-runs';
export function explorerOptions() {
  return Object.entries(journeys).flatMap(([id, registration]) => registration.explorer ? [{
    id, name: registration.name ?? id, profiles: registration.identities.map(profile => profile.id),
    flags: registration.explorer.flags,
  }] : []);
}
export function explorerPlan(input: unknown) {
  if (!input || typeof input !== 'object') throw new Error('Choose a registered journey, profiles, and Boolean flags.');
  const { journey, profiles, flags, limit } = input as ExplorerInput;
  const option = explorerOptions().find(({ id }) => id === journey);
  if (!option || !Array.isArray(profiles) || !profiles.length || new Set(profiles).size !== profiles.length ||
      profiles.some(p => !option.profiles.includes(p)) || !Array.isArray(flags) ||
      flags.some(f => !option.flags.includes(f))) throw new Error('Select only Explorer-enabled journeys and their registered profiles and flags.');
  return planCombinations(flags, profiles.length, limit);
}

async function save(path: string, data: object) {
  await writeFile(path + '.tmp', JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  await rename(path + '.tmp', path);
}

export function matchesFlags(configured: BooleanFlags, observed?: BooleanFlags) {
  return !!observed && Object.entries(configured).every(([name, value]) => observed[name] === value);
}
export function sameObservedFlags(before: BooleanFlags | undefined, after: BooleanFlags | undefined, change?: string) {
  if (!before || !after) return false;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].every(name => typeof before[name] === 'boolean' && typeof after[name] === 'boolean' &&
    (name === change ? before[name] !== after[name] : before[name] === after[name]));
}

export async function recoverExplorer() {
  const entries = await readdir(output).catch((failure: NodeJS.ErrnoException) => {
    if (failure.code === 'ENOENT') return [];
    throw failure;
  });
  for (const id of entries.filter(name => /^explore-[a-f0-9-]{36}$/.test(name))) {
    const dir = join(output, id);
    const owner = await readFile(join(dir, 'owner.json'), 'utf8')
      .then(data => JSON.parse(data) as ExplorerOwner, (failure: NodeJS.ErrnoException) => {
        if (failure.code === 'ENOENT') return undefined;
        throw failure;
      });
    if (!owner) continue;
    const report = JSON.parse(await readFile(join(dir, 'report.json'), 'utf8')) as ExplorerReport;
    if (report.cleanup.status === 'verified') continue;
    if (owner.name !== 'Flag Rehearsal Explorer ' + id.slice(8) || !Number.isInteger(owner.pid) || owner.pid < 1) {
      throw new Error(`Invalid ownership journal: ${dir}`);
    }
    try { process.kill(owner.pid, 0); continue; }
    catch (failure) { if ((failure as NodeJS.ErrnoException).code !== 'ESRCH') continue; }
    const client = await connectExplorer();
    try {
      await client.dispose(owner);
      report.cleanup.status = 'verified';
      report.errors.push('Recovered an interrupted run. Cases may be incomplete.');
    } catch (failure) {
      report.cleanup.status = 'failed';
      report.errors.push(`Recovery ${owner.name}: ${errorMessage(failure)}`);
      await save(join(dir, 'report.json'), report);
      throw failure;
    }
    report.exitCode = 2;
    await save(join(dir, 'report.json'), report);
  }
}

export async function runExplorer(input: ExplorerInput, signal?: AbortSignal): Promise<ExplorerReport> {
  const plan = explorerPlan(input);
  const registration = journeys[input.journey];
  const adapter = registration.explorer!;
  await recoverExplorer();
  const uuid = randomUUID();
  const id = 'explore-' + uuid;
  const directory = join(output, id);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const file = join(directory, 'report.json');
  const resource = 'Flag Rehearsal Explorer ' + uuid;
  const report: ExplorerReport = {
    id, input: { journey: input.journey, flags: input.flags, profiles: input.profiles, limit: input.limit },
    plan, cases: [], investigations: [], errors: [], cleanup: { status: 'pending', resource }, exitCode: 2,
  };
  const deadline = AbortSignal.timeout(explorerLimits.runtimeMs);
  const active = signal ? AbortSignal.any([signal, deadline]) : deadline;
  let browser: Browser | undefined;
  let app: Awaited<ReturnType<typeof adapter.start>> | undefined;
  let dispose: (() => Promise<void>) | undefined;
  try {
    await save(file, report);
    active.throwIfAborted();
    const client = await connectExplorer();
    const owner: ExplorerOwner = { name: resource, ...client.ownerScope, pid: process.pid };
    const remember = () => save(join(directory, 'owner.json'), owner);
    await remember();
    dispose = () => client.dispose(owner);
    const target = await client.create(owner, adapter.flags, remember, active);
    active.throwIfAborted();
    app = await adapter.start({ api: client.api, environmentID: target.key });
    browser = await chromium.launch({ timeout: 10_000 });
    let next = 0;
    let browserAttempts = 0;
    async function evaluate(configured: BooleanFlags, profile: string, changes = configured): Promise<ExplorerCase> {
      active.throwIfAborted();
      const caseId = 'case-' + (++next);
      await target.apply(changes, active);
      const identity = registration.identities.find(item => item.id === profile)!;
      let result: CaseResult | undefined;
      for (let attempt = 1; attempt <= explorerLimits.attempts; attempt++) {
        active.throwIfAborted();
        if (++browserAttempts > explorerLimits.totalBrowserAttempts) throw new Error('Explorer browser-attempt limit reached.');
        result = await rehearseCase(browser!, app!.url, 'Proposed', identity, registration.run,
          directory, report.errors, `${caseId}-attempt-${attempt}`, active);
        active.throwIfAborted();
        if (matchesFlags(configured, result.observedFlags)) return { id: caseId, configured, result };
        if (attempt < explorerLimits.attempts) await new Promise(resolve => setTimeout(resolve, 350));
      }
      return {
        id: caseId, configured, result: {
          ...result!, outcome: 'setup-error',
          error: { step: 'Verify SDK observations', message: 'Configured flags did not match the observed SDK values.' },
        },
      };
    }
    const defaults = Object.fromEntries(adapter.flags.map(flag => [flag, false]));
    for (const values of plan.combinations) {
      for (const profile of input.profiles) {
        report.cases.push(await evaluate({ ...defaults, ...values }, profile));
        await save(file, report);
      }
    }

    for (const parent of report.cases.filter(item => item.result.outcome === 'fail')) {
      if (report.investigations.length >= explorerLimits.investigations) break;
      const attempt = await evaluate(parent.configured, parent.result.profile);
      const comparable = sameObservedFlags(parent.result.observedFlags, attempt.result.observedFlags);
      const reproduced = comparable && attempt.result.outcome === 'fail' &&
        attempt.result.error?.step === parent.result.error?.step &&
        attempt.result.error?.message === parent.result.error?.message;
      report.investigations.push({ parent: parent.id, attempt,
        status: reproduced ? 'reproduced' : comparable && attempt.result.outcome === 'pass' ? 'flaky' : 'inconclusive' });
      await save(file, report);
      if (!reproduced) continue;
      for (const flag of input.flags) {
        if (report.investigations.length >= explorerLimits.investigations) break;
        const changes = { [flag]: !parent.configured[flag] };
        await target.apply(parent.configured, active);
        const changed = await evaluate({ ...parent.configured, ...changes }, parent.result.profile, changes);
        const verified = sameObservedFlags(parent.result.observedFlags, changed.result.observedFlags, flag);
        report.investigations.push({ parent: parent.id, flag, attempt: changed,
          status: !verified || changed.result.outcome === 'setup-error' ? 'inconclusive'
            : changed.result.outcome === 'pass' ? 'recovered' : 'still failing' });
        await save(file, report);
      }
    }
    report.exitCode = report.errors.length || report.cases.some(item => item.result.outcome === 'setup-error') ? 2
      : report.cases.some(item => item.result.outcome === 'fail') ? 1 : 0;
  } catch (failure) {
    report.errors.push(errorMessage(failure));
  } finally {
    for (const close of [browser && (() => browser!.close()), app && (() => app!.close())]) {
      if (close) await close().catch(failure => { report.exitCode = 2; report.errors.push(errorMessage(failure)); });
    }
    try {
      await dispose?.();
      report.cleanup.status = 'verified';
    } catch (failure) {
      report.exitCode = 2;
      report.cleanup.status = 'failed';
      report.errors.push(`Cleanup ${resource}: ${errorMessage(failure)}`);
    }
    await save(file, report);
  }
  return report;
}
