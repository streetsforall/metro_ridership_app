declare module '@fontsource-variable/*' {}

interface Window {
  /**
   * The live MapLibre instance, published by `src/components/Map.tsx` purely as a test
   * seam — nothing in the app reads it. `e2e/map.spec.ts` needs it to await the map's
   * `idle` event (instead of sleeping) and to read back what actually rendered.
   */
  __metroMap?: import('maplibre-gl').Map;
  /**
   * The live Chart.js instance, published by `src/components/RidershipChart.tsx`
   * on the same terms as `__metroMap` — a test seam nothing in the app reads.
   *
   * `e2e/chart-interaction.spec.ts` needs it to aim at the Event Gutter, which is
   * painted into the canvas and so has no element to locate. The alternative is
   * guessing `chartArea.bottom` from the plot's bounding box, which changes with
   * the axis width, the legend's wrap and the viewport.
   */
  __metroChart?: import('chart.js').Chart<'line'>;
}
