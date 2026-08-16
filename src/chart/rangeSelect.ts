import type { Chart as ChartJS, Plugin } from 'chart.js';
import colors from 'tailwindcss/colors';
import { monthIndexAtPixel } from './months';

/** A one-month selection is a click with extra steps; refuse it. */
const MIN_MONTHS = 2;

/**
 * How long the button must be held before a press promotes to a Range Selection.
 *
 * A press used to be a drag from the moment the button went down, so every click
 * flashed a band that was then discarded for travelling too little. Promotion is
 * the gate: before it, nothing paints and no selection can complete.
 */
export const PROMOTE_HOLD_MS = 500;

/**
 * Travel that promotes a press without waiting out the hold.
 *
 * A confident drag across a year takes far less than half a second, so a strict
 * hold would make that gesture feel broken. Well past the few pixels of hand
 * jitter inside any real click, so a sloppy click is still a click.
 *
 * Both this and the hold are tunables, not structure — expect to move them once
 * the gesture has been used in anger.
 */
export const PROMOTE_DISTANCE_PX = 24;

export interface RangeSelectOptions {
  /** Called with the inclusive, ascending month-index bounds of the drag. */
  onSelect?: (startIndex: number, endIndex: number) => void;
}

interface DragState {
  startX: number;
  currentX: number;
  /**
   * The button is down inside the plot and the gesture is undecided — it may
   * still turn out to be a click. A pressed gesture paints nothing and completes
   * nothing, so the reader is never shown a selection that is about to be thrown
   * away.
   */
  pressed: boolean;
  /**
   * The press has been promoted: this is a Range Selection. Only ever set by
   * {@link promote}, which is the one place the travel threshold is applied.
   */
  dragging: boolean;
  /** Live hold timer, so release, mouseout and destroy can all cancel it. */
  holdTimer: ReturnType<typeof setTimeout> | null;
  /**
   * Set when a promoted drag completes. Chart.js fires `click` after `mouseup`,
   * so without this the gesture that just re-ranged the chart would also pin a
   * tooltip. A press that never promoted must not set it: that gesture is a
   * click and the click path is where it goes to pin. The click handler consumes
   * the flag instead.
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
      pressed: false,
      dragging: false,
      holdTimer: null,
      suppressClick: false,
    });
    const x = args.event.x ?? 0;

    const clearHold = () => {
      if (state.holdTimer === null) return;
      clearTimeout(state.holdTimer);
      state.holdTimer = null;
    };

    /**
     * Pressed → dragging. The only place a press becomes a Range Selection, so
     * the only place the travel threshold is applied — a second copy on release
     * is how a gesture ends up being judged twice by two different rules.
     */
    const promote = () => {
      clearHold();
      state.dragging = true;
    };

    switch (args.event.type) {
      case 'mousedown':
        if (!args.inChartArea) return;
        clearHold();
        state.startX = x;
        state.currentX = x;
        state.pressed = true;
        state.dragging = false;
        // A stationary hold has nothing to repaint on, so promoting asks for the
        // frame itself — that repaint is what puts the rule at the press point.
        state.holdTimer = setTimeout(() => {
          state.holdTimer = null;
          promote();
          chart.render();
        }, PROMOTE_HOLD_MS);
        break;

      case 'mousemove':
        if (!state.pressed) return;
        state.currentX = x;
        if (!state.dragging && Math.abs(x - state.startX) >= PROMOTE_DISTANCE_PX)
          promote();
        // Unpromoted, the move is still a click in progress: no repaint, no band.
        if (!state.dragging) return;
        args.changed = true;
        break;

      case 'mouseup': {
        clearHold();
        if (!state.pressed) return;
        state.pressed = false;
        args.changed = true;
        // Never promoted, so this gesture is a click: it falls through to the
        // click path to pin, and must not suppress itself on the way.
        if (!state.dragging) return;
        state.dragging = false;

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
        if (!state.pressed) return;
        state.pressed = false;
        state.dragging = false;
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
    if (!state?.dragging) return;

    const {
      ctx,
      chartArea: { top, bottom, left, right },
    } = chart;
    const from = Math.min(Math.max(state.startX, left), right);
    const to = Math.min(Math.max(state.currentX, left), right);

    ctx.save();
    ctx.setLineDash([]);

    /**
     * A hold that promoted without moving has no band to draw yet, but it does
     * have something to say: the rule at the press point is how the reader
     * learns the gesture took before they move.
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
