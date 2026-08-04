import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { DockviewApi } from 'dockview-react';
import DockShell, { PANEL_IDS, type PanelId } from './DockShell';
import { LAYOUT_STORAGE_KEY, saveLayout } from '../utils/layoutStorage';

const makePanels = (): Record<PanelId, ReactNode> =>
  Object.fromEntries(
    PANEL_IDS.map((id) => [id, <div key={id} data-testid={`content-${id}`} />]),
  ) as Record<PanelId, ReactNode>;

const renderShell = async (): Promise<DockviewApi> => {
  let api: DockviewApi | undefined;
  render(
    <DockShell
      panels={makePanels()}
      onApiReady={(readyApi) => {
        api = readyApi;
      }}
    />,
  );
  await waitFor(() => expect(api).toBeDefined());
  return api!;
};

const panelIds = (api: DockviewApi): string[] =>
  api.panels.map((panel) => panel.id).sort();

beforeEach(() => {
  localStorage.clear();
});

describe('DockShell', () => {
  it('builds the default layout when no save exists', async () => {
    const api = await renderShell();
    expect(panelIds(api)).toEqual([...PANEL_IDS].sort());
  });

  it('renders the injected content of every panel', async () => {
    await renderShell();
    for (const id of PANEL_IDS) {
      expect(screen.getByTestId(`content-${id}`)).toBeTruthy();
    }
  });

  it('restores a valid saved layout instead of the default', async () => {
    // Produce a save that differs from the default (summary removed) with
    // dockview's own serializer, so the fixture matches the real format.
    const api = await renderShell();
    api.removePanel(api.getPanel('summary')!);
    const saved = api.toJSON();
    cleanup();
    saveLayout(saved);

    const restoredApi = await renderShell();
    expect(panelIds(restoredApi)).toEqual(
      ['date-range', 'line-selector', 'chart', 'map'].sort(),
    );
  });

  it('saves layout changes to storage (debounced)', async () => {
    const api = await renderShell();
    api.removePanel(api.getPanel('summary')!);

    await waitFor(
      () => {
        const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
        expect(raw).not.toBeNull();
        const stored = JSON.parse(raw!) as {
          version: number;
          layout: { panels: Record<string, unknown> };
        };
        expect(stored.version).toBe(1);
        expect(Object.keys(stored.layout.panels).sort()).toEqual(
          ['date-range', 'line-selector', 'chart', 'map'].sort(),
        );
      },
      { timeout: 2000 },
    );
  });

  it('falls back to the default layout when the save is corrupt JSON', async () => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, '{not valid json');
    const api = await renderShell();
    expect(panelIds(api)).toEqual([...PANEL_IDS].sort());
  });

  it('rebuilds and wipes storage when a validated save fails deserialisation', async () => {
    // Passes loadLayout's checks (version 1, known panel ids) but has a grid
    // dockview itself cannot deserialise.
    localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        layout: {
          grid: {
            root: { type: 'branch', data: 'not-a-node-list' },
            width: 800,
            height: 600,
            orientation: 'HORIZONTAL',
          },
          panels: { chart: { id: 'chart', contentComponent: 'chart' } },
        },
      }),
    );

    const api = await renderShell();

    expect(panelIds(api)).toEqual([...PANEL_IDS].sort());
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    expect(raw ?? '').not.toContain('not-a-node-list');
  });
});
