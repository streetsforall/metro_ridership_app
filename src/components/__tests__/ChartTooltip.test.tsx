import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ChartDataset } from 'chart.js';
import colors from 'tailwindcss/colors';
import ChartTooltip from '../ChartTooltip';
import type { CustomChartData } from '../../@types/chart.types';
import { makeTransitEvent } from '../../test/builders';

const months = ['2020 5', '2020 6', '2020 7'];

const dataset = (
  label: string,
  stats: (number | null)[],
  borderColor: string,
): ChartDataset<'line', CustomChartData[]> => ({
  label,
  borderColor,
  backgroundColor: borderColor,
  data: stats.map((stat, i) => ({ time: months[i], stat })),
});

const datasets = [
  dataset('A Line', [5000, 8000, 3000], '#0072bc'),
  dataset('B Line', [9000, 2000, 4000], '#e01e5a'),
];

const renderTooltip = (props: Partial<Parameters<typeof ChartTooltip>[0]> = {}) =>
  render(
    <ChartTooltip
      index={1}
      months={months}
      datasets={datasets}
      events={[]}
      caret={{ x: 100, y: 20 }}
      containerWidth={600}
      plotHeight={300}
      isPinned={false}
      {...props}
    />,
  );

describe('ChartTooltip visibility', () => {
  it('renders nothing without an active month', () => {
    renderTooltip({ index: null });
    expect(screen.queryByTestId('chart-tooltip')).toBeNull();
  });

  it('renders nothing before the chart reports a caret position', () => {
    renderTooltip({ caret: null });
    expect(screen.queryByTestId('chart-tooltip')).toBeNull();
  });

  /** An index past the axis is what a stale hover looks like mid-rerender. */
  it('renders nothing for an index the axis does not have', () => {
    renderTooltip({ index: 9 });
    expect(screen.queryByTestId('chart-tooltip')).toBeNull();
  });
});

describe('ChartTooltip ridership rows', () => {
  it('heads the tooltip with the readable month', () => {
    renderTooltip();
    expect(screen.getByText('Jun 2020')).toBeTruthy();
  });

  it('lists each line with its ridership for that month', () => {
    renderTooltip();
    expect(screen.getByText('A Line')).toBeTruthy();
    expect(screen.getByText('8,000')).toBeTruthy();
    expect(screen.getByText('2,000')).toBeTruthy();
  });

  it('orders the rows by ridership, highest first', () => {
    renderTooltip();
    const labels = screen
      .getByTestId('chart-tooltip')
      .querySelectorAll('li span:nth-child(2)');
    expect([...labels].map((el) => el.textContent)).toEqual(['A Line', 'B Line']);
  });

  it('reorders when a different month reverses the ranking', () => {
    renderTooltip({ index: 0 });
    const labels = screen
      .getByTestId('chart-tooltip')
      .querySelectorAll('li span:nth-child(2)');
    expect([...labels].map((el) => el.textContent)).toEqual(['B Line', 'A Line']);
  });

  /** A gap in a line's coverage is not a zero, so it gets no row at all. */
  it('omits a line with no record for the month', () => {
    renderTooltip({
      index: 1,
      datasets: [dataset('A Line', [5000, null, 3000], '#0072bc')],
    });
    expect(screen.queryByText('A Line')).toBeNull();
  });
});

describe('ChartTooltip event context', () => {
  const opening = makeTransitEvent({
    id: 'regional-connector',
    date: '2020-06',
    title: 'Regional Connector Opening',
    description: 'Linked the A, C, E and L lines through a new downtown tunnel.',
    category: 'opening',
    source: 'https://example.com/connector',
  });

  /**
   * The entry has no role and no accessible name of its own, so the divider it
   * is separated by is the only handle on it. Named once here rather than spelt
   * out at each use, so a change to how entries are divided is one edit.
   */
  const eventEntry = (container: HTMLElement) =>
    container.querySelector<HTMLElement>('.border-t');

  it('shows no event section for a month with nothing in it', () => {
    const { container } = renderTooltip();
    expect(eventEntry(container)).toBeNull();
  });

  /**
   * The whole point of the move off the canvas: the ridership figures and the
   * reason they moved are now in one box, reachable from anywhere in the column.
   */
  it('shows the event title and description alongside the ridership rows', () => {
    renderTooltip({ events: [opening] });
    expect(screen.getByText('Regional Connector Opening')).toBeTruthy();
    expect(screen.getByText(/downtown tunnel/)).toBeTruthy();
    expect(screen.getByText('8,000')).toBeTruthy();
  });

  it('carries the category as a chip rather than text after the date', () => {
    renderTooltip({ events: [opening] });
    expect(screen.getByText('Opening')).toBeTruthy();
    expect(screen.queryByText(/·/)).toBeNull();
  });

  /** `within` the entry, because the tooltip's own heading reads "Jun 2020" too. */
  it('still shows the event date', () => {
    const { container } = renderTooltip({ events: [opening] });
    const entry = eventEntry(container) as HTMLElement;
    expect(within(entry).getByText('Jun 2020')).toBeTruthy();
  });

  /** The chip is drawn on the tooltip's stone-800, not the panel's white. */
  it('draws the chip on its dark surface', () => {
    renderTooltip({ events: [opening] });
    const chip = screen.getByText('Opening');
    const expected = document.createElement('div');
    expected.style.backgroundColor = colors.emerald['900'];
    expected.style.color = colors.emerald['200'];
    expect(chip.style.backgroundColor).toBe(expected.style.backgroundColor);
    expect(chip.style.color).toBe(expected.style.color);
  });

  /**
   * Colour says one thing here. A tinted title made it say two — which category
   * this is, and where the title ends — while the category itself sat as grey
   * text after the date.
   */
  it('leaves the title neutral, with no category tint', () => {
    renderTooltip({ events: [opening] });
    expect(screen.getByText('Regional Connector Opening').style.color).toBe('');
  });

  /** Title, then chip and date, then description. */
  it('reads title first, with the chip and date beneath it', () => {
    const { container } = renderTooltip({ events: [opening] });
    const entry = eventEntry(container) as HTMLElement;
    const title = screen.getByText('Regional Connector Opening');
    const chipRow = screen.getByText('Opening').parentElement as HTMLElement;
    const description = screen.getByText(/downtown tunnel/);
    expect([...entry.children]).toEqual([title, chipRow, description]);
  });

  /**
   * A Month holding several used to stack them all, which on a busy Month made
   * the readout tall enough to bury the series it annotates. They are a
   * carousel now — see the block at the end of this file for the stepping.
   */
  it('shows one event at a time in a month that holds more than one', () => {
    renderTooltip({
      events: [
        opening,
        makeTransitEvent({ id: 'fare', date: '2020-06', title: 'Fare change' }),
      ],
    });
    expect(screen.getByText('Regional Connector Opening')).toBeTruthy();
    expect(screen.queryByText('Fare change')).toBeNull();
    // And one chip, for the one event — the second keeps the builder's
    // `service_change`, so a leaked entry would show that label too.
    expect(screen.getByText('Opening')).toBeTruthy();
    expect(screen.queryByText('Service change')).toBeNull();
  });
});

describe('ChartTooltip pinning', () => {
  const withSource = makeTransitEvent({ source: 'https://example.com/connector' });

  /** A hovering box that accepts the pointer steals the hover that spawned it. */
  it('ignores the pointer while it is only hovering', () => {
    renderTooltip();
    expect(
      screen.getByTestId('chart-tooltip').className.includes('pointer-events-none'),
    ).toBe(true);
  });

  it('accepts the pointer once pinned, so links are clickable', () => {
    renderTooltip({ isPinned: true });
    expect(
      screen.getByTestId('chart-tooltip').className.includes('pointer-events-auto'),
    ).toBe(true);
  });

  it('offers the source link only when pinned', () => {
    renderTooltip({ events: [withSource] });
    expect(screen.queryByRole('link', { name: 'Source' })).toBeNull();

    renderTooltip({ events: [withSource], isPinned: true });
    expect(
      screen.getByRole('link', { name: 'Source' }).getAttribute('href'),
    ).toBe('https://example.com/connector');
  });

  it('says how to unpin', () => {
    renderTooltip({ isPinned: true });
    expect(screen.getByText(/press Esc to unpin/)).toBeTruthy();
  });

  /**
   * Under the release-first rule a click on *any* month releases, not only the
   * one pinned — but a click landing on no month asks for nothing and the pin
   * survives, so the hint may not promise "anywhere" either. See ADR-0011.
   */
  it('names a month as what to click, rather than promising anywhere', () => {
    renderTooltip({ isPinned: true });
    expect(screen.getByText(/Click any month/)).toBeTruthy();
    expect(screen.queryByText(/Click anywhere/)).toBeNull();
    expect(screen.queryByText(/Click again/)).toBeNull();
  });

  /**
   * The clamped description and the missing source link are both undone by
   * pinning, and nothing on screen said so — a reader who hit a truncated
   * description had no reason to believe there was more.
   */
  it('advertises the pin while hovering a month that has an event', () => {
    renderTooltip({ events: [makeTransitEvent({ date: '2020-06' })] });
    expect(screen.getByText(/Click to pin/)).toBeTruthy();
  });

  /** Noise on an ordinary month, where clicking reveals nothing further. */
  it('leaves the hint off a month with no event', () => {
    renderTooltip({ events: [] });
    expect(screen.queryByText(/Click to pin/)).toBeNull();
  });

  it('replaces the hint with how to unpin once pinned', () => {
    renderTooltip({
      events: [makeTransitEvent({ date: '2020-06' })],
      isPinned: true,
    });
    expect(screen.queryByText(/Click to pin/)).toBeNull();
    expect(screen.getByText(/press Esc to unpin/)).toBeTruthy();
  });

  /**
   * Unclamped, a long description makes the box taller than half the plot and
   * buries the series it is annotating under the cursor. Pinning is the reader
   * asking for the whole thing.
   */
  it('clamps a long description while hovering', () => {
    renderTooltip({
      events: [makeTransitEvent({ date: '2020-06', description: 'A long story.' })],
    });
    expect(screen.getByText('A long story.').className).toContain('line-clamp-3');
  });

  it('shows the description in full once pinned', () => {
    renderTooltip({
      events: [makeTransitEvent({ date: '2020-06', description: 'A long story.' })],
      isPinned: true,
    });
    expect(screen.getByText('A long story.').className).not.toContain('line-clamp');
  });
});

/**
 * The rendered box. `screen` would do for a single render, but the placement
 * cases render twice to compare two positions, so this reads from the container
 * the render returned rather than from the shared document.
 */
const boxOf = (props: Partial<Parameters<typeof ChartTooltip>[0]>) => {
  const { container } = renderTooltip(props);
  return container.querySelector<HTMLElement>('[data-testid="chart-tooltip"]')!;
};

describe('ChartTooltip floating placement', () => {
  const leftOf = (props: Partial<Parameters<typeof ChartTooltip>[0]>) =>
    parseFloat(boxOf(props).style.left);

  it('sits to the right of the crosshair when there is room', () => {
    expect(leftOf({ caret: { x: 100, y: 20 } })).toBeGreaterThan(100);
  });

  it('flips to the left of the crosshair near the right edge', () => {
    expect(leftOf({ caret: { x: 580, y: 20 }, containerWidth: 600 })).toBeLessThan(580);
  });

  it('stays inside the plot when the crosshair is at the far left', () => {
    expect(leftOf({ caret: { x: 0, y: 20 } })).toBeGreaterThanOrEqual(8);
  });

  /** The fixed `w-64` the clamp arithmetic above is measured against. */
  it('keeps its fixed width, and does not stretch to the plot', () => {
    const box = boxOf({});
    expect(box.className).toContain('w-64');
    expect(box.style.right).toBe('');
  });
});

/**
 * The mode is this component's decision, taken from the width it is handed —
 * which is why every case here is reached by passing a number rather than by
 * resizing anything.
 *
 * The threshold is spelt out rather than imported, so moving it fails a test
 * rather than quietly moving the test with it.
 */
describe('ChartTooltip strip mode on a narrow chart', () => {
  const STRIP_MAX_WIDTH = 480;
  const narrow = { containerWidth: STRIP_MAX_WIDTH - 1 };

  it('floats at the threshold width', () => {
    expect(boxOf({ containerWidth: STRIP_MAX_WIDTH }).dataset.layout).toBe('floating');
  });

  it('becomes a strip just below it', () => {
    expect(boxOf(narrow).dataset.layout).toBe('strip');
  });

  /** Both edges are the edge padding, so the strip spans the plot. */
  it('spans the plot, with edge padding on both sides', () => {
    const box = boxOf(narrow);
    expect(box.style.left).toBe('8px');
    expect(box.style.right).toBe('8px');
    expect(box.className).not.toContain('w-64');
  });

  /**
   * Wholly above the chart, not on it. `caret.y` would put it on the plot's top
   * edge, where it starts exactly where the series start; the top of the chart
   * box would still put it over the legend.
   */
  it('sits above the chart rather than on any part of it', () => {
    const box = boxOf({ ...narrow, caret: { x: 100, y: 42 } });
    expect(box.style.bottom).toBe('100%');
    expect(box.style.top).toBe('');
  });

  /** Which the floating box does not do: it still follows the crosshair down. */
  it('stays there however far down the plot the crosshair is', () => {
    expect(boxOf({ ...narrow, caret: { x: 100, y: 200 } }).style.bottom).toBe('100%');
  });

  /**
   * No flip and no clamp: a crosshair at either extreme leaves the strip exactly
   * where it was. The arithmetic those two need is what put the floating box
   * over the Month it was describing at phone width in the first place.
   */
  it('does not move with the crosshair', () => {
    const atLeft = boxOf({ ...narrow, caret: { x: 0, y: 20 } });
    const atRight = boxOf({ ...narrow, caret: { x: 470, y: 20 } });
    expect(atLeft.style.left).toBe(atRight.style.left);
    expect(atLeft.style.right).toBe(atRight.style.right);
  });

  it('caps its height at a third of the plot and scrolls beyond it', () => {
    const box = boxOf({ ...narrow, plotHeight: 300 });
    expect(box.style.maxHeight).toBe('100px');
    expect(box.className).toContain('overflow-y-auto');
  });

  /**
   * The case the cap is left holding once the carousel has taken the busy
   * Month: one description long enough to fill the box on its own, which no
   * amount of stepping helps with.
   *
   * jsdom lays nothing out, so this cannot assert a rendered height — what it
   * can assert is that the whole description is in the box and the box is still
   * capped and still scrolls, which is the whole of the rule.
   */
  it('holds its cap for a single very long description', () => {
    // Trimmed, because `getByText` normalises whitespace before comparing and a
    // trailing space would make the lookup miss a node that is plainly there.
    const wall = 'Rerouted. '.repeat(200).trim();
    const box = boxOf({
      ...narrow,
      plotHeight: 300,
      events: [makeTransitEvent({ date: '2020-06', description: wall })],
      isPinned: true,
    });

    expect(within(box).getByText(wall)).toBeTruthy();
    expect(box.style.maxHeight).toBe('100px');
    expect(box.className).toContain('overflow-y-auto');
  });

  it('leaves the floating box uncapped and unscrolled', () => {
    const box = boxOf({ containerWidth: 600, plotHeight: 300 });
    expect(box.style.maxHeight).toBe('');
    expect(box.className).not.toContain('overflow-y-auto');
  });
});

/**
 * The capped box hides whatever does not fit, and nothing on screen said so — a
 * reader who met a strip holding one ridership row had no way to know an event
 * was under it. So the readout offers to open itself, but only when there is
 * something to open it for.
 *
 * "Something to open it for" is measured, not counted: whether the box is
 * scrolling. jsdom lays nothing out and reports every box as 0x0, so the
 * overflow is stubbed onto the prototype for the length of this block — there is
 * no other way to have one.
 */
describe('ChartTooltip expanding a capped readout', () => {
  const overflowing = { scrollHeight: 400, clientHeight: 100 };
  const original: Partial<Record<keyof typeof overflowing, PropertyDescriptor>> = {};
  /**
   * `scrollTop` is stubbed as a real read/write pair rather than a constant,
   * because one of the cases below is about the readout *writing* it. jsdom's
   * own is inert — it accepts a value and reports 0 back.
   */
  let scrollTop = 0;
  let originalScrollTop: PropertyDescriptor | undefined;

  beforeEach(() => {
    for (const [property, value] of Object.entries(overflowing)) {
      original[property as keyof typeof overflowing] =
        Object.getOwnPropertyDescriptor(Element.prototype, property) ?? undefined;
      Object.defineProperty(Element.prototype, property, {
        configurable: true,
        get: () => value,
      });
    }
    scrollTop = 0;
    originalScrollTop =
      Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop') ?? undefined;
    Object.defineProperty(Element.prototype, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    });
  });

  afterEach(() => {
    for (const [property, descriptor] of Object.entries(original)) {
      if (descriptor) Object.defineProperty(Element.prototype, property, descriptor);
    }
    if (originalScrollTop)
      Object.defineProperty(Element.prototype, 'scrollTop', originalScrollTop);
  });

  const narrowPinned = { containerWidth: 479, plotHeight: 300, isPinned: true };

  const toggleIn = (box: HTMLElement) => within(box).queryByRole('button');

  it('offers the control when the box is scrolling something', () => {
    expect(toggleIn(boxOf(narrowPinned))?.textContent).toBe('Expand');
  });

  /**
   * A hovering readout does not accept the pointer, so a control on one is a
   * control the reader can see and cannot press. Pinning is how they reach it —
   * and on touch, where the cap actually bites, a tap pins anyway.
   */
  it('withholds it while the readout is only hovering', () => {
    expect(toggleIn(boxOf({ ...narrowPinned, isPinned: false }))).toBeNull();
  });

  /**
   * No ceiling at all, rather than a larger one. A second cap still clips, so
   * "Expand" would still mean "some of it" — which is the confusion the control
   * was added to remove.
   */
  it('takes the ceiling off entirely, and offers to put it back', () => {
    const box = boxOf(narrowPinned);
    expect(box.style.maxHeight).toBe('100px');

    fireEvent.click(toggleIn(box) as HTMLElement);

    expect(box.style.maxHeight).toBe('');
    expect(box.dataset.expanded).toBe('true');
    expect(toggleIn(box)?.textContent).toBe('Collapse');
  });

  it('collapses again when asked', () => {
    const box = boxOf(narrowPinned);
    fireEvent.click(toggleIn(box) as HTMLElement);
    fireEvent.click(toggleIn(box) as HTMLElement);

    expect(box.style.maxHeight).toBe('100px');
    expect(box.dataset.expanded).toBe('false');
  });

  /** A new Month is a new readout, and it opens the way the last one opened. */
  it('opens collapsed again on a different Month', () => {
    const { container, rerender } = render(
      <ChartTooltip
        index={1}
        months={months}
        datasets={datasets}
        events={[]}
        caret={{ x: 100, y: 20 }}
        {...narrowPinned}
      />,
    );
    const box = container.querySelector<HTMLElement>('[data-testid="chart-tooltip"]')!;
    fireEvent.click(toggleIn(box) as HTMLElement);
    expect(box.dataset.expanded).toBe('true');

    rerender(
      <ChartTooltip
        index={2}
        months={months}
        datasets={datasets}
        events={[]}
        caret={{ x: 100, y: 20 }}
        {...narrowPinned}
      />,
    );
    expect(box.dataset.expanded).toBe('false');
  });

  /** The floating box has no cap, so it is never scrolling and never asks. */
  it('is not offered on the floating box', () => {
    expect(toggleIn(boxOf({ ...narrowPinned, containerWidth: 600 }))).toBeNull();
  });

  /**
   * The gesture the case above stops short of. "A different Month" in a real
   * chart is also different *content* and, where the reader tapped away from a
   * pin, a different pinned state — and the collapse used to arrive a frame
   * after both, on a passive effect, so the measurement that decides whether to
   * offer the control ran against the Month that had already gone.
   *
   * Said plainly, because it would otherwise be assumed: the two cases below
   * fail if the collapse goes away, and pass either way on the *ordering*. RTL
   * flushes passive effects inside `act`, so the extra frame the derivation
   * removes has already been and gone by the time anything can be asserted. What
   * is covered here is the content and pin-state change the case above holds
   * fixed; the frame itself is only observable in a browser.
   */
  /**
   * One event, not several. What is under the cap is measured rather than
   * counted — that is this block's whole premise — and a Month holding more than
   * one draws the carousel's own buttons, which `toggleIn` would then find
   * alongside the control it is looking for.
   */
  const oneEvent = [makeTransitEvent({ id: 'a', date: '2020-06', title: 'Detour' })];

  const atMonth = (index: number, props: Partial<Parameters<typeof ChartTooltip>[0]>) => (
    <ChartTooltip
      index={index}
      months={months}
      datasets={datasets}
      events={[]}
      caret={{ x: 100, y: 20 }}
      {...narrowPinned}
      {...props}
    />
  );

  it('opens collapsed on a Month whose events changed with it', () => {
    const { container, rerender } = render(atMonth(1, { events: oneEvent }));
    const box = container.querySelector<HTMLElement>('[data-testid="chart-tooltip"]')!;
    fireEvent.click(toggleIn(box) as HTMLElement);
    expect(box.style.maxHeight).toBe('');

    rerender(atMonth(2, { events: [] }));

    // Collapsed and re-measured in one commit: the cap is back, and the control
    // that lifts it is offered for *this* Month rather than withheld because the
    // last one was open when it was measured.
    expect(box.dataset.expanded).toBe('false');
    expect(box.style.maxHeight).toBe('100px');
    expect(toggleIn(box)?.textContent).toBe('Expand');
  });

  /**
   * The reported gesture, at this component's level. Tapping another month
   * releases the pin (ADR-0011), so the readout can arrive unpinned on the same
   * rerender that changes the Month.
   */
  it('opens collapsed when the pin is released with the Month', () => {
    const { container, rerender } = render(atMonth(1, { events: oneEvent }));
    const box = container.querySelector<HTMLElement>('[data-testid="chart-tooltip"]')!;
    fireEvent.click(toggleIn(box) as HTMLElement);

    rerender(atMonth(2, { events: oneEvent, isPinned: false }));

    expect(box.dataset.expanded).toBe('false');
    expect(box.style.maxHeight).toBe('100px');
  });

  /**
   * A capped box that is holding something back always says so. Unpinned it
   * cannot offer a button — it does not accept the pointer — so it says the one
   * thing that leads anywhere. Reachable only with a mouse on a chart under
   * 480px, a narrow panel on a desktop; a pointer that cannot hover has no
   * unpinned readout at all (see `RidershipChart`).
   */
  it('names the way out even where it cannot offer the control', () => {
    const box = boxOf({ ...narrowPinned, events: oneEvent, isPinned: false });
    expect(toggleIn(box)).toBeNull();
    expect(within(box).getByText('Click to pin')).toBeTruthy();
  });

  it('does not say it where there is nothing under the cap', () => {
    const box = boxOf({ ...narrowPinned, containerWidth: 600, isPinned: false });
    expect(within(box).queryByText('Click to pin')).toBeNull();
  });

  /**
   * React reuses this element across Months and the browser keeps a scrolling
   * box's `scrollTop` when its content is replaced, so a reader who scrolled
   * through a busy Month met the next one already past its heading.
   */
  it('starts a new Month at its heading', () => {
    const { container, rerender } = render(atMonth(1, { events: oneEvent }));
    const box = container.querySelector<HTMLElement>('[data-testid="chart-tooltip"]')!;
    box.scrollTop = 40;

    rerender(atMonth(2, { events: oneEvent }));

    expect(box.scrollTop).toBe(0);
  });
});

/**
 * One event at a time, with the controls to step between them.
 *
 * Every case runs at both widths from one list, because "the same on both
 * surfaces" is the requirement rather than a nice property of the
 * implementation: a reader who learns the readout on a phone should not have to
 * learn it again on a desktop. The floating box and the strip are the only two
 * layouts there are, so a `describe.each` over the two widths is the whole
 * matrix.
 */
describe.each([
  ['floating', 600],
  ['strip', 479],
])('ChartTooltip event carousel — %s', (_layout, containerWidth) => {
  const three = ['a', 'b', 'c'].map((id) =>
    makeTransitEvent({
      id,
      date: '2020-06',
      title: `Event ${id}`,
      description: `Description ${id}`,
    }),
  );

  const pinned = { containerWidth, plotHeight: 300, isPinned: true };

  const nextIn = (box: HTMLElement) =>
    within(box).getByRole<HTMLButtonElement>('button', { name: 'Next event' });
  const prevIn = (box: HTMLElement) =>
    within(box).getByRole<HTMLButtonElement>('button', { name: 'Previous event' });

  it('opens on the first event and shows where it is', () => {
    const box = boxOf({ ...pinned, events: three });
    expect(within(box).getByText('Event a')).toBeTruthy();
    expect(within(box).queryByText('Event b')).toBeNull();
    expect(within(box).getByText('1 of 3')).toBeTruthy();
  });

  it('steps forward and back through the events', () => {
    const box = boxOf({ ...pinned, events: three });

    fireEvent.click(nextIn(box));
    expect(within(box).getByText('Event b')).toBeTruthy();
    expect(within(box).getByText('Description b')).toBeTruthy();
    expect(within(box).getByText('2 of 3')).toBeTruthy();
    expect(within(box).queryByText('Event a')).toBeNull();

    fireEvent.click(prevIn(box));
    expect(within(box).getByText('Event a')).toBeTruthy();
    expect(within(box).getByText('1 of 3')).toBeTruthy();
  });

  /** Clamped rather than wrapping, so the position indicator can be believed. */
  it('stops at both ends rather than wrapping round', () => {
    const box = boxOf({ ...pinned, events: three });
    const refused = (button: HTMLButtonElement) =>
      button.getAttribute('aria-disabled') === 'true';

    expect(refused(prevIn(box))).toBe(true);
    expect(refused(nextIn(box))).toBe(false);

    fireEvent.click(nextIn(box));
    fireEvent.click(nextIn(box));

    expect(within(box).getByText('3 of 3')).toBeTruthy();
    expect(refused(nextIn(box))).toBe(true);
    expect(refused(prevIn(box))).toBe(false);

    // And the refusal holds: a press on the refused end moves nothing.
    fireEvent.click(nextIn(box));
    expect(within(box).getByText('3 of 3')).toBeTruthy();
  });

  /**
   * `aria-disabled`, not `disabled`. A control that disables itself at the end
   * of the list is one the reader may well be standing on — Next, on the last
   * event — and the real attribute makes it unfocusable mid-press, so the
   * browser drops focus to the body. From there Escape and the arrow keys no
   * longer reach the plot and the keyboard reader is stranded in the carousel.
   */
  it('keeps a refused control focusable', () => {
    const box = boxOf({ ...pinned, events: three });

    fireEvent.click(nextIn(box));
    fireEvent.click(nextIn(box));

    expect(nextIn(box).getAttribute('aria-disabled')).toBe('true');
    expect(nextIn(box).disabled).toBe(false);
  });

  /**
   * The other half of the same rule, and the one a stray `key` on the entry
   * broke: stepping re-renders the readout, and if that remounts the control
   * the reader pressed, focus is gone by the time they press it again.
   */
  it('leaves focus on the control that was pressed', () => {
    const box = boxOf({ ...pinned, events: three });
    const next = nextIn(box);
    next.focus();
    expect(document.activeElement).toBe(next);

    fireEvent.click(next);

    expect(within(box).getByText('2 of 3')).toBeTruthy();
    expect(document.activeElement).toBe(nextIn(box));
  });

  /** Nothing to step through, and "1 of 1" is not information. */
  it('shows no controls and no position for a month with one event', () => {
    const box = boxOf({ ...pinned, events: [three[0]] });
    expect(within(box).queryByRole('button', { name: 'Next event' })).toBeNull();
    expect(within(box).queryByRole('button', { name: 'Previous event' })).toBeNull();
    expect(within(box).queryByText(/of 1$/)).toBeNull();
  });

  /**
   * A hovering readout does not accept the pointer, so a control on one is a
   * control the reader can see and cannot press — the same rule Expand follows.
   * The position survives, because it is the only thing telling a hovering
   * reader that pinning would get them anywhere.
   */
  it('withholds the controls but keeps the position while only hovering', () => {
    const box = boxOf({ ...pinned, isPinned: false, events: three });
    expect(within(box).queryByRole('button', { name: 'Next event' })).toBeNull();
    expect(within(box).getByText('1 of 3')).toBeTruthy();
  });

  it('announces the position only where the reader can move it', () => {
    const live = (props: Partial<Parameters<typeof ChartTooltip>[0]>) =>
      within(boxOf(props)).getByText('1 of 3').getAttribute('aria-live');

    expect(live({ ...pinned, events: three })).toBe('polite');
    expect(live({ ...pinned, isPinned: false, events: three })).toBe('off');
  });

  /**
   * The plot's box, as `RidershipChart` builds it: the readout renders *inside*
   * a div carrying the handlers that pin a Month — `onClick` on the chart, and
   * an `onKeyDown` mapping Enter and Space to the same pin.
   *
   * React handlers rather than `addEventListener`, and that is the whole reason
   * this helper exists. React attaches its listeners at the root container, so
   * a native listener on the parent hears the event before React has dispatched
   * anything and `stopPropagation` on a synthetic event cannot stop it — the
   * test would fail against a component that is behaving perfectly. Handlers of
   * the same kind the real parent uses is the only faithful check.
   */
  const renderInPlot = (events: ReturnType<typeof makeTransitEvent>[]) => {
    const reachedChart = vi.fn();
    const { container } = render(
      <div onClick={reachedChart} onKeyDown={reachedChart}>
        <ChartTooltip
          index={1}
          months={months}
          datasets={datasets}
          caret={{ x: 100, y: 20 }}
          events={events}
          {...pinned}
        />
      </div>,
    );
    const box = container.querySelector<HTMLElement>('[data-testid="chart-tooltip"]')!;
    return { box, reachedChart };
  };

  /**
   * A step that reached the chart would release the pin holding the readout
   * open — the reader's own press closing the thing they pressed.
   */
  it('keeps a step off the chart underneath it', () => {
    const { box, reachedChart } = renderInPlot(three);

    fireEvent.click(nextIn(box));

    expect(within(box).getByText('2 of 3')).toBeTruthy();
    expect(reachedChart).not.toHaveBeenCalled();
  });

  /**
   * The same box maps Enter and Space to that pin, so the keyboard needs the
   * same guard as the pointer — `fireEvent.click` would never have caught it.
   */
  it.each(['Enter', ' '])('keeps a %s press off the chart underneath it', (key) => {
    const { box, reachedChart } = renderInPlot(three);

    fireEvent.keyDown(nextIn(box), { key });

    expect(reachedChart).not.toHaveBeenCalled();
  });

  /**
   * And the other half of that rule: Left and Right are *not* bound here. They
   * mean "change Month" wherever focus sits, so they must reach the plot even
   * from a control. Binding them to the carousel is the obvious next commit and
   * the wrong one — see `ReadoutButton`.
   */
  it.each(['ArrowLeft', 'ArrowRight'])('lets %s through to the chart', (key) => {
    const { box, reachedChart } = renderInPlot(three);

    fireEvent.keyDown(nextIn(box), { key });

    expect(reachedChart).toHaveBeenCalled();
    // And changed nothing about which event is on show.
    expect(within(box).getByText('1 of 3')).toBeTruthy();
  });

  /** A new Month is a new readout, and it opens at the first of its events. */
  it('resets to the first event on a different month', () => {
    const props = { months, datasets, caret: { x: 100, y: 20 }, ...pinned };
    const { container, rerender } = render(
      <ChartTooltip index={1} events={three} {...props} />,
    );
    const box = container.querySelector<HTMLElement>('[data-testid="chart-tooltip"]')!;

    fireEvent.click(nextIn(box));
    expect(within(box).getByText('2 of 3')).toBeTruthy();

    rerender(<ChartTooltip index={2} events={three} {...props} />);
    expect(within(box).getByText('1 of 3')).toBeTruthy();
    expect(within(box).getByText('Event a')).toBeTruthy();
  });

  /**
   * Filtering a line away takes its events with it, which can shorten the list
   * under a held position without the Month changing — so the reset effect does
   * not fire and the position has to be clamped at render instead.
   */
  it('falls back to the last event when the list shortens beneath it', () => {
    const props = { months, datasets, caret: { x: 100, y: 20 }, ...pinned };
    const { container, rerender } = render(
      <ChartTooltip index={1} events={three} {...props} />,
    );
    const box = container.querySelector<HTMLElement>('[data-testid="chart-tooltip"]')!;

    fireEvent.click(nextIn(box));
    fireEvent.click(nextIn(box));
    expect(within(box).getByText('3 of 3')).toBeTruthy();

    rerender(<ChartTooltip index={1} events={three.slice(0, 2)} {...props} />);
    expect(within(box).getByText('2 of 2')).toBeTruthy();
    expect(within(box).getByText('Event b')).toBeTruthy();
  });
});
