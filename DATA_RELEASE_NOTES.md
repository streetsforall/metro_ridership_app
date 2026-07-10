# Data Release Notes

A log of each batch of ridership data merged into
[`src/data/ridership.json`](src/data/ridership.json). New data is obtained from LA Metro
via a California Public Records Act (CPRA) request — delivered as monthly Excel files —
and ingested with [`scripts/process_ridership.py`](scripts/process_ridership.py). See
[`scripts/README.md`](scripts/README.md) for the request and processing workflow.

Each record is one line's monthly ridership: estimated weekday, Saturday, and Sunday
boardings. Source archives are committed under [`data/raw/`](data/raw/).

Entries are newest first.

---

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
`ridership.json` currently spans **2009-01 → 2026-05**.

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
