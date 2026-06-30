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

## Python setup

```bash
pip install -r scripts/requirements.txt
```

Dependencies: `requests` (HTTP), `pytest` (tests).

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
