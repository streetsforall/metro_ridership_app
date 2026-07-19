import {
  createContext,
  use,
  useEffect,
  useRef,
  type FunctionComponent,
  type ReactNode,
} from 'react';
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type DockviewTheme,
  type IDockviewPanelProps,
} from 'dockview-react';
import { clearLayout, loadLayout, saveLayout } from '../utils/layoutStorage';
import { useDockLayout } from './DockLayoutContext';
import MetroTab from './MetroTab';
import { PANEL_IDS, type PanelId } from './panelIds';
import 'dockview-react/dist/styles/dockview.css';
import './dockTheme.css';

/**
 * FROZEN CONTRACT — see src/plans/dockable-panels.md. Wave-2 PRs import from
 * this file; do not change exported names or shapes.
 */

/* eslint-disable react-refresh/only-export-components -- contract module:
   exports the DockShell component alongside its panel-id/theme constants */

/* Defined in panelIds.ts to keep the module graph acyclic; re-exported here so
   this file stays the single import site for the dock's shared shapes. */
export { PANEL_IDS, type PanelId };

export interface PanelDef {
  /** Key into the DockviewReact `components` map (same as the panel id). */
  component: PanelId;
  /** Tab title shown in the group header. */
  title: string;
  /**
   * Placement in the default layout, relative to an earlier panel. Panels are
   * added in PANEL_IDS order, so a reference must precede its dependants.
   */
  position?: {
    referencePanel: PanelId;
    direction: 'below' | 'right';
  };
  /** Default group height in px, applied after the default layout is built. */
  defaultHeight?: number;
  /**
   * Default group height as a fraction of the dock height. Preferred over
   * `defaultHeight` for the panels whose content should scale with the window;
   * a panel with neither takes whatever its column has left over.
   */
  defaultHeightRatio?: number;
  /** Default group width as a fraction of the dock width. */
  defaultWidthRatio?: number;
}

/**
 * Default layout mirrors the current dashboard: date-range as a full-width
 * top strip, line-selector on the left (~25%), and a chart/summary/map stack
 * to its right.
 */
export const PANEL_DEFS: Record<PanelId, PanelDef> = {
  'date-range': {
    component: 'date-range',
    title: 'Date Range',
    defaultHeight: 160,
  },
  'line-selector': {
    component: 'line-selector',
    title: 'Metro Lines',
    position: { referencePanel: 'date-range', direction: 'below' },
    defaultWidthRatio: 0.25,
  },
  chart: {
    component: 'chart',
    title: 'Ridership',
    position: { referencePanel: 'line-selector', direction: 'right' },
    /* Deliberately no default: the chart takes whatever the right column has
       left after summary and map (~50%), which is the largest share and the
       one that benefits most from extra height. */
    defaultHeightRatio: 0.35,
  },
  summary: {
    component: 'summary',
    title: 'Summary',
    position: { referencePanel: 'chart', direction: 'below' },
    /*
     * Fixed, not a ratio: unlike the chart and map, this panel's content does
     * not scale with the window. It is one row of stat cards whose height is
     * set by their padding and type, and the container queries in index.css
     * keep it to one row at every dock width — so a fraction of the dock only
     * ever over-allocates on a tall window, and since setSize is competitive
     * that surplus comes straight out of the chart and map. The panel is
     * mounted unpadded (see App.tsx), so this is close to the content height.
     * MAX_DEFAULT_HEIGHT_RATIO still clamps it on a short window.
     *
     * Sized to the content row, whose tallest item is the note beside the cards
     * (the explainer paragraph), not the cards themselves.
     *
     * Calibrated, not derived: the grid settles ~11px under whatever is asked
     * for here, so 163 lands a ~152px group around a ~148px row. Re-measure in
     * a browser if the note's or the cards' type changes; too low and the row
     * clips, since this panel scrolls.
     */
  },
  map: {
    component: 'map',
    title: 'Map',
    position: { referencePanel: 'summary', direction: 'below' },
    defaultHeightRatio: 0.15,
  },
};

/** gap matches the dashboard's Tailwind `gap-4` between panes. */
export const METRO_DOCK_THEME: DockviewTheme = {
  name: 'metro',
  className: 'dockview-theme-metro',
  colorScheme: 'light',
  gap: 16,
};

const SAVE_DEBOUNCE_MS = 250;

/**
 * Panel content is injected via context rather than closed-over props so the
 * `components` map can stay a stable module-level object. Dockview renders
 * panels through React portals inside the DockviewReact tree, so this context
 * (and any provider above DockShell) reaches the panel content.
 */
const PanelContentContext = createContext<Partial<Record<PanelId, ReactNode>>>(
  {},
);

const makePanelComponent = (
  id: PanelId,
): FunctionComponent<IDockviewPanelProps> => {
  const PanelContent: FunctionComponent<IDockviewPanelProps> = () => {
    const panels = use(PanelContentContext);
    return <>{panels[id] ?? null}</>;
  };
  PanelContent.displayName = `DockPanel(${id})`;
  return PanelContent;
};

const panelComponents: Record<
  string,
  FunctionComponent<IDockviewPanelProps>
> = Object.fromEntries(PANEL_IDS.map((id) => [id, makePanelComponent(id)]));

/**
 * Ceiling on any single panel's `defaultHeight`, as a fraction of the dock.
 *
 * `setSize` is competitive — height granted to one group is taken from its
 * column siblings — so a fixed pixel default starves them on a short window.
 * Measured at 1440x900 before this clamp: summary held its full 284px while the
 * chart fell to 124px and the map to 89px.
 *
 * `defaultHeightRatio` is not clamped: a fraction of the dock already scales
 * with the window, which is the exact failure this ceiling guards against.
 */
const MAX_DEFAULT_HEIGHT_RATIO = 0.35;

export const buildDefaultLayout = (api: DockviewApi): void => {
  for (const id of PANEL_IDS) {
    const def = PANEL_DEFS[id];
    api.addPanel({
      id,
      component: def.component,
      title: def.title,
      ...(def.position ? { position: def.position } : {}),
    });
  }

  /*
   * Sizes are applied after the whole grid exists: an initialHeight on the
   * first panel is meaningless while it is the only group. Guarded so the
   * calls no-op in unmeasured containers (jsdom).
   *
   * Twice and BOTTOM-UP, because `setSize` is competitive in both directions:
   * it takes from the column siblings when a group grows and hands space back
   * to them when it shrinks. In PANEL_IDS order the summary was sized and then
   * immediately re-inflated by the map's own setSize below it, so its height
   * was really being decided by the map's redistribution — which is what left a
   * dead band around its one row of stat cards. Applying the column bottom-up
   * puts the summary last, so it settles at its own target and the surplus
   * falls to the chart, the one panel with no default and the one that should
   * absorb it. The second pass lets the widths and the top strip settle too.
   */
  const sizingOrder = [...PANEL_IDS].reverse();

  for (let pass = 0; pass < 2; pass++) {
    for (const id of sizingOrder) {
      const { defaultHeight, defaultHeightRatio, defaultWidthRatio } =
        PANEL_DEFS[id];
      const panel = api.getPanel(id);
      if (!panel) continue;

      if (defaultHeightRatio !== undefined && api.height > 0) {
        panel.api.setSize({
          height: Math.round(api.height * defaultHeightRatio),
        });
      } else if (defaultHeight !== undefined && api.height > 0) {
        panel.api.setSize({
          height: Math.min(
            defaultHeight,
            Math.round(api.height * MAX_DEFAULT_HEIGHT_RATIO),
          ),
        });
      }
      if (defaultWidthRatio !== undefined && api.width > 0) {
        panel.api.setSize({ width: Math.round(api.width * defaultWidthRatio) });
      }
    }
  }
};

export interface DockShellProps {
  /**
   * Content for each panel. Injected by the dashboard so wave-2 can supply
   * real components without editing this file.
   */
  panels: Record<PanelId, ReactNode>;
  /** Called once dockview is initialised (after restore or default build). */
  onApiReady?: (api: DockviewApi) => void;
}

function DockShell({ panels, onApiReady }: DockShellProps) {
  const saveTimerRef = useRef<number | null>(null);
  const layoutListenerRef = useRef<{ dispose(): void } | null>(null);
  const apiRef = useRef<DockviewApi | null>(null);
  const { isEditMode } = useDockLayout();

  useEffect(() => {
    return () => {
      layoutListenerRef.current?.dispose();
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  /*
   * Toggling edit mode grows/collapses every tab strip, but purely in CSS (the
   * `:has([data-metro-blank-tab])` rule in dockTheme.css), so dockview never
   * learns its content boxes moved. `defaultRenderer="always"` panels are
   * absolutely positioned overlays whose rects are only recomputed on a layout
   * event, so they keep covering the strip they no longer share space with —
   * and swallow every pointerdown meant for a tab, leaving panels undraggable
   * in the one mode that exists for dragging them.
   *
   * `force` is required: the dock's outer dimensions have not changed, so the
   * unforced call would early-out as a no-op.
   */
  useEffect(() => {
    const api = apiRef.current;
    if (!api || api.width === 0 || api.height === 0) return;
    api.layout(api.width, api.height, true);
  }, [isEditMode]);

  const onReady = (event: DockviewReadyEvent): void => {
    const { api } = event;
    apiRef.current = api;

    const saved = loadLayout(PANEL_IDS);
    let restored = false;

    if (saved) {
      try {
        api.fromJSON(saved);
        restored = true;
      } catch {
        // A payload can pass our validation yet still fail dockview's own
        // deserialisation; drop it and rebuild from scratch.
        api.clear();
        clearLayout();
      }
    }

    /*
     * Registered before the build so the build's own layout events are caught:
     * with the listener added afterwards, a freshly built default layout was
     * never persisted until the user happened to drag a sash.
     */
    layoutListenerRef.current = api.onDidLayoutChange(() => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        saveLayout(api.toJSON());
      }, SAVE_DEBOUNCE_MS);
    });

    try {
      if (!restored) {
        buildDefaultLayout(api);
      }
    } catch (error) {
      // Leave the dock empty rather than half-built, and don't persist the
      // wreckage. Surfaced, not swallowed: a dock missing panels should be
      // debuggable.
      api.clear();
      clearLayout();
      console.error('Failed to build the default panel layout', error);
    } finally {
      /*
       * Always hand the api over — this is what gives the header its panel
       * toggles and reset, so it must not be hostage to the build succeeding,
       * or one layout error disables the only UI that can recover from it.
       *
       * It stays *after* the build on purpose: the handoff sets React state,
       * and the resulting re-render re-lays out the dock, discarding the
       * setSize calls the build just made.
       */
      onApiReady?.(api);
    }
  };

  return (
    <PanelContentContext value={panels}>
      <DockviewReact
        components={panelComponents}
        defaultTabComponent={MetroTab}
        onReady={onReady}
        theme={METRO_DOCK_THEME}
        defaultRenderer="always"
        dndStrategy="pointer"
        disableFloatingGroups
      />
    </PanelContentContext>
  );
}

export default DockShell;
