# Metro Ridership App

This is a project built by Streets for All's Data/Dev Team to visualize and interact with Los Angeles Metro's ridership data for rail and bus service. It's currently a client-side rendered React application built with Vite but may switch to a full-stack application if the required data processing becomes too heavy.

## Data overview

The data is generally categorized into two different types:

- Line metadata contains summary data at the bus/rail line level, such as the line identifier and method of operation.
- Ridership metrics are the monthly records of each line, with average daily ridership for weekdays, Saturdays, and Sundays.

In order to be utilized in the chart, ridership metrics are converted from a flat structure into one that is consolidated by line (see `@types/metrics.types.ts`). Furthermore, in order to display the metrics in the line summary table, additional data is added to the line metadata based on calculations made on each line's consolidated metrics (see `@types/lines.types.ts`).

The general process of loading and transforming relevant data is as follows:

1. Load lines and assemble JSON with `createLinesData()` in `useUserDashboardInput.ts`.
2. Consolidate metrics by line in `App.tsx`.
3. In `App.tsx`, using the consolidated metrics, call `updateLinesWithLineMetrics()` in `hooks/useUserDashboardInput.ts` to add summary metrics to each line.

## Development

### Prerequisites

- Node.js (check `.nvmrc` or `package.json` engines field if present)
- npm

### Local development

```bash
npm install
npm run dev
```

The app will be available at `http://localhost:5173` (Vite default).

### Build

```bash
npm run build
```

Runs TypeScript type-checking (`tsc -b`) followed by the Vite production build. Output goes to `dist/`.

To preview the production build locally:

```bash
npm run preview
```

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

Ridership CSVs are obtained directly from LA Metro or via a public records request. Once you have the CSV, run:

```bash
python scripts/process_ridership.py data/raw/Monthly_Riders.csv.gz
```

This updates two files consumed by the app:

- **`src/data/ridership.json`** — flat array of monthly ridership records (year, month, line, weekday/Saturday/Sunday averages)
- **`src/data/metro_line_metadata_current.json`** — line catalog (line number, mode, provider); updated automatically when new lines appear in the CSV

Store raw CSVs in `data/raw/` as compressed `.csv.gz` files (uncompressed CSVs are gitignored). See [`scripts/README.md`](scripts/README.md) for full details on the processing pipeline and compression instructions.

For data exploration and debugging, use the notebooks in [`notebooks/`](notebooks/) — particularly `metro_data_ridership_update.ipynb`.
