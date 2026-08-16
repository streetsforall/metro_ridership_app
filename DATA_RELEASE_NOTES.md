# Data Release Notes

A log of each batch of ridership data merged into
[`src/data/ridership.json`](src/data/ridership.json). New data is obtained from LA Metro
via a California Public Records Act (CPRA) request — delivered as monthly Excel files —
and ingested with [`scripts/process_ridership.py`](scripts/process_ridership.py). See
[`scripts/README.md`](scripts/README.md) for the request and processing workflow.

Each record is one line's monthly ridership: estimated weekday, Saturday, and Sunday
boardings. Source archives are committed under [`data/raw/`](data/raw/).

The same archives also carry **stop and station grain**, merged into
[`src/data/stop_ridership.{bus,rail}.json`](src/data/) by
[`scripts/stop_ridership.py`](scripts/stop_ridership.py). Those files cover a shorter
span than the line history and are noted separately below.

Entries are newest first.

---

## Stop-level ridership — Jul 2025 – Jun 2026 (backfill)

- **Type:** new dataset — **no change to `ridership.json`**, whose 17 years of line
  history are untouched by this and by every future stop-grain update.
- **Files:** `src/data/stop_ridership.bus.json` (5.3 MB, 105,984 rows, 6,785 stops,
  109 lines) and `src/data/stop_ridership.rail.json` (89 KB, 1,470 rows, 110 stops,
  6 lines).
- **Months:** July 2025 – June 2026, 12 months, both modes. **This is the whole of the
  stop-level history there is.** Everything before 2025-07 was delivered at line grain
  only, so the stop panel covers a window the ridership chart dwarfs.
- **Source:** `Bus 2025.zip`, `Rail 2025.zip`, `2026-01_2026-03.zip`,
  `2026-04_2026-05.zip`, `2026-06_2026-06.zip` — the same archives the line grain was
  ingested from, re-read at leaf-row grain rather than summed to lines.
- **Grain:** one row per line per stop per month, with **boardings and alightings** for
  all three day types. Alightings have never been shown by this app at any grain. Bus
  direction is collapsed: `STOP_NAME` is a name and not a `stop_id`, so both sides of a
  street already share one name and one coordinate.
- **Split by source export, not by app mode.** G Line (901) and J Line (910) BRT are
  delivered in the Bus workbook and are therefore in the bus payload, while the app
  files them under its train filter. The client's mode filter reads
  `metro_line_metadata_current.json`, never which file a row came from.
- **One leaf row is dropped:** `06-2026-Bus.xlsx` has a line 155 row with 2.9 weekday
  boardings and a blank `STOP_NAME`. It stays in the line total and has no stop grain —
  what is missing is where those riders boarded, not whether they did.
- **Stop sums do not exactly equal the line totals**, and are not meant to. Measured
  across 3,978 (line, month, day type) comparisons: median 0.06%, p95 0.83%, max 5.10%
  (line 602, 2025-08, Sunday: 103 vs 98). The cause is per-stop rounding under Metro's
  `+0.5` convention, which rounds half up and so drifts a few hundredths of a rider
  upward per stop. See `scripts/README.md`.
- Ingested via `update_ridership.py` on 2026-08-15.

## Jun 2026

- **Months:** June 2026
- **Source:** `data/raw/2026-06_2026-06.zip`
- **Modes:** Bus + Rail
- **Added:** 114 records across 114 lines
- Ingested via `update_ridership.py` on 2026-08-15.
- **Note:** line 805 (D/Purple) weekday boardings fall 39,626 → 23,787. The drop is in the
  source data and is confined to the eight original stations (Union Station through
  Wilshire/Western, all −41% to −52%); the three extension stations (La Brea, Fairfax,
  La Cienega) are flat. B/Red (802) is unaffected over the same segment, so this reads as a
  D-Line-only service disruption rather than an aggregation error.

## D/Purple Line split from B/Red (reprocessing)

- **Type:** data-model correction — no new months added
- **What changed:** the rail Excel nests the **D Line (Purple)** as `ROUTE` 805 under
  `LINE` 802 (the B/Red grouping). The ETL previously summed both routes into a single
  "802" total, folding the Purple Line's riders into the Red Line. It now aggregates rail
  by `ROUTE`, so line **805** is reported on its own.
- **Effect:** line **805** added for **2025-09 → 2026-05** (the months the source provides
  the route breakdown; +11 records). Line **802** drops to Red-only for those same months
  (e.g. May 2026 weekday 87,237 → 47,611). Earlier history has no route column in the
  source, so **802 remains Red+Purple combined before 2025-09** — a deliberate discontinuity
  in the B-Line series at Sept 2025.
- **Source:** re-ingested `Bus 2025.zip`, `Rail 2025.zip`, `2026-01_2026-03.zip`,
  `2026-04_2026-05.zip` through the updated `convert_excel_ridership.py`.

## Apr–May 2026

- **Months:** April 2026, May 2026
- **Source:** `data/raw/2026-04_2026-05.zip`
- **Modes:** Bus + Rail
- **Added:** 226 records across 113 lines
- First batch ingested after `process_ridership.py` gained direct support for date-range
  Excel zips (`MM-YYYY-{Bus|Rail}.xlsx`).

## Jan–Mar 2026

- **Months:** January 2026, February 2026, March 2026
- **Source:** `data/raw/2026-01_2026-03.zip`
- **Modes:** Bus + Rail
- **Added:** 339 records across 113 lines

## Jul–Dec 2025

- **Months:** July 2025 – December 2025
- **Source:** `data/raw/Bus 2025.zip`, `data/raw/Rail 2025.zip`
- **Modes:** Bus + Rail
- **Added:** 684 records across 114 lines

---

## Baseline

Ridership data from January 2009 through June 2025 predates this log and was sourced
before the CPRA/Excel workflow. It is the starting baseline for the entries above.
`ridership.json` currently spans **2009-01 → 2026-06**.

---

## Adding a new batch

1. Obtain the Excel data via CPRA request (see [`scripts/README.md`](scripts/README.md)),
   and commit the archive under `data/raw/` (a date-range zip of `MM-YYYY-{Bus|Rail}.xlsx`
   files, e.g. `2026-06_2026-08.zip`).
2. Merge it into the app data:

   ```bash
   python scripts/process_ridership.py data/raw/<archive>.zip
   ```

   The script prints the record delta (e.g. `ridership updated: X -> Y records (+N)`).
3. Add a new entry at the top of this file with the months, source archive, modes, and the
   record/line counts from that output.
