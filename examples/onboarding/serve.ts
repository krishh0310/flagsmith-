import { readDemoTargets, checkoutPreviewConfig } from '../../scripts/demo-config.ts';
import { buildOnboarding, previewOnboarding } from './preview.ts';

const targets = readDemoTargets(process.cwd());
await buildOnboarding();
for (const [mode, port] of [['current', 4181], ['proposed', 4182]] as const) {
  const server = await previewOnboarding(mode, port, checkoutPreviewConfig(mode, targets));
  server.printUrls();
}
