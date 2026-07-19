# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Client-side React 19 + Vite app (Streets for All Data/Dev Team) for visualizing LA Metro bus/rail ridership data. All data ships as static JSON bundled into the build — there is no backend. The app may move to full-stack if data processing gets too heavy.

The dashboard is a **dockable panel layout** (dockview) on desktop and a stacked fallback on mobile — see [Panel layout](#panel-layout-srcdock).

## Commands

```bash
npm run dev          # Vite dev server at https://localhost:5173 (basicSsl in dev only)
npm run build        # tsc -b type-check, then vite build → dist/
npm run preview      # serve the production build
npm run test         # vitest run (all tests once)
npm run test:watch   # vitest watch mode
npm run lint         # eslint .
npm run fetch-lines  # python scripts/fetch_metro_lines.py
```

Run a single test file: `npx vitest run src/utils/calc.test.ts` (or pass a name filter with `-t`). Tests use Vitest + `@testing-library/react` in a jsdom environment with globals enabled (no per-file imports of `describe`/`it`/`expect` needed). `vitest.config.ts` is separate from `vite.config.ts` and points at `src/test/setup.ts`.

The dev server uses HTTPS via `@vitejs/plugin-basic-ssl` — expect a self-signed cert warning the first time.

CI (`.github/workflows/ci.yml`) runs `npm ci` → lint → test → build on Node 22 for every push/PR to `main`.

## Data flow (the core architecture)

The app transforms flat ridership records into per-line consolidated structures, then derives summary metrics. Understanding this pipeline is key:

1. **Lines are built from metadata** — `createLinesData()` in [src/hooks/useUserDashboardInput.ts](src/hooks/useUserDashboardInput.ts) reads `metro_line_metadata_current.json`, attaches display names/colors (via `getLineNames`/`getLineColor`), distance from `line_distances.json`, and sorts with `lineNameSortFunction` (lettered lines first, then numbered).
2. **Records are consolidated by line** — in [src/App.tsx](src/App.tsx) a single `useMemo` filters `ridership.json` to the selected date window and groups records by `line_name` into `ConsolidatedRidership`, while building Chart.js datasets (and the optional summed "Aggregate" series) in the same pass.
3. **Summary metrics are attached back to lines** — `updateLinesWithLineMetrics()` (in the hook) runs from a `useEffect` in App and computes average/change/start/end ridership and riders-per-mile per line using helpers in [src/utils/calc.ts](src/utils/calc.ts).
4. **Panels read the result from context, not props** — App assembles a `DashboardContextValue` and the panels pull it via `useDashboard()`. There is no prop threading from App to `LineSelector`/`SummaryData` any more.

Type definitions for these shapes live in [src/@types/metrics.types.ts](src/@types/metrics.types.ts) (`RidershipRecord`, `ConsolidatedRidership`) and [src/@types/lines.types.ts](src/@types/lines.types.ts) (`LineJson` from disk vs. enriched `Line`).

### Important conventions & quirks

- **`DayOfWeek` is the JSON column name**, not a label — `daysOfWeek` maps `Weekday/Saturday/Sunday` to `est_wkday_ridership`/`est_sat_ridership`/`est_sun_ridership`. Selecting a day-of-week literally swaps which field is read.
- **All dashboard state syncs to URL query params** (`start`, `end`, `day`, `lines`, `q`, `buses`, `trains`, `aggregate`) so views are shareable. [src/utils/queryParams.ts](src/utils/queryParams.ts) holds only the pure parse/format helpers; the read-on-mount initializers and the `history.replaceState` sync effect live in [useUserDashboardInput.ts](src/hooks/useUserDashboardInput.ts). When adding new dashboard state, wire it through both the init readers and the sync effect.
- **`JSON.stringify(...)` is intentionally used in several dependency arrays** (`lines`, `ridershipByLine`) because those objects get a new reference every render; don't "fix" these to raw object deps.
- **Month indexing is off by one on purpose** in App.tsx's date filter (`new Date(year, month)` treats month as 0-based while data is 1-based) — preserved from the original implementation. [src/utils/dataDateRange.ts](src/utils/dataDateRange.ts) is the other half of that contract: it derives the selectable year range from `ridership.json` and sets `dataDefaultEndDate` one month past the latest record to compensate. Changing either side alone silently drops the newest month.
- **Line colors**: official rail/BRT lines have hardcoded brand colors in `definedLines` ([src/utils/lines.ts](src/utils/lines.ts)); all other bus lines get a deterministic golden-angle HSL hue so the chart and map agree.

## Panel layout (`src/dock`)

The desktop dashboard is [dockview](https://dockview.dev): five draggable, resizable, closable panels. Design doc: [src/plans/dockable-panels.md](src/plans/dockable-panels.md).

- **Panel ids are frozen** in [src/dock/panelIds.ts](src/dock/panelIds.ts): `date-range`, `line-selector`, `chart`, `summary`, `map`. `PANEL_DEFS` in [src/dock/DockShell.tsx](src/dock/DockShell.tsx) owns each panel's title, default position, and default size. Panels are added in `PANEL_IDS` order, so a `position.referencePanel` must come earlier in that array.
- [DockShell.tsx](src/dock/DockShell.tsx) and [DockLayoutContext.tsx](src/dock/DockLayoutContext.tsx) are marked **FROZEN CONTRACT** — don't rename or reshape their exports.
- **Panel content is injected via `PanelContentContext`**, not closed-over props, so the dockview `components` map stays a stable module-level object.
- **Responsive fork**: `useIsDesktop()` matches Tailwind's `lg` (`min-width: 1024px`). Below it, DockShell is not rendered at all and App falls back to the pre-dock stacked `.pane` layout — every panel component must work in both. jsdom has no `matchMedia`, so tests get the desktop dock by default.
- **Layout persistence** ([src/utils/layoutStorage.ts](src/utils/layoutStorage.ts)): saved to localStorage under `metro-panel-layout-v2`, debounced 250 ms, validated against the panel-id allowlist on load. Deliberately device-local — **not** URL state, which is reserved for shareable dashboard state. A stored layout short-circuits `buildDefaultLayout` entirely, so **bump the storage key** whenever panel defaults change or existing browsers will never see them.
- **Edit mode**: `isEditMode` lives in App, is exposed through `DockLayoutContext`, and is toggled from the Header. Transient by design — not persisted and not in the URL. Its effect is in [src/dock/MetroTab.tsx](src/dock/MetroTab.tsx): a single-panel group renders a blank hover-reveal drag grip instead of a tab; edit mode (or a group holding 2+ panels) restores real titled tabs. Close buttons are never rendered — the Header's Panels dropdown is the one owner of panel visibility.

## State management

Two React contexts, no state library. React 19 idioms are used throughout: the `use()` hook and context-as-provider (`<DashboardContext value={...}>`, no `.Provider`).

- [src/context/DashboardContext.tsx](src/context/DashboardContext.tsx) — dashboard data/state. `useDashboard()` **throws** outside a provider.
- [src/dock/DockLayoutContext.tsx](src/dock/DockLayoutContext.tsx) — panel visibility, reset, edit mode. Deliberately has a **safe no-op default** so Header renders standalone. Trap worth knowing: a Header rendered outside the provider silently loses every toggle instead of failing loudly.

## Map

[src/components/Map.tsx](src/components/Map.tsx) uses MapLibre GL, loading route geometry from `/public/metro_lines.geojson`. It renders two layers: `lines-all` (dimmed) and `lines-selected` (brand colors, filtered by selected line IDs via `setFilter`). Base tiles come from MapTiler if `VITE_MAPTILER_KEY` is set, otherwise OpenFreeMap.

The map is a **module-scope singleton**, not a React ref: the instance and its host div are created once and never destroyed, so camera position, layers, and the tile cache survive dockview panel hide/show, drag-docking, and layout switches. React mounts only attach/detach the host div. Two consequences:

- A `ResizeObserver` keeps the canvas sized to the container — MapLibre's own `trackResize` watches the window, not dockview sashes.
- `__resetMapForTests()` exists so each test starts clean. **Production code must never call it.**

Hover popups are built by [src/utils/mapPopup.ts](src/utils/mapPopup.ts), with hover width driven by MapLibre `feature-state`.

## Data processing scripts (`scripts/`)

Python scripts maintain the JSON the app consumes. See [scripts/README.md](scripts/README.md), which covers the CPRA request process for obtaining new ridership data. Setup: `pip install -r scripts/requirements.txt`; tests: `pytest scripts/`.

- `update_ridership.py` — **the day-to-day entry point.** Scans `data/raw/`, adds only months not already present (append-only), and prepends an entry to `DATA_RELEASE_NOTES.md`. Flags: `--dry-run`, `--overwrite`, `--no-release-notes`.
- `process_ridership.py <path>` — merges one specific file into `src/data/ridership.json` and appends new lines to `metro_line_metadata_current.json`. Accepts Excel (`MM-YYYY-{Bus|Rail}.xlsx` or a date-range zip) or legacy `.csv.gz`. New data wins on conflicts; old data backfills.
- `convert_excel_ridership.py` — Excel → the legacy CSV schema, summing stop-level boardings (Ons) per line. Used by `process_ridership.py`.
- `fetch_metro_lines.py` (also `npm run fetch-lines`) — downloads GTFS feeds → `public/metro_lines.geojson`. Run before the script tests, which use that file as a fixture.
- `compute_line_distances.py` — `metro_lines.geojson` → `src/data/line_distances.json` (one-way miles; only outbound leg for rail).

Store raw data compressed in `data/raw/` — uncompressed `.csv` and `.xlsx` are gitignored; Excel goes in as a date-range `.zip`. `notebooks/` holds exploration notebooks (`metro_data_ridership_update.ipynb`).

## Styling

Tailwind CSS **v3.4** (config in `tailwind.config.ts`, compiled through `postcss.config.mjs`, `@tailwind` directives in [src/index.css](src/index.css)). Font is Overpass Mono (via `@fontsource-variable`). Panel controls and toggles use Radix primitives.

- Palette, applied inline rather than via theme tokens: `#0fada8` links/actions, `#033056` buttons and checked states, `#f8f6f1` panel cream, `#f3eee2` page background.
- **`.pane`** is now the **mobile fallback's** card container only. Inside the dock, the card look is painted by [src/dock/dockTheme.css](src/dock/dockTheme.css) on `.dv-groupview`, and `PanelChrome` supplies just padding and overflow.
- **`.summary-*` classes use CSS container queries** (`container-type: inline-size`, breakpoints at 60rem/44rem) because panels resize independently of the viewport. This is plain CSS on purpose — Tailwind 3.4 has no container variants.
- `dockTheme.css` leans on `:has()` and keys off the tab's `data-metro-panel` attribute (e.g. `.dv-groupview:has([data-metro-panel='summary'])`). It cannot key off panel content: `defaultRenderer="always"` portals content into `.dv-render-overlay`, outside the group element.
- `.recolor-white` is a filter for recoloring SVG icons on dark backgrounds.

## Config gotchas

- `vite.config.ts` sets an **empty `server: { proxy: {} }` on purpose.** With https and no proxy, Vite serves http2, and Node ≥22.21 crashes the dev server on every HTTP/1.1 request. Defining `proxy` routes Vite through `node:https` instead. Do not delete it.
- **Dead Next.js leftovers**: `next-env.d.ts` and `.next/` are unused. `postcss.config.mjs` is live — Tailwind depends on it.
- Formatting is Prettier (`.prettierrc.json`).
