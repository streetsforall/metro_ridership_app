import type { SerializedDockview } from 'dockview-react';

/**
 * localStorage persistence for the dockable panel layout.
 *
 * Layout is deliberately device-local: it is NOT threaded through the URL
 * query params (that system is reserved for shareable dashboard state).
 */
export const LAYOUT_STORAGE_KEY = 'metro-panel-layout-v1';

export interface StoredLayout {
  version: 1;
  layout: SerializedDockview;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/**
 * Load and validate a saved layout. Returns null unless the payload parses,
 * has version 1, and every saved panel id is in the allowlist (a save from a
 * newer app version with unknown panels must not be restored).
 */
export const loadLayout = (
  allowedPanelIds: readonly string[],
): SerializedDockview | null => {
  try {
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    if (!raw) return null;

    const stored: unknown = JSON.parse(raw);
    if (!isRecord(stored) || stored.version !== 1 || !isRecord(stored.layout)) {
      return null;
    }

    const layout = stored.layout as unknown as SerializedDockview;
    if (!isRecord(layout.grid) || !isRecord(layout.panels)) return null;

    const panelIds = Object.keys(layout.panels);
    if (panelIds.length === 0) return null;
    if (!panelIds.every((id) => allowedPanelIds.includes(id))) return null;

    return layout;
  } catch {
    return null;
  }
};

export const saveLayout = (layout: SerializedDockview): void => {
  try {
    const stored: StoredLayout = { version: 1, layout };
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Persistence is best-effort; storage may be unavailable (private
    // browsing) or full.
  }
};

export const clearLayout = (): void => {
  try {
    localStorage.removeItem(LAYOUT_STORAGE_KEY);
  } catch {
    // Same best-effort contract as saveLayout.
  }
};
