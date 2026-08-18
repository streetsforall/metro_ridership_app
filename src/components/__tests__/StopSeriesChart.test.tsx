import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import StopSeriesChart, { type DrawnStopSeries } from '../StopSeriesChart';
import { AGGREGATE_COLOR } from '../../utils/stopSelectionColors';
import type { StopSeriesPoint } from '../../utils/stopSeries';

/**
 * The figure above the stop table, and specifically what the Aggregate tick adds to it.
 *
 * Chart.js needs a 2D context jsdom does not have, so the chart is stubbed and the
 * datasets it was handed are captured. Everything asserted here is a claim about those
 * datasets: which exist, in what order, in what colour.
 */
const { chartSpy } = vi.hoisted(() => ({ chartSpy: vi.fn() }));

vi.mock('react-chartjs-2', () => ({
  Line: ({ data }: { data: { datasets: unknown[] } }) => {
    chartSpy(data.datasets);
    return <canvas data-testid="stop-series" />;
  },
}));

interface CapturedDataset {
  label?: string;
  borderColor?: string;
  borderDash?: number[];
  data: (number | null)[];
}

const lastDatasets = (): CapturedDataset[] =>
  (chartSpy.mock.calls.at(-1)?.[0] ?? []) as CapturedDataset[];

const series = (
  ...points: [string, number | null, number | null][]
): StopSeriesPoint[] =>
  points.map(([month, boardings, alightings]) => ({
    month,
    boardings,
    alightings,
  }));

const drawn: DrawnStopSeries[] = [
  {
    key: 'bus:vermont-wilshire',
    lineId: 204,
    stopName: 'Vermont / Wilshire',
    lineName: 'Line 204',
    series: series(['2025-07', 100, 90], ['2025-08', 200, 180]),
  },
  {
    key: 'bus:vermont-santa-monica',
    lineId: 204,
    stopName: 'Vermont / Santa Monica',
    lineName: 'Line 204',
    series: series(['2025-07', 10, 5], ['2025-08', 20, 15]),
  },
];

afterEach(() => chartSpy.mockClear());

describe('StopSeriesChart aggregate', () => {
  it('draws no aggregate until asked', () => {
    render(<StopSeriesChart drawn={drawn} measure="ons" />);
    expect(lastDatasets().map((dataset) => dataset.label)).toEqual([
      'Vermont / Wilshire · Line 204',
      'Vermont / Santa Monica · Line 204',
    ]);
  });

  it('adds one totalled series, last, when asked', () => {
    render(<StopSeriesChart drawn={drawn} measure="ons" showAggregate />);
    const datasets = lastDatasets();

    expect(datasets).toHaveLength(3);
    expect(datasets[2].label).toBe('Aggregate');
    expect(datasets[2].data).toEqual([110, 220]);
  });

  /**
   * ADR-0014: colour in this figure means which stop. The aggregate is not a stop, so it
   * must not take a hue from the selection palette — a ninth colour there would say it
   * was a ninth stop.
   */
  it('draws the aggregate in the neutral colour, not a selection hue', () => {
    render(<StopSeriesChart drawn={drawn} measure="ons" showAggregate />);
    const datasets = lastDatasets();

    expect(datasets[2].borderColor).toBe(AGGREGATE_COLOR);
    expect(datasets[0].borderColor).not.toBe(AGGREGATE_COLOR);
  });

  /**
   * Dash still means the measure, for the aggregate as for every other series — so
   * `both` yields a solid Boardings total and a dashed Alightings one.
   */
  it('keeps the measure’s dash convention under both', () => {
    render(<StopSeriesChart drawn={drawn} measure="both" showAggregate />);
    const aggregate = lastDatasets().filter((dataset) =>
      dataset.label?.startsWith('Aggregate'),
    );

    expect(aggregate.map((dataset) => dataset.label)).toEqual([
      'Aggregate · Boardings',
      'Aggregate · Alightings',
    ]);
    expect(aggregate[0].borderDash).toBeUndefined();
    expect(aggregate[1].borderDash).toEqual([4, 4]);
  });

  it('adds nothing when no stop is drawn', () => {
    render(<StopSeriesChart drawn={[]} measure="ons" showAggregate />);
    expect(lastDatasets()).toEqual([]);
  });
});
