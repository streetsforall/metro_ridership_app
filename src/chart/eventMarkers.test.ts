import { describe, it, expect, vi } from 'vitest';
import colors from 'tailwindcss/colors';
import { eventMarkersPlugin, groupEventsByMonthIndex } from './eventMarkers';
import type { EventCategory, TransitEvent } from '../@types/events.types';
import { makeTransitEvent } from '../test/builders';

// Called as a method on the plugin object, not extracted from it, so the
// unbound-method rule stays satisfied.
type AfterDraw = (chart: unknown, args: unknown, opts: unknown) => void;
const plugin = eventMarkersPlugin as unknown as { afterDraw: AfterDraw };
const afterDraw: AfterDraw = (chart, args, opts) =>
  plugin.afterDraw(chart, args, opts);

const makeCtx = () => ({
  save: vi.fn(),
  restore: vi.fn(),
  beginPath: vi.fn(),
  closePath: vi.fn(),
  moveTo: vi.fn(),
  lineTo: vi.fn(),
  // Typed so `arc.mock.calls` yields numbers rather than any, which the
  // geometry assertions below compare against.
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

const makeChart = (
  events: TransitEvent[],
  options: { focusedIndex?: number | null; highlightedIndex?: number | null } = {},
) => ({
  options: { plugins: { eventMarkers: { events, ...options } } },
  data: { labels: LABELS },
  scales: { x: { getPixelForValue: (i: number) => 50 + i * 25 } },
  chartArea: { top: 10, bottom: 200, left: 0, right: 400 },
  ctx: makeCtx(),
});

/** The fillStyle in force at each fill() — one per dot, or per wedge. */
const fillsFor = (
  events: TransitEvent[],
  options?: { focusedIndex?: number | null; highlightedIndex?: number | null },
) => {
  const chart = makeChart(events, options);
  const fills: string[] = [];
  chart.ctx.fill = vi.fn(() => {
    fills.push(chart.ctx.fillStyle);
  });
  afterDraw(chart, {}, {});
  return fills;
};

/** The (x, y, radius) of each arc drawn, ring included. */
const arcsFor = (
  events: TransitEvent[],
  options?: { focusedIndex?: number | null; highlightedIndex?: number | null },
) => {
  const chart = makeChart(events, options);
  afterDraw(chart, {}, {});
  return chart.ctx.arc.mock.calls.map(([x, y, r]) => ({ x, y, r }));
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

describe('event marker dots', () => {
  it('draws the dot on the x-axis baseline at the month position', () => {
    // Month 3 is index 2 → getPixelForValue(2) = 100; baseline is chartArea.bottom.
    const [dot] = arcsFor([eventAt(3)]);
    expect(dot.x).toBe(100);
    expect(dot.y).toBe(200);
  });

  /**
   * The regression the dots exist to prevent. A full-height rule is a moveTo to
   * chartArea.top followed by a lineTo to the bottom; a single-category dot
   * touches neither, so this fails the moment one comes back.
   */
  it('draws no vertical rule through the plot', () => {
    const chart = makeChart([eventAt(3)]);
    afterDraw(chart, {}, {});
    expect(chart.ctx.lineTo).not.toHaveBeenCalled();
    expect(chart.ctx.moveTo).not.toHaveBeenCalled();
  });

  it('draws one dot and one ring for a single-event month', () => {
    expect(arcsFor([eventAt(3)])).toHaveLength(2);
  });

  it('draws a larger dot for a month holding more than one event', () => {
    const [single] = arcsFor([eventAt(3)]);
    const [multi] = arcsFor([
      eventAt(3, { id: 'a' }),
      eventAt(3, { id: 'b' }),
    ]);
    expect(multi.r).toBeGreaterThan(single.r);
  });

  it('enlarges the focused month', () => {
    const [plain] = arcsFor([eventAt(3)]);
    const [focused] = arcsFor([eventAt(3)], { focusedIndex: 2 });
    expect(focused.r).toBe(plain.r + 2);
  });

  it('enlarges the month highlighted from the context log', () => {
    const [plain] = arcsFor([eventAt(3)]);
    const [highlighted] = arcsFor([eventAt(3)], { highlightedIndex: 2 });
    expect(highlighted.r).toBe(plain.r + 2);
  });

  it('leaves other months at their base size when one is focused', () => {
    const dots = arcsFor([eventAt(3), eventAt(7)], { focusedIndex: 2 });
    // [dot, ring] per month, in insertion order.
    expect(dots[0].r).toBeGreaterThan(dots[2].r);
  });

  it('rings the dot in the page background so it reads over the axis rule', () => {
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
    expect(chart.ctx.arc).not.toHaveBeenCalled();
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
 * The palette contract, restated independently of the plugin so the tests fail
 * on a table edit rather than following it. Order is `EventCategory`'s own, and
 * the list is exhaustive by construction — `Record<EventCategory, …>` means
 * adding a tenth category to the union breaks this file at compile time, which
 * is how a new category gets a color instead of silently inheriting the default.
 */
const EXPECTED_HUE: Record<EventCategory, { '400': string; '500': string }> = {
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

describe('event marker category colors', () => {
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
  it('gives no two categories the same marker color', () => {
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
   * category on the chart. Splitting the dot keeps a mixed month visibly mixed
   * rather than silently reporting whichever event happened to sort first.
   */
  it('splits a mixed month into one wedge per category present', () => {
    const fills = fillsFor([
      eventAt(3, { id: 'a', category: 'opening' }),
      eventAt(3, { id: 'b', category: 'fare_change' }),
    ]);
    expect(fills).toEqual([colors.emerald['500'], colors.sky['500']]);
  });

  it('draws one wedge, not two, when a month repeats a category', () => {
    const fills = fillsFor([
      eventAt(3, { id: 'a', category: 'opening' }),
      eventAt(3, { id: 'b', category: 'opening' }),
    ]);
    expect(fills).toEqual([colors.emerald['500']]);
  });
});
