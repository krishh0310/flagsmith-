import { strict as assert } from 'node:assert';
import { readdir, readFile, access } from 'node:fs/promises';
import type { RehearsalReport } from './rehearsal-results.ts';
import type { ExplorerReport } from './explorer.ts';

const root = 'rehearsal-runs';
const ids = (await readdir(root)).sort();
const pricing: RehearsalReport[] = [];
let explorer: ExplorerReport | undefined;
for (const id of ids) {
  if (!id.startsWith('run-') && !id.startsWith('explore-')) continue;
  const report = JSON.parse(await readFile(`${root}/${id}/report.json`, 'utf8'));
  if (report.journey === 'pricing') pricing.push(report);
  if (report.plan && report.cleanup.status === 'verified' && report.cases.length === 4 && report.exitCode === 1) {
    explorer = report;
  }
}
const [initial, repeated, broken, repaired] = pricing.slice(-4);
assert.deepEqual([initial.exitCode, repeated.exitCode, broken.exitCode, repaired.exitCode], [0, 0, 1, 0]);
const decisions = (report: RehearsalReport) => report.cases.map(item =>
  [item.environment, item.profile, item.remoteValues?.pricing_discount?.value]);
assert.deepEqual(decisions(initial), decisions(repeated));
const failedPrice = broken.cases.find(item => item.outcome === 'fail');
assert.equal(Number(failedPrice?.remoteValues?.pricing_discount?.value), 35);
assert.equal(failedPrice?.remoteValues?.pricing_discount?.renderedMinor, 65_000);
assert.ok(explorer);
assert.equal(explorer!.cases.filter(item => item.result.outcome === 'fail').length, 1);
const recovery = explorer!.investigations.find(item => item.flag === 'save_onboarding_progress' && item.status === 'recovered');
assert.equal(recovery?.attempt.result.observedFlags?.new_onboarding, true);
const failure = explorer!.cases.find(item => item.result.outcome === 'fail')!;
for (const artifact of [failure.result.evidence?.screenshot, failure.result.evidence?.trace]) {
  assert.ok(artifact);
  await access(`${root}/${explorer!.id}/${artifact}`);
}
console.log('Verified stable pricing assignments, ₹650 failure, and Explorer recovery and evidence.');
