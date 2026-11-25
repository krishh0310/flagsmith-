import { defineConfig } from 'vite';
import { checkoutPreviewConfig, readDemoTargets } from './scripts/demo-config.ts';

export default defineConfig(({ mode }) => ({
  ...(mode === 'dashboard' && {
    input: 'dashboard.html',
    build: { outDir: 'dist-dashboard' },
  }),
  plugins: [{
    name: 'checkout-runtime-config',
    configurePreviewServer(server) {
      const { mode, root } = server.config;
      const config = checkoutPreviewConfig(mode, readDemoTargets(root));

      server.middlewares.use('/checkout-config.json', (_request, response) => {
        response.setHeader('Content-Type', 'application/json');
        response.setHeader('Cache-Control', 'no-store');
        response.end(JSON.stringify(config));
      });
    },
  }],
}));
