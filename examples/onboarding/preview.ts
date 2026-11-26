import { build, preview, type Plugin } from 'vite';

export async function buildOnboarding() {
  await build({ root: 'examples/onboarding', configFile: false });
}

export async function previewOnboarding(mode: string, port: number, config: object) {
  const plugin: Plugin = {
    name: 'onboarding-config',
    configurePreviewServer(server) {
      server.middlewares.use('/config.json', (_request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Cache-Control', 'no-store');
        response.end(JSON.stringify(config));
      });
    },
  };
  return preview({
    root: 'examples/onboarding', configFile: false, mode, plugins: [plugin],
    preview: { host: '127.0.0.1', port, strictPort: true },
  });
}
