import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import OutputArea from './OutputArea';
import type { LineReadout } from '../ridership';
import { makeLineReadout, makeTransitEvent } from '../test/builders';
import type { TransitEvent } from '../@types/events.types';
import type { RidershipChartProps } from './RidershipChart';

/**
 * The chart's own behaviour lives in `RidershipChart.test.tsx`. Here it is a
 * props sink, because what OutputArea is responsible for is the state the chart
 * and the context log share — which of them owns it, and that each sees the
 * other's changes.
 */
let chartProps: RidershipChartProps | undefined;

vi.mock('./RidershipChart', () => ({
  default: (props: RidershipChartProps) => {
    chartProps = props;
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

const transitEventFixture = makeTransitEvent({
  id: 'regional-connector-opening',
  date: '2023-02',
  line_ids: [801, 803, 804, 806],
  title: 'Regional Connector Opening',
  description:
    'The Regional Connector linked the A, C, E, and L lines through a new downtown tunnel.',
  category: 'opening',
});

const datasetFixture = {
  data: [{ time: '2023 2', stat: 5000 }] as { time: string; stat: number }[],
  label: 'A Line',
  backgroundColor: '#0072bc',
  borderColor: '#0072bc',
};

const renderWithEvents = (props = {}) =>
  render(
    <OutputArea
      chartDatasets={[datasetFixture]}
      months={['2023 2']}
      lines={[]}
      transitEvents={[transitEventFixture]}
      showContextLogs={true}
      {...props}
    />,
  );

beforeEach(() => {
  chartProps = undefined;
});

describe('OutputArea with no datasets', () => {
  it('shows the "Please select a Metro line." placeholder', () => {
    render(<OutputArea {...emptyProps} />);
    expect(screen.getByText('Please select a Metro line.')).toBeTruthy();
  });

  it('says so while the ridership data is still loading', () => {
    render(<OutputArea {...emptyProps} isLoading />);
    expect(screen.getByText('Loading ridership data…')).toBeTruthy();
  });

  it('does not render the chart when there are no datasets', () => {
    render(<OutputArea {...emptyProps} />);
    expect(screen.queryByTestId('line-chart')).toBeNull();
  });
});

describe('OutputArea with datasets', () => {
  it('renders the chart when at least one dataset is provided', () => {
    renderWithEvents();
    expect(screen.getByTestId('line-chart')).toBeTruthy();
  });

  it('does not show the placeholder when datasets are provided', () => {
    renderWithEvents();
    expect(screen.queryByText('Please select a Metro line.')).toBeNull();
  });

  it('renders SummaryData for the passed lines', () => {
    renderWithEvents({
      lines: [
        makeLineReadout({
          selected: true,
          averageRidership: 4000,
          changeInRidership: 200,
          endingRidership: 4200,
        }),
      ],
    });
    expect(screen.getByText('Average Ridership')).toBeTruthy();
  });

  it('does not render SummaryData stats when no lines are selected', () => {
    renderWithEvents({ lines: [makeLineReadout({ selected: false })] });
    expect(screen.queryByText('Average Ridership')).toBeNull();
  });

  it('hands the chart its datasets, months and events', () => {
    renderWithEvents();
    expect(chartProps?.chartDatasets).toHaveLength(1);
    expect(chartProps?.months).toEqual(['2023 2']);
    expect(chartProps?.transitEvents).toHaveLength(1);
  });

  it('passes the range-select callback through to the chart', () => {
    const onRangeSelect = vi.fn();
    renderWithEvents({ onRangeSelect });
    chartProps?.onRangeSelect?.('2020 1', '2020 6');
    expect(onRangeSelect).toHaveBeenCalledWith('2020 1', '2020 6');
  });
});

describe('OutputArea Map', () => {
  it('always renders the Map component even when there are no datasets', () => {
    render(<OutputArea {...emptyProps} />);
    expect(screen.getByTestId('map')).toBeTruthy();
  });

  it('passes the lines prop through to the Map component', () => {
    render(
      <OutputArea
        {...emptyProps}
        lines={[makeLineReadout({ id: 801 }), makeLineReadout({ id: 802 })]}
      />,
    );
    expect(screen.getByTestId('map').getAttribute('data-line-count')).toBe('2');
  });
});

/**
 * Panel Settings crossed with what there is to show. The chart's own gate is
 * still `hasSelection`; the settings only ever take a panel away.
 */
describe('panel visibility settings', () => {
  it('hides the chart when showChart is false', () => {
    renderWithEvents({ showChart: false });
    expect(screen.queryByTestId('line-chart')).toBeNull();
  });

  it('falls back to the placeholder rather than a second empty state', () => {
    const { container } = renderWithEvents({ showChart: false });
    expect(container.querySelector('#output-placeholder')).toBeTruthy();
    expect(
      screen.getByText('Chart hidden — turn it back on in Panel Settings.'),
    ).toBeTruthy();
  });

  it('still says to select a line when nothing is selected and the chart is off', () => {
    render(<OutputArea {...emptyProps} showChart={false} />);
    expect(screen.getByText('Please select a Metro line.')).toBeTruthy();
  });

  it('hides the summary when showSummary is false', () => {
    renderWithEvents({
      showSummary: false,
      lines: [makeLineReadout({ selected: true })],
    });
    expect(screen.queryByText('Average Ridership')).toBeNull();
  });

  it('hides the map panel when showMap is false', () => {
    const { container } = renderWithEvents({ showMap: false });
    expect(container.querySelector('#map-panel')?.className).toContain('hidden');
  });

  it('keeps the Map mounted when showMap is false', () => {
    renderWithEvents({ showMap: false });
    expect(screen.getByTestId('map')).toBeTruthy();
  });

  it('hides the context log panel when showContextLogs is false', () => {
    renderWithEvents({ showContextLogs: false });
    expect(screen.queryByText('Regional Connector Opening')).toBeNull();
  });

  it('splits the summary/map row only when both are on screen', () => {
    const { container } = renderWithEvents({
      lines: [makeLineReadout({ selected: true })],
    });
    expect(
      container.querySelector('#map-panel')?.parentElement?.className,
    ).toContain('lg:grid-cols-[2fr_3fr]');
  });

  it('drops back to one column when the summary is hidden', () => {
    const { container } = renderWithEvents({
      showSummary: false,
      lines: [makeLineReadout({ selected: true })],
    });
    expect(
      container.querySelector('#map-panel')?.parentElement?.className,
    ).not.toContain('lg:grid-cols-[2fr_3fr]');
  });

  it('drops back to one column when the map is hidden', () => {
    const { container } = renderWithEvents({
      showMap: false,
      lines: [makeLineReadout({ selected: true })],
    });
    expect(
      container.querySelector('#map-panel')?.parentElement?.className,
    ).not.toContain('lg:grid-cols-[2fr_3fr]');
  });

  it('leaves the placeholder standing when every panel is off', () => {
    const { container } = renderWithEvents({
      showChart: false,
      showSummary: false,
      showMap: false,
      showContextLogs: false,
      lines: [makeLineReadout({ selected: true })],
    });
    expect(container.querySelector('#output-placeholder')).toBeTruthy();
    expect(screen.queryByText('Average Ridership')).toBeNull();
  });
});

describe('context log panel visibility', () => {
  it('does not render the panel when transitEvents is empty', () => {
    renderWithEvents({ transitEvents: [] });
    expect(screen.queryByText('Context Logs')).toBeNull();
  });

  it('does not render the panel when there are events but no line is selected', () => {
    renderWithEvents({ chartDatasets: [], months: [] });
    expect(screen.queryByText('Context Logs')).toBeNull();
  });

  it('does not render the panel when showContextLogs is false', () => {
    renderWithEvents({ showContextLogs: false });
    expect(screen.queryByText('Context Logs')).toBeNull();
    expect(screen.queryByText('Regional Connector Opening')).toBeNull();
  });

  it('renders the panel when events and datasets are both present', () => {
    renderWithEvents();
    expect(screen.getByText('Context Logs')).toBeTruthy();
    expect(screen.getByText('Regional Connector Opening')).toBeTruthy();
  });
});

/**
 * The pinned and hovered months live in OutputArea precisely so these two
 * children stay in agreement. Each direction is one assertion that the state
 * crossed from one child to the other.
 */
describe('chart ↔ context log', () => {
  const logRow = () => screen.getByRole('button', { name: /Regional Connector/ });

  it('starts with nothing pinned or highlighted', () => {
    renderWithEvents();
    expect(chartProps?.pinnedMonth).toBeNull();
    expect(chartProps?.highlightedMonth).toBeNull();
  });

  it('pins the chart month when a log row is clicked', () => {
    renderWithEvents();
    fireEvent.click(logRow());
    expect(chartProps?.pinnedMonth).toBe('2023 2');
  });

  it('unpins when the same log row is clicked again', () => {
    renderWithEvents();
    fireEvent.click(logRow());
    fireEvent.click(logRow());
    expect(chartProps?.pinnedMonth).toBeNull();
  });

  it('highlights the chart month while a log row is hovered', () => {
    renderWithEvents();
    fireEvent.mouseEnter(logRow());
    expect(chartProps?.highlightedMonth).toBe('2023 2');
  });

  it('drops the highlight when the cursor leaves the row', () => {
    renderWithEvents();
    fireEvent.mouseEnter(logRow());
    fireEvent.mouseLeave(logRow());
    expect(chartProps?.highlightedMonth).toBeNull();
  });

  it('marks the log row pressed when the chart pins its month', () => {
    renderWithEvents();
    act(() => {
      chartProps?.onPinnedMonthChange('2023 2');
    });
    expect(logRow().getAttribute('aria-pressed')).toBe('true');
  });
});

/**
 * The pin is released by a press outside the chart *and* the log together. A
 * listener scoped to the chart alone would fire on the press half of a log row
 * click, unpin, and then watch the click re-pin — so the pin could never be
 * released from the panel at all.
 */
describe('releasing the pin by pressing outside', () => {
  const logRow = () => screen.getByRole('button', { name: /Regional Connector/ });

  it('unpins on a press outside the output area', () => {
    renderWithEvents();
    fireEvent.click(logRow());
    expect(chartProps?.pinnedMonth).toBe('2023 2');

    fireEvent.pointerDown(document.body);
    expect(chartProps?.pinnedMonth).toBeNull();
  });

  it('survives the press half of a click on a log row', () => {
    renderWithEvents();
    fireEvent.pointerDown(logRow());
    fireEvent.click(logRow());
    expect(chartProps?.pinnedMonth).toBe('2023 2');
  });

  it('survives a press on the chart itself', () => {
    renderWithEvents();
    fireEvent.click(logRow());
    fireEvent.pointerDown(screen.getByTestId('line-chart'));
    expect(chartProps?.pinnedMonth).toBe('2023 2');
  });
});

/**
 * OutputArea owns the two sizes that are layout rather than panel content — the
 * split of the summary|map row, and the map's height floor. Both are asserted as
 * classes, which is the whole point of the design: ADR-0008 keeps every size
 * expressible as a fixed class precisely because the e2e `ResizeObserver` stub
 * makes anything measured in JavaScript inert under Playwright.
 *
 * The chart's and the log's sizes only pass through here, so they are asserted
 * as the props they arrive as.
 */
describe('panel sizes', () => {
  const row = (container: HTMLElement) =>
    container.querySelector('#map-panel')?.parentElement;

  it('splits the row 40/60 by default', () => {
    const { container } = renderWithEvents();
    expect(row(container)?.className).toContain('lg:grid-cols-[2fr_3fr]');
  });

  it('splits the row evenly at 50', () => {
    const { container } = renderWithEvents({ summarySplit: 50 });
    expect(row(container)?.className).toContain('lg:grid-cols-[1fr_1fr]');
  });

  it('gives the map 70% at 30', () => {
    const { container } = renderWithEvents({ summarySplit: 30 });
    expect(row(container)?.className).toContain('lg:grid-cols-[3fr_7fr]');
  });

  /**
   * With no summary beside it the map spans the row, so there is nothing to
   * split — the split class must not appear at all rather than describing a
   * one-column grid.
   */
  it('drops the split entirely when the summary is hidden', () => {
    const { container } = renderWithEvents({ showSummary: false, summarySplit: 30 });
    expect(row(container)?.className).not.toContain('lg:grid-cols-');
  });

  it('holds the map floor at 400px by default', () => {
    const { container } = renderWithEvents();
    expect(container.querySelector('#map-panel')?.className).toContain(
      '[--map-min-height:400px]',
    );
  });

  it('drops the map floor to 280px at small', () => {
    const { container } = renderWithEvents({ mapSize: 'small' });
    expect(container.querySelector('#map-panel')?.className).toContain(
      '[--map-min-height:280px]',
    );
  });

  it('raises the map floor to 560px at large', () => {
    const { container } = renderWithEvents({ mapSize: 'large' });
    expect(container.querySelector('#map-panel')?.className).toContain(
      '[--map-min-height:560px]',
    );
  });

  /**
   * The floor is a custom property, not a height. A `min-height` is what lets
   * the map keep filling a pane that a taller summary beside it stretched; a
   * height would win that back into a fixed box.
   */
  it('never puts a height on the map panel', () => {
    const { container } = renderWithEvents({ mapSize: 'large' });
    expect(container.querySelector('#map-panel')?.className).not.toMatch(/\bh-\[/);
  });

  it('passes the chart size straight through', () => {
    renderWithEvents({ chartSize: 'small' });
    expect(chartProps?.size).toBe('small');
  });

  it('sizes the chart standard when nothing is passed', () => {
    renderWithEvents();
    expect(chartProps?.size).toBe('standard');
  });

  it('caps the context log at 32rem by default', () => {
    const { container } = renderWithEvents();
    expect(container.querySelector('#context-log-panel ol')?.className).toContain(
      'max-h-[32rem]',
    );
  });

  it('caps the context log at 16rem at small', () => {
    const { container } = renderWithEvents({ logSize: 'small' });
    expect(container.querySelector('#context-log-panel ol')?.className).toContain(
      'max-h-[16rem]',
    );
  });

  it('leaves the context log uncapped at large', () => {
    const { container } = renderWithEvents({ logSize: 'large' });
    const list = container.querySelector('#context-log-panel ol')?.className;
    expect(list).not.toContain('max-h-');
    expect(list).not.toContain('overflow-y-auto');
  });
});
