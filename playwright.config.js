import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 15000 },
  use: { baseURL: 'http://127.0.0.1:3100', headless: true, viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure' },
  webServer: [
    { command: 'node tests/server.mjs open 3100', url: 'http://127.0.0.1:3100', timeout: 120000, reuseExistingServer: false },
    { command: 'node tests/server.mjs policy 3101', url: 'http://127.0.0.1:3101', timeout: 120000, reuseExistingServer: false },
  ],
});