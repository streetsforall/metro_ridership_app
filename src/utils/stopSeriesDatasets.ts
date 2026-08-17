import type { ChartDataset } from 'chart.js';
import type { StopSeriesPoint } from './stopSeries';
import type { StopMeasure } from '../@types/stops.types';

/**
 * Which datasets a Stop Measure yields, and how each is drawn.
 *
 * Boardings solid, Alightings dashed. **Dash is the only thing this module encodes.**
 * The colour arrives from the caller, because the two callers mean different things by
 * it: the row sparkline passes its line's colour, and the figure above the table passes
 * the stop's own selection colour, since several stops are drawn there at once and hue
 * is the only channel left to tell them apart. See ADR-0014.
 *
 * Stated here rather than inside each chart because two components draw this: the detail
 * figure above the table and the sparkline in every row. A measure the two encoded
 * differently would be the same reader's question answered two ways on one screen — and
 * that is why the split lives here even though the colour no longer can.
 */

export interface StopSeriesDatasetsInput {
  series: readonly StopSeriesPoint[];
  measure: StopMeasure;
  /**
   * What the series is drawn in. The line's colour in a sparkline, the stop's selection
   * colour in the figure — the caller decides which question colour answers.
   */
  color: string;
  /** `0` in a sparkline, where a dot per month is noise at 40px. */
  pointRadius: number;
  /**
   * What the legend calls each dataset. Absent in a sparkline, which has no legend; in
   * the figure it names the stop and its line, so `Boardings` alone would not say whose.
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
  /*
   * The measure joins the label only under `both`, where two datasets per stop genuinely
   * need telling apart. Under a single measure every series is that measure, the toggle
   * above the panel already says which, and appending it to a stop name long enough to
   * begin with is what pushed legend entries off the edge at mobile width.
   */
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
