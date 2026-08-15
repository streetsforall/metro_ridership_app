# Roadmap — stop-level ridership

The app shows ridership per **line**. This is the sequence that gets it to
**stop and station** grain, with **alightings**, which the app has never shown at
any grain.

The data is already in the repo. The CPRA Excel files in `data/raw/` are
stop/station-level with ons, offs and activity for all three day types;
`aggregate_to_line_ridership` used to `groupby("LINE").sum()` and discard stop
identity, offs and activity at ingest. Nothing needs to be acquired.

Coverage is **2025-07 → 2026-05, 11 months, both modes**. Everything before that is
line-level only and stays untouched.

## The five PRs

Tick a row when its PR merges. This table is the batch's shared reference — later
PRs update it rather than restating their own scope.

| PR | Contents | Gate | Status |
| --- | --- | --- | --- |
| **1** | `stop_identity.py`, `stop_aliases.json`, the `extract_leaf_rows` refactor, `aggregate_to_stop_ridership`, tests. **No data change.** | `pytest scripts/` green with the six existing test files unmodified; a full re-ingest leaves `src/data/ridership.json` unchanged | ☐ |
| **2** | `fetch_stop_locations.py`, `src/data/stop_locations.json`, `scripts/README.md`, tests | Match rate reported; unmatched reviewed and aliases extended | ☐ |
| **3** | `stop_ridership.py`, `update_ridership.py` wiring, the two data files, `DATA_RELEASE_NOTES.md` | Reconciliation within tolerance; two runs byte-identical | ☐ |
| **4** | Vite plugin, manifest, `src/stops/`, `stops.types.ts`, the `isInMonthWindow` extraction, vitest specs. **No visible UI.** | `ANALYZE=1 npm run build` — entry chunk unchanged; no visual baseline moves | ☐ |
| **5** | Map layer, `#stop-panel`, URL state, `mapPopup` addition, Playwright baselines | New baselines only; `visual.spec.ts`'s six must **not** move | ☐ |

1 → 2 → 3 are pipeline-serial. 4 can start once PR 1's schema is fixed. PR 3 carries
the multi-megabyte data diff alone, so its review is "is the data right", not "is the
code right"; the 4/5 split means exactly one PR touches visual baselines.

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

- **Bus grain is stop × line, direction collapsed.** Halves the payload
  (14,927 → 8,841 rows/month) and costs nothing renderable, because `STOP_NAME` is a
  name and not a `stop_id` — both directions of a street share one name and therefore
  one coordinate. Reopenable: `stop_times.txt` could recover direction later.
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
4. **Stop sums ≠ line totals** — genuine and unavoidable, two independent causes.
   Documented as a tolerance; not engineered away.
5. **Alias rot** — a rename silently splits a series. The rename guard (PR 3) fails
   the ingest when a key appears and another disappears in the same month.
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
