# Updating the data

Ridership data comes from LA Metro via a California Public Records Act request, which returns
monthly Excel files (`MM-YYYY-{Bus|Rail}.xlsx`) and per-year zip archives.

[`scripts/README.md`](../../scripts/README.md) is the full reference — how to submit the records
request, the whole processing pipeline, and compression instructions. This page is the short version.

## The usual path

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

## What it writes

- **`src/data/ridership.json`** — flat array of monthly ridership records (year, month, line,
  weekday/Saturday/Sunday averages). Canonical, and what the Vite plugin re-encodes into the
  columnar blob the app fetches.
- **`src/data/metro_line_metadata_current.json`** — the line catalog (line number, mode, provider),
  updated automatically when new lines appear in the data.
- **[`DATA_RELEASE_NOTES.md`](../../DATA_RELEASE_NOTES.md)** — a dated entry is prepended whenever
  new months are added. Suppress with `--no-release-notes`.

`DATA_RELEASE_NOTES.md` (data updates) and `RELEASE_NOTES.md` (app releases) are different files.

## Raw files

Commit them compressed — `.zip` for Excel, `.csv.gz` for legacy CSVs. Uncompressed `.xlsx` and
`.csv` are gitignored.

## The other scripts

| Script | Does |
| --- | --- |
| `convert_excel_ridership.py` | Parses the `.xlsx` files into the legacy CSV schema. Called by `process_ridership.py`; also `npm run load-ridership`. |
| `fetch_metro_lines.py` | GTFS feeds → `public/metro_lines.geojson`. Also `npm run fetch-lines`. Run it before the script tests, which use that file as a fixture. |
| `compute_line_distances.py` | `metro_lines.geojson` → `src/data/line_distances.json` (one-way miles; outbound leg only for rail). |
| `check_transit_events.py` | Validates `src/data/transit-events.json` — line ids exist in the live GTFS feed, and single-line `opening` dates match the first non-zero ridership month. Extensions are flagged for manual review. Also `npm run check-transit-events`. Offline schema checks run separately in `src/data/__tests__/transit-events.test.ts`. |

## After a data update

A new month of data moves some visual baselines. `dataDefaultEndDate` is computed from
`ridership.json` at module load, so a new month shifts the default Month Window and the year
`<option>`s in the date selector. The specs that pin an explicit window in their query string —
`chart-content`, `context-logs`, `line-filters`, `summary-tiles`, `table-view`,
`responsive-tablet` — are unaffected; `visual.spec.ts` calls `gotoDashboard(page)` with no search
and therefore lands on the new default, so its six baselines move.

Regenerate in the same PR:

```bash
npm run test:e2e:update:linux -- --update-snapshots=all visual
```

See [the testing guide](testing.md#only-the-linux-baselines-are-committed) for why `=all` is
load-bearing there.

For exploration and debugging, use the notebooks in [`notebooks/`](../../notebooks/) — particularly
`metro_data_ridership_update.ipynb`.
