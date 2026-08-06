/**
 * The ridership derivation's entire public surface.
 *
 * Everything else in this folder is implementation: importing `../ridership/chartData`
 * from outside is visibly reaching past the seam. See
 * `docs/adr/0003-one-domain-folder-not-a-repo-wide-reorganisation.md`.
 *
 * Transitional shape — these three helpers are re-exported only so the move of
 * `chartData` stays a pure relocation. They are replaced by the single
 * `buildRidershipView` export once that module exists (#102).
 */
export {
  buildMonthAxis,
  alignToMonthAxis,
  buildAggregateSeries,
} from './chartData';
