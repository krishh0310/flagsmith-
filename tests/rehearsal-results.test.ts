import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compare, environments, type CaseResult } from '../scripts/rehearsal-results.ts';
import { profileIds } from '../src/profiles.ts';

function passingCases(): CaseResult[] {
  return environments.flatMap((environment) => profileIds.map((profile) => ({
    environment, profile, variant: 'Classic', outcome: 'pass',
  })));
}

test('all cases pass even if the variants differ', () => {
  const cases = passingCases();
  cases[5].variant = 'Express';
  assert.equal(compare(cases, profileIds).exitCode, 0);
});

test('a checkout failure in Proposed after a Current pass is a regression', () => {
  const cases = passingCases();
  cases[5].outcome = 'fail';
  const result = compare(cases, profileIds);
  assert.equal(result.exitCode, 1);
  assert.deepEqual(result.profiles.filter(({ status }) => status === 'regression').map(({ profile }) => profile), ['paid-older']);
});

test('an invalid baseline, setup error, or missing case makes the comparison invalid', () => {
  const cases = passingCases();
  cases[0].outcome = 'fail';
  cases[4].outcome = 'setup-error';
  cases.pop();
  const result = compare(cases, profileIds);
  assert.equal(result.exitCode, 2);
  assert.deepEqual(result.profiles.map(({ status }) => status), ['invalid-baseline', 'incomplete', 'incomplete']);
});

test('comparison uses the registered identities for a custom journey', () => {
  const cases = environments.map((environment): CaseResult => ({
    environment, profile: 'trial-user', variant: 'Trial', outcome: 'pass',
  }));
  assert.deepEqual(compare(cases, ['trial-user']), {
    exitCode: 0,
    profiles: [{ profile: 'trial-user', current: 'pass', proposed: 'pass', status: 'pass' }],
  });
});
