import { useMemo } from 'react';
import * as ToggleGroup from '@radix-ui/react-toggle-group';
import StopCoverageNotice from './StopCoverageNotice';
import StopFilters from './StopFilters';
import StopSeriesChart, { type DrawnStopSeries } from './StopSeriesChart';
import StopTable from './StopTable';
import { stopCoverageState } from '../utils/stopCoverage';
import { buildStopSeriesIndex } from '../utils/stopSeries';
import type { LineReadout } from '../ridership';
import type { StopReadout, StopView } from '../stops';
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

/** The panel instead of a table, and a note beside one. Stated once each. */
const EMPTY_CLASS = 'py-8 text-center text-sm text-stone-400';
const NOTE_CLASS = 'mt-2 text-xs text-stone-400';

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
  /** Every loaded Stop Ridership Record, for the selected stops' series. */
  records: StopRecord[] | null;
  isLoading: boolean;
  hasFailed: boolean;
  /** Selected Line Readouts, for display names and for the "nothing selected" state. */
  lines: readonly LineReadout[];
  dayOfWeek: DayOfWeek;
  measure: StopMeasure;
  onMeasureChange: (measure: StopMeasure) => void;
  /** The Stop Selection, in the order the stops were selected. Empty is the opening state. */
  selectedStopKeys: readonly string[];
  onToggleStop: (stopKey: string) => void;
  /** Back to no stops selected — the state the panel opens in. */
  onClearStops: () => void;
  /**
   * Add every stop the table is currently listing. Scoped by the search, exactly as the
   * line filter's `Select All` is scoped by its own.
   */
  onSelectAllStops: (stopKeys: string[]) => void;
  /** Narrows the table by stop name. Lives in the URL as `stopq=`. */
  searchText: string;
  onSearchTextChange: (text: string) => void;
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
   * The rows the table shows, narrowed by the search.
   *
   * Substring, case-insensitive, against the stop name only — the same rule
   * `listedReadouts` applies to line names, so one search box in this dashboard does not
   * mean something different from the other. The line column is not matched because line
   * selection has already filtered on it upstream.
   *
   * **The search narrows the table, not the chart.** A stop stays drawn after a search
   * hides its row, because searching is how a reader finds the next stop to add, and
   * losing the comparison they were building would defeat that.
   */
  const listedReadouts = useMemo(() => {
    const query = searchText.toLocaleLowerCase();
    if (!query) return view.readouts;
    return view.readouts.filter((readout) =>
      readout.name.toLocaleLowerCase().includes(query),
    );
  }, [view.readouts, searchText]);

  /**
   * Every stop the table is listing, deduplicated — what `Select All` adds.
   *
   * Deduplicated because the table's grain is stop × line: a stop served by two selected
   * lines occupies two rows, and selection is by stop, so the two rows are one key.
   */
  const listedStopKeys = useMemo(
    () => [...new Set(listedReadouts.map((readout) => readout.key))],
    [listedReadouts],
  );

  /**
   * The month axis, keyed by its value rather than its identity.
   *
   * `buildStopView` returns a fresh array every time it runs, including on a measure
   * change, so keying the index below on `view.months` directly would regroup every
   * record and throw away the alignment cache each time the reader toggled Boardings to
   * Alightings — the one change the index is explicitly independent of.
   */
  const monthsKey = view.months.join(',');
  const months = useMemo(
    () => (monthsKey ? monthsKey.split(',') : []),
    [monthsKey],
  );

  /**
   * One index for the whole panel, not one build per row.
   *
   * `records` is memoised by `useStopView`, so this rebuilds only when a payload lands,
   * the window moves or the Day Of Week changes — never on a re-sort, a selection or a
   * measure change. The measure picks which of two figures a chart draws, and both are
   * already in every point.
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

  /*
   * Indexed, not scanned. Selection is uncapped and a five-line table is ~800 readouts, so
   * a `find` per selected key would be quadratic in exactly the case `Select All` invites —
   * and `StopTable` builds a `Set` forty lines from here for the same reason.
   */
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
   * What the figure draws, one entry per selected `(stop, line)` pair.
   *
   * Walked in **selection order**, outer loop over the keys, because that order fixes the
   * colours: the chart takes its hue by position, so iterating the readouts instead would
   * recolour every series on a re-sort.
   *
   * A stop on several selected lines yields several entries. Its figures genuinely differ
   * per line, so collapsing them would mean summing across lines — the stop-total rollup
   * this project deliberately does not derive. The figure and the row sparklines read one
   * cache, so both draw the identical array.
   */
  const drawn = useMemo<DrawnStopSeries[]>(
    () =>
      selectedStopKeys.flatMap((key) =>
        (readoutsByKey.get(key) ?? []).map((readout) => ({
          key: readout.key,
          lineId: readout.line_name,
          stopName: readout.name,
          lineName:
            lineNamesById.get(readout.line_name) ?? String(readout.line_name),
          series: seriesIndex.seriesFor(readout.key, readout.line_name),
        })),
      ),
    [selectedStopKeys, readoutsByKey, lineNamesById, seriesIndex],
  );

  /**
   * How many **stops** are drawn, which is not how many series are.
   *
   * A stop served by two selected lines contributes two series and one stop, so counting
   * `drawn` would tell a reader they had picked two stops when they had picked one.
   */
  const drawnStopCount = useMemo(
    () => new Set(drawn.map((stop) => stop.key)).size,
    [drawn],
  );

  const hasSelectedLines = lines.length > 0;

  /**
   * Is there anything on screen yet?
   *
   * The two payloads have independent fates: rail lands first, and bus is a separate
   * multi-megabyte request made later, when a bus line joins the selection. So neither
   * "loading" nor "failed" may take over the whole panel once there are readouts —
   * doing that blanks a table the reader is looking at for the length of a 5.3 MB
   * download, and turns one 404 into "nothing could be loaded" when half of it did.
   * Below, both become a note beside the data instead.
   */
  const hasReadouts = view.readouts.length > 0;

  const body = () => {
    // Order matters: `overlapsWindow` is `false` while nothing has loaded, so the
    // loading state has to be answered before the empty one or a slow network reads as
    // "this period has no stop data". `no-overlap` says nothing here because the notice
    // above the body has already said it.
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
        {/* A second payload arriving, or failing, beside data that is already here.
            A note, not a takeover — see `hasReadouts`. */}
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
            {/* The caption counts rather than names. With several stops drawn there is no
                one name to write here, and the chart's legend already names each series
                beside the colour it belongs to — which is where a reader looks to tell
                two series apart.

                Series are counted separately only when the two numbers differ, which
                happens when a stop is served by more than one selected line. Saying "1
                stop" beside two drawn lines would leave the reader counting; saying
                "1 stop · 2 series" every time would be noise for the common case. */}
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
          months={months}
          onUseCoverageWindow={onUseCoverageWindow}
        />
      </div>

      {body()}
    </div>
  );
}
