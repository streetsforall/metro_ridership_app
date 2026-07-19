/**
 * Panel identity, split out from DockShell to keep the module graph acyclic.
 *
 * DockShell renders MetroTab, MetroTab reads DockLayoutContext, and the context
 * needs the panel ids — importing them from DockShell closed a cycle that left
 * PANEL_IDS undefined at module-eval time. DockShell re-exports both names, so
 * `import { PANEL_IDS } from './DockShell'` keeps working everywhere.
 */
export const PANEL_IDS = [
  'date-range',
  'line-selector',
  'chart',
  'summary',
  'map',
] as const;

export type PanelId = (typeof PANEL_IDS)[number];
