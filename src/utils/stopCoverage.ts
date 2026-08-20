import type { StopCoverage } from '../stops';

/**
 * How the stop coverage window sits against the current month window. It states no window
 * rule of its own: overlap is `coverage.overlapsWindow`, and partial coverage compares two
 * month lists the derivation produced, so neither asks what "in the window" means
 * (ADR-0009).
 */
export type StopCoverageState = 'unknown' | 'no-overlap' | 'partial' | 'full';

export interface StopCoverageStateInput {
  coverage: StopCoverage;
  /** The stop view's month axis — the months the panel shows, `YYYY-MM`. */
  months: readonly string[];
  /**
   * The ridership view's month axis over the same window, `YYYY-MM`. Comparing axis
   * against axis is what makes "partial" mean here what it means in the line table.
   */
  windowMonths: readonly string[];
}

export function stopCoverageState({
  coverage,
  months,
  windowMonths,
}: StopCoverageStateInput): StopCoverageState {
  /**
   * Nothing loaded yet, so nothing can be said — not "there is no stop data". Empty
   * coverage is what `buildStopView` reports while `records` is `null`, which covers both
   * loading and a failed fetch.
   */
  if (coverage.from === null || coverage.to === null) return 'unknown';
  if (!coverage.overlapsWindow) return 'no-overlap';
  // An empty axis on either side is not partial coverage: an empty stop axis is a
  // selection the panel answers in words, and an empty window axis is no selected line at
  // all, so there is nothing to be partial of.
  if (months.length === 0 || windowMonths.length === 0) return 'full';
  return months[0] !== windowMonths[0] ||
    months[months.length - 1] !== windowMonths[windowMonths.length - 1]
    ? 'partial'
    : 'full';
}
