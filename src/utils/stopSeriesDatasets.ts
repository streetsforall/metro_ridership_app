import type { ChartDataset } from 'chart.js';
import type { StopSeriesPoint } from './stopSeries';
import type { StopMeasure } from '../@types/stops.types';

/**
 * Which datasets a measure yields, and how each is drawn: boardings solid, alightings
 * dashed. Dash is the only thing encoded here. Colour comes from the caller because the
 * two mean different things by it — a sparkline passes its line's colour, the figure the
 * stop's selection colour, hue being the only channel left there (ADR-0014).
 *
 * Shared rather than stated in each chart, because a measure the two encoded differently
 * would answer one reader's question two ways on one screen.
 */

export interface StopSeriesDatasetsInput {
  series: readonly StopSeriesPoint[];
  measure: StopMeasure;
  /**
   * What the series is drawn in: the line's colour in a sparkline, the stop's selection
   * colour in the figure. The caller decides which question colour answers.
   */
  color: string;
  /** `0` in a sparkline, where a dot per month is noise at 40px. */
  pointRadius: number;
  /**
   * What the legend calls each dataset. Absent in a sparkline, which has no legend; in the
   * figure it names the stop and line, since `Boardings` alone would not say whose.
   */
  labelPrefix?: string;
}

export function stopSeriesDatasets({
  series,
  measure,
  color,
  pointRadius,
  labelPrefix,
}: StopSeriesDatasetsInput): ChartDataset<'line', (number | null)[]>[] {
  // The measure joins the label only under `both`, where two datasets per stop need
  // telling apart. Under a single measure the toggle above the panel already says which,
  // and appending it pushed legend entries off the edge at mobile width.
  const label = (measureName: string): string => {
    if (!labelPrefix) return measureName;
    return measure === 'both' ? `${labelPrefix} · ${measureName}` : labelPrefix;
  };

  const datasets: ChartDataset<'line', (number | null)[]>[] = [];

  if (measure !== 'offs')
    datasets.push({
      label: label('Boardings'),
      data: series.map((point) => point.boardings),
      borderColor: color,
      backgroundColor: color,
      pointRadius,
    });

  if (measure !== 'ons')
    datasets.push({
      label: label('Alightings'),
      data: series.map((point) => point.alightings),
      borderColor: color,
      backgroundColor: color,
      borderDash: [4, 4],
      pointRadius,
    });

  return datasets;
}
