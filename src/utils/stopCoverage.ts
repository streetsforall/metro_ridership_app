import type { StopCoverage } from '../stops';

/**
 * How the Stop Coverage Window sits against the current Month Window.
 *
 * **This states no window rule.** Overlap is `coverage.overlapsWindow`, which
 * `buildStopView` answered by running the one predicate; partial coverage is a comparison
 * between two month lists the derivation itself produced. Neither asks what "in the
 * window" means — see ADR-0009.
 */
export type StopCoverageState = 'unknown' | 'no-overlap' | 'partial' | 'full';

export interface StopCoverageStateInput {
  coverage: StopCoverage;
  /** The Stop View's month axis — the months the panel actually shows, `YYYY-MM`. */
  months: readonly string[];
  /**
   * The Ridership View's month axis over the same window, `YYYY-MM`.
   *
   * The comparison is **axis against axis**, which is what makes "partial" mean here what
   * it means in the line table: this readout covers only part of the selected period.
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
   * **Not "there is no stop data".** An empty coverage is what `buildStopView` reports
   * while `records` is `null`, which is both its loading and its failed-fetch state, so
   * reading absence of data out of it would announce that the dataset was never ingested
   * every time the network was slow.
   */
  if (coverage.from === null || coverage.to === null) return 'unknown';
  if (!coverage.overlapsWindow) return 'no-overlap';
  // An empty axis on either side is not partial coverage: an empty stop axis is a
  // selection the panel answers in words, and an empty window axis is no selected line
  // at all, so there is nothing to be partial *of*.
  if (months.length === 0 || windowMonths.length === 0) return 'full';
  return months[0] !== windowMonths[0] ||
    months[months.length - 1] !== windowMonths[windowMonths.length - 1]
    ? 'partial'
    : 'full';
}
