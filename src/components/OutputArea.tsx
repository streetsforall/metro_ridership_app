import { useEffect, useRef, useState } from 'react';
import type { ChartDataset } from 'chart.js';
import SummaryData from './SummaryData';
import Map from './Map';
import RidershipChart from './RidershipChart';
import ContextLogPanel from './ContextLogPanel';
import type { CustomChartData } from '../@types/chart.types';
import type { LineReadout } from '../ridership';
import type { TransitEvent } from '../@types/events.types';

interface OutputAreaProps {
  chartDatasets: ChartDataset<'line', CustomChartData[]>[];
  months: string[];
  lines: LineReadout[];
  transitEvents: TransitEvent[];
  /** Panel Settings visibility flags. All default to on except the context log. */
  showChart?: boolean;
  showSummary?: boolean;
  showMap?: boolean;
  /** Whether the context-log panel is enabled from the filter bar. */
  showContextLogs: boolean;
  /** True while the ridership dataset is still being fetched. */
  isLoading?: boolean;
  /** Set the month window from a drag across the chart. Labels are `"YYYY M"`. */
  onRangeSelect?: (startMonth: string, endMonth: string) => void;
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
  showChart = true,
  showSummary = true,
  showMap = true,
  showContextLogs,
  isLoading = false,
  onRangeSelect,
}: OutputAreaProps) {
  /**
   * The chart and the context log are two views of the same months, so the two
   * bits of state that link them live here rather than in either one: the pinned
   * month (chart tooltip ↔ highlighted row) and the hovered month (row ↔ dot).
   */
  const [pinnedMonth, setPinnedMonth] = useState<string | null>(null);
  const [hoveredMonth, setHoveredMonth] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  /** Whether any line is selected, and so whether there is anything to chart. */
  const hasSelection = chartDatasets.length > 0;

  /**
   * A hidden chart falls back to `#output-placeholder` — the same element the
   * no-selection and loading states use — rather than a second empty state, so
   * the area is never blank and there is only one thing to keep in step.
   */
  const isChartVisible = hasSelection && showChart;
  const placeholderMessage = isLoading
    ? 'Loading ridership data…'
    : hasSelection
      ? 'Chart hidden — turn it back on in Panel Settings.'
      : 'Please select a Metro line.';

  /**
   * The summary and map share a row only when both are actually on screen.
   * Either one alone takes the full width instead of leaving a hole in the
   * other track.
   */
  const isSummaryVisible = hasSelection && showSummary;
  const isRowSplit = isSummaryVisible && showMap;

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
      if (!rootRef.current?.contains(event.target as Node)) setPinnedMonth(null);
    };

    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [pinnedMonth]);

  return (
    <div ref={rootRef} className="flex flex-col gap-4 lg:min-h-[50vh] min-w-0">
      {/* Only show the chart if something is selected and it is not switched off */}
      {isChartVisible ? (
        <RidershipChart
          chartDatasets={chartDatasets}
          months={months}
          transitEvents={transitEvents}
          pinnedMonth={pinnedMonth}
          onPinnedMonthChange={setPinnedMonth}
          highlightedMonth={hoveredMonth}
          onRangeSelect={onRangeSelect}
        />
      ) : (
        /* Chart pane */
        <div
          id="output-placeholder"
          className="pane flex-1 flex items-center justify-center text-sm text-stone-400"
        >
          <p>{placeholderMessage}</p>
        </div>
      )}

      {/**
       * Summary and map share a row from `lg` up. The map is rendered here and
       * nowhere else, in one JSX position that is never inside a branch: moving
       * it between branches would unmount MapLibre whenever the last line is
       * deselected, and the instance must survive that. Switching the map off
       * from Panel Settings hides its pane with `display: none` for the same
       * reason — the instance is ready to draw, and coming back is safe without
       * a manual re-measure because `trackResize` watches the container. With
       * no summary beside it the row falls back to one column so the map spans
       * the full width rather than sitting in a 2fr track with a hole next to
       * it, and the same applies to the summary with no map beside it.
       *
       * The two panes stretch to a common height, and the map fills its pane
       * rather than sitting at a fixed height inside a taller one — see
       * `#lineMap` in Map.css, which is why the pane is a flex column. The row
       * is as tall as whichever side is taller: the summary grows with the
       * number of selected lines, and the map holds a 400px floor below that.
       */}
      <div
        className={`grid gap-4 grid-cols-[1fr] ${isRowSplit ? 'lg:grid-cols-[2fr_3fr]' : ''}`}
      >
        {isSummaryVisible && <SummaryData lines={lines} />}

        {/**
         * The map pane keeps `.pane`'s 2rem padding, like every other pane. The
         * map is inset inside a full-height card rather than filling it to the
         * edge — a full-bleed variant was tried and reverted, because the
         * complaint it was meant to answer was the *pane* not reaching the
         * bottom of the row, which is fixed above by letting the two panes
         * stretch to a common height.
         *
         * `flex` is written out per branch rather than sitting alongside
         * `hidden`: both set `display`, so which one wins would come down to
         * their order in the generated stylesheet.
         */}
        <div
          id="map-panel"
          className={`pane flex-col ${showMap ? 'flex' : 'hidden'}`}
        >
          <Map lines={lines} />
        </div>
      </div>

      {/* Context log panel — opt-in from the filter bar, and only when events exist and a line is selected */}
      {showContextLogs && transitEvents.length > 0 && hasSelection && (
        <ContextLogPanel
          events={transitEvents}
          pinnedMonth={pinnedMonth}
          onSelectMonth={(month) =>
            setPinnedMonth((pinned) => (pinned === month ? null : month))
          }
          onHoverMonthChange={setHoveredMonth}
        />
      )}
    </div>
  );
}
