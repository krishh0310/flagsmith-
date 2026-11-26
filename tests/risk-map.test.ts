import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { riskCells, riskStatus } from '../scripts/risk-map.ts';
import type { CaseResult } from '../scripts/rehearsal-results.ts';

const baseline: CaseResult = { environment: 'Current', profile: 'team', variant: null, outcome: 'pass' };
const proposed: CaseResult = { ...baseline, environment: 'Proposed' };
test('distinguishes regressions, setup errors, invalid baselines and missing cases', () => {
  assert.equal(riskStatus(baseline, proposed), 'Pass');
  assert.equal(riskStatus(baseline, { ...proposed, outcome: 'fail' }), 'Regression');
  assert.equal(riskStatus({ ...baseline, outcome: 'fail' }, proposed), 'Baseline failure');
  assert.equal(riskStatus(baseline, { ...proposed, outcome: 'setup-error' }), 'Setup error');
  assert.equal(riskStatus(baseline), 'Untested');
});
test('legacy reports bind to Checkout and never substitute a different journey', () => {
  const report = { startedAt: '', status: '', exitCode: 2, cases: [baseline], comparisons: [], runErrors: [] };
  assert.equal(riskCells('checkout', report)[0].status, 'Untested');
  assert.throws(() => riskCells('onboarding', report), /different journey/);
});
