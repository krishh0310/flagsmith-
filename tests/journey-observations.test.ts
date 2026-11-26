import { flagValueLabel } from '../scripts/rehearsal-results.ts';
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Page } from '@playwright/test';
import { executeJourney } from '../scripts/journey.ts';

test('keeps both observed flag values when a later journey step fails', async () => {
  const page = { setDefaultTimeout() {}, setDefaultNavigationTimeout() {} } as unknown as Page;
  const result = await executeJourney(async ({ observe, observeFlags, check }) => {
    observe('New');
    observeFlags({ flow: true, saving: false });
    check('Resume');
    throw Error('Missing draft');
  }, page, 'http://localhost', 'Proposed', { id: 'team' });
  assert.deepEqual(result.observedFlags, { flow: true, saving: false });
  assert.equal(result.outcome, 'fail');
  assert.equal(result.error?.step, 'Resume');
});

test('distinguishes disabled flags from missing values', () => {
  assert.equal(flagValueLabel(true), 'On');
  assert.equal(flagValueLabel(false), 'Off');
  assert.equal(flagValueLabel(undefined), 'Unavailable');
});
