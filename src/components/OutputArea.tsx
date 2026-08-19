import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChartDataset } from 'chart.js';
import SummaryData from './SummaryData';
import Map from './Map';
import RidershipChart from './RidershipChart';
import ContextLogPanel from './ContextLogPanel';
import StopPanel from './StopPanel';
import useStopView from '../hooks/useStopView';
import { eventDateToLabel, labelToEventDate } from '../chart';
import type { CustomChartData } from '../@types/chart.types';
import type { LineReadout } from '../ridership';
import type { TransitEvent } from '../@types/events.types';
import type { DayOfWeek } from '../@types/metrics.types';
import type { StopMeasure } from '../@types/stops.types';
import { NO_SELECTED_STOPS } from '../utils/stopDefaults';

/**
 * The stand-in for an absent stop handler. `StopPanel` declares its five callbacks
 * non-optional while they arrive here optional, and closing that gap with an arrow per
 * call site made five new functions per render — which the memo on a stop row could not
 * survive. One module-level no-op has an identity that never changes.
 */
const noop = (): void => {};

interface OutputAreaProps {
  chartDatasets: ChartDataset<'line', CustomChartData[]>[];
  months: string[];
  lines: LineReadout[];
  transitEvents: TransitEvent[];
  /** Whether the context-log panel is enabled from the filter bar. */
  showContextLogs: boolean;
  /** True while the ridership dataset is still being fetched. */
  isLoading?: boolean;
  /** Set the month window from a drag across the chart. Labels are `"YYYY M"`. */
  onRangeSelect?: (startMonth: string, endMonth: string) => void;

  /**
   * The stop panel's slice of dashboard state. It arrives as props because it is
   * URL-synced and `useUserDashboardInput` is the one place that reads and writes the URL.
   * The derivation is local: this module is `useStopView`'s only importer, so its payloads
   * land in this lazy chunk rather than on the first-paint path.
   */
  showStops?: boolean;
  stopMeasure?: StopMeasure;
  onStopMeasureChange?: (measure: StopMeasure) => void;
  selectedStopKeys?: readonly string[];
  onToggleStop?: (stopKey: string) => void;
  onClearStops?: () => void;
  onSelectAllStops?: (stopKeys: string[]) => void;
  stopSearchText?: string;
  onStopSearchTextChange?: (text: string) => void;
  /** The month window and day of week the stop derivation reads. */
  startDate: Date;
  endDate: Date;
  dayOfWeek: DayOfWeek;
}

/**
 * `min-w-0` on the root opts this grid item out of its automatic minimum,
 * which is otherwise its min-content width. Without it a child that refuses
 * to wrap — the summary row below did at `xl` — hands the surrounding `1fr`
 * track a min-content width larger than its share, and the whole page scrolls
 * sideways.
 */
export default function OutputArea({
  chartDatasets,
  months,
  lines,
  transitEvents,
  showContextLogs,
  isLoading = false,
  onRangeSelect,
  showStops = false,
  stopMeasure = 'ons',
  onStopMeasureChange = noop,
  selectedStopKeys = NO_SELECTED_STOPS,
  onToggleStop = noop,
  onClearStops = noop,
  onSelectAllStops = noop,
  stopSearchText = '',
  onStopSearchTextChange = noop,
  startDate,
  endDate,
  dayOfWeek,
}: OutputAreaProps) {
  /**
   * The chart and the context log are two views of the same months, so the two
   * bits of state that link them live here rather than in either one: the pinned
   * month (chart tooltip ↔ highlighted row) and the hovered month (row ↔ dot).
   */
  const [pinnedMonth, setPinnedMonth] = useState<string | null>(null);
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  /**
   * The release-before-taking half of ADR-0011, stated once for every view that
   * asks. While anything is pinned a request pins nothing; only a further
   * request pins the month it names.
   *
   * The chart, the Event Gutter and the log all route through here rather than
   * deciding for themselves, because they are three views of one piece of state
   * and a state that behaves three ways is three states.
   *
   * A request naming no month releases whichever branch it takes, which is why
   * Escape needs no rule of its own. Note that a plot click landing on no
   * element is *not* such a request — it makes none at all, and the pin is held
   * (ADR-0010); the tooltip's hint says "any month" for that reason.
   */
  const requestPin = useCallback((month: string | null) => {
    setPinnedMonth((pinned) => (pinned === null ? month : null));
  }, []);

  /** Whether any line is selected, and so whether there is anything to chart. */
  const hasSelection = chartDatasets.length > 0;

  /**
   * The selected lines, and their ids in the order readouts and markers should follow.
   * Memoised because both feed the stop derivation, so a fresh array each render would
   * rebuild the view — and the whole marker collection — on any unrelated state change.
   */
  const selectedLines = useMemo(
    () => lines.filter((line) => line.selected),
    [lines],
  );
  const selectedLineIds = useMemo(
    () => selectedLines.map((line) => line.id),
    [selectedLines],
  );

  const {
    view: stopView,
    records: stopRecords,
    isLoading: isStopLoading,
    hasFailed: stopsFailed,
  } = useStopView({
    enabled: showStops,
    lineIds: selectedLineIds,
    startDate,
    endDate,
    dayOfWeek,
    measure: stopMeasure,
  });

  /**
   * The chart's month axis, respelled for the stop panel: chart labels are `"YYYY M"` and
   * the stop grain's are `YYYY-MM`, with every conversion in `src/chart/months.ts`. A
   * respelling and nothing more — both lists came out of the one window predicate.
   */
  const windowMonths = useMemo(() => months.map(labelToEventDate), [months]);

  /**
   * Jump the month window to the stop coverage window. Routed through `onRangeSelect`, the
   * setters a chart drag uses, so one press moves the pickers, the chart and the URL
   * together. The only work here is the spelling.
   */
  const useCoverageWindow = useCallback(
    (from: string, to: string) => {
      onRangeSelect?.(eventDateToLabel(from), eventDateToLabel(to));
    },
    [onRangeSelect],
  );

  /**
   * A press anywhere outside this whole area releases the pin — scoped to the
   * area rather than to the chart, because the context log is the other half of
   * the same interaction. Scoped to the chart alone, clicking a log row would
   * unpin on the press and re-pin on the click, and the pin could never be
   * released from the panel at all.
   */
  useEffect(() => {
    if (pinnedMonth === null) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node))
        setPinnedMonth(null);
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [pinnedMonth]);

  return (
    <div ref={rootRef} className="flex flex-col gap-4 lg:min-h-[50vh] min-w-0">
      {/* Only show the chart if something is selected */}
      {hasSelection ? (
        <RidershipChart
          chartDatasets={chartDatasets}
          months={months}
          transitEvents={transitEvents}
          pinnedMonth={pinnedMonth}
          onPinnedMonthRequest={requestPin}
          highlightedMonth={hoveredMonth}
          onRangeSelect={onRangeSelect}
        />
      ) : (
        /* Chart pane */
        <div
          id="output-placeholder"
          className="pane flex-1 flex items-center justify-center text-sm text-stone-400"
        >
          <p>
            {isLoading
              ? 'Loading ridership data…'
              : 'Please select a Metro line.'}
          </p>
        </div>
      )}

      {/**
       * Summary and map share a row from `lg` up. The map is rendered here and
       * nowhere else, in one JSX position that is never inside a branch: moving
       * it between branches would unmount MapLibre whenever the last line is
       * deselected, and the instance must survive that. With no summary beside
       * it the row falls back to one column so the map spans the full width
       * rather than sitting in a 2fr track with a hole next to it.
       *
       * The two panes stretch to a common height, and the map fills its pane
       * rather than sitting at a fixed height inside a taller one — see
       * `#lineMap` in Map.css, which is why the pane is a flex column. The row
       * is as tall as whichever side is taller: the summary grows with the
       * number of selected lines, and the map holds a 400px floor below that.
       */}
      <div
        className={`grid gap-4 grid-cols-[1fr] ${hasSelection ? 'lg:grid-cols-[2fr_3fr]' : ''}`}
      >
        {hasSelection && <SummaryData lines={lines} />}

        {/**
         * The map pane keeps `.pane`'s 2rem padding, like every other pane. The
         * map is inset inside a full-height card rather than filling it to the
         * edge — a full-bleed variant was tried and reverted, because the
         * complaint it was meant to answer was the *pane* not reaching the
         * bottom of the row, which is fixed above by letting the two panes
         * stretch to a common height.
         */}
        <div className="pane flex flex-col">
          <Map
            lines={lines}
            stopMarkers={stopView.markers}
            stopReadouts={stopView.readouts}
            stopMeasure={stopMeasure}
            selectedStopKeys={selectedStopKeys}
            onToggleStop={onToggleStop}
          />
        </div>
      </div>

      {/**
       * The stop panel — opt-in via `stops=1`, and its own full-width pane below the
       * summary-and-map row rather than between them.
       *
       * The plan put it "between SummaryData and the map"; those two have since become
       * one two-column row, and a table of up to ~800 rows does not belong in a 2fr
       * track beside a map. Full width below the row is where the context log already
       * sits, and it keeps the row's two panes stretching to a common height.
       */}
      {showStops && (
        <StopPanel
          view={stopView}
          windowMonths={windowMonths}
          records={stopRecords}
          isLoading={isStopLoading}
          hasFailed={stopsFailed}
          lines={selectedLines}
          dayOfWeek={dayOfWeek}
          measure={stopMeasure}
          onMeasureChange={onStopMeasureChange}
          selectedStopKeys={selectedStopKeys}
          onToggleStop={onToggleStop}
          onClearStops={onClearStops}
          onSelectAllStops={onSelectAllStops}
          searchText={stopSearchText}
          onSearchTextChange={onStopSearchTextChange}
          onUseCoverageWindow={useCoverageWindow}
        />
      )}

      {/* Context log panel — opt-in from the filter bar, and only when events exist and a line is selected */}
      {showContextLogs && transitEvents.length > 0 && hasSelection && (
        <ContextLogPanel
          events={transitEvents}
          pinnedMonth={pinnedMonth}
          onSelectMonth={requestPin}
          onHoverMonthChange={setHoveredMonth}
        />
      )}
    </div>
  );
}
