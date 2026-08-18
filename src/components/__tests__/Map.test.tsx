import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, fireEvent } from '@testing-library/react';
import maplibregl from 'maplibre-gl';
import Map from '../Map';
import { makeLine } from '../../test/builders';
import type { StopView } from '../../stops';

// Hoisted so the vi.mock factory below can close over them
const captured = vi.hoisted(() => ({
  loadCallback: undefined as (() => void) | undefined,
  setFilter: vi.fn(),
  addSource: vi.fn(),
  addLayer: vi.fn(),
  addControl: vi.fn(),
  mapRemove: vi.fn(),
  setPaintProperty: vi.fn(),
  /** The stop source's `setData`, so a test can read what was pushed at it. */
  setStopData: vi.fn(),
  /**
   * Layer ids in the order they were added, kept outside the mocks.
   *
   * `getLayer` has to answer for the whole life of one map instance, and a test that
   * clears `addLayer` to prove nothing was re-added would otherwise also erase the
   * record `getLayer` reads — making the component add the layer a second time and the
   * test pass for the wrong reason.
   */
  layerIds: [] as string[],
}));

vi.mock('maplibre-gl', () => ({
  default: {
    // Must use `function` (not arrow) so `new maplibregl.Map()` works as a constructor
    Map: vi.fn().mockImplementation(function () {
      return {
        addSource: captured.addSource,
        addLayer: captured.addLayer.mockImplementation((layer: { id: string }) => {
          captured.layerIds.push(layer.id);
        }),
        setFilter: captured.setFilter,
        addControl: captured.addControl,
        remove: captured.mapRemove,
        setPaintProperty: captured.setPaintProperty,
        // Only the stop source is asked for by id; anything else would be a bug in
        // the component, so it gets `undefined` rather than a silent stub.
        getSource: vi
          .fn()
          .mockImplementation((id: string) =>
            id === 'stop-ridership'
              ? { setData: captured.setStopData }
              : undefined,
          ),
        // Mirrors `addLayer`, so `ensureStopLayer`'s "already there?" guard is answered
        // by what the component actually added rather than by a fixed value.
        getLayer: vi
          .fn()
          .mockImplementation((id: string) =>
            captured.layerIds.includes(id) ? { id } : undefined,
          ),
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

beforeEach(() => {
  captured.loadCallback = undefined;
  captured.layerIds.length = 0;
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

  /**
   * The stop layer. What is asserted here is the seam between `src/stops/` and
   * MapLibre: the paint expressions read feature properties the module wrote, the
   * source is added exactly once and only once there is something to draw, and
   * everything after that is `setData` / `setFilter` / `setPaintProperty` on the live
   * map.
   */
  describe('stop markers', () => {
    const markers: StopView['markers'] = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-118.29, 34.06] },
          properties: {
            stop_key: 'bus:vermont-wilshire',
            line_id: 204,
            name: 'Vermont / Wilshire',
            radius: 11.5,
            color: '#abcdef',
            value: 1000,
          },
        },
      ],
    };

    const loaded = (props: Partial<React.ComponentProps<typeof Map>> = {}) => {
      const rendered = render(<Map lines={[]} {...props} />);
      act(() => {
        captured.loadCallback?.();
      });
      return rendered;
    };

    it('adds one stop-ridership source and one stops-selected layer', () => {
      loaded({ stopMarkers: markers });
      expect(captured.addSource).toHaveBeenCalledWith(
        'stop-ridership',
        expect.objectContaining({ type: 'geojson' }),
      );
      expect(captured.addLayer).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'stops-selected', type: 'circle' }),
      );
    });

    /**
     * The stop panel is off by default and most readers never open it, so a map that
     * was never asked for stops carries exactly the two route layers it always did.
     * `e2e/map.spec.ts` asserts that stack exactly, and this is what keeps it true.
     */
    it('adds no stop layer at all when there is nothing to draw', () => {
      loaded();
      expect(captured.addSource).not.toHaveBeenCalledWith(
        'stop-ridership',
        expect.anything(),
      );
      expect(captured.layerIds).toEqual(['lines-all', 'lines-selected']);
    });

    it('reads radius and colour off the feature rather than recomputing them', () => {
      loaded({ stopMarkers: markers });
      expect(captured.addLayer).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'stops-selected',
          paint: expect.objectContaining({
            'circle-radius': ['get', 'radius'],
            'circle-color': ['get', 'color'],
          }) as unknown,
        }),
      );
    });

    it('adds the stop layer above the selected-routes layer', () => {
      loaded({ stopMarkers: markers });
      expect(captured.layerIds).toEqual([
        'lines-all',
        'lines-selected',
        'stops-selected',
      ]);
    });

    it('filters the stop layer to the same selection as the route layer', () => {
      loaded({ stopMarkers: markers, lines: [makeLine({ id: 204, selected: true })] });
      expect(captured.setFilter).toHaveBeenCalledWith('stops-selected', [
        'in',
        ['get', 'line_id'],
        ['literal', [204]],
      ]);
    });

    it('pushes new markers at the existing source instead of re-adding it', () => {
      const { rerender } = loaded({ stopMarkers: markers });
      expect(captured.setStopData).toHaveBeenCalledWith(markers);

      const nextMarkers: StopView['markers'] = {
        type: 'FeatureCollection',
        features: [],
      };
      captured.addSource.mockClear();
      rerender(<Map lines={[]} stopMarkers={nextMarkers} />);

      expect(captured.setStopData).toHaveBeenCalledWith(nextMarkers);
      expect(captured.addSource).not.toHaveBeenCalled();
    });

    it('adds the layer when markers arrive after the style has loaded', () => {
      const { rerender } = loaded();
      expect(captured.addSource).not.toHaveBeenCalledWith(
        'stop-ridership',
        expect.anything(),
      );

      rerender(<Map lines={[]} stopMarkers={markers} />);

      expect(captured.addSource).toHaveBeenCalledWith(
        'stop-ridership',
        expect.objectContaining({ type: 'geojson' }),
      );
    });

    it('does not touch the source before the style has loaded', () => {
      render(<Map lines={[]} stopMarkers={markers} />);
      expect(captured.setStopData).not.toHaveBeenCalled();
    });

    it('marks the selected stop through paint properties, not a new layer', () => {
      const { rerender } = loaded({ stopMarkers: markers });
      captured.addLayer.mockClear();

      rerender(
        <Map
          lines={[]}
          stopMarkers={markers}
          selectedStopKeys={['bus:vermont-wilshire']}
        />,
      );

      expect(captured.setPaintProperty).toHaveBeenCalledWith(
        'stops-selected',
        'circle-stroke-width',
        expect.arrayContaining(['case']) as unknown,
      );
      expect(captured.addLayer).not.toHaveBeenCalled();
    });

    /**
     * One membership test, not one comparison per stop. The empty case needs no sentinel
     * either: an empty literal array matches nothing on its own, which is what the old
     * `?? ''` comparison had to fake.
     */
    it('rings every selected stop from one membership test', () => {
      const { rerender } = loaded({ stopMarkers: markers });
      captured.setPaintProperty.mockClear();

      rerender(
        <Map
          lines={[]}
          stopMarkers={markers}
          selectedStopKeys={['bus:vermont-wilshire', 'rail:union-station']}
        />,
      );

      const widthCall = captured.setPaintProperty.mock.calls.find(
        (call) => call[1] === 'circle-stroke-width',
      );
      expect(widthCall?.[2]).toEqual([
        'case',
        [
          'in',
          ['get', 'stop_key'],
          ['literal', ['bus:vermont-wilshire', 'rail:union-station']],
        ],
        3,
        expect.anything(),
      ]);
    });

    /**
     * **The map imports no palette.** The chart gives each selected stop its own hue;
     * the ring deliberately does not follow it there, so colour on the map keeps
     * answering one question — which line, in the fill (ADR-0014).
     *
     * This assertion is the guard: extending the palette onto the ring should fail a
     * test rather than slide in unread.
     */
    it('rings every selected stop in the one neutral colour, not a colour per stop', () => {
      const { rerender } = loaded({ stopMarkers: markers });
      captured.setPaintProperty.mockClear();

      rerender(
        <Map
          lines={[]}
          stopMarkers={markers}
          selectedStopKeys={['bus:vermont-wilshire', 'rail:union-station']}
        />,
      );

      const colorCall = captured.setPaintProperty.mock.calls.find(
        (call) => call[1] === 'circle-stroke-color',
      );
      // `case` with one neutral value, never `match` with a value per key.
      expect(colorCall?.[2]).toEqual([
        'case',
        expect.anything(),
        '#033056',
        ['get', 'color'],
      ]);
    });

    it('encodes the measure in fill and stroke rather than a second colour', () => {
      const { rerender } = loaded({ stopMarkers: markers });
      captured.setPaintProperty.mockClear();

      rerender(<Map lines={[]} stopMarkers={markers} stopMeasure="offs" />);

      const properties = captured.setPaintProperty.mock.calls.map(
        (call) => call[1] as string,
      );
      expect(properties).toContain('circle-opacity');
      expect(properties).toContain('circle-stroke-width');
      expect(properties).not.toContain('circle-color');
    });
  });
});

/**
 * The Stop Ridership control that floats over the map.
 *
 * It is not a MapLibre control and the test says so: the navigation cluster is added
 * through `addControl` and changes the camera, while this one is a React element that
 * writes dashboard state. Confusing the two is exactly what the styling avoids.
 */
describe('Map stop-ridership control', () => {
  const control = (): HTMLElement | null =>
    document.querySelector('[data-qa="map-stop-ridership"]');

  it('is not drawn when there is no state to toggle', () => {
    render(<Map lines={[]} />);
    expect(control()).toBeNull();
  });

  it('is drawn, named, and unticked when stops are off', () => {
    render(<Map lines={[]} showStops={false} onToggleShowStops={vi.fn()} />);

    expect(control()).toBeTruthy();
    expect(control()?.textContent).toContain('Stop Ridership');
    expect(
      control()?.querySelector('[role="checkbox"]')?.getAttribute('aria-checked'),
    ).toBe('false');
  });

  it('is ticked when stops are on', () => {
    render(<Map lines={[]} showStops onToggleShowStops={vi.fn()} />);
    expect(
      control()?.querySelector('[role="checkbox"]')?.getAttribute('aria-checked'),
    ).toBe('true');
  });

  /**
   * One state, two controls. The map's tick calls the same toggle the filter bar's
   * does, which is what makes unticking here also untick there and drop `stops=1`.
   */
  it('asks its owner to toggle rather than hiding circles locally', () => {
    const onToggleShowStops = vi.fn();
    render(<Map lines={[]} showStops onToggleShowStops={onToggleShowStops} />);

    fireEvent.click(
      control()?.querySelector('[role="checkbox"]') as HTMLElement,
    );
    expect(onToggleShowStops).toHaveBeenCalledOnce();
  });

  it('stays out of the map’s own control cluster', () => {
    captured.addControl.mockClear();
    render(<Map lines={[]} showStops onToggleShowStops={vi.fn()} />);

    const added = captured.addControl.mock.calls.map((call) => call[0]);
    expect(added).toHaveLength(1);
    expect(added[0]).toBeInstanceOf(maplibregl.NavigationControl);
  });
});
