import { describe, it, expect } from 'vitest';
import { stopSeriesDatasets } from '../stopSeriesDatasets';
import type { StopSeriesPoint } from '../stopSeries';

/**
 * The Stop Measure → dataset encoding, tested here rather than through either chart.
 *
 * Two components draw it — the figure above the table and the sparkline in every row —
 * and the whole reason it lives in one module is that a measure encoded two ways on one
 * screen is the same reader's question answered twice. That contract needs a test of its
 * own, not two indirect ones.
 */

const series: StopSeriesPoint[] = [
  { month: '2025-07', boardings: 100, alightings: 90 },
  { month: '2025-08', boardings: null, alightings: null },
  { month: '2025-09', boardings: 120, alightings: 110 },
];

describe('stopSeriesDatasets', () => {
  it('yields Boardings alone for the boardings measure', () => {
    const datasets = stopSeriesDatasets({
      series,
      measure: 'ons',
      color: '#2563eb',
      pointRadius: 2,
    });

    expect(datasets.map((dataset) => dataset.label)).toEqual(['Boardings']);
  });

  it('yields Alightings alone for the alightings measure', () => {
    const datasets = stopSeriesDatasets({
      series,
      measure: 'offs',
      color: '#2563eb',
      pointRadius: 2,
    });

    expect(datasets.map((dataset) => dataset.label)).toEqual(['Alightings']);
  });

  /** **Boardings and Alightings**, never "ons"/"offs" — `CONTEXT.md`'s vocabulary. */
  it('yields both, in that order, for the both measure', () => {
    const datasets = stopSeriesDatasets({
      series,
      measure: 'both',
      color: '#2563eb',
      pointRadius: 2,
    });

    expect(datasets.map((dataset) => dataset.label)).toEqual([
      'Boardings',
      'Alightings',
    ]);
  });

  it('reads boardings and alightings off the points it was given', () => {
    const datasets = stopSeriesDatasets({
      series,
      measure: 'both',
      color: '#2563eb',
      pointRadius: 2,
    });

    expect(datasets[0].data).toEqual([100, null, 120]);
    expect(datasets[1].data).toEqual([90, null, 110]);
  });

  /* A month the stop did not report stays a gap. Nothing here turns a null into a zero. */
  it('keeps an unreported month null rather than zero', () => {
    const datasets = stopSeriesDatasets({
      series,
      measure: 'ons',
      color: '#2563eb',
      pointRadius: 2,
    });

    expect(datasets[0].data[1]).toBeNull();
  });

  /**
   * Dash is the *only* thing this module encodes about a measure. Colour arrives from the
   * caller, because the two callers mean different things by it — ADR-0014.
   */
  it('dashes Alightings and leaves Boardings solid', () => {
    const datasets = stopSeriesDatasets({
      series,
      measure: 'both',
      color: '#2563eb',
      pointRadius: 2,
    });

    expect(datasets[0].borderDash).toBeUndefined();
    expect(datasets[1].borderDash).toEqual([4, 4]);
  });

  it('draws both measures in the one colour it was handed', () => {
    const datasets = stopSeriesDatasets({
      series,
      measure: 'both',
      color: '#c026d3',
      pointRadius: 2,
    });

    for (const dataset of datasets) {
      expect(dataset.borderColor).toBe('#c026d3');
      expect(dataset.backgroundColor).toBe('#c026d3');
    }
  });

  it('derives no colour of its own from the series', () => {
    const first = stopSeriesDatasets({
      series,
      measure: 'ons',
      color: '#059669',
      pointRadius: 2,
    });
    const second = stopSeriesDatasets({
      series,
      measure: 'ons',
      color: '#e11d48',
      pointRadius: 2,
    });

    expect(first[0].borderColor).not.toBe(second[0].borderColor);
  });

  it('passes the point radius through, so a sparkline can ask for none', () => {
    const datasets = stopSeriesDatasets({
      series,
      measure: 'both',
      color: '#2563eb',
      pointRadius: 0,
    });

    for (const dataset of datasets) expect(dataset.pointRadius).toBe(0);
  });

  /**
   * The figure draws several stops at once, so `Boardings` alone would not say whose. The
   * sparkline has no legend and passes no prefix, which is why the prefix is optional
   * rather than always required.
   */
  it('names the stop in each label when a prefix is given', () => {
    const datasets = stopSeriesDatasets({
      series,
      measure: 'both',
      color: '#2563eb',
      pointRadius: 2,
      labelPrefix: 'Vermont / Wilshire · 204',
    });

    expect(datasets.map((dataset) => dataset.label)).toEqual([
      'Vermont / Wilshire · 204 · Boardings',
      'Vermont / Wilshire · 204 · Alightings',
    ]);
  });

  it('labels by measure alone when no prefix is given', () => {
    const datasets = stopSeriesDatasets({
      series,
      measure: 'ons',
      color: '#2563eb',
      pointRadius: 0,
    });

    expect(datasets[0].label).toBe('Boardings');
  });

  /**
   * Under a single measure every series *is* that measure and the panel's toggle already
   * says which, so appending it to a stop name long enough to begin with only pushed
   * legend entries off the edge at mobile width.
   */
  it.each(['ons', 'offs'] as const)(
    'names the stop alone under the %s measure',
    (measure) => {
      const datasets = stopSeriesDatasets({
        series,
        measure,
        color: '#2563eb',
        pointRadius: 2,
        labelPrefix: '7th Street / Metro Center Station · A Line',
      });

      expect(datasets[0].label).toBe(
        '7th Street / Metro Center Station · A Line',
      );
    },
  );

  it('returns an empty axis rather than a dataset for an empty series', () => {
    const datasets = stopSeriesDatasets({
      series: [],
      measure: 'both',
      color: '#2563eb',
      pointRadius: 2,
    });

    expect(datasets).toHaveLength(2);
    expect(datasets[0].data).toEqual([]);
  });
});
