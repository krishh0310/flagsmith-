import { resolve } from 'node:path';
import serveStatic from '@fastify/static';
import { loadEnv } from 'vite';
import { defaultJourney, journeys } from '../rehearsal.config.ts';
import { createDashboardApi, dashboardPort } from './dashboard-api.ts';
import { runRehearsal } from './rehearsal.ts';

const { FLAGSMITH_API_URL } = loadEnv('dashboard', process.cwd(), 'FLAGSMITH_API_URL');
const flagsmith = URL.parse(FLAGSMITH_API_URL ?? '');
const api = createDashboardApi(
  () => runRehearsal(defaultJourney, journeys[defaultJourney]),
  flagsmith && ['http:', 'https:'].includes(flagsmith.protocol) ? flagsmith.origin : undefined,
);
await api.register(serveStatic, { root: resolve('dist-dashboard'), index: 'dashboard.html' });
const address = await api.listen({ host: '127.0.0.1', port: dashboardPort });
console.log(`Flag Rehearsal dashboard available at ${address}`);
