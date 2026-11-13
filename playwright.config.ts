import { defineConfig, devices } from '@playwright/test'

// No `webServer`: specs start and stop `vite preview` themselves through
// e2e/support/previewServer.ts, because the update test must swap the served
// build under the same origin and port.
export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4173' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
