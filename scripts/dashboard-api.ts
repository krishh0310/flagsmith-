import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import Fastify from 'fastify';
import { errorMessage, type RehearsalReport, type RehearsalRun } from './rehearsal-results.ts';

export const dashboardPort = Number(process.env.REHEARSAL_DASHBOARD_PORT ?? 4175);
if (!Number.isInteger(dashboardPort) || dashboardPort < 1 || dashboardPort > 65535) {
  throw new Error('REHEARSAL_DASHBOARD_PORT must be a TCP port between 1 and 65535.');
}
export const dashboardHost = `127.0.0.1:${dashboardPort}`;
const allowedHosts = new Set([dashboardHost, `localhost:${dashboardPort}`]);

export type DashboardRun = { id: string; report: RehearsalReport };
export type JourneyOption = { id: string; name: string };
export type DashboardState = {
  journeys: JourneyOption[];
  defaultJourney: string;
  runs: { id: string; name: string; startedAt: string }[];
  phase: 'empty' | 'running' | 'completed' | 'setup-error';
  latest: DashboardRun | null;
  error?: string;
  flagsmithUrl?: string;
};

export function createDashboardApi(
  run: (journey: string) => Promise<RehearsalRun>,
  options: { journeys: JourneyOption[]; defaultJourney: string; flagsmithUrl?: string },
) {
  const { journeys, defaultJourney, flagsmithUrl = 'http://localhost:8000' } = options;
  const api = Fastify();
  const knownRuns = new Map<string, RehearsalRun>();
  let state: Pick<DashboardState, 'phase' | 'latest' | 'error'> = { phase: 'empty', latest: null };

  api.addHook('onRequest', async (request, reply) => {
    const { host, origin } = request.headers;
    const fetchSite = request.headers['sec-fetch-site'];
    if (
      !host || !allowedHosts.has(host) ||
      (origin && origin !== `http://${host}`) ||
      (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none')
    ) {
      return reply.code(403).send({ error: 'Use the local dashboard origin.' });
    }
    reply.header('X-Content-Type-Options', 'nosniff');
  });

  api.get('/api/rehearsal', async (_request, reply) => {
    return reply.header('Cache-Control', 'no-store').send({
      ...state, flagsmithUrl, journeys, defaultJourney,
      runs: Array.from(knownRuns, ([id, { report }]) => ({
        id, name: report.journeyName ?? report.journey ?? 'Checkout', startedAt: report.startedAt,
      })).reverse(),
    });
  });

  api.post<{ Body: { journey?: unknown } }>('/api/rehearsal', async ({ body }, reply) => {
    if (body !== undefined && (!body || typeof body !== 'object' || Array.isArray(body))) {
      return reply.code(400).send({ error: 'Send a JSON object with a journey ID.' });
    }
    const journey = body?.journey === undefined ? defaultJourney : body.journey;
    if (typeof journey !== 'string' || !journeys.some(({ id }) => id === journey)) {
      return reply.code(400).send({ error: 'Unknown journey. Select a registered journey.' });
    }
    if (state.phase === 'running') {
      return reply.code(409).send({ error: 'A rehearsal is already running.' });
    }

    state = { phase: 'running', latest: state.latest };
    void Promise.resolve().then(() => run(journey)).then((completed) => {
      const id = basename(completed.directory);
      knownRuns.set(id, completed);
      state = {
        phase: completed.report.exitCode === 2 ? 'setup-error' : 'completed',
        latest: { id, report: completed.report },
      };
    }).catch((error) => {
      state = {
        phase: 'setup-error', latest: state.latest,
        error: `Could not complete the rehearsal. ${errorMessage(error)}`,
      };
    });

    return reply.code(202).send({ phase: 'running' });
  });

  api.get<{ Params: { id: string } }>('/api/rehearsals/:id/report', async ({ params }, reply) => {
    const saved = knownRuns.get(params.id);
    if (!saved) return reply.code(404).send();
    return reply.header('Cache-Control', 'no-store').send(saved.report);
  });

  api.get<{ Params: { id: string; file: string } }>('/api/rehearsals/:id/evidence/:file',
    async ({ params: { id, file } }, reply) => {
      const completed = knownRuns.get(id);
      if (!completed || !/^[a-z0-9-]+\.(png|zip)$/.test(file)) return reply.code(404).send();

      const screenshot = completed.report.cases.some(({ evidence }) => evidence?.screenshot === file);
      const trace = completed.report.cases.some(({ evidence }) => evidence?.trace === file);
      if (!screenshot && !trace) return reply.code(404).send();

      try {
        const root = await realpath(dirname(completed.directory));
        const path = join(root, id, file);
        if (await realpath(path) !== path) return reply.code(404).send();
        const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
        if (!(await handle.stat()).isFile()) {
          await handle.close();
          return reply.code(404).send();
        }
        reply.header('Cache-Control', 'private, no-store');
        if (trace) reply.header('Content-Disposition', `attachment; filename="${file}"`);
        return reply.type(trace ? 'application/zip' : 'image/png').send(handle.createReadStream());
      } catch {
        return reply.code(404).send();
      }
    });

  return api;
}
