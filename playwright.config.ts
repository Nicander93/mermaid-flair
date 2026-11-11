import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'tests',
  timeout: 45_000,
  workers: 1,
  use: {
    browserName: 'chromium',
    viewport: { width: 1160, height: 800 },
    launchOptions: { executablePath: process.env.FLAIR_CHROMIUM },
  },
  reporter: [['list'], ['html', { open: 'never' }]],
})
