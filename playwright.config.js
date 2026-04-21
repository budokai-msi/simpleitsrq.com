import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for a11y smoke tests.
 *
 * The test suite is intentionally minimal — it drives the Vite preview
 * server on port 4173 (the default for `vite preview`). To run locally:
 *
 *   npm run build
 *   npx vite preview --port 4173 &
 *   npm run test:e2e
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
