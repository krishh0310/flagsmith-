import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { chromium } from '@playwright/test';
import { journeys } from '../rehearsal.config.ts';
import { runRehearsal } from './rehearsal.ts';

const output = await mkdir(`rehearsal-runs/benchmark-${Date.now()}`, { recursive: true });
if (!output) throw new Error('Could not create the benchmark output.');
const identities = journeys.checkout.identities;
const results: object[] = [];

async function checklist(trial: number) {
  const start = performance.now();
  const browser = await chromium.launch();
  const cases = [];
  try {
    for (const [environment, port] of [['Current', 4173], ['Proposed', 4174]] as const) {
      for (const { id } of identities) {
        const context = await browser.newContext();
        await context.tracing.start({ screenshots: true, snapshots: true });
        try {
          const page = await context.newPage();
          await page.goto(`http://127.0.0.1:${port}`);
          await page.getByLabel('Customer profile').selectOption(id);
          const heading = page.getByRole('heading', { name: /^(Express|Classic) checkout$/ });
          const variant = await heading.innerText();
          await page.getByRole('button', { name: 'Continue to review' }).click();
          if (variant === 'Express checkout') await page.getByRole('button', { name: 'Verify Express session' }).click();
          if (await page.getByRole('alert').isVisible()) {
            const path = `${output}/checklist-${trial}-${environment}-${id}`;
            await page.screenshot({ path: path + '.png' });
            await context.tracing.stop({ path: path + '.zip' });
            cases.push({ environment, id, variant, outcome: 'fail', evidence: path });
          } else {
            await page.getByRole('button', { name: 'Place demo order' }).click();
            await page.getByRole('heading', { name: 'Order confirmed' }).waitFor();
            cases.push({ environment, id, variant, outcome: 'pass' });
          }
        } finally { await context.close(); }
      }
    }
  } finally { await browser.close(); }
  if (cases.filter(item => item.outcome === 'fail').map(item => `${item.environment}/${item.id}`).join() !== 'Proposed/paid-older') {
    throw new Error('The checklist did not see the seeded regression. Select the broken checkout order.');
  }
  results.push({ trial, mode: 'scripted browser checklist', elapsedMs: Math.round(performance.now() - start), cases });
}
async function rehearsal(trial: number) {
  const start = performance.now();
  const run = await runRehearsal('checkout', journeys.checkout);
  if (run.report.exitCode !== 1 || run.report.comparisons.filter(item => item.status === 'regression').map(item => item.profile).join() !== 'paid-older') {
    throw new Error('Rehearsal did not identify the seeded checkout regression.');
  }
  results.push({ trial, mode: 'rehearsal', elapsedMs: Math.round(performance.now() - start), report: run.directory });
}
for (let trial = 1; trial <= 3; trial++) {
  if (trial % 2) { await checklist(trial); await rehearsal(trial); }
  else { await rehearsal(trial); await checklist(trial); }
  await writeFile(output + '/measurements.json', JSON.stringify(results, null, 2) + '\n');
}
console.log(output + '/measurements.json');
