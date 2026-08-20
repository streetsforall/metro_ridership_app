import { useEffect, useRef } from 'react';
import maplibregl, { Popup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { LineReadout } from '../ridership';
import type { StopReadout, StopView } from '../stops';
import type { StopMeasure } from '../@types/stops.types';
import { NO_SELECTED_STOPS } from '../utils/stopDefaults';
import { buildPopupHTML, buildStopPopupHTML } from '../utils/mapPopup';
import './Map.css';

const mapTilerKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;

const STYLE_URL = mapTilerKey
  ? `https://api.maptiler.com/maps/ab4289f4-b600-4f7a-bbe3-c0666c48446d/style.json?key=${mapTilerKey}`
  : 'https://tiles.openfreemap.org/styles/positron';

/** The empty marker set, as one stable reference for `setData` to see. */
const NO_MARKERS: StopView['markers'] = {
  type: 'FeatureCollection',
  features: [],
};

/**
 * How each measure is drawn — disc, ring, or both — because colour already means which
 * line (ADR-0014).
 */
const MEASURE_PAINT: Record<
  StopMeasure,
  { opacity: number; strokeWidth: number }
> = {
  ons: { opacity: 0.75, strokeWidth: 0 },
  offs: { opacity: 0.12, strokeWidth: 2 },
  both: { opacity: 0.55, strokeWidth: 1 },
};

/** A selected stop's ring is neutral, so it reads as selection rather than as a line. */
const SELECTED_STROKE_COLOR = '#033056';
const SELECTED_STROKE_WIDTH = 3;

/** Shared default, so the prop's identity is stable between renders. */
const NO_READOUTS: readonly StopReadout[] = [];

/** Which lines are selected — asked by the route layer, the stop layer and `load`. */
const selectedLineIds = (lines: readonly LineReadout[]): number[] =>
  lines.filter((line) => line.selected).map((line) => line.id);

/** A layer-scoped pointer event, carrying the features under the cursor. */
type LayerMouseEvent = maplibregl.MapMouseEvent & {
  features?: maplibregl.MapGeoJSONFeature[];
};

/** The selected-lines filter, shared by the route layer and the stop layer. */
const selectedFilter = (ids: number[]): maplibregl.FilterSpecification => [
  'in',
  ['get', 'line_id'],
  ['literal', ids],
];

/**
 * Adds the stop source and circle layer on first use, so a map that never opened the
 * panel keeps its original two layers.
 */
function ensureStopLayer(
  map: maplibregl.Map,
  markers: StopView['markers'],
): boolean {
  if (map.getLayer('stops-selected')) return true;
  if (markers.features.length === 0) return false;

  map.addSource('stop-ridership', { type: 'geojson', data: markers });

  // No `beforeId`, so a stop is never hidden under its own line.
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

/** Fill, ring and selection marks — everything the measure and selection drive. */
function applyStopPaint(
  map: maplibregl.Map,
  measure: StopMeasure,
  selectedStopKeys: readonly string[],
): void {
  const { opacity, strokeWidth } = MEASURE_PAINT[measure];
  // No palette reaches the map, because the fill already means which line (ADR-0014).
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
 * The one place the stop layer is brought in line with current state, called from both
 * `load` and the effect below.
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
  /** Markers from `buildStopView`, with radius and colour already on each feature. */
  stopMarkers?: StopView['markers'];
  /** The readouts those markers were built from, for the hover popup. */
  stopReadouts?: readonly StopReadout[];
  stopMeasure?: StopMeasure;
  /** Every stop the panel is drawing, each marked with a ring. */
  selectedStopKeys?: readonly string[];
  /** A click on a circle toggles that stop, exactly as its table row does. */
  onToggleStop?: (stopKey: string) => void;
}

export default function Map({
  lines,
  stopMarkers = NO_MARKERS,
  stopReadouts = NO_READOUTS,
  stopMeasure = 'ons',
  selectedStopKeys = NO_SELECTED_STOPS,
  onToggleStop,
}: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const isStyleLoaded = useRef(false);
  /**
   * This render's props, for handlers that were registered once inside `load` and would
   * otherwise read the first render's.
   */
  const linesRef = useRef<LineReadout[]>(lines);
  linesRef.current = lines;
  const stopReadoutsRef = useRef<readonly StopReadout[]>(stopReadouts);
  stopReadoutsRef.current = stopReadouts;
  const onToggleStopRef = useRef(onToggleStop);
  onToggleStopRef.current = onToggleStop;
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

      const onMouseMove = (e: LayerMouseEvent) => {
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
          .setHTML(
            buildPopupHTML(e.features[0].properties.name as string, lineData),
          )
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
       * Stop hover, registered after the line handlers because a circle sits above its
       * route and the last `setHTML` should win.
       */
      const onStopMouseMove = (e: LayerMouseEvent) => {
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
      /** A circle is the same toggle its table row is, reached through the ref. */
      map.current!.on('click', 'stops-selected', (e) => {
        const stopKey = e.features?.[0]?.properties.stop_key as
          | string
          | undefined;
        if (!stopKey) return;

        onToggleStopRef.current?.(stopKey);
      });

      // Apply initial selection state
      const selectedIds = selectedLineIds(linesRef.current);
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
    // Deliberately empty: the map is initialised once and later renders arrive by ref.
  }, []);

  // Sync selected lines with the route layer's filter whenever selection changes.
  useEffect(() => {
    if (!isStyleLoaded.current) return;
    map.current?.setFilter(
      'lines-selected',
      selectedFilter(selectedLineIds(lines)),
    );
  }, [lines]);

  /**
   * The stop layer in one effect, because markers, lines, measure and selection are four
   * views of one layer's state.
   */
  useEffect(() => {
    if (!isStyleLoaded.current || !map.current) return;
    syncStopLayer(map.current, {
      markers: stopMarkers,
      selectedLineIds: selectedLineIds(lines),
      measure: stopMeasure,
      selectedStopKeys,
    });
  }, [stopMarkers, stopMeasure, selectedStopKeys, lines]);

  return <div id="lineMap" ref={mapContainer} />;
}
