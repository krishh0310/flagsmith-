import assert from 'node:assert/strict';
import { test } from 'node:test';
import { explainFlag, type FlagSnapshot } from '../scripts/flag-explanation.ts';
import type { CaseResult } from '../scripts/rehearsal-results.ts';

const paid = { id: 1, name: 'Paid plan', priority: 0, enabled: true, condition: { property: 'plan', operator: 'EQUAL', value: 'paid' } };
const older = { id: 2, name: 'Older app version', priority: 1, enabled: false, condition: { property: 'app_version', operator: 'LESS_THAN', value: '2' } };
const snapshot: FlagSnapshot = { Current: { defaultEnabled: false, overrides: [] }, Proposed: { defaultEnabled: false, overrides: [paid, older] } };
const traits = { plan: 'paid', app_version: 1 };
const name = 'express_checkout';
const cases: CaseResult[] = [
  { environment: 'Current', profile: 'paid-older', variant: 'Classic', outcome: 'pass', flagEvaluation: { name, enabled: false, reason: 'STATIC', traits } },
  { environment: 'Proposed', profile: 'paid-older', variant: 'Express', outcome: 'fail', flagEvaluation: { name, enabled: true, reason: 'TARGETING_MATCH; segment=Paid plan', traits } },
];

test('explains overlapping rules in saved priority order only when the SDK and rendered checkout agree', () => {
  const decision = explainFlag('express_checkout', snapshot, structuredClone(snapshot), cases, ['paid-older']).profiles[0];
  assert.equal(decision.status, 'verified');
  assert.deepEqual(decision.decisions.Proposed.matching.map(({ name, priority }) => [name, priority]), [['Paid plan', 0], ['Older app version', 1]]);
  assert.equal(decision.decisions.Proposed.winner, 1);
  assert.equal(decision.decisions.Current.enabled, false);
});

test('keeps observed results when the cause cannot be verified', () => {
  const changed = structuredClone(snapshot);
  changed.Proposed.overrides[0].priority = 2;
  const sdkDisagrees = { ...cases[1], flagEvaluation: { name, enabled: true, reason: 'IDENTITY_OVERRIDE', traits } };
  const renderedDisagrees = { ...cases[1], variant: 'Classic' };
  for (const [end, observed] of [[changed, cases], [snapshot, [cases[0], sdkDisagrees]], [snapshot, [cases[0], renderedDisagrees]]] as const) {
    const explanation = explainFlag('express_checkout', snapshot, end, observed, ['paid-older']);
    assert.equal(explanation.profiles[0].status, 'unverified');
    assert.equal(explanation.profiles[0].decisions.Proposed.winner, undefined);
  }
});

test('an unsupported condition value does not prevent saving the observed run', () => {
  const incomplete = structuredClone(snapshot);
  incomplete.Proposed.overrides[1].condition!.value = null;
  const decision = explainFlag('express_checkout', incomplete, incomplete, cases, ['paid-older']).profiles[0];
  assert.equal(decision.status, 'unverified');
  assert.equal(decision.decisions.Proposed.enabled, true);
  assert.equal(decision.decisions.Proposed.winner, undefined);
});
