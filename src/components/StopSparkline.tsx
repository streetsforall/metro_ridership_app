import { useMemo } from 'react';
import type { ChartOptions } from 'chart.js';
import { Line as LineChart } from 'react-chartjs-2';
import { stopSeriesDatasets } from '../utils/stopSeriesDatasets';
import { getLineColor } from '../utils/lines';
import type { StopSeriesPoint } from '../utils/stopSeries';
import type { StopMeasure } from '../@types/stops.types';

/**
 * One row's series at 40px — a shape, not a readout. The figures beside it are the
 * readout; this says whether they are going up.
 *
 * Drawn in its **line's** colour, not its stop's selection colour. A row exists whether
 * or not its stop is selected, so there is no selection colour to give most of them, and
 * the sparkline's job is to sit beside the Line column and agree with it. The figure
 * above the table is where colour means which stop — ADR-0014 records the split.
 *
 * Its own component rather than a variant of `StopSeriesChart`: at this size every
 * option that chart sets is wrong — axes, legend, hover, point radii. A `variant` prop
 * would be two charts sharing a name. What the two genuinely share is the Stop Measure
 * → dataset encoding, and that lives in `stopSeriesDatasets`.
 *
 * Chart.js is registered by `../chart`, which `StopSeriesChart` imports; a module is
 * evaluated once, so there is no second registration here and none is needed.
 */

export interface StopSparklineProps {
  series: readonly StopSeriesPoint[];
  measure: StopMeasure;
  lineId: number;
}

/*
 * Module-level, unlike `LineTableRow`'s inline object. At this row count, rebuilding an
 * options object per row per render is real allocation, and Chart.js treats a new
 * options identity as a reason to reconfigure.
 */
const options: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  normalized: true,
  // No listeners: nothing here is hoverable, and the click belongs to the row — which
  // is what selects the stop.
  events: [],
  // No spanGaps. A month this stop did not report is a gap, and a 40px chart is not a
  // reason to draw a straight line through data that was never collected.
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
