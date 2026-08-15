import type { Chart as ChartJS, Plugin } from 'chart.js';
import colors from 'tailwindcss/colors';
import type { TransitEvent } from '../@types/events.types';
import { categoryColor } from './categoryColors';
import { eventDateToLabel } from './months';

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

/** Radius of a month's dot before any emphasis is applied. */
const DOT_RADIUS = 4;
/**
 * Months carrying more than one event draw slightly larger. Not a numeral: a
 * digit inside a 10px dot is unreadable, and the tooltip lists them all anyway.
 */
const MULTI_EVENT_DOT_RADIUS = 5.5;
/** Extra radius for the focused (hovered/pinned) or log-highlighted month. */
const EMPHASIS_RADIUS = 2;

export interface EventGutterOptions {
  events?: TransitEvent[];
  /** Month index the tooltip is currently describing, hover or pinned. */
  focusedIndex?: number | null;
  /** Month index of the context-log row under the cursor. */
  highlightedIndex?: number | null;
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
 * Draws one dot per month that has events, sitting on the x-axis baseline.
 *
 * These were full-height dashed rules. With several events in a window they
 * out-weighted the ridership series they annotate — the reader's eye went to the
 * annotation rather than the data. On the axis the marks still line up with
 * their month but stay out of the plot, and the context they used to carry moved
 * into the month tooltip, which is reachable from anywhere in the column instead
 * of from a 6px band around the rule.
 */
export const eventGutterPlugin: Plugin<'line'> = {
  id: 'eventGutter',

  afterDraw(chart) {
    const c = chart as ChartWithEventGutter;
    const { events = [], focusedIndex, highlightedIndex } = readOptions(chart);
    const labels = (chart.data.labels ?? []) as string[];

    const byIndex = groupEventsByMonthIndex(events, labels);
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
      const radius =
        (monthEvents.length > 1 ? MULTI_EVENT_DOT_RADIUS : DOT_RADIUS) +
        (emphasised ? EMPHASIS_RADIUS : 0);

      /**
       * A month can hold events of different categories, and the palette is the
       * only thing carrying category on the chart. Rather than pick a winner,
       * the dot is split into equal wedges — one per distinct category present —
       * so a mixed month is visibly mixed. One category is the common case and
       * draws as a plain filled circle.
       */
      const wedgeColors = [
        ...new Set(monthEvents.map((event) => categoryColor(event.category))),
      ];

      if (wedgeColors.length === 1) {
        ctx.beginPath();
        ctx.arc(xPos, bottom, radius, 0, Math.PI * 2);
        ctx.fillStyle = wedgeColors[0];
        ctx.fill();
      } else {
        const sweep = (Math.PI * 2) / wedgeColors.length;
        wedgeColors.forEach((color, i) => {
          ctx.beginPath();
          ctx.moveTo(xPos, bottom);
          ctx.arc(xPos, bottom, radius, i * sweep, (i + 1) * sweep);
          ctx.closePath();
          ctx.fillStyle = color;
          ctx.fill();
        });
      }

      // A ring in the page background, so a dot straddling the axis rule and a
      // gridline still reads as a dot rather than as part of either.
      ctx.beginPath();
      ctx.arc(xPos, bottom, radius, 0, Math.PI * 2);
      ctx.strokeStyle = colors.stone['50'];
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    ctx.restore();
  },
};
