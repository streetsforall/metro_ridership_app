import type { Chart as ChartJS, Plugin } from 'chart.js';
import colors from 'tailwindcss/colors';
import type { TransitEvent } from '../@types/events.types';
import { categoryColor } from './categoryColors';
import { eventDateToLabel, monthIndexAtPixel } from './months';

/**
 * Events sharing a month, keyed by their index on the x-axis. Months with no
 * event are absent rather than mapped to an empty array, so `.has(idx)` is the
 * "did anything happen here" test.
 *
 * The chart and the tooltip both need this mapping, and they must agree: the
 * tooltip claims to describe the dot under the cursor. Deriving it once and
 * exporting it is what makes that true by construction.
 */
export function groupEventsByMonthIndex(
  events: TransitEvent[],
  labels: string[],
): Map<number, TransitEvent[]> {
  const byIndex = new Map<number, TransitEvent[]>();
  events.forEach((event) => {
    const idx = labels.indexOf(eventDateToLabel(event.date));
    if (idx === -1) return;
    const bucket = byIndex.get(idx);
    if (bucket) bucket.push(event);
    else byIndex.set(idx, [event]);
  });
  return byIndex;
}

/** Base width and height of a month's triangle before any emphasis. */
const TRIANGLE_WIDTH = 9;
const TRIANGLE_HEIGHT = 7;
/**
 * Months carrying more than one event draw slightly larger. Not a numeral: a
 * digit inside a 12px triangle is unreadable, and the tooltip lists them all anyway.
 */
const MULTI_EVENT_TRIANGLE_WIDTH = 12;
const MULTI_EVENT_TRIANGLE_HEIGHT = 9;
/** Extra size for the focused (hovered/pinned) or log-highlighted month. */
const EMPHASIS_WIDTH = 3;
const EMPHASIS_HEIGHT = 2;

/**
 * Gap between the Month Axis rule and the apex of a triangle.
 *
 * The whole point of the gutter is that nothing is painted on `chartArea.bottom`
 * — a Line reporting zero riders is drawn along exactly that row of pixels, and
 * the shapes annotating it used to sit on top of it.
 */
const APEX_GAP = 3;

/**
 * Widest a month's whole group of triangles may draw, gaps included.
 *
 * Months sit roughly fifteen pixels apart at a 72-month desktop window, so a
 * mixed month wider than this bleeds into its neighbours and the reader can no
 * longer tell which month a triangle belongs to. Each triangle shrinks to fit,
 * which is what makes an unlikely three- or four-category month degrade rather
 * than collide — the data has nine categories but has never held more than two
 * in one month.
 *
 * Width is the only dimension that degrades. Height stays at the month's own
 * size, so a mixed month still reads as tall as any other multi-event month and
 * the group can never grow down into the axis labels.
 */
const GROUP_WIDTH_CAP = 14;
const TRIANGLE_GAP = 1;

export interface EventGutterOptions {
  /**
   * Named `transitEvents`, not `events`. Chart.js reads `plugin.options.events`
   * as the list of event *types* a plugin wants notifying for — see the note in
   * `src/@types/chart.types.ts`. Putting the Transit Events under that key
   * disables this plugin's `afterEvent` entirely, and nothing warns you.
   */
  transitEvents?: TransitEvent[];
  /** Month index the tooltip is currently describing, hover or pinned. */
  focusedIndex?: number | null;
  /** Month index of the context-log row under the cursor. */
  highlightedIndex?: number | null;
  /** A click below the Month Axis rule, resolved to a month. */
  onGutterClick?: (monthIndex: number) => void;
  /** The month under the pointer in the gutter, or null on leaving it. */
  onGutterHover?: (monthIndex: number | null) => void;
}

/** Fields stashed on the chart instance for the click handler to read back. */
export type ChartWithEventGutter = ChartJS<'line'> & {
  $eventsByIndex?: Map<number, TransitEvent[]>;
};

function readOptions(chart: ChartJS): EventGutterOptions {
  return (
    (chart.options.plugins as Record<string, EventGutterOptions | undefined>)
      .eventGutter ?? {}
  );
}

/**
 * Draws one upward triangle per distinct category a month carries, in the Event
 * Gutter — the strip below the Month Axis rule.
 *
 * These were full-height dashed rules, then dots on the axis baseline. The rules
 * out-weighted the ridership series they annotate; the dots sat on the one row of
 * pixels a Line reporting zero riders is drawn along, so the D Line's flat run
 * from 2020-07 to 2025-07 was buried under the very shapes explaining it. Below
 * the rule the shapes still line up with their month, leave the plot alone, and —
 * being triangles rather than circles — no longer read as data points.
 *
 * Room for the strip is reserved by the x scale's `ticks.padding` in
 * `RidershipChart`, so Chart.js accounts for it in its own layout pass and the
 * triangles cannot collide with the rotated month labels at any width.
 */
export const eventGutterPlugin: Plugin<'line'> = {
  id: 'eventGutter',

  /**
   * Pointer handling for the strip below the plot.
   *
   * Chart.js dispatches `options.onClick` only when the pointer is inside
   * `chartArea`, and a hover outside it keeps the previously active elements
   * rather than retargeting — the tolerance is a couple of pixels. So moving the
   * shapes off the baseline takes click-to-pin and hover-targeting with them
   * unless the plugin that draws them also hit-tests them. `afterEvent` is the
   * one hook Chart.js notifies for every canvas event regardless of plot area.
   *
   * See ADR-0010. Anything later drawn below the plot needs the same treatment.
   */
  afterEvent(chart, args) {
    const { onGutterClick, onGutterHover } = readOptions(chart);
    const { type, x, y } = args.event;

    // Inside the plot, Chart.js's own click and hover paths already run. Leaving
    // both live would be two routes to the same pin.
    if (args.inChartArea) return;

    // Off the canvas entirely, so whatever the gutter was describing is stale.
    if (type === 'mouseout') {
      onGutterHover?.(null);
      return;
    }

    if (y === null || y === undefined || y <= chart.chartArea.bottom) return;

    const index = monthIndexAtPixel(chart, x ?? 0);
    if (type === 'click') onGutterClick?.(index);
    else if (type === 'mousemove') onGutterHover?.(index);
  },

  afterDraw(chart) {
    const c = chart as ChartWithEventGutter;
    const {
      transitEvents = [],
      focusedIndex,
      highlightedIndex,
    } = readOptions(chart);
    const labels = (chart.data.labels ?? []) as string[];

    const byIndex = groupEventsByMonthIndex(transitEvents, labels);
    c.$eventsByIndex = byIndex;
    if (!byIndex.size) return;

    const {
      ctx,
      chartArea: { bottom },
      scales: { x },
    } = chart;

    ctx.save();
    ctx.setLineDash([]);

    byIndex.forEach((monthEvents, idx) => {
      const xPos = x.getPixelForValue(idx);
      const emphasised = idx === focusedIndex || idx === highlightedIndex;
      const multi = monthEvents.length > 1;
      const width =
        (multi ? MULTI_EVENT_TRIANGLE_WIDTH : TRIANGLE_WIDTH) +
        (emphasised ? EMPHASIS_WIDTH : 0);
      const height =
        (multi ? MULTI_EVENT_TRIANGLE_HEIGHT : TRIANGLE_HEIGHT) +
        (emphasised ? EMPHASIS_HEIGHT : 0);

      /**
       * A month can hold events of different categories, and the palette is the
       * only thing carrying category on the chart. Rather than pick a winner,
       * the month draws one triangle per distinct category present, side by side
       * on a shared baseline, so a mixed month is visibly mixed. One category is
       * the common case and is just this with a group of one.
       */
      const categoryColors = [
        ...new Set(monthEvents.map((event) => categoryColor(event.category))),
      ];

      const gaps = (categoryColors.length - 1) * TRIANGLE_GAP;
      const each = Math.min(
        width,
        (GROUP_WIDTH_CAP - gaps) / categoryColors.length,
      );
      const groupWidth = each * categoryColors.length + gaps;
      // Shared baseline below the apexes, and the group centred on the month.
      const apexY = bottom + APEX_GAP;
      const baseY = apexY + height;
      const groupLeft = xPos - groupWidth / 2;

      categoryColors.forEach((color, i) => {
        const left = groupLeft + i * (each + TRIANGLE_GAP);
        ctx.beginPath();
        ctx.moveTo(left + each / 2, apexY);
        ctx.lineTo(left + each, baseY);
        ctx.lineTo(left, baseY);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();

        // A ring in the page background, so a triangle straddling the axis rule
        // and a gridline still reads as one shape rather than as part of either.
        ctx.strokeStyle = colors.stone['50'];
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    });

    ctx.restore();
  },
};
