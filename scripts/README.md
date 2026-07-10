# scripts/

Utility scripts for fetching and processing LA Metro route data. Each script
has both a JavaScript (`.mjs`) and a Python (`.py`) implementation that produce
identical output.

---

## Scripts

### `fetch_metro_lines` / `fetch-metro-lines.mjs`

Downloads the LA Metro GTFS feeds (rail + bus), converts route shapes to
GeoJSON, and writes `public/metro_lines.geojson`. Run this monthly to keep
route geometry up to date.

```bash
# JavaScript
npm run fetch-lines

# Python
python scripts/fetch_metro_lines.py
```

### `compute_line_distances` / `compute-line-distances.mjs`

Reads `public/metro_lines.geojson` and writes one-way route distances (in
miles, rounded to one decimal) to `src/data/line_distances.json`. Rail lines
store outbound + inbound as two lineStrings; only the outbound leg is measured
to avoid double-counting.

```bash
# JavaScript
node scripts/compute-line-distances.mjs

# Python
python scripts/compute_line_distances.py
```

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

**Run:**

```bash
python scripts/update_ridership.py              # scan data/raw/, add new months
python scripts/update_ridership.py --dry-run     # report what's new, write nothing
python scripts/update_ridership.py --overwrite    # let newer numbers replace existing months
python scripts/update_ridership.py --no-release-notes
python scripts/update_ridership.py data/raw/2026-04_2026-05.zip   # limit to given paths
```

Under the hood it reuses `process_ridership` (below) for parsing and merging.
Use `process_ridership` directly when you want to force-ingest one specific file.

---

## `process_ridership`

Processes raw LA Metro ridership data and merges it into `src/data/ridership.json`
and `src/data/metro_line_metadata_current.json`.

**Accepted inputs:**

- **Excel** (what public records requests now return) — a single
  `MM-YYYY-{Bus|Rail}.xlsx` file, or a date-range zip of them (e.g.
  `2026-04_2026-05.zip`). These are parsed by `convert_excel_ridership.py` into
  the CSV schema below before processing; line ridership is the sum of stop/station
  boardings (Ons) per line.
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

Dependencies: `requests` (HTTP), `pandas` + `numpy` (data processing), `pytest` (tests).

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
