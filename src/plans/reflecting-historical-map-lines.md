# Plan: Historical Transit Line Route Rendering

## Context

The app displays ridership data from 2009 to present, but the map always shows current route geometries. This is misleading for historical views: the E Line (Expo) didn't open until April 2012, the K Line until October 2021, and the E Line had a shorter route (only to Culver City) until May 2016. Users exploring data before these dates should see routes as they actually existed.

## Goal

Show the map rendering transit routes as they existed at the **end of the selected date range** — filtering out lines that hadn't opened yet and showing shorter historical geometries for lines that were later extended.

---

## Implementation

### Step 1 — Create `scripts/route-history.json` (new file)

Single source of truth for all temporal route metadata.

```json
{
  "openingDates": {
    "804": "2012-04",
    "807": "2021-10"
  },
  "geometryEras": [
    {
      "line_id": 804,
      "name": "E Line (Phase 1 — 7th/Metro to Culver City)",
      "valid_from": "2012-04",
      "valid_to": "2016-04",
      "coordinates": [ [ [lng, lat], ... ] ]
    },
    {
      "line_id": 806,
      "name": "L Line (pre-Azusa extension)",
      "valid_from": "2003-07",
      "valid_to": "2016-02",
      "coordinates": [ [ [lng, lat], ... ] ]
    }
  ]
}
```

- `openingDates`: lines that need existence filtering (E Line 2012-04, K Line 2021-10)
- `geometryEras`: eras with different route shapes; populate `coordinates` from Mobility Database GTFS archives (feed: `f-9q5-lacmta` on transit.land) for pre-2016 E Line and pre-2016 L Line
- Lines absent from both sections get `valid_from: 0` (active before our data range)

### Step 2 — Update `scripts/fetch-metro-lines.mjs`

After building `allFeatures` from GTFS, add a `applyRouteHistory(features, history)` function:

1. Features whose `line_id` is in `openingDates`: set `valid_from = YYYYMM(openingDate)`, `valid_to = 999999`
2. All other features: set `valid_from = 0`, `valid_to = 999999`
3. For each `geometryEras` entry: push an additional feature with the historical coordinates and the era's `valid_from`/`valid_to`. Also update the corresponding "current" feature's `valid_from` to the era's `valid_to + 1 month`.

Encoding helper: `dateToYYYYMM("2012-04") => 201204` (parse year\*100 + month from YYYY-MM string).

Re-run `npm run fetch-lines` after this step to regenerate `public/metro_lines.geojson`.

### Step 3 — Add utility to `src/utils/lines.ts`

```typescript
export function dateToYYYYMM(date: Date): number {
  return date.getFullYear() * 100 + (date.getMonth() + 1);
}
```

### Step 4 — Update `src/components/Map.tsx`

**4a — Extend `MapProps`:**

```typescript
interface MapProps {
  lines: Line[];
  endDate: Date;
}
```

**4b — Promote internal state to component-level refs** (needed for cross-effect cleanup):

```typescript
const cachedGeoJSON = useRef<GeoJSON.FeatureCollection | null>(null);
const endDateRef = useRef(endDate);
const hoveredIdRef = useRef<string | number | undefined>(undefined);
const popupRef = useRef<maplibregl.Popup | null>(null);
```

Keep `endDateRef` in sync: `useEffect(() => { endDateRef.current = endDate; }, [endDate]);`

**4c — Change `addSource` from URL-string to empty FeatureCollection:**

```typescript
map.current!.addSource('metro-lines', {
  type: 'geojson',
  data: { type: 'FeatureCollection', features: [] },
  generateId: true,
});
```

Then inside the `load` handler, fetch + cache + filter for the initial `endDate`:

```typescript
fetch('/metro_lines.geojson')
  .then((r) => r.json())
  .then((fc: GeoJSON.FeatureCollection) => {
    cachedGeoJSON.current = fc;
    applyDateFilter(endDateRef.current); // shared helper (see below)
  });
```

**4d — Add shared filter helper and `endDate` effect:**

```typescript
function applyDateFilter(date: Date) {
  if (!cachedGeoJSON.current || !map.current) return;
  const cutoff = dateToYYYYMM(date);
  const filtered: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: cachedGeoJSON.current.features.filter(
      (f) =>
        (f.properties?.valid_from ?? 0) <= cutoff &&
        (f.properties?.valid_to ?? 999999) >= cutoff,
    ),
  };
  // Clear stale hover state before swapping data
  if (hoveredIdRef.current !== undefined) {
    map.current.setFeatureState(
      { source: 'metro-lines', id: hoveredIdRef.current },
      { hover: false },
    );
    hoveredIdRef.current = undefined;
  }
  popupRef.current?.remove();
  (map.current.getSource('metro-lines') as maplibregl.GeoJSONSource).setData(
    filtered,
  );
}

// New effect — runs whenever endDate changes
useEffect(() => {
  if (!isStyleLoaded.current) return;
  applyDateFilter(endDate);
}, [endDate]);
```

Update existing `onMouseMove` / `onMouseLeave` handlers to use `hoveredIdRef.current` and `popupRef.current` instead of the now-removed local variables.

### Step 5 — Update `src/components/OutputArea.tsx`

Add `endDate: Date` to `OutputAreaProps` and thread it to `<Map lines={lines} endDate={endDate} />`.

### Step 6 — Update `src/App.tsx`

Pass `endDate` (already destructured from `userDashboardInputState`) to `<OutputArea ... endDate={endDate} />`.

### Step 7 — Update `src/components/OutputArea.test.tsx`

Add `endDate={new Date(2024, 0)}` to all existing `OutputArea` render calls so the prop change doesn't break tests. The Map mock should accept (and ignore) `endDate`.

---

## Files to Modify

| File                                 | Change                                                      |
| ------------------------------------ | ----------------------------------------------------------- |
| `scripts/route-history.json`         | **New** — temporal metadata + historical coordinates        |
| `scripts/fetch-metro-lines.mjs`      | Apply `valid_from`/`valid_to` from route-history.json       |
| `public/metro_lines.geojson`         | Regenerated — gains `valid_from`/`valid_to` on all features |
| `src/utils/lines.ts`                 | Add `dateToYYYYMM` utility                                  |
| `src/components/Map.tsx`             | Add `endDate` prop, GeoJSON caching, date-based filtering   |
| `src/components/OutputArea.tsx`      | Thread `endDate` prop                                       |
| `src/App.tsx`                        | Pass `endDate` to OutputArea                                |
| `src/components/OutputArea.test.tsx` | Add `endDate` to render calls                               |

---

## Key Challenge: Historical GeoJSON Coordinates

The hardest part is populating `coordinates` in `geometryEras` for:

- **E Line Phase 1** (2012-04 to 2016-04): 7th/Metro → Culver City only
- **L Line pre-Azusa** (before 2016-03): stops at Azusa Ave, not Azusa Downtown

Source: Mobility Database / transit.land feed `f-9q5-lacmta` (LA Metro GTFS archives). As a practical interim, these can be trimmed from the current GeoJSON by identifying the stop coordinates that mark the historical endpoint and cutting the MultiLineString there.

---

## Verification

1. Set date range ending before **April 2012**: E Line should not appear on the map at all
2. Set date range ending **2013-01**: E Line appears but only shows the Phase 1 route (7th/Metro → Culver City)
3. Set date range ending **2017-01**: E Line shows the full route to Santa Monica
4. Set date range ending before **October 2021**: K Line absent from map
5. Set date range ending **today**: All modern lines visible with full current geometries (backwards compatible)
