import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { readDemoTargets, checkoutPreviewConfig } from '../scripts/demo-config.ts';

test('rejects a shared SDK key across mode-specific preview settings', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'rehearsal-config-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, '.env'), 'FLAGSMITH_API_URL=http://localhost:8000/api/v1/\nFLAGSMITH_CURRENT_ENVIRONMENT_KEY=shared\n');
  await writeFile(join(root, '.env.proposed'), 'FLAGSMITH_PROPOSED_ENVIRONMENT_KEY=shared\n');
  assert.deepEqual(checkoutPreviewConfig('proposed', readDemoTargets(root)), {
    environment: 'Proposed',
    error: 'Current and Proposed use the same Flagsmith SDK key.',
  });
  await writeFile(join(root, '.env.proposed'), 'FLAGSMITH_PROPOSED_ENVIRONMENT_KEY=distinct\n');
  assert.deepEqual(checkoutPreviewConfig('proposed', readDemoTargets(root)), {
    environment: 'Proposed',
    api: 'http://localhost:8000/api/v1/',
    environmentID: 'distinct',
  });
});
