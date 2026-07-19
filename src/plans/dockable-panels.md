# Plan: Dockable Panels (VS Code-style panel management)

## Context

The dashboard's layout is currently a fixed Tailwind grid in `App.tsx`: a
date-range strip on top, the line selector on the left (~25%), and
chart/summary/map stacked on the right. The goal is VS Code-style panel
management — resizable, toggleable, drag-to-rearrange panels — using
[dockview-react](https://dockview.dev) v7 (MIT, zero-dep, React 19
compatible).

The work is split into waves:

- **Wave 1 (this PR, `feature/panels-dock-contract`)** lands the contract:
  `DockShell`, both contexts, layout storage, theme CSS, and this document.
  Nothing imports `DockShell` yet, so there is **no visual change**.
- **Wave 2** is three parallel PRs (B2/B3/B4, below) that build on wave 1
  **without modifying any wave-1 file**.

**Every file listed in this document under "Wave-1 deliverables" is FROZEN
once merged.** Wave-2 PRs import from them; they do not edit them. This
document is the single source of truth for the shared shapes — a wave-2 PR
should be buildable from this document alone.

## Wave-1 deliverables (frozen)

| File                            | Purpose                                              |
| ------------------------------- | ---------------------------------------------------- |
| `src/dock/DockShell.tsx`        | Dockview host; panel ids/defs, theme object          |
| `src/dock/DockLayoutContext.tsx`| Panel visibility/reset context (safe no-op default)  |
| `src/dock/dockTheme.css`        | `.dockview-theme-metro` variable overrides           |
| `src/context/DashboardContext.tsx` | Dashboard data/state context for panels           |
| `src/utils/layoutStorage.ts`    | localStorage persistence of the serialized layout    |
| `src/test/setup.ts`             | jsdom `ResizeObserver` stub (vitest `setupFiles`)    |

Dependency added: `dockview-react@^7.0.2`.

---

## Contract

### Panel ids (`src/dock/DockShell.tsx`)

```ts
export const PANEL_IDS = [
  'date-range',
  'line-selector',
  'chart',
  'summary',
  'map',
] as const;

export type PanelId = (typeof PANEL_IDS)[number];
```

Panel id, dockview component key, and `DockShellProps.panels` key are the
same string for every panel.

### Panel definitions

```ts
export interface PanelDef {
  component: PanelId; // key into the DockviewReact `components` map
  title: string;      // tab title
  position?: { referencePanel: PanelId; direction: 'below' | 'right' };
  defaultHeight?: number;     // px, applied after the default layout is built
  defaultWidthRatio?: number; // fraction of dock width, applied after build
}

export const PANEL_DEFS: Record<PanelId, PanelDef>;
```

The default layout mirrors today's dashboard and is built by adding panels in
`PANEL_IDS` order:

- `date-range` — first panel (root group), full-width top strip,
  `defaultHeight: 160`
- `line-selector` — `below` `date-range`, `defaultWidthRatio: 0.25`
- `chart` — `right` of `line-selector`
- `summary` — `below` `chart`
- `map` — `below` `summary`

Sizes are applied *after* all panels exist via `panel.api.setSize(...)`,
guarded by `api.width > 0` / `api.height > 0` (no-op in unmeasured
containers such as jsdom).

### DockShell

```ts
export interface DockShellProps {
  panels: Record<PanelId, ReactNode>;
  onApiReady?: (api: DockviewApi) => void;
}
export default function DockShell(props: DockShellProps): JSX.Element;
```

- `panels` injects the real content per panel id. Internally each dockview
  component is a thin FC that reads the node from a context provided by
  DockShell — dockview renders panel components through React portals inside
  the `DockviewReact` tree, so **any context provider wrapping `DockShell`
  (e.g. `DashboardProvider`) also reaches the panel content**.
- `onApiReady(api)` fires once, after restore-or-default-build, with the
  `DockviewApi`. Wave-2 wires maximize/visibility/reset through this api.
- Dockview options set by DockShell (not overridable):
  `defaultRenderer: 'always'` (hidden panels stay mounted — required so the
  map's WebGL instance survives tab switches), `dndStrategy: 'pointer'`,
  `disableFloatingGroups: true`.
- Theme object (also exported):

  ```ts
  export const METRO_DOCK_THEME: DockviewTheme = {
    name: 'metro',
    className: 'dockview-theme-metro',
    colorScheme: 'light',
    gap: 16, // matches the old grid's Tailwind gap-4
  };
  ```

- Persistence: on ready, `loadLayout(PANEL_IDS)`; if non-null, `api.fromJSON`
  in try/catch — on throw, `api.clear()`, `clearLayout()`, and rebuild the
  default layout. Saves via `api.onDidLayoutChange`, debounced 250 ms, as
  `saveLayout(api.toJSON())`.

### Layout storage (`src/utils/layoutStorage.ts`)

- Key: `metro-panel-layout-v2` (exported as `LAYOUT_STORAGE_KEY`) — bumped from
  `-v1` to force a one-time reset after the panel default sizes changed
- Payload: `{ version: 1, layout: SerializedDockview }`
- API:

  ```ts
  loadLayout(allowedPanelIds: readonly string[]): SerializedDockview | null;
  saveLayout(layout: SerializedDockview): void; // never throws
  clearLayout(): void;                          // never throws
  ```

- `loadLayout` returns `null` unless: JSON parses, `version === 1`,
  `layout.grid` and `layout.panels` are objects, there is at least one
  panel, and every panel id in `layout.panels` is in `allowedPanelIds`.
  Callers pass `PANEL_IDS` (the allowlist is a parameter to keep
  `utils/` free of imports from `dock/`).

Panel layout is deliberately **NOT** threaded through the URL query-param
system. CLAUDE.md's "all UI state syncs to URL params" rule applies to
shareable *dashboard* state (dates, lines, day-of-week…); panel layout is
device-local UI chrome and lives only in localStorage.

### DockLayoutContext (`src/dock/DockLayoutContext.tsx`)

```ts
export interface DockLayoutContextValue {
  visibility: Record<PanelId, boolean>;
  togglePanel: (id: PanelId) => void;
  resetLayout: () => void;
}
export function DockLayoutProvider(props: {
  value: DockLayoutContextValue;
  children: ReactNode;
}): JSX.Element;
export function useDockLayout(): DockLayoutContextValue;
```

The context default is a **safe no-op**: all panels visible,
`togglePanel`/`resetLayout` do nothing. This lets the header-controls PR
(B4) merge and render standalone before the dashboard PR (B2) provides the
real implementation.

### DashboardContext (`src/context/DashboardContext.tsx`)

```ts
export interface DashboardContextValue {
  userDashboardInputState: UserDashboardInputState; // from useUserDashboardInput
  lines: Line[];
  visibleLines: Line[];
  ridershipByLine: ConsolidatedRidership;
  chartDatasets: ChartDataset<'line', CustomChartData[]>[];
  monthList: string[];
  isLineSelectorExpanded: boolean;
  setIsLineSelectorExpanded: Dispatch<SetStateAction<boolean>>;
}
export function DashboardProvider(props: {
  value: DashboardContextValue;
  children: ReactNode;
}): JSX.Element;
export function useDashboard(): DashboardContextValue; // throws if unprovided
```

These fields are exactly what `App.tsx` currently computes and threads as
props to `DateRangeSelector`, `LineSelector`, and `OutputArea`.

### Theme (`src/dock/dockTheme.css`)

Scoped under `.dockview-theme-metro`; maps `--dv-*` variables to the app's
`.pane` look (`src/index.css`): group background `#f8f6f1`, border radii
`0.5rem`, transparent separators/sashes, drag-over
`rgba(120,113,108,0.15)`, small bold uppercase tabs (font inherits Overpass
Mono from the body). The dock root is forced transparent so the page
background `#f3eee2` shows through the 16 px gaps between panes.

Dockview v7 has **no** `--dv-background-color` variable — the root paints
`--dv-group-view-background-color`, so the transparency is a scoped
`.dv-dockview.dockview-theme-metro { background-color: transparent }` rule.

Panel **content** padding (the `.pane p-8` feel) is applied by wave-2 panel
wrappers, not by the theme.

### Test setup

`src/test/setup.ts` (wired via `test.setupFiles` in `vitest.config.ts`)
stubs `ResizeObserver`, which dockview requires and jsdom lacks. Wave-2
tests that render `DockShell` need nothing extra.

---

## Wave-2 split

Each PR branches off main after wave 1 merges. None of them may modify a
wave-1 file, `src/utils/queryParams.ts`, or `src/index.css`.

### B2 — Dashboard integration (`src/App.tsx`)

- Build `DashboardContextValue` in `App` from the existing hook/useMemo
  output and wrap the tree in `DashboardProvider`.
- Replace the Tailwind grid with `<DockShell panels={...} />` between
  `Header` and `Footer`. Give the dock a sized container (it fills its
  parent; e.g. a `grow` flex child with a min-height).
- Panel content: thin wrapper components (new files under
  `src/components/` or `src/dock/panels/`) that call `useDashboard()` and
  render the existing `DateRangeSelector`, `LineSelector`, chart, summary,
  and map components, adding `.pane`-style content padding (`p-8`).
- Capture the `DockviewApi` from `onApiReady` and implement the real
  `DockLayoutContextValue`:
  - `togglePanel(id)`: if present, `api.removePanel(api.getPanel(id)!)`;
    if absent, re-add via `PANEL_DEFS[id]` (component/title/position,
    falling back to sensible placement if the reference panel is also
    hidden). Track `visibility` from `api.onDidAddPanel` /
    `api.onDidRemovePanel`.
  - `resetLayout()`: `api.clear()`, `clearLayout()`, rebuild the default
    layout (re-add panels in `PANEL_IDS` order per `PANEL_DEFS`).
- Wrap everything in `DockLayoutProvider` so the header (B4) sees the real
  implementation.

### B3 — Map singleton (`src/components/Map.tsx` area)

- The MapLibre instance must be created once and survive panel drag/resize;
  `defaultRenderer: 'always'` keeps hidden panels mounted, so the map is
  never unmounted by tab switching.
- Handle container resizes (dockview panels resize freely): call
  `map.resize()` on panel size changes (a `ResizeObserver` on the map
  container is sufficient; no DockShell change needed).
- Any singleton/ref hardening lives in new files or `src/components/`
  (B3 may touch `src/components/`; it must not touch `src/dock/`).

### B4 — Header panel controls (`src/components/Header.tsx`)

- Add panel toggle buttons (one per `PANEL_IDS` entry, labels from
  `PANEL_DEFS[id].title`) and a "reset layout" action to the header using
  `useDockLayout()` — checked state from `visibility[id]`, clicks call
  `togglePanel(id)` / `resetLayout()`.
- Renders standalone before B2 lands thanks to the no-op context default:
  buttons show all-visible and clicks do nothing until the dashboard
  provides the real value.

## Verification (wave 1)

`npm run lint && npm run test && npm run build` — all green. DockShell
tests cover: default layout build, restoring a valid save, corrupt-JSON
fallback, wipe-and-rebuild when a validated save fails dockview
deserialisation, debounced saving, and panel content injection.
