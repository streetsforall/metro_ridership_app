import { useMemo } from 'react';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import StopCoverageNotice from './StopCoverageNotice';
import StopSeriesChart from './StopSeriesChart';
import StopTable from './StopTable';
import { stopCoverageState } from '../utils/stopCoverage';
import { buildStopSeries } from '../utils/stopSeries';
import type { LineReadout } from '../ridership';
import type { StopView } from '../stops';
import type { DayOfWeek } from '../@types/metrics.types';
import type { StopMeasure, StopRecord } from '../@types/stops.types';

/**
 * Stop-level Boardings and Alightings for the selected lines, over the Month Window.
 *
 * ## The table is the primary readout
 *
 * The ranked table renders from the Stop View alone and never needs the map. The map
 * layer and this panel are two views of one `buildStopView` call — same readouts, same
 * radius domain, same month axis — so a stop cannot appear in one and not the other,
 * and clicking either a circle or a row selects the same stop.
 *
 * ## Nothing here re-derives anything
 *
 * Radius, colour, the month axis, the readouts and the coverage answer all arrive from
 * `src/stops/`. The one thing assembled outside it is the per-stop series, and that is
 * built from the module's own `months` list and `stopMetrics` — see `buildStopSeries`.
 * `src/stops/index.ts` exposes no series function today; that is a gap worth closing
 * there rather than a licence to restate the window rule here.
 */

const MEASURE_LABELS: Record<StopMeasure, string> = {
  ons: 'Boardings',
  offs: 'Alightings',
  both: 'Both',
};

const MEASURES = Object.keys(MEASURE_LABELS) as StopMeasure[];

export interface StopPanelProps {
  view: StopView;
  /**
   * The Ridership View's month axis over the same window, `YYYY-MM`.
   *
   * Only for the partial-coverage label: stop data is partial exactly when it covers
   * less of the selected period than the chart above does, which is the line table's
   * own meaning of the word.
   */
  windowMonths: readonly string[];
  /** Every loaded Stop Ridership Record, for the selected stop's series. */
  records: StopRecord[] | null;
  isLoading: boolean;
  hasFailed: boolean;
  /** Selected Line Readouts, for display names and for the "nothing selected" state. */
  lines: readonly LineReadout[];
  dayOfWeek: DayOfWeek;
  measure: StopMeasure;
  onMeasureChange: (measure: StopMeasure) => void;
  selectedStopKey: string | null;
  onSelectStop: (stopKey: string) => void;
  /** Set the Month Window to the Stop Coverage Window. `YYYY-MM` at both ends. */
  onUseCoverageWindow: (from: string, to: string) => void;
}

export default function StopPanel({
  view,
  windowMonths,
  records,
  isLoading,
  hasFailed,
  lines,
  dayOfWeek,
  measure,
  onMeasureChange,
  selectedStopKey,
  onSelectStop,
  onUseCoverageWindow,
}: StopPanelProps) {
  const coverageState = stopCoverageState({
    coverage: view.coverage,
    months: view.months,
    windowMonths,
  });

  /**
   * The readout the series is drawn from.
   *
   * The URL carries a stop key and the data's grain is stop × line, so a stop served by
   * several selected lines has several readouts. The first in readout order wins and
   * the caption names its line — summing them would be the stop-total-across-lines
   * rollup this project deliberately does not derive.
   */
  const selectedReadout = useMemo(
    () => view.readouts.find((readout) => readout.key === selectedStopKey),
    [view.readouts, selectedStopKey],
  );

  const series = useMemo(
    () =>
      selectedReadout
        ? buildStopSeries({
            records: records ?? [],
            months: view.months,
            stopKey: selectedReadout.key,
            lineId: selectedReadout.line_name,
            dayOfWeek,
          })
        : [],
    [selectedReadout, records, view.months, dayOfWeek],
  );

  const hasSelection = lines.length > 0;

  const body = () => {
    if (hasFailed)
      return (
        <p className="py-8 text-center text-sm text-stone-400">
          Stop-level ridership could not be loaded.
        </p>
      );
    // Order matters: `overlapsWindow` is `false` while nothing has loaded, so the
    // loading state has to be answered before the empty one or a slow network reads
    // as "this period has no stop data".
    if (isLoading)
      return (
        <p className="py-8 text-center text-sm text-stone-400">
          Loading stop ridership…
        </p>
      );
    if (coverageState === 'no-overlap') return null;
    if (!hasSelection)
      return (
        <p className="py-8 text-center text-sm text-stone-400">
          Select a Metro line to see its stops.
        </p>
      );
    if (view.readouts.length === 0)
      return (
        <p className="py-8 text-center text-sm text-stone-400">
          No stop-level data for the selected lines in this period.
        </p>
      );

    return (
      <>
        {selectedReadout && (
          <figure className="mt-3" data-qa="stop-series-figure">
            <figcaption className="mb-1 text-xs text-stone-500">
              {selectedReadout.name} ·{' '}
              {lines.find((line) => line.id === selectedReadout.line_name)
                ?.name ?? selectedReadout.line_name}
            </figcaption>
            <StopSeriesChart
              series={series}
              measure={measure}
              lineId={selectedReadout.line_name}
            />
          </figure>
        )}

        <div className="mt-3">
          <StopTable
            readouts={view.readouts}
            lines={lines}
            selectedStopKey={selectedStopKey}
            onSelectStop={onSelectStop}
          />
        </div>
      </>
    );
  };

  return (
    <div className="pane" id="stop-panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">
          Stop Ridership
        </span>

        {/* The same Radix control the mode filter uses, so two toggles in one
            dashboard look and behave alike. `type="single"` can yield `''` when the
            pressed item is pressed again; an empty measure is not one of the three, so
            the request is dropped rather than clearing the panel. */}
        <ToggleGroup.Root
          className="toggle-group"
          type="single"
          aria-label="Stop measure"
          value={measure}
          onValueChange={(next) => {
            if (next) onMeasureChange(next as StopMeasure);
          }}
        >
          {MEASURES.map((value) => (
            <ToggleGroup.Item
              key={value}
              className="toggle-group-item toggle-group-item-text"
              value={value}
              aria-label={MEASURE_LABELS[value]}
            >
              {MEASURE_LABELS[value]}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
      </div>

      <div className="mt-2">
        <StopCoverageNotice
          state={coverageState}
          coverage={view.coverage}
          months={view.months}
          onUseCoverageWindow={onUseCoverageWindow}
        />
      </div>

      {body()}
    </div>
  );
}
