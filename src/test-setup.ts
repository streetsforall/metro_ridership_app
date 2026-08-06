/**
 * Vitest global setup (see `test.setupFiles` in vitest.config.ts).
 *
 * jsdom does not implement `window.matchMedia`, so any component that reads a media query
 * throws `TypeError: window.matchMedia is not a function` on render. `OutputArea` reads
 * `prefers-reduced-motion` to decide whether to animate the Chart.js canvas, so it needs one.
 *
 * The stub reports "no media query matches", which is jsdom's effective stance on everything
 * else too — under test the chart therefore takes its normal, animated branch. A spec that
 * wants the reduced-motion branch should override `window.matchMedia` itself.
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
