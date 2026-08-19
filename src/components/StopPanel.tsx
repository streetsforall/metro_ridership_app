import { useMemo } from 'react';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import StopCoverageNotice from './StopCoverageNotice';
import StopFilters from './StopFilters';
import StopSeriesChart, { type DrawnStopSeries } from './StopSeriesChart';
import StopTable from './StopTable';
import { stopCoverageState } from '../utils/stopCoverage';
import { buildStopSeriesIndex } from '../utils/stopSeries';
import { colorForSelectionIndex } from '../utils/stopSelectionColors';
import type { LineReadout } from '../ridership';
import type { StopReadout, StopView } from '../stops';
import type { DayOfWeek } from '../@types/metrics.types';
import type { StopMeasure, StopRecord } from '../@types/stops.types';

/**
 * Stop-level boardings and alightings for the selected lines, over the month window.
 *
 * The ranked table is the primary readout and never needs the map. Panel and map layer
 * are two views of one `buildStopView` call — same readouts, radius domain and month
 * axis — so a stop cannot appear in one and not the other.
 *
 * Nothing here re-derives any of that. The one thing assembled outside `src/stops/` is
 * the per-stop series, built from the module's own `months` and `stopMetrics`; the module
 * exposes no series function today, which is a gap to close there rather than a licence
 * to restate the window rule here.
 */

const MEASURE_LABELS: Record<StopMeasure, string> = {
  ons: 'Boardings',
  offs: 'Alightings',
  both: 'Both',
};

const MEASURES = Object.keys(MEASURE_LABELS) as StopMeasure[];

/** An empty state in place of the table, and a note beside one. */
const EMPTY_CLASS = 'py-8 text-center text-sm text-stone-400';
const NOTE_CLASS = 'mt-2 text-xs text-stone-400';

export interface StopPanelProps {
  view: StopView;
  /**
   * The ridership view's month axis over the same window, `YYYY-MM`. Only for the
   * partial-coverage label: stop data is partial exactly when it covers less of the
   * period than the chart above does, which is the line table's meaning of the word.
   */
  windowMonths: readonly string[];
  /** Every loaded stop record, for the selected stops' series. */
  records: StopRecord[] | null;
  isLoading: boolean;
  hasFailed: boolean;
  /** Selected lines, for display names and for the "nothing selected" state. */
  lines: readonly LineReadout[];
  dayOfWeek: DayOfWeek;
  measure: StopMeasure;
  onMeasureChange: (measure: StopMeasure) => void;
  /** The selection, in the order stops were picked. Empty is the opening state. */
  selectedStopKeys: readonly string[];
  onToggleStop: (stopKey: string) => void;
  /** Back to no stops selected. */
  onClearStops: () => void;
  /** Add every stop the table is listing — scoped by the search, as the line filter is. */
  onSelectAllStops: (stopKeys: string[]) => void;
  /** Narrows the table by stop name. Lives in the URL as `stopq=`. */
  searchText: string;
  onSearchTextChange: (text: string) => void;
  /** Set the month window to the stop coverage window. `YYYY-MM` at both ends. */
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
  selectedStopKeys,
  onToggleStop,
  onClearStops,
  onSelectAllStops,
  searchText,
  onSearchTextChange,
  onUseCoverageWindow,
}: StopPanelProps) {
  const coverageState = stopCoverageState({
    coverage: view.coverage,
    months: view.months,
    windowMonths,
  });

  /**
   * The rows the table shows. Case-insensitive substring against the stop name, the same
   * rule the line filter uses; the line column is not matched because line selection has
   * already filtered on it.
   *
   * The search narrows the table, not the chart. A stop stays drawn once its row is
   * hidden, because searching is how a reader finds the next stop to add and losing the
   * comparison in progress would defeat that.
   */
  const listedReadouts = useMemo(() => {
    const query = searchText.toLocaleLowerCase();
    if (!query) return view.readouts;
    return view.readouts.filter((readout) =>
      readout.name.toLocaleLowerCase().includes(query),
    );
  }, [view.readouts, searchText]);

  /**
   * What `Select All` adds. Deduplicated because the table's grain is stop × line while
   * selection is by stop, so a stop on two selected lines is two rows and one key.
   */
  const listedStopKeys = useMemo(
    () => [...new Set(listedReadouts.map((readout) => readout.key))],
    [listedReadouts],
  );

  /**
   * The month axis, keyed by value rather than identity. `buildStopView` returns a fresh
   * array on every run, including a measure change, so depending on `view.months` directly
   * would rebuild the index below on the one change it is independent of.
   */
  const monthsKey = view.months.join(',');
  const months = useMemo(
    () => (monthsKey ? monthsKey.split(',') : []),
    [monthsKey],
  );

  /**
   * One index for the whole panel, not one build per row. `records` is memoised upstream,
   * so this rebuilds only when a payload lands, the window moves or the day of week
   * changes — never on a re-sort, a selection or a measure change.
   */
  const seriesIndex = useMemo(
    () =>
      buildStopSeriesIndex({
        records: records ?? [],
        months,
        dayOfWeek,
      }),
    [records, months, dayOfWeek],
  );

  // Indexed, not scanned: selection is uncapped and a five-line table is ~800 readouts, so
  // a `find` per selected key would be quadratic in exactly the case `Select All` invites.
  const readoutsByKey = useMemo(() => {
    const byKey = new Map<string, StopReadout[]>();
    for (const readout of view.readouts) {
      const existing = byKey.get(readout.key);
      if (existing) existing.push(readout);
      else byKey.set(readout.key, [readout]);
    }
    return byKey;
  }, [view.readouts]);

  const lineNamesById = useMemo(
    () => new Map(lines.map((line) => [line.id, line.name])),
    [lines],
  );

  /**
   * What the figure draws, one entry per selected `(stop, line)` pair. Walked in selection
   * order because that order fixes the colours: the chart takes its hue by position, so
   * iterating the readouts instead would recolour every series on a re-sort.
   *
   * A stop on several selected lines yields several entries, because collapsing them would
   * mean summing across lines — the stop-total rollup this project does not derive.
   */
  const drawn = useMemo<DrawnStopSeries[]>(
    () =>
      selectedStopKeys.flatMap((key, selectionIndex) =>
        (readoutsByKey.get(key) ?? []).map((readout) => ({
          key: readout.key,
          lineId: readout.line_name,
          stopName: readout.name,
          lineName:
            lineNamesById.get(readout.line_name) ?? String(readout.line_name),
          series: seriesIndex.seriesFor(readout.key, readout.line_name),
          // The hue belongs to the stop, so it is taken here, where selection order is
          // still in hand — not from a position in the flattened list.
          color: colorForSelectionIndex(selectionIndex),
        })),
      ),
    [selectedStopKeys, readoutsByKey, lineNamesById, seriesIndex],
  );

  /**
   * How many stops are drawn, which is not how many series are: a stop on two selected
   * lines is two series and one stop, so counting `drawn` would overstate the selection.
   */
  const drawnStopCount = useMemo(
    () => new Set(drawn.map((stop) => stop.key)).size,
    [drawn],
  );

  const hasSelectedLines = lines.length > 0;

  /**
   * Is there anything on screen yet? The two payloads have independent fates — rail lands
   * first, bus is a separate multi-megabyte request made later — so neither "loading" nor
   * "failed" may take over the panel once there are readouts. Doing so would blank a table
   * mid-read for the length of a 5.3 MB download. Both become a note beside the data.
   */
  const hasReadouts = view.readouts.length > 0;

  const body = () => {
    // Order matters: `overlapsWindow` is `false` while nothing has loaded, so loading must
    // be answered before empty or a slow network reads as "no stop data in this period".
    // `no-overlap` says nothing here — the notice above the body has already said it.
    if (hasFailed && !hasReadouts)
      return (
        <p className={EMPTY_CLASS}>Stop-level ridership could not be loaded.</p>
      );
    if (isLoading && !hasReadouts)
      return <p className={EMPTY_CLASS}>Loading stop ridership…</p>;
    if (coverageState === 'no-overlap') return null;
    if (!hasSelectedLines)
      return (
        <p className={EMPTY_CLASS}>Select a Metro line to see its stops.</p>
      );
    if (!hasReadouts)
      return (
        <p className={EMPTY_CLASS}>
          No stop-level data for the selected lines in this period.
        </p>
      );

    return (
      <>
        {/* A second payload arriving, or failing, beside data already here — a note, not
            a takeover; see `hasReadouts`. */}
        {isLoading && (
          <p
            className={NOTE_CLASS}
            data-qa="stop-loading-more"
            aria-live="polite"
          >
            Loading more stops…
          </p>
        )}
        {hasFailed && !isLoading && (
          <p className={NOTE_CLASS} data-qa="stop-partial-failure">
            Some stop-level ridership could not be loaded.
          </p>
        )}

        {drawn.length > 0 && (
          <figure className="mt-3" data-qa="stop-series-figure">
            {/* The caption counts rather than names: with several stops drawn there is no
                one name to write, and the legend already names each series beside its
                colour. Series are counted separately only when the two numbers differ,
                since "1 stop · 2 series" every time would be noise for the common case. */}
            <figcaption className="mb-1 text-xs text-stone-500">
              Ridership over time · {drawnStopCount}{' '}
              {drawnStopCount === 1 ? 'stop' : 'stops'}
              {drawn.length !== drawnStopCount &&
                ` · ${String(drawn.length)} series`}
            </figcaption>
            <StopSeriesChart drawn={drawn} measure={measure} />
          </figure>
        )}

        <StopFilters
          searchText={searchText}
          onSearchTextChange={onSearchTextChange}
          listedStopKeys={listedStopKeys}
          onSelectAllStops={onSelectAllStops}
          onClearStops={onClearStops}
        />

        <div className="mt-3">
          <StopTable
            readouts={listedReadouts}
            lines={lines}
            selectedStopKeys={selectedStopKeys}
            onToggleStop={onToggleStop}
            seriesIndex={seriesIndex}
            measure={measure}
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

        {/* The same Radix control the mode filter uses, so two toggles look and behave
            alike. `type="single"` yields `''` when the pressed item is pressed again, and
            an empty measure is not one of the three, so that request is dropped. */}
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
          months={months}
          onUseCoverageWindow={onUseCoverageWindow}
        />
      </div>

      {body()}
    </div>
  );
}
