import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import OutputArea from './OutputArea';
import type { Line } from '../@types/lines.types';

vi.mock('react-chartjs-2', () => ({
  Line: () => <canvas data-testid="line-chart" />,
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
