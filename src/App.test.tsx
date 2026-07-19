import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import App from './App';
import type { ChartDataset } from 'chart.js';
import type { CustomChartData } from './@types/chart.types';

// Ridership mock covering multiple scenarios:
//   Line 807 (K Line): 2019-01 (before default start Jul 2020), 2022-01 (in range), 2026-01 (after default end Jul 2025)
//   Line 806 (L Line): 2022-01 (in range, inserted before K Line so numeric key order != alphabetical)
vi.mock('./data/ridership.json', () => ({
  default: [
    { year: 2019, month: 1, line_name: 807, est_wkday_ridership: 1000, est_sat_ridership: 600, est_sun_ridership: 400 },
    { year: 2022, month: 1, line_name: 807, est_wkday_ridership: 5000, est_sat_ridership: 3000, est_sun_ridership: 2000 },
    { year: 2022, month: 1, line_name: 806, est_wkday_ridership: 8000, est_sat_ridership: 5000, est_sun_ridership: 3000 },
    { year: 2026, month: 1, line_name: 807, est_wkday_ridership: 9000, est_sat_ridership: 7000, est_sun_ridership: 5000 },
  ],
}));

let capturedDatasets: ChartDataset<'line', CustomChartData[]>[] = [];

// DockShell probe: App now hands chart data to panels via DashboardContext
// (not props), so the mock consumes the context the way real panels do.
// importActual keeps PANEL_IDS/PANEL_DEFS real for App's toggle/reset logic.
vi.mock('./dock/DockShell', async () => {
  const actual =
    await vi.importActual<typeof import('./dock/DockShell')>('./dock/DockShell');
  const { useDashboard } = await import('./context/DashboardContext');

  const DockShellProbe = () => {
    capturedDatasets = useDashboard().chartDatasets;
    return <div data-testid="dock-shell" />;
  };

  return { ...actual, default: DockShellProbe };
});

vi.mock('./components/Header', () => ({ default: () => <div /> }));
vi.mock('./components/Map', () => ({ default: () => <div /> }));
vi.mock('./components/Footer', () => ({ default: () => <div /> }));
vi.mock('./components/DateRangeSelector', () => ({ default: () => <div /> }));
vi.mock('./components/LineSelector', () => ({ default: () => <div /> }));

beforeEach(() => {
  capturedDatasets = [];
  window.history.replaceState({}, '', '/');
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
    expect(aggregate!.data[0].stat).toBe(kLine!.data[0].stat + lLine!.data[0].stat);
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
