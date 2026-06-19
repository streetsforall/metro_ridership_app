# Plan: Add Map Area to Dashboard

## Context

The metro ridership dashboard currently shows a time-series chart of ridership for selected lines. The goal is to add a geographic map panel below the chart that renders the bus and train routes for all lines, highlighting the ones currently selected in the LineSelector. The map should look similar to the hill-to-sea project (rosemead-corridor), which uses MapLibre GL with GeoJSON route geometry.

Currently:

- No map library is installed
- No GeoJSON route geometry exists in the project
- The right panel (`OutputArea`) shows chart + summary stats

## Decisions

- **GeoJSON source**: Periodic script that downloads LA Metro GTFS and converts route shapes → static `src/data/metro_lines.geojson` (committed to repo, refreshed ~monthly)
- **Layout**: Map always visible below the chart in `OutputArea`
- **Tile provider**: OpenFreeMap (free, no API key). MapTiler as an env-var opt-in alternative.

---

## Step 1: Install Dependencies

```bash
npm install maplibre-gl
npm install --save-dev @types/geojson
```

---

## Step 2: Create GTFS → GeoJSON Script

**File**: `scripts/fetch-metro-lines.mjs`

This Node.js script runs periodically (monthly) to refresh the static route geometry. Add to `package.json` scripts:

```json
"fetch-lines": "node scripts/fetch-metro-lines.mjs"
```

**Script logic:**

1. Download LA Metro GTFS zip from the public feed URL (metro.net GTFS)
2. Unzip in memory using the `adm-zip` or `jszip` npm package
3. Parse `routes.txt` → `route_id`, `route_short_name`, `route_color`
4. Parse `trips.txt` → deduplicate `route_id → shape_id` mappings
5. Parse `shapes.txt` → build coordinate arrays per `shape_id`
6. For each route, pick one representative shape per direction (longest shape wins)
7. Map `route_short_name` → ridership app `line_id`:
   - Rail: use the `definedLines` table from `src/utils/lines.ts` (A→801, B→802, C→803, E→804, D→805, L→806, K→807, G→901, J→910)
   - Bus: `line_id = parseInt(route_short_name)` (LA Metro bus numbers match directly)
8. Build a GeoJSON `FeatureCollection` where each feature has:
   ```json
   {
     "properties": {
       "line_id": 801,
       "name": "A Line",
       "color": "#0072bc",
       "mode": "Rail"
     },
     "geometry": { "type": "MultiLineString", "coordinates": [...] }
   }
   ```
9. Write to `src/data/metro_lines.geojson`

**Note:** Colors for rail lines should come from `getLineColor()` in `src/utils/lines.ts`, not GTFS (to stay in sync). Bus line colors from `randomColors` in the same file. The script can hard-code the rail color table and let bus colors fall through to GTFS `route_color`.

---

## Step 3: Create Map Component

**File**: `src/components/Map.tsx`
**File**: `src/components/Map.css`

### Props

```typescript
interface MapProps {
  lines: Line[]; // all lines with .selected state from useUserDashboardInput
}
```

### Tile provider logic

```typescript
const mapTilerKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;

const STYLE_URL = mapTilerKey
  ? `https://api.maptiler.com/maps/ab4289f4-b600-4f7a-bbe3-c0666c48446d/style.json?key=${mapTilerKey}`
  : 'https://tiles.openfreemap.org/styles/liberty';
```

**(Proposed MapTiler alternative):** Set `VITE_MAPTILER_KEY` in `.env.local` and the map automatically switches to the custom-styled basemap from the rosemead-corridor project.

### Map initialization (useEffect, runs once)

- Center: `[-118.24, 34.05]` (downtown LA)
- Zoom: `10`, minZoom: `8`, maxZoom: `16`
- Add GeoJSON source `lines` from the static `metro_lines.geojson`
  - Each feature needs a numeric `id` for feature state: add `generateId: true`
- Add two layers (mimicking rosemead-corridor pattern):
  - `lines-unselected`: all lines, grey (#999), opacity 0.25, width 2
  - `lines-selected`: filtered to selected lines, full `line-color` from feature properties, opacity 1.0, width 4
  - Use `filter: ['in', ['get', 'line_id'], ['literal', []]]` (updated dynamically)
- Add hover popup showing line name (same pattern as rosemead-corridor `Map.tsx:474-519`)

### Selected lines sync (useEffect, watches `lines` prop)

```typescript
useEffect(() => {
  if (!map.current?.isStyleLoaded()) return;
  const selectedIds = lines.filter((l) => l.selected).map((l) => l.id);
  map.current.setFilter('lines-selected', [
    'in',
    ['get', 'line_id'],
    ['literal', selectedIds],
  ]);
}, [lines]);
```

### Map container CSS (`Map.css`)

```css
#lineMap {
  height: 400px;
  width: 100%;
}
```

---

## Step 4: Update OutputArea

**File**: `src/components/OutputArea.tsx`

Add `Map` below the chart. The `lines` prop is already passed into `OutputArea`.

```tsx
import Map from './Map';

// In the JSX, below the chart pane:
<div className="pane">
  <Map lines={lines} />
</div>;
```

The map renders regardless of whether lines are selected (it just shows the full network dimmed when nothing is selected).

---

## Step 5: Pass `lines` Through to OutputArea

**File**: `src/components/OutputArea.tsx`

The `lines` prop is already in `OutputAreaProps` and passed from `App.tsx`. No change needed in App — `OutputArea` already receives `lines: Line[]`.

---

## File Summary

| Action          | File                                                                 |
| --------------- | -------------------------------------------------------------------- |
| New             | `scripts/fetch-metro-lines.mjs`                                      |
| New (generated) | `src/data/metro_lines.geojson`                                       |
| New             | `src/components/Map.tsx`                                             |
| New             | `src/components/Map.css`                                             |
| Modify          | `src/components/OutputArea.tsx` — import and render Map              |
| Modify          | `package.json` — add maplibre-gl, @types/geojson, fetch-lines script |

---

## Reused Patterns

- MapLibre GL initialization pattern: `rosemead-corridor/frontend/src/components/Map.tsx:44-56`
- GeoJSON source + line layer pattern: `rosemead-corridor/frontend/src/components/Map.tsx:150-178`
- Hover popup pattern: `rosemead-corridor/frontend/src/components/Map.tsx:474-519`
- Line colors: `src/utils/lines.ts:getLineColor()` (already used by chart)
- Line IDs and names: `src/utils/lines.ts:definedLines` (used in GTFS mapping script)

---

## Verification

1. Run `npm run fetch-lines` → verify `src/data/metro_lines.geojson` is created with expected features
2. Run `npm run dev` → open dashboard at `localhost:5173`
3. Confirm map renders below the chart showing the LA Metro network in grey
4. Select a rail line (e.g., A Line) in the LineSelector → verify the A Line highlights in blue on the map
5. Select bus lines → verify those routes highlight in their colors
6. Deselect all → all lines return to grey
7. Hover a line on the map → popup shows line name
8. (Optional) Add `VITE_MAPTILER_KEY` to `.env.local` → verify basemap switches to styled MapTiler map
