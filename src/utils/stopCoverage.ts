import type { StopCoverage } from '../stops';

/** How the stop coverage window sits against the current month window (ADR-0009). */
export type StopCoverageState = 'unknown' | 'no-overlap' | 'partial' | 'full';

export interface StopCoverageStateInput {
  coverage: StopCoverage;
  /** The stop view's month axis — the months the panel shows, `YYYY-MM`. */
  months: readonly string[];
  /** The ridership view's month axis over the same window, `YYYY-MM`. */
  windowMonths: readonly string[];
}

export function stopCoverageState({
  coverage,
  months,
  windowMonths,
}: StopCoverageStateInput): StopCoverageState {
  // No coverage yet means nothing has loaded, not that there is no stop data.
  if (coverage.from === null || coverage.to === null) return 'unknown';
  if (!coverage.overlapsWindow) return 'no-overlap';
  // An empty axis on either side leaves nothing to be partial of.
  if (months.length === 0 || windowMonths.length === 0) return 'full';
  return months[0] !== windowMonths[0] ||
    months[months.length - 1] !== windowMonths[windowMonths.length - 1]
    ? 'partial'
    : 'full';
}
