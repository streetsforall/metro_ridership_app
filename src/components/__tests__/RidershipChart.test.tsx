import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { ChartDataset, ChartOptions } from 'chart.js';
import RidershipChart from '../RidershipChart';
import type { CustomChartData } from '../../@types/chart.types';
import { makeTransitEvent } from '../../test/builders';

let capturedOptions: ChartOptions<'line'> | undefined;

/**
 * Twelve months of 2020: index 0 at 50px, one month every 25px. The fake chart
 * stands in for the Chart.js instance the real component holds a ref to, so the
 * plugin options and the click/keyboard paths can be driven directly.
 */
const months = Array.from({ length: 12 }, (_, i) => `2020 ${i + 1}`);

const makeFakeChart = () => ({
  scales: {
    x: {
      getPixelForValue: (i: number) => 50 + i * 25,
      getValueForPixel: (px: number) => (px - 50) / 25,
    },
  },
  chartArea: { top: 10, bottom: 200, left: 0, right: 400 },
  getElementsAtEventForMode: vi.fn((): { index: number }[] => []),
});

let fakeChart = makeFakeChart();

/**
 * Attaches the fake chart in an effect rather than during render, matching when
 * React actually hands a component its ref. Doing it during render would hide
 * the very ordering the component has to cope with.
 */
vi.mock('react-chartjs-2', async () => {
  const { useEffect } = await import('react');
  return {
    Line: (props: {
      options: ChartOptions<'line'>;
      ref?: ((instance: unknown) => void) | { current: unknown };
    }) => {
      capturedOptions = props.options;
      const { ref } = props;
      useEffect(() => {
        if (typeof ref === 'function') ref(fakeChart);
        else if (ref) ref.current = fakeChart;
      }, [ref]);
      return <canvas data-testid="line-chart" />;
    },
  };
});

const dataset: ChartDataset<'line', CustomChartData[]> = {
  label: 'A Line',
  borderColor: '#0072bc',
  backgroundColor: '#0072bc',
  data: months.map((time, i) => ({ time, stat: 1000 + i * 100 })),
};

const opening = makeTransitEvent({
  id: 'regional-connector',
  date: '2020-06',
  title: 'Regional Connector Opening',
  description: 'Linked four lines downtown.',
  category: 'opening',
});

const renderChart = (
  props: Partial<Parameters<typeof RidershipChart>[0]> = {},
) => {
  const onPinnedMonthChange = vi.fn();
  const onRangeSelect = vi.fn();
  const view = render(
    <RidershipChart
      chartDatasets={[dataset]}
      months={months}
      transitEvents={[opening]}
      pinnedMonth={null}
      onPinnedMonthChange={onPinnedMonthChange}
      highlightedMonth={null}
      onRangeSelect={onRangeSelect}
      {...props}
    />,
  );
  return { ...view, onPinnedMonthChange, onRangeSelect };
};

/** Drives the tooltip's `external` handler the way a real hover would. */
const hoverMonth = (index: number | null) =>
  act(() => {
    const external = capturedOptions?.plugins?.tooltip?.external as unknown as (
      args: { tooltip: { opacity: number; dataPoints?: { dataIndex: number }[] } },
    ) => void;
    external(
      index === null
        ? { tooltip: { opacity: 0 } }
        : { tooltip: { opacity: 1, dataPoints: [{ dataIndex: index }] } },
    );
  });

const clickChart = (x: number) => {
  const onClick = capturedOptions?.onClick as unknown as (
    event: { x: number; native: Event },
    elements: unknown[],
    chart: unknown,
  ) => void;
  act(() => {
    onClick({ x, native: new MouseEvent('click') }, [], fakeChart);
  });
};

const chartSurface = () => screen.getByRole('application');

beforeEach(() => {
  capturedOptions = undefined;
  fakeChart = makeFakeChart();
});

describe('RidershipChart wiring', () => {
  it('renders the canvas', () => {
    renderChart();
    expect(screen.getByTestId('line-chart')).toBeTruthy();
  });

  /**
   * Chart.js's default event list has neither, and the drag-to-select plugin
   * cannot observe a gesture without them.
   */
  it('subscribes to mousedown and mouseup for drag selection', () => {
    renderChart();
    expect(capturedOptions?.events).toContain('mousedown');
    expect(capturedOptions?.events).toContain('mouseup');
  });

  it('keeps hover column-wide rather than requiring a point hit', () => {
    renderChart();
    expect(capturedOptions?.interaction?.intersect).toBe(false);
    expect(capturedOptions?.interaction?.mode).toBe('index');
  });

  /** The readout is HTML now; Chart.js must not also paint one on the canvas. */
  it('disables the built-in canvas tooltip', () => {
    renderChart();
    expect(capturedOptions?.plugins?.tooltip?.enabled).toBe(false);
  });

  it('passes the events to the gutter plugin', () => {
    renderChart();
    expect(capturedOptions?.plugins?.eventGutter?.events).toHaveLength(1);
  });

  it('tells the gutter plugin which month the log is hovering', () => {
    renderChart({ highlightedMonth: '2020 6' });
    expect(capturedOptions?.plugins?.eventGutter?.highlightedIndex).toBe(5);
  });

  it('reports no highlight for a month that is off the axis', () => {
    renderChart({ highlightedMonth: '1999 1' });
    expect(capturedOptions?.plugins?.eventGutter?.highlightedIndex).toBeNull();
  });
});

describe('RidershipChart hover', () => {
  it('shows the month readout when the pointer enters a column', () => {
    renderChart();
    hoverMonth(5);
    expect(screen.getByTestId('chart-tooltip')).toBeTruthy();
    expect(screen.getByText('Jun 2020')).toBeTruthy();
  });

  it('shows the event context in the same box as the ridership', () => {
    renderChart();
    hoverMonth(5);
    expect(screen.getByText('Regional Connector Opening')).toBeTruthy();
    expect(screen.getByText('1,500')).toBeTruthy();
  });

  it('hides the readout when the pointer leaves the plot', () => {
    renderChart();
    hoverMonth(5);
    hoverMonth(null);
    expect(screen.queryByTestId('chart-tooltip')).toBeNull();
  });
});

describe('RidershipChart pinning', () => {
  it('pins the clicked month', () => {
    const { onPinnedMonthChange } = renderChart();
    fakeChart.getElementsAtEventForMode.mockReturnValue([{ index: 5 }]);
    clickChart(175);
    expect(onPinnedMonthChange).toHaveBeenCalledWith('2020 6');
  });

  it('unpins when the pinned month is clicked again', () => {
    const { onPinnedMonthChange } = renderChart({ pinnedMonth: '2020 6' });
    fakeChart.getElementsAtEventForMode.mockReturnValue([{ index: 5 }]);
    clickChart(175);
    expect(onPinnedMonthChange).toHaveBeenCalledWith(null);
  });

  /**
   * The dots sit on the axis baseline, where Chart.js finds no element. Without
   * the scale fallback, clicking the very thing the feature added does nothing.
   */
  it('pins from a click on the axis strip, where no element is hit', () => {
    const { onPinnedMonthChange } = renderChart();
    fakeChart.getElementsAtEventForMode.mockReturnValue([]);
    clickChart(175);
    expect(onPinnedMonthChange).toHaveBeenCalledWith('2020 6');
  });

  it('clamps an axis-strip click past the last month', () => {
    const { onPinnedMonthChange } = renderChart();
    clickChart(5000);
    expect(onPinnedMonthChange).toHaveBeenCalledWith('2020 12');
  });

  /** Chart.js fires click after mouseup, so a drag would otherwise also pin. */
  it('ignores the click that ends a drag', () => {
    const { onPinnedMonthChange } = renderChart();
    (fakeChart as unknown as { $rangeSelect: unknown }).$rangeSelect = {
      suppressClick: true,
    };
    clickChart(175);
    expect(onPinnedMonthChange).not.toHaveBeenCalled();
  });

  it('marks the crosshair as pinned so the state is visible', () => {
    renderChart({ pinnedMonth: '2020 6' });
    expect(capturedOptions?.plugins?.hoverCrosshair?.isPinned).toBe(true);
    expect(capturedOptions?.plugins?.hoverCrosshair?.focusedIndex).toBe(5);
  });

  it('renders the pinned month readout without any hover', () => {
    renderChart({ pinnedMonth: '2020 6' });
    expect(screen.getByTestId('chart-tooltip').getAttribute('data-pinned')).toBe(
      'true',
    );
  });

  /** A stray mousemove must not silently retarget what the reader pinned. */
  it('keeps the pinned month while the pointer wanders elsewhere', () => {
    renderChart({ pinnedMonth: '2020 6' });
    hoverMonth(1);
    expect(screen.getByText('Jun 2020')).toBeTruthy();
  });

  it('unpins on Escape pressed anywhere on the page', () => {
    const { onPinnedMonthChange } = renderChart({ pinnedMonth: '2020 6' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onPinnedMonthChange).toHaveBeenCalledWith(null);
  });

  /**
   * Dismiss-on-outside-press is OutputArea's, not the chart's — a listener
   * scoped to the plot would fire on a context-log row click. Covered there.
   */
  it('leaves a press outside the plot alone', () => {
    const { onPinnedMonthChange } = renderChart({ pinnedMonth: '2020 6' });
    fireEvent.pointerDown(document.body);
    expect(onPinnedMonthChange).not.toHaveBeenCalled();
  });
});

describe('RidershipChart keyboard', () => {
  it('exposes the plot as a focusable control', () => {
    renderChart();
    expect(chartSurface().getAttribute('tabindex')).toBe('0');
  });

  it('steps to the next month on ArrowRight', () => {
    renderChart();
    fireEvent.keyDown(chartSurface(), { key: 'ArrowRight' });
    expect(screen.getByText('Feb 2020')).toBeTruthy();
  });

  it('steps back on ArrowLeft', () => {
    renderChart();
    fireEvent.keyDown(chartSurface(), { key: 'End' });
    fireEvent.keyDown(chartSurface(), { key: 'ArrowLeft' });
    expect(screen.getByText('Nov 2020')).toBeTruthy();
  });

  it('stops at the first month rather than wrapping', () => {
    renderChart();
    fireEvent.keyDown(chartSurface(), { key: 'ArrowLeft' });
    fireEvent.keyDown(chartSurface(), { key: 'ArrowLeft' });
    expect(screen.getByText('Jan 2020')).toBeTruthy();
  });

  it('stops at the last month rather than wrapping', () => {
    renderChart();
    fireEvent.keyDown(chartSurface(), { key: 'End' });
    fireEvent.keyDown(chartSurface(), { key: 'ArrowRight' });
    expect(screen.getByText('Dec 2020')).toBeTruthy();
  });

  it('jumps to the first month on Home', () => {
    renderChart();
    fireEvent.keyDown(chartSurface(), { key: 'End' });
    fireEvent.keyDown(chartSurface(), { key: 'Home' });
    expect(screen.getByText('Jan 2020')).toBeTruthy();
  });

  it('pins the focused month on Enter', () => {
    const { onPinnedMonthChange } = renderChart();
    fireEvent.keyDown(chartSurface(), { key: 'ArrowRight' });
    fireEvent.keyDown(chartSurface(), { key: 'Enter' });
    expect(onPinnedMonthChange).toHaveBeenCalledWith('2020 2');
  });

  it('drops the keyboard month when the plot loses focus', () => {
    renderChart();
    fireEvent.keyDown(chartSurface(), { key: 'ArrowRight' });
    fireEvent.blur(chartSurface());
    expect(screen.queryByTestId('chart-tooltip')).toBeNull();
  });

  it('overrides the pointer, so a stale hover cannot fight the arrow keys', () => {
    renderChart();
    hoverMonth(9);
    fireEvent.keyDown(chartSurface(), { key: 'Home' });
    expect(screen.getByText('Jan 2020')).toBeTruthy();
  });
});

describe('RidershipChart screen reader announcements', () => {
  const liveRegion = (container: HTMLElement) =>
    container.querySelector('[aria-live="polite"]')?.textContent ?? '';

  it('announces nothing until a month is active', () => {
    const { container } = renderChart();
    expect(liveRegion(container)).toBe('');
  });

  it('announces the month and each line ridership', () => {
    const { container } = renderChart();
    fireEvent.keyDown(chartSurface(), { key: 'ArrowRight' });
    expect(liveRegion(container)).toContain('Feb 2020');
    expect(liveRegion(container)).toContain('A Line 1,100');
  });

  it('announces the event for a month that has one', () => {
    const { container } = renderChart({ pinnedMonth: '2020 6' });
    expect(liveRegion(container)).toContain('Event: Regional Connector Opening');
  });

  it('says so when a line has no record for the month', () => {
    const gapped: ChartDataset<'line', CustomChartData[]> = {
      ...dataset,
      data: months.map((time) => ({ time, stat: null })),
    };
    const { container } = renderChart({ chartDatasets: [gapped] });
    fireEvent.keyDown(chartSurface(), { key: 'ArrowRight' });
    expect(liveRegion(container)).toContain('A Line no data');
  });
});

describe('RidershipChart range selection', () => {
  const selectRange = (start: number, end: number) =>
    act(() => {
      capturedOptions?.plugins?.rangeSelect?.onSelect?.(start, end);
    });

  it('reports the dragged range as month labels', () => {
    const { onRangeSelect } = renderChart();
    selectRange(2, 7);
    expect(onRangeSelect).toHaveBeenCalledWith('2020 3', '2020 8');
  });

  it('ignores indices the axis does not have', () => {
    const { onRangeSelect } = renderChart();
    selectRange(2, 99);
    expect(onRangeSelect).not.toHaveBeenCalled();
  });
});
