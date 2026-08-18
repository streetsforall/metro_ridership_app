import type { StopSeriesPoint } from './stopSeries';

/**
 * One series totalling every drawn stop series at each month.
 *
 * The stop panel's answer to the line filter's Aggregate. Reading four stops against one
 * another is what the figure is for, but "what do these four carry between them" is a
 * different question and the four separate lines do not answer it — the reader ends up
 * adding four curves by eye.
 *
 * ## It totals series, not stops
 *
 * A stop served by two selected lines is two drawn series, and both are summed. That is
 * not the per-stop rollup this project declines to derive: nothing here claims to be a
 * figure *for a stop*. It is the total across everything the figure is drawing, which is
 * what the legend calls it and what the caption's series count already prepares the
 * reader for.
 *
 * ## A gap is not a zero
 *
 * A stop that did not report a month contributes nothing to that month rather than zero,
 * so one stop's missing month cannot read as ridership collapsing across the selection. A
 * month **no** drawn stop reports stays `null`, i.e. a gap — the same rule, and for the
 * same reason, as `buildAggregateSeries` in `src/ridership/`. Neither Boardings nor
 * Alightings borrows the other's answer: a month can be a gap in one and a figure in the
 * other only if the records say so, and they are summed independently.
 *
 * The month axis comes from the drawn series, which `buildStopSeriesIndex` has already
 * aligned to the Stop View's own axis — so this file compares nothing against a window
 * and states no rule about one.
 */
export function stopAggregateSeries(
  drawn: readonly { series: readonly StopSeriesPoint[] }[],
): StopSeriesPoint[] {
  const axis = drawn[0]?.series ?? [];

  return axis.map((point, index) => {
    let boardings: number | null = null;
    let alightings: number | null = null;

    for (const { series } of drawn) {
      const contribution = series[index];
      if (!contribution) continue;
      if (contribution.boardings != null)
        boardings = (boardings ?? 0) + contribution.boardings;
      if (contribution.alightings != null)
        alightings = (alightings ?? 0) + contribution.alightings;
    }

    return { month: point.month, boardings, alightings };
  });
}
