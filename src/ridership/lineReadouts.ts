import type { Line } from '../@types/lines.types';
import type { LineMetrics } from './lineMetrics';
import type { LineCoverage } from './chartData';

/**
 * A Line together with everything the current Ridership View derives about it —
 * its Line Metrics and the span its records cover.
 *
 * Derived per Month Window and thrown away. A `Line` never carries figures between
 * windows, which is why a stale figure cannot survive a change of window; the
 * clearing branch this replaced existed only because it could.
 */
export type LineReadout = Line & Partial<LineMetrics> & Partial<LineCoverage>;

export interface LineReadoutsInput {
  lines: readonly Line[];
  metrics: Readonly<Record<number, LineMetrics>>;
  coverage: Readonly<Record<number, LineCoverage>>;
}

/**
 * Attach each Line's derived figures to it.
 *
 * A Line absent from `metrics` — no records in the Month Window — simply gets no
 * figures: spreading `undefined` writes no keys. There is nothing to clear.
 *
 * Order is preserved, so readouts follow `lines`, which is alphabetical by line
 * name. Legend, dataset and table order all continue to follow that one array.
 */
export function buildLineReadouts({
  lines,
  metrics,
  coverage,
}: LineReadoutsInput): LineReadout[] {
  return lines.map((line) => ({
    ...line,
    ...metrics[line.id],
    ...coverage[line.id],
  }));
}
