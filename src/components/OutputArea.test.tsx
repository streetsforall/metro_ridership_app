import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import OutputArea from './OutputArea';
import type { ChartOptions } from 'chart.js';
import type { Line } from '../@types/lines.types';

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
      />,
    );
    expect(screen.getByTestId('map')).toBeTruthy();
  });

  it('passes the lines prop through to the Map component', () => {
    const lines = [makeLine({ id: 801 }), makeLine({ id: 802 })];
    render(<OutputArea chartDatasets={[]} months={[]} lines={lines} />);
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
