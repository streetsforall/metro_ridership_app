import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  rangeSelectPlugin,
  consumeDragSuppression,
  RANGE_SELECT_EVENTS,
  PROMOTE_HOLD_MS,
  PROMOTE_DISTANCE_PX,
  type ChartWithDrag,
} from '../rangeSelect';

type EventArgs = {
  event: { type: string; x: number };
  inChartArea: boolean;
  changed?: boolean;
};
type AfterEvent = (chart: unknown, args: EventArgs, opts: unknown) => void;
type AfterDraw = (chart: unknown, args: unknown, opts: unknown) => void;

// Called as methods on the plugin object, not extracted from it, so the
// unbound-method rule stays satisfied.
type BeforeDestroy = (chart: unknown, args: unknown, opts: unknown) => void;
const plugin = rangeSelectPlugin as unknown as {
  afterEvent: AfterEvent;
  afterDraw: AfterDraw;
  beforeDestroy: BeforeDestroy;
};
const afterEvent: AfterEvent = (chart, args, opts) =>
  plugin.afterEvent(chart, args, opts);
const afterDraw: AfterDraw = (chart, args, opts) =>
  plugin.afterDraw(chart, args, opts);
const beforeDestroy: BeforeDestroy = (chart, args, opts) =>
  plugin.beforeDestroy(chart, args, opts);

const makeCtx = () => ({
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  stroke: vi.fn(),
  fillRect: vi.fn(),
  setLineDash: vi.fn(),
  lineWidth: 0,
  strokeStyle: '',
  fillStyle: '',
});

/**
 * Twelve months across 400px of plot: index 0 sits at 50px, and each month is
 * 25px wide, matching `getPixelForValue` below.
 */
const makeChart = (onSelect?: (start: number, end: number) => void) => ({
  options: { plugins: { rangeSelect: { onSelect } } },
  data: { labels: Array.from({ length: 12 }, (_, i) => `2020 ${i + 1}`) },
  scales: { x: { getValueForPixel: (px: number) => (px - 50) / 25 } },
  chartArea: { top: 10, bottom: 200, left: 0, right: 400 },
  ctx: makeCtx(),
  // The hold timer asks for the frame that paints the promotion rule; a stationary
  // hold has nothing else to repaint on.
  render: vi.fn(),
});

const press = (chart: unknown, x: number) =>
  afterEvent(chart, { event: { type: 'mousedown', x }, inChartArea: true }, {});
const move = (chart: unknown, x: number) =>
  afterEvent(chart, { event: { type: 'mousemove', x }, inChartArea: true }, {});
const release = (chart: unknown, x: number) =>
  afterEvent(chart, { event: { type: 'mouseup', x }, inChartArea: true }, {});

/** Waits out the hold, which is one of the two ways a press promotes. */
const hold = () => vi.advanceTimersByTime(PROMOTE_HOLD_MS);

const draggingOf = (chart: unknown) =>
  (chart as ChartWithDrag).$rangeSelect?.dragging;
const pressedOf = (chart: unknown) =>
  (chart as ChartWithDrag).$rangeSelect?.pressed;

/**
 * Drags from `fromX` to `toX`, promoting by hold first so the case under test is
 * the drag itself rather than how it promoted. The distance escape hatch has its
 * own cases below.
 */
const drag = (fromX: number, toX: number) => {
  const onSelect = vi.fn();
  const chart = makeChart(onSelect);
  press(chart, fromX);
  hold();
  move(chart, toX);
  release(chart, toX);
  return { onSelect, chart };
};

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('RANGE_SELECT_EVENTS', () => {
  /**
   * Chart.js's default list has neither, and without them the plugin never sees
   * a drag begin or end — it silently does nothing, which is the failure this
   * pins down.
   */
  it('includes mousedown and mouseup', () => {
    expect(RANGE_SELECT_EVENTS).toContain('mousedown');
    expect(RANGE_SELECT_EVENTS).toContain('mouseup');
  });

  it('keeps the hover events Chart.js needs for tooltips', () => {
    expect(RANGE_SELECT_EVENTS).toContain('mousemove');
    expect(RANGE_SELECT_EVENTS).toContain('mouseout');
    expect(RANGE_SELECT_EVENTS).toContain('click');
  });
});

describe('drag to select a range', () => {
  it('reports the inclusive month indices the drag covered', () => {
    // 100px → index 2, 200px → index 6.
    const { onSelect } = drag(100, 200);
    expect(onSelect).toHaveBeenCalledWith(2, 6);
  });

  it('normalises a right-to-left drag to ascending order', () => {
    const { onSelect } = drag(200, 100);
    expect(onSelect).toHaveBeenCalledWith(2, 6);
  });

  /** One month is a click with extra steps, and clicking already pins. */
  it('ignores a drag that resolves to a single month', () => {
    // 100px and 110px both round to index 2.
    const { onSelect } = drag(100, 110);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('clamps a drag past the edge of the plot to the first month', () => {
    const { onSelect } = drag(200, -500);
    expect(onSelect).toHaveBeenCalledWith(0, 6);
  });

  it('clamps a drag past the right edge to the last month', () => {
    const { onSelect } = drag(100, 5000);
    expect(onSelect).toHaveBeenCalledWith(2, 11);
  });

  it('does nothing on a mouseup that no mousedown started', () => {
    const onSelect = vi.fn();
    const chart = makeChart(onSelect);
    release(chart, 200);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('ignores a mousedown outside the plot area', () => {
    const onSelect = vi.fn();
    const chart = makeChart(onSelect);
    afterEvent(chart, { event: { type: 'mousedown', x: 10 }, inChartArea: false }, {});
    move(chart, 200);
    release(chart, 200);
    expect(onSelect).not.toHaveBeenCalled();
  });

  /**
   * Releasing off-canvas never delivers a mouseup, so without this the drag is
   * still live when the cursor returns and the next hover paints a band.
   */
  it('abandons the drag when the cursor leaves the canvas', () => {
    const chart = makeChart();
    press(chart, 100);
    hold();
    move(chart, 200);
    afterEvent(chart, { event: { type: 'mouseout', x: 200 }, inChartArea: false }, {});
    afterDraw(chart, {}, {});
    expect(chart.ctx.fillRect).not.toHaveBeenCalled();
    expect(pressedOf(chart)).toBe(false);
    expect(draggingOf(chart)).toBe(false);
  });
});

/**
 * A press used to be a drag from the moment the button went down, and the travel
 * threshold was only applied on release — the reader was shown a band opening
 * and closing for nothing. Promotion is the gate that stops that, and the one
 * place the threshold is applied.
 */
describe('promoting a press to a drag', () => {
  it('sets no window when the press is released before it promotes', () => {
    const onSelect = vi.fn();
    const chart = makeChart(onSelect);
    press(chart, 100);
    vi.advanceTimersByTime(PROMOTE_HOLD_MS - 1);
    move(chart, 100 + PROMOTE_DISTANCE_PX - 1);
    release(chart, 100 + PROMOTE_DISTANCE_PX - 1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  /**
   * A timer surviving the gesture would promote a press that is already over,
   * and the next frame would paint a band for a button nobody is holding.
   */
  it('leaves no timer behind when released before promoting', () => {
    const chart = makeChart();
    press(chart, 100);
    release(chart, 101);
    expect(vi.getTimerCount()).toBe(0);
    // The dead timer's own effect, had it survived.
    vi.advanceTimersByTime(PROMOTE_HOLD_MS * 2);
    expect(draggingOf(chart)).toBe(false);
  });

  it('promotes on the hold without the pointer moving', () => {
    const chart = makeChart();
    press(chart, 100);
    expect(draggingOf(chart)).toBe(false);
    hold();
    expect(draggingOf(chart)).toBe(true);
  });

  /** A confident drag across a year takes far less than half a second. */
  it('promotes on distance well inside the hold', () => {
    const onSelect = vi.fn();
    const chart = makeChart(onSelect);
    press(chart, 100);
    vi.advanceTimersByTime(50);
    move(chart, 100 + PROMOTE_DISTANCE_PX);
    expect(draggingOf(chart)).toBe(true);
    move(chart, 200);
    release(chart, 200);
    expect(onSelect).toHaveBeenCalledWith(2, 6);
  });

  it('selects after a hold followed by a small drag', () => {
    const onSelect = vi.fn();
    const chart = makeChart(onSelect);
    press(chart, 100);
    hold();
    // Under the promotion distance, so only the hold can have promoted this.
    move(chart, 140);
    release(chart, 140);
    expect(onSelect).toHaveBeenCalledWith(2, 4);
  });

  /**
   * The threshold lives in promotion and nowhere else. Release used to apply a
   * second, smaller one, which refused a gesture the reader had already been
   * shown a band for.
   */
  it('does not re-judge travel on release once the press has promoted', () => {
    const onSelect = vi.fn();
    const chart = makeChart(onSelect);
    // 86px and 89px straddle the boundary between index 1 and index 2, so this
    // is three pixels of travel across two months.
    press(chart, 86);
    hold();
    move(chart, 89);
    release(chart, 89);
    expect(onSelect).toHaveBeenCalledWith(1, 2);
  });

  it('cancels the hold once distance has promoted the press', () => {
    const chart = makeChart();
    press(chart, 100);
    move(chart, 100 + PROMOTE_DISTANCE_PX);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('asks for a repaint when the hold promotes, so the rule can appear', () => {
    const chart = makeChart();
    press(chart, 100);
    expect(chart.render).not.toHaveBeenCalled();
    hold();
    expect(chart.render).toHaveBeenCalled();
  });

  it('demotes and drops the timer when the cursor leaves the canvas', () => {
    const chart = makeChart();
    press(chart, 100);
    afterEvent(chart, { event: { type: 'mouseout', x: 100 }, inChartArea: false }, {});
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(PROMOTE_HOLD_MS * 2);
    expect(draggingOf(chart)).toBe(false);
  });

  /** A chart torn down mid-hold would otherwise fire into a dead instance. */
  it('drops the timer when the chart is destroyed', () => {
    const chart = makeChart();
    press(chart, 100);
    expect(vi.getTimerCount()).toBe(1);
    beforeDestroy(chart, {}, {});
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('click suppression after a drag', () => {
  /**
   * Chart.js fires `click` after `mouseup`. Without this the gesture that just
   * re-ranged the chart would also pin a tooltip on whatever month it ended on.
   */
  it('suppresses the click that ends a completed drag', () => {
    const { chart } = drag(100, 200);
    expect(consumeDragSuppression(chart as never)).toBe(true);
  });

  it('only suppresses once', () => {
    const { chart } = drag(100, 200);
    consumeDragSuppression(chart as never);
    expect(consumeDragSuppression(chart as never)).toBe(false);
  });

  it('does not suppress a plain click', () => {
    const chart = makeChart();
    press(chart, 100);
    release(chart, 101);
    expect(consumeDragSuppression(chart as never)).toBe(false);
  });
});

describe('the drag band', () => {
  it('paints a band between the two edges while dragging', () => {
    const chart = makeChart();
    press(chart, 100);
    // Past the promotion distance, so the press is a drag by the time it draws.
    move(chart, 100 + PROMOTE_DISTANCE_PX);
    afterDraw(chart, {}, {});
    expect(chart.ctx.fillRect).toHaveBeenCalledWith(
      100,
      10,
      PROMOTE_DISTANCE_PX,
      190,
    );
  });

  it('tracks the pointer as a promoted drag continues', () => {
    const chart = makeChart();
    press(chart, 100);
    move(chart, 200);
    afterDraw(chart, {}, {});
    expect(chart.ctx.fillRect).toHaveBeenCalledWith(100, 10, 100, 190);
  });

  it('paints nothing once the drag is released', () => {
    const chart = makeChart();
    press(chart, 100);
    move(chart, 200);
    release(chart, 200);
    afterDraw(chart, {}, {});
    expect(chart.ctx.fillRect).not.toHaveBeenCalled();
  });

  it('paints nothing when no drag has started', () => {
    const chart = makeChart();
    afterDraw(chart, {}, {});
    expect(chart.ctx.fillRect).not.toHaveBeenCalled();
  });

  /** The whole point of promotion: a click flashes no band on its way past. */
  it('paints nothing while a press is still unpromoted', () => {
    const chart = makeChart();
    press(chart, 100);
    move(chart, 110);
    afterDraw(chart, {}, {});
    expect(chart.ctx.fillRect).not.toHaveBeenCalled();
    expect(chart.ctx.stroke).not.toHaveBeenCalled();
  });

  /**
   * The promotion feedback for a stationary hold. Without it the reader holding
   * still has nothing telling them the gesture took before they move.
   */
  it('paints the start rule when a hold promotes with no movement', () => {
    const chart = makeChart();
    press(chart, 100);
    hold();
    afterDraw(chart, {}, {});
    expect(chart.ctx.fillRect).not.toHaveBeenCalled();
    expect(chart.ctx.moveTo).toHaveBeenCalledWith(100, 10);
    expect(chart.ctx.lineTo).toHaveBeenCalledWith(100, 200);
    expect(chart.ctx.stroke).toHaveBeenCalled();
  });
});
