import { useEffect, useRef } from 'react';
import * as Checkbox from '@radix-ui/react-checkbox';
import maplibregl, { Popup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { LineReadout } from '../ridership';
import type { StopReadout, StopView } from '../stops';
import type { StopMeasure } from '../@types/stops.types';
import { buildPopupHTML, buildStopPopupHTML } from '../utils/mapPopup';
import checkIcon from '../assets/check.svg';
import './Map.css';

const mapTilerKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;

const STYLE_URL = mapTilerKey
  ? `https://api.maptiler.com/maps/ab4289f4-b600-4f7a-bbe3-c0666c48446d/style.json?key=${mapTilerKey}`
  : 'https://tiles.openfreemap.org/styles/positron';

/**
 * The stop layer's starting data, and what it falls back to when the panel is off.
 *
 * A module constant rather than an inline object literal so the effect that pushes it
 * through `setData` is not handed a new reference every render.
 */
const NO_MARKERS: StopView['markers'] = {
  type: 'FeatureCollection',
  features: [],
};

/**
 * How each Stop Measure is drawn — **fill and stroke, never a second colour ramp**.
 *
 * Colour already means *which line*, shared with the chart, the legend and the line
 * popup. Giving it a second meaning would make a stop's hue answer two questions at
 * once, so the measure gets the channels colour is not using: Boardings are a solid
 * disc, Alightings a ring, and Both a filled disc with a ring around it. Radius stays
 * the magnitude in all three, because `buildStopView` already computed it against the
 * measure the reader picked.
 */
const MEASURE_PAINT: Record<
  StopMeasure,
  { opacity: number; strokeWidth: number }
> = {
  ons: { opacity: 0.75, strokeWidth: 0 },
  offs: { opacity: 0.12, strokeWidth: 2 },
  both: { opacity: 0.55, strokeWidth: 1 },
};

/**
 * A selected stop's ring. Neutral, so it reads as selection rather than as a line — and
 * one colour for every selected stop, however many are selected. The chart above the
 * table gives each stop its own hue; the map deliberately does not follow it there, so
 * colour on the map keeps answering one question (ADR-0014).
 */
const SELECTED_STROKE_COLOR = '#033056';
const SELECTED_STROKE_WIDTH = 3;

/** Shared defaults, so each prop's identity is stable between renders. */
const NO_READOUTS: readonly StopReadout[] = [];
const NO_SELECTED_STOPS: readonly string[] = [];

/** The selected-lines filter, shared by the route layer and the stop layer. */
const selectedFilter = (
  ids: number[],
): maplibregl.FilterSpecification => [
  'in',
  ['get', 'line_id'],
  ['literal', ids],
];

/**
 * Add the stop source and its circle layer — **once, and only once there are stops to
 * draw.** Returns whether the layer is now on the map.
 *
 * Once added it is never re-added: `map.getLayer` is the guard, so every later change
 * of markers, measure or selection is a `setData` / `setFilter` / `setPaintProperty`
 * on the live layer, never a teardown and rebuild.
 *
 * Creating it on first use rather than inside `load` is deliberate. The stop panel is
 * off by default and most readers never open it, so a map that was never asked for
 * stops carries exactly the two route layers it always did — which is also what keeps
 * `e2e/map.spec.ts`'s layer-stack assertion true without that spec being edited.
 *
 * Everything the layer paints per feature is read straight off the feature. `radius` is
 * the per-mode sqrt-normalised scale `buildStopView` computed where the domain is
 * known, and `color` is `getLineColor` — the same hue the chart and the popups use.
 * Recomputing either here is how the map and the table start disagreeing about what a
 * circle means.
 */
function ensureStopLayer(
  map: maplibregl.Map,
  markers: StopView['markers'],
): boolean {
  if (map.getLayer('stops-selected')) return true;
  if (markers.features.length === 0) return false;

  map.addSource('stop-ridership', { type: 'geojson', data: markers });

  // No `beforeId`: appended last, which puts the circles above both route layers so a
  // stop is never hidden under the line it belongs to.
  map.addLayer({
    id: 'stops-selected',
    type: 'circle',
    source: 'stop-ridership',
    filter: selectedFilter([]),
    paint: {
      'circle-radius': ['get', 'radius'],
      'circle-color': ['get', 'color'],
      'circle-opacity': MEASURE_PAINT.ons.opacity,
      'circle-stroke-color': ['get', 'color'],
      'circle-stroke-width': MEASURE_PAINT.ons.strokeWidth,
    },
  });

  return true;
}

/** Push a new marker set at the existing source. */
function applyStopMarkers(
  map: maplibregl.Map,
  markers: StopView['markers'],
): void {
  map.getSource<maplibregl.GeoJSONSource>('stop-ridership')?.setData(markers);
}

/** Fill, ring and the selected stops' marks — everything the measure and selection drive. */
function applyStopPaint(
  map: maplibregl.Map,
  measure: StopMeasure,
  selectedStopKeys: readonly string[],
): void {
  const { opacity, strokeWidth } = MEASURE_PAINT[measure];
  /*
   * Every selected stop rings, in the one neutral colour. **No palette reaches the map.**
   * The chart colours a series per stop, but colour here already answers a different
   * question — which line, in the fill — and a second meaning in the ring beside it would
   * compete with the line hues rather than clarify them (ADR-0014).
   *
   * An empty selection needs no sentinel: `['in', …, ['literal', []]]` matches nothing on
   * its own, which is what the old `?? ''` comparison had to fake.
   */
  const isSelected = [
    'in',
    ['get', 'stop_key'],
    ['literal', [...selectedStopKeys]],
  ];

  map.setPaintProperty('stops-selected', 'circle-opacity', opacity);
  map.setPaintProperty('stops-selected', 'circle-stroke-width', [
    'case',
    isSelected,
    SELECTED_STROKE_WIDTH,
    strokeWidth,
  ]);
  map.setPaintProperty('stops-selected', 'circle-stroke-color', [
    'case',
    isSelected,
    SELECTED_STROKE_COLOR,
    ['get', 'color'],
  ]);
}

interface StopLayerState {
  markers: StopView['markers'];
  selectedLineIds: number[];
  measure: StopMeasure;
  selectedStopKeys: readonly string[];
}

/**
 * Bring the stop layer in line with the current state — the one place that happens.
 *
 * Called from `load` and from the effect below, so a map that finishes its style after
 * the panel already has data paints the current state rather than the first render's.
 * A no-op until there is something to draw.
 */
function syncStopLayer(
  map: maplibregl.Map,
  { markers, selectedLineIds, measure, selectedStopKeys }: StopLayerState,
): void {
  if (!ensureStopLayer(map, markers)) return;
  applyStopMarkers(map, markers);
  map.setFilter('stops-selected', selectedFilter(selectedLineIds));
  applyStopPaint(map, measure, selectedStopKeys);
}

interface MapProps {
  lines: LineReadout[];
  /**
   * Markers from `buildStopView`, ready for `setData`. Radius and colour are feature
   * properties the module computed; **nothing here recomputes either.**
   */
  stopMarkers?: StopView['markers'];
  /** The Stop Readouts those markers were built from, for the hover popup. */
  stopReadouts?: readonly StopReadout[];
  stopMeasure?: StopMeasure;
  /** The Stop Selection — every stop the panel is drawing, each marked with a ring. */
  selectedStopKeys?: readonly string[];
  /**
   * A click on a circle toggles that stop, exactly as its table row does. One callback
   * rather than a select/clear pair, because whether the click adds or removes is a
   * question about the selection, and the selection is the hook's to answer.
   */
  onToggleStop?: (stopKey: string) => void;
  /**
   * Whether Stop Ridership is on — **the same state the filter bar's tick sets**, not a
   * map-local one. Circles come and go with it, the stop panel opens and closes with it,
   * and `stops=1` enters and leaves the URL with it.
   */
  showStops?: boolean;
  /**
   * Toggle that state from here. Absent in tests and in any caller that has no state to
   * offer, and the control is not drawn without it — a checkbox that cannot change
   * anything is worse than no checkbox.
   */
  onToggleShowStops?: () => void;
}


export default function Map({
  lines,
  stopMarkers = NO_MARKERS,
  stopReadouts = NO_READOUTS,
  stopMeasure = 'ons',
  selectedStopKeys = NO_SELECTED_STOPS,
  onToggleStop,
  showStops = false,
  onToggleShowStops,
}: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const isStyleLoaded = useRef(false);
  const linesRef = useRef<LineReadout[]>(lines);
  /**
   * Read by the layer's event handlers, which are registered once inside `load` and
   * therefore close over the first render's props. Refs are how the existing line
   * hover already stays current; the stop handlers follow it rather than inventing a
   * second pattern.
   */
  const stopReadoutsRef = useRef<readonly StopReadout[]>(stopReadouts);
  const onToggleStopRef = useRef(onToggleStop);
  onToggleStopRef.current = onToggleStop;
  /**
   * The stop props as of this render, for `load` to apply.
   *
   * `load` fires whenever MapLibre finishes its style, which can be after several
   * renders — reading the props it closed over would paint the panel's first state
   * rather than its current one.
   */
  const stopMarkersRef = useRef(stopMarkers);
  stopMarkersRef.current = stopMarkers;
  const stopMeasureRef = useRef(stopMeasure);
  stopMeasureRef.current = stopMeasure;
  const selectedStopKeysRef = useRef(selectedStopKeys);
  selectedStopKeysRef.current = selectedStopKeys;

  // Initialize map once
  useEffect(() => {
    if (map.current != null) return;

    map.current = new maplibregl.Map({
      attributionControl: { compact: true },
      container: mapContainer.current!,
      style: STYLE_URL,
      center: [-118.24, 34.05],
      zoom: 10,
      minZoom: 8,
      maxZoom: 16,
    });

    // Test seam for e2e/map.spec.ts: MapLibre renders into a WebGL canvas, so a test has no
    // way to wait on it or inspect it from the DOM. Publishing the instance lets the spec
    // await the `idle` event and call queryRenderedFeatures(). Inert in the app itself.
    window.__metroMap = map.current;

    map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.current.on('load', () => {
      isStyleLoaded.current = true;

      map.current!.addSource('metro-lines', {
        type: 'geojson',
        data: '/metro_lines.geojson',
        generateId: true,
      });

      // All lines dimmed — rendered below the selected layer
      map.current!.addLayer({
        id: 'lines-all',
        type: 'line',
        source: 'metro-lines',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#999',
          'line-opacity': 0.15,
          'line-width': 2,
        },
      });

      // Selected lines rendered on top with brand colors
      map.current!.addLayer({
        id: 'lines-selected',
        type: 'line',
        source: 'metro-lines',
        filter: ['in', ['get', 'line_id'], ['literal', []]],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-opacity': 1,
          'line-width': [
            'case',
            ['boolean', ['feature-state', 'hover'], false],
            5,
            3,
          ],
        },
      });

      // Hover popup
      const popup = new Popup({
        closeButton: false,
        closeOnClick: false,
      });

      let hoveredId: string | number | undefined;

      const onMouseMove = (
        e: maplibregl.MapMouseEvent & {
          features?: maplibregl.MapGeoJSONFeature[];
        },
      ) => {
        if (!e.features?.length) return;

        map.current!.getCanvas().style.cursor = 'pointer';

        if (hoveredId !== undefined) {
          map.current!.setFeatureState(
            { source: 'metro-lines', id: hoveredId },
            { hover: false },
          );
        }

        hoveredId = e.features[0].id;
        map.current!.setFeatureState(
          { source: 'metro-lines', id: hoveredId },
          { hover: true },
        );

        const lineId = e.features[0].properties.line_id as number;
        const lineData = linesRef.current.find((l) => l.id === lineId);
        popup
          .setLngLat(e.lngLat)
          .setHTML(buildPopupHTML(e.features[0].properties.name as string, lineData))
          .addTo(map.current!);
      };

      const onMouseLeave = () => {
        map.current!.getCanvas().style.cursor = '';
        popup.remove();

        if (hoveredId !== undefined) {
          map.current!.setFeatureState(
            { source: 'metro-lines', id: hoveredId },
            { hover: false },
          );
        }
        hoveredId = undefined;
      };

      map.current!.on('mousemove', 'lines-selected', onMouseMove);
      map.current!.on('mouseleave', 'lines-selected', onMouseLeave);

      /**
       * Stop hover and click, on the **same** popup instance as the line hover.
       *
       * Registered after the line handlers on purpose. A circle sits on top of the
       * route it belongs to, so both layers' `mousemove` fire for one pointer position
       * and the last `setHTML` wins — which should be the thing actually under the
       * cursor.
       *
       * Registered here even though `stops-selected` does not exist yet: a
       * layer-scoped listener is a delegated one, and MapLibre resolves the layer at
       * event time. Registering once, in `load`, is what keeps the handler count fixed
       * however often the panel is opened and closed.
       */
      const onStopMouseMove = (
        e: maplibregl.MapMouseEvent & {
          features?: maplibregl.MapGeoJSONFeature[];
        },
      ) => {
        const feature = e.features?.[0];
        if (!feature) return;

        map.current!.getCanvas().style.cursor = 'pointer';

        const stopKey = feature.properties.stop_key as string;
        const lineId = feature.properties.line_id as number;
        const readout = stopReadoutsRef.current.find(
          (candidate) =>
            candidate.key === stopKey && candidate.line_name === lineId,
        );
        if (!readout) return;

        const lineName =
          linesRef.current.find((line) => line.id === lineId)?.name ??
          String(lineId);
        popup
          .setLngLat(e.lngLat)
          .setHTML(buildStopPopupHTML(readout, lineName))
          .addTo(map.current!);
      };

      map.current!.on('mousemove', 'stops-selected', onStopMouseMove);
      map.current!.on('mouseleave', 'stops-selected', onMouseLeave);
      /**
       * A circle is the same toggle its table row is: clicking a selected stop deselects
       * it. Called through `onToggleStopRef` rather than a closed-over prop — this
       * handler is registered once, in `load`, so the prop it captured is the first
       * render's, and calling that stale callback would leave the map wired to a
       * selection nobody has any more.
       *
       * The handler no longer asks *whether* the stop is selected. It says "toggle this
       * one" and the hook answers from the current selection, so there is one membership
       * rule instead of a copy here that could disagree with it.
       */
      map.current!.on('click', 'stops-selected', (e) => {
        const stopKey = e.features?.[0]?.properties.stop_key as
          | string
          | undefined;
        if (!stopKey) return;

        onToggleStopRef.current?.(stopKey);
      });

      // Apply initial selection state
      const selectedIds = linesRef.current
        .filter((l) => l.selected)
        .map((l) => l.id);
      map.current!.setFilter('lines-selected', selectedFilter(selectedIds));
      syncStopLayer(map.current!, {
        markers: stopMarkersRef.current,
        selectedLineIds: selectedIds,
        measure: stopMeasureRef.current,
        selectedStopKeys: selectedStopKeysRef.current,
      });
    });

    return () => {
      map.current?.remove();
      map.current = null;
      isStyleLoaded.current = false;
      delete window.__metroMap;
    };
    // Deliberately empty: the map is initialised once. Everything the `load` handler
    // needs from a later render it reads through a ref, which is why this no longer
    // needs an exhaustive-deps exemption.
  }, []);

  // Sync selected lines with the route layer's filter whenever selection changes.
  useEffect(() => {
    linesRef.current = lines;
    if (!isStyleLoaded.current) return;
    const selectedIds = lines.filter((l) => l.selected).map((l) => l.id);
    map.current?.setFilter('lines-selected', selectedFilter(selectedIds));
  }, [lines]);

  /**
   * The stop layer, in one effect.
   *
   * Markers, the selected lines, the Stop Measure and the Stop Selection are four views
   * of one layer's state, so they are applied together rather than racing each other
   * through three effects — and the layer they apply to may not exist yet, which is a
   * condition only one of them should have to know about.
   *
   * `stopReadouts` is a ref update rather than a paint: the popup handler reads it at
   * event time.
   */
  useEffect(() => {
    stopReadoutsRef.current = stopReadouts;
    if (!isStyleLoaded.current || !map.current) return;
    syncStopLayer(map.current, {
      markers: stopMarkers,
      selectedLineIds: lines.filter((l) => l.selected).map((l) => l.id),
      measure: stopMeasure,
      selectedStopKeys,
    });
  }, [stopMarkers, stopReadouts, stopMeasure, selectedStopKeys, lines]);

  /*
   * The map, and one dashboard control floating over it.
   *
   * Deliberately **not** a MapLibre `IControl`. The navigation cluster top-right is the
   * map's own chrome and everything in it changes the camera and nothing else; this tick
   * opens a panel below the map and rewrites the URL, so dressing it as a sibling of the
   * zoom buttons would understate what it does. It takes the filter bar's own checkbox
   * and label instead — the same control, in the second place a reader looks for it.
   *
   * The wrapper exists to be the positioning context. `#lineMap` keeps `flex: 1` inside
   * it and the wrapper claims the pane's spare height in its place, so the map's box is
   * the one it always was.
   */
  return (
    <div className="relative flex flex-1 flex-col">
      <div id="lineMap" ref={mapContainer} />

      {onToggleShowStops && (
        <label
          htmlFor="map-stop-ridership"
          data-qa="map-stop-ridership"
          className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded bg-white/95 px-2 py-1.5 text-xs shadow cursor-pointer"
        >
          <Checkbox.Root
            id="map-stop-ridership"
            onClick={onToggleShowStops}
            checked={showStops}
            className="flex items-center justify-center bg-white border border-stone-300 data-[state=checked]:bg-[#033056] data-[state=checked]:border-[#033056] rounded p-0 h-5 w-5"
          >
            <Checkbox.Indicator>
              <img
                src={checkIcon}
                height={20}
                width={20}
                alt="Check"
                className="recolor-white"
              />
            </Checkbox.Indicator>
          </Checkbox.Root>
          Stop Ridership
        </label>
      )}
    </div>
  );
}
