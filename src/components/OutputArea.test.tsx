import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OutputArea from './OutputArea';
import { Chart as ChartJS, type ChartOptions } from 'chart.js';
import type { Line } from '../@types/lines.types';
import type { TransitEvent } from '../@types/events.types';

let capturedOptions: ChartOptions<'line'> | undefined;

vi.mock('react-chartjs-2', () => ({
  Line: ({ options }: { options: ChartOptions<'line'> }) => {
    capturedOptions = options;
    return <canvas data-testid="line-chart" />;
  },
}));

vi.mock('./Map', () => ({
  default: ({ lines }: { lines: Line[] }) => (
    <div data-testid="map" data-line-count={String(lines.length)} />
  ),
}));

const makeLine = (overrides: Partial<Line>): Line => ({
  id: 801,
  name: 'A Line',
  mode: 'Rail',
  provider: 'DO',
  selected: false,
  visible: true,
  ...overrides,
});

const emptyProps = {
  chartDatasets: [],
  months: [],
  lines: [],
  transitEvents: [] as TransitEvent[],
  showContextLogs: false,
};

const transitEventFixture: TransitEvent = {
  id: 'regional-connector-opening',
  date: '2023-02',
  line_ids: [801, 803, 804, 806],
  title: 'Regional Connector Opening',
  description: 'The Regional Connector linked the A, C, E, and L lines through a new downtown tunnel.',
  category: 'opening',
};

const datasetFixture = {
  data: [{ time: '2022 1', stat: 5000 }] as { time: string; stat: number }[],
  label: 'A Line',
  backgroundColor: '#0072bc',
  borderColor: '#0072bc',
};

describe('OutputArea with no datasets', () => {
  it('shows the "Please select a Metro line." placeholder', () => {
    render(<OutputArea {...emptyProps} />);
    expect(screen.getByText('Please select a Metro line.')).toBeTruthy();
  });

  it('does not render the chart when there are no datasets', () => {
    render(<OutputArea {...emptyProps} />);
    expect(screen.queryByTestId('line-chart')).toBeNull();
  });
});

describe('OutputArea with datasets', () => {
  it('renders the chart when at least one dataset is provided', () => {
    render(
      <OutputArea
        chartDatasets={[datasetFixture]}
        months={['2022 1']}
        lines={[]}
        transitEvents={[]}
        showContextLogs={false}
      />,
    );
    expect(screen.getByTestId('line-chart')).toBeTruthy();
  });

  it('does not show the placeholder when datasets are provided', () => {
    render(
      <OutputArea
        chartDatasets={[datasetFixture]}
        months={['2022 1']}
        lines={[]}
        transitEvents={[]}
        showContextLogs={false}
      />,
    );
    expect(screen.queryByText('Please select a Metro line.')).toBeNull();
  });

  it('renders SummaryData for the passed lines', () => {
    const selectedLine = makeLine({
      selected: true,
      averageRidership: 4000,
      changeInRidership: 200,
      endingRidership: 4200,
    });
    render(
      <OutputArea
        chartDatasets={[datasetFixture]}
        months={['2022 1']}
        lines={[selectedLine]}
        transitEvents={[]}
        showContextLogs={false}
      />,
    );
    expect(screen.getByText('Average Ridership')).toBeTruthy();
  });

  it('does not render SummaryData stats when no lines are selected', () => {
    render(
      <OutputArea
        chartDatasets={[datasetFixture]}
        months={['2022 1']}
        lines={[makeLine({ selected: false })]}
        transitEvents={[]}
        showContextLogs={false}
      />,
    );
    expect(screen.queryByText('Average Ridership')).toBeNull();
  });
});

describe('OutputArea Map', () => {
  it('always renders the Map component even when there are no datasets', () => {
    render(<OutputArea {...emptyProps} />);
    expect(screen.getByTestId('map')).toBeTruthy();
  });

  it('renders the Map component alongside chart datasets', () => {
    render(
      <OutputArea
        chartDatasets={[datasetFixture]}
        months={['2022 1']}
        lines={[]}
        transitEvents={[]}
        showContextLogs={false}
      />,
    );
    expect(screen.getByTestId('map')).toBeTruthy();
  });

  it('passes the lines prop through to the Map component', () => {
    const lines = [makeLine({ id: 801 }), makeLine({ id: 802 })];
    render(
      <OutputArea
        chartDatasets={[]}
        months={[]}
        lines={lines}
        transitEvents={[]}
        showContextLogs={false}
      />,
    );
    expect(screen.getByTestId('map').getAttribute('data-line-count')).toBe('2');
  });
});

describe('tooltip itemSort', () => {
  type SimpleItem = { parsed: { y: number | null } };
  type ItemSortFn = (a: SimpleItem, b: SimpleItem) => number;

  beforeEach(() => {
    capturedOptions = undefined;
  });

  const renderWithDataset = () =>
    render(
      <OutputArea
        chartDatasets={[datasetFixture]}
        months={['2022 1']}
        lines={[]}
        transitEvents={[]}
        showContextLogs={false}
      />,
    );

  it('is defined on the chart options', () => {
    renderWithDataset();
    expect(capturedOptions?.plugins?.tooltip?.itemSort).toBeDefined();
  });

  it('places the higher-ridership item first', () => {
    renderWithDataset();
    const fn = capturedOptions?.plugins?.tooltip?.itemSort as unknown as ItemSortFn;
    const high = { parsed: { y: 10000 } };
    const low = { parsed: { y: 5000 } };
    // itemSort(a=high, b=low) → b.y - a.y = 5000 - 10000 < 0 → a sorts first ✓
    expect(fn(high, low)).toBeLessThan(0);
    // itemSort(a=low, b=high) → b.y - a.y = 10000 - 5000 > 0 → b sorts first ✓
    expect(fn(low, high)).toBeGreaterThan(0);
  });

  it('returns 0 for equal ridership values', () => {
    renderWithDataset();
    const fn = capturedOptions?.plugins?.tooltip?.itemSort as unknown as ItemSortFn;
    const item = { parsed: { y: 7500 } };
    expect(fn(item, item)).toBe(0);
  });

  it('treats null parsed.y as 0', () => {
    renderWithDataset();
    const fn = capturedOptions?.plugins?.tooltip?.itemSort as unknown as ItemSortFn;
    const nullItem = { parsed: { y: null } };
    const positiveItem = { parsed: { y: 5000 } };
    // null treated as 0; positive item should sort first
    expect(fn(nullItem, positiveItem)).toBeGreaterThan(0);
    expect(fn(positiveItem, nullItem)).toBeLessThan(0);
  });
});

describe('hoverCrosshair plugin', () => {
  const makeMockChart = (hasActive: boolean) => ({
    tooltip: {
      getActiveElements: () =>
        hasActive ? [{ element: { x: 100 } }] : [],
    },
    ctx: {
      save: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      restore: vi.fn(),
      setLineDash: vi.fn(),
      lineWidth: 0,
      strokeStyle: '',
    },
    chartArea: { top: 10, bottom: 200 },
  });

  it('is registered with ChartJS', () => {
    expect(ChartJS.registry.getPlugin('hoverCrosshair')).toBeDefined();
  });

  it('draws a vertical line at the hovered x position', () => {
    const plugin = ChartJS.registry.getPlugin('hoverCrosshair');
    const chart = makeMockChart(true);
    plugin?.afterDraw?.(chart as unknown as ChartJS, {}, {});
    expect(chart.ctx.save).toHaveBeenCalledOnce();
    expect(chart.ctx.beginPath).toHaveBeenCalledOnce();
    expect(chart.ctx.moveTo).toHaveBeenCalledWith(100, 10);
    expect(chart.ctx.lineTo).toHaveBeenCalledWith(100, 200);
    expect(chart.ctx.stroke).toHaveBeenCalledOnce();
    expect(chart.ctx.restore).toHaveBeenCalledOnce();
  });

  it('does nothing when no tooltip elements are active', () => {
    const plugin = ChartJS.registry.getPlugin('hoverCrosshair');
    const chart = makeMockChart(false);
    plugin?.afterDraw?.(chart as unknown as ChartJS, {}, {});
    expect(chart.ctx.beginPath).not.toHaveBeenCalled();
    expect(chart.ctx.stroke).not.toHaveBeenCalled();
  });
});

describe('chart interaction options', () => {
  beforeEach(() => {
    capturedOptions = undefined;
  });

  it('sets intersect to false so the crosshair activates anywhere in a column', () => {
    render(
      <OutputArea
        chartDatasets={[datasetFixture]}
        months={['2022 1']}
        lines={[]}
        transitEvents={[]}
        showContextLogs={false}
      />,
    );
    expect(capturedOptions?.interaction?.intersect).toBe(false);
  });
});

describe('context log panel', () => {
  it('does not render the panel when transitEvents is empty', () => {
    render(
      <OutputArea
        chartDatasets={[datasetFixture]}
        months={['2022 1']}
        lines={[]}
        transitEvents={[]}
        showContextLogs={true}
      />,
    );
    expect(screen.queryByText('Context Logs')).toBeNull();
  });

  it('does not render the panel when there are events but no datasets (no line selected)', () => {
    render(
      <OutputArea
        chartDatasets={[]}
        months={[]}
        lines={[]}
        transitEvents={[transitEventFixture]}
        showContextLogs={true}
      />,
    );
    expect(screen.queryByText('Context Logs')).toBeNull();
  });

  it('does not render the panel when showContextLogs is false', () => {
    render(
      <OutputArea
        chartDatasets={[datasetFixture]}
        months={['2023 2']}
        lines={[]}
        transitEvents={[transitEventFixture]}
        showContextLogs={false}
      />,
    );
    expect(screen.queryByText('Context Logs')).toBeNull();
    expect(screen.queryByText('Regional Connector Opening')).toBeNull();
  });

  it('renders the panel with event title and description when events and datasets are present', () => {
    render(
      <OutputArea
        chartDatasets={[datasetFixture]}
        months={['2023 2']}
        lines={[]}
        transitEvents={[transitEventFixture]}
        showContextLogs={true}
      />,
    );
    expect(screen.getByText('Context Logs')).toBeTruthy();
    expect(screen.getByText('Regional Connector Opening')).toBeTruthy();
    expect(screen.getByText(/linked the A, C, E, and L lines/)).toBeTruthy();
  });

  it('collapses and expands the panel when the toggle button is clicked', () => {
    render(
      <OutputArea
        chartDatasets={[datasetFixture]}
        months={['2023 2']}
        lines={[]}
        transitEvents={[transitEventFixture]}
        showContextLogs={true}
      />,
    );

    expect(screen.getByText('Regional Connector Opening')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /context logs/i }));
    expect(screen.queryByText('Regional Connector Opening')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /context logs/i }));
    expect(screen.getByText('Regional Connector Opening')).toBeTruthy();
  });
});

describe('tooltip callbacks', () => {
  type TitleFn = (items: { label: string }[]) => string;
  type LabelFn = (item: {
    dataset: { label?: string };
    parsed: { y: number | null };
  }) => string;

  beforeEach(() => {
    capturedOptions = undefined;
  });

  const getCallbacks = () => {
    render(
      <OutputArea
        chartDatasets={[datasetFixture]}
        months={['2026 5']}
        lines={[]}
        transitEvents={[]}
        showContextLogs={false}
      />,
    );
    return capturedOptions?.plugins?.tooltip?.callbacks;
  };

  it('formats the title label "YYYY M" as "Mon YYYY"', () => {
    const title = getCallbacks()?.title as unknown as TitleFn;
    expect(title([{ label: '2026 5' }])).toBe('May 2026');
  });

  it('returns an empty title when there are no items', () => {
    const title = getCallbacks()?.title as unknown as TitleFn;
    expect(title([])).toBe('');
  });

  it('formats the label as "<line>: <comma-grouped ridership>"', () => {
    const label = getCallbacks()?.label as unknown as LabelFn;
    expect(label({ dataset: { label: 'A Line' }, parsed: { y: 12345 } })).toBe(
      'A Line: 12,345',
    );
  });
});

describe('eventMarkers plugin hover', () => {
  type AfterEvent = (
    chart: unknown,
    args: { event: { type: string; x: number }; inChartArea: boolean; changed?: boolean },
    opts: unknown,
  ) => void;
  type AfterDraw = (chart: unknown, args: unknown, opts: unknown) => void;

  const markerEvent: TransitEvent = {
    id: 'd-line-section-1-extension',
    date: '2026-05',
    line_ids: [805],
    title: 'D Line Section 1 Extension',
    description: 'Extended westward to three new Westside stations.',
    category: 'extension',
  };

  const makeCtx = () => ({
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    setLineDash: vi.fn(),
    measureText: vi.fn(() => ({ width: 40 })),
    arcTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn(),
    lineWidth: 0,
    strokeStyle: '',
    fillStyle: '',
    font: '',
    textBaseline: 'alphabetic' as CanvasTextBaseline,
  });

  const makeChart = (hoveredEventId: string | null = null) => ({
    $eventMarkers: [] as { xPos: number; event: TransitEvent }[],
    $hoveredEventId: hoveredEventId,
    options: { plugins: { eventMarkers: { events: [markerEvent] } } },
    data: { labels: ['2026 4', '2026 5'] },
    scales: { x: { getPixelForValue: (i: number) => 50 + i * 50 } },
    chartArea: { top: 10, bottom: 200, left: 0, right: 300 },
    ctx: makeCtx(),
  });

  // Cast the registered plugin so its hooks are called directly on the object
  // (avoids @typescript-eslint/unbound-method from extracting the methods).
  type MarkerPlugin = { afterEvent: AfterEvent; afterDraw: AfterDraw };
  const markerPlugin = () =>
    ChartJS.registry.getPlugin('eventMarkers') as unknown as MarkerPlugin;

  it('is registered with ChartJS', () => {
    expect(ChartJS.registry.getPlugin('eventMarkers')).toBeDefined();
  });

  it('caches marker hitboxes at their x-pixel position after drawing', () => {
    const chart = makeChart();
    markerPlugin().afterDraw(chart, {}, {});
    // label "2026 5" is index 1 → getPixelForValue(1) = 100
    expect(chart.$eventMarkers).toHaveLength(1);
    expect(chart.$eventMarkers[0].xPos).toBe(100);
    expect(chart.$eventMarkers[0].event.id).toBe('d-line-section-1-extension');
    expect(chart.ctx.stroke).toHaveBeenCalled();
  });

  it('marks an event hovered when the cursor is near its marker', () => {
    const chart = makeChart();
    chart.$eventMarkers = [{ xPos: 100, event: markerEvent }];
    const args = { event: { type: 'mousemove', x: 103 }, inChartArea: true, changed: false };
    markerPlugin().afterEvent(chart, args, {});
    expect(chart.$hoveredEventId).toBe('d-line-section-1-extension');
    expect(args.changed).toBe(true);
  });

  it('does not hover when the cursor is far from any marker', () => {
    const chart = makeChart();
    chart.$eventMarkers = [{ xPos: 100, event: markerEvent }];
    const args = { event: { type: 'mousemove', x: 250 }, inChartArea: true, changed: false };
    markerPlugin().afterEvent(chart, args, {});
    expect(chart.$hoveredEventId).toBeNull();
    expect(args.changed).toBe(false);
  });

  it('draws the tooltip box (title text) for the hovered marker', () => {
    const chart = makeChart('d-line-section-1-extension');
    markerPlugin().afterDraw(chart, {}, {});
    expect(chart.ctx.fillText).toHaveBeenCalledWith(
      'D Line Section 1 Extension',
      expect.any(Number),
      expect.any(Number),
    );
  });
});
