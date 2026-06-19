import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import maplibregl from 'maplibre-gl';
import Map from './Map';
import type { Line } from '../@types/lines.types';

// Hoisted so the vi.mock factory below can close over them
const captured = vi.hoisted(() => ({
  loadCallback: undefined as (() => void) | undefined,
  setFilter: vi.fn(),
  addSource: vi.fn(),
  addLayer: vi.fn(),
  addControl: vi.fn(),
  mapRemove: vi.fn(),
}));

vi.mock('maplibre-gl', () => ({
  default: {
    // Must use `function` (not arrow) so `new maplibregl.Map()` works as a constructor
    Map: vi.fn().mockImplementation(function () {
      return {
        addSource: captured.addSource,
        addLayer: captured.addLayer,
        setFilter: captured.setFilter,
        addControl: captured.addControl,
        remove: captured.mapRemove,
        setFeatureState: vi.fn(),
        getCanvas: vi
          .fn()
          .mockReturnValue({ style: {} as CSSStyleDeclaration }),
        on: vi.fn().mockImplementation(function (event: string, arg2: unknown) {
          if (event === 'load' && typeof arg2 === 'function') {
            captured.loadCallback = arg2 as () => void;
          }
        }),
      };
    }),
    NavigationControl: vi.fn().mockImplementation(function () {}),
  },
  Popup: vi.fn().mockImplementation(function () {
    return {
      setLngLat: vi.fn().mockReturnThis(),
      setHTML: vi.fn().mockReturnThis(),
      addTo: vi.fn().mockReturnThis(),
      remove: vi.fn(),
    };
  }),
}));

const makeLine = (overrides: Partial<Line> = {}): Line => ({
  id: 801,
  name: 'A Line',
  mode: 'Rail',
  provider: 'DO',
  selected: false,
  visible: true,
  ...overrides,
});

beforeEach(() => {
  captured.loadCallback = undefined;
  vi.clearAllMocks();
});

describe('Map', () => {
  it('renders the map container div', () => {
    const { container } = render(<Map lines={[]} />);
    expect(container.querySelector('#lineMap')).toBeTruthy();
  });

  it('initialises with the positron style when no MapTiler key is set', () => {
    render(<Map lines={[]} />);
    expect(vi.mocked(maplibregl.Map)).toHaveBeenCalledWith(
      expect.objectContaining({
        style: 'https://tiles.openfreemap.org/styles/positron',
      }),
    );
  });

  it('removes the map instance on unmount', () => {
    const { unmount } = render(<Map lines={[]} />);
    unmount();
    expect(captured.mapRemove).toHaveBeenCalledOnce();
  });

  describe('on map load', () => {
    it('adds the metro-lines GeoJSON source', () => {
      render(<Map lines={[]} />);
      act(() => {
        captured.loadCallback?.();
      });
      expect(captured.addSource).toHaveBeenCalledWith(
        'metro-lines',
        expect.objectContaining({ type: 'geojson' }),
      );
    });

    it('adds the dimmed "lines-all" and highlighted "lines-selected" layers', () => {
      render(<Map lines={[]} />);
      act(() => {
        captured.loadCallback?.();
      });
      expect(captured.addLayer).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'lines-all' }),
      );
      expect(captured.addLayer).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'lines-selected' }),
      );
    });

    it('renders the lines-all layer with 0.15 opacity', () => {
      render(<Map lines={[]} />);
      act(() => {
        captured.loadCallback?.();
      });
      expect(captured.addLayer).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'lines-all',
          paint: expect.objectContaining({ 'line-opacity': 0.15 }) as unknown,
        }),
      );
    });

    it('filters to only the IDs of selected lines', () => {
      const lines = [
        makeLine({ id: 801, selected: true }),
        makeLine({ id: 802, selected: false }),
      ];
      render(<Map lines={lines} />);
      act(() => {
        captured.loadCallback?.();
      });
      expect(captured.setFilter).toHaveBeenCalledWith('lines-selected', [
        'in',
        ['get', 'line_id'],
        ['literal', [801]],
      ]);
    });

    it('passes an empty array to the filter when no lines are selected', () => {
      render(<Map lines={[makeLine({ selected: false })]} />);
      act(() => {
        captured.loadCallback?.();
      });
      expect(captured.setFilter).toHaveBeenCalledWith('lines-selected', [
        'in',
        ['get', 'line_id'],
        ['literal', []],
      ]);
    });
  });

  describe('when lines selection changes', () => {
    it('updates the filter to reflect the new selection', () => {
      const { rerender } = render(
        <Map lines={[makeLine({ id: 801, selected: false })]} />,
      );
      act(() => {
        captured.loadCallback?.();
      });
      vi.clearAllMocks();

      rerender(<Map lines={[makeLine({ id: 801, selected: true })]} />);

      expect(captured.setFilter).toHaveBeenCalledWith('lines-selected', [
        'in',
        ['get', 'line_id'],
        ['literal', [801]],
      ]);
    });

    it('does not call setFilter before the map style is loaded', () => {
      const { rerender } = render(
        <Map lines={[makeLine({ id: 801, selected: false })]} />,
      );
      // intentionally skip triggering loadCallback
      vi.clearAllMocks();

      rerender(<Map lines={[makeLine({ id: 801, selected: true })]} />);

      expect(captured.setFilter).not.toHaveBeenCalled();
    });
  });
});
