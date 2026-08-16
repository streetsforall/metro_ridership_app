import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import OutputArea from '../OutputArea';
import type { LineReadout } from '../../ridership';
import { makeLineReadout, makeTransitEvent } from '../../test/builders';
import type { TransitEvent } from '../../@types/events.types';
import type { RidershipChartProps } from '../RidershipChart';

/**
 * The chart's own behaviour lives in `RidershipChart.test.tsx`. Here it is a
 * props sink, because what OutputArea is responsible for is the state the chart
 * and the context log share — which of them owns it, and that each sees the
 * other's changes.
 */
let chartProps: RidershipChartProps | undefined;

vi.mock('../RidershipChart', () => ({
  default: (props: RidershipChartProps) => {
    chartProps = props;
    return <canvas data-testid="line-chart" />;
  },
}));

vi.mock('../Map', () => ({
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
      chartProps?.onPinnedMonthRequest('2023 2');
    });
    expect(logRow().getAttribute('aria-pressed')).toBe('true');
  });
});

/**
 * The release-first rule, asserted here rather than in either child, because
 * here is the only seam that can see it hold across *both* of them. A rule that
 * held on the chart and not in the log would be two rules and a reader would
 * have to learn which surface they were on.
 */
describe('a pinned month is released before another is taken', () => {
  const logRow = () => screen.getByRole('button', { name: /Regional Connector/ });

  it('releases rather than moving the pin when the chart names another month', () => {
    renderWithEvents();
    act(() => chartProps?.onPinnedMonthRequest('2023 2'));
    act(() => chartProps?.onPinnedMonthRequest('2020 6'));
    expect(chartProps?.pinnedMonth).toBeNull();
  });

  it('pins the new month on a further request', () => {
    renderWithEvents();
    act(() => chartProps?.onPinnedMonthRequest('2023 2'));
    act(() => chartProps?.onPinnedMonthRequest('2020 6'));
    act(() => chartProps?.onPinnedMonthRequest('2020 6'));
    expect(chartProps?.pinnedMonth).toBe('2020 6');
  });

  it('releases when the chart names the month already pinned', () => {
    renderWithEvents();
    act(() => chartProps?.onPinnedMonthRequest('2023 2'));
    act(() => chartProps?.onPinnedMonthRequest('2023 2'));
    expect(chartProps?.pinnedMonth).toBeNull();
  });

  /** Pinned on the chart, clicked in the log: one rule, not one per surface. */
  it('releases a chart pin when a log row is clicked', () => {
    renderWithEvents();
    act(() => chartProps?.onPinnedMonthRequest('2020 6'));
    fireEvent.click(logRow());
    expect(chartProps?.pinnedMonth).toBeNull();
  });

  /** And the other way round. */
  it('releases a log pin when the chart names a different month', () => {
    renderWithEvents();
    fireEvent.click(logRow());
    expect(chartProps?.pinnedMonth).toBe('2023 2');

    act(() => chartProps?.onPinnedMonthRequest('2020 6'));
    expect(chartProps?.pinnedMonth).toBeNull();
  });

  /** Escape and a click on empty plot both arrive as "no month". */
  it('releases on a request naming no month', () => {
    renderWithEvents();
    fireEvent.click(logRow());
    act(() => chartProps?.onPinnedMonthRequest(null));
    expect(chartProps?.pinnedMonth).toBeNull();
  });

  it('leaves nothing pinned when a request names no month and none was held', () => {
    renderWithEvents();
    act(() => chartProps?.onPinnedMonthRequest(null));
    expect(chartProps?.pinnedMonth).toBeNull();
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
