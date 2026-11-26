import { strict as assert } from 'node:assert';
import { access } from 'node:fs/promises';
import { runExplorer } from './explorer.ts';

const realFetch = globalThis.fetch;
const failCleanup = process.argv.includes('--cleanup-failure');
let writes = 0;
globalThis.fetch = (input, options) => {
  if (options?.method === 'PATCH' && String(input).includes('/featurestates/') && ++writes === 4) {
    return Promise.resolve(new Response(null, { status: 503 }));
  }
  if (failCleanup && options?.method === 'DELETE') return Promise.resolve(new Response(null, { status: 503 }));
  return realFetch(input, options);
};
try {
  const report = await runExplorer({ journey: 'onboarding', profiles: ['team'],
    flags: ['new_onboarding', 'save_onboarding_progress'] });
  assert.equal(report.exitCode, 2);
  assert.equal(report.cases.length, 1);
  assert.match(report.errors.join(' '), /HTTP 503/);
  assert.equal(report.cleanup.status, failCleanup ? 'failed' : 'verified');
  await access(`rehearsal-runs/${report.id}/report.json`);
  console.log(`Mid-run API failure preserved one case, cleanup ${report.cleanup.status}: rehearsal-runs/${report.id}/report.json`);
} finally {
  globalThis.fetch = realFetch;
}
