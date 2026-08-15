# scripts/

Python utility scripts. Most fetch and process LA Metro route data; one
([`update_linux_snapshots.py`](#update_linux_snapshotspy)) is a developer tool for
the visual-regression suite. See [Python setup](#python-setup) below.

---

## Data scripts

### `fetch_metro_lines.py`

Downloads the LA Metro GTFS feeds (rail + bus), converts route shapes to
GeoJSON, and writes `public/metro_lines.geojson`. Run this monthly to keep
route geometry up to date.

```bash
python scripts/fetch_metro_lines.py

# or, equivalently
npm run fetch-lines
```

### `fetch_stop_locations.py`

Gives the stop-level ridership its geometry. The Excel exports carry no coordinates, so
the join is by **name**: both the export and GTFS `stops.txt` go through
[`stop_identity.stop_key`](#stop_identity), which is what guarantees the keys written
here are the keys `aggregate_to_stop_ridership` produces. Writes
`src/data/stop_locations.json`.

```bash
python scripts/fetch_stop_locations.py

# or, equivalently
npm run fetch-stops

python scripts/fetch_stop_locations.py --spread-warn 100   # report more; changes no output
python scripts/fetch_stop_locations.py --ambiguous 2000    # changes which stops get coordinates
```

`--spread-warn` only decides what is printed and what `spread_m` is compared against in
the provenance block. `--ambiguous` is the one that changes the data: above it, a stop
gets no coordinate at all.

Re-run it after `data/raw/` gains a month, or when Metro republishes a feed.

```json
{ "generated_from": { "gtfs": {...}, "ridership": {...}, "stop_keys": {...}, "matched": {...} },
  "stops": { "bus:vermont-wilshire": { "name": "Vermont / Wilshire", "lat": 34.06, "lon": -118.29,
                                       "mode": "Bus", "gtfs_stop_ids": ["111","222"], "spread_m": 40.2 } },
  "unmatched": [ { "stop_key": "bus:pico-union", "name": "Pico / Union", "mode": "Bus",
                   "lines": [30], "reason": "no-gtfs-match" } ] }
```

Only stops that **have ridership** are written. The bus feed carries 11,892 stops and
the exports mention 6,785 of them; the rest would be most of a megabyte nothing reads.

**Bus — one dot per name, by centroid.** `STOP_NAME` is a name and not a `stop_id`, so
the two sides of a street are already one ridership row and must become one dot.
`spread_m` is the widest pairwise distance in the group and every stop carries it.

**Rail — one dot per station, preferring the parent.** Rows are filtered to
`location_type` 0 and 1, entrances (`2`) excluded, and where Metro models a station as a
parent plus platforms only the parent contributes. That sidesteps the platform-suffix
problem wherever a parent exists, and it is also where the clean name lives: GTFS calls
the C Line platform `Crenshaw C-Line Station` and its parent `Crenshaw Station`.

**A name used by two different places gets no coordinate.** LA reuses intersection
names between cities: `Main / Pico` is downtown *and* in Santa Monica, 21 km apart, so
the centroid is in neither. Where the route shapes of the reporting lines can say which
place is meant they do, and the narrowing is printed. Where they cannot — usually they
cannot, because each place is served by one of the reporting lines — the stop goes to
`unmatched` with `reason: "ambiguous-name"` instead of getting a midpoint that is simply
wrong. Sixteen bus stops are in this state.

**Unmatched stops are kept, not dropped.** A stop with ridership and no geometry still
belongs in the series and in the ranked table; it is simply absent from the map layer.
Dropping it would change a line's stop count between months depending on when GTFS last
caught up with a rename — the same silent-divergence bug the alias table exists to
prevent. Entries carry a `reason`: `no-gtfs-match` (GTFS does not list the name) or
`ambiguous-name` (it lists it twice, far apart). The `no-gtfs-match` names print as a
paste-ready `stop_aliases.json` fragment.

**Keep the output pretty-printed.** `fetch_metro_lines.py` minifies
`public/metro_lines.geojson` because that file is fetched at runtime, where whitespace is
pure overhead. This one is different: it is where a wrong alias silently moves a dot, so
the diff has to be readable by whoever reviews the change. Minifying would save ~0.7 MB
of the 1.6 MB and cost the only review anyone can do of it.

There is deliberately **no timestamp** in `generated_from`. The file is committed, and a
wall-clock stamp would produce a diff on every run whether or not the geometry moved.
Feed identity stands in for it: `feed_start_date`/`feed_end_date` where the feed carries
them — Metro's rail feed publishes them blank — plus a sha256 of the `stops.txt` rows
actually used.

#### Match rate

Against the feeds published 2026-06-07, over all twelve months in `data/raw/`:

```
bus   6,756 / 6,785   (99.6%)      rail   110 / 110   (100%)
```

Rail is 110 places rather than the export's 116 names because platform suffixes fold —
`Union Station - A Line` and `Union Station - Metro Red & Purple Lines` are one station.

The 29 bus stops without coordinates split into two kinds, and the `reason` field says
which:

- **16 `ambiguous-name`** — GTFS lists the name in two places more than a kilometre
  apart. See above; no coordinate is written for them.
- **13 `no-gtfs-match`** — GTFS does not list the name at all. One is junk Metro left in
  the export (`Do Not Announce This Stop!`, on seven lines); the rest are stops GTFS no
  longer lists. Naming their successors takes a map, not the data, so none is aliased.

**A match is not a promise the dot is exact.** 22 stops still centroid across 200–900 m.
Those are plausible single places — a transit centre, a stop pair at either end of a long
block — rather than name collisions, but `spread_m` ships on every stop so the map layer
can judge for itself. The ordinary case is 4,945 stops grouping more than one GTFS stop
with a median spread of 41 m, which is two sides of a street.

#### Adding an alias

Run the script, read the unmatched list, and confirm each one *before* believing it:

1. **Check the sequence, not the name.** The export's rail `STATION_ORDER` numbers
   stations along the route, so an unmatched name is pinned by its neighbours. `Aviation
   Station` sits at 3010 on line 803 between `Hawthorne / Lennox` (3009) and `Aviation
   Century` (3011) — which is exactly where GTFS puts `Aviation / Imperial Station`, and
   *not* where it puts `Aviation / Century Station`. On names alone that one is a coin
   flip.
2. **Check the coordinates.** Two stations can share a name: GTFS `Crenshaw Station` is
   the C Line's, at Crenshaw & I-105, while the K Line's Crenshaw stations are all
   `Expo / Crenshaw ...`. Confirm the dot is where the line goes.
3. Add the entry, re-run, and confirm the count moved by exactly what you expected.

### `compute_line_distances.py`

Reads `public/metro_lines.geojson` and writes one-way route distances (in
miles, rounded to one decimal) to `src/data/line_distances.json`. Rail lines
store outbound + inbound as two lineStrings; only the outbound leg is measured
to avoid double-counting.

```bash
python scripts/compute_line_distances.py
```

### `check_transit_events.py`

Cross-checks the hand-curated milestones in `src/data/transit-events.json`
against independent sources so wrong dates don't ship. For each event it:

1. Confirms every `line_id` still exists as a route in the live GTFS feeds —
   **rail and bus**, since curated events cover bus service changes too.
2. For single-line `opening` events, compares the curated month to the first
   month that line reports non-zero ridership in `src/data/ridership.json` — a
   brand-new line shows up in the data when it opens, so the two should agree.
3. Confirms any `shakeup` id names a pick period Metro actually ran
   (`src/data/shakeups.json`) and sits within a month of the event date.
4. Confirms every event cites a `source` URL that still resolves. Link rot is
   **WARN, never FAIL** — a dead citation must not block a data update.
5. Flags everything else for **manual** verification. That is now most of the
   schema: extensions, closures, route/headway/hours/fare changes, disruptions,
   and multi-line or system-wide events. A frequency change creates no new
   `route_id` and the line already has continuous ridership history, so neither
   GTFS nor ridership can date it — only a human reading the cited source can.

Exits non-zero if an opening date or a shakeup claim disagrees with the data.
The offline schema/date checks also run in CI via
`src/data/transit-events.test.ts`.

```bash
python scripts/check_transit_events.py
# or
npm run check-transit-events
```

### `src/data/shakeups.json`

LA Metro changes service on semi-annual (plus ad-hoc) pick periods known as
**shakeups**. The raw ridership CSVs carry a `Shakeup` column, but
`process_ridership` weighted-averages across shakeup periods within a month, so
nothing downstream ever sees it. Committing the list as a standalone lookup lets
both validators check that a claimed service-change date lands on a real pick.

Provenance — this file is **not** regenerated by the pipeline:

- Extracted once from `metro_ridership/Monthly_Riders*.csv` (column `Shakeup`,
  read with `encoding='utf-8-sig'` — the files are BOM-prefixed), then
  de-duplicated and sorted across all three legacy CSVs.
- Coverage **ends at `202412`**. That CSV ends 2025-06, and the Excel-era
  importer hardcodes `long["Shakeup"] = "S1"` (in
  [`convert_excel_ridership.py`](convert_excel_ridership.py)), so there is no
  newer pick data to extract. Events after 202412 simply carry no `shakeup`
  field; both validators treat it as optional — which is why the 2026-05 D Line
  extension has none.
- Note the off-cycle entries: `202004` is the COVID emergency schedule, and
  `202010`/`202109`/`202202`/`202210` are NextGen restructure phases.

---

## Developer tools

### `update_linux_snapshots.py`

Regenerates the **Linux** visual-regression baselines (`e2e/visual.spec.ts-snapshots/*-linux.png`)
inside the official Playwright Docker image. Playwright names snapshots after the OS
that captured them, so a run on Windows writes `-win32.png` while CI (Linux) looks for
`-linux.png`. Both sets are committed; this produces the Linux half without needing a
Linux machine.

**Requires Docker Desktop to be running.**

```bash
npm run test:e2e:update:linux

# forward arguments to `playwright test --update-snapshots`
npm run test:e2e:update:linux -- --project=desktop -g "expanded"
```

The image tag is read from `package-lock.json`, the same source
`.github/workflows/ci.yml` uses for its `container.image` — so the browser build that
writes a baseline here is the one CI compares against, and bumping `@playwright/test`
moves both together.

Two details worth knowing if you ever edit the docker invocation:

- The bare `-v /work/node_modules` is an **anonymous volume masking the host's
  `node_modules`**. The container runs `npm ci`, which installs Linux `esbuild`/`@swc`/
  `rollup` binaries; without the mask those overwrite your host copies and break
  `npm run dev` until you re-run `npm ci`.
- `CI` is deliberately left unset inside the container, so `playwright.config.ts`'s
  `webServer` still runs `npm run build && npm run preview` and the regeneration is
  self-contained.

When and why you'd run this is covered in
[docs/guides/testing.md](../docs/guides/testing.md#only-the-linux-baselines-are-committed), and the
CI jobs it mirrors are in [docs/guides/ci.md](../docs/guides/ci.md).

---

## Getting ridership data (public records request)

LA Metro does not publish a bulk ridership download, so new data is obtained
via a California Public Records Act (CPRA) request. Turnaround has been about
3 days.

**Submit the request:**

1. Go to https://lametro.nextrequest.com/requests/new
2. Use the following request text, updating the start month to one month after
   the last month already in `src/data/ridership.json`:

   > Hello, I would like to make a public records request for LA Metro ridership
   > for all train lines and bus lines. This would be from the month of
   > **[MONTH YEAR]** to the most recent month possible. It's based on this LA
   > Metro website that has ridership data.
   > https://opa.metro.net/MetroRidership/

**What you'll receive:**

Metro's Public Records Requests department (point of contact: William Cano,
Principal Transportation Planner) releases the data as:

- Individual monthly Excel files named `MM-YYYY.xlsx`
- Zip archives for bulk years (e.g. `Rail 2025.zip`, `Bus 2025.zip`)

**Next step:** see [`process_ridership`](#process_ridership) below for how to
ingest these files into the app.

---

## `update_ridership`

The day-to-day way to refresh the app's data. Scans `data/raw/` for every
zip/Excel/CSV, works out which month/line records aren't in `ridership.json` yet,
and **adds only the new ones** — so you don't have to name a specific archive.
Existing records are left untouched (append-only). When new data is added, a
matching entry is prepended to [`DATA_RELEASE_NOTES.md`](../DATA_RELEASE_NOTES.md).

The same scan feeds the **stop grain** through [`stop_ridership`](#stop_ridership),
under the same append-only / `--overwrite` semantics, so the two grains can never see
different months. Disable with `--no-stops`.

**Run:**

```bash
python scripts/update_ridership.py              # scan data/raw/, add new months
python scripts/update_ridership.py --dry-run     # report what's new, write nothing
python scripts/update_ridership.py --overwrite    # let newer numbers replace existing months
python scripts/update_ridership.py --no-release-notes
python scripts/update_ridership.py --no-stops     # line grain only
python scripts/update_ridership.py data/raw/2026-04_2026-05.zip   # limit to given paths
```

The stop step runs **before** the "no new data" return, because the payloads can be
behind — or absent, as on a fresh clone — while `ridership.json` is already current.
It fails the run on a suspected rename; see [the rename guard](#the-rename-guard).

Under the hood it reuses `process_ridership` (below) for parsing and merging.
Use `process_ridership` directly when you want to force-ingest one specific file.

---

## `convert_excel_ridership`

LA Metro fulfills public records requests with Excel files, not the CSV that
`process_ridership` expects. This script converts those Excel files (summing
stop/station boardings to per-line totals) and chains directly into
`process_ridership` to update `ridership.json` — so it's the usual one-step entry
point for new data.

> **Rail is aggregated by `ROUTE`, not `LINE`.** Metro nests distinct routes
> under a shared `LINE` grouping — notably ROUTE 805 (D/Purple) under LINE 802
> (B/Red). Grouping by ROUTE reports each as its own line instead of summing the
> Purple Line's riders into the Red Line's total. The route breakdown only exists
> in the source from 2025-09 onward, so line 802 is Red+Purple combined before
> then and Red-only after (see [`DATA_RELEASE_NOTES.md`](../DATA_RELEASE_NOTES.md)).

It accepts the two shapes Metro delivers:

- Individual files named `MM-YYYY-{Bus|Rail}.xlsx`
- Typed zip archives named `{Bus|Rail} YYYY.zip` (inner files `YYYY-MM.xlsx`)

**Run** (via the npm shortcut, passing the raw inputs after `--`):

```bash
# Typed zip archives (what's committed in data/raw/)
npm run load-ridership -- "data/raw/Bus 2025.zip" "data/raw/Rail 2025.zip"

# Individual xlsx files
npm run load-ridership -- data/raw/01-2026-Bus.xlsx data/raw/01-2026-Rail.xlsx

# A directory of loose .xlsx files
npm run load-ridership -- data/raw/
```

Equivalent to calling `python scripts/convert_excel_ridership.py <inputs>`
directly. Run from the repo root so the chained `process_ridership` step can find
`src/data/ridership.json` and `src/data/metro_line_metadata_current.json`.

> Directory mode only globs loose `.xlsx`; the committed `.zip` archives must be
> passed explicitly (as in the first example above).

### The leaf-row rule lives in one place

The Excel export interleaves aggregate **"Total"** rows at several levels — a
direction-total per stop for Bus, and for Rail both a line-total row
(`ROUTE == "Total"`) and a route-total row (`STATION_ORDER == "Total"`). Summing
without dropping those double-counts everything.

`extract_leaf_rows(df, mode)` is the **single source of truth** for which rows are
real observations, and it also carries the ROUTE-over-LINE resolution described
above. `aggregate_to_line_ridership` and `aggregate_to_stop_ridership` are both
thin wrappers over it, so the rule cannot drift between them the next time Metro
changes the export layout — and in particular the D Line's stations cannot end up
filed under the B Line at one grain but not the other.

### `aggregate_to_stop_ridership`

The same raw frame, reduced to **one row per line per stop** instead of one row per
line:

```
year, month, mode, line, stop_key, stop_name, station_order,
wd_ons, wd_offs, sa_ons, sa_offs, su_ons, su_offs
```

- **Alightings (`*_OFFS`) are kept.** The line-level path discards them; nothing in
  the app has ever shown them. In UI copy they are **Boardings** and
  **Alightings**, never "ons"/"offs" — the pipeline column names keep the export's
  vocabulary, the interface does not.
- **`*_ACT` is dropped.** It equals ons + offs, so it is a third of the payload for
  one client-side addition.
- **Bus direction is collapsed.** `STOP_NAME` is a name, not a `stop_id`, so both
  sides of a street share one name and therefore one coordinate — they could not be
  drawn apart even if kept separate. This does discard which way riders board,
  recoverable later only from GTFS `stop_times.txt`.
- **Values are the raw decimals** the export carries — 93% of bus stop-grain
  `wd_ons` values are non-integral, with a p25 of 8.9 weekday boardings across the
  11 months. Rounding belongs on write, using `process_ridership`'s `+0.5` Metro
  convention — not here, because pre-rounding is what makes the reconciliation
  invariant below exact.

---

## `stop_identity`

Stop and station identity for the stop-level pipeline. Free of pandas, so the
ingest, the geometry join and the tests can all import it without dragging the
pipeline in behind them.

| Function | Does |
| --- | --- |
| `normalise_stop_name(raw)` | Comparison form — case-folded, whitespace collapsed, ` / ` unified |
| `display_stop_name(mode, raw)` | Reader-facing form — case preserved, rail platform suffix removed |
| `strip_rail_platform_suffix(name)` | `"Union Station - A Line"` → `"Union Station"` |
| `parse_station_order(value)` | `"1001-Downtown Long Beach Station"` → `(1001, "Downtown Long Beach Station")` |
| `stop_key(mode, name, aliases)` | `"bus:vermont-wilshire"`, `"rail:union-station"` |

> **`STATION_ORDER`'s numeric prefix is not an identity.** It is a per-route
> sequence, so one station carries a different number on every route that calls
> there: in 2025-12 Union Station is `1026` on the A Line, `4001` on the B Line and
> `5001` on the D Line — same station, same month, three numbers. There is no join
> to be made on that.
>
> The sequence space also moves as the network does. Rail leaf rows went 112 → 124
> at **2025-09**, when the A Line's Foothill extension added four stations *and*
> ROUTE 805 was first reported as its own route instead of being folded into 802;
> then 124 → 127 at **2026-05** as the D Line extension opened. Those additions
> happened to be appended rather than inserted, so no existing number shifted across
> 2025-07 → 2026-05 — an observation about eleven months, not a guarantee.
>
> A stop's identity is its normalised name, plus the alias table below.

Keys are URL-safe slugs by construction (`^(bus|rail):[a-z0-9-]+$`), which is what
lets a key go into a query string unencoded. Modes are namespaced because bus and
rail names collide freely — "Union Station" is both.

### `scripts/stop_aliases.json`

Metro occasionally renames a stop between months. Without a mapping that silently
splits one series into two, and nothing surfaces it. This file is the mapping.

It lives in `scripts/` because it is pipeline **input**, not app data, and it is
never shipped to the client.

```json
{ "bus": {}, "rail": { "apu-station": "apu-citrus-college-station" } }
```

Keys and values are **unprefixed** slugs, as `stop_key` produces them before the
`bus:`/`rail:` prefix is attached. Chains are followed, so a stop renamed twice
still lands on one key; a cycle raises. Top-level keys starting with `_` are
commentary and are ignored by the loader.

Provenance — this file is **not** regenerated by the pipeline:

- Hand-edited. Add an entry when a rename is observed, folding one spelling of a stop
  onto the canonical slug for that place. See
  [Adding an alias](#adding-an-alias) for how to confirm one before believing it.
- **The bus table is empty.** Checked across all five archives in `data/raw/`: no
  month in the 2025-07 → 2026-06 window has both an added and a dropped key, which
  is the signature a rename leaves.
- **One bus case is ambiguous and deliberately left alone.** On line 28,
  `bus:san-vicente-fairfax` runs 2025-07 → 2025-12 and
  `bus:san-vicente-orange-grove` runs 2025-12 → 2026-05 — same corridor, comparable
  boardings, overlapping by one month. That is either a rename or a stop that moved
  two blocks, and the data cannot tell you which. Aliasing it would merge two series
  on a guess; leaving it splits them honestly. The geometry join adds one fact and not
  the deciding one: GTFS no longer lists `San Vicente / Fairfax` at all, which is
  consistent with either reading. Still unaliased.
- **The rail table holds ten entries, all added by the geometry join** — they are
  GTFS-side mismatches, not ridership-side ones. Each was confirmed against the
  export's per-route station sequence *and* the GTFS coordinates:

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
  `expo-crenshaw-station`. GTFS carries *only* per-platform spellings for that
  interchange and no clean one, so the export's spelling is the canonical slug and the
  two platforms fold onto it — which is what `strip_rail_platform_suffix` would have
  done had GTFS spelled the suffix `- K Line` rather than `K-Line`. The general rule is
  "fold every variant onto one canonical slug"; which side is canonical depends on which
  one still has a clean name.
- The rename **guard** — fail an ingest when one key appears and another disappears in
  the same month — lives in [`stop_ridership.detect_renames`](#stop_ridership), which is
  where a month is compared against the months already stored. It is silent on the twelve
  committed months: the months that gain keys (2025-09, 2025-12, 2026-05, 2026-06) lose
  none, and the month that loses keys (2026-01, line 106 discontinued) gains none.

### Stop sums will not exactly reconcile with `ridership.json`

Within a single frame they do, exactly: per-line sums of `aggregate_to_stop_ridership`
equal `aggregate_to_line_ridership`'s `Riders` pre-rounding, and a test asserts it.

Across the **shipped files** they will not, for two independent reasons:

1. **Per-stop rounding.** Each stop is rounded on write; the line total is rounded
   once. A line with 154 stops accumulates tens of riders of rounding either way.
2. **The days-weighted average.** Line ridership passes through
   `process_ridership.compute_ridership`, which weighted-averages across shakeup
   periods within a month. Stop ridership does not.

**In the station-level window, only the first of those is live.** The Excel importer
hardcodes `Days = 1` and `Shakeup = "S1"`, so within a month there is one group and
the weighted mean is a no-op — the whole discrepancy is per-stop rounding. Cause 2
only bites if a future ingest carries real shakeup splits, as the legacy CSVs did.
Anyone debugging a `--check` failure over 2025-07 → 2026-06 should not go looking
for it. A third and much smaller one is structural: a leaf row with no usable stop name
is dropped at stop grain and kept in the line total, and `06-2026-Bus.xlsx` has one.

`python scripts/stop_ridership.py --check` measures it. Over the twelve committed
months, all three day types, 3,978 (line, month, day type) comparisons:

```
median 0.06%      p95 0.83%      max 5.10%
```

**The drift is one-sided, and that is arithmetic rather than a bug.** `+0.5`-then-
truncate is round-half-up, and 8.5–9% of stop values land on exactly `.5` — a Saturday
or Sunday figure is an average over four or five days, so halves and quarters are
common. Half-up rounds every one of those up, worth about **+0.03 riders per stop**.
A line with 70 stops therefore reports a few riders more at stop grain than at line
grain, every month, in the same direction. On a big line that is invisible; on line 601's
Sunday total of 60 it is 3.3%.

So **the plan's `< 0.02` assertion fails, and it is kept as the default anyway** —
26 of the 3,978 comparisons sit at or above it, and `--check` prints every one. They are
all small bus lines, mostly `su_ons`, worst `line 602 2025-08 su_ons` at 5.10%
(103 vs 98). The earlier figure of 2.35% in this file measured **weekday only**; Sunday
on a small line is the harder case. Run `--check --tolerance 0.06` for a green run over
the current window, and read a new exceedance as new information rather than raising the
default.

**Do not engineer exact agreement.** Forcing it would mean either re-deriving line
ridership from stop ridership — changing 17 years of committed history — or rounding
stops to match a total they did not produce.

---

## `stop_ridership`

The stop-grain counterpart of `process_ridership.merge_ridership`. It folds the frames
`aggregate_to_stop_ridership` produces into the two committed payloads and writes them
back in the columnar wire format the client decodes.

```
src/data/stop_ridership.bus.json     5.3 MB   105,984 rows   6,785 stops   109 lines
src/data/stop_ridership.rail.json     89 KB     1,470 rows     110 stops     6 lines
```

Writing is driven by [`update_ridership`](#update_ridership) — it owns the scan of
`data/raw/`, so the stop grain and the line grain always see the same months. The script's
own entry point is the reconciliation report:

```bash
python scripts/stop_ridership.py --check
python scripts/stop_ridership.py --check --tolerance 0.06
```

### The wire format is a contract

[`src/stops/stopData.ts`](../src/stops/stopData.ts) resolves columns **by name** and
**rejects an unknown `schema` outright**, so `WIRE_SCHEMA` cannot move without the
decoder moving with it. The committed fixtures at `vite/__fixtures__/stops/*.json` are
the format spec.

```json
{"schema": 1,
 "cols": ["year", "month", "line", "stop", "wd_ons", "wd_offs", "sa_ons", "sa_offs", "su_ons", "su_offs"],
 "stops": [{"key": "rail:union-station", "name": "Union Station", "station_order": 1026}],
 "rows": [[2025, 8, 802, 0, 9000, 8800, 6000, 5900, 4000, 3900]]}
```

Three ways it differs from `aggregate_to_stop_ridership`'s `STOP_OUTPUT_COLS`:

- **`mode` is not a column.** There is one file per mode, and the client derives mode
  from the key prefix (`modeFromStopKey`), never from the row.
- **`stop_key`, `stop_name` and `station_order` live in the `stops` dictionary**, and
  each row carries an integer index into it. At 106K rows the key would otherwise be
  most of the payload.
- **`station_order` is an ordering attribute and never an identity.** It is scoped to
  the route, so the dictionary keeps the smallest of the numbers a station carries. See
  [`stop_identity`](#stop_identity).

### One JSON array per line

Not pretty-printed — at 106K rows the indentation would be most of the file — and not one
long line either, which is what `fetch_metro_lines.py` does to `metro_lines.geojson`.
A newline per row costs about 2% and buys a diff that shows which months and which stops
moved, which is the only review a multi-megabyte data file gets. The Vite plugin passes
the bytes through verbatim either way.

Rows are sorted by `["year", "month", "line", "stop_key"]` and the stops dictionary by
key. Without both, every run reorders several megabytes and the file stops being
reviewable at all. Rounding — Metro's `+0.5`, as on the line side — happens on write and
is idempotent, so re-running a full ingest over unchanged archives produces byte-identical
output.

### The rename guard

When a `stop_key` first appears in a month that is **not** the dataset's first **and**
an existing key disappears that same month, that is a rename, not a new stop. The ingest
prints both lists and **fails**.

Without it a Metro rename silently splits one station's series in two: the map draws two
dots, the ranked table lists both at half their real boardings, and nothing anywhere says
so. Both halves are precise, so an ordinary service change does not trip it — *appears*
means absent from every earlier month, *disappears* means absent from this month and
every later one, so a stop that skips a month and returns is not a disappearance.

The fix is an entry in [`stop_aliases.json`](#scriptsstop_aliasesjson), which folds the
two keys into one and makes the signal go away along with the split it reported. If the
stops really are new, pass `--allow-new-stops`.

**Split by source export, not by app mode.** G Line (901) and J Line (910) BRT are
delivered in the *Bus* workbook, so `stop_ridership.bus.json` carries lines the app shows
under its train filter. That is correct and load-bearing: the client's mode filter keys
off `metro_line_metadata_current.json`, never off which file a row arrived in.

---

## `process_ridership`

Processes raw LA Metro ridership data and merges it into `src/data/ridership.json`
and `src/data/metro_line_metadata_current.json`.

**Accepted inputs:**

- **Excel** (what public records requests now return) — a single
  `MM-YYYY-{Bus|Rail}.xlsx` file, or a date-range zip of them (e.g.
  `2026-04_2026-05.zip`). These are parsed by `convert_excel_ridership.py` into
  the CSV schema below before processing; line ridership is the sum of stop/station
  boardings (Ons) per line — and for rail, per **`ROUTE`** rather than `LINE`.

  > Metro nests distinct rail routes under a shared `LINE` grouping — notably
  > ROUTE 805 (D/Purple) under LINE 802 (B/Red). Aggregating by ROUTE reports each
  > as its own line instead of summing the Purple Line's riders into the Red Line's
  > total. Single-route lines are unaffected (their ROUTE equals their LINE). The
  > breakdown only exists in the source from 2025-09 onward, so line 802 is
  > Red+Purple combined before then and Red-only after — see
  > [`DATA_RELEASE_NOTES.md`](../DATA_RELEASE_NOTES.md).
- **Legacy CSV** (from older requests):

  ```
  Year, Month, Line, DayType, Riders, Shakeup, Provider, Mode, Days
  ```

  Where `DayType` is `DX` (weekday), `SA` (Saturday), or `SU` (Sunday).

**Steps:**
1. Weighted-average ridership across shakeup periods within a month (matching Metro's rounding)
2. Pivot from long format → separate weekday / Saturday / Sunday columns
3. Fill any missing line × month combinations with `0`
4. Merge with existing `ridership.json` — new data wins on conflicts; old data backfills gaps
5. Append any newly seen lines to `metro_line_metadata_current.json`

**Run:**

```bash
# Excel: a date-range zip (or a single .xlsx)
python scripts/process_ridership.py data/raw/2026-04_2026-05.zip
python scripts/process_ridership.py data/raw/04-2026-Bus.xlsx

# Legacy CSV
python scripts/process_ridership.py data/raw/Monthly_Riders.csv.gz
```

**Storing raw CSVs:** Commit them compressed to keep the repo lean. On macOS/Linux:

```bash
gzip -k Monthly_Riders.csv          # produces Monthly_Riders.csv.gz
mv Monthly_Riders.csv.gz data/raw/
```

On Windows (PowerShell):

```powershell
Compress-Archive -Path Monthly_Riders.csv -DestinationPath data/raw/Monthly_Riders.csv.zip
# or use 7-Zip / WSL gzip for .gz format
```

Uncompressed `.csv` files in `data/raw/` are gitignored.

**Storing raw Excel files:** Commit them as a single `.zip` archive named by date range to keep the repo lean. Uncompressed `.xlsx` files are gitignored.

On Windows (PowerShell):

```powershell
# From the repo root — adjust the date range in the output filename to match your files
Compress-Archive -Path data/raw/*.xlsx -DestinationPath data/raw/YYYY-MM_YYYY-MM.zip -Force
```

On macOS/Linux (Bash):

```bash
zip data/raw/YYYY-MM_YYYY-MM.zip data/raw/*.xlsx
```

To extract:

```powershell
Expand-Archive data/raw/2026-01_2026-03.zip -DestinationPath data/raw/
```

For interactive exploration and debugging, see the notebooks in `notebooks/`.

---

## Python setup

```bash
pip install -r scripts/requirements.txt
```

Dependencies: `requests` (HTTP), `pandas` + `numpy` (data processing), `openpyxl`
(reading the `.xlsx` files public records requests return), `pytest` (tests).

## Running the Python tests

Run from the repo root or from `scripts/`:

```bash
# from repo root
pytest scripts/

# from scripts/
cd scripts && pytest
```

Tests use the live `public/metro_lines.geojson` file as a fixture, so
`fetch_metro_lines` must have been run at least once before the integration
tests will pass.
