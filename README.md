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

## Adding/updating metrics

As time progresses and new ridership metrics are collected, `data/ridership.json` needs to be updated. Eventually we want an automated script that picks up the latest metrics from LA Metro's repo, parses it, and updates our JSON accordingly. But in the meantime this will need to be done manually.

Additionally, we need to think of a good way to structure our data as months and years pass, so that the single JSON file doesn't just grow infinitely.
