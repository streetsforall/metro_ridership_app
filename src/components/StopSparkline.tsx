import { useMemo } from 'react';
import type { ChartOptions } from 'chart.js';
import { Line as LineChart } from 'react-chartjs-2';
import { stopSeriesDatasets } from '../utils/stopSeriesDatasets';
import { getLineColor } from '../utils/lines';
import type { StopSeriesPoint } from '../utils/stopSeries';
import type { StopMeasure } from '../@types/stops.types';

/**
 * One row's series at 40px — a shape, not a readout. Drawn in its line's colour rather
 * than its stop's, because a row exists whether or not its stop is selected, so most rows
 * have no selection colour to take (ADR-0014).
 *
 * Its own component rather than a variant of `StopSeriesChart`, since at this size every
 * option that chart sets is wrong. They share the measure → dataset encoding instead.
 */

export interface StopSparklineProps {
  series: readonly StopSeriesPoint[];
  measure: StopMeasure;
  lineId: number;
}

// Module-level, unlike `LineTableRow`'s inline object: at this row count a fresh options
// object per render is real allocation, and Chart.js treats a new identity as a reason to
// reconfigure.
const options: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  normalized: true,
  // No listeners: nothing here is hoverable, and the click belongs to the row.
  events: [],
  // No spanGaps: a month this stop did not report is a gap, and 40px is no reason to draw
  // through data that was never collected.
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
