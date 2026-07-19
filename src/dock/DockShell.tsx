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
  },
  summary: {
    component: 'summary',
    title: 'Summary',
    position: { referencePanel: 'chart', direction: 'below' },
    /* Height granted here is taken from the chart and map below it, so this
       stays the smallest share. The container queries in index.css keep the
       cards on one row across dock widths, which is what lets it stay small. */
    defaultHeightRatio: 0.16,
  },
  map: {
    component: 'map',
    title: 'Map',
    position: { referencePanel: 'summary', direction: 'below' },
    defaultHeightRatio: 0.3,
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
   */
  for (const id of PANEL_IDS) {
    const { defaultHeight, defaultHeightRatio, defaultWidthRatio } =
      PANEL_DEFS[id];
    const panel = api.getPanel(id);
    if (!panel) continue;

    if (defaultHeightRatio !== undefined && api.height > 0) {
      panel.api.setSize({ height: Math.round(api.height * defaultHeightRatio) });
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

  useEffect(() => {
    return () => {
      layoutListenerRef.current?.dispose();
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const onReady = (event: DockviewReadyEvent): void => {
    const { api } = event;

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
