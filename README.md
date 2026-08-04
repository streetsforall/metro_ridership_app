# Metro Ridership App

This is a project built by Streets for All's Data/Dev Team to visualize and interact with Los Angeles Metro's ridership data for rail and bus service. It's currently a client-side rendered React application built with Vite but may switch to a full-stack application if the required data processing becomes too heavy.

## Data overview

The data is generally categorized into two different types:

- Line metadata contains summary data at the bus/rail line level, such as the line identifier and method of operation.
- Ridership metrics are the monthly records of each line, with average daily ridership for weekdays, Saturdays, and Sundays.

In order to be utilized in the chart, ridership metrics are converted from a flat structure into one that is consolidated by line (see `src/@types/metrics.types.ts`). Furthermore, in order to display the metrics in the line summary table, additional data is added to the line metadata based on calculations made on each line's consolidated metrics (see `src/@types/lines.types.ts`).

### Data coverage varies by line

Not every line reports for the same span of months. Lines are added and discontinued over time, and a line can also appear late because the source data only began breaking it out separately — the D Line, for instance, starts at September 2025 while most rail lines go back to 2009 (see [DATA_RELEASE_NOTES.md](DATA_RELEASE_NOTES.md)).

The chart accounts for this: all selected lines are plotted against one shared month axis, and a month a line doesn't report is drawn as a gap rather than joined to the next point.

The summary table does not. `Change`, `Starting Ridership` and `Ending Ridership` are computed from each line's *own* first and last available months within the selected range, so for two lines with different coverage those figures cover different periods and aren't directly comparable — a line's "change" may be measured over a few months while its neighbour's spans years. This is tracked in [issue #88](https://github.com/streetsforall/metro_ridership_app/issues/88).

The general process of loading and transforming relevant data is as follows:

1. Load lines and assemble JSON with `createLinesData()` in `useUserDashboardInput.ts`.
2. Consolidate metrics by line in `App.tsx`.
3. In `App.tsx`, using the consolidated metrics, call `updateLinesWithLineMetrics()` in `hooks/useUserDashboardInput.ts` to add summary metrics to each line.

## Development

### Prerequisites

- Node.js 22 — the repo pins `22.23.2` in [`.node-version`](.node-version), which `fnm`/`nvs`/`asdf` read automatically. CI uses the same file.
- npm
- Python 3 — only for the data-processing scripts (see [`scripts/README.md`](scripts/README.md))
- Docker — only for regenerating Linux visual-regression baselines (see [End-to-end tests](#end-to-end--visual-regression-tests))

### Local development

```bash
npm install
npm run dev
```

The app will be available at `https://localhost:5173`. Note the **https** — [`@vitejs/plugin-basic-ssl`](https://www.npmjs.com/package/@vitejs/plugin-basic-ssl) is enabled for `vite serve`, so your browser will warn about the self-signed certificate the first time. Accept it and carry on.

### Build

```bash
npm run build
```

Runs TypeScript type-checking (`tsc -b`) followed by the Vite production build. Output goes to `dist/`.

To preview the production build locally:

```bash
npm run preview
```

Served at `https://localhost:4173` — also self-signed, for the same reason as the dev server.

### Test

```bash
npm run test        # run all tests once
npm run test:watch  # run tests in watch mode
```

Tests use [Vitest](https://vitest.dev/) with `@testing-library/react` for component tests. Specs live next to the code under `src/`; `e2e/` is excluded (it belongs to Playwright).

### End-to-end / visual regression tests

[Playwright](https://playwright.dev/) screenshots three views — the default dashboard, the dashboard with a line selected, and the expanded line-selector table — at two viewports (desktop 1280×800, mobile 390×844), and compares them against committed baselines. That's 6 screenshots per run. The map is masked out of every one, so **visual regression gives no coverage of the map** — verify map changes by hand.

```bash
npm run test:e2e               # run the suite (builds, serves, compares)
npm run test:e2e:ui            # interactive UI / trace viewer
npm run test:e2e:update        # rewrite baselines for YOUR platform
npm run test:e2e:update:linux  # rewrite the Linux baselines (needs Docker)
```

Tests run against the production build served by `vite preview`, not the dev server. `npm run test:e2e` builds automatically, so there's no separate setup step.

#### Baselines are committed for two platforms

Playwright names each snapshot after the OS that captured it, and font rendering differs enough between platforms to cause false diffs. So [`e2e/visual.spec.ts-snapshots/`](e2e/visual.spec.ts-snapshots/) holds two sets:

| Suffix | Used by | Regenerate with |
| --- | --- | --- |
| `-win32.png` | local runs on Windows | `npm run test:e2e:update` |
| `-linux.png` | CI | `npm run test:e2e:update:linux` |

**When a UI change legitimately alters the screenshots, regenerate both sets and commit both.** Updating only your own platform turns CI red for everyone else. The Linux command shells out to the same Playwright Docker image CI uses (see [`scripts/README.md`](scripts/README.md#update_linux_snapshotspy)), so it needs Docker Desktop running.

### Lint

```bash
npm run lint
```

Uses ESLint with TypeScript, React hooks, and React refresh plugins. Fix lint errors before opening a pull request.

## Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every pull request and every push to `main`, as two jobs:

| Job | Runs on | Gates |
| --- | --- | --- |
| **`build`** | `ubuntu-latest` | `npm run lint`, `npm run test`, `npm run build`. Because `tsc -b` covers `tsconfig.e2e.json`, this also type-checks `e2e/` and `playwright.config.ts`. Uploads `dist/` as an artifact. |
| **`e2e`** | the official Playwright container | Downloads that `dist/`, serves it with `vite preview`, and runs the 6 visual-regression screenshots. |

The app is built once and handed to `e2e` as an artifact, the container ships the browsers already installed, and superseded PR runs are cancelled automatically. The container tag is derived from `package-lock.json` at run time, so it can never drift from the installed `@playwright/test` — and `npm run test:e2e:update:linux` resolves the same tag from the same file, which is what makes locally-generated baselines match CI.

**When `e2e` fails, download the `playwright-report` artifact** from the run's summary page. It contains `playwright-report/index.html` (open it in a browser) and `test-results/`, which holds the `*-expected.png` / `*-actual.png` / `*-diff.png` triplets.

### CI went red — now what

| Symptom | Cause | Fix |
| --- | --- | --- |
| `e2e`: `A snapshot doesn't exist at …-linux.png` | You added a test, a viewport/project, or renamed a snapshot | `npm run test:e2e:update:linux`, then `npm run test:e2e:update` for the Windows set. Commit both. |
| `e2e`: pixel diff, **and you meant to change the UI** | Baselines are stale | Regenerate **both** sets and commit. Put a screenshot of the new UI in the PR description. |
| `e2e`: pixel diff, **and you didn't touch the UI** | A real regression, or a non-deterministic render | Download the artifact and look at `*-diff.png` before doing anything else. **Don't regenerate baselines to make it green** — that deletes the evidence. |
| `e2e` fails on `desktop` but not `mobile` (or vice versa) | Responsive-layout regression at 1280px or 390px | Reproduce with `npm run test:e2e -- --project=mobile`; use `npm run test:e2e:ui` to step through it. |
| `e2e` is flaky — fails once, passes on retry | A canvas hadn't finished rendering | The config already pins `workers: 1`, `retries: 2` and `animations: 'disabled'`. If you added an animated component, `await` a settled state in the spec rather than loosening `maxDiffPixelRatio`. |
| `e2e`: `webServer` timed out after 180s | `dist/` was missing/empty, or port 4173 was busy | Check that `build` uploaded `dist`. Locally, kill anything on 4173 — `vite preview` silently moves to 4174, which makes Playwright wait out the full timeout. |
| `e2e`: browser not found, or a version mismatch | `@playwright/test` was upgraded | Nothing to change in `ci.yml`; the container follows the lockfile. **But a new browser build re-renders text**, so regenerate both baseline sets in the same PR. |
| `build`: `tsc -b` errors in `e2e/` or `playwright.config.ts` | `tsconfig.json` references `tsconfig.e2e.json` | Fix the types. E2E code is part of the build, not a side project. |
| `build` passes locally but fails in CI | Node version mismatch | CI reads [`.node-version`](.node-version) (`22.23.2`). Match it locally with `fnm use`. |
| You added a page, route, or major component | It has no visual coverage | Add a test to [`e2e/visual.spec.ts`](e2e/visual.spec.ts) reusing the existing `gotoDashboard()` helper, then generate baselines for both platforms. |
| You changed the map | **Not covered by any test** | `#lineMap` is masked in every screenshot. Verify by hand. |
| You added a build-time env var (`VITE_*`) | Only the `build` job compiles the app | Add it to that job's `env:`. (`VITE_MAPTILER_KEY` is optional — the app falls back to OpenFreeMap — so no secret is required today.) |

## Updating ridership data

Ridership data is obtained from LA Metro via a California Public Records Act request, which returns monthly Excel files (`MM-YYYY-{Bus|Rail}.xlsx`) and per-year zip archives. Drop them in `data/raw/`, then:

```bash
python scripts/update_ridership.py             # scan data/raw/, add any months not already present
python scripts/update_ridership.py --dry-run   # report what's new, write nothing
```

`update_ridership.py` is the day-to-day entry point: it works out which month/line records are missing and appends only those. To force-ingest one specific file, call the underlying script directly:

```bash
python scripts/process_ridership.py data/raw/2026-04_2026-05.zip
python scripts/process_ridership.py data/raw/04-2026-Bus.xlsx
python scripts/process_ridership.py data/raw/Monthly_Riders.csv.gz   # legacy CSV format
```

This updates three files:

- **`src/data/ridership.json`** — flat array of monthly ridership records (year, month, line, weekday/Saturday/Sunday averages)
- **`src/data/metro_line_metadata_current.json`** — line catalog (line number, mode, provider); updated automatically when new lines appear in the data
- **[`DATA_RELEASE_NOTES.md`](DATA_RELEASE_NOTES.md)** — a dated entry is prepended whenever `update_ridership.py` adds new months (suppress with `--no-release-notes`). This is distinct from [`RELEASE_NOTES.md`](RELEASE_NOTES.md), which tracks app releases.

Commit raw files to `data/raw/` compressed — `.zip` for Excel, `.csv.gz` for legacy CSVs. Uncompressed `.xlsx` and `.csv` files are gitignored. See [`scripts/README.md`](scripts/README.md) for how to submit the records request, the full processing pipeline, and compression instructions.

For data exploration and debugging, use the notebooks in [`notebooks/`](notebooks/) — particularly `metro_data_ridership_update.ipynb`.
