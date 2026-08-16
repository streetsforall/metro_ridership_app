import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  const onPinnedMonthRequest = vi.fn();
  const onRangeSelect = vi.fn();
  const view = render(
    <RidershipChart
      chartDatasets={[dataset]}
      months={months}
      transitEvents={[opening]}
      pinnedMonth={null}
      onPinnedMonthRequest={onPinnedMonthRequest}
      highlightedMonth={null}
      onRangeSelect={onRangeSelect}
      {...props}
    />,
  );
  return { ...view, onPinnedMonthRequest, onRangeSelect };
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

/**
 * `type` is load-bearing, not decoration. Chart.js dispatches `onClick` for
 * `mouseup` as well as `click` — see `_isClickEvent` — and both are in the event
 * list because the drag plugin needs `mouseup`, so a fixture without a type
 * would drive a pass the component deliberately ignores.
 */
const dispatchChartEvent = (x: number, type: 'click' | 'mouseup') => {
  const onClick = capturedOptions?.onClick as unknown as (
    event: { x: number; type: string; native: Event },
    elements: unknown[],
    chart: unknown,
  ) => void;
  act(() => {
    onClick({ x, type, native: new MouseEvent(type) }, [], fakeChart);
  });
};

const clickChart = (x: number) => dispatchChartEvent(x, 'click');

const chartSurface = () => screen.getByRole('application');

/**
 * The month the readout is headed with — its first child. Read positionally
 * rather than by text, because an event entry now carries its own date and the
 * fixture's event sits in the month these tests hover, so "Jun 2020" is on
 * screen twice.
 */
const readoutMonth = () =>
  screen.getByTestId('chart-tooltip').firstElementChild?.textContent;

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
    expect(capturedOptions?.plugins?.eventGutter?.transitEvents).toHaveLength(1);
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
    expect(readoutMonth()).toBe('Jun 2020');
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

/**
 * The chart names the month a gesture landed on and stops there. What that does
 * to the pin — take it, release it — is the rule shared with the context log and
 * lives in `OutputArea`, which is where the release-first behaviour is asserted.
 */
describe('RidershipChart pinning', () => {
  it('reports the clicked month', () => {
    const { onPinnedMonthRequest } = renderChart();
    fakeChart.getElementsAtEventForMode.mockReturnValue([{ index: 5 }]);
    clickChart(175);
    expect(onPinnedMonthRequest).toHaveBeenCalledWith('2020 6');
  });

  /** Not `null`: the chart does not decide that a re-click is a release. */
  it('reports the month even when it is the one already pinned', () => {
    const { onPinnedMonthRequest } = renderChart({ pinnedMonth: '2020 6' });
    fakeChart.getElementsAtEventForMode.mockReturnValue([{ index: 5 }]);
    clickChart(175);
    expect(onPinnedMonthRequest).toHaveBeenCalledWith('2020 6');
  });

  /**
   * One press and release reaches `onClick` twice. Acting on both would ask for
   * the same month twice, and under the release-first rule the second request
   * undoes the first — a click that pins nothing at all.
   */
  it('reports nothing for the mouseup half of a click', () => {
    const { onPinnedMonthRequest } = renderChart();
    fakeChart.getElementsAtEventForMode.mockReturnValue([{ index: 5 }]);
    dispatchChartEvent(175, 'mouseup');
    expect(onPinnedMonthRequest).not.toHaveBeenCalled();
  });

  /**
   * And it is the `mouseup` pass that runs before the drag plugin's `afterEvent`
   * sets the suppression flag, so ignoring it is also what stops a completed
   * Range Selection pinning the month it released over.
   */
  it('reports once, not twice, for a whole press and release', () => {
    const { onPinnedMonthRequest } = renderChart();
    fakeChart.getElementsAtEventForMode.mockReturnValue([{ index: 5 }]);
    dispatchChartEvent(175, 'mouseup');
    dispatchChartEvent(175, 'click');
    expect(onPinnedMonthRequest).toHaveBeenCalledTimes(1);
  });

  it('reports a different month while one is pinned, without deciding', () => {
    const { onPinnedMonthRequest } = renderChart({ pinnedMonth: '2020 6' });
    fakeChart.getElementsAtEventForMode.mockReturnValue([{ index: 1 }]);
    clickChart(60);
    expect(onPinnedMonthRequest).toHaveBeenCalledWith('2020 2');
  });

  /**
   * The x-scale fallback that used to run here is gone. It fired for any click
   * with no element under it and could not tell the Event Gutter from the plot's
   * empty space; the gutter now reports its own clicks, and leaving both would
   * be two routes to one pin — see ADR-0010.
   */
  it('pins nothing from a plot click that hits no element', () => {
    const { onPinnedMonthRequest } = renderChart();
    fakeChart.getElementsAtEventForMode.mockReturnValue([]);
    clickChart(175);
    expect(onPinnedMonthRequest).not.toHaveBeenCalled();
  });

  it('reports the month the gutter names from below the axis', () => {
    const { onPinnedMonthRequest } = renderChart();
    capturedOptions?.plugins?.eventGutter?.onGutterClick?.(5);
    expect(onPinnedMonthRequest).toHaveBeenCalledWith('2020 6');
  });

  /** The gutter is a third way in to the same rule, not a rule of its own. */
  it('reports the gutter month unchanged while it is already pinned', () => {
    const { onPinnedMonthRequest } = renderChart({ pinnedMonth: '2020 6' });
    capturedOptions?.plugins?.eventGutter?.onGutterClick?.(5);
    expect(onPinnedMonthRequest).toHaveBeenCalledWith('2020 6');
  });

  /**
   * The readout must not change with where the reader pointed, so the gutter's
   * hover lands on the same state a plot hover writes rather than on a copy.
   */
  it('shows the same readout for a gutter hover as for a plot hover', () => {
    renderChart();
    act(() => {
      capturedOptions?.plugins?.eventGutter?.onGutterHover?.(5);
    });
    expect(readoutMonth()).toBe('Jun 2020');
    expect(screen.getByText('Regional Connector Opening')).toBeTruthy();
    expect(screen.getByText('1,500')).toBeTruthy();
  });

  it('clears the readout when the pointer leaves the gutter', () => {
    renderChart();
    act(() => {
      capturedOptions?.plugins?.eventGutter?.onGutterHover?.(5);
    });
    act(() => {
      capturedOptions?.plugins?.eventGutter?.onGutterHover?.(null);
    });
    expect(screen.queryByTestId('chart-tooltip')).toBeNull();
  });

  /** Chart.js fires click after mouseup, so a drag would otherwise also pin. */
  it('ignores the click that ends a drag', () => {
    const { onPinnedMonthRequest } = renderChart();
    (fakeChart as unknown as { $rangeSelect: unknown }).$rangeSelect = {
      suppressClick: true,
    };
    clickChart(175);
    expect(onPinnedMonthRequest).not.toHaveBeenCalled();
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
    expect(readoutMonth()).toBe('Jun 2020');
  });

  it('unpins on Escape pressed anywhere on the page', () => {
    const { onPinnedMonthRequest } = renderChart({ pinnedMonth: '2020 6' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onPinnedMonthRequest).toHaveBeenCalledWith(null);
  });

  /**
   * Dismiss-on-outside-press is OutputArea's, not the chart's — a listener
   * scoped to the plot would fire on a context-log row click. Covered there.
   */
  it('leaves a press outside the plot alone', () => {
    const { onPinnedMonthRequest } = renderChart({ pinnedMonth: '2020 6' });
    fireEvent.pointerDown(document.body);
    expect(onPinnedMonthRequest).not.toHaveBeenCalled();
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
    const { onPinnedMonthRequest } = renderChart();
    fireEvent.keyDown(chartSurface(), { key: 'ArrowRight' });
    fireEvent.keyDown(chartSurface(), { key: 'Enter' });
    expect(onPinnedMonthRequest).toHaveBeenCalledWith('2020 2');
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

/**
 * The width the readout is handed decides its layout, so it has to be right on
 * the first painted frame. It used to be read off a ref during render — zero
 * until some unrelated re-render happened to come along, which for a clamp was
 * a few pixels of drift and for a mode is the wrong mode, held.
 *
 * jsdom lays nothing out and ships no `ResizeObserver`, so both halves of the
 * measurement are driven by hand here: `clientWidth` for the initial read, a
 * captured observer callback for the resize.
 */
describe('RidershipChart plot measurement', () => {
  const realResizeObserver = window.ResizeObserver;
  let observed: Element[] = [];
  let resizeTo: ((width: number) => void) | null = null;

  beforeEach(() => {
    observed = [];
    resizeTo = null;
    window.ResizeObserver = class {
      callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        resizeTo = (width: number) =>
          act(() => {
            this.callback(
              [{ contentRect: { width } } as ResizeObserverEntry],
              this as unknown as ResizeObserver,
            );
          });
      }
      observe(element: Element) {
        observed.push(element);
      }
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    window.ResizeObserver = realResizeObserver;
  });

  /** Every element in jsdom is 0×0; this is the only way to have a width at all. */
  const withPlotWidth = (width: number, run: () => void) => {
    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth');
    Object.defineProperty(Element.prototype, 'clientWidth', {
      configurable: true,
      get: () => width,
    });
    try {
      run();
    } finally {
      if (original) Object.defineProperty(Element.prototype, 'clientWidth', original);
    }
  };

  const layout = () => screen.getByTestId('chart-tooltip').dataset.layout;

  it('observes the plot box', () => {
    renderChart();
    expect(observed).toContain(chartSurface());
  });

  /**
   * No resize is reported here, so a readout in the wide layout can only have
   * come from the measurement taken as the plot mounted.
   */
  it('has the plot width before anything resizes', () => {
    withPlotWidth(900, renderChart);
    hoverMonth(5);
    expect(layout()).toBe('floating');
  });

  it('re-measures on a resize, switching the readout to the narrow layout', () => {
    withPlotWidth(900, renderChart);
    hoverMonth(5);
    expect(layout()).toBe('floating');

    resizeTo?.(320);
    expect(layout()).toBe('strip');
  });

  it('switches back when the plot grows again', () => {
    withPlotWidth(320, renderChart);
    hoverMonth(5);
    expect(layout()).toBe('strip');

    resizeTo?.(900);
    expect(layout()).toBe('floating');
  });
});
