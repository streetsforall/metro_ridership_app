import type { Chart as ChartJS, Plugin } from 'chart.js';
import colors from 'tailwindcss/colors';
import { monthIndexAtPixel } from './months';

/**
 * Pixels the cursor must travel between mousedown and mouseup before the
 * gesture counts as a drag. Below it the same gesture is a click, which pins the
 * tooltip — the two share a mouse button, so something has to separate them.
 */
export const DRAG_THRESHOLD_PX = 5;

/** A one-month selection is a click with extra steps; refuse it. */
const MIN_MONTHS = 2;

/**
 * How long the button must be held before a press becomes a drag.
 *
 * A press used to paint the band immediately, so every click flashed a Month
 * Window that was then discarded for travelling under {@link DRAG_THRESHOLD_PX}.
 * Arming is the gate: before it, nothing paints and no selection can complete.
 */
export const HOLD_MS = 500;

/**
 * Travel that arms a press without waiting out the hold.
 *
 * A confident drag across a year takes far less than half a second, so a strict
 * hold would make that gesture feel broken. Well past any click jitter, and far
 * enough past {@link DRAG_THRESHOLD_PX} that the two are not the same rule.
 *
 * Both this and the hold are tunables, not structure — expect to move them once
 * the gesture has been used in anger.
 */
export const ARM_DISTANCE_PX = 24;

export interface RangeSelectOptions {
  /** Called with the inclusive, ascending month-index bounds of the drag. */
  onSelect?: (startIndex: number, endIndex: number) => void;
}

interface DragState {
  startX: number;
  currentX: number;
  dragging: boolean;
  /**
   * Whether the press has been held or dragged far enough to count. A pressed
   * but unarmed gesture is still a click: it paints nothing and completes
   * nothing, so the reader is never shown a window that is about to be thrown
   * away.
   */
  armed: boolean;
  /** Live hold timer, so release, mouseout and destroy can all cancel it. */
  holdTimer: ReturnType<typeof setTimeout> | null;
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
      armed: false,
      holdTimer: null,
      suppressClick: false,
    });
    const x = args.event.x ?? 0;

    const clearHold = () => {
      if (state.holdTimer === null) return;
      clearTimeout(state.holdTimer);
      state.holdTimer = null;
    };

    switch (args.event.type) {
      case 'mousedown':
        if (!args.inChartArea) return;
        clearHold();
        state.startX = x;
        state.currentX = x;
        state.dragging = true;
        state.armed = false;
        // A stationary hold has nothing to repaint on, so arming asks for the
        // frame itself — that repaint is what puts the rule at the press point.
        state.holdTimer = setTimeout(() => {
          state.holdTimer = null;
          state.armed = true;
          chart.render();
        }, HOLD_MS);
        break;

      case 'mousemove':
        if (!state.dragging) return;
        state.currentX = x;
        if (!state.armed && Math.abs(x - state.startX) >= ARM_DISTANCE_PX) {
          clearHold();
          state.armed = true;
        }
        // Unarmed, the move is still a click in progress: no repaint, so no band.
        if (!state.armed) return;
        args.changed = true;
        break;

      case 'mouseup': {
        clearHold();
        if (!state.dragging) return;
        state.dragging = false;
        args.changed = true;
        if (!state.armed) return;
        state.armed = false;
        if (Math.abs(state.currentX - state.startX) < DRAG_THRESHOLD_PX) return;

        const a = monthIndexAtPixel(chart, state.startX);
        const b = monthIndexAtPixel(chart, state.currentX);
        const [startIndex, endIndex] = a <= b ? [a, b] : [b, a];
        if (endIndex - startIndex + 1 < MIN_MONTHS) return;

        state.suppressClick = true;
        readOptions(chart).onSelect?.(startIndex, endIndex);
        break;
      }

      // Releasing outside the canvas never delivers a mouseup, so the drag would
      // otherwise still be live when the cursor came back.
      case 'mouseout':
        clearHold();
        if (!state.dragging) return;
        state.dragging = false;
        state.armed = false;
        args.changed = true;
        break;
    }
  },

  // A chart torn down mid-hold would otherwise fire into a dead instance.
  beforeDestroy(chart) {
    const state = (chart as ChartWithDrag).$rangeSelect;
    if (!state?.holdTimer) return;
    clearTimeout(state.holdTimer);
    state.holdTimer = null;
  },

  afterDraw(chart) {
    const state = (chart as ChartWithDrag).$rangeSelect;
    if (!state?.dragging || !state.armed) return;

    const {
      ctx,
      chartArea: { top, bottom, left, right },
    } = chart;
    const from = Math.min(Math.max(state.startX, left), right);
    const to = Math.min(Math.max(state.currentX, left), right);

    ctx.save();
    ctx.setLineDash([]);

    /**
     * A hold that armed without moving has no band to draw yet, but it does have
     * something to say: the rule at the press point is how the reader learns the
     * gesture took before they move.
     */
    if (from === to) {
      ctx.strokeStyle = colors.stone['500'];
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(from, top);
      ctx.lineTo(from, bottom);
      ctx.stroke();
      ctx.restore();
      return;
    }

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
