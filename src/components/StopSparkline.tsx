import { useMemo } from 'react';
import type { ChartOptions } from 'chart.js';
import { Line as LineChart } from 'react-chartjs-2';
import { stopSeriesDatasets } from '../utils/stopSeriesDatasets';
import { getLineColor } from '../utils/lines';
import type { StopSeriesPoint } from '../utils/stopSeries';
import type { StopMeasure } from '../@types/stops.types';

/** One row's series at 40px — a shape, not a readout, drawn in its line's colour. */

export interface StopSparklineProps {
  series: readonly StopSeriesPoint[];
  measure: StopMeasure;
  lineId: number;
}

// The options live at module level, because at this row count a fresh object per render
// makes Chart.js reconfigure.
const options: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  normalized: true,
  // No listeners: nothing here is hoverable, and the click belongs to the row.
  events: [],
  // No spanGaps: a month this stop did not report is a gap, at 40px as anywhere else.
  plugins: { legend: { display: false } },
  scales: { x: { display: false }, y: { display: false } },
  elements: { point: { radius: 0 } },
};

export default function StopSparkline({
  series,
  measure,
  lineId,
}: StopSparklineProps) {
  const data = useMemo(
    () => ({
      // The axis is the month list; the labels themselves are never drawn.
      labels: series.map((point) => point.month),
      datasets: stopSeriesDatasets({
        series,
        measure,
        color: getLineColor(lineId),
        pointRadius: 0,
      }),
    }),
    [series, measure, lineId],
  );

  return <LineChart options={options} data={data} />;
}
