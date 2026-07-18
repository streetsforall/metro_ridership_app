import { describe, it, expect, beforeEach } from 'vitest';
import type { SerializedDockview } from 'dockview-react';
import {
  LAYOUT_STORAGE_KEY,
  loadLayout,
  saveLayout,
  clearLayout,
} from './layoutStorage';

const ALLOWED_IDS = [
  'date-range',
  'line-selector',
  'chart',
  'summary',
  'map',
] as const;

/**
 * Minimal structurally-valid SerializedDockview; only the parts our
 * validators inspect need to be realistic.
 */
const makeLayout = (panelIds: readonly string[]): SerializedDockview =>
  ({
    grid: {
      root: { type: 'branch', data: [] },
      width: 800,
      height: 600,
      orientation: 'HORIZONTAL',
    },
    panels: Object.fromEntries(
      panelIds.map((id) => [id, { id, contentComponent: id, title: id }]),
    ),
  }) as unknown as SerializedDockview;

beforeEach(() => {
  localStorage.clear();
});

describe('saveLayout / loadLayout roundtrip', () => {
  it('returns the saved layout unchanged', () => {
    const layout = makeLayout(['chart', 'map']);
    saveLayout(layout);
    expect(loadLayout(ALLOWED_IDS)).toEqual(layout);
  });

  it('wraps the layout in a version-1 envelope', () => {
    saveLayout(makeLayout(['chart']));
    const raw = localStorage.getItem(LAYOUT_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect((JSON.parse(raw!) as { version: number }).version).toBe(1);
  });
});

describe('loadLayout validation', () => {
  it('returns null when nothing is stored', () => {
    expect(loadLayout(ALLOWED_IDS)).toBeNull();
  });

  it('returns null for corrupt JSON', () => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, '{not valid json');
    expect(loadLayout(ALLOWED_IDS)).toBeNull();
  });

  it('returns null for a non-object payload', () => {
    localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify('a string'));
    expect(loadLayout(ALLOWED_IDS)).toBeNull();
  });

  it('returns null for a wrong version', () => {
    localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({ version: 2, layout: makeLayout(['chart']) }),
    );
    expect(loadLayout(ALLOWED_IDS)).toBeNull();
  });

  it('returns null when a saved panel id is not in the allowlist', () => {
    localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        layout: makeLayout(['chart', 'foreign-panel']),
      }),
    );
    expect(loadLayout(ALLOWED_IDS)).toBeNull();
  });

  it('returns null for a layout with no panels', () => {
    localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({ version: 1, layout: makeLayout([]) }),
    );
    expect(loadLayout(ALLOWED_IDS)).toBeNull();
  });

  it('returns null when the layout is missing its grid', () => {
    localStorage.setItem(
      LAYOUT_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        layout: { panels: { chart: { id: 'chart' } } },
      }),
    );
    expect(loadLayout(ALLOWED_IDS)).toBeNull();
  });
});

describe('clearLayout', () => {
  it('removes the stored layout', () => {
    saveLayout(makeLayout(['chart']));
    clearLayout();
    expect(localStorage.getItem(LAYOUT_STORAGE_KEY)).toBeNull();
    expect(loadLayout(ALLOWED_IDS)).toBeNull();
  });
});
