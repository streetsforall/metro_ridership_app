import type { StopCoverage } from '../stops';

/**
 * How the Stop Coverage Window sits against the current Month Window.
 *
 * **This states no window rule.** Whether the window is overlapped at all is
 * `coverage.overlapsWindow`, which `buildStopView` answers by running the one window
 * predicate; whether it is only partly covered is a comparison between two month lists
 * the derivation itself produced. Neither asks what "in the window" means, which is
 * the one thing a second copy of would break — see
 * `docs/adr/0009-the-two-window-rules-are-one-rule.md`.
 */
export type StopCoverageState = 'unknown' | 'no-overlap' | 'partial' | 'full';

export interface StopCoverageStateInput {
  coverage: StopCoverage;
  /** The Stop View's month axis — the months the panel actually shows, `YYYY-MM`. */
  months: readonly string[];
  /**
   * The Ridership View's month axis over the same window, `YYYY-MM`.
   *
   * The comparison is **axis against axis**, which is what makes "partial" here mean
   * the same thing it means in the line table: this readout's data covers only part of
   * the selected period. Both lists were produced by a derivation that applied the one
   * window predicate, so nothing here has to know what the window is.
   */
  windowMonths: readonly string[];
}

export function stopCoverageState({
  coverage,
  months,
  windowMonths,
}: StopCoverageStateInput): StopCoverageState {
  /**
   * Nothing loaded yet, so nothing can be said about the window.
   *
   * **Not "there is no stop data".** `buildStopView` reports an empty coverage for
   * `records === null`, which is its loading state and also its failed-fetch state, so
   * reading absence of data out of it here would have the panel announce that the
   * dataset was never ingested every time the network was slow. Whether stop data
   * exists at all is a build-time fact, answered from the manifest by the one caller
   * that needs it.
   */
  if (coverage.from === null || coverage.to === null) return 'unknown';
  if (!coverage.overlapsWindow) return 'no-overlap';
  // An empty axis on either side is not partial coverage. An empty stop axis is a
  // selection with no stop data, which the panel answers in words; an empty window
  // axis is no selected line at all, and there is nothing to be partial *of*.
  if (months.length === 0 || windowMonths.length === 0) return 'full';
  return months[0] !== windowMonths[0] ||
    months[months.length - 1] !== windowMonths[windowMonths.length - 1]
    ? 'partial'
    : 'full';
}
