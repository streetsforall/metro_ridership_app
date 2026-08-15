/**
 * The stop derivation's entire public surface.
 *
 * Everything else in this folder is implementation: importing `../stops/buildStopView`
 * or `../stops/stopData` from outside is visibly reaching past the seam. See
 * `docs/adr/0007-a-folder-with-an-index-is-a-sealed-module.md`.
 *
 * The seam is earned rather than topical. Four consumers — the map layer, the ranked
 * table, the per-stop series and the popup — read the same derivation, and two things
 * must go through one entry point or they drift apart: the stop-key ↔ location join,
 * which decides **which stops exist**, and the Month Window filter, which decides
 * **which months are on screen**. The second is the sharp one: the window predicate is
 * deliberately offset (ADR-0001), so a consumer filtering for itself would put the
 * stop panel a month out of step with the chart above it.
 */

/**
 * Decoding the wire formats. `decodeStopRidership` resolves columns **by name** and
 * rejects an unrecognised `schema`; `attachStopLocations` is the one place the
 * stop-key ↔ coordinate join happens.
 */
export {
  decodeStopRidership,
  attachStopLocations,
  modeFromStopKey,
  STOP_WIRE_SCHEMA,
  type DecodedStopRidership,
} from './stopData';

/** The one derivation. Everything the stop panel draws comes out of here. */
export {
  buildStopView,
  type StopView,
  type StopViewInput,
  type StopCoverage,
  type StopMarkerProperties,
} from './buildStopView';

/**
 * The per-stop summary figures, and the Stop Place they are joined onto.
 *
 * `stopMetrics` is exported for the same reason `lineMetrics` is: a caller with one
 * stop's records and no view — the per-stop time series — needs the figures without
 * rebuilding the whole derivation. It returns `null` for an empty series (ADR-0004).
 */
export {
  stopMetrics,
  measuredAverage,
  type StopMetrics,
  type StopMetricsInput,
} from './stopMetrics';

export {
  buildStopReadouts,
  type StopReadout,
  type StopReadoutsInput,
} from './stopReadouts';
