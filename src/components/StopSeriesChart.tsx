import { useMemo } from 'react';
import type { ChartOptions } from 'chart.js';
import { Line as LineChart } from 'react-chartjs-2';
import { formatEventDate } from '../chart';
import { stopSeriesDatasets } from '../utils/stopSeriesDatasets';
import type { StopSeriesPoint } from '../utils/stopSeries';
import type { StopMeasure } from '../@types/stops.types';

/**
 * The selected stops' boardings and alightings across the stop view's month axis. Drawing
 * only; the series come from `buildStopSeriesIndex`.
 *
 * Importing `../chart` is what registers Chart.js, and it is the app's only registration
 * site — `RidershipChart` imports the same barrel, and a module is evaluated once.
 */

/**
 * One stop's line on the chart. A `(stop, line)` pair rather than a stop, because the pair
 * is what has a series: a stop on two selected lines reports different figures on each.
 * Both names are carried because the legend must say whose series a colour belongs to.
 */
export interface DrawnStopSeries {
  key: string;
  lineId: number;
  stopName: string;
  lineName: string;
  series: StopSeriesPoint[];
  /**
   * The hue, taken from the stop's position in the selection. Carried rather than computed
   * here, because this list has one entry per `(stop, line)` pair, so a stop on two lines
   * would take two hues and shift every later stop's (ADR-0014). Two series of one stop
   * share a hue, and the legend prefix names the line.
   */
  color: string;
}

export interface StopSeriesChartProps {
  /**
   * In selection order, which is what fixes the colours: re-sorting the table must not
   * recolour the chart, and adding a stop must not recolour the ones already drawn.
   */
  drawn: readonly DrawnStopSeries[];
  /** Which of the two series to draw. `both` draws them together. */
  measure: StopMeasure;
}

const options: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  interaction: { mode: 'index', intersect: false },
  // No spanGaps: a month this stop did not report is a gap, not a zero — the ridership
  // chart's rule.
  plugins: {
    legend: {
      position: 'bottom',
      labels: { boxHeight: 2, usePointStyle: false },
    },
  },
  scales: {
    y: { beginAtZero: true, ticks: { maxTicksLimit: 5 } },
    x: { ticks: { maxRotation: 0, autoSkipPadding: 12 } },
  },
};

export default function StopSeriesChart({
  drawn,
  measure,
}: StopSeriesChartProps) {
  const data = useMemo(
    () => ({
      // The axis off the first series. Every series is aligned to the stop view's month
      // list — `seriesFor` pads a pair with no records — so none of them can shorten it.
      labels:
        drawn[0]?.series.map((point) => formatEventDate(point.month)) ?? [],
      // Boardings solid, alightings dashed, as in the table's sparklines, so one measure
      // is not encoded two ways on one screen. Colour is the part that differs: here it
      // says which stop, and the legend prefix names it so hue is never the only carrier.
      datasets: drawn.flatMap((stop) =>
        stopSeriesDatasets({
          series: stop.series,
          measure,
          color: stop.color,
          pointRadius: 2,
          labelPrefix: `${stop.stopName} · ${stop.lineName}`,
        }),
      ),
    }),
    [drawn, measure],
  );

  return (
    <div className="h-56" data-qa="stop-series">
      <LineChart options={options} data={data} />
    </div>
  );
}
