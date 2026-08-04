# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Client-side React + Vite app (Streets for All Data/Dev Team) for visualizing LA Metro bus/rail ridership data. There is no backend. Small metadata JSON (line metadata, distances) is bundled into the build; the large ridership dataset is served as a separate columnar asset **fetched at runtime** (see the `ridership-data` Vite plugin) so it stays out of the JS bundle. The app may move to full-stack if data processing gets too heavy.

## Commands

```bash
npm run dev          # Vite dev server at https://localhost:5173 (basicSsl in dev only)
npm run build        # tsc -b type-check, then vite build → dist/
npm run preview      # serve the production build
npm run test         # vitest run (all tests once)
npm run test:watch   # vitest watch mode
npm run lint         # eslint .

npm run test:e2e               # playwright visual-regression suite
npm run test:e2e:ui            # playwright UI / trace viewer
npm run test:e2e:update        # rewrite baselines for the current platform
npm run test:e2e:update:linux  # rewrite the Linux baselines in Docker
```

Run a single test file: `npx vitest run src/utils/calc.test.ts` (or pass a name filter with `-t`). Tests use Vitest + `@testing-library/react` in a jsdom environment with globals enabled (no per-file imports of `describe`/`it`/`expect` needed).

The dev server uses HTTPS via `@vitejs/plugin-basic-ssl` — expect a self-signed cert warning the first time. **`vite preview` is also HTTPS** (basicSsl runs for `command === 'serve'`, which covers preview), which is why the Playwright config sets `ignoreHTTPSErrors` and `NODE_TLS_REJECT_UNAUTHORIZED=0`.

## Testing

Vitest specs live beside the code under `src/`; `vitest.config.ts` excludes `e2e/**` (and `.claude/**`, where Claude Code's throwaway worktrees live). E2E is Playwright, run against the production build on `https://localhost:4173` — not the dev server.

Non-obvious constraints:

- **Baselines are committed for two platforms** — `-win32.png` for local Windows runs, `-linux.png` for CI. A UI change that alters the screenshots requires regenerating **both**; updating one turns CI red for everyone else. Never regenerate baselines to silence a diff you can't explain.
- `npm run test:e2e:update:linux` ([scripts/update_linux_snapshots.py](scripts/update_linux_snapshots.py)) needs Docker. It resolves its image tag from `package-lock.json` — the same source [.github/workflows/ci.yml](.github/workflows/ci.yml) uses — so local regeneration and CI stay in lockstep.
- **Bumping `@playwright/test` means regenerating both baseline sets in the same PR**; a new browser build re-renders text. The workflow's container tag follows the lockfile automatically, so `ci.yml` itself needs no edit.
- `npm run build` type-checks `e2e/` and `playwright.config.ts` — `tsconfig.json` references `tsconfig.e2e.json`, so a broken spec fails the build.
- **`#lineMap` is masked in every screenshot**, so the visual suite gives no coverage of the map.
- CI is two jobs: `build` (lint/test/build, uploads `dist/`) → `e2e` (Playwright container, downloads `dist/`, previews only — `playwright.config.ts` skips its own build when `CI` is set). The full failure runbook is in [README.md](README.md#ci-went-red--now-what).

CI runs lint → test → build on every push/PR to `main` ([.github/workflows/ci.yml](.github/workflows/ci.yml)).

## Data flow (the core architecture)

The app transforms flat ridership records into per-line consolidated structures, then derives summary metrics. Understanding this pipeline is key:

1. **Lines are built from metadata** — `createLinesData()` in [src/hooks/useUserDashboardInput.ts](src/hooks/useUserDashboardInput.ts) reads `metro_line_metadata_current.json`, attaches display names/colors (via `getLineNames`/`getLineColor`), distance from `line_distances.json`, and sorts with `lineNameSortFunction` (lettered lines first, then numbered).
2. **Records are consolidated by line** — [src/App.tsx](src/App.tsx) fetches `/ridership.json` at runtime (a columnar blob decoded by [src/utils/ridershipData.ts](src/utils/ridershipData.ts)), then a single `useMemo` filters it to the selected date window and groups records by `line_name` into `ConsolidatedRidership`, while building Chart.js datasets in the same pass. The memo yields empty results until the fetch resolves.
3. **Summary metrics are attached back to lines** — `updateLinesWithLineMetrics()` (in the hook) runs from a `useEffect` in App and computes average/change/start/end ridership and riders-per-mile per line using helpers in [src/utils/calc.ts](src/utils/calc.ts). The `LineSelector`/`SummaryData` components read these.

Type definitions for these shapes live in [src/@types/metrics.types.ts](src/@types/metrics.types.ts) (`RidershipRecord`, `ConsolidatedRidership`) and [src/@types/lines.types.ts](src/@types/lines.types.ts) (`LineJson` from disk vs. enriched `Line`).

### Important conventions & quirks

- **`DayOfWeek` is the JSON column name**, not a label — `daysOfWeek` maps `Weekday/Saturday/Sunday` to `est_wkday_ridership`/`est_sat_ridership`/`est_sun_ridership`. Selecting a day-of-week literally swaps which field is read.
- **All UI state syncs to URL query params** (`start`, `end`, `day`, `lines`, `q`, `buses`, `trains`, `aggregate`) so views are shareable. The canonical set lives in [src/hooks/useUserDashboardInput.ts](src/hooks/useUserDashboardInput.ts) — read from the URL on mount (~L114-123) and written back via `history.replaceState` in a `useEffect` (~L145-155); [src/utils/queryParams.ts](src/utils/queryParams.ts) only holds the parse/format helpers. When adding new dashboard state, wire it through both the init readers and the sync effect.
- **`JSON.stringify(...)` is intentionally used in several dependency arrays** (`lines`, `ridershipByLine`) because those objects get a new reference every render; don't "fix" these to raw object deps.
- **The ridership dataset is fetched, not bundled** — `src/data/ridership.json` remains the canonical record-format source (the Python pipeline reads/writes it), but the app fetches `/ridership.json` at runtime as a minified columnar `{cols,rows}` blob emitted by the `ridership-data` Vite plugin ([vite/ridership-data-plugin.ts](vite/ridership-data-plugin.ts)) and decodes it via [src/utils/ridershipData.ts](src/utils/ridershipData.ts). The selectable date bounds come from the plugin's `virtual:ridership-bounds` module, so the full dataset never enters the JS bundle. The plugin is registered in both `vite.config.ts` and `vitest.config.ts`. Run `ANALYZE=1 npm run build` for a bundle treemap at `dist/stats.html`. `OutputArea` (Chart.js + MapLibre GL) is lazy-loaded to keep MapLibre out of the entry chunk.
- **Month indexing is off by one on purpose** in App.tsx's date filter (`new Date(year, month)` treats month as 0-based while data is 1-based) — preserved from the original implementation; don't silently change it.
- **Date range bounds are derived from the data, not hardcoded** — [src/utils/dataDateRange.ts](src/utils/dataDateRange.ts) computes `dataMinYear`/`dataMaxYear` (the year `<option>`s in `DateRangeSelector`) and `dataDefaultEndDate` (the default end of the window) from `ridership.json` at module load, so the newest month is always selectable without code changes. `dataDefaultEndDate` is deliberately one month past the latest record to satisfy the exclusive, off-by-one end filter above.
- **Line colors**: official rail/BRT lines have hardcoded brand colors in `definedLines` ([src/utils/lines.ts](src/utils/lines.ts)); all other bus lines get a deterministic golden-angle HSL hue so the chart and map agree.

## Map

[src/components/Map.tsx](src/components/Map.tsx) uses MapLibre GL, loading route geometry from `public/metro_lines.geojson` (served at `/metro_lines.geojson`). It renders two layers: `lines-all` (dimmed) and `lines-selected` (brand colors, filtered by selected line IDs via `setFilter`). Base tiles come from MapTiler if `VITE_MAPTILER_KEY` is set, otherwise OpenFreeMap. The map instance lives in refs (initialized once); selection changes only update the layer filter, not the map.

## Data processing scripts (`scripts/`)

Python scripts maintain the JSON the app consumes (the old `.mjs` versions have been removed). See [scripts/README.md](scripts/README.md). Setup: `pip install -r scripts/requirements.txt`; tests: `pytest scripts/`.

- `update_ridership.py` — **the day-to-day entry point.** Scans `data/raw/`, works out which month/line records are missing, and appends only those (append-only unless `--overwrite`). Prepends an entry to `DATA_RELEASE_NOTES.md` unless `--no-release-notes`. Supports `--dry-run`.
- `process_ridership.py <xlsx|zip|csv.gz>` — the merge engine `update_ridership.py` calls; use it directly to force-ingest one specific file. Merges into `src/data/ridership.json` and appends new lines to `metro_line_metadata_current.json`. New data wins on conflicts; old data backfills.
- `convert_excel_ridership.py` — helper invoked by `process_ridership.py` to parse the `.xlsx` files records requests return into the legacy CSV schema. Also exposed as `npm run load-ridership` for converting Excel inputs directly.
- `fetch_metro_lines.py` (also `npm run fetch-lines`) — downloads GTFS feeds → `public/metro_lines.geojson`. Run before the script tests, which use that file as a fixture.
- `compute_line_distances.py` — `metro_lines.geojson` → `src/data/line_distances.json` (one-way miles; only outbound leg for rail).
- `check_transit_events.py` (also `npm run check-transit-events`) — validates `src/data/transit-events.json`: line_ids exist in the live GTFS feed, and single-line `opening` dates match the first non-zero ridership month. Extensions are flagged for manual review. Offline schema checks also run in `src/data/transit-events.test.ts`.

Store raw files compressed in `data/raw/` — `.zip` for Excel, `.csv.gz` for legacy CSVs; uncompressed `.xlsx`/`.csv` are gitignored. `notebooks/` holds exploration notebooks (`metro_data_ridership_update.ipynb`).

Note `DATA_RELEASE_NOTES.md` (data updates) and `RELEASE_NOTES.md` (app releases) are different files.

## Styling

Tailwind CSS (config in `tailwind.config.ts`). A reusable `.pane` class is used throughout for card containers. Font is Overpass Mono (via `@fontsource-variable`).
