/**
 * Vitest global setup (see `test.setupFiles` in vitest.config.ts).
 *
 * jsdom does not implement `window.matchMedia`, so any component that reads a media query
 * throws `TypeError: window.matchMedia is not a function` on render. `RidershipChart` reads
 * `prefers-reduced-motion` to decide whether to animate the Chart.js canvas, so it needs one.
 *
 * The stub reports "no media query matches", which is jsdom's effective stance on everything
 * else too — under test the chart therefore takes its normal, animated branch. A spec that
 * wants the reduced-motion branch should override `window.matchMedia` itself.
 *
 * `ResizeObserver` is stubbed on the same terms. jsdom does not implement it either, and
 * `RidershipChart` observes its plot box to keep the tooltip's measured width current. The stub
 * observes nothing, because jsdom lays nothing out — every element is 0×0 and never resizes. A
 * spec that needs to drive a resize installs its own, capturing the callback; see
 * `RidershipChart.test.tsx`.
 */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

if (typeof window !== 'undefined' && typeof window.ResizeObserver !== 'function') {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
