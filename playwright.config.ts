import { defineConfig, devices } from '@playwright/test'

/** Browser interaction regressions run in genuine headless Chromium. */
export default defineConfig({
  testDir: './e2e',
  timeout: 45_000,
  expect: {timeout: 8_000},
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html',{open:'never'}]] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    viewport: {width:1440,height:900},
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 90_000,
  },
})
