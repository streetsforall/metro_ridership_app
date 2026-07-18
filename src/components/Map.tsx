import { useEffect, useRef } from 'react';
import maplibregl, { Popup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Line } from '../@types/lines.types';
import { buildPopupHTML } from '../utils/mapPopup';
import './Map.css';

const mapTilerKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;

const STYLE_URL = mapTilerKey
  ? `https://api.maptiler.com/maps/ab4289f4-b600-4f7a-bbe3-c0666c48446d/style.json?key=${mapTilerKey}`
  : 'https://tiles.openfreemap.org/styles/positron';

interface MapProps {
  lines: Line[];
}

/**
 * Module-scope singleton: the MapLibre instance (and the div that owns its
 * canvas) is created once and never destroyed. React mounts only attach and
 * detach the host div, so camera position, layers, and the tile cache survive
 * dockview panel hide/show, drag-docking, and layout switches.
 */
interface MapSingleton {
  host: HTMLDivElement;
  map: maplibregl.Map;
  styleLoaded: boolean;
  lines: Line[];
}

let singleton: MapSingleton | null = null;

function applySelectionFilter(s: MapSingleton) {
  const selectedIds = s.lines.filter((l) => l.selected).map((l) => l.id);
  s.map.setFilter('lines-selected', [
    'in',
    ['get', 'line_id'],
    ['literal', selectedIds],
  ]);
}

function getOrCreateSingleton(): MapSingleton {
  if (singleton != null) return singleton;

  const host = document.createElement('div');
  host.className = 'map-host';

  const map = new maplibregl.Map({
    attributionControl: { compact: true },
    container: host,
    style: STYLE_URL,
    center: [-118.24, 34.05],
    zoom: 10,
    minZoom: 8,
    maxZoom: 16,
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-right');

  const s: MapSingleton = { host, map, styleLoaded: false, lines: [] };

  map.on('load', () => {
    s.styleLoaded = true;

    map.addSource('metro-lines', {
      type: 'geojson',
      data: '/metro_lines.geojson',
      generateId: true,
    });

    // All lines dimmed — rendered below the selected layer
    map.addLayer({
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
    map.addLayer({
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

      map.getCanvas().style.cursor = 'pointer';

      if (hoveredId !== undefined) {
        map.setFeatureState(
          { source: 'metro-lines', id: hoveredId },
          { hover: false },
        );
      }

      hoveredId = e.features[0].id;
      map.setFeatureState(
        { source: 'metro-lines', id: hoveredId },
        { hover: true },
      );

      const lineId = e.features[0].properties.line_id as number;
      const lineData = s.lines.find((l) => l.id === lineId);
      popup
        .setLngLat(e.lngLat)
        .setHTML(buildPopupHTML(e.features[0].properties.name as string, lineData))
        .addTo(map);
    };

    const onMouseLeave = () => {
      map.getCanvas().style.cursor = '';
      popup.remove();

      if (hoveredId !== undefined) {
        map.setFeatureState(
          { source: 'metro-lines', id: hoveredId },
          { hover: false },
        );
      }
      hoveredId = undefined;
    };

    map.on('mousemove', 'lines-selected', onMouseMove);
    map.on('mouseleave', 'lines-selected', onMouseLeave);

    // Apply initial selection state
    applySelectionFilter(s);
  });

  singleton = s;
  return s;
}

/**
 * Test-only: destroy the singleton so each test starts from a clean slate.
 * Production code must never call this — the whole point of the singleton is
 * that the map instance outlives React mounts.
 */
// eslint-disable-next-line react-refresh/only-export-components -- test-only helper; HMR of this file must recreate the singleton anyway
export function __resetMapForTests() {
  if (singleton == null) return;
  singleton.map.remove();
  singleton = null;
}

export default function Map({ lines }: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);

  // Attach the singleton's host div on mount, detach (but never destroy) on
  // unmount. A ResizeObserver keeps the canvas sized to the container —
  // MapLibre's own trackResize only watches the window, not dockview sashes.
  useEffect(() => {
    const container = mapContainer.current!;
    const s = getOrCreateSingleton();

    container.appendChild(s.host);
    s.map.resize();

    const observer = new ResizeObserver(() => {
      s.map.resize();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      s.host.remove();
    };
  }, []);

  // Sync selected lines with the map filter whenever selection changes. Runs
  // on every (re)mount too, so a remounted component re-applies its selection.
  useEffect(() => {
    const s = getOrCreateSingleton();
    s.lines = lines;
    if (!s.styleLoaded) return;
    applySelectionFilter(s);
  }, [lines]);

  return <div id="lineMap" ref={mapContainer} />;
}
