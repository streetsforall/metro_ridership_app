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
monthly Excel files and per-year zip archives. `scripts/` is a flat directory of standalone Python
entry points — not a package — that turns those into the JSON the app ships.

### Python setup

```bash
pip install -r scripts/requirements.txt
```

Dependencies: `requests` (HTTP), `pandas` + `numpy` (data processing), `openpyxl` (reading the
`.xlsx` files records requests return), `pytest` (tests).

### Getting the data

LA Metro does not publish a bulk ridership download, so new data comes from a CPRA request.
Turnaround has been about three days.

1. Go to <https://lametro.nextrequest.com/requests/new>
2. Use this text, updating the start month to one month after the last month already in
   `src/data/ridership.json`:

   > Hello, I would like to make a public records request for LA Metro ridership for all train
   > lines and bus lines. This would be from the month of **[MONTH YEAR]** to the most recent
   > month possible. It's based on this LA Metro website that has ridership data.
   > https://opa.metro.net/MetroRidership/

Metro's Public Records Requests department (point of contact: William Cano, Principal
Transportation Planner) releases the data as individual monthly Excel files named `MM-YYYY.xlsx`,
or zip archives for bulk years such as `Rail 2025.zip` and `Bus 2025.zip`.

### The usual path

Drop the new files in `data/raw/`, then:

```bash
python scripts/update_ridership.py                              # scan data/raw/, add new months
python scripts/update_ridership.py --dry-run                    # report what's new, write nothing
python scripts/update_ridership.py --overwrite                  # let newer numbers replace existing months
python scripts/update_ridership.py --no-release-notes
python scripts/update_ridership.py --no-stops                   # line grain only
python scripts/update_ridership.py data/raw/2026-04_2026-05.zip # limit to given paths
```

It scans `data/raw/` for every zip/Excel/CSV, works out which month/line records aren't in
`ridership.json` yet, and adds only those. Existing records are left untouched unless you pass
`--overwrite`.

The same scan feeds the **stop grain** through `stop_ridership.py` under the same append-only
semantics, so the two grains can never see different months. The stop step runs *before* the "no new
data" return, because the stop payloads can be behind — or absent, as on a fresh clone — while
`ridership.json` is already current. It fails the run on a suspected rename; see
[the rename guard](#the-rename-guard).

Under the hood it reuses `process_ridership.py` for parsing and merging. Call that directly when you
want to force-ingest one specific file:

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
- **`src/data/stop_ridership.{bus,rail}.json`** — the stop grain, 5.3 MB / 105,984 rows / 6,785
  stops / 109 lines for bus, and 89 KB / 1,470 rows / 110 stops / 6 lines for rail.
- **[`DATA_RELEASE_NOTES.md`](DATA_RELEASE_NOTES.md)** — a dated entry is prepended whenever new
  months are added. Suppress with `--no-release-notes`.

### Storing raw files

Commit them compressed; uncompressed `.xlsx` and `.csv` in `data/raw/` are gitignored.

```bash
gzip -k Monthly_Riders.csv && mv Monthly_Riders.csv.gz data/raw/   # legacy CSV
zip data/raw/YYYY-MM_YYYY-MM.zip data/raw/*.xlsx                   # Excel
```

```powershell
Compress-Archive -Path data/raw/*.xlsx -DestinationPath data/raw/YYYY-MM_YYYY-MM.zip -Force
Expand-Archive data/raw/2026-01_2026-03.zip -DestinationPath data/raw/
```

### `process_ridership.py`

Merges raw data into `ridership.json` and `metro_line_metadata_current.json`. It accepts Excel — a
single `MM-YYYY-{Bus|Rail}.xlsx`, or a date-range zip of them — which `convert_excel_ridership.py`
parses into the legacy CSV schema first. It also accepts that CSV directly, from older requests:

```
Year, Month, Line, DayType, Riders, Shakeup, Provider, Mode, Days
```

`DayType` is `DX` (weekday), `SA` (Saturday) or `SU` (Sunday).

Five steps: weighted-average ridership across shakeup periods within a month, matching Metro's
rounding; pivot long format into separate weekday/Saturday/Sunday columns; fill missing line × month
combinations with `0`; merge with the existing `ridership.json`, new data winning on conflicts and
old data backfilling gaps; append any newly seen lines to the metadata catalog.

### `convert_excel_ridership.py`

Converts the Excel files into that CSV schema, summing stop/station boardings to per-line totals,
and chains straight into `process_ridership.py`. Also `npm run load-ridership`:

```bash
npm run load-ridership -- "data/raw/Bus 2025.zip" "data/raw/Rail 2025.zip"
npm run load-ridership -- data/raw/01-2026-Bus.xlsx data/raw/01-2026-Rail.xlsx
npm run load-ridership -- data/raw/                  # globs loose .xlsx only
```

Run it from the repo root so the chained step can find `src/data/`. Directory mode globs loose
`.xlsx` only — the committed `.zip` archives must be named explicitly.

**Rail is aggregated by `ROUTE`, not `LINE`.** Metro nests distinct routes under a shared `LINE`
grouping — notably ROUTE 805 (D/Purple) under LINE 802 (B/Red). Grouping by ROUTE reports each as
its own line instead of summing the Purple Line's riders into the Red Line's total. Single-route
lines are unaffected, their ROUTE equalling their LINE. The breakdown only exists in the source from
2025-09 onward, so line 802 is Red+Purple combined before then and Red-only after.

#### The leaf-row rule lives in one place

The export interleaves aggregate **"Total"** rows at several levels — a direction-total per stop for
Bus, and for Rail both a line-total row (`ROUTE == "Total"`) and a route-total row
(`STATION_ORDER == "Total"`). Summing without dropping those double-counts everything.

`extract_leaf_rows(df, mode)` is the single source of truth for which rows are real observations,
and it carries the ROUTE-over-LINE resolution too. `aggregate_to_line_ridership` and
`aggregate_to_stop_ridership` are both thin wrappers over it, so the rule cannot drift between them
the next time Metro changes the export layout — and in particular the D Line's stations cannot end
up filed under the B Line at one grain but not the other.

#### `aggregate_to_stop_ridership`

The same raw frame, reduced to one row per line per stop instead of one row per line:

```
year, month, mode, line, stop_key, stop_name, station_order,
wd_ons, wd_offs, sa_ons, sa_offs, su_ons, su_offs
```

- **Alightings (`*_OFFS`) are kept.** The line-level path discards them. In UI copy they are
  **Boardings** and **Alightings**, never "ons"/"offs" — the pipeline column names keep the export's
  vocabulary, the interface does not.
- **`*_ACT` is dropped.** It equals ons + offs, so it is a third of the payload for one client-side
  addition.
- **Bus direction is collapsed.** `STOP_NAME` is a name, not a `stop_id`, so both sides of a street
  share one name and therefore one coordinate — they could not be drawn apart even if kept separate.
  This discards which way riders board, recoverable later only from GTFS `stop_times.txt`.
- **Values are the raw decimals** the export carries: 93% of bus stop-grain `wd_ons` values are
  non-integral. Rounding belongs on write, using `process_ridership`'s `+0.5` Metro convention, not
  here — pre-rounding is what would make the reconciliation below inexact.

### `stop_identity.py`

Stop and station identity for the stop-level pipeline. Free of pandas, so the ingest, the geometry
join and the tests can all import it without dragging the pipeline in behind them.

| Function | Does |
| --- | --- |
| `normalise_stop_name(raw)` | Comparison form — case-folded, whitespace collapsed, ` / ` unified |
| `display_stop_name(mode, raw)` | Reader-facing form — case preserved, rail platform suffix removed |
| `strip_rail_platform_suffix(name)` | `"Union Station - A Line"` → `"Union Station"` |
| `parse_station_order(value)` | `"1001-Downtown Long Beach Station"` → `(1001, "Downtown Long Beach Station")` |
| `stop_key(mode, name, aliases)` | `"bus:vermont-wilshire"`, `"rail:union-station"` |

Keys are URL-safe slugs by construction (`^(bus|rail):[a-z0-9-]+$`), which is what lets a key go into
a query string unencoded. Modes are namespaced because bus and rail names collide freely — "Union
Station" is both.

**`STATION_ORDER`'s numeric prefix is not an identity.** It is a per-route sequence, so one station
carries a different number on every route that calls there: in 2025-12 Union Station is `1026` on the
A Line, `4001` on the B Line and `5001` on the D Line — same station, same month, three numbers.
There is no join to be made on that. The sequence space also moves as the network does: rail leaf
rows went 112 → 124 at 2025-09, when the A Line's Foothill extension added four stations *and* ROUTE
805 was first reported separately, then 124 → 127 at 2026-05 as the D Line extension opened. Those
additions happened to be appended rather than inserted, so no existing number shifted across
2025-07 → 2026-05 — an observation about eleven months, not a guarantee. A stop's identity is its
normalised name, plus the alias table.

#### `scripts/stop_aliases.json`

Metro occasionally renames a stop between months. Without a mapping that silently splits one series
into two, and nothing surfaces it. This file is the mapping. It lives in `scripts/` because it is
pipeline **input**, not app data, and it is never shipped to the client.

```json
{ "bus": {}, "rail": { "apu-station": "apu-citrus-college-station" } }
```

Keys and values are **unprefixed** slugs, as `stop_key` produces them before the `bus:`/`rail:`
prefix is attached. Chains are followed, so a stop renamed twice still lands on one key; a cycle
raises. Top-level keys starting with `_` are commentary and are ignored by the loader.

The file is hand-edited and **not** regenerated by the pipeline. Add an entry when a rename is
observed, folding one spelling onto the canonical slug for that place, and confirm it first — see
[Adding an alias](#adding-an-alias).

- **The bus table is empty.** Checked across all five archives in `data/raw/`: no month in the
  2025-07 → 2026-06 window has both an added and a dropped key, which is the signature a rename
  leaves.
- **One bus case is ambiguous and deliberately left alone.** On line 28,
  `bus:san-vicente-fairfax` runs 2025-07 → 2025-12 and `bus:san-vicente-orange-grove` runs
  2025-12 → 2026-05 — same corridor, comparable boardings, overlapping by one month. That is either
  a rename or a stop that moved two blocks, and the data cannot tell you which. Aliasing it would
  merge two series on a guess; leaving it splits them honestly.
- **The rail table holds ten entries, all added by the geometry join** — GTFS-side mismatches, not
  ridership-side ones. Each was confirmed against the export's per-route station sequence *and* the
  GTFS coordinates:

  | Export | GTFS | Confirmed by |
  | --- | --- | --- |
  | `AMC / LAX Station` | `LAX / Metro Transit Center` | 803 seq 3012 (terminus) and 807 seq 6008, between Westchester / Veterans and Aviation / Century |
  | `APU Station` | `APU / Citrus College Station` | A Line terminus |
  | `Aviation Station` | `Aviation / Imperial Station` | 803 seq 3010, between Hawthorne / Lennox and Aviation / Century |
  | `Grand Arts / Bunker Hill Station` | `Grand Ave Arts / Bunker Hill Station` | 804 seq 20 |
  | `Harbor Station` | `Harbor Freeway Station` | 803 seq 3006 |
  | `Long Beach Blvd Station` | `Lynwood Station` | 803 seq 3003, between Lakewood Blvd and Willowbrook — the station was renamed |
  | `Martin Luther King Station` | `Martin Luther King Jr Station` | 807 seq 6002 |
  | `Westchester Station` | `Westchester / Veterans Station` | 807 seq 6007 |

- **Two entries run the other way**, GTFS spelling → export spelling:
  `expo-crenshaw-e-line-station` and `expo-crenshaw-k-line-station` both fold onto
  `expo-crenshaw-station`. GTFS carries only per-platform spellings for that interchange and no clean
  one, so the export's spelling is canonical. The general rule is "fold every variant onto one
  canonical slug"; which side is canonical depends on which one still has a clean name.

### `stop_ridership.py`

The stop-grain counterpart of `process_ridership.merge_ridership`. It folds the frames
`aggregate_to_stop_ridership` produces into the two committed payloads and writes them back in the
columnar wire format the client decodes. Writing is driven by `update_ridership.py`, which owns the
scan of `data/raw/`. The script's own entry point is the reconciliation report:

```bash
python scripts/stop_ridership.py --check
python scripts/stop_ridership.py --check --tolerance 0.06
```

#### The wire format is a contract

[`src/stops/stopData.ts`](src/stops/stopData.ts) resolves columns **by name** and **rejects an
unknown `schema` outright**, so `WIRE_SCHEMA` cannot move without the decoder moving with it. The
committed fixtures at `vite/__fixtures__/stops/*.json` are the format spec.

```json
{"schema": 1,
 "cols": ["year", "month", "line", "stop", "wd_ons", "wd_offs", "sa_ons", "sa_offs", "su_ons", "su_offs"],
 "stops": [{"key": "rail:union-station", "name": "Union Station", "station_order": 1026}],
 "rows": [[2025, 8, 802, 0, 9000, 8800, 6000, 5900, 4000, 3900]]}
```

Three ways it differs from `aggregate_to_stop_ridership`'s `STOP_OUTPUT_COLS`: `mode` is not a
column, because there is one file per mode and the client derives mode from the key prefix
(`modeFromStopKey`); `stop_key`, `stop_name` and `station_order` live in the `stops` dictionary with
each row carrying an integer index into it, because at 106K rows the key would otherwise be most of
the payload; and `station_order` is an ordering attribute rather than an identity, so the dictionary
keeps the smallest of the numbers a station carries.

#### One JSON array per line

Not pretty-printed — at 106K rows the indentation would be most of the file — and not one long line
either. A newline per row costs about 2% and buys a diff that shows which months and which stops
moved, which is the only review a multi-megabyte data file gets. The Vite plugin passes the bytes
through verbatim either way.

Rows are sorted by `["year", "month", "line", "stop_key"]` and the stops dictionary by key. Without
both, every run reorders several megabytes and the file stops being reviewable at all. Rounding —
Metro's `+0.5`, as on the line side — happens on write and is idempotent, so re-running a full
ingest over unchanged archives produces byte-identical output.

#### The rename guard

When a `stop_key` first appears in a month that is **not** the dataset's first **and** an existing
key disappears that same month, that is a rename, not a new stop. The ingest prints both lists and
**fails**.

Without it a Metro rename silently splits one station's series in two: the map draws two dots, the
ranked table lists both at half their real boardings, and nothing anywhere says so. Both halves are
precise, so an ordinary service change does not trip it — *appears* means absent from every earlier
month, *disappears* means absent from this month and every later one, so a stop that skips a month
and returns is not a disappearance.

The fix is an entry in `scripts/stop_aliases.json`, which folds the two keys into one. If the stops
really are new, pass `--allow-new-stops`.

It is silent on the twelve committed months: the months that gain keys (2025-09, 2025-12, 2026-05,
2026-06) lose none, and the month that loses keys (2026-01, line 106 discontinued) gains none.

**Split by source export, not by app mode.** G Line (901) and J Line (910) BRT are delivered in the
*Bus* workbook, so `stop_ridership.bus.json` carries lines the app shows under its train filter. That
is correct and load-bearing: the client's mode filter keys off `metro_line_metadata_current.json`,
never off which file a row arrived in.

#### Stop sums will not exactly reconcile with `ridership.json`

Within a single frame they do, exactly: per-line sums of `aggregate_to_stop_ridership` equal
`aggregate_to_line_ridership`'s `Riders` pre-rounding, and a test asserts it. Across the **shipped
files** they will not, for two independent reasons:

1. **Per-stop rounding.** Each stop is rounded on write; the line total is rounded once. A line with
   154 stops accumulates tens of riders of rounding either way.
2. **The days-weighted average.** Line ridership passes through `compute_ridership`, which
   weighted-averages across shakeup periods within a month. Stop ridership does not.

**In the station-level window, only the first is live.** The Excel importer hardcodes `Days = 1` and
`Shakeup = "S1"`, so within a month there is one group and the weighted mean is a no-op. Cause 2 only
bites if a future ingest carries real shakeup splits, as the legacy CSVs did. A third and much
smaller one is structural: a leaf row with no usable stop name is dropped at stop grain and kept in
the line total, and `06-2026-Bus.xlsx` has one.

Over the twelve committed months, all three day types, 3,978 (line, month, day type) comparisons:

```
median 0.06%      p95 0.83%      max 5.10%
```

**The drift is one-sided, and that is arithmetic rather than a bug.** `+0.5`-then-truncate is
round-half-up, and 8.5–9% of stop values land on exactly `.5` — a Saturday or Sunday figure is an
average over four or five days, so halves and quarters are common. Half-up rounds every one of those
up, worth about +0.03 riders per stop. A line with 70 stops therefore reports a few riders more at
stop grain than at line grain, every month, in the same direction. On a big line that is invisible;
on line 601's Sunday total of 60 it is 3.3%.

So the `< 0.02` default tolerance fails, and is kept anyway: 26 of the 3,978 comparisons sit at or
above it and `--check` prints every one. They are all small bus lines, mostly `su_ons`, worst
`line 602 2025-08 su_ons` at 5.10% (103 vs 98). Run `--check --tolerance 0.06` for a green run over
the current window, and read a new exceedance as new information rather than raising the default.

**Do not engineer exact agreement.** Forcing it would mean either re-deriving line ridership from
stop ridership — changing 17 years of committed history — or rounding stops to match a total they
did not produce.

### `fetch_stop_locations.py`

Gives the stop-level ridership its geometry, writing `src/data/stop_locations.json`. The Excel
exports carry no coordinates, so the join is by **name**: both the export and GTFS `stops.txt` go
through `stop_identity.stop_key`, which is what guarantees the keys written here are the keys
`aggregate_to_stop_ridership` produces.

```bash
python scripts/fetch_stop_locations.py                     # or npm run fetch-stops
python scripts/fetch_stop_locations.py --spread-warn 100   # report more; changes no output
python scripts/fetch_stop_locations.py --ambiguous 2000    # changes which stops get coordinates
```

`--spread-warn` only decides what is printed and what `spread_m` is compared against. `--ambiguous`
is the one that changes the data: above it, a stop gets no coordinate at all. Re-run after
`data/raw/` gains a month, or when Metro republishes a feed.

```json
{ "generated_from": { "gtfs": {...}, "ridership": {...}, "stop_keys": {...}, "matched": {...} },
  "stops": { "bus:vermont-wilshire": { "name": "Vermont / Wilshire", "lat": 34.06, "lon": -118.29,
                                       "mode": "Bus", "gtfs_stop_ids": ["111","222"], "spread_m": 40.2 } },
  "unmatched": [ { "stop_key": "bus:pico-union", "name": "Pico / Union", "mode": "Bus",
                   "lines": [30], "reason": "no-gtfs-match" } ] }
```

Only stops that **have ridership** are written. The bus feed carries 11,892 stops and the exports
mention 6,785 of them; the rest would be most of a megabyte nothing reads.

- **Bus — one dot per name, by centroid.** `STOP_NAME` is a name and not a `stop_id`, so the two
  sides of a street are already one ridership row and must become one dot. `spread_m` is the widest
  pairwise distance in the group and every stop carries it.
- **Rail — one dot per station, preferring the parent.** Rows are filtered to `location_type` 0 and
  1, entrances (`2`) excluded, and where Metro models a station as a parent plus platforms only the
  parent contributes. That sidesteps the platform-suffix problem wherever a parent exists, and it is
  also where the clean name lives: GTFS calls the C Line platform `Crenshaw C-Line Station` and its
  parent `Crenshaw Station`.
- **A name used by two different places gets no coordinate.** LA reuses intersection names between
  cities: `Main / Pico` is downtown *and* in Santa Monica, 21 km apart, so the centroid is in
  neither. Where the route shapes of the reporting lines can say which place is meant they do, and
  the narrowing is printed. Where they cannot, the stop goes to `unmatched` with
  `reason: "ambiguous-name"` instead of getting a midpoint that is simply wrong.
- **Unmatched stops are kept, not dropped.** A stop with ridership and no geometry still belongs in
  the series and in the ranked table; it is simply absent from the map layer. Dropping it would
  change a line's stop count between months depending on when GTFS last caught up with a rename —
  the same silent-divergence bug the alias table exists to prevent.
- **Keep the output pretty-printed.** `fetch_metro_lines.py` minifies `metro_lines.geojson` because
  that file is fetched at runtime, where whitespace is pure overhead. This one is different: it is
  where a wrong alias silently moves a dot, so the diff has to be readable by whoever reviews the
  change. Minifying would save ~0.7 MB of the 1.6 MB and cost the only review anyone can do of it.
- **There is deliberately no timestamp** in `generated_from`. The file is committed, and a
  wall-clock stamp would produce a diff on every run whether or not the geometry moved. Feed
  identity stands in for it: `feed_start_date`/`feed_end_date` where the feed carries them — Metro's
  rail feed publishes them blank — plus a sha256 of the `stops.txt` rows actually used.

#### Match rate

Against the feeds published 2026-06-07, over all twelve months in `data/raw/`:

```
bus   6,756 / 6,785   (99.6%)      rail   110 / 110   (100%)
```

Rail is 110 places rather than the export's 116 names because platform suffixes fold — `Union
Station - A Line` and `Union Station - Metro Red & Purple Lines` are one station.

The 29 bus stops without coordinates split into two kinds, and the `reason` field says which: **16
`ambiguous-name`**, where GTFS lists the name in two places more than a kilometre apart; and **13
`no-gtfs-match`**, where GTFS does not list the name at all. One of those is junk Metro left in the
export (`Do Not Announce This Stop!`, on seven lines); the rest are stops GTFS no longer lists.
Naming their successors takes a map, not the data, so none is aliased.

**A match is not a promise the dot is exact.** 22 stops still centroid across 200–900 m. Those are
plausible single places — a transit centre, a stop pair at either end of a long block — rather than
name collisions, but `spread_m` ships on every stop so the map layer can judge for itself. The
ordinary case is 4,945 stops grouping more than one GTFS stop with a median spread of 41 m, which is
two sides of a street.

#### Adding an alias

Run the script, read the unmatched list, and confirm each one *before* believing it:

1. **Check the sequence, not the name.** The export's rail `STATION_ORDER` numbers stations along
   the route, so an unmatched name is pinned by its neighbours. `Aviation Station` sits at 3010 on
   line 803 between `Hawthorne / Lennox` (3009) and `Aviation Century` (3011) — which is exactly
   where GTFS puts `Aviation / Imperial Station`, and *not* where it puts `Aviation / Century
   Station`. On names alone that one is a coin flip.
2. **Check the coordinates.** Two stations can share a name: GTFS `Crenshaw Station` is the C Line's,
   at Crenshaw & I-105, while the K Line's Crenshaw stations are all `Expo / Crenshaw ...`. Confirm
   the dot is where the line goes.
3. Add the entry, re-run, and confirm the count moved by exactly what you expected.

### `fetch_metro_lines.py`

Downloads the LA Metro GTFS feeds (rail + bus), converts route shapes to GeoJSON, and writes
`public/metro_lines.geojson`, minified. Run it monthly to keep route geometry up to date, and before
the Python tests, several of which use that file as a fixture.

```bash
python scripts/fetch_metro_lines.py     # or npm run fetch-lines
```

### `compute_line_distances.py`

Reads `public/metro_lines.geojson` and writes one-way route distances in miles, rounded to one
decimal, to `src/data/line_distances.json`. Rail lines store outbound + inbound as two lineStrings;
only the outbound leg is measured, to avoid double-counting.

```bash
python scripts/compute_line_distances.py
```

### `check_transit_events.py`

Cross-checks the hand-curated milestones in `src/data/transit-events.json` against independent
sources so wrong dates don't ship. It confirms every `line_id` still exists as a route in the live
GTFS feeds — rail and bus, since curated events cover bus service changes too. For single-line
`opening` events it compares the curated month to the first month that line reports non-zero
ridership, because a brand-new line shows up in the data when it opens. It confirms any `shakeup` id
names a pick period Metro actually ran and sits within a month of the event date, and that every
event cites a `source` URL that still resolves — link rot is **WARN, never FAIL**, because a dead
citation must not block a data update.

Everything else is flagged for **manual** verification, which is now most of the schema: extensions,
closures, route/headway/hours/fare changes, disruptions, and multi-line or system-wide events. A
frequency change creates no new `route_id` and the line already has continuous ridership history, so
neither GTFS nor ridership can date it — only a human reading the cited source can.

It exits non-zero if an opening date or a shakeup claim disagrees with the data. The offline
schema/date checks run separately in `src/data/__tests__/transit-events.test.ts`, which is in CI.

```bash
python scripts/check_transit_events.py     # or npm run check-transit-events
```

### `src/data/shakeups.json`

LA Metro changes service on semi-annual (plus ad-hoc) pick periods known as **shakeups**. The raw
ridership CSVs carry a `Shakeup` column, but `process_ridership` weighted-averages across shakeup
periods within a month, so nothing downstream ever sees it. Committing the list as a standalone
lookup lets both validators check that a claimed service-change date lands on a real pick.

The file is **not** regenerated by the pipeline. It was extracted once from
`metro_ridership/Monthly_Riders*.csv` (column `Shakeup`, read with `encoding='utf-8-sig'` — the files
are BOM-prefixed), then de-duplicated and sorted across all three legacy CSVs. Coverage **ends at
`202412`**: that CSV ends 2025-06, and the Excel-era importer hardcodes `long["Shakeup"] = "S1"`, so
there is no newer pick data to extract. Events after 202412 simply carry no `shakeup` field and both
validators treat it as optional, which is why the 2026-05 D Line extension has none. Note the
off-cycle entries: `202004` is the COVID emergency schedule, and `202010`/`202109`/`202202`/`202210`
are NextGen restructure phases.

### `update_linux_snapshots.py`

Regenerates the Linux visual-regression baselines inside the official Playwright Docker image.
Playwright names snapshots after the OS that captured them, so a run on Windows writes `-win32.png`
and a run on Linux writes `-linux.png`. This produces the Linux set without needing a Linux machine.
**Requires Docker Desktop to be running.**

```bash
npm run test:e2e:update:linux
npm run test:e2e:update:linux -- --project=desktop -g "expanded"   # args forward to playwright
```

The image tag is read from `package-lock.json`, so the browser build that writes a baseline follows
the installed `@playwright/test` and cannot drift from it. The whole Playwright suite is gitignored
and runs only on a developer machine, so a Linux set is now a convenience for comparing across
machines rather than something CI reads.

Two details worth knowing if you ever edit the docker invocation:

- The bare `-v /work/node_modules` is an **anonymous volume masking the host's `node_modules`**. The
  container runs `npm ci`, which installs Linux `esbuild`/`@swc`/`rollup` binaries; without the mask
  those overwrite your host copies and break `npm run dev` until you re-run `npm ci`.
- `CI` is deliberately left unset inside the container, so `playwright.config.ts`'s `webServer` still
  runs `npm run build && npm run preview` and the regeneration is self-contained.

### Python tests

```bash
pytest scripts/
```

One `test_<script>.py` per script in `scripts/tests/`. They import the modules under test by bare
name (`import process_ridership`) because `scripts/` is a flat directory of standalone entry points,
not a package — so `scripts/tests/conftest.py` puts `scripts/` on `sys.path`. Delete that file and
every import breaks at collection. Run `npm run fetch-lines` first; several tests use
`public/metro_lines.geojson` as a fixture.

### After a data update

A new month of data moves some visual baselines. `dataDefaultEndDate` is computed from
`ridership.json` at module load, so a new month shifts the default Month Window and the year
`<option>`s in the date selector. Specs that pin an explicit window in their query string are
unaffected; a spec that lands on the new default is not, so regenerate its baselines in the same
change.

For interactive exploration and debugging, see the notebooks in `notebooks/`.

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
| `.design/` | Draft artboards for the stop-ridership UI, laid out by `canvas.json`. Nothing here ships; open `StartHere.dc.html` first. |

Some directories sit on a developer machine but deliberately not in git: `e2e/` (Playwright and its
baselines), `docs/` (ADRs, architecture diagrams, agent notes) and the rendering test suites.
`.gitignore` lists them, and none of them are needed to build or run the app.
