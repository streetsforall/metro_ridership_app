# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # start dev server at http://localhost:5173
npm run build        # tsc type-check + vite production build → dist/
npm run preview      # serve the production build locally
npm run test         # run all tests once
npm run test:watch   # run tests in watch mode
npm run lint         # ESLint with TypeScript + React rules
npm run fetch-lines  # node scripts/fetch-metro-lines.mjs — updates metro line GeoJSON
```

To run a single test file:
```bash
npx vitest run src/utils/calc.test.ts
```

## Architecture

Client-side React SPA (Vite + TypeScript). No backend. All data is bundled as static JSON files in `src/data/`.

### Data flow

1. **Line metadata** (`src/data/metro_line_metadata_current.json`) — raw `LineJson[]` with line number, mode (Bus/Rail), and provider.
2. **Line distances** (`src/data/line_distances.json`) — keyed by line ID string.
3. **Ridership records** (`src/data/ridership.json`) — flat `RidershipRecord[]` with monthly avg daily ridership per line.
4. **Transit events** (`src/data/transit-events.json`) — milestone events (openings, disruptions) with dates and affected line IDs.

`useUserDashboardInput` (hook) assembles `Line[]` from the metadata + distances JSON, manages all user-selected state (date range, day-of-week filter, line selections, mode filters, search text, aggregate toggle), and syncs everything to URL query params so the view is shareable.

`App.tsx` holds the single `useMemo` that simultaneously builds `chartDatasets` (Chart.js datasets for selected lines) and `consolidatedRidership` (records grouped by line ID). A separate `useMemo` filters `transitEvents` to only those within the selected date range and relevant to selected lines. After each ridership computation, `updateLinesWithLineMetrics()` patches each `Line` object with computed stats (average, change, start/end values, riders-per-mile).

### Key types

- `Line` (`src/@types/lines.types.ts`) — extends `LineJson` with runtime-computed fields (`selected`, `visible`, `averageRidership`, `changeInRidership`, etc.)
- `ConsolidatedRidership` / `ConsolidatedRecord` (`src/@types/metrics.types.ts`) — `ridershipRecords` grouped by line ID string, keyed off `record.line_name` (a number stored as string key)
- `TransitEvent` (`src/@types/events.types.ts`) — milestone events; `line_ids: []` means system-wide (all lines)
- `DayOfWeek` — one of `est_wkday_ridership | est_sat_ridership | est_sun_ridership`

### Named rail lines

Rail line numbers 801–910 have human-readable letter/color mappings defined in `src/utils/lines.ts` (`definedLines`). Bus lines get a deterministic HSL color via the golden-angle formula. `getLineColor(id)` and `getLineNames(id)` are the public API.

### URL query params

All dashboard state is encoded in the URL by `useUserDashboardInput`:

| Param | Values |
|-------|--------|
| `start` / `end` | `YYYY-MM` |
| `day` | `wkday` / `sat` / `sun` |
| `lines` | comma-separated line IDs |
| `q` | search text |
| `buses` / `trains` | `0` to hide |
| `aggregate` | `1` to show aggregate series |

### Chart

`OutputArea.tsx` registers two custom Chart.js plugins at module load:
- `hoverCrosshairPlugin` — draws a vertical dashed line at the hovered x position
- `eventMarkersPlugin` — draws amber vertical dashed lines at transit event dates; reads events from `chart.options.plugins.eventMarkers.events`

Chart labels use the format `"YYYY M"` (e.g. `"2023 2"`); event dates are `"YYYY-MM"` and must be converted when matching against labels.

### Map

`src/components/Map.tsx` uses MapLibre GL (`maplibre-gl`). Line GeoJSON is in `public/metro_lines.geojson`. The map renders selected lines highlighted.

### Tests

Vitest with `jsdom` environment and `@testing-library/react`. Test files sit alongside source files (`*.test.ts` / `*.test.tsx`).
