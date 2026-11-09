import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: true,
  workers: process.env.CI ? 2 : 1,
  use: {
    baseURL: 'http://127.0.0.1:5174',
    browserName: 'chromium',
    viewport: { width: 1080, height: 760 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH } : {},
  },
  webServer: { command: 'node scripts/serve.mjs', url: 'http://127.0.0.1:5174', reuseExistingServer: !process.env.CI },
});
