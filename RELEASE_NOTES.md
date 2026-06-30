# Release Notes

## v0.1.0 — Data refresh & dynamic date range

### Highlights

- **Ridership data updated through March 2026.** The app now ships the latest LA
  Metro bus and rail ridership, including previously missing 2025 months.
- **Date range tracks the data automatically.** The Start/End year selectors and
  the default view now derive their bounds from the data itself, so the newest
  months are always selectable without code changes.

### New features

- The date-range year dropdowns are generated dynamically from the span of
  `ridership.json` (currently 2009–2026) instead of a hardcoded 2009–2025 list.
- The dashboard's default end date snaps to the latest available month, so a
  fresh load shows the most recent data.

### Data pipeline

- Python data-processing scripts now replace the previous `.mjs` implementations:
  - `fetch_metro_lines.py` — downloads GTFS feeds → `public/metro_lines.geojson`
  - `compute_line_distances.py` — geometry → `src/data/line_distances.json`
  - `process_ridership.py` — merges a ridership CSV into the app's JSON
  - `convert_excel_ridership.py` — converts the Excel files Metro provides into CSV
- Full `pytest` coverage added for each script.
- `scripts/README.md` documents the end-to-end workflow, including **how to file
  an LA Metro public records request** (https://lametro.nextrequest.com/requests/new)
  to obtain new ridership data.
- Raw source data is committed compressed under `data/raw/`.

### Maintenance

- Added `CLAUDE.md` with project architecture and conventions.
- Updated tests for the dynamic date-range behavior.
