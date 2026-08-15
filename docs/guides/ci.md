# CI

[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) runs on every pull request and every
push to `main`, as two jobs.

| Job | Runs on | Gates |
| --- | --- | --- |
| **`build`** | `ubuntu-latest` | `npm run lint`, `npm run test`, `npm run build`. Because `tsc -b` covers `tsconfig.e2e.json`, this also type-checks `e2e/` and `playwright.config.ts`. Uploads `dist/` as an artifact. |
| **`e2e`** | the official Playwright container | Downloads that `dist/`, serves it with `vite preview`, and runs the 35 visual-regression screenshots plus the map's structural assertions. |

The app is built once and handed to `e2e` as an artifact, the container ships the browsers already
installed, and superseded PR runs are cancelled automatically. The container tag is derived from
`package-lock.json` at run time, so it can never drift from the installed `@playwright/test` — and
`npm run test:e2e:update:linux` resolves the same tag from the same file, which is what makes
locally-generated baselines match CI.

**When `e2e` fails, download the `playwright-report` artifact** from the run's summary page. It
contains `playwright-report/index.html` (open it in a browser) and `test-results/`, which holds the
`*-expected.png` / `*-actual.png` / `*-diff.png` triplets.

## CI went red — now what

| Symptom | Cause | Fix |
| --- | --- | --- |
| `e2e`: `A snapshot doesn't exist at …-linux.png` | You added a test, a viewport/project, or renamed a snapshot | `npm run test:e2e:update:linux`, then commit the new `-linux.png` files. |
| Locally: `A snapshot doesn't exist at …-win32.png`, then it passes on a re-run | **Expected, not a bug.** Windows baselines aren't committed, so your first run on a fresh clone writes its own | Nothing. Re-run `npm run test:e2e`. The written `-win32.png` files are git-ignored. |
| `e2e`: pixel diff, **and you meant to change the UI** | Baselines are stale | Regenerate with `npm run test:e2e:update:linux` and commit. Put a screenshot of the new UI in the PR description. |
| `e2e`: pixel diff, **and you didn't touch the UI** | A real regression, or a non-deterministic render | Download the artifact and look at `*-diff.png` before doing anything else. **Don't regenerate baselines to make it green** — that deletes the evidence. |
| `e2e` fails on `desktop` but not `mobile` (or vice versa) | Responsive-layout regression at 1280px or 390px | Reproduce with `npm run test:e2e -- --project=mobile`; use `npm run test:e2e:ui` to step through it. |
| `e2e` is flaky — fails once, passes on retry | A canvas hadn't finished rendering | The config already pins `workers: 1`, `retries: 2` and `animations: 'disabled'`. If you added an animated component, `await` a settled state in the spec rather than loosening `maxDiffPixelRatio`. |
| `e2e`: `webServer` timed out after 180s | `dist/` was missing/empty, or port 4173 was busy | Check that `build` uploaded `dist`. Locally, kill anything on 4173 — `vite preview` silently moves to 4174, which makes Playwright wait out the full timeout. |
| `e2e`: browser not found, or a version mismatch | `@playwright/test` was upgraded | Nothing to change in `ci.yml`; the container follows the lockfile. **But a new browser build re-renders text**, so regenerate the Linux baselines in the same PR. |
| `build`: `tsc -b` errors in `e2e/` or `playwright.config.ts` | `tsconfig.json` references `tsconfig.e2e.json` | Fix the types. E2E code is part of the build, not a side project. |
| `build` passes locally but fails in CI | Node version mismatch | CI reads [`.node-version`](../../.node-version) (`22.23.2`). Match it locally with `fnm use`. |
| You added a page, route, or major component | It has no visual coverage | Add a test to [`e2e/visual.spec.ts`](../../e2e/visual.spec.ts) reusing the shared `gotoDashboard()` helper from [`e2e/helpers.ts`](../../e2e/helpers.ts), then generate its Linux baselines. Chart rendering goes in [`e2e/chart-content.spec.ts`](../../e2e/chart-content.spec.ts) via `shootChart()`; map changes go in [`e2e/map.spec.ts`](../../e2e/map.spec.ts) via `gotoMap()` instead. |
| `map`: pixel diff after a line-data update | New/changed geometry in `public/metro_lines.geojson` legitimately moves the lines | `npm run test:e2e:update:linux -- --project=map`. |
| `map`: the screenshot shows a real basemap, or the layer-stack assertion sees ~100 layers | A map request escaped the route stub in `e2e/map.spec.ts` | Fix the stub. Don't loosen `maxDiffPixelRatio` — with the basemap gone this suite is byte-stable. |
| `map`: `window.__metroMap` is undefined | The test seam was removed from `src/components/Map.tsx` | Put it back, or give the spec another handle on the instance. It's the only way to await a WebGL canvas. |
| You added a build-time env var (`VITE_*`) | Only the `build` job compiles the app | Add it to that job's `env:`. (`VITE_MAPTILER_KEY` is optional — the app falls back to OpenFreeMap — so no secret is required today.) |

## What CI does not run

The architecture diagrams (`npm run docs:architecture`) are not wired into CI. The build is
reproducible, so a rebuild with no source change produces no diff — but nothing will catch a stale
`diagrams.md` either. Regenerate it in the same PR as any change to `docs/architecture/mermaid/` or
`captions.md`.

Nor does anything check that the docs still describe the code. See
[`CONTRIBUTING.md`](../../CONTRIBUTING.md) for the one manual step that substitutes.
