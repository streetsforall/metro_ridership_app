# Roadmap — stop-level ridership

The app shows ridership per **line**. This is the sequence that gets it to
**stop and station** grain, with **alightings**, which the app has never shown at
any grain.

The data is already in the repo. The CPRA Excel files in `data/raw/` are
stop/station-level with ons, offs and activity for all three day types;
`aggregate_to_line_ridership` used to `groupby("LINE").sum()` and discard stop
identity, offs and activity at ingest. Nothing needs to be acquired.

Coverage is **2025-07 → 2026-06, 12 months, both modes** — 11 at the time this was
written, plus 2026-06 from #176. Everything before that is line-level only and stays
untouched.

> Figures elsewhere on this page that PR 1 measured — the row counts under *Decisions*,
> the 1,252 line-months under *Named risks* — were taken over 2025-07 → 2026-05 and have
> not been re-measured since.

## The five PRs

Tick a row when its PR merges. This table is the batch's shared reference — later
PRs update it rather than restating their own scope.

| PR | Contents | Gate | Status |
| --- | --- | --- | --- |
| **1** | `stop_identity.py`, `stop_aliases.json`, the `extract_leaf_rows` refactor, `aggregate_to_stop_ridership`, tests. **No data change.** | `pytest scripts/` green with the six existing test files unmodified; a full re-ingest produces byte-for-byte what it produced at the base commit (see below) | ☑ [#173](https://github.com/streetsforall/metro_ridership_app/pull/173) |
| **2** | `fetch_stop_locations.py`, `src/data/stop_locations.json`, `scripts/README.md`, tests | Match rate reported; unmatched reviewed and aliases extended | ☑ [#179](https://github.com/streetsforall/metro_ridership_app/pull/179) — bus 6,772/6,785 · rail 110/110 |
| **3** | `stop_ridership.py`, `update_ridership.py` wiring, the two data files, `DATA_RELEASE_NOTES.md` | Reconciliation within tolerance; two runs byte-identical | ☐ |
| **4** | Vite plugin, manifest, `src/stops/`, `stops.types.ts`, the `isInMonthWindow` extraction, vitest specs. **No visible UI.** | `ANALYZE=1 npm run build` — entry chunk unchanged; no visual baseline moves | ☐ |
| **5** | Map layer, `#stop-panel`, URL state, `mapPopup` addition, Playwright baselines | New baselines only; `visual.spec.ts`'s six must **not** move | ☐ |

1 → 2 → 3 are pipeline-serial. 4 can start once PR 1's schema is fixed. PR 3 carries
the multi-megabyte data diff alone, so its review is "is the data right", not "is the
code right"; the 4/5 split means exactly one PR touches visual baselines.

### About PR 1's gate

It was originally written as "`git diff --stat src/data/ridership.json` empty after a
full re-ingest". **That is not satisfiable, and was not satisfiable before any of this
work started.** A re-ingest at the base commit already adds five rows — `line_name: 106`
at 2026-01 … 2026-05, all zero — because `fill_missing_months` synthesises them and the
committed file does not have them. So the committed `ridership.json` is not the fixed
point of its own pipeline.

Judge the gate against a **control run at the base commit**, not against the committed
file: the re-ingest must produce byte-for-byte what it produced before the change. PR 1
does (`sha256 f03df3a9…` for both runs).

The five synthesised rows are gone as of the padding fix below — but the gate does not
change, because a re-ingest still moves one value (line 602 at 2025-11, Saturday 238 →
237, a re-derivation of the days-weighted mean). **The control run remains the baseline.**

#### Settled: the committed file is right, the synthesised rows are wrong

Neither answer in the original framing was correct — `ridership.json` is not stale, and
line 106 is not missing data. **Line 106 was discontinued.** It ran normally to the end
of 2025 (158 stops, 4,062 weekday boardings in 2025-12), is absent from every export
from 2026-01 on — the *only* line dropped anywhere in the window — and is gone
from `public/metro_lines.geojson`, so Metro's own GTFS no longer carries it either.

A zero row asserts the line ran and carried nobody. Writing them would draw line 106
plunging from 4,062 to a flatline along the axis, which reads as a ridership collapse
rather than a line that ended — and the flatline grows by one month with every export
that lands. `CLAUDE.md` already has the words for this: *a month a line doesn't report
is a gap, not a zero.*

The rows appear because `fill_missing_months` cross-joins **the batch's** month range
with **the batch's** line set. Incremental ingests each covered a narrow range, so a line
that starts or stops mid-window was never padded across months outside its own batch. One
full re-ingest spans every month at once and pads everything. Line 74 is the mirror
image and is already in the committed file — five zeros for 2025-07 … 11, then real data
from 2025-12 — because its batch's range covered those months. So the file's working
convention is **pad the start, not the end**: at 2026-05 there are 114 lines and not one
with zero weekday ridership.

**Action for PR 3: none, beyond not "fixing" it.** Do not chase a clean
`git diff src/data/ridership.json` after a full re-ingest, and do not add the rows.

#### The padding rule is now enforced in code

Everything above described a convention the *data* followed and the *code* did not. Until
this was fixed, "pad the start, not the end" held only because the archives happen to be
delivered in narrow batches — feed the same months in as one wide batch and the padding
reappeared. `fill_missing_months` now pads a line's **leading** gap only. Months after a
line's last report, and interior months it skipped, are left absent.

**And the footgun that came with it is closed.** `merge_ridership`'s docstring promised
that "gaps in new data (within its date range) are backfilled from existing data before
the concat, preserving non-zero historical values." That backfill was **unreachable**: its
mask is `isnull(new) & notnull(old)`, but `fill_missing_months` had already `.fillna(0)`'d
every gap, so the new side was never null. Meanwhile
`pd.concat([merged, current]).drop_duplicates(keep="first")` let the new rows win — so a
wide-range re-ingest **could overwrite real committed ridership with zeros**, for any line
whose reporting is discontinuous inside the range, with the guard meant to prevent exactly
that sitting dead. It never fired on this data only because line 106's rows are absent
rather than present-and-nonzero.

Pads are now left as **NaN**, not `0`, which is what makes the existing mask reachable and
its docstring true. The NaN is load-bearing, and this is the part to not undo:

> **Padding cannot be detected by value — a real row may be all zeros.** Line 60 genuinely
> reported `0/0/0` for 2026-01. A backfill keyed on `== 0` instead of `isnull` would read
> that as padding and resurrect stale figures over a real zero report. Reported-ness comes
> from the merge indicator, never from the numbers.

Measured on a single wide batch over all five archives (2025-07 … 2026-06, 115 lines):
before, `42,747 → 42,753` records, writing six zero rows for line 106; after, `42,747 →
42,747` and none. Per-archive re-ingest is byte-identical to its control run.

`update_ridership.py`'s `diff_against_current` moved in step — a pad is not a pending
correction, and without that `--overwrite` reported 8 corrections where 1 was real.

## What PR 2 found

Two things later PRs need, and one number.

**PR 3 will crash on `data/raw/` as it stands.** `06-2026-Bus.xlsx` has one leaf row —
line 155, 2.9 weekday boardings — whose `STOP_NAME` is blank. `extract_leaf_rows` keeps
it, because the bus rule filters on `DIRECTION`, and `stop_identity._require_text` then
raises `ValueError: Stop name is missing (nan)` by design. So
`aggregate_to_stop_ridership` cannot currently be run over `data/raw/` at all. It was
not reachable when PR 1 was written: the month arrived in #176, afterwards. The fix
belongs in `extract_leaf_rows` — drop nameless leaf rows there, where "Total" rows are
already dropped — and it is a one-line change PR 3 must make before it can ingest
anything. PR 2 works around it locally in `fetch_stop_locations.drop_unnamed_rows`;
that workaround should be deleted once the ingest handles it.

**39 bus stops get a centroid that is in the wrong place** — risk 7, now measured.
`STOP_NAME` is a corner pair and LA reuses corner pairs across cities: `Main / Pico`
exists in downtown LA and in Santa Monica, 21 km apart, and there are 11 more above
5 km. The ordinary case is fine — 4,945 stops group more than one GTFS stop and the
median spread among them is 41 m, which is two sides of a street. Every stop carries
`spread_m` so the map layer can act on it; **PR 5 should hide or flag stops above a
threshold rather than drawing a dot in the ocean between two neighbourhoods.** The real
fix is line-aware disambiguation — GTFS `stop_times.txt` × `trips.txt` says which stops
a route actually serves, which resolves nearly all 39 — but it changes the join's grain
from `stop_key` to `(line, stop_key)` and so is not PR 2's to make.

**Match rate: bus 6,772/6,785 (99.8%), rail 110/110 (100%)** against the feeds of
2026-06-07. Rail reaches 100% via ten `stop_aliases.json` entries; the 13 unmatched bus
stops are listed in `src/data/stop_locations.json`'s `unmatched` and are **kept**, not
dropped. Rail is 110 places rather than the 116 names in the export because platform
suffixes fold — `Union Station - A Line` and `Union Station - Metro Red & Purple Lines`
are one station.

## The contract PR 1 freezes

PRs 2–5 read these and do not restate them.

**`aggregate_to_stop_ridership(df, year, month, mode)`** returns one row per line per
stop:

```
year, month, mode, line, stop_key, stop_name, station_order,
wd_ons, wd_offs, sa_ons, sa_offs, su_ons, su_offs
```

Values are raw decimals — rounding happens on write. `*_ACT` is dropped (it equals
ons + offs). Bus direction is collapsed. `station_order` is rail-only, an ordering
attribute, **never an identity**.

**`stop_identity`** owns naming: `normalise_stop_name`, `display_stop_name`,
`strip_rail_platform_suffix`, `parse_station_order`, `stop_key`. Keys are URL-safe
slugs (`^(bus|rail):[a-z0-9-]+$`) so `stop=<key>` needs no encoding.

**`extract_leaf_rows(df, mode)`** is the single source of truth for which rows are
real observations, and carries the ROUTE-over-LINE resolution. Any new aggregation
goes through it.

See [`../scripts/README.md`](../scripts/README.md) for the detail, including the
reconciliation caveat.

## Decisions that are settled

- **Bus grain is stop × line, direction collapsed.** Cuts the payload by ~41% —
  measured over `data/raw/`: 14,851 → 8,797 rows/month for 2025-07 … 11, 15,146 →
  8,953 for 2025-12, and 14,927 → 8,838 for 2026-01 … 05. It costs nothing
  renderable, because `STOP_NAME` is a name and not a `stop_id`, so both directions of
  a street share one name and therefore one coordinate. (Grouping on the raw name
  gives 8,841 for the last five months; name normalisation folds three further pairs
  that are spelling variants of one stop, e.g. `Pacific / RR-- Xing` and
  `Pacific / RR-Xing`.) Reopenable: `stop_times.txt` could recover direction later.
  2025-12 is the outlier month — 40 bus stops appear at once, an Altadena/Fair Oaks/
  Lake/Lincoln/Mariposa corridor plus `bus:little-tokyo-arts-district-station` on
  line 30 — and 8 disappear the month after.
- **No stop-total-across-lines rollup.** 79% of stops serve exactly one line, so the
  rollup would be ~77% the size of the detail table. Sum client-side.
- **Selection is the clutter control, not zoom-gating.** Max 154 stops on one bus
  line, so a 5-line selection draws ≤ ~800 circles.
- **Stop files ship columnar** from Python and the Vite plugin passes them through.
  `ridership.json`'s pretty-printed-records convention at ~97k rows × 10 fields would
  be ~25 MB rewritten in full every monthly update — a repo-growth problem, not a
  style preference. ADR-0008 records this.
- **Split by source export, not by app mode.** G Line (901) and J Line (910) BRT
  arrive in the *Bus* workbook, so `stop_ridership.bus.json` contains lines the app
  shows under the train filter. The client's mode filter keys off
  `metro_line_metadata_current.json`, never off which file a row came from.

## Named risks

1. **Forking the Month Window** — highest. PR 4 extracts `isInMonthWindow` and both
   derivations call it. [ADR-0001](adr/0001-ridership-month-window-is-deliberately-offset.md)
   exists because this arithmetic drifted once already.
2. **3.8 MB reaching first paint** — the bus file loads only when the stop panel is
   on *and* a bus-export line is selected, inside `OutputArea`'s lazy chunk. This is
   the failure that would undo that lazy-load.
3. **Non-deterministic write ordering** → a phantom multi-megabyte diff every run.
   Explicit sorts on both the rows and the stops dictionary.
4. **Stop sums ≠ line totals** — genuine and unavoidable. Documented as a tolerance;
   not engineered away. **The plan's `< 0.02` figure was a guess and the data
   disagrees**: measured over all 1,252 line-months, median 0.04% / p95 0.49% /
   max 2.35%, with three at or above 2% (line 211 at 2026-01, 2025-10 and 2025-07).
   PR 3's `--check` needs a looser bound or a named-exceptions list. Note also that
   for this window the days-weighted average contributes **nothing** — the Excel
   importer hardcodes `Days = 1` — so the whole spread is per-stop rounding.
5. **Alias rot** — a rename silently splits a series. The rename guard (PR 3) fails
   the ingest when a key appears and another disappears in the same month.
   **A same-month rule is too narrow for the churn actually in this data.**
   `bus:san-vicente-fairfax` runs 2025-07 → 2025-12 and
   `bus:san-vicente-orange-grove` runs 2025-12 → 2026-05: same line 28, same
   corridor, comparable boardings, and **one month of overlap**, so the add lands in
   2025-12 and the drop in 2026-01 and a same-month guard sees neither. Bus deltas
   are `+40/-0` at 2025-12 and `+0/-8` at 2026-01, never both in one month. Widen it
   to a ±1-month window, or compare first-seen/last-seen across the whole series.
6. **805-under-802 at stop grain** — any aggregation skipping `extract_leaf_rows`
   attributes D Line stations to the B Line. Covered structurally plus a dedicated
   test.
7. **Bus centroid ambiguity** — two sides of a street are ~20 m apart and fine at
   `maxZoom: 16`; a name reused by two distinct places is not. PR 2 emits `spread_m`
   and warns above ~200 m.
8. **Playwright project topology** — the `map` project runs once, not per viewport,
   and the two viewport projects `testIgnore` `map.spec.ts`. A feature spanning WebGL
   and DOM needs two specs in two projects.

## Docs each PR owes

- **ADR-0008** — stop ridership ships columnar from the pipeline, not as pretty
  records (PR 3 or 4).
- **ADR-0009** — a stop's identity is its normalised name, not Metro's row order
  (PR 2).
- **`CONTEXT.md`** — register **Stop Place**, **Stop Ridership Record**,
  **Boardings** / **Alightings** (*avoid*: ons, offs), **Stop Readout**, **Stop
  Coverage Window** (PR 5, or earlier if a PR needs the words first).
- **`docs/how-it-works.md`** — a "Stop-level ridership" section; the lazy-load rule
  and the BRT-901/910-in-the-bus-file quirk under *Conventions and quirks*.
- **`docs/guides/data.md`** — the stop step in "The usual path"; which baselines move.
- **`DATA_RELEASE_NOTES.md`** — the backfill, its 11-month span, and that line history
  is untouched (PR 3).
- **Diagrams** — `03-python-data-pipeline.mmd` gains the stop chain,
  `04-build-pipeline.mmd` the second plugin; also `05`, `07`, `08`, `10`, `15`, `16`.
  **Every edited `.mmd` needs its `captions.md` section in the same commit** —
  `scripts/build_architecture_docs.mjs` pairs by filename stem and fails the build on
  a mismatch. Then `npm run docs:architecture`.

## Side task, not code

A CPRA request to `records.metro.net` (NextRequest) for average weekday/Saturday/Sunday
**boardings and alightings by rail station and by bus stop**, FY2022-23 through
FY2025-26, **in CSV or Excel matching the existing `MM-YYYY-{Bus|Rail}.xlsx` export
layout** — asking for the same export shape is what makes the response drop straight
into this pipeline. Precedent: a requester obtained station-level rail + BRT for
FY2022-23 and FY2023-24 this way (Streetsblog LA, 2024-08-14). Turnaround is weeks, so
file early and build against the 11 months meanwhile.
