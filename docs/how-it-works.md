# How it works

Read [`CONTEXT.md`](../CONTEXT.md) first. This document uses its vocabulary exactly — **Ridership
View**, **Month Window**, **Line Readout**, **Line Metrics**, **Month Axis** — and those terms mean
something specific here.

## The one idea

The user picks some lines, a stretch of months, and a day of the week. Everything on screen is
derived from those three choices in a single pass, and thrown away when any of them changes.

Nothing is stored. There is no backend, no cache, no incremental update. If you are looking for
where a figure is kept, there isn't one — find where it is *derived* instead.

## The pipeline

Three steps, all reachable from [`src/App.tsx`](../src/App.tsx).

**1 — Lines are built from metadata.** `createLinesData()` in
[`src/hooks/useUserDashboardInput.ts`](../src/hooks/useUserDashboardInput.ts) reads
`metro_line_metadata_current.json`, attaches display names via `getLineNames`, route length from
`line_distances.json`, and sorts with `lineNameSortFunction` — lettered lines first, then numbered.
That sort order is load-bearing: legend order, dataset order and table order all follow it.

A `Line` is `id`, `name`, `former?`, `mode`, `provider`, `selected`, `distanceMiles?`. That is all.
A Line carries **no** derived figures — see step 3.

**2 — One call derives the whole view.** `App` fetches `/ridership.json` at runtime and decodes the
columnar blob with [`src/utils/ridershipData.ts`](../src/utils/ridershipData.ts), then hands the
records to a single `buildRidershipView(...)` inside a `useMemo`. It returns
`{ months, datasets, consolidated, events, metrics, coverage }` — `metrics` and `coverage` keyed by
line id, so every per-line figure exists before anything renders. Until the fetch resolves it
returns an empty view.

The derivation itself — filtering to the Month Window, grouping records by line into **Consolidated
Ridership**, building the shared **Month Axis**, the Chart.js datasets and the event list — lives in
[`src/ridership/buildRidershipView.ts`](../src/ridership/buildRidershipView.ts). The module's only
public surface is [`src/ridership/index.ts`](../src/ridership/index.ts).

**3 — Figures are joined onto lines as Line Readouts.** `buildLineReadouts({ lines, metrics,
coverage })` produces one `LineReadout` per line: the `Line` with the figures *this* window derived
spread over it. `listedReadouts()` narrows that to the rows the table shows. `LineSelector`,
`LineTableRow`, `SummaryData`, `Map` and `mapPopup` all take `LineReadout[]`, never `Line[]`.

A line with no records in the window gets a readout with no figures — spreading `undefined` writes
no keys, so there is nothing to clear. That is the whole point of
[ADR-0005](adr/0005-derived-figures-live-on-line-readouts.md): figures last exactly as long as the
window that produced them, so a stale figure cannot survive a change of window.

There used to be a write-back that stamped derived figures back onto `Line` state. It is gone
(#167). **Prefer a readout over adding a derived field to `Line`** — if you find yourself wanting
one, that is the instinct ADR-0005 exists to catch.

Type definitions live in [`src/@types/metrics.types.ts`](../src/@types/metrics.types.ts)
(`RidershipRecord`, `ConsolidatedRidership`) and
[`src/@types/lines.types.ts`](../src/@types/lines.types.ts) (`LineJson` from disk vs. `Line`).

## The module rule

`src/` is flat — `components/`, `hooks/`, `utils/`, `data/`, `@types/` — with one exception.

**A folder with an `index.ts` is a sealed module. That index is its entire public surface.**
`src/ridership/` and `src/stops/` are the two today. Importing `../ridership/chartData` or
`../stops/buildStopView` from outside the folder is visibly reaching past a seam and should fail
review; go through `index.ts` instead.

Everything else in `src/` is loose by default. A new folder is earned when a body of logic has
invariants a caller must not reach past — not by topical tidiness. See
[ADR-0007](adr/0007-a-folder-with-an-index-is-a-sealed-module.md), and
[diagram 12](architecture/diagrams.md#the-srcridership-seam) for the seam drawn out.

## Conventions and quirks

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
  baselines. [ADR-0009](adr/0009-the-two-window-rules-are-one-rule.md) removed it and regenerated
  those baselines.

- **Every series is drawn against one shared Month Axis.** Lines cover different spans — the D Line
  starts 2025-09, most rail goes back to 2009. Chart.js `CategoryScale` *appends* any label missing
  from `labels` to the end of the axis, so a series drawn against its own months corrupts the
  ordering of every other one. [`chartData.ts`](../src/ridership/chartData.ts) builds the
  chronological union (`buildMonthAxis`), pads each line onto it with `null` (`alignToMonthAxis`),
  and sums the aggregate **by month**, not by array index (`buildAggregateSeries`). Never derive the
  axis from a single dataset, and **don't set `spanGaps`** — a month a line doesn't report is a gap,
  never a zero.

- **Line Metrics measure each line's own span, not the window's.** `lineMetrics()` estimates every
  figure from that line's first and last record *inside* the window, so two rows of the table can
  describe different periods. `buildCoverageByLine` stamps `coveredFrom`/`coveredTo`/
  `isPartialCoverage` alongside them and `LineTableRow` renders a partial-coverage label. The
  metrics deliberately do not *carry* coverage — coverage labels them
  ([ADR-0004](adr/0004-line-metrics-are-one-nullable-shape.md)).

- **All dashboard state syncs to the URL** (`start`, `end`, `day`, `lines`, `q`, `buses`, `trains`,
  `aggregate`, `logs`, `stops`, `measure`, `stop`) so a view is shareable. The canonical set lives in
  [`useUserDashboardInput.ts`](../src/hooks/useUserDashboardInput.ts): read from the URL in lazy
  `useState` initialisers, written back with `history.replaceState` in an effect.
  [`queryParams.ts`](../src/utils/queryParams.ts) only holds the parse/format helpers. **New
  dashboard state must be wired through both** the init readers and the sync effect.

- **The ridership dataset is fetched, not bundled.** `src/data/ridership.json` stays the canonical
  record-format source — the Python pipeline reads and writes it — but the app fetches
  `/ridership.json` at runtime as a minified columnar `{cols,rows}` blob emitted by the
  `ridership-data` plugin ([`vite/ridership-data-plugin.ts`](../vite/ridership-data-plugin.ts)).
  Selectable date bounds come from that plugin's `virtual:ridership-bounds`, so the full dataset
  never enters the JS bundle. The plugin is registered in **both** `vite.config.ts` and
  `vitest.config.ts`. `OutputArea` is lazy-loaded to keep MapLibre out of the entry chunk. Run
  `ANALYZE=1 npm run build` for a treemap at `dist/stats.html`.

- **Date bounds are derived from the data, not hardcoded.**
  [`dataDateRange.ts`](../src/utils/dataDateRange.ts) computes `dataMinYear`/`dataMaxYear` and
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

  - [`src/chart/rangeSelect.ts`](../src/chart/rangeSelect.ts) — `args.replay` in `afterEvent`.
    Without it a repaint re-armed the press and the next mouse move painted a band nobody dragged.
  - [`src/chart/eventGutter.ts`](../src/chart/eventGutter.ts) — the same, added later. Without it a
    replayed `click` re-answered the pin under the release-first rule (ADR-0011), and a replayed
    `mousemove` put the hover back on the Month the reader had just left.
  - the tooltip's `external` in [`src/components/RidershipChart.tsx`](../src/components/RidershipChart.tsx)
    — not a plugin hook and so easily missed. **Chart.js passes `replay` here too, at runtime, but
    its published types declare only `{ chart, tooltip }`**, so the flag has to be read through a
    local widening (`TooltipExternalArgs`). That omission is why this one went unguarded longest.

  Anything new that reads pointer state needs the same guard.

- **Line colours.** Official rail and BRT lines have hardcoded brand colours in `definedLines`
  ([`src/utils/lines.ts`](../src/utils/lines.ts)); every other bus line gets a deterministic
  golden-angle HSL hue, so the chart and the map always agree.

## Stop-level ridership

Everything above is per **line**. `src/stops/` is the same shape one grain down, per **Stop Place**,
and it is a second sealed module for the reason the first one is: every reader of the stop grain
reads one derivation, so the stop-key ↔ coordinate join and the Month Window filter must happen in
one place or two readers disagree about which stops exist and which months are on screen.

**One call again.** `buildStopView({ records, places, lineIds, startDate, endDate, dayOfWeek,
measure })` returns `{ months, readouts, markers, coverage }`. `markers` is a GeoJSON
`FeatureCollection` ready for `setData`, with **radius and colour as feature properties the module
computed** — drawn by the map layer, which arrives with the circle layer.

`useStopView` ([`src/hooks/useStopView.ts`](../src/hooks/useStopView.ts)) is the fetch side, and
`OutputArea` is its only importer, so everything it pulls lands in that lazy chunk or behind a
further dynamic import. The panel itself is `#stop-panel`, opened with `stops=1`.

- **The stop table is a multi-select, and it copies the line selector's chrome.** A checkbox per
  row, a search bar above the table, `Select All` / `Clear All` under it — `LineFilters`'s three
  controls in `LineFilters`'s arrangement. They share the asymmetry too: `Select All` reaches only
  the rows the search lists and adds to the selection, while `Clear All` clears globally and leaves
  the search text alone. Neither table caps its selection; the search narrows `Select All`.

- **The Stop Selection is an ordered set of stop keys**, comma-joined into `stop=`, with the search
  in `stopq=`. Order is kept because it is what will fix each stop's colour, so a stop picked later
  is appended rather than inserted. The table's grain is stop × line, so a stop served by two
  selected lines is picked once and occupies two rows.

- **The lazy-load rule is a gate on intent.** Rail (89 KB) loads when the panel is on. Bus (5.3 MB)
  loads only when the panel is on, the Month Window overlaps the Stop Coverage Window, **and** a
  selected line is not one the rail payload serves. `stop_locations.json` (1.6 MB) is `import()`ed
  into its own async chunk. **Neither payload goes near `App`'s `/ridership.json` effect** — the
  first-paint path, which `OutputArea` is lazy to keep large things off. `ANALYZE=1 npm run build`
  gates this: the stop payloads must be emitted assets and never inside a `dist/assets/*.js`.

- **G Line (901) and J Line (910) BRT live in the *bus* payload** while the app lists them under the
  train filter, because the split is by source export. So "is this a bus line" is the wrong gate on
  the bus fetch; the question asked instead is whether the **rail payload** already serves the line,
  answered from the rail records. The mode *filter* likewise keys off
  `metro_line_metadata_current.json`, never off which file a row came from.

- **The Stop Coverage Window is stated, never enforced.** Stop data covers twelve months inside the
  chart's 2009 → 2026, so the panel names both spans persistently, labels partial coverage in the
  line table's own words, and where the window reaches no stop data offers a button that moves it
  through the same setters a chart drag uses. It **never** clamps or widens the window, because that
  would make one URL mean two things.

## The map

[`src/components/Map.tsx`](../src/components/Map.tsx) uses MapLibre GL and loads route geometry from
`public/metro_lines.geojson`. Two layers: `lines-all` (dimmed, and the only unfiltered one — it
draws the whole network) and `lines-selected` (brand colours), filtered by the selected line ids via
`setFilter`. Base tiles come from MapTiler when `VITE_MAPTILER_KEY` is set, otherwise OpenFreeMap.

The map instance lives in a ref and is initialised once. **Selection changes only update the layer
filter** — the map itself is never rebuilt. The pointer handlers are registered once in `load`,
because a layer-scoped MapLibre listener is delegated and resolves its layer at event time.

`Map.tsx` publishes the live instance as `window.__metroMap`. Nothing in the app reads it; it is a
test seam, and it is the only way to await a WebGL canvas or inspect what actually rendered. Don't
delete it. See [the testing guide](guides/testing.md#the-map-suite).

## Where to go next

- [`docs/README.md`](README.md) — every document, and what to read when
- [`docs/architecture/diagrams.md`](architecture/diagrams.md) — 21 diagrams; start with
  01-whole-system and 05-runtime-load-and-derive
- [`docs/adr/`](adr/) — the reasoning behind everything above
- [`docs/guides/testing.md`](guides/testing.md) — before you change anything visual
