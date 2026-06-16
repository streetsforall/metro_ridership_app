import { useEffect, useRef } from 'react';
import maplibregl, { Popup } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Line } from '../@types/lines.types';
import './Map.css';

const mapTilerKey = import.meta.env.VITE_MAPTILER_KEY as string | undefined;

const STYLE_URL = mapTilerKey
  ? `https://api.maptiler.com/maps/ab4289f4-b600-4f7a-bbe3-c0666c48446d/style.json?key=${mapTilerKey}`
  : 'https://tiles.openfreemap.org/styles/positron';

interface MapProps {
  lines: Line[];
}

export default function Map({ lines }: MapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const isStyleLoaded = useRef(false);

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

        popup
          .setLngLat(e.lngLat)
          .setHTML(e.features[0].properties.name as string)
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

      // Apply initial selection state
      const selectedIds = lines.filter((l) => l.selected).map((l) => l.id);
      map.current!.setFilter('lines-selected', [
        'in',
        ['get', 'line_id'],
        ['literal', selectedIds],
      ]);
    });

    return () => {
      map.current?.remove();
      map.current = null;
      isStyleLoaded.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync selected lines with the map filter whenever selection changes
  useEffect(() => {
    if (!isStyleLoaded.current) return;
    const selectedIds = lines.filter((l) => l.selected).map((l) => l.id);
    map.current?.setFilter('lines-selected', [
      'in',
      ['get', 'line_id'],
      ['literal', selectedIds],
    ]);
  }, [lines]);

  return <div id="lineMap" ref={mapContainer} />;
}
