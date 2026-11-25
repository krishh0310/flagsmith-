import assert from 'node:assert/strict';
import { mkdtemp, mkdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createDashboardApi, dashboardHost } from '../scripts/dashboard-api.ts';
import type { RehearsalRun } from '../scripts/rehearsal-results.ts';

test('serializes runs and serves only evidence listed for a known run', async (t) => {
  const output = await mkdtemp(join(tmpdir(), 'dashboard-api-test-'));
  const run = Promise.withResolvers<RehearsalRun>();
  const api = createDashboardApi(() => run.promise);
  t.after(() => api.close());
  const headers = { host: dashboardHost };

  const result = await api.inject({ method: 'GET', url: '/api/rehearsal', headers });
  assert.equal(result.json().phase, 'empty');
  const foreign = await api.inject({
    method: 'POST', url: '/api/rehearsal',
    headers: { ...headers, origin: 'https://other.invalid' },
  });
  assert.equal(foreign.statusCode, 403);
  const start = () => api.inject({ method: 'POST', url: '/api/rehearsal', headers });
  const starts = await Promise.all([start(), start()]);
  assert.deepEqual(starts.map((response) => response.statusCode).sort(), [202, 409]);
  assert.equal((await api.inject({ method: 'GET', url: '/api/rehearsal', headers })).json().phase, 'running');

  const id = 'run-test';
  const directory = join(output, id);
  const screenshot = 'proposed-paid-older.png';
  const trace = 'proposed-paid-older.zip';
  await mkdir(directory);
  await writeFile(join(directory, screenshot), 'screenshot');
  await writeFile(join(directory, 'private.txt'), 'unlisted');
  await symlink(join(directory, 'private.txt'), join(directory, trace));
  run.resolve({
    directory,
    terminal: '',
    report: {
      journey: 'checkout', startedAt: new Date(0).toISOString(), exitCode: 1, status: 'regression detected',
      comparisons: [], runErrors: [],
      cases: [{
        environment: 'Proposed', profile: 'paid-older', variant: 'Express', outcome: 'fail',
        evidence: { screenshot, trace },
      }],
    },
  });

  const completed = await api.inject({ method: 'GET', url: '/api/rehearsal', headers });
  assert.equal(completed.json().latest.report.exitCode, 1);
  const evidence = (runId: string, file: string) => api.inject({
    method: 'GET', url: `/api/rehearsals/${runId}/evidence/${file}`, headers,
  });
  assert.equal((await evidence(id, screenshot)).body, 'screenshot');
  assert.equal((await evidence('unknown', screenshot)).statusCode, 404);
  assert.equal((await evidence(id, 'private.txt')).statusCode, 404);
  assert.equal((await evidence(id, trace)).statusCode, 404);
});
