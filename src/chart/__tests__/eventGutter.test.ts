import { describe, it, expect, vi } from 'vitest';
import colors from 'tailwindcss/colors';
import { eventGutterPlugin, groupEventsByMonthIndex } from '../eventGutter';
import type { EventCategory, TransitEvent } from '../../@types/events.types';
import { makeTransitEvent } from '../../test/builders';

// Called as methods on the plugin object, not extracted from it, so the
// unbound-method rule stays satisfied.
type AfterDraw = (chart: unknown, args: unknown, opts: unknown) => void;
type GutterEventArgs = {
  event: { type: string; x?: number | null; y?: number | null };
  inChartArea: boolean;
};
type AfterEvent = (chart: unknown, args: GutterEventArgs, opts: unknown) => void;
const plugin = eventGutterPlugin as unknown as {
  afterDraw: AfterDraw;
  afterEvent: AfterEvent;
};
const afterDraw: AfterDraw = (chart, args, opts) =>
  plugin.afterDraw(chart, args, opts);
const afterEvent: AfterEvent = (chart, args, opts) =>
  plugin.afterEvent(chart, args, opts);

const makeCtx = () => ({
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  // Typed so `.mock.calls` yields numbers rather than any, which the geometry
  // assertions below compare against.
  moveTo: vi.fn<(x: number, y: number) => void>(),
  lineTo: vi.fn<(x: number, y: number) => void>(),
  arc: vi.fn<
    (x: number, y: number, radius: number, start: number, end: number) => void
  >(),
  fill: vi.fn(),
  stroke: vi.fn(),
  setLineDash: vi.fn(),
  lineWidth: 0,
  strokeStyle: '',
  fillStyle: '',
});

/** Twelve months of 2020, the axis every case here draws against. */
const LABELS = Array.from({ length: 12 }, (_, i) => `2020 ${i + 1}`);

type ChartOverrides = {
  focusedIndex?: number | null;
  highlightedIndex?: number | null;
  onGutterClick?: (index: number) => void;
  onGutterHover?: (index: number | null) => void;
};

const makeChart = (events: TransitEvent[], options: ChartOverrides = {}) => ({
  options: { plugins: { eventGutter: { transitEvents: events, ...options } } },
  data: { labels: LABELS },
  scales: {
    x: {
      getPixelForValue: (i: number) => 50 + i * 25,
      getValueForPixel: (px: number) => (px - 50) / 25,
    },
  },
  chartArea: { top: 10, bottom: 200, left: 0, right: 400 },
  ctx: makeCtx(),
});

/** The baseline the gutter must never paint on. See `makeChart`. */
const AXIS_BASELINE = 200;

/** Every (x, y) the plugin painted, across all three path primitives. */
const pointsFor = (events: TransitEvent[], options?: ChartOverrides) => {
  const chart = makeChart(events, options);
  afterDraw(chart, {}, {});
  return [
    ...chart.ctx.moveTo.mock.calls,
    ...chart.ctx.lineTo.mock.calls,
    ...chart.ctx.arc.mock.calls.map(([x, y]) => [x, y] as [number, number]),
  ].map(([x, y]) => ({ x, y }));
};

/**
 * One triangle per `beginPath`, as {apex, left, right} — the plugin draws each
 * as moveTo(apex) then lineTo(right) then lineTo(left).
 */
const trianglesFor = (events: TransitEvent[], options?: ChartOverrides) => {
  const chart = makeChart(events, options);
  afterDraw(chart, {}, {});
  const apexes = chart.ctx.moveTo.mock.calls;
  const corners = chart.ctx.lineTo.mock.calls;
  return apexes.map((apex, i) => {
    const right = corners[i * 2];
    const left = corners[i * 2 + 1];
    return {
      apexX: apex[0],
      apexY: apex[1],
      baseY: left[1],
      width: right[0] - left[0],
      height: left[1] - apex[1],
    };
  });
};

/** The fillStyle in force at each fill() — one per triangle. */
const fillsFor = (events: TransitEvent[], options?: ChartOverrides) => {
  const chart = makeChart(events, options);
  const fills: string[] = [];
  chart.ctx.fill = vi.fn(() => {
    fills.push(chart.ctx.fillStyle);
  });
  afterDraw(chart, {}, {});
  return fills;
};

const eventAt = (month: number, overrides: Partial<TransitEvent> = {}) =>
  makeTransitEvent({
    id: `event-${month}-${overrides.category ?? 'service_change'}`,
    date: `2020-${String(month).padStart(2, '0')}`,
    ...overrides,
  });

describe('groupEventsByMonthIndex', () => {
  it('keys events by their index on the axis', () => {
    const grouped = groupEventsByMonthIndex([eventAt(3)], LABELS);
    expect([...grouped.keys()]).toEqual([2]);
  });

  it('collects several events in one month under one key', () => {
    const grouped = groupEventsByMonthIndex(
      [eventAt(3, { id: 'a' }), eventAt(3, { id: 'b' })],
      LABELS,
    );
    expect(grouped.get(2)).toHaveLength(2);
  });

  it('drops events whose month is off the axis', () => {
    const grouped = groupEventsByMonthIndex(
      [makeTransitEvent({ date: '2019-04' })],
      LABELS,
    );
    expect(grouped.size).toBe(0);
  });

  it('leaves months without events absent rather than empty', () => {
    const grouped = groupEventsByMonthIndex([eventAt(1)], LABELS);
    expect(grouped.has(5)).toBe(false);
  });
});

describe('event gutter triangles', () => {
  /**
   * The regression this whole change exists to prevent, and the reason it is
   * asserted here rather than left to a screenshot: a Line reporting zero riders
   * is drawn along `chartArea.bottom`, so anything the gutter paints on that row
   * hides it. The D Line's flat run from 2020-07 to 2025-07 is the case that
   * surfaced it, and no pixel budget can articulate "not on this one row".
   */
  it('paints nothing on the axis baseline', () => {
    const painted = pointsFor([
      eventAt(3),
      eventAt(5, { id: 'a', category: 'opening' }),
      eventAt(5, { id: 'b', category: 'closure' }),
    ]);
    expect(painted).not.toHaveLength(0);
    painted.forEach((point) => {
      expect(point.y).toBeGreaterThan(AXIS_BASELINE);
    });
  });

  it("centres a month's triangle on its position on the axis", () => {
    // Month 3 is index 2 → getPixelForValue(2) = 100.
    const [triangle] = trianglesFor([eventAt(3)]);
    expect(triangle.apexX).toBe(100);
  });

  it('points the triangle up, apex nearest the axis', () => {
    const [triangle] = trianglesFor([eventAt(3)]);
    expect(triangle.apexY).toBeGreaterThan(AXIS_BASELINE);
    expect(triangle.baseY).toBeGreaterThan(triangle.apexY);
  });

  it('draws one triangle for a single-category month', () => {
    expect(trianglesFor([eventAt(3)])).toHaveLength(1);
  });

  it('draws a larger triangle for a month holding more than one event', () => {
    const [single] = trianglesFor([eventAt(3)]);
    const [multi] = trianglesFor([
      eventAt(3, { id: 'a' }),
      eventAt(3, { id: 'b' }),
    ]);
    expect(multi.width).toBeGreaterThan(single.width);
    expect(multi.height).toBeGreaterThan(single.height);
  });

  it('enlarges the focused month', () => {
    const [plain] = trianglesFor([eventAt(3)]);
    const [focused] = trianglesFor([eventAt(3)], { focusedIndex: 2 });
    expect(focused.width).toBeGreaterThan(plain.width);
    expect(focused.height).toBeGreaterThan(plain.height);
  });

  it('enlarges the month highlighted from the context log', () => {
    const [plain] = trianglesFor([eventAt(3)]);
    const [highlighted] = trianglesFor([eventAt(3)], { highlightedIndex: 2 });
    expect(highlighted.width).toBeGreaterThan(plain.width);
  });

  it('leaves other months at their base size when one is focused', () => {
    const [focused, other] = trianglesFor([eventAt(3), eventAt(7)], {
      focusedIndex: 2,
    });
    expect(focused.width).toBeGreaterThan(other.width);
  });

  it('rings each triangle in the page background so it reads over the axis rule', () => {
    const chart = makeChart([eventAt(3)]);
    const strokes: string[] = [];
    chart.ctx.stroke = vi.fn(() => {
      strokes.push(chart.ctx.strokeStyle);
    });
    afterDraw(chart, {}, {});
    expect(strokes).toEqual([colors.stone['50']]);
  });

  it('draws nothing when no event lands on the axis', () => {
    const chart = makeChart([makeTransitEvent({ date: '2019-04' })]);
    afterDraw(chart, {}, {});
    expect(chart.ctx.moveTo).not.toHaveBeenCalled();
  });

  it('caches the grouping on the chart for the click handler', () => {
    const chart = makeChart([eventAt(3)]) as ReturnType<typeof makeChart> & {
      $eventsByIndex?: Map<number, TransitEvent[]>;
    };
    afterDraw(chart, {}, {});
    expect(chart.$eventsByIndex?.get(2)).toHaveLength(1);
  });
});

/**
 * Months sit roughly fifteen pixels apart at a full desktop window, so a mixed
 * month wider than the cap bleeds into its neighbours and the reader can no
 * longer tell which month a triangle belongs to.
 */
describe('event gutter mixed-category months', () => {
  const GROUP_WIDTH_CAP = 14;

  /** Total painted extent of a month's group, gaps included. */
  const groupWidth = (triangles: ReturnType<typeof trianglesFor>) => {
    const lefts = triangles.map((t) => t.apexX - t.width / 2);
    const rights = triangles.map((t) => t.apexX + t.width / 2);
    return Math.max(...rights) - Math.min(...lefts);
  };

  it('draws one triangle per distinct category', () => {
    const triangles = trianglesFor([
      eventAt(3, { id: 'a', category: 'opening' }),
      eventAt(3, { id: 'b', category: 'fare_change' }),
    ]);
    expect(triangles).toHaveLength(2);
  });

  it('keeps a mixed month inside the width cap', () => {
    const triangles = trianglesFor([
      eventAt(3, { id: 'a', category: 'opening' }),
      eventAt(3, { id: 'b', category: 'fare_change' }),
    ]);
    expect(groupWidth(triangles)).toBeLessThanOrEqual(GROUP_WIDTH_CAP);
  });

  it('shares one baseline across the group', () => {
    const triangles = trianglesFor([
      eventAt(3, { id: 'a', category: 'opening' }),
      eventAt(3, { id: 'b', category: 'fare_change' }),
    ]);
    expect(triangles[0].baseY).toBe(triangles[1].baseY);
  });

  it('centres the group on the month', () => {
    const triangles = trianglesFor([
      eventAt(3, { id: 'a', category: 'opening' }),
      eventAt(3, { id: 'b', category: 'fare_change' }),
    ]);
    const lefts = triangles.map((t) => t.apexX - t.width / 2);
    const rights = triangles.map((t) => t.apexX + t.width / 2);
    const centre = (Math.min(...lefts) + Math.max(...rights)) / 2;
    expect(centre).toBeCloseTo(100);
  });

  /**
   * The data holds nine categories but has never put more than two in one month
   * — 2020-12 and 2023-06 are the only mixed ones. The cap must degrade rather
   * than assume that, so this synthesises the month the data has not produced.
   */
  it('holds the cap for a month carrying three categories', () => {
    const triangles = trianglesFor([
      eventAt(3, { id: 'a', category: 'opening' }),
      eventAt(3, { id: 'b', category: 'fare_change' }),
      eventAt(3, { id: 'c', category: 'closure' }),
    ]);
    expect(triangles).toHaveLength(3);
    expect(groupWidth(triangles)).toBeLessThanOrEqual(GROUP_WIDTH_CAP);
  });

  it('holds the cap for a month carrying every category at once', () => {
    const triangles = trianglesFor(
      ALL_CATEGORIES.map((category, i) =>
        eventAt(3, { id: `all-${i}`, category }),
      ),
    );
    expect(triangles).toHaveLength(ALL_CATEGORIES.length);
    expect(groupWidth(triangles)).toBeLessThanOrEqual(GROUP_WIDTH_CAP);
  });

  it('still paints nothing on the axis baseline when capped', () => {
    const painted = pointsFor(
      ALL_CATEGORIES.map((category, i) =>
        eventAt(3, { id: `all-${i}`, category }),
      ),
    );
    painted.forEach((point) => {
      expect(point.y).toBeGreaterThan(AXIS_BASELINE);
    });
  });
});

/**
 * Chart.js dispatches `onClick` only inside `chartArea` and does not retarget a
 * hover outside it, so the gutter resolves its own pointer events. See ADR-0010.
 */
describe('event gutter hit-testing', () => {
  const below = (type: string, x: number) => ({
    event: { type, x, y: AXIS_BASELINE + 8 },
    inChartArea: false,
  });

  it('pins the month under a click below the axis', () => {
    const onGutterClick = vi.fn();
    const chart = makeChart([eventAt(3)], { onGutterClick });
    afterEvent(chart, below('click', 100), {});
    expect(onGutterClick).toHaveBeenCalledWith(2);
  });

  it('reports the month under a hover below the axis', () => {
    const onGutterHover = vi.fn();
    const chart = makeChart([eventAt(3)], { onGutterHover });
    afterEvent(chart, below('mousemove', 100), {});
    expect(onGutterHover).toHaveBeenCalledWith(2);
  });

  /** Two routes to one pin is the thing ADR-0010 exists to prevent. */
  it('stays silent inside the plot, where Chart.js already dispatches', () => {
    const onGutterClick = vi.fn();
    const onGutterHover = vi.fn();
    const chart = makeChart([eventAt(3)], { onGutterClick, onGutterHover });
    afterEvent(
      chart,
      { event: { type: 'click', x: 100, y: 150 }, inChartArea: true },
      {},
    );
    afterEvent(
      chart,
      { event: { type: 'mousemove', x: 100, y: 150 }, inChartArea: true },
      {},
    );
    expect(onGutterClick).not.toHaveBeenCalled();
    expect(onGutterHover).not.toHaveBeenCalled();
  });

  /** The margins left and right of the plot are not the gutter. */
  it('stays silent outside the plot but above the axis', () => {
    const onGutterClick = vi.fn();
    const chart = makeChart([eventAt(3)], { onGutterClick });
    afterEvent(
      chart,
      { event: { type: 'click', x: 100, y: AXIS_BASELINE }, inChartArea: false },
      {},
    );
    expect(onGutterClick).not.toHaveBeenCalled();
  });

  it('clears the hover when the pointer leaves the canvas', () => {
    const onGutterHover = vi.fn();
    const chart = makeChart([eventAt(3)], { onGutterHover });
    afterEvent(
      chart,
      { event: { type: 'mouseout', x: null, y: null }, inChartArea: false },
      {},
    );
    expect(onGutterHover).toHaveBeenCalledWith(null);
  });

  it('clamps a click past the end of the axis to the last month', () => {
    const onGutterClick = vi.fn();
    const chart = makeChart([eventAt(3)], { onGutterClick });
    afterEvent(chart, below('click', 5000), {});
    expect(onGutterClick).toHaveBeenCalledWith(LABELS.length - 1);
  });

  it('resolves a month with no event, as the axis strip always did', () => {
    const onGutterClick = vi.fn();
    const chart = makeChart([eventAt(3)], { onGutterClick });
    afterEvent(chart, below('click', 175), {});
    expect(onGutterClick).toHaveBeenCalledWith(5);
  });
});

/**
 * The palette contract, restated independently of the plugin so the tests fail
 * on a table edit rather than following it. Order is `EventCategory`'s own, and
 * the list is exhaustive by construction — `Record<EventCategory, …>` means
 * adding a tenth category to the union breaks this file at compile time, which
 * is how a new category gets a color instead of silently inheriting the default.
 */
const EXPECTED_HUE: Record<EventCategory, { '500': string }> = {
  opening: colors.emerald,
  extension: colors.teal,
  closure: colors.red,
  route_change: colors.violet,
  headway_change: colors.amber,
  hours_change: colors.orange,
  fare_change: colors.sky,
  disruption: colors.rose,
  service_change: colors.slate,
};

const ALL_CATEGORIES = Object.keys(EXPECTED_HUE) as EventCategory[];

describe('event gutter category colors', () => {
  /** One category per month, so fill N in the log is category N. */
  const oneEachMonth = (categories: EventCategory[]) =>
    categories.map((category, i) => eventAt(i + 1, { category }));

  it('fills every category in its own hue', () => {
    expect(fillsFor(oneEachMonth(ALL_CATEGORIES))).toEqual(
      ALL_CATEGORIES.map((category) => EXPECTED_HUE[category]['500']),
    );
  });

  /**
   * The mutation guard. The assertion above pins the table row by row, but only
   * this one fails when two categories are collapsed onto a shared color — the
   * regression the nine-hue palette exists to prevent, and the one a grouped
   * palette cannot express.
   */
  it('gives no two categories the same gutter color', () => {
    const fills = fillsFor(oneEachMonth(ALL_CATEGORIES));
    expect(new Set(fills).size).toBe(ALL_CATEGORIES.length);
  });

  it('falls back to slate for a category outside the union', () => {
    // Events are fetched data, so an unknown category can dodge the type at runtime.
    const rogue = 'not_a_real_category' as EventCategory;
    expect(fillsFor([eventAt(1, { category: rogue })])).toEqual([
      colors.slate['500'],
    ]);
  });

  /**
   * A month can mix categories, and the palette is the only thing carrying
   * category on the chart. One triangle per category keeps a mixed month visibly
   * mixed rather than silently reporting whichever event happened to sort first.
   */
  it('gives a mixed month one triangle per category present', () => {
    const fills = fillsFor([
      eventAt(3, { id: 'a', category: 'opening' }),
      eventAt(3, { id: 'b', category: 'fare_change' }),
    ]);
    expect(fills).toEqual([colors.emerald['500'], colors.sky['500']]);
  });

  it('draws one triangle, not two, when a month repeats a category', () => {
    const fills = fillsFor([
      eventAt(3, { id: 'a', category: 'opening' }),
      eventAt(3, { id: 'b', category: 'opening' }),
    ]);
    expect(fills).toEqual([colors.emerald['500']]);
  });
});
