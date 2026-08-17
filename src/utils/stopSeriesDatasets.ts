import type { ChartDataset } from 'chart.js';
import { getLineColor } from './lines';
import type { StopSeriesPoint } from './stopSeries';
import type { StopMeasure } from '../@types/stops.types';

/**
 * Which datasets a Stop Measure yields, and how each is drawn.
 *
 * Boardings solid, Alightings dashed, both in the line's own colour — the same split
 * the map's fill-and-ring encoding makes, so colour keeps meaning *which line* and
 * nothing else.
 *
 * Stated here rather than inside each chart because two components draw this now: the
 * detail figure above the table and the sparkline in every row. A measure the two
 * encoded differently would be the same reader's question answered two ways on one
 * screen.
 */

export interface StopSeriesDatasetsInput {
  series: readonly StopSeriesPoint[];
  measure: StopMeasure;
  /** Colours follow the line, as everywhere else. */
  lineId: number;
  /** `0` in a sparkline, where a dot per month is noise at 40px. */
  pointRadius: number;
}

export function stopSeriesDatasets({
  series,
  measure,
  lineId,
  pointRadius,
}: StopSeriesDatasetsInput): ChartDataset<'line', (number | null)[]>[] {
  const color = getLineColor(lineId);
  const datasets: ChartDataset<'line', (number | null)[]>[] = [];

  if (measure !== 'offs')
    datasets.push({
      label: 'Boardings',
      data: series.map((point) => point.boardings),
      borderColor: color,
      backgroundColor: color,
      pointRadius,
    });

  if (measure !== 'ons')
    datasets.push({
      label: 'Alightings',
      data: series.map((point) => point.alightings),
      borderColor: color,
      backgroundColor: color,
      borderDash: [4, 4],
      pointRadius,
    });

  return datasets;
}
