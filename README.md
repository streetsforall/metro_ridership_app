# Metro Ridership App

A client-side dashboard for exploring LA Metro bus and rail ridership over time, built by
[Streets for All](https://streetsforall.org)'s Data/Dev Team. Pick some lines, a stretch of months
and a day of the week; the chart, the per-line figures, the map highlighting and the context log are
all derived from that one set of choices.

React + Vite, no backend. The repository is the database and `dist/` is the whole deployment. It may
become full-stack if the data processing gets too heavy.

This file is the whole documentation set. Everything a contributor needs is below: the vocabulary,
how the derivation runs, how to update the data, and how to test.

## Quickstart

Requires **Node 22** — the repo pins `22.23.2` in [`.node-version`](.node-version), which
`fnm`/`nvs`/`asdf` read automatically, and CI uses the same file.

```bash
npm install
npm run dev
```

The app runs at **`https://localhost:5173`**. Note the `https` —
[`@vitejs/plugin-basic-ssl`](https://www.npmjs.com/package/@vitejs/plugin-basic-ssl) is enabled for
`vite serve`, so your browser warns about the self-signed certificate the first time. Accept it and
carry on.

```bash
npm run lint     # eslint
npm run test     # vitest, once
npm run build    # tsc -b, then vite build → dist/
npm run preview  # serve the production build at https://localhost:4173
```

Those four are what CI gates on. Run them before opening a PR.

Python 3 is needed only for the data-processing scripts, and Docker only for regenerating visual
baselines. Neither is required to run the app.

## Terms

These words mean something specific, and the code should use them. Where a term here conflicts with
a name in the source, the term wins and the source is out of date.

**Ridership Record** — one line's reported ridership for one month, carrying a separate figure for
each Day Of Week. *Not* a data point, a row, or an entry.

**Day Of Week** — which of the three reported figures (weekday, Saturday, Sunday) a view reads.
Choosing one does not filter records; it selects which field of each record is used.

**Month** — a year and a month number, nothing finer. Counted from 1, matching the data, the URL and
the events file. A Month is never a point in time, because a timestamp carries a day and a timezone
that a month does not have, and two timestamps for the same month can disagree about which month it
is. *Not* a date, a timestamp, or a `Date`.

**Line** — a Metro bus or rail service, identified by its numeric id. Carries display name, brand
colour, mode and route length. A Line's identity comes from metadata, not from ridership data, so a
Line with no records in the window is still a Line. A Line carries **no** derived figures.

**Ridership View** — everything on screen that follows from one set of user choices: the month axis,
the per-line series, the aggregate, the per-line record groups, each line's summary figures and
covered span, and the context-log events. Derived, never stored, and recomputed whole whenever any
choice changes.

**Month Window** — the stretch of months a Ridership View covers, chosen as a start month and an end
month. **Inclusive of both ends.** The Event Window — which months a Transit Event must fall in to
appear in the context log — is the same rule and the same bounds, reached through a different code
path.

**Month Axis** — the chronologically ordered union of every month covered by the selected lines. One
axis is shared by every series, because a series drawn against its own months corrupts the ordering
of the others. A month a line does not report is a **gap**, never a zero.

**Consolidated Ridership** — the records of a Month Window grouped by line, each group carrying
whether that line was selected when the grouping happened. Feeds the sparklines, the CSV export and
each line's Line Metrics.

**Line Metrics** — the five summary figures one Line's records yield for the chosen Day Of Week:
average, absolute change, starting and ending ridership, riders per mile. Estimated from that line's
own first and last record inside the window, **not** from the window's endpoints. A Line reporting
no records has **no** metrics at all, rather than zeroes.

**Line Readout** — one Line together with everything the current view derives about it: its metrics
and the span its records cover. Derived per window and thrown away, so a figure from an earlier
window cannot survive a change of window. The map popup, the summary panel and the table all read
Line Readouts.

**Transit Event** — a dated real-world change (an opening, an extension, a disruption, a service
change) that explains a movement in the numbers. An event with no line ids is system-wide.

**Event Gutter** — the strip below the Month Axis rule where a month's events are drawn, one
triangle per distinct category. Chart.js does not hit-test outside its plot area, so the gutter's
pointer handling belongs to the plugin that draws it.

**Month Readout** — what the chart says about one Month: ridership per Line, then the events that
Month carries, one at a time through an **Event Carousel**. Two layouts, chosen from the width the
chart measures for itself rather than the viewport: a floating box beside the crosshair, or — below
the threshold — a top strip above the plot, capped at a third of its height with an **Expand**
control.

**Pinned Month** — the single sticky Month the chart, the readout and the context-log panel all
read. At most one exists, and it must be released before another can be taken. Releasing it
dismisses the readout rather than demoting it to a hovering one, because on a touch screen there is
no hover to fall back on. A pin marks what is read; it never opens or scrolls a view to be seen.

**Range Selection** — the drag across the plot that sets the Month Window, and the band drawn during
it. It begins only once the pointer has travelled far enough to be a drag rather than a click.
Mouse-only, because a horizontal drag across a chart is how a page is scrolled on a phone. **Never
named with *window***, which already belongs to the Month Window.

## A caution about the data

Not every **Line** reports for the same span of months. Lines are added and discontinued, and a line
can appear late because the source data only began breaking it out separately — the D Line starts
2025-09 while most rail goes back to 2009.

The chart handles this: every series is drawn against one shared **Month Axis**, and a month a line
doesn't report is a gap, never a zero.

The summary table is different, deliberately. **Line Metrics** are estimated from each line's *own*
first and last **Ridership Record** inside the window, not from the window's endpoints — so two rows
can describe different periods, and the table labels that rather than pretending otherwise. Tracked
in [issue #88](https://github.com/streetsforall/metro_ridership_app/issues/88).

## How it works

### The one idea

The user picks some lines, a stretch of months, and a day of the week. Everything on screen is
derived from those three choices in a single pass, and thrown away when any of them changes.

Nothing is stored. There is no backend, no cache, no incremental update. If you are looking for
where a figure is kept, there isn't one — find where it is *derived* instead.

### The pipeline

Three steps, all reachable from [`src/App.tsx`](src/App.tsx).

**1 — Lines are built from metadata.** `createLinesData()` in
[`src/hooks/useUserDashboardInput.ts`](src/hooks/useUserDashboardInput.ts) reads
`metro_line_metadata_current.json`, attaches display names via `getLineNames`, route length from
`line_distances.json`, and sorts with `lineNameSortFunction` — lettered lines first, then numbered.
That sort order is load-bearing: legend order, dataset order and table order all follow it.

A `Line` is `id`, `name`, `former?`, `mode`, `provider`, `selected`, `distanceMiles?`. That is all.
A Line carries **no** derived figures — see step 3.

**2 — One call derives the whole view.** `App` fetches `/ridership.json` at runtime and decodes the
columnar blob with [`src/utils/ridershipData.ts`](src/utils/ridershipData.ts), then hands the
records to a single `buildRidershipView(...)` inside a `useMemo`. It returns
`{ months, datasets, consolidated, events, metrics, coverage }` — `metrics` and `coverage` keyed by
line id, so every per-line figure exists before anything renders. Until the fetch resolves it
returns an empty view.

The derivation itself — filtering to the Month Window, grouping records by line into **Consolidated
Ridership**, building the shared **Month Axis**, the Chart.js datasets and the event list — lives in
[`src/ridership/buildRidershipView.ts`](src/ridership/buildRidershipView.ts). The module's only
public surface is [`src/ridership/index.ts`](src/ridership/index.ts).

**3 — Figures are joined onto lines as Line Readouts.** `buildLineReadouts({ lines, metrics,
coverage })` produces one `LineReadout` per line: the `Line` with the figures *this* window derived
spread over it. `listedReadouts()` narrows that to the rows the table shows. `LineSelector`,
`LineTableRow`, `SummaryData`, `Map` and `mapPopup` all take `LineReadout[]`, never `Line[]`.

A line with no records in the window gets a readout with no figures — spreading `undefined` writes
no keys, so there is nothing to clear. Figures last exactly as long as the window that produced
them, so a stale figure cannot survive a change of window.

There used to be a write-back that stamped derived figures back onto `Line` state. It is gone
(#167). **Prefer a readout over adding a derived field to `Line`.**

Type definitions live in [`src/@types/metrics.types.ts`](src/@types/metrics.types.ts)
(`RidershipRecord`, `ConsolidatedRidership`) and
[`src/@types/lines.types.ts`](src/@types/lines.types.ts) (`LineJson` from disk vs. `Line`).

### The module rule

`src/` is flat — `components/`, `hooks/`, `utils/`, `data/`, `@types/` — with one exception.

**A folder with an `index.ts` is a sealed module. That index is its entire public surface.**
`src/ridership/` is the only one today. Importing `../ridership/chartData` from outside the folder
is visibly reaching past a seam and should fail review; go through `index.ts` instead.

Everything else in `src/` is loose by default. A new folder is earned when a body of logic has
invariants a caller must not reach past — not by topical tidiness.

### Conventions and quirks

These are the things that look like bugs and aren't.

- **`DayOfWeek` is a JSON column name, not a label.** `daysOfWeek` maps
  `Weekday`/`Saturday`/`Sunday` onto `est_wkday_ridership`/`est_sat_ridership`/`est_sun_ridership`.
  Choosing a day does not filter records; it selects which field of each record is read.

- **The date range is inclusive on both ends, and there is only one rule.** `contains` in
  `src/utils/month.ts` states it; the chart, the stop panel and the context log all reach it through
  a thin adapter in `src/ridership/`. If you find a second copy of this rule anywhere, that is the
  bug.

  It used to be two rules. The chart excluded the end month and the month before it — `S ≤ R ≤ E − 2`
  — while the context log was inclusive, so the log ran two months past the chart's right-hand edge
  for the same date range. The offset was an accident of `new Date(year, month)` treating the month
  as 0-based where the data is 1-based, and it survived for years because it was pinned by chart
  baselines.

- **Every series is drawn against one shared Month Axis.** Lines cover different spans — the D Line
  starts 2025-09, most rail goes back to 2009. Chart.js `CategoryScale` *appends* any label missing
  from `labels` to the end of the axis, so a series drawn against its own months corrupts the
  ordering of every other one. [`chartData.ts`](src/ridership/chartData.ts) builds the
  chronological union (`buildMonthAxis`), pads each line onto it with `null` (`alignToMonthAxis`),
  and sums the aggregate **by month**, not by array index (`buildAggregateSeries`). Never derive the
  axis from a single dataset, and **don't set `spanGaps`** — a month a line doesn't report is a gap,
  never a zero.

- **Line Metrics measure each line's own span, not the window's.** `lineMetrics()` estimates every
  figure from that line's first and last record *inside* the window, so two rows of the table can
  describe different periods. `buildCoverageByLine` stamps `coveredFrom`/`coveredTo`/
  `isPartialCoverage` alongside them and `LineTableRow` renders a partial-coverage label. The
  metrics deliberately do not *carry* coverage — coverage labels them.

- **All dashboard state syncs to the URL** (`start`, `end`, `day`, `lines`, `q`, `buses`, `trains`,
  `aggregate`, `logs`) so a view is shareable. The canonical set lives in
  [`useUserDashboardInput.ts`](src/hooks/useUserDashboardInput.ts): read from the URL in lazy
  `useState` initialisers, written back with `history.replaceState` in an effect.
  [`queryParams.ts`](src/utils/queryParams.ts) only holds the parse/format helpers. **New
  dashboard state must be wired through both** the init readers and the sync effect.

- **The ridership dataset is fetched, not bundled.** `src/data/ridership.json` stays the canonical
  record-format source — the Python pipeline reads and writes it — but the app fetches
  `/ridership.json` at runtime as a minified columnar `{cols,rows}` blob emitted by the
  `ridership-data` plugin ([`vite/ridership-data-plugin.ts`](vite/ridership-data-plugin.ts)).
  Selectable date bounds come from that plugin's `virtual:ridership-bounds`, so the full dataset
  never enters the JS bundle. The plugin is registered in **both** `vite.config.ts` and
  `vitest.config.ts`. `OutputArea` is lazy-loaded to keep MapLibre out of the entry chunk. Run
  `ANALYZE=1 npm run build` for a treemap at `dist/stats.html`.

- **Date bounds are derived from the data, not hardcoded.**
  [`dataDateRange.ts`](src/utils/dataDateRange.ts) computes `dataMinYear`/`dataMaxYear` and
  `dataDefaultEndDate` at module load, so the newest month is always selectable without a code
  change. `dataDefaultEndDate` is deliberately one month past the latest record, to satisfy the
  exclusive end filter above.

- **Two `JSON.stringify` dependency guards in `LineTableRow` are intentional.**
  `ridershipRecords` and `chartDataset` get a new reference every render; stringifying them in the
  dep array is what stops the sparkline effect thrashing. `monthAxis` sits in the same array
  unstringified because `LineSelector` memoises it. Don't "fix" these.

- **Everything that reads pointer state ignores replayed events.** `Chart#update` finishes by
  replaying `_lastEvent` through the whole event pipeline, and `determineLastEvent` keeps the
  *previous* event across a click — so after a press and release, `_lastEvent` is still the
  `mousedown`. It also keeps the previous event whenever the pointer is outside `chartArea`, which
  the Event Gutter always is. Every repaint therefore re-delivers a stale gesture, and pinning a
  Month is a repaint.

  Three paths read pointer state and all three return on the replay flag:

  - [`src/chart/rangeSelect.ts`](src/chart/rangeSelect.ts) — `args.replay` in `afterEvent`.
    Without it a repaint re-armed the press and the next mouse move painted a band nobody dragged.
  - [`src/chart/eventGutter.ts`](src/chart/eventGutter.ts) — the same, added later. Without it a
    replayed `click` re-answered the pin under the release-first rule, and a replayed `mousemove`
    put the hover back on the Month the reader had just left.
  - the tooltip's `external` in
    [`src/components/RidershipChart.tsx`](src/components/RidershipChart.tsx) — not a plugin hook and
    so easily missed. **Chart.js passes `replay` here too, at runtime, but its published types
    declare only `{ chart, tooltip }`**, so the flag has to be read through a local widening
    (`TooltipExternalArgs`). That omission is why this one went unguarded longest.

  Anything new that reads pointer state needs the same guard.

- **Line colours.** Official rail and BRT lines have hardcoded brand colours in `definedLines`
  ([`src/utils/lines.ts`](src/utils/lines.ts)); every other bus line gets a deterministic
  golden-angle HSL hue, so the chart and the map always agree.

### The map

[`src/components/Map.tsx`](src/components/Map.tsx) uses MapLibre GL and loads route geometry from
`public/metro_lines.geojson`. Two layers: `lines-all` (dimmed) and `lines-selected` (brand colours,
filtered by selected line ids via `setFilter`). Base tiles come from MapTiler when
`VITE_MAPTILER_KEY` is set, otherwise OpenFreeMap.

The map instance lives in a ref and is initialised once. **Selection changes only update the layer
filter** — the map itself is never rebuilt.

`Map.tsx` publishes the live instance as `window.__metroMap`. Nothing in the app reads it; it is a
test seam, and it is the only way to await a WebGL canvas or inspect what actually rendered. Don't
delete it.

## The data pipeline

Ridership data comes from LA Metro via a California Public Records Act request, which returns
monthly Excel files (`MM-YYYY-{Bus|Rail}.xlsx`) and per-year zip archives.

### Python setup

```bash
pip install -r scripts/requirements.txt
```

Dependencies: `requests` (HTTP), `pandas` + `numpy` (data processing), `openpyxl` (reading the
`.xlsx` files records requests return), `pytest` (tests).

### Getting the data

LA Metro does not publish a bulk ridership download. Submit a CPRA request at
<https://lametro.nextrequest.com/requests/new>, asking for ridership for all train and bus lines
from one month after the last month already in `src/data/ridership.json` through the most recent
month available, citing <https://opa.metro.net/MetroRidership/>. Turnaround has been about three
days. The full request text is in [`scripts/README.md`](scripts/README.md).

### The usual path

Drop the new files in `data/raw/`, then:

```bash
python scripts/update_ridership.py
```

It scans `data/raw/`, works out which month/line records are missing, and appends only those —
append-only unless you pass `--overwrite`. To see what it would do without writing anything:

```bash
python scripts/update_ridership.py --dry-run
```

To force-ingest one specific file, call the merge engine directly:

```bash
python scripts/process_ridership.py data/raw/2026-04_2026-05.zip
python scripts/process_ridership.py data/raw/04-2026-Bus.xlsx
python scripts/process_ridership.py data/raw/Monthly_Riders.csv.gz   # legacy CSV format
```

New data wins on conflicts; old data backfills.

### What it writes

- **`src/data/ridership.json`** — flat array of monthly ridership records (year, month, line,
  weekday/Saturday/Sunday averages). Canonical, and what the Vite plugin re-encodes into the
  columnar blob the app fetches.
- **`src/data/metro_line_metadata_current.json`** — the line catalog (line number, mode, provider),
  updated automatically when new lines appear in the data.
- **[`DATA_RELEASE_NOTES.md`](DATA_RELEASE_NOTES.md)** — a dated entry is prepended whenever new
  months are added. Suppress with `--no-release-notes`.

Commit raw files compressed — `.zip` for Excel, `.csv.gz` for legacy CSVs. Uncompressed `.xlsx` and
`.csv` are gitignored.

### The other scripts

| Script | Does |
| --- | --- |
| `convert_excel_ridership.py` | Parses the `.xlsx` files into the legacy CSV schema. Called by `process_ridership.py`; also `npm run load-ridership`. |
| `fetch_metro_lines.py` | GTFS feeds → `public/metro_lines.geojson`. Also `npm run fetch-lines`. Run it before the script tests, which use that file as a fixture. |
| `fetch_stop_locations.py` | Stop geometry → `src/data/stop_locations.json`. Also `npm run fetch-stops`. |
| `compute_line_distances.py` | `metro_lines.geojson` → `src/data/line_distances.json` (one-way miles; outbound leg only for rail). |
| `stop_identity.py` | Canonicalises stop names across sources, using `scripts/stop_aliases.json`. |
| `stop_ridership.py` | Derives per-stop ridership from the stop-level source data. |
| `check_transit_events.py` | Validates `src/data/transit-events.json` — line ids exist in the live GTFS feed, and single-line `opening` dates match the first non-zero ridership month. Extensions are flagged for manual review. Also `npm run check-transit-events`. Offline schema checks run separately in `src/data/__tests__/transit-events.test.ts`. |

### Python tests

```bash
pytest scripts/
```

They live in `scripts/tests/`, one `test_<script>.py` per script. They import the modules under test
by bare name (`import process_ridership`) because `scripts/` is a flat directory of standalone entry
points, not a package — so `scripts/tests/conftest.py` puts `scripts/` on `sys.path`. Delete that
file and every import breaks at collection.

Run `npm run fetch-lines` first — several script tests use `public/metro_lines.geojson` as a
fixture.

### The deep reference

[`scripts/README.md`](scripts/README.md) documents each script in full: the leaf-row rule, the
`stop_aliases.json` scheme, the stop-ridership wire format and its rename guard, and why stop sums
do not exactly reconcile with `ridership.json`. Read it before changing any of them.

### After a data update

A new month of data moves some visual baselines. `dataDefaultEndDate` is computed from
`ridership.json` at module load, so a new month shifts the default Month Window and the year
`<option>`s in the date selector. Specs that pin an explicit window in their query string are
unaffected; a spec that lands on the new default is not, so regenerate its baselines in the same
change.

## Testing

Two suites, and only one of them is in this repository.

### Unit and component tests

```bash
npm run test        # run all tests once
npm run test:watch  # watch mode
```

Vitest with `@testing-library/react`, jsdom. Specs live in a `__tests__/` folder inside the
directory they cover — `src/ridership/lineMetrics.ts` is tested by
`src/ridership/__tests__/lineMetrics.test.ts` — so a source directory lists only source. Imports are
therefore one level deeper than the module: `'../lineMetrics'` for the subject,
`'../../test/builders'` for shared fixtures. **`vi.mock()` paths obey the same rule**, and get it
wrong and the mock silently does nothing rather than failing.

`vitest.config.ts` sets no `include`, so the default glob picks up `__tests__/` at any depth; it
excludes `e2e/**` (Playwright's) and `.claude/**` (throwaway worktrees).

**Import `describe`/`it`/`expect` from `vitest` in every spec.** `vitest.config.ts` does set
`globals: true`, so the runtime would not need them — but `tsconfig.app.json` does not list
`vitest/globals` under `types`, so `tsc -b` cannot see them and `npm run build` fails on a spec that
omits the import. Runtime globals and type-level globals are separate switches and only one is on.

One file:

```bash
npx vitest run src/ridership/__tests__/lineMetrics.test.ts
```

Or filter by name with `-t`. Shared fixtures are in [`src/test/builders.ts`](src/test/builders.ts).

The `ridership-data` Vite plugin is registered in `vitest.config.ts` as well as `vite.config.ts`,
because tests that touch the date bounds need `virtual:ridership-bounds` to resolve.

**Only some of these suites are committed.** The derivation, the helpers, the bundled data and the
build plugins are tracked and gate CI — `src/ridership/`, `src/utils/`, `src/data/`, `src/hooks/`
and `vite/`. The rendering suites — `src/components/`, `src/chart/`, `src/stops/` and the top-level
`App` spec — are gitignored and live only on the machines that have them, so a local `npm run test`
runs more files than CI does.

### Visual regression lives locally

Playwright screenshots the app and compares against baselines. The whole suite — `e2e/`,
`playwright.config.ts` and the baseline PNGs — is **gitignored**, so it runs on a developer machine
and not in CI.

```bash
npm run test:e2e               # run the suite (builds, serves, compares)
npm run test:e2e:ui            # interactive UI / trace viewer
npm run test:e2e:update        # rewrite baselines for YOUR platform
npm run test:e2e:update:linux  # rewrite the Linux baselines (needs Docker)
```

Tests run against the production build served by `vite preview`, not the dev server.
`npm run test:e2e` builds automatically. Note that `vite preview` is **HTTPS** — `basicSsl` runs for
`command === 'serve'`, which covers preview — which is why the config sets `ignoreHTTPSErrors` and
`NODE_TLS_REJECT_UNAUTHORIZED=0`.

Two rules survive the move out of git, because they are about the technique rather than the
plumbing:

- **Never regenerate baselines to silence a diff you can't explain** — that deletes the evidence.
  `--update-snapshots` will happily bake a *wrong* view into a green baseline, which is why a shot
  whose subject is the point of the test asserts that subject in the DOM before capturing. The
  screenshot pins the pixels; the assertions pin what the pixels are *of*.
- **A DOM assertion is not a visibility assertion.** `toContainText` passes on a node scrolled out
  of an `overflow-y-auto` box, and `toBeVisible` passes on one merely clipped by an ancestor — so a
  subject can be asserted, present, and absent from every pixel of the capture. When a subject can
  be scrolled or clipped, assert the layout that puts it on screen, not only the text.

`src/components/Map.tsx` publishes the live map as `window.__metroMap` so the map spec can await
MapLibre's `idle` event on it. It is a test seam nothing in the app reads. **Don't delete it** even
though the spec that uses it is no longer in the repository.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every pull request and every push to
`main`, as a single **`build`** job on `ubuntu-latest` gating `npm run lint`, `npm run test` and
`npm run build`.

Visual regression is not in CI. Playwright and its baselines live on developer machines, so a UI
regression is caught by whoever runs the suite before opening a PR — not by the pipeline.

| Symptom | Cause | Fix |
| --- | --- | --- |
| `build`: `tsc -b` errors | A type error in tracked source or a tracked spec | Fix the types; `npm run build` reproduces it exactly. |
| `build` passes locally but fails in CI | Node version mismatch | CI reads [`.node-version`](.node-version) (`22.23.2`). Match it locally with `fnm use`. |
| `build`: `npm run test` fails on a file you don't have | A tracked spec imports something untracked | Everything a tracked spec imports must be tracked too — `src/test/builders.ts` and `src/test-setup.ts` especially. |
| `npm run test` passes locally but not in CI | Local also runs the gitignored rendering suites | Reproduce CI's set with a clean clone of the repo. |
| You added a build-time env var (`VITE_*`) | Only the `build` job compiles the app | Add it to that job's `env:`. (`VITE_MAPTILER_KEY` is optional — the app falls back to OpenFreeMap — so no secret is required today.) |

Nothing in CI checks that this README still describes the code. See
[`CONTRIBUTING.md`](CONTRIBUTING.md) for the one manual step that substitutes.

## What lives where

| Path | Holds |
| --- | --- |
| `src/ridership/` | The derivation. A sealed module — `index.ts` is its whole public surface. |
| `src/components/` | Eight components. |
| `src/hooks/` | `useUserDashboardInput` — all shared state, in one hook. |
| `src/utils/` | Loose helpers: lines, month, query params, date bounds, map popup. |
| `src/data/`, `src/@types/` | Bundled JSON — including canonical `ridership.json` — and the domain types. |
| `src/test/` | Shared vitest fixtures. |
| `data/raw/` | The Excel and CSV files LA Metro returns to a public-records request, compressed. |
| `scripts/` | The Python data pipeline that turns those into `src/data/`, with a `test_*.py` per script in `scripts/tests/`. |
| `vite/` | The `ridership-data` and `stop-ridership` plugins, which keep the datasets out of the JS bundle. |

Some directories sit on a developer machine but deliberately not in git: `e2e/` (Playwright and its
baselines), `docs/` (ADRs, architecture diagrams, agent notes) and the rendering test suites.
`.gitignore` lists them, and none of them are needed to build or run the app.
