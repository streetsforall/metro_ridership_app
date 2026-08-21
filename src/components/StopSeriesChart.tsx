import { useMemo } from 'react';
import type { ChartOptions } from 'chart.js';
import { Line as LineChart } from 'react-chartjs-2';
import { formatEventDate } from '../chart';
import { stopSeriesDatasets } from '../utils/stopSeriesDatasets';
import type { StopSeriesPoint } from '../utils/stopSeries';
import type { StopMeasure } from '../@types/stops.types';

/**
 * Draws the selected stops' boardings and alightings across the stop view's month axis.
 */

/** One `(stop, line)` pair's line on the chart, since the pair is what has a series. */
export interface DrawnStopSeries {
  key: string;
  lineId: number;
  stopName: string;
  lineName: string;
  series: StopSeriesPoint[];
  /** The hue, carried rather than computed here so one stop keeps one colour (ADR-0014). */
  color: string;
}

export interface StopSeriesChartProps {
  /** In selection order, which is what keeps a re-sort from recolouring the chart. */
  drawn: readonly DrawnStopSeries[];
  /** Which of the two series to draw, or `both` for the two together. */
  measure: StopMeasure;
}

const options: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  interaction: { mode: 'index', intersect: false },
  // No spanGaps: a month this stop did not report is a gap, not a zero.
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
      // The axis off the first series, which every series is aligned to.
      labels:
        drawn[0]?.series.map((point) => formatEventDate(point.month)) ?? [],
      // Boardings solid and alightings dashed, as in the sparklines; colour says which stop.
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
