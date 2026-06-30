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

## `process_ridership`

Processes a raw LA Metro ridership CSV and merges it into `src/data/ridership.json`
and `src/data/metro_line_metadata_current.json`.

**Input CSV format** (from LA Metro or a public records request):

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
