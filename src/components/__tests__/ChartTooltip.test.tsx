import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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

  it('shows no event section for a month with nothing in it', () => {
    const { container } = renderTooltip();
    expect(container.querySelector('.border-t')).toBeNull();
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

  it('labels the event with its month and category', () => {
    renderTooltip({ events: [opening] });
    expect(screen.getByText('Jun 2020 · Opening')).toBeTruthy();
  });

  it('tints the title with the category hue', () => {
    renderTooltip({ events: [opening] });
    const title = screen.getByText('Regional Connector Opening');
    const expected = document.createElement('div');
    expected.style.color = colors.emerald['400'];
    expect(title.style.color).toBe(expected.style.color);
  });

  it('lists every event in a month that holds more than one', () => {
    renderTooltip({
      events: [
        opening,
        makeTransitEvent({ id: 'fare', date: '2020-06', title: 'Fare change' }),
      ],
    });
    expect(screen.getByText('Regional Connector Opening')).toBeTruthy();
    expect(screen.getByText('Fare change')).toBeTruthy();
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

describe('ChartTooltip placement', () => {
  const leftOf = (props: Partial<Parameters<typeof ChartTooltip>[0]>) => {
    const { container } = renderTooltip(props);
    const box = container.querySelector('[data-testid="chart-tooltip"]');
    return parseFloat((box as HTMLElement).style.left);
  };

  it('sits to the right of the crosshair when there is room', () => {
    expect(leftOf({ caret: { x: 100, y: 20 } })).toBeGreaterThan(100);
  });

  it('flips to the left of the crosshair near the right edge', () => {
    expect(leftOf({ caret: { x: 580, y: 20 }, containerWidth: 600 })).toBeLessThan(580);
  });

  it('stays inside the plot when the crosshair is at the far left', () => {
    expect(leftOf({ caret: { x: 0, y: 20 } })).toBeGreaterThanOrEqual(8);
  });

  /** A container narrower than the box would otherwise produce a negative left. */
  it('does not overflow a container narrower than itself', () => {
    expect(leftOf({ caret: { x: 10, y: 20 }, containerWidth: 100 })).toBeGreaterThanOrEqual(8);
  });
});
