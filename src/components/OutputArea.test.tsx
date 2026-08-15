import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import OutputArea from './OutputArea';
import { Chart as ChartJS, type ChartOptions } from 'chart.js';
import colors from 'tailwindcss/colors';
import type { LineReadout } from '../ridership';
import { makeLineReadout } from '../test/builders';
import type { EventCategory, TransitEvent } from '../@types/events.types';

let capturedOptions: ChartOptions<'line'> | undefined;

vi.mock('react-chartjs-2', () => ({
  Line: ({ options }: { options: ChartOptions<'line'> }) => {
    capturedOptions = options;
    return <canvas data-testid="line-chart" />;
  },
}));

vi.mock('./Map', () => ({
  default: ({ lines }: { lines: LineReadout[] }) => (
    <div data-testid="map" data-line-count={String(lines.length)} />
  ),
}));

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
    const selectedLine = makeLineReadout({
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
        lines={[makeLineReadout({ selected: false })]}
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
    const lines = [makeLineReadout({ id: 801 }), makeLineReadout({ id: 802 })];
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

/**
 * The palette contract, restated independently of the component so the tests
 * fail on a table edit rather than following it. Order is `EventCategory`'s own,
 * and the list is exhaustive by construction — `Record<EventCategory, …>` means
 * adding a tenth category to the union breaks this file at compile time, which
 * is how a new category gets a color instead of silently inheriting the default.
 */
const EXPECTED_HUE: Record<
  EventCategory,
  { '100': string; '400': string; '500': string; '800': string }
> = {
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
  type AfterDraw = (chart: unknown, args: unknown, opts: unknown) => void;
  const markerPlugin = () =>
    ChartJS.registry.getPlugin('eventMarkers') as unknown as { afterDraw: AfterDraw };

  // One event per label, so marker N in the stroke log is category N. Nine
  // labels, because the widest case drives every category through in one pass.
  const labels = Array.from({ length: 9 }, (_, i) => `2020 ${i + 1}`);
  const makeEvent = (index: number, category: EventCategory): TransitEvent => ({
    id: `event-${index}`,
    date: `2020-${String(index + 1).padStart(2, '0')}`,
    line_ids: [801],
    title: `Event ${index}`,
    description: `Description ${index}`,
    category,
  });

  /**
   * Runs afterDraw over `categories` and returns the strokeStyle in force at each
   * stroke() — the marker rules first, then the hovered tooltip's border if any.
   */
  const strokesFor = (categories: EventCategory[], hoveredIndex?: number) => {
    const events = categories.map((category, i) => makeEvent(i, category));
    const ctx = makeCtx();
    const strokes: string[] = [];
    ctx.stroke = vi.fn(() => {
      strokes.push(ctx.strokeStyle);
    });
    const chart = {
      $eventMarkers: [] as { xPos: number; event: TransitEvent }[],
      $hoveredEventId: hoveredIndex === undefined ? null : `event-${hoveredIndex}`,
      options: { plugins: { eventMarkers: { events } } },
      data: { labels },
      scales: { x: { getPixelForValue: (i: number) => 50 + i * 50 } },
      chartArea: { top: 10, bottom: 200, left: 0, right: 300 },
      ctx,
    };
    markerPlugin().afterDraw(chart, {}, {});
    return strokes;
  };

  it('strokes every category in its own hue', () => {
    expect(strokesFor(ALL_CATEGORIES)).toEqual(
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
    const strokes = strokesFor(ALL_CATEGORIES);
    expect(new Set(strokes).size).toBe(ALL_CATEGORIES.length);
  });

  it('falls back to slate for a category outside the union', () => {
    // Events are fetched data, so an unknown category can dodge the type at runtime.
    const rogue = 'not_a_real_category' as EventCategory;
    expect(strokesFor([rogue])).toEqual([colors.slate['500']]);
  });

  it('borders the hovered tooltip in the hovered event category color', () => {
    // Markers stroke first, so the tooltip border is the last stroke.
    const strokes = strokesFor(['opening', 'disruption'], 1);
    expect(strokes).toHaveLength(3);
    expect(strokes[2]).toBe(colors.rose['500']);
  });
});

describe('context log panel category colors', () => {
  const panelEvent = (id: string, category: EventCategory): TransitEvent => ({
    id,
    date: '2023-02',
    line_ids: [801],
    title: `${id} title`,
    description: `${id} description`,
    category,
  });

  const renderPanel = (events: TransitEvent[]) =>
    render(
      <OutputArea
        chartDatasets={[datasetFixture]}
        months={['2023 2']}
        lines={[]}
        transitEvents={events}
        showContextLogs={true}
      />,
    );

  /** jsdom serializes inline colors its own way; normalize both sides the same. */
  const asBorderColor = (value: string) => {
    const el = document.createElement('div');
    el.style.borderColor = value;
    return el.style.borderColor;
  };

  const rowBorders = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('#context-log-panel li')).map(
      (row) => (row as HTMLElement).style.borderColor,
    );

  it('tints each row with its category color', () => {
    const { container } = renderPanel(
      ALL_CATEGORIES.map((category) => panelEvent(category, category)),
    );
    expect(rowBorders(container)).toEqual(
      ALL_CATEGORIES.map((category) => asBorderColor(EXPECTED_HUE[category]['500'])),
    );
  });

  /** Same mutation guard as the markers: a shared hue is the failure mode. */
  it('gives no two rows the same rule color', () => {
    const { container } = renderPanel(
      ALL_CATEGORIES.map((category) => panelEvent(category, category)),
    );
    expect(new Set(rowBorders(container)).size).toBe(ALL_CATEGORIES.length);
  });

  /** jsdom normalizes background-color the same way; go through an element for both. */
  const asColor = (prop: 'backgroundColor' | 'color', value: string) => {
    const el = document.createElement('div');
    el.style[prop] = value;
    return el.style[prop];
  };

  const chips = (container: HTMLElement) =>
    Array.from(container.querySelectorAll<HTMLElement>('#context-log-panel li span[style]'));

  /**
   * The chip is the one place the palette carries *text*, so it is the one place
   * contrast is load-bearing rather than decorative — 100 behind 800, never the
   * 500 the chart strokes with, which would be unreadable under text.
   */
  it('fills each chip from its category, light behind dark', () => {
    const { container } = renderPanel(
      ALL_CATEGORIES.map((category) => panelEvent(category, category)),
    );
    expect(
      chips(container).map((chip) => [chip.style.backgroundColor, chip.style.color]),
    ).toEqual(
      ALL_CATEGORIES.map((category) => [
        asColor('backgroundColor', EXPECTED_HUE[category]['100']),
        asColor('color', EXPECTED_HUE[category]['800']),
      ]),
    );
  });

  it('gives no two chips the same fill', () => {
    const { container } = renderPanel(
      ALL_CATEGORIES.map((category) => panelEvent(category, category)),
    );
    const fills = chips(container).map((chip) => chip.style.backgroundColor);
    expect(new Set(fills).size).toBe(ALL_CATEGORIES.length);
  });

  it('also spells the category out, so color is not the only signal', () => {
    renderPanel([panelEvent('rescheduled', 'headway_change')]);
    expect(screen.getByText('Headway change')).toBeTruthy();
  });

  it('falls back to slate for an unknown category', () => {
    const { container } = renderPanel([
      panelEvent('mystery', 'not_a_real_category' as EventCategory),
    ]);
    const row = container.querySelector('#context-log-panel li') as HTMLElement;
    expect(row.style.borderColor).toBe(asBorderColor(colors.slate['500']));
  });

  it('falls back to slate when an event carries no category at all', () => {
    const missing = panelEvent('untyped', 'opening');
    delete (missing as Partial<TransitEvent>).category;
    const { container } = renderPanel([missing]);
    const row = container.querySelector('#context-log-panel li') as HTMLElement;
    // Same hue as an explicit service_change — both mean "something changed,
    // nobody said what", and the label agrees with the color.
    expect(row.style.borderColor).toBe(asBorderColor(colors.slate['500']));
    expect(screen.getByText('Service change')).toBeTruthy();
  });
});
