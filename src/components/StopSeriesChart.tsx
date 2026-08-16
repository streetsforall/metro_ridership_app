import { useMemo } from 'react';
import type { ChartOptions } from 'chart.js';
import { Line as LineChart } from 'react-chartjs-2';
import { formatEventDate } from '../chart';
import { getLineColor } from '../utils/lines';
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
  const color = getLineColor(lineId);

  const data = useMemo(() => {
    const labels = series.map((point) => formatEventDate(point.month));
    const datasets = [];

    // Boardings solid, Alightings dashed, both in the line's own colour — the same
    // split the map's fill-and-ring encoding makes, so the two readouts agree, and
    // colour keeps meaning *which line* and nothing else.
    if (measure !== 'offs')
      datasets.push({
        label: 'Boardings',
        data: series.map((point) => point.boardings),
        borderColor: color,
        backgroundColor: color,
        pointRadius: 2,
      });
    if (measure !== 'ons')
      datasets.push({
        label: 'Alightings',
        data: series.map((point) => point.alightings),
        borderColor: color,
        backgroundColor: color,
        borderDash: [4, 4],
        pointRadius: 2,
      });

    return { labels, datasets };
  }, [series, measure, color]);

  return (
    <div className="h-56" data-qa="stop-series">
      <LineChart options={options} data={data} />
    </div>
  );
}
