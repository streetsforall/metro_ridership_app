import type { Chart as ChartJS, Plugin } from 'chart.js';
import colors from 'tailwindcss/colors';

/**
 * Pixels the cursor must travel between mousedown and mouseup before the
 * gesture counts as a drag. Below it the same gesture is a click, which pins the
 * tooltip — the two share a mouse button, so something has to separate them.
 */
export const DRAG_THRESHOLD_PX = 5;

/** A one-month selection is a click with extra steps; refuse it. */
const MIN_MONTHS = 2;

export interface RangeSelectOptions {
  /** Called with the inclusive, ascending month-index bounds of the drag. */
  onSelect?: (startIndex: number, endIndex: number) => void;
}

interface DragState {
  startX: number;
  currentX: number;
  dragging: boolean;
  /**
   * Set when a drag completes. Chart.js fires `click` after `mouseup`, so
   * without this the gesture that just re-ranged the chart would also pin a
   * tooltip. The click handler consumes the flag instead.
   */
  suppressClick: boolean;
}

export type ChartWithDrag = ChartJS<'line'> & { $rangeSelect?: DragState };

/**
 * Chart.js's default event list has neither `mousedown` nor `mouseup` — it only
 * needs `mousemove`/`mouseout`/`click` for hover and tooltips. A drag cannot be
 * observed without them, so any chart using this plugin must pass this list.
 */
export const RANGE_SELECT_EVENTS = [
  'mousemove',
  'mouseout',
  'click',
  'touchstart',
  'touchmove',
  'mousedown',
  'mouseup',
] as const;

function readOptions(chart: ChartJS): RangeSelectOptions {
  return (
    (chart.options.plugins as Record<string, RangeSelectOptions | undefined>)
      .rangeSelect ?? {}
  );
}

/** Pixel → month index, clamped to the axis so a drag off the edge still lands. */
function indexAtPixel(chart: ChartJS, pixel: number): number {
  const { left, right } = chart.chartArea;
  const clamped = Math.min(Math.max(pixel, left), right);
  const lastIndex = ((chart.data.labels ?? []).length || 1) - 1;
  const value = chart.scales.x.getValueForPixel(clamped) ?? 0;
  return Math.min(Math.max(Math.round(value), 0), lastIndex);
}

/**
 * Reads and clears the post-drag click suppression. Call from the chart's click
 * handler: a true return means this click is the tail of a drag, not a click.
 */
export function consumeDragSuppression(chart: ChartJS): boolean {
  const state = (chart as ChartWithDrag).$rangeSelect;
  if (!state?.suppressClick) return false;
  state.suppressClick = false;
  return true;
}

/**
 * Drag across the plot to set the month window.
 *
 * Deliberately mouse-only. On a touch screen a horizontal drag over a chart is
 * how the page is scrolled, and claiming it would trade a shortcut for the
 * ability to scroll past the chart at all.
 */
export const rangeSelectPlugin: Plugin<'line'> = {
  id: 'rangeSelect',

  afterEvent(chart, args) {
    const c = chart as ChartWithDrag;
    const state = (c.$rangeSelect ??= {
      startX: 0,
      currentX: 0,
      dragging: false,
      suppressClick: false,
    });
    const x = args.event.x ?? 0;

    switch (args.event.type) {
      case 'mousedown':
        if (!args.inChartArea) return;
        state.startX = x;
        state.currentX = x;
        state.dragging = true;
        break;

      case 'mousemove':
        if (!state.dragging) return;
        state.currentX = x;
        args.changed = true;
        break;

      case 'mouseup': {
        if (!state.dragging) return;
        state.dragging = false;
        args.changed = true;
        if (Math.abs(state.currentX - state.startX) < DRAG_THRESHOLD_PX) return;

        const a = indexAtPixel(chart, state.startX);
        const b = indexAtPixel(chart, state.currentX);
        const [startIndex, endIndex] = a <= b ? [a, b] : [b, a];
        if (endIndex - startIndex + 1 < MIN_MONTHS) return;

        state.suppressClick = true;
        readOptions(chart).onSelect?.(startIndex, endIndex);
        break;
      }

      // Releasing outside the canvas never delivers a mouseup, so the drag would
      // otherwise still be live when the cursor came back.
      case 'mouseout':
        if (!state.dragging) return;
        state.dragging = false;
        args.changed = true;
        break;
    }
  },

  afterDraw(chart) {
    const state = (chart as ChartWithDrag).$rangeSelect;
    if (!state?.dragging) return;

    const {
      ctx,
      chartArea: { top, bottom, left, right },
    } = chart;
    const from = Math.min(Math.max(state.startX, left), right);
    const to = Math.min(Math.max(state.currentX, left), right);
    if (from === to) return;

    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(120, 113, 108, 0.15)'; // stone-500 at 15%
    ctx.fillRect(Math.min(from, to), top, Math.abs(to - from), bottom - top);
    ctx.strokeStyle = colors.stone['500'];
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(from, top);
    ctx.lineTo(from, bottom);
    ctx.moveTo(to, top);
    ctx.lineTo(to, bottom);
    ctx.stroke();
    ctx.restore();
  },
};
