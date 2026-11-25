import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  webServer: [
    { command: 'npm run start:current', url: 'http://127.0.0.1:4173', reuseExistingServer: true },
    { command: 'npm run start:proposed', url: 'http://127.0.0.1:4174', reuseExistingServer: true },
  ],
});
