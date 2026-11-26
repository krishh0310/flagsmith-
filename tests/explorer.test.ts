import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { explorerPlan, matchesFlags, sameObservedFlags } from '../scripts/explorer.ts';
import { planCombinations } from '../scripts/explorer-plan.ts';

test('enumerates all eight unique three-flag assignments', () => {
  const plan = planCombinations(['a', 'b', 'c'], 1);
  assert.equal(plan.combinations.length, 8);
  assert.equal(new Set(plan.combinations.map(x => JSON.stringify(x))).size, 8);
  assert.equal(plan.complete, true);
});

test('pairwise plans are deterministic and expose coverage lost to truncation', () => {
  const flags = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const plan = planCombinations(flags, 1);
  assert.deepEqual(plan, planCombinations(flags, 1));
  assert.equal(plan.complete, true);
  for (const [i, a] of flags.entries()) {
    for (const b of flags.slice(i + 1)) {
      assert.equal(new Set(plan.combinations.map(item => [item[a], item[b]].join(','))).size, 4);
    }
  }
  const truncated = planCombinations(flags, 48);
  assert.equal(truncated.complete, false);
  assert.equal(truncated.cases, 48);
  assert.ok(truncated.uncoveredPairs.length > 0);
});

test('rejects arbitrary flags and invalid limits', () => {
  assert.throws(() => explorerPlan({ journey: 'onboarding', profiles: ['team'], flags: ['pricing_discount'] }), /registered/);
  assert.throws(() => planCombinations(['a'], 1, -1), /bounds/);
});

test('requires exact Boolean observations and verifies unchanged neighboring flags', () => {
  assert.equal(matchesFlags({ a: false }, {}), false);
  assert.equal(matchesFlags({ a: false }, { a: true }), false);
  assert.equal(sameObservedFlags({ a: false, b: true }, { a: true, b: false }, 'a'), false);
  assert.equal(sameObservedFlags({ a: false, b: true }, { a: true, b: true }, 'a'), true);
});
