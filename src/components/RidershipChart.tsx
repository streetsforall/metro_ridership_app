import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import {
  Chart as ChartJS,
  type ChartDataset,
  type ChartEvent,
  type ChartOptions,
} from 'chart.js';
import { Line as LineChart } from 'react-chartjs-2';
import colors from 'tailwindcss/colors';
import ChartTooltip from './ChartTooltip';
import type { CustomChartData, TooltipExternalArgs } from '../@types/chart.types';
import type { TransitEvent } from '../@types/events.types';
import {
  consumeDragSuppression,
  formatMonthLabel,
  groupEventsByMonthIndex,
  RANGE_SELECT_EVENTS,
} from '../chart';

const ridershipFormatter = new Intl.NumberFormat('en-US');

export interface RidershipChartProps {
  chartDatasets: ChartDataset<'line', CustomChartData[]>[];
  months: string[];
  transitEvents: TransitEvent[];
  /** Pinned month label (`"YYYY M"`), owned by the parent so the log agrees. */
  pinnedMonth: string | null;
  /**
   * Asks for a month to be pinned, or for the pin to be released with `null`.
   * A request, not a change: the parent decides what it means, because the same
   * rule has to hold for the context log — see `OutputArea`.
   */
  onPinnedMonthRequest: (month: string | null) => void;
  /** Month whose context-log row is under the cursor; its dot grows. */
  highlightedMonth: string | null;
  /** Inclusive month labels of a drag across the plot. */
  onRangeSelect?: (startMonth: string, endMonth: string) => void;
}

/** Index of a label, or null when absent — `indexOf`'s -1 is a footgun here. */
function indexOfMonth(months: string[], month: string | null): number | null {
  if (month === null) return null;
  const index = months.indexOf(month);
  return index === -1 ? null : index;
}

export default function RidershipChart({
  chartDatasets,
  months,
  transitEvents,
  pinnedMonth,
  onPinnedMonthRequest,
  highlightedMonth,
  onRangeSelect,
}: RidershipChartProps) {
  /**
   * The chart instance is state, not a ref, because the tooltip's position is
   * derived from its x scale during render. A ref is null on the first render —
   * the child has not mounted yet — and writing to it triggers nothing, so a
   * month already pinned at mount would place its tooltip nowhere and never
   * re-render to fix it.
   */
  const [chart, setChart] = useState<ChartJS<'line', CustomChartData[]> | null>(
    null,
  );
  /**
   * The plot's box, and its measured width.
   *
   * The element is state rather than a ref for the same reason the chart
   * instance is: the width has to be measured once it exists, and a ref that
   * fills in silently schedules nothing to measure it. The width was read
   * straight off `ref.current.clientWidth` during render until the tooltip
   * gained a layout that depends on it — which meant zero on the first paint and
   * correct only after some unrelated re-render. Survivable for a clamp that is
   * a few pixels out; not for a mode, which would open the readout in the wrong
   * one and leave it there.
   */
  const [plotBox, setPlotBox] = useState<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  /**
   * Measured in a layout effect so the first painted frame already has the real
   * width, and re-measured by the observer so a window resize — or a panel
   * beside the chart opening — switches the tooltip's mode rather than leaving a
   * stale one on screen.
   */
  useLayoutEffect(() => {
    if (!plotBox) return;
    setContainerWidth(plotBox.clientWidth);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setContainerWidth(entry.contentRect.width);
    });
    observer.observe(plotBox);
    return () => observer.disconnect();
  }, [plotBox]);

  // Stable identity: an inline callback ref is re-invoked with null and then the
  // instance on every render, which here would be a setState loop.
  const handleChartRef = useCallback(
    (instance: ChartJS<'line', CustomChartData[]> | null | undefined) => {
      setChart(instance ?? null);
      /**
       * Test seam, on the same terms as `window.__metroMap`: nothing in the app
       * reads it. The Event Gutter is painted into the canvas, so a spec aiming
       * at a triangle has no element to locate and would otherwise have to guess
       * `chartArea.bottom` from the plot's box.
       */
      if (instance) window.__metroChart = instance as unknown as ChartJS<'line'>;
      else delete window.__metroChart;
    },
    [],
  );

  /** Month under the pointer, reported by the tooltip's `external` handler. */
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  /** Month reached with the arrow keys. Survives until blur or Escape. */
  const [keyboardIndex, setKeyboardIndex] = useState<number | null>(null);

  const pinnedIndex = indexOfMonth(months, pinnedMonth);
  const highlightedIndex = indexOfMonth(months, highlightedMonth);

  /**
   * Releasing a pin releases the readout with it.
   *
   * A hover is meant to be transient, and on a mouse it is: the next movement
   * retargets it and `mouseout` ends it. A touch screen sends neither. A tap
   * synthesises one `mousemove` and nothing ever takes it back, so `hoverIndex`
   * on a phone is not "the month under the pointer" but "the last month
   * touched", permanently — and it outlived the pin it arrived with. Tapping
   * another month to get out of a readout releases the pin (ADR-0011) and left
   * the readout standing in its *unpinned* form, which drops the Expand control,
   * re-clamps the description and hides the source link while the strip stays
   * capped at a third of the plot: a box naming a month whose event it was now
   * too short to show, offering nothing that would open it.
   *
   * So the fallback is cleared rather than filtered. Asking the platform
   * instead — `matchMedia('(hover: none)')`, and only dropping the hover there —
   * looks tidier and is not dependable: the same emulated phone answers that
   * query differently between one render and the next, which would make this
   * fix hold or not hold at random. Clearing needs no such answer, and states
   * one rule for every pointer.
   *
   * Adjusted during render rather than in an effect, which is React's own
   * pattern for a state that has to follow a prop: the release and the cleared
   * hover reach the reader in the same paint, with no frame of the readout
   * still standing between them.
   *
   * The cost, on a mouse: releasing a pin without moving takes the readout away
   * rather than leaving a hovering one, until the pointer moves a pixel. That is
   * the price of one rule instead of two, and it is what "release" looked like
   * on a phone all along.
   */
  const [lastPinnedMonth, setLastPinnedMonth] = useState(pinnedMonth);
  if (pinnedMonth !== lastPinnedMonth) {
    setLastPinnedMonth(pinnedMonth);
    if (pinnedMonth === null) setHoverIndex(null);
  }

  /**
   * One month drives the tooltip, the crosshair and the enlarged dot, whichever
   * way it was chosen. A pin outranks the keyboard, which outranks the pointer:
   * a pin is the only one the reader asked to persist, and a stray mousemove
   * must not silently retarget what they pinned.
   */
  const activeIndex = pinnedIndex ?? keyboardIndex ?? hoverIndex;

  const eventsByIndex = groupEventsByMonthIndex(transitEvents, months);

  /**
   * Names the month that was acted on and stops there. Whether that pins it,
   * releases the pin already held, or does nothing is not the chart's to decide:
   * the log asks the same question of the same state, and the rule lives once,
   * with the state, in `OutputArea`.
   */
  const pinIndex = useCallback(
    (index: number | null) => {
      const month = index === null ? null : (months[index] ?? null);
      onPinnedMonthRequest(month);
    },
    [months, onPinnedMonthRequest],
  );

  /**
   * Escape unpins from anywhere, not only while the plot has focus — a reader
   * who pinned with the mouse never focused it.
   *
   * Dismissing on a press *outside* deliberately does not live here. The context
   * log is the other half of this interaction, and a listener scoped to the plot
   * would fire on a log row click, unpin, and then watch the row re-pin. It
   * belongs to whoever owns both — see `OutputArea`.
   */
  useEffect(() => {
    if (pinnedMonth === null) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onPinnedMonthRequest(null);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [pinnedMonth, onPinnedMonthRequest]);

  ChartJS.defaults.font.family = 'Overpass Mono Variable';
  ChartJS.defaults.color = colors.stone['700'];

  const handleClick = (
    event: ChartEvent,
    _elements: unknown[],
    chart: ChartJS,
  ) => {
    /**
     * Chart.js dispatches `onClick` for `mouseup` as well as `click` —
     * `_isClickEvent` — and `mouseup` is in the event list because the Range
     * Selection plugin needs it. One press and release therefore arrives here
     * twice, and only the `click` counts: two pin requests per gesture cancel
     * out under the release-first rule, and the `mouseup` pass runs before the
     * plugin has set its suppression flag. See ADR-0011, *What release-first
     * exposed*.
     */
    if (event.type !== 'click') return;

    // The click that ends a drag is not a click; the drag already re-ranged.
    if (consumeDragSuppression(chart)) return;

    const found = chart.getElementsAtEventForMode(
      event.native as Event,
      'index',
      { intersect: false },
      false,
    );
    if (found.length) pinIndex(found[0].index);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!months.length) return;
    const current = activeIndex ?? 0;

    switch (event.key) {
      case 'ArrowRight':
        event.preventDefault();
        setKeyboardIndex(Math.min(current + 1, months.length - 1));
        break;
      case 'ArrowLeft':
        event.preventDefault();
        setKeyboardIndex(Math.max(current - 1, 0));
        break;
      case 'Home':
        event.preventDefault();
        setKeyboardIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setKeyboardIndex(months.length - 1);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        pinIndex(current);
        break;
      case 'Escape':
        onPinnedMonthRequest(null);
        setKeyboardIndex(null);
        break;
    }
  };

  const options: ChartOptions<'line'> = {
    // Honour prefers-reduced-motion: skip the intro easing rather than animating the canvas.
    // Playwright sets this for snapshot runs, which also makes the chart deterministic.
    animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : undefined,
    events: [...RANGE_SELECT_EVENTS],
    interaction: {
      axis: 'x',
      includeInvisible: false,
      intersect: false,
      mode: 'index',
    },
    onClick: handleClick,
    plugins: {
      tooltip: {
        // The readout is HTML (see ChartTooltip). Chart.js still tracks the
        // active element — the crosshair reads it — it just paints nothing.
        enabled: false,
        external: (args) => {
          /**
           * A repaint is not a gesture — `rangeSelect` and the Event Gutter keep
           * the same rule. `Chart#update` replays `_lastEvent`, and
           * `determineLastEvent` holds the *previous* event across a click, so
           * the re-render a pin causes hands this callback the month the reader
           * just left and sets the hover back to it. Chart.js passes the flag
           * that says so; only its types leave it out (see `TooltipExternalArgs`).
           */
          if ((args as TooltipExternalArgs).replay) return;

          const { tooltip } = args;
          setHoverIndex(
            tooltip.opacity === 0 ? null : (tooltip.dataPoints?.[0]?.dataIndex ?? null),
          );
        },
      },
      eventGutter: {
        // Not `events` — Chart.js reads that key as a plugin's event-type
        // filter, which silently stops the gutter hearing any pointer event.
        // See `src/@types/chart.types.ts`.
        transitEvents,
        focusedIndex: activeIndex,
        highlightedIndex,
        /**
         * The gutter sits outside `chartArea`, where Chart.js dispatches neither
         * `onClick` nor a hover retarget, so the plugin hit-tests its own strip
         * and reports a month here. Both land on the same setters the plot
         * drives, which is what makes a triangle's readout identical to the
         * column's — see ADR-0010.
         */
        onGutterClick: pinIndex,
        onGutterHover: setHoverIndex,
      },
      hoverCrosshair: {
        // Hover already moves Chart.js's own active element, so only the two
        // sources it cannot see need to override it.
        focusedIndex: pinnedIndex ?? keyboardIndex,
        isPinned: pinnedIndex !== null,
      },
      rangeSelect: {
        onSelect: (startIndex, endIndex) => {
          if (!months[startIndex] || !months[endIndex]) return;
          onRangeSelect?.(months[startIndex], months[endIndex]);
        },
      },
    },
    parsing: {
      xAxisKey: 'time',
      yAxisKey: 'stat',
    },
    /**
     * The canvas takes its height from its container (see the wrapper below) rather than
     * from Chart.js's own width÷aspectRatio. Chart.js only consults the container's height
     * when this is off, so it is what lets the CSS height floor reach the plot.
     */
    maintainAspectRatio: false,
    responsive: true,
    scales: {
      x: {
        border: {
          color: colors.stone['700'],
        },
        grid: {
          color: colors.stone['300'],
        },
        /**
         * Reserves the Event Gutter. Chart.js lays the axis out from its tick
         * padding, so asking for the strip here is what keeps the triangles from
         * ever colliding with the rotated month labels or the MONTH title — at
         * any window width, rather than at the widths someone happened to check.
         * It costs a little plot height; the height floor below is unchanged.
         */
        ticks: {
          padding: 16,
        },
        title: {
          display: true,
          text: 'MONTH',
        },
      },
      y: {
        border: {
          color: colors.stone['700'],
        },
        grid: {
          color: colors.stone['300'],
          drawTicks: false,
        },
        min: 0,
        title: {
          display: true,
          text: 'AVG DAILY RIDERSHIP',
        },
      },
    },
  };

  /**
   * Anchor the tooltip on the crosshair rather than on Chart.js's caret, so the
   * three ways a month becomes active — pointer, keyboard, pin — all place the
   * box identically. The caret only exists for the first of them.
   */
  const caret =
    activeIndex !== null && chart?.scales.x
      ? {
          x: chart.scales.x.getPixelForValue(activeIndex),
          y: chart.chartArea.top,
        }
      : null;

  /** What the strip caps itself against — the series it would otherwise cover. */
  const plotHeight = chart
    ? chart.chartArea.bottom - chart.chartArea.top
    : 0;

  const activeEvents = activeIndex === null ? [] : (eventsByIndex.get(activeIndex) ?? []);

  /** What a screen reader hears when the focused month changes. */
  const liveText =
    activeIndex === null || !months[activeIndex]
      ? ''
      : [
          formatMonthLabel(months[activeIndex]),
          ...chartDatasets.map((dataset) => {
            const value = dataset.data[activeIndex]?.stat;
            return value === null || value === undefined
              ? `${dataset.label ?? ''} no data`
              : `${dataset.label ?? ''} ${ridershipFormatter.format(value)}`;
          }),
          ...activeEvents.map((event) => `Event: ${event.title}. ${event.description}`),
        ].join('. ');

  return (
    <div className="pane" id="ridership-chart">
      {/**
       * Sizing box for the canvas. Chart.js's own `maintainAspectRatio` derives the
       * canvas height from the container width alone, which on a 390px phone is a
       * 300×150 canvas — and once the legend wraps to a second row (three lines plus
       * the aggregate is enough) it eats ~60px of that, collapsing the plot to a ~20px
       * band that fits only two y-axis ticks and rounds the axis up to 500,000. Sizing
       * the box in CSS instead lets a height floor apply where Chart.js has none.
       *
       * `pt-[50%]` is the percentage-padding ratio trick rather than `aspect-[2/1]` on
       * purpose. A box with a real `aspect-ratio` transfers its floored height back into
       * a min-content *width* of 2× the floor; this div sits inside a `1fr` grid track
       * whose automatic minimum has to honour that, so the column — and the whole page —
       * grew sideways past the viewport. Percentage padding resolves to zero for
       * intrinsic sizing and the absolutely positioned child is out of flow, so this box
       * contributes no width at all and the surrounding layout is untouched.
       *
       * Height is therefore `max(50% of the width, 20rem)`: the 2:1 ratio every viewport
       * already rendered at, with a floor that only bites below 640px of container width.
       * `relative` also makes this the dedicated container Chart.js's responsive mode
       * wants — it measures the canvas's parent, so nothing else may share that box.
       */}
      <div className="relative min-h-[20rem] pt-[50%]">
        <div
          ref={setPlotBox}
          className="absolute inset-0 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-500"
          tabIndex={0}
          role="application"
          aria-label="Ridership chart. Use the left and right arrow keys to move between months, Enter to pin a month, Escape to unpin."
          onKeyDown={handleKeyDown}
          onBlur={() => setKeyboardIndex(null)}
        >
          <LineChart
            ref={handleChartRef}
            options={options}
            data={{
              labels: months,
              datasets: chartDatasets,
            }}
          />
          <ChartTooltip
            index={activeIndex}
            months={months}
            datasets={chartDatasets}
            events={activeEvents}
            caret={caret}
            containerWidth={containerWidth}
            plotHeight={plotHeight}
            isPinned={pinnedIndex !== null}
          />
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {liveText}
      </p>
    </div>
  );
}
