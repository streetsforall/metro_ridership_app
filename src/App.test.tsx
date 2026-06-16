import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import App from './App';
import type { ChartDataset } from 'chart.js';
import type { CustomChartData } from './@types/chart.types';

// Minimal ridership data: K Line (807) inserted before L Line (806) in the array.
// Without the fix, Object.entries() enumerates integer-like keys in ascending numeric
// order (806, 807), so L Line would appear before K Line in the datasets. With the
// fix, datasets follow the lines array order (lineNameSortFunction: alphabetical),
// giving K before L.
vi.mock('./data/ridership.json', () => ({
  default: [
    {
      year: 2022,
      month: 1,
      line_name: 807,
      est_wkday_ridership: 5000,
      est_sat_ridership: 3000,
      est_sun_ridership: 2000,
    },
    {
      year: 2022,
      month: 1,
      line_name: 806,
      est_wkday_ridership: 8000,
      est_sat_ridership: 5000,
      est_sun_ridership: 3000,
    },
  ],
}));

let capturedDatasets: ChartDataset<'line', CustomChartData[]>[] = [];

vi.mock('./components/OutputArea', () => ({
  default: ({
    chartDatasets,
  }: {
    chartDatasets: ChartDataset<'line', CustomChartData[]>[];
  }) => {
    capturedDatasets = chartDatasets;
    return <div data-testid="output-area" />;
  },
}));

vi.mock('./components/Header', () => ({ default: () => <div /> }));
vi.mock('./components/Footer', () => ({ default: () => <div /> }));
vi.mock('./components/DateRangeSelector', () => ({ default: () => <div /> }));
vi.mock('./components/LineSelector', () => ({ default: () => <div /> }));

beforeEach(() => {
  capturedDatasets = [];
  window.history.replaceState({}, '', '/');
});

describe('App chart dataset ordering', () => {
  it('places K Line before L Line in datasets (alphabetical, not numeric id order)', async () => {
    // Lines 806 (L Line) and 807 (K Line). Numerically 806 < 807, but
    // alphabetically K < L. The fix ensures datasets follow lineNameSortFunction
    // order, so K Line should appear before L Line.
    window.history.replaceState({}, '', '?lines=806,807');

    render(<App />);

    await waitFor(() => {
      expect(capturedDatasets.length).toBeGreaterThan(0);
    });

    const labels = capturedDatasets.map((ds) => ds.label);
    expect(labels.indexOf('K Line')).toBeGreaterThan(-1);
    expect(labels.indexOf('L Line')).toBeGreaterThan(-1);
    expect(labels.indexOf('K Line')).toBeLessThan(labels.indexOf('L Line'));
  });
});
