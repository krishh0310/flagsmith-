import { build, preview, type Plugin } from 'vite';
import { readDemoTargets, checkoutPreviewConfig } from '../../scripts/demo-config.ts';

const targets = readDemoTargets(process.cwd());
const root = 'examples/onboarding';
const config: Plugin = {
  name: 'onboarding-config',
  configurePreviewServer(server) {
    server.middlewares.use('/config.json', (_request, response) => {
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(checkoutPreviewConfig(server.config.mode, targets)));
    });
  },
};
await build({ root, configFile: false });
for (const [mode, port] of [['current', 4181], ['proposed', 4182]] as const) {
  const server = await preview({ root, configFile: false, mode, plugins: [config],
    preview: { host: '127.0.0.1', port, strictPort: true } });
  server.printUrls();
}
