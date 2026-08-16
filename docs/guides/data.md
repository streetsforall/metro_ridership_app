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

## The plausibility guard

Before writing, `update_ridership.py` checks every month it is about to add against the month
before it and **refuses the merge (exit 2)** if a whole mode has shifted implausibly. Metro's June
2026 bus export was inflated ×2.4 across all 108 lines and merged unnoticed because no such check
existed — see [`../data-quality/2026-06-bus-export-defect.md`](../data-quality/2026-06-bus-export-defect.md).

The test is on the **median** per-line change, not the total, so it does not fire on real events:
one line moving a long way cannot shift a median, and neither can a few lines being restructured
at once. Both happen in this dataset — the D Line fell 40% in June 2026 as its opening surge
faded, and the Regional Connector moved three of six rail routes in July 2023. Those show up in an
informational per-line list instead.

If a month genuinely did move that far, override it deliberately:

```bash
python scripts/update_ridership.py --allow-anomalies
```

The override is recorded in `DATA_RELEASE_NOTES.md`, not just printed to a console.

## Withdrawing bad data

Ingest only ever adds or restates. To take records back out — a delivery that turned out to be
wrong in one mode but not the other:

```bash
python scripts/remove_ridership_records.py --year 2026 --month 6 --mode Bus --reason "..."
```

`--mode` and/or `--lines` is required; it will not silently drop a whole month. Records are
deleted, never zeroed: a zero row claims the line ran and carried nobody, which the chart draws as
a real point. Withdrawn records are ordinary new keys again, so a corrected export appends without
`--overwrite`.

**It removes both grains.** Line records and the matching stop-month rows go together, because
withdrawing one and leaving the other publishes two different answers for the same month. That is
not hypothetical: reverting the June 2026 ingest took the line records out but left
`stop_ridership.bus.json` serving the inflated figures, since the payloads were committed by a
later PR built while the bad workbook was still in `data/raw/`.

Keep the bad source file as evidence in `data/raw/quarantine/`, which is outside the ingest glob.

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
