import { createContext, use, type ReactNode } from 'react';
/* From panelIds, not DockShell: DockShell renders MetroTab, which reads this
   context — importing from DockShell here would close that cycle. */
import { PANEL_IDS, type PanelId } from './panelIds';

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
  /**
   * Layout-editing mode. Panels normally show no header at all; edit mode
   * brings back full titled tabs so groups can be identified — and dragged,
   * since dockview's drag source is the tab — while rearranging. Deliberately
   * not persisted — coming back to the app stuck in edit mode is worse than
   * re-toggling it.
   */
  isEditMode: boolean;
  toggleEditMode: () => void;
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
  isEditMode: false,
  toggleEditMode: () => {},
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
