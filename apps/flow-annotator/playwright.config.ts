import { defineConfig } from '@playwright/test';

export default defineConfig({
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 20,
    },
  },
  fullyParallel: false,
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        deviceScaleFactor: 1,
        viewport: {
          height: 520,
          width: 720,
        },
      },
    },
  ],
  reporter: 'list',
  testDir: './tests/visual',
  timeout: 30_000,
  use: {
    colorScheme: 'light',
  },
  workers: 1,
});
