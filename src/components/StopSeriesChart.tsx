import { useMemo } from 'react';
import type { ChartOptions } from 'chart.js';
import { Line as LineChart } from 'react-chartjs-2';
import { formatEventDate } from '../chart';
import { stopSeriesDatasets } from '../utils/stopSeriesDatasets';
import type { StopSeriesPoint } from '../utils/stopSeries';
import type { StopMeasure } from '../@types/stops.types';

/**
 * One stop's Boardings and Alightings across the Stop View's month axis.
 *
 * The import of `../chart` is what registers Chart.js, and it is the only registration
 * site in the app — `RidershipChart` imports the same barrel, and a module is
 * evaluated once, so there is no second `ChartJS.register` anywhere.
 *
 * The series itself is `buildStopSeries` in `src/utils/stopSeries.ts`; this component
 * only draws it.
 */

export interface StopSeriesChartProps {
  series: StopSeriesPoint[];
  /** Which of the two series to draw. `both` draws them together. */
  measure: StopMeasure;
  /** Colours follow the line, as everywhere else. */
  lineId: number;
}

const options: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  interaction: { mode: 'index', intersect: false },
  // No spanGaps: a month this stop did not report is a gap, not a zero — the same rule
  // the ridership chart follows.
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
  series,
  measure,
  lineId,
}: StopSeriesChartProps) {
  const data = useMemo(
    () => ({
      labels: series.map((point) => formatEventDate(point.month)),
      // Boardings solid, Alightings dashed, in the line's colour. Shared with the
      // table's sparklines so one measure cannot be encoded two ways on one screen.
      datasets: stopSeriesDatasets({ series, measure, lineId, pointRadius: 2 }),
    }),
    [series, measure, lineId],
  );

  return (
    <div className="h-56" data-qa="stop-series">
      <LineChart options={options} data={data} />
    </div>
  );
}
