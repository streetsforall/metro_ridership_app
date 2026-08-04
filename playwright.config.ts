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
 * They are OS/browser-specific — the default `snapshotPathTemplate` still suffixes each file with
 * `process.platform` — but only the `-linux.png` set CI compares against is committed. `-win32.png`
 * / `-darwin.png` are git-ignored, per-developer scratch: your first local run writes them and
 * passes from then on. A UI change that alters the screenshots therefore needs exactly one
 * regeneration command, `npm run test:e2e:update:linux`, which runs in the same Playwright Docker
 * image CI uses. See README.md § Continuous integration.
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
  // On CI, `github` writes inline annotations on the failing spec lines in the PR diff, and the
  // html report is uploaded as an artifact. `open: 'never'` stops the reporter from trying to
  // spawn a browser at the end of a failing run.
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'html',

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
    // Locally, build then preview so a run is self-contained (dist/ need not pre-exist).
    // On CI, dist/ is downloaded as an artifact from the build job — preview only, never rebuild.
    command: process.env.CI ? 'npm run preview' : 'npm run build && npm run preview',
    url: 'https://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    ignoreHTTPSErrors: true,
    env: { NODE_TLS_REJECT_UNAUTHORIZED: '0' },
  },
});
