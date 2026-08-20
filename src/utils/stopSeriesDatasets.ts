import type { ChartDataset } from 'chart.js';
import type { StopSeriesPoint } from './stopSeries';
import type { StopMeasure } from '../@types/stops.types';

/**
 * Which datasets a measure yields and how each is dashed, shared so two charts can't
 * encode one measure differently — colour is the caller's to choose (ADR-0014).
 */

export interface StopSeriesDatasetsInput {
  series: readonly StopSeriesPoint[];
  measure: StopMeasure;
  /** What the series is drawn in, which is the caller's question to answer. */
  color: string;
  /** `0` in a sparkline, where a dot per month is noise at 40px. */
  pointRadius: number;
  /** What the legend calls each dataset, absent in a sparkline because it has no legend. */
  labelPrefix?: string;
}

export function stopSeriesDatasets({
  series,
  measure,
  color,
  pointRadius,
  labelPrefix,
}: StopSeriesDatasetsInput): ChartDataset<'line', (number | null)[]>[] {
  // The measure joins the label only under `both`, where two datasets per stop need telling apart.
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
