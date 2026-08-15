import { type ChartDataset } from 'chart.js';
import {
  alignToMonthAxis,
  buildAggregateSeries,
  buildCoverageByLine,
  buildMonthAxis,
  type LineCoverage,
} from './chartData';
import { lineMetrics, type LineMetrics } from './lineMetrics';
import { getLineColor, getLineNames } from '../utils/lines';
import transitEventsData from '../data/transit-events.json';
import type { CustomChartData } from '../@types/chart.types';
import type { TransitEvent } from '../@types/events.types';
import type {
  ConsolidatedRidership,
  DayOfWeek,
  RidershipRecord,
} from '../@types/metrics.types';

/**
 * The minimum a caller must state about the lines. `Line` satisfies this
 * structurally, so callers pass `lines` unchanged.
 *
 * Metadata may cross this boundary; **derived figures may not**. `distanceMiles`
 * is here because riders per mile cannot be derived without it, and it comes from
 * `line_distances.json` by line id — it is never written back from ridership.
 * Nothing this module derives is ever read back in through here. See
 * `docs/adr/0005-derived-figures-live-on-line-readouts.md`.
 */
export interface LineSelection {
  id: number;
  selected: boolean;
  /** One-way route length. Metadata, never derived. */
  distanceMiles?: number;
}

export interface RidershipViewInput {
  /** `null` is the loading state — it yields the empty view. */
  records: RidershipRecord[] | null;
  /** Legend and dataset order follow this order. Do not sort inside the module. */
  lines: readonly LineSelection[];
  startDate: Date;
  endDate: Date;
  dayOfWeek: DayOfWeek;
  includeAggregate: boolean;
  /** Defaults to the bundled `transit-events.json`. */
  events?: readonly TransitEvent[];
}

export interface RidershipView {
  /** The shared Month Axis: chronological union of the selected lines' months. */
  months: string[];
  /** One dataset per selected line in `lines` order; the Aggregate Series last, if requested. */
  datasets: ChartDataset<'line', CustomChartData[]>[];
  /** Records grouped by line, each carrying its Selection Snapshot. */
  consolidated: ConsolidatedRidership;
  /** Transit Events inside the Event Window that apply to the selection, chronologically. */
  events: TransitEvent[];
  /** Line Metrics per line id. A Line with no records in the Month Window is absent. */
  metrics: Record<number, LineMetrics>;
  /** The span each Line's records cover inside the Month Window, per line id. */
  coverage: Record<number, LineCoverage>;
}

/**
 * Derive everything on screen that follows from one set of user choices: the
 * Month Axis, the per-line series, the Aggregate Series, the per-line record
 * groups and the context-log events.
 *
 * ## The Month Window is deliberately offset
 *
 * A record at calendar-month ordinal `R` is included when `S <= R <= E - 2`: the
 * start month is included, and **the end month and the month immediately before
 * it are excluded**. This is intended, not an off-by-one bug — the app has always
 * behaved this way, users have shared URLs against it, and
 * `e2e/chart-content.spec.ts` renders windows through it into committed PNG
 * baselines. The `Date` arithmetic below is copied verbatim rather than restated
 * as an ordinal comparison, precisely so it cannot drift. See
 * `docs/adr/0001-ridership-month-window-is-deliberately-offset.md`.
 *
 * The Event Window, applied further down, is **inclusive on both ends** and
 * correctly 1-based. The two windows genuinely disagree; that is preserved
 * rather than reconciled, because reconciling them would change which events
 * appear for a given URL.
 */
export function buildRidershipView(input: RidershipViewInput): RidershipView {
  const {
    records,
    lines,
    startDate,
    endDate,
    dayOfWeek,
    includeAggregate,
    events: inputEvents,
  } = input;

  const consolidatedRidership: ConsolidatedRidership = {};

  /**
   * Group raw records by line ID, skipping any outside the selected date window.
   * new Date(year, month) treats month as 0-based, but the data stores it as
   * 1-based, so the comparison is effectively off by one month —
   * preserved from the original implementation.
   */
  if (records) {
    for (const record of records) {
      const metricDate = new Date(record.year, record.month);
      if (
        startDate.getTime() >= metricDate.getTime() ||
        endDate.getTime() <= metricDate.getTime()
      )
        continue;

      if (!consolidatedRidership[record.line_name]?.ridershipRecords) {
        /**
         * Snapshot selected status on first encounter for this line so the
         * dataset loop below doesn't need to search lines[] on every record.
         */
        consolidatedRidership[record.line_name] = {
          selected: !!lines.find((l) => l.id === Number(record.line_name))
            ?.selected,
          ridershipRecords: [],
        };
      }
      consolidatedRidership[record.line_name].ridershipRecords.push(record);
    }
  }

  const coverage = buildCoverageByLine(consolidatedRidership);

  /**
   * Iterates `lines`, not `consolidatedRidership`: a record whose `line_name` has no
   * metadata entry produces a consolidated group but no `Line`, and the write-back
   * this replaced — which mapped over `lines` — gave it no metrics either. Preserved.
   *
   * A Line with no records in the Month Window, or whose records yield no Line
   * Metrics, is simply absent from the map. That is ADR-0004's `null` contract seen
   * from the caller's side: no records means no metrics, not zeroes.
   */
  const metrics: Record<number, LineMetrics> = {};
  for (const line of lines) {
    const group = consolidatedRidership[line.id];
    if (!group) continue;
    const figures = lineMetrics({
      records: group.ridershipRecords,
      dayOfWeek,
      distanceMiles: line.distanceMiles,
    });
    if (figures) metrics[line.id] = figures;
  }

  /**
   * Collect the selected lines in lines[] order (already alphabetically sorted)
   * rather than consolidatedRidership order, so the legend ordering is stable
   * regardless of the numeric key enumeration order of the object.
   *
   * Note this filters on the Selection Snapshot, not on `line.selected`: a line
   * the user has selected but which has no records inside the Month Window is
   * absent from `consolidatedRidership` entirely, so it produces no dataset.
   * The event filter below deliberately does the opposite — see there.
   */
  const selected = lines.filter(
    (line) => consolidatedRidership[line.id]?.selected,
  );

  /**
   * One shared x-axis for every dataset: the chronologically sorted union of the
   * months the selected lines cover. Selected lines can cover different spans (a
   * line added mid-window has far fewer months), and Chart.js appends any label
   * missing from `labels` to the end of the axis — so deriving the axis from one
   * dataset scrambles the ordering of the rest.
   */
  const months = buildMonthAxis(
    selected.map((line) => consolidatedRidership[line.id].ridershipRecords),
  );

  const datasets: ChartDataset<'line', CustomChartData[]>[] = selected.map(
    (line) => ({
      data: alignToMonthAxis(
        consolidatedRidership[line.id].ridershipRecords,
        months,
        dayOfWeek,
      ),
      label: getLineNames(line.id).current,
      backgroundColor: getLineColor(line.id),
      borderColor: getLineColor(line.id),
    }),
  );

  /**
   * Sum every selected line's stat at each month into a single series.
   */
  if (includeAggregate) {
    datasets.push({
      data: buildAggregateSeries(
        datasets.map((dataset) => dataset.data),
        months,
      ),
      label: 'Aggregate',
      backgroundColor: getLineColor(-1),
      borderColor: getLineColor(-2),
    });
  }

  const allEvents = inputEvents ?? (transitEventsData as TransitEvent[]);

  /**
   * The Event Window: inclusive on both ends and 1-based, unlike the Month
   * Window above. Preserve the disagreement.
   *
   * The selection set here reads the **live** selection (`lines.filter(l =>
   * l.selected)`), not the Selection Snapshot the datasets filter on. That is
   * not an oversight: an event on a selected line that has no records inside the
   * Month Window still shows in the context log.
   *
   * None of this depends on `records`, so events are still filtered and returned
   * while the ridership data is loading — matching the app's behaviour today.
   */
  const selectedLineIds = new Set(
    lines.filter((l) => l.selected).map((l) => l.id),
  );
  const startYYYYMM = startDate.getFullYear() * 100 + (startDate.getMonth() + 1);
  const endYYYYMM = endDate.getFullYear() * 100 + (endDate.getMonth() + 1);

  const events = allEvents
    .filter((event) => {
      const [year, month] = event.date.split('-').map(Number);
      const eventYYYYMM = year * 100 + month;
      if (eventYYYYMM < startYYYYMM || eventYYYYMM > endYYYYMM) return false;
      if (event.line_ids.length === 0) return true;
      return event.line_ids.some((id) => selectedLineIds.has(id));
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    months,
    datasets,
    consolidated: consolidatedRidership,
    events,
    metrics,
    coverage,
  };
}
