import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

/**
 * End-to-end runs boot the production-style server: one process on one port serving both the
 * built client and the API, with its own data directory. There is no dev proxy in the way, so a
 * stray development server can never answer these requests.
 */
const PORT = 43219
const baseURL = `http://127.0.0.1:${PORT}`
const dataDir = path.resolve(import.meta.dirname, 'var/e2e')

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // The data directory is recreated so a run never inherits an earlier database, and only the
    // server process ever touches the file: SQLite gives one process ownership of it.
    command: `rm -rf ${dataDir} && npm run build && npm start`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      PORT: String(PORT),
      HOST: '127.0.0.1',
      DOCKSY_DATA_DIR: dataDir,
      PUBLIC_URL: baseURL,
      // The reminder scheduler is triggered explicitly from Settings during the tests.
      RUN_BACKGROUND_JOBS: 'false',
      // Lets each test reset to the sample dataset through the server that owns the database.
      DOCKSY_ENABLE_TEST_RESET: 'true',
    },
  },
})
