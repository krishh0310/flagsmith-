import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { chromium, type Browser, type BrowserContext } from '@playwright/test';
import { build, preview, type PreviewServer } from 'vite';
import { executeJourney, type Identity, type JourneyRegistration } from './journey.ts';
import { explainFlag as buildExplanation } from './flag-explanation.ts';
import { readFlagRules, readRemoteConfiguration } from './read-flag-rules.ts';
import { compare, environments, errorMessage, type CaseResult, type Environment, type RehearsalRun } from './rehearsal-results.ts';

export async function rehearseCase(
  browser: Browser,
  url: string,
  environment: Environment,
  identity: Identity,
  run: JourneyRegistration['run'],
  directory: string,
  runErrors: string[],
  evidencePrefix = environment.toLowerCase(),
  signal?: AbortSignal,
): Promise<CaseResult> {
  let context: BrowserContext | undefined;
  const profile = identity.id;
  const abort = () => { void context?.close().catch(() => {}); };
  signal?.addEventListener('abort', abort, { once: true });

  try {
    context = await browser.newContext();
    signal?.throwIfAborted();
    await context.tracing.start({ screenshots: true, snapshots: true });
    const page = await context.newPage();
    const result = await executeJourney(run, page, url, environment, identity);

    if (result.outcome === 'fail') {
      const file = `${evidencePrefix}-${profile}`;
      const screenshot = `${file}.png`;
      const trace = `${file}.zip`;
      result.evidence = {};
      const evidenceErrors: string[] = [];
      try {
        await page.screenshot({ path: join(directory, screenshot), timeout: 3_000 });
        result.evidence.screenshot = screenshot;
      } catch (error) {
        evidenceErrors.push(`Screenshot: ${errorMessage(error)}`);
      }
      try {
        await context.tracing.stop({ path: join(directory, trace) });
        result.evidence.trace = trace;
      } catch (error) {
        evidenceErrors.push(`Trace: ${errorMessage(error)}`);
      }
      if (evidenceErrors.length) result.evidence.errors = evidenceErrors;
    } else {
      await context.tracing.stop().catch((error) => {
        runErrors.push(`${environment} / ${profile}: stopping trace failed. ${errorMessage(error)}`);
      });
    }
    return result;
  } catch (error) {
    return {
      environment, profile, variant: null, outcome: 'setup-error',
      error: { step: 'Prepare browser context', message: errorMessage(error) },
    };
  } finally {
    signal?.removeEventListener('abort', abort);
    await context?.close().catch((error) => {
      runErrors.push(`${environment} / ${profile}: closing context failed. ${errorMessage(error)}`);
    });
  }
}

export async function runRehearsal(journey: string, registration: JourneyRegistration): Promise<RehearsalRun> {
  const { identities, urls, run, explainFlag } = registration;
  const profileIds = identities.map(({ id }) => id);
  const startedAt = new Date().toISOString();
  const output = 'rehearsal-runs';
  await mkdir(output, { recursive: true });
  const directory = await mkdtemp(join(output, `run-${startedAt.replace(/[:.]/g, '-')}-`));
  const cases: CaseResult[] = [];
  const runErrors: string[] = [];
  let browser: Browser | undefined;
  let step = 'Validate journey registration';
  const before = explainFlag && !urls ? await readFlagRules(explainFlag) : undefined;

  const remoteNames = urls ? [] : registration.remoteValueNames ?? [];
  const readRemote = () => Promise.all(remoteNames.map(name => readRemoteConfiguration(name)));
  const remoteBefore = await readRemote();

  try {
    if (
      profileIds.length === 0 || new Set(profileIds).size !== profileIds.length ||
      profileIds.some((id) => !/^[a-z0-9][a-z0-9-]{0,63}$/.test(id))
    ) {
      throw new Error('Register at least one unique identity ID with 1–64 lowercase letters, digits or hyphens.');
    }
    if (!urls) {
      step = 'Build demo';
      await build({ logLevel: 'warn' });
    }
    step = 'Launch Chromium';
    browser = await chromium.launch();

    for (const environment of environments) {
      let server: PreviewServer | undefined;
      try {
        let url;
        if (urls) {
          const target = new URL(urls[environment]);
          if (target.protocol !== 'http:' && target.protocol !== 'https:') {
            throw new Error('Use an HTTP or HTTPS target URL.');
          }
          url = target.href;
        } else {
          server = await preview({
            logLevel: 'warn',
            mode: environment.toLowerCase(),
            preview: { host: '127.0.0.1', port: 0, strictPort: true },
          });
          const address = server.httpServer.address();
          if (!address || typeof address === 'string') throw new Error('Preview has no HTTP port.');
          url = new URL(registration.targetPath ?? '/', `http://127.0.0.1:${address.port}/`).href;
        }
        for (const identity of identities) {
          cases.push(await rehearseCase(browser, url, environment, identity, run, directory, runErrors));
        }
      } catch (error) {
        for (const profile of profileIds) {
          if (!cases.some((item) => item.environment === environment && item.profile === profile)) {
            cases.push({
              environment, profile, variant: null, outcome: 'setup-error',
              error: { step: 'Resolve target application', message: errorMessage(error) },
            });
          }
        }
      } finally {
        await server?.close().catch((error) => {
          runErrors.push(`Closing ${environment} preview failed. ${errorMessage(error)}`);
        });
      }
    }
  } catch (error) {
    const message = errorMessage(error);
    runErrors.push(`${step}: ${message}`);
    for (const environment of environments) {
      for (const profile of profileIds) {
        cases.push({ environment, profile, variant: null, outcome: 'setup-error', error: { step, message } });
      }
    }
  } finally {
    await browser?.close().catch((error) => {
      runErrors.push(`Closing Chromium failed. ${errorMessage(error)}`);
    });
  }

  const comparison = compare(cases, profileIds);
  const exitCode = runErrors.length ? 2 : comparison.exitCode;
  const reportPath = join(directory, 'report.json');
  const status = exitCode === 0 ? 'all cases passed' : exitCode === 1 ? 'regression detected' : 'invalid comparison';
  const summary = [`Flag Rehearsal: ${journey}`];

  for (const environment of environments) {
    const observed = cases.filter((item) => item.environment === environment);
    summary.push(`${environment}: ${observed.filter(({ outcome }) => outcome === 'pass').length}/${profileIds.length} passed`);
    for (const { profile, variant, outcome, error, evidence } of observed) {
      summary.push(`  ${profile} | ${variant ?? 'unknown'} | ${outcome}`);
      if (error) summary.push(`    ${error.step}: ${error.message.split('\n')[0]}`);
      for (const path of [evidence?.screenshot, evidence?.trace]) {
        if (path) summary.push(`    ${join(directory, path)}`);
      }
      for (const message of evidence?.errors ?? []) summary.push(`    ${message}`);
    }
  }
  for (const { profile, status } of comparison.profiles) {
    if (status !== 'pass') summary.push(`Comparison ${profile}: ${status}`);
  }
  for (const message of runErrors) summary.push(`Run error: ${message}`);
  summary.push(`Result: ${status} (exit ${exitCode})`, `Report: ${relative(process.cwd(), reportPath)}`);
  const terminal = summary.join('\n') + '\n';
  const after = explainFlag && before ? await readFlagRules(explainFlag) : undefined;
  const flagExplanation = explainFlag ? buildExplanation(explainFlag, before, after, cases, profileIds) : undefined;
  const remoteAfter = await readRemote();
  const remoteConfigurations = Object.fromEntries(remoteNames.flatMap((name, index) => {
    const value = remoteBefore[index];
    return value && JSON.stringify(value) === JSON.stringify(remoteAfter[index]) ? [[name, value]] : [];
  }));
  const report = { journey, journeyName: registration.name, flagNames: registration.flagNames, remoteValueNames: registration.remoteValueNames, remoteConfigurations: remoteNames.length ? remoteConfigurations : undefined, startedAt, exitCode, status, cases, comparisons: comparison.profiles, runErrors, flagExplanation };
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  await writeFile(join(directory, 'summary.txt'), terminal);
  return { directory, report, terminal };
}
