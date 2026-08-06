import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import App from './App';
import type { ChartDataset } from 'chart.js';
import type { CustomChartData } from './@types/chart.types';

// Ridership fixture covering multiple scenarios:
//   Line 807 (K Line): 2019-01 (before default start Jul 2020), 2022-01 (in range), 2026-01 (in range)
//   Line 806 (L Line): 2022-01 (in range, inserted before K Line so numeric key order != alphabetical)
//   Line 804 (E Line): four months spanning 2020-08 → 2026-01 (long series)
//   Line 805 (D Line): 2025-07 and 2026-01 only (short series that starts mid-window).
//     D sorts before E alphabetically, so the short series is the *first* dataset —
//     the shape that used to scramble the x-axis.
// The app fetches /ridership.json as a columnar { cols, rows } blob (emitted by the
// ridership-data Vite plugin) and decodes it, so the fetch mock serves that shape.
const RIDERSHIP_RECORDS = [
  { year: 2019, month: 1, line_name: 807, est_wkday_ridership: 1000, est_sat_ridership: 600, est_sun_ridership: 400 },
  { year: 2020, month: 8, line_name: 804, est_wkday_ridership: 4000, est_sat_ridership: 2000, est_sun_ridership: 1000 },
  { year: 2022, month: 1, line_name: 807, est_wkday_ridership: 5000, est_sat_ridership: 3000, est_sun_ridership: 2000 },
  { year: 2022, month: 1, line_name: 806, est_wkday_ridership: 8000, est_sat_ridership: 5000, est_sun_ridership: 3000 },
  { year: 2022, month: 1, line_name: 804, est_wkday_ridership: 4400, est_sat_ridership: 2200, est_sun_ridership: 1100 },
  { year: 2025, month: 7, line_name: 804, est_wkday_ridership: 4800, est_sat_ridership: 2400, est_sun_ridership: 1200 },
  { year: 2025, month: 7, line_name: 805, est_wkday_ridership: 700, est_sat_ridership: 350, est_sun_ridership: 175 },
  { year: 2026, month: 1, line_name: 807, est_wkday_ridership: 9000, est_sat_ridership: 7000, est_sun_ridership: 5000 },
  { year: 2026, month: 1, line_name: 804, est_wkday_ridership: 5200, est_sat_ridership: 2600, est_sun_ridership: 1300 },
  { year: 2026, month: 1, line_name: 805, est_wkday_ridership: 900, est_sat_ridership: 450, est_sun_ridership: 225 },
];

const RIDERSHIP_COLUMNAR = {
  cols: ['year', 'month', 'line_name', 'est_wkday_ridership', 'est_sat_ridership', 'est_sun_ridership'],
  rows: RIDERSHIP_RECORDS.map((r) => [
    r.year,
    r.month,
    r.line_name,
    r.est_wkday_ridership,
    r.est_sat_ridership,
    r.est_sun_ridership,
  ]),
};

let capturedDatasets: ChartDataset<'line', CustomChartData[]>[] = [];

vi.mock('./components/OutputArea', () => ({
  default: ({
    chartDatasets,
    showContextLogs,
  }: {
    chartDatasets: ChartDataset<'line', CustomChartData[]>[];
    showContextLogs: boolean;
  }) => {
    capturedDatasets = chartDatasets;
    return (
      <div data-testid="output-area">
        {showContextLogs && <div data-testid="context-log-panel" />}
      </div>
    );
  },
}));

vi.mock('./components/Header', () => ({ default: () => <div /> }));
vi.mock('./components/Footer', () => ({ default: () => <div /> }));
vi.mock('./components/DateRangeSelector', () => ({ default: () => <div /> }));
vi.mock('./components/LineSelector', () => ({ default: () => <div /> }));

beforeEach(() => {
  capturedDatasets = [];
  window.history.replaceState({}, '', '/');
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve(RIDERSHIP_COLUMNAR),
      } as Response),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Helper: wait for all effects to settle by polling until datasets stabilise
async function waitForDatasets(minLength = 1) {
  await waitFor(() => {
    expect(capturedDatasets.length).toBeGreaterThanOrEqual(minLength);
  });
}

describe('App chart dataset ordering', () => {
  it('places K Line before L Line in datasets (alphabetical, not numeric id order)', async () => {
    // Lines 806 (L Line) and 807 (K Line). Numerically 806 < 807, but
    // alphabetically K < L. The fix ensures datasets follow lineNameSortFunction
    // order, so K Line should appear before L Line.
    window.history.replaceState({}, '', '?lines=806,807');

    render(<App />);

    await waitForDatasets(2);

    const labels = capturedDatasets.map((ds) => ds.label);
    expect(labels.indexOf('K Line')).toBeGreaterThan(-1);
    expect(labels.indexOf('L Line')).toBeGreaterThan(-1);
    expect(labels.indexOf('K Line')).toBeLessThan(labels.indexOf('L Line'));
  });
});

// The derivation rules these used to assert — line selection, day-of-week field
// choice, the month window's boundaries, aggregate ordering and the shared month
// axis — now live in src/ridership/buildRidershipView.test.ts, where they are
// reachable without rendering App. What stays here is wiring: one test per URL
// param that has to reach the module, plus the fetch path.

describe('App - day of week wiring', () => {
  it('threads the day param through the hook into the module', async () => {
    window.history.replaceState({}, '', '?lines=807&day=sat');

    render(<App />);

    await waitForDatasets(1);

    // K Line 2022-01: est_sat_ridership = 3000
    const kLine = capturedDatasets.find((ds) => ds.label === 'K Line');
    expect(kLine?.data[0].stat).toBe(3000);
  });
});

describe('App - date range wiring', () => {
  it('threads the start and end params through the hook into the module', async () => {
    // start=2021-01 excludes the 2019-01 K Line record; end=2024-01 excludes the
    // 2026-01 one. The end is pinned explicitly — vitest resolves
    // virtual:ridership-bounds from the real dataset, so the default end tracks
    // live data and would otherwise move this assertion.
    window.history.replaceState({}, '', '?lines=807&start=2021-01&end=2024-01');

    render(<App />);

    await waitForDatasets(1);

    const kLine = capturedDatasets.find((ds) => ds.label === 'K Line');
    expect(kLine?.data).toHaveLength(1);
    expect(kLine?.data[0].stat).toBe(5000);
  });
});

describe('App - aggregate wiring', () => {
  it('threads aggregate=1 through the hook into the module', async () => {
    window.history.replaceState({}, '', '?lines=806,807&aggregate=1');

    // 2 lines + 1 aggregate = 3
    render(<App />);

    await waitForDatasets(3);

    const labels = capturedDatasets.map((ds) => ds.label);
    expect(labels).toContain('Aggregate');
  });
});

describe('App - context log panel', () => {
  it('renders the context log panel when logs=1', async () => {
    window.history.replaceState({}, '', '?lines=807&logs=1');

    const { getByTestId } = render(<App />);

    await waitForDatasets(1);

    expect(getByTestId('context-log-panel')).toBeTruthy();
  });

  it('does not render the context log panel when the logs param is absent', async () => {
    window.history.replaceState({}, '', '?lines=807');

    const { queryByTestId } = render(<App />);

    await waitForDatasets(1);

    expect(queryByTestId('context-log-panel')).toBeNull();
  });
});

describe('App - ridership fetch', () => {
  it('renders with no datasets until the columnar fetch resolves into the module', async () => {
    window.history.replaceState({}, '', '?lines=807');

    render(<App />);

    // Before the fetch settles there are no records, so the module yields the
    // empty view; afterwards the decoded records reach it.
    expect(capturedDatasets).toHaveLength(0);

    await waitForDatasets(1);

    expect(capturedDatasets[0].label).toBe('K Line');
  });
});
