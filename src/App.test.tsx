import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
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
let capturedMonths: string[] = [];

vi.mock('./components/OutputArea', () => ({
  default: ({
    chartDatasets,
    months,
  }: {
    chartDatasets: ChartDataset<'line', CustomChartData[]>[];
    months: string[];
  }) => {
    capturedDatasets = chartDatasets;
    capturedMonths = months;
    return <div data-testid="output-area" />;
  },
}));

vi.mock('./components/Header', () => ({ default: () => <div /> }));
vi.mock('./components/Footer', () => ({ default: () => <div /> }));
vi.mock('./components/DateRangeSelector', () => ({ default: () => <div /> }));
vi.mock('./components/LineSelector', () => ({ default: () => <div /> }));

beforeEach(() => {
  capturedDatasets = [];
  capturedMonths = [];
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

describe('App - line selection', () => {
  it('produces empty datasets when no lines are selected', async () => {
    render(<App />);
    // Flush all effects; no lines selected so datasets should remain empty
    await act(async () => {});
    expect(capturedDatasets).toHaveLength(0);
  });

  it('produces one dataset for a single selected line', async () => {
    window.history.replaceState({}, '', '?lines=807');

    render(<App />);

    await waitForDatasets(1);

    expect(capturedDatasets).toHaveLength(1);
    expect(capturedDatasets[0].label).toBe('K Line');
  });

  it('produces one dataset per selected line', async () => {
    window.history.replaceState({}, '', '?lines=806,807');

    render(<App />);

    await waitForDatasets(2);

    const labels = capturedDatasets.map((ds) => ds.label);
    expect(labels).toContain('K Line');
    expect(labels).toContain('L Line');
  });

  it('assigns the correct brand color to each line', async () => {
    window.history.replaceState({}, '', '?lines=806,807');

    render(<App />);

    await waitForDatasets(2);

    const kLine = capturedDatasets.find((ds) => ds.label === 'K Line');
    const lLine = capturedDatasets.find((ds) => ds.label === 'L Line');

    expect(kLine?.borderColor).toBe('#e56db1'); // K Line pink
    expect(lLine?.borderColor).toBe('#f9a825'); // L Line gold
  });
});

describe('App - day of week', () => {
  it('uses weekday ridership by default', async () => {
    window.history.replaceState({}, '', '?lines=807');

    render(<App />);

    await waitForDatasets(1);

    // K Line 2022-01: est_wkday_ridership = 5000
    const kLine = capturedDatasets.find((ds) => ds.label === 'K Line');
    expect(kLine?.data[0].stat).toBe(5000);
  });

  it('uses weekday ridership when day=wkday', async () => {
    window.history.replaceState({}, '', '?lines=807&day=wkday');

    render(<App />);

    await waitForDatasets(1);

    const kLine = capturedDatasets.find((ds) => ds.label === 'K Line');
    expect(kLine?.data[0].stat).toBe(5000);
  });

  it('uses Saturday ridership when day=sat', async () => {
    window.history.replaceState({}, '', '?lines=807&day=sat');

    render(<App />);

    await waitForDatasets(1);

    // K Line 2022-01: est_sat_ridership = 3000
    const kLine = capturedDatasets.find((ds) => ds.label === 'K Line');
    expect(kLine?.data[0].stat).toBe(3000);
  });

  it('uses Sunday ridership when day=sun', async () => {
    window.history.replaceState({}, '', '?lines=807&day=sun');

    render(<App />);

    await waitForDatasets(1);

    // K Line 2022-01: est_sun_ridership = 2000
    const kLine = capturedDatasets.find((ds) => ds.label === 'K Line');
    expect(kLine?.data[0].stat).toBe(2000);
  });
});

describe('App - date range filtering', () => {
  it('excludes records before the start date', async () => {
    // start=2021-01 → Jan 2021; the 2019-01 K Line record is before this.
    // Pin the end so the assertion isolates start filtering (the default end
    // now tracks the latest data and would otherwise include 2026-01).
    window.history.replaceState({}, '', '?lines=807&start=2021-01&end=2024-01');

    render(<App />);

    await waitForDatasets(1);

    // Only 2022-01 survives: 2019-01 before start, 2026-01 after end
    const kLine = capturedDatasets.find((ds) => ds.label === 'K Line');
    expect(kLine?.data).toHaveLength(1);
    expect(kLine?.data[0].stat).toBe(5000);
  });

  it('excludes records after the end date', async () => {
    // end=2024-01 → Jan 2024; the 2026-01 K Line record is after this
    window.history.replaceState({}, '', '?lines=807&end=2024-01');

    render(<App />);

    await waitForDatasets(1);

    // Only 2022-01 survives: 2019-01 before default start, 2026-01 after end
    const kLine = capturedDatasets.find((ds) => ds.label === 'K Line');
    expect(kLine?.data).toHaveLength(1);
  });

  it('includes all K Line records when the range is wide enough', async () => {
    // start=2018-01, end=2027-01 covers all three K Line records
    window.history.replaceState({}, '', '?lines=807&start=2018-01&end=2027-01');

    render(<App />);

    await waitForDatasets(1);

    const kLine = capturedDatasets.find((ds) => ds.label === 'K Line');
    expect(kLine?.data).toHaveLength(3);
  });

  it('produces no dataset for a line with no records in range', async () => {
    // Narrow range that excludes all K Line records: 2023-06 → 2024-06
    window.history.replaceState({}, '', '?lines=807&start=2023-06&end=2024-06');

    render(<App />);

    await act(async () => {});

    expect(capturedDatasets).toHaveLength(0);
  });
});

describe('App - aggregate dataset', () => {
  it('does not include Aggregate dataset when aggregate param is absent', async () => {
    window.history.replaceState({}, '', '?lines=806,807');

    render(<App />);

    await waitForDatasets(2);

    const labels = capturedDatasets.map((ds) => ds.label);
    expect(labels).not.toContain('Aggregate');
  });

  it('adds Aggregate dataset when aggregate=1', async () => {
    window.history.replaceState({}, '', '?lines=806,807&aggregate=1');

    render(<App />);

    // 2 lines + 1 aggregate = 3
    await waitForDatasets(3);

    const labels = capturedDatasets.map((ds) => ds.label);
    expect(labels).toContain('Aggregate');
  });

  it('Aggregate stat equals the sum of selected line stats at each time point', async () => {
    window.history.replaceState({}, '', '?lines=806,807&aggregate=1');

    render(<App />);

    await waitForDatasets(3);

    const kLine = capturedDatasets.find((ds) => ds.label === 'K Line');
    const lLine = capturedDatasets.find((ds) => ds.label === 'L Line');
    const aggregate = capturedDatasets.find((ds) => ds.label === 'Aggregate');

    expect(kLine).toBeDefined();
    expect(lLine).toBeDefined();
    expect(aggregate).toBeDefined();

    // 2022-01: K weekday = 5000, L weekday = 8000 → aggregate = 13000
    expect(aggregate!.data[0].stat).toBe(
      kLine!.data[0].stat! + lLine!.data[0].stat!,
    );
    expect(aggregate!.data[0].stat).toBe(13000);
  });

  it('Aggregate is last in the datasets array', async () => {
    window.history.replaceState({}, '', '?lines=806,807&aggregate=1');

    render(<App />);

    await waitForDatasets(3);

    const lastLabel = capturedDatasets[capturedDatasets.length - 1].label;
    expect(lastLabel).toBe('Aggregate');
  });
});

describe('App - shared month axis across lines of differing coverage', () => {
  // Regression: the axis used to be taken from chartDatasets[0] alone. D Line sorts
  // first and covers far fewer months than E Line, so the axis became D Line's months
  // and Chart.js appended E Line's remaining months to the *end* — producing an
  // x-axis that jumped from 2026 back to 2020 and a stroke drawn across the plot.
  const bothRailLines = '?lines=804,805&start=2020-01&end=2027-01';

  it('spans the union of both lines months in chronological order', async () => {
    window.history.replaceState({}, '', bothRailLines);

    render(<App />);

    await waitForDatasets(2);

    expect(capturedMonths).toEqual(['2020 8', '2022 1', '2025 7', '2026 1']);
  });

  it('gives every dataset the same time sequence as the axis', async () => {
    window.history.replaceState({}, '', bothRailLines);

    render(<App />);

    await waitForDatasets(2);

    for (const dataset of capturedDatasets)
      expect(dataset.data.map((d) => d.time)).toEqual(capturedMonths);
  });

  it('nulls the months the short line does not cover', async () => {
    window.history.replaceState({}, '', bothRailLines);

    render(<App />);

    await waitForDatasets(2);

    const dLine = capturedDatasets.find((ds) => ds.label === 'D Line');
    // D Line reports only 2025-07 and 2026-01; the earlier months are gaps, not
    // points shifted onto the front of the axis.
    expect(dLine?.data.map((d) => d.stat)).toEqual([null, null, 700, 900]);
  });

  it('keeps the long line aligned to its own months', async () => {
    window.history.replaceState({}, '', bothRailLines);

    render(<App />);

    await waitForDatasets(2);

    const eLine = capturedDatasets.find((ds) => ds.label === 'E Line');
    expect(eLine?.data.map((d) => d.stat)).toEqual([4000, 4400, 4800, 5200]);
  });

  it('sums the aggregate by month rather than by array index', async () => {
    window.history.replaceState({}, '', `${bothRailLines}&aggregate=1`);

    render(<App />);

    await waitForDatasets(3);

    const aggregate = capturedDatasets.find((ds) => ds.label === 'Aggregate');
    // Months only E Line reports total E Line alone — a line with no record must
    // not be counted as a zero and drag the total down.
    expect(aggregate?.data.map((d) => d.stat)).toEqual([
      4000,
      4400,
      4800 + 700,
      5200 + 900,
    ]);
  });
});

describe('App - chart data format', () => {
  it('formats each data point time as "year month"', async () => {
    window.history.replaceState({}, '', '?lines=807');

    render(<App />);

    await waitForDatasets(1);

    const kLine = capturedDatasets.find((ds) => ds.label === 'K Line');
    // Record year=2022, month=1 → createTimeStringForChartData returns "2022 1"
    expect(kLine?.data[0].time).toBe('2022 1');
  });

  it('data points include both time and stat fields', async () => {
    window.history.replaceState({}, '', '?lines=807');

    render(<App />);

    await waitForDatasets(1);

    const kLine = capturedDatasets.find((ds) => ds.label === 'K Line');
    const point = kLine?.data[0];
    expect(point).toHaveProperty('time');
    expect(point).toHaveProperty('stat');
  });
});
