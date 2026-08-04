declare module '@fontsource-variable/*' {}

interface Window {
  /**
   * The live MapLibre instance, published by `src/components/Map.tsx` purely as a test
   * seam — nothing in the app reads it. `e2e/map.spec.ts` needs it to await the map's
   * `idle` event (instead of sleeping) and to read back what actually rendered.
   */
  __metroMap?: import('maplibre-gl').Map;
}
