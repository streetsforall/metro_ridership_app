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

/** One shared no-op for absent stop handlers, so no row's memo sees a fresh function. */
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
   * The stop panel's slice of dashboard state, passed in because `useUserDashboardInput`
   * is the one place that reads and writes the URL.
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
 * `min-w-0` opts this grid item out of its min-content minimum, or the page scrolls
 * sideways (ADR-0015).
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
   * The pinned and hovered months live here because the chart and the log are two views
   * of them.
   */
  const [pinnedMonth, setPinnedMonth] = useState<string | null>(null);
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  /**
   * Release before taking, routed here so the chart, the gutter and the log cannot
   * disagree (ADR-0010, ADR-0011).
   */
  const requestPin = useCallback((month: string | null) => {
    setPinnedMonth((pinned) => (pinned === null ? month : null));
  }, []);

  /** Whether any line is selected, and so whether there is anything to chart. */
  const hasSelection = chartDatasets.length > 0;

  /** The selected lines and their ids, memoised so the stop derivation doesn't rerun. */
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

  /** The chart's month axis respelled from `"YYYY M"` to the stop grain's `YYYY-MM`. */
  const windowMonths = useMemo(() => months.map(labelToEventDate), [months]);

  /**
   * Jumps the month window to the stop coverage window, through the same setters a chart
   * drag uses.
   */
  const useCoverageWindow = useCallback(
    (from: string, to: string) => {
      onRangeSelect?.(eventDateToLabel(from), eventDateToLabel(to));
    },
    [onRangeSelect],
  );

  /**
   * A press outside the whole area releases the pin, scoped wide because the log is the
   * other half of the same interaction (ADR-0011).
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
       * The map sits in one JSX position that is never inside a branch, so MapLibre
       * survives a deselect (ADR-0015).
       */}
      <div
        className={`grid gap-4 grid-cols-[1fr] ${hasSelection ? 'lg:grid-cols-[2fr_3fr]' : ''}`}
      >
        {hasSelection && <SummaryData lines={lines} />}

        {/**
         * The map pane keeps `.pane`'s padding; the full-bleed variant was tried and
         * reverted (ADR-0015).
         */}
        <div className="pane flex flex-col">
          <Map lines={lines} />
        </div>
      </div>

      {/**
       * The stop panel — opt-in via `stops=1`, full width below the summary-and-map row
       * because a ~800-row table doesn't fit beside a map.
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
