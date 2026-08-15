import type { DayOfWeek } from '../@types/metrics.types';
import type { StopMeasure, StopRecord } from '../@types/stops.types';

/**
 * Which pair of `StopRecord` fields a `DayOfWeek` selects.
 *
 * `DayOfWeek`'s literals are `ridership.json` **column names**, and they are
 * load-bearing for the `day` URL param, so the shared type is not widened to cover
 * stop grain. The translation is this private record instead — one table, inside the
 * module, rather than a widened type every consumer of `metrics.types` would inherit.
 */
const DAY_COLUMNS: Record<
  DayOfWeek,
  { ons: keyof StopRecord; offs: keyof StopRecord }
> = {
  est_wkday_ridership: { ons: 'wkday_ons', offs: 'wkday_offs' },
  est_sat_ridership: { ons: 'sat_ons', offs: 'sat_offs' },
  est_sun_ridership: { ons: 'sun_ons', offs: 'sun_offs' },
};

export interface StopMetricsInput {
  /** One stop's records for one line, in any order. Never mutated. */
  records: readonly StopRecord[];
  /** Which of the three reported figures to read. */
  dayOfWeek: DayOfWeek;
}

export interface StopMetrics {
  /** Mean boardings per reported month. */
  averageBoardings: number;
  /** Mean alightings per reported month. */
  averageAlightings: number;
  /**
   * `averageBoardings - averageAlightings`. Negative at a stop where more riders get
   * off than on — which is most of downtown in the morning, and is information, not
   * an error.
   */
  netAverage: number;
  /**
   * How many **records** this stop has for this line inside the Month Window — which
   * is the divisor the two averages use, and not the same as "months with a figure".
   * A record whose figure is `null` counts here and contributes `0` to the averages.
   * A caption reading "11 months" off this for a stop with 4 reported figures would be
   * saying something the number does not mean.
   */
  monthsReported: number;
}

/**
 * The Stop Metrics one stop's records for one line yield for one Day Of Week.
 *
 * **Returns `null` for an empty series.** No records means no metrics, not zeroes —
 * the same contract `lineMetrics` states, for the same reason: `0` is
 * indistinguishable from a real figure, and a stop that reported nothing did not
 * report nobody. See `docs/adr/0004-line-metrics-are-one-nullable-shape.md`.
 *
 * The average divides by the **record count**, not by the count of non-null figures,
 * so a month reported as `null` counts as `0`. That is lifted verbatim from
 * `lineMetrics`: the two grains must average the same way or the ranked table and the
 * line table would tell different stories about the same window.
 *
 * Like Line Metrics, these describe the span the stop itself covers, not the Month
 * Window's endpoints. A stop that appears halfway through the window averages over
 * its own months.
 */
export function stopMetrics({
  records,
  dayOfWeek,
}: StopMetricsInput): StopMetrics | null {
  if (records.length === 0) return null;

  const { ons, offs } = DAY_COLUMNS[dayOfWeek];

  let boardings = 0;
  let alightings = 0;
  for (const record of records) {
    boardings += (record[ons] as number | null) ?? 0;
    alightings += (record[offs] as number | null) ?? 0;
  }

  const averageBoardings = boardings / records.length;
  const averageAlightings = alightings / records.length;

  return {
    averageBoardings,
    averageAlightings,
    netAverage: averageBoardings - averageAlightings,
    monthsReported: records.length,
  };
}

/**
 * The one figure a Stop Measure selects from a stop's metrics.
 *
 * Marker radius, table rank and share-of-line all read this, so switching the measure
 * moves all three together instead of three call sites each picking a field.
 */
export function measuredAverage(
  metrics: StopMetrics,
  measure: StopMeasure,
): number {
  switch (measure) {
    case 'ons':
      return metrics.averageBoardings;
    case 'offs':
      return metrics.averageAlightings;
    case 'both':
      return metrics.averageBoardings + metrics.averageAlightings;
  }
}
