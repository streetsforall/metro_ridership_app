/**
 * The ridership derivation's entire public surface.
 *
 * Everything else in this folder is implementation: importing `../ridership/chartData`
 * from outside is visibly reaching past the seam. See
 * `docs/adr/0003-one-domain-folder-not-a-repo-wide-reorganisation.md`.
 */
export {
  buildRidershipView,
  type RidershipView,
  type RidershipViewInput,
  type LineSelection,
} from './buildRidershipView';

/**
 * The line-table's month axis and coverage labels.
 *
 * `buildRidershipView` cannot serve these: it derives everything for the **chart**,
 * over the **selected** lines only. The table draws a sparkline for every *visible*
 * line and labels the coverage of every line in the window, so it needs the union
 * across all of `consolidated` — a wider axis than `RidershipView.months`. These are
 * therefore a deliberate second entry point onto the same month-axis machinery, not a
 * leak: `chartData.ts` itself stays module-private (ADR 0003), and the month-axis
 * helpers living here is exactly what that ADR reserves this folder for.
 */
export {
  alignToMonthAxis,
  buildCoverageByLine,
  buildWindowMonthAxis,
  type LineCoverage,
} from './chartData';

/**
 * The per-line summary figures the line table and the summary panel read.
 * Replaces the five exports of the former `src/utils/calc.ts`.
 */
export {
  lineMetrics,
  type LineMetrics,
  type LineMetricsInput,
} from './lineMetrics';
