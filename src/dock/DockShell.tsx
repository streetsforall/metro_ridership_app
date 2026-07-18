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
import 'dockview-react/dist/styles/dockview.css';
import './dockTheme.css';

/**
 * FROZEN CONTRACT — see src/plans/dockable-panels.md. Wave-2 PRs import from
 * this file; do not change exported names or shapes.
 */

/* eslint-disable react-refresh/only-export-components -- contract module:
   exports the DockShell component alongside its panel-id/theme constants */

export const PANEL_IDS = [
  'date-range',
  'line-selector',
  'chart',
  'summary',
  'map',
] as const;

export type PanelId = (typeof PANEL_IDS)[number];

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
  },
  summary: {
    component: 'summary',
    title: 'Summary',
    position: { referencePanel: 'chart', direction: 'below' },
  },
  map: {
    component: 'map',
    title: 'Map',
    position: { referencePanel: 'summary', direction: 'below' },
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

const buildDefaultLayout = (api: DockviewApi): void => {
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
    const { defaultHeight, defaultWidthRatio } = PANEL_DEFS[id];
    const panel = api.getPanel(id);
    if (!panel) continue;

    if (defaultHeight !== undefined && api.height > 0) {
      panel.api.setSize({ height: defaultHeight });
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

    if (!restored) {
      buildDefaultLayout(api);
    }

    layoutListenerRef.current = api.onDidLayoutChange(() => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        saveLayout(api.toJSON());
      }, SAVE_DEBOUNCE_MS);
    });

    onApiReady?.(api);
  };

  return (
    <PanelContentContext value={panels}>
      <DockviewReact
        components={panelComponents}
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
