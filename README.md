# Metro Ridership App

This is a project built by Streets for All's Data/Dev Team to visualize and interact with Los Angeles Metro's ridership data for rail and bus service. It's currently a client-side rendered React application built with Vite but may switch to a full-stack application if the required data processing becomes too heavy.

## Data overview

The data is generally categorized into two different types:

- Line metadata contains summary data at the bus/rail line level, such as the line identifier and method of operation.
- Ridership metrics are the monthly records of each line, with average daily ridership for weekdays, Saturdays, and Sundays.

In order to be utilized in the chart, ridership metrics are converted from a flat structure into one that is aggregated by line (see `@types/metrics.types.ts`). Furthermore, in order to display the metrics in the line summary table, additional data is added to the line metadata based on calculations made on each line's aggregated metrics (see `@types/lines.types.ts`).

The general process of loading and transforming relevant data is as follows:

1. Load lines and assemble JSON with `createLinesData()` in `useUserDashboardInput.ts`.
2. Aggregate metrics by line in `App.tsx`.
3. In `App.tsx`, using the aggregated metrics, call `updateLinesWithLineMetrics()` in `hooks/useUserDashboardInput.ts` to add summary metrics to each line.

## Adding/updating metrics

As time progresses and new ridership metrics are collected, `data/ridership.json` needs to be updated. Eventually we want an automated script that picks up the latest metrics from LA Metro's repo, parses it, and updates our JSON accordingly. But in the meantime this will need to be done manually.

Additionally, we need to think of a good way to structure our data as months and years pass, so that the single JSON file doesn't just grow infinitely.
