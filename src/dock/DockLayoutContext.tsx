import { createContext, use, type ReactNode } from 'react';
import { PANEL_IDS, type PanelId } from './DockShell';

/**
 * FROZEN CONTRACT — see src/plans/dockable-panels.md. Wave-2 PRs import from
 * this file; do not change exported names or shapes.
 */

/* eslint-disable react-refresh/only-export-components -- contract module:
   exports the provider component alongside its hook */

export interface DockLayoutContextValue {
  /** Whether each panel is currently shown in the dock. */
  visibility: Record<PanelId, boolean>;
  togglePanel: (id: PanelId) => void;
  resetLayout: () => void;
}

const allVisible = Object.fromEntries(
  PANEL_IDS.map((id) => [id, true]),
) as Record<PanelId, boolean>;

/**
 * Safe no-op default (all panels visible) so consumers — e.g. the header
 * controls — render standalone before the dashboard provides the real
 * implementation.
 */
const defaultValue: DockLayoutContextValue = {
  visibility: allVisible,
  togglePanel: () => {},
  resetLayout: () => {},
};

const DockLayoutContext = createContext<DockLayoutContextValue>(defaultValue);

export function DockLayoutProvider({
  value,
  children,
}: {
  value: DockLayoutContextValue;
  children: ReactNode;
}) {
  return <DockLayoutContext value={value}>{children}</DockLayoutContext>;
}

export function useDockLayout(): DockLayoutContextValue {
  return use(DockLayoutContext);
}
