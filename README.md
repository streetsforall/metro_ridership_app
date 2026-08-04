# Metro Ridership App

This is a project built by Streets for All's Data/Dev Team to visualize and interact with Los Angeles Metro's ridership data for rail and bus service. It's currently a client-side rendered React application built with Vite but may switch to a full-stack application if the required data processing becomes too heavy.

## Data overview

The data is generally categorized into two different types:

- Line metadata contains summary data at the bus/rail line level, such as the line identifier and method of operation.
- Ridership metrics are the monthly records of each line, with average daily ridership for weekdays, Saturdays, and Sundays.

In order to be utilized in the chart, ridership metrics are converted from a flat structure into one that is consolidated by line (see `src/@types/metrics.types.ts`). Furthermore, in order to display the metrics in the line summary table, additional data is added to the line metadata based on calculations made on each line's consolidated metrics (see `src/@types/lines.types.ts`).

The general process of loading and transforming relevant data is as follows:

1. Load lines and assemble JSON with `createLinesData()` in `useUserDashboardInput.ts`.
2. Consolidate metrics by line in `App.tsx`.
3. In `App.tsx`, using the consolidated metrics, call `updateLinesWithLineMetrics()` in `hooks/useUserDashboardInput.ts` to add summary metrics to each line.

## Development

### Prerequisites

- Node.js 22 — the repo pins `22.23.2` in [`.node-version`](.node-version), which `fnm`/`nvs`/`asdf` read automatically. CI uses the same file.
- npm
- Python 3 — only for the data-processing scripts (see [`scripts/README.md`](scripts/README.md))
- Docker — only for regenerating Linux visual-regression baselines (see [End-to-end tests](#end-to-end--visual-regression-tests))

### Local development

```bash
npm install
npm run dev
```

The app will be available at `https://localhost:5173`. Note the **https** — [`@vitejs/plugin-basic-ssl`](https://www.npmjs.com/package/@vitejs/plugin-basic-ssl) is enabled for `vite serve`, so your browser will warn about the self-signed certificate the first time. Accept it and carry on.

### Build

```bash
npm run build
```

Runs TypeScript type-checking (`tsc -b`) followed by the Vite production build. Output goes to `dist/`.

To preview the production build locally:

```bash
npm run preview
```

Served at `https://localhost:4173` — also self-signed, for the same reason as the dev server.

### Test

```bash
npm run test        # run all tests once
npm run test:watch  # run tests in watch mode
```

Tests use [Vitest](https://vitest.dev/) with `@testing-library/react` for component tests.

### Lint

```bash
npm run lint
```

Uses ESLint with TypeScript, React hooks, and React refresh plugins. Fix lint errors before opening a pull request.

## Updating ridership data

Ridership data is obtained from LA Metro via a California Public Records Act request, which returns monthly Excel files (`MM-YYYY-{Bus|Rail}.xlsx`) and per-year zip archives. Drop them in `data/raw/`, then:

```bash
python scripts/update_ridership.py             # scan data/raw/, add any months not already present
python scripts/update_ridership.py --dry-run   # report what's new, write nothing
```

`update_ridership.py` is the day-to-day entry point: it works out which month/line records are missing and appends only those. To force-ingest one specific file, call the underlying script directly:

```bash
python scripts/process_ridership.py data/raw/2026-04_2026-05.zip
python scripts/process_ridership.py data/raw/04-2026-Bus.xlsx
python scripts/process_ridership.py data/raw/Monthly_Riders.csv.gz   # legacy CSV format
```

This updates three files:

- **`src/data/ridership.json`** — flat array of monthly ridership records (year, month, line, weekday/Saturday/Sunday averages)
- **`src/data/metro_line_metadata_current.json`** — line catalog (line number, mode, provider); updated automatically when new lines appear in the data
- **[`DATA_RELEASE_NOTES.md`](DATA_RELEASE_NOTES.md)** — a dated entry is prepended whenever `update_ridership.py` adds new months (suppress with `--no-release-notes`). This is distinct from [`RELEASE_NOTES.md`](RELEASE_NOTES.md), which tracks app releases.

Commit raw files to `data/raw/` compressed — `.zip` for Excel, `.csv.gz` for legacy CSVs. Uncompressed `.xlsx` and `.csv` files are gitignored. See [`scripts/README.md`](scripts/README.md) for how to submit the records request, the full processing pipeline, and compression instructions.

For data exploration and debugging, use the notebooks in [`notebooks/`](notebooks/) — particularly `metro_data_ridership_update.ipynb`.
