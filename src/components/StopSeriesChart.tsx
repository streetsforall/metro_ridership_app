import { useMemo } from 'react';
import type { ChartOptions } from 'chart.js';
import { Line as LineChart } from 'react-chartjs-2';
import { formatEventDate } from '../chart';
import { stopSeriesDatasets } from '../utils/stopSeriesDatasets';
import type { StopSeriesPoint } from '../utils/stopSeries';
import type { StopMeasure } from '../@types/stops.types';

/**
 * The selected stops' Boardings and Alightings across the Stop View's month axis.
 *
 * The import of `../chart` is what registers Chart.js, and it is the only registration
 * site in the app — `RidershipChart` imports the same barrel, and a module is
 * evaluated once, so there is no second `ChartJS.register` anywhere.
 *
 * The series themselves come from `buildStopSeriesIndex` in `src/utils/stopSeries.ts`;
 * this component only draws them.
 */

/**
 * One stop's line on the chart.
 *
 * A `(stop, line)` pair rather than a stop, because that pair is what has a series: the
 * same stop served by two selected lines reports different figures on each, and
 * `seriesFor` is keyed on both. `stopName` and `lineName` are here because the legend has
 * to say whose series a colour belongs to, and neither name can be derived from the other.
 */
export interface DrawnStopSeries {
  key: string;
  lineId: number;
  stopName: string;
  lineName: string;
  series: StopSeriesPoint[];
  /**
   * The hue for this series, taken from the stop's position in the Stop Selection.
   *
   * Carried rather than computed here, because the chart's own list has one entry per
   * `(stop, line)` pair: a stop served by two selected lines would take two hues and
   * shift every later stop's, which is the one thing colour-means-which-stop is for
   * (ADR-0014). Two series of one stop therefore share a hue, and the legend prefix is
   * what names the line.
   */
  color: string;
}

export interface StopSeriesChartProps {
  /**
   * In selection order, which is what fixes the colours. Re-sorting the table beneath
   * must not recolour the chart above it, and adding a stop must not recolour the ones
   * already drawn — both follow from the order being selection order rather than rank.
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
  drawn,
  measure,
}: StopSeriesChartProps) {
  const data = useMemo(
    () => ({
      /*
       * The axis off the first series. Every stop's series is aligned to the Stop View's
       * own month list — `seriesFor` returns a full-length, all-null series for a pair
       * with no records — so they all share this axis and none of them can shorten it.
       */
      labels:
        drawn[0]?.series.map((point) => formatEventDate(point.month)) ?? [],
      /*
       * Boardings solid, Alightings dashed — the split shared with the table's
       * sparklines, so one measure is not encoded two ways on one screen. Colour is
       * the part that differs: here it says which stop, and the legend prefix names
       * the stop and its line so the hue is never the only thing carrying that.
       */
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
