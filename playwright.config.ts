import { defineConfig, devices } from '@playwright/test';

/**
 * Visual-regression config.
 *
 * Tests run against the production build served by `vite preview` (not the dev server): it is
 * what ships, it is deterministic, and it avoids the dev server's HMR/module-transform layer,
 * which is unreliable under headless Chromium over Vite's self-signed HTTP/2.
 *
 * `vite preview` still serves HTTPS via `@vitejs/plugin-basic-ssl`, so we accept the
 * self-signed cert (`ignoreHTTPSErrors` on the browser context and the webServer probe, plus
 * `NODE_TLS_REJECT_UNAUTHORIZED=0`).
 *
 * Snapshots are captured in headless Chromium at two fixed viewports (desktop + mobile).
 * They are OS/browser-specific — regenerate in a consistent environment (Playwright's Linux
 * Docker image, `mcr.microsoft.com/playwright`) for CI to avoid cross-platform font/AA diffs.
 */
export default defineConfig({
  testDir: './e2e',
  // Visual snapshots are captured serially: parallel workers contend for CPU, which lets the
  // responsive Chart.js/sparkline canvases settle at slightly different sub-pixel sizes between
  // runs. One worker keeps rendering timing consistent and the baselines stable.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',

  use: {
    baseURL: 'https://localhost:4173',
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
  },

  expect: {
    toHaveScreenshot: {
      // toHaveScreenshot re-shoots until two consecutive frames match, which waits out
      // Chart.js canvas animation; `animations: 'disabled'` freezes CSS animations/transitions.
      animations: 'disabled',
      // `threshold` absorbs per-pixel antialiasing noise; `maxDiffPixelRatio` caps how much of
      // the frame may differ overall. Tuned to pass on stable renders while still catching real
      // visual regressions (which change far more of the frame than AA jitter).
      threshold: 0.25,
      maxDiffPixelRatio: 0.02,
    },
  },

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
  ],

  webServer: {
    // Build then preview so a run is self-contained (dist/ need not pre-exist).
    command: 'npm run build && npm run preview',
    url: 'https://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    ignoreHTTPSErrors: true,
    env: { NODE_TLS_REJECT_UNAUTHORIZED: '0' },
  },
});
