import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { Chart as ChartJS, type ChartData, type ChartOptions } from 'chart.js';
import ChartPanel from './ChartPanel';
import { makeDashboardValue, renderWithDashboard } from './testUtils';
import type { CustomChartData } from '../../@types/chart.types';

let capturedOptions: ChartOptions<'line'> | undefined;
let capturedData: ChartData<'line', CustomChartData[]> | undefined;

vi.mock('react-chartjs-2', () => ({
  Line: ({
    options,
    data,
  }: {
    options: ChartOptions<'line'>;
    data: ChartData<'line', CustomChartData[]>;
  }) => {
    capturedOptions = options;
    capturedData = data;
    return <canvas data-testid="line-chart" />;
  },
}));

const datasetFixture = {
  data: [{ time: '2022 1', stat: 5000 }] as CustomChartData[],
  label: 'A Line',
  backgroundColor: '#0072bc',
  borderColor: '#0072bc',
};

const withDataset = () =>
  makeDashboardValue({
    chartDatasets: [datasetFixture],
    monthList: ['2022 1'],
  });

beforeEach(() => {
  capturedOptions = undefined;
  capturedData = undefined;
});

describe('ChartPanel with no datasets', () => {
  it('shows the "Please select a Metro line." placeholder', () => {
    renderWithDashboard(<ChartPanel />, makeDashboardValue());
    expect(screen.getByText('Please select a Metro line.')).toBeTruthy();
  });

  it('does not render the chart', () => {
    renderWithDashboard(<ChartPanel />, makeDashboardValue());
    expect(screen.queryByTestId('line-chart')).toBeNull();
  });
});

describe('ChartPanel with datasets', () => {
  it('renders the chart when at least one dataset is provided', () => {
    renderWithDashboard(<ChartPanel />, withDataset());
    expect(screen.getByTestId('line-chart')).toBeTruthy();
  });

  it('does not show the placeholder', () => {
    renderWithDashboard(<ChartPanel />, withDataset());
    expect(screen.queryByText('Please select a Metro line.')).toBeNull();
  });

  it('feeds monthList as labels and the context datasets as data', () => {
    renderWithDashboard(<ChartPanel />, withDataset());
    expect(capturedData?.labels).toEqual(['2022 1']);
    expect(capturedData?.datasets).toEqual([datasetFixture]);
  });

  it('disables maintainAspectRatio so the chart fills its panel', () => {
    renderWithDashboard(<ChartPanel />, withDataset());
    expect(capturedOptions?.maintainAspectRatio).toBe(false);
  });

  it('sets intersect to false so the crosshair activates anywhere in a column', () => {
    renderWithDashboard(<ChartPanel />, withDataset());
    expect(capturedOptions?.interaction?.intersect).toBe(false);
  });
});

describe('tooltip itemSort', () => {
  type SimpleItem = { parsed: { y: number | null } };
  type ItemSortFn = (a: SimpleItem, b: SimpleItem) => number;

  const getItemSort = (): ItemSortFn => {
    renderWithDashboard(<ChartPanel />, withDataset());
    return capturedOptions?.plugins?.tooltip
      ?.itemSort as unknown as ItemSortFn;
  };

  it('is defined on the chart options', () => {
    renderWithDashboard(<ChartPanel />, withDataset());
    expect(capturedOptions?.plugins?.tooltip?.itemSort).toBeDefined();
  });

  it('places the higher-ridership item first', () => {
    const fn = getItemSort();
    const high = { parsed: { y: 10000 } };
    const low = { parsed: { y: 5000 } };
    expect(fn(high, low)).toBeLessThan(0);
    expect(fn(low, high)).toBeGreaterThan(0);
  });

  it('returns 0 for equal ridership values', () => {
    const fn = getItemSort();
    const item = { parsed: { y: 7500 } };
    expect(fn(item, item)).toBe(0);
  });

  it('treats null parsed.y as 0', () => {
    const fn = getItemSort();
    const nullItem = { parsed: { y: null } };
    const positiveItem = { parsed: { y: 5000 } };
    expect(fn(nullItem, positiveItem)).toBeGreaterThan(0);
    expect(fn(positiveItem, nullItem)).toBeLessThan(0);
  });
});

describe('hoverCrosshair plugin', () => {
  const makeMockChart = (hasActive: boolean) => ({
    tooltip: {
      getActiveElements: () => (hasActive ? [{ element: { x: 100 } }] : []),
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
