import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Chart as ChartJS,
  type ChartDataset,
  type ChartEvent,
  type ChartOptions,
} from 'chart.js';
import { Line as LineChart } from 'react-chartjs-2';
import colors from 'tailwindcss/colors';
import ChartTooltip from './ChartTooltip';
import type { CustomChartData } from '../@types/chart.types';
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
  onPinnedMonthChange: (month: string | null) => void;
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
  onPinnedMonthChange,
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
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Stable identity: an inline callback ref is re-invoked with null and then the
  // instance on every render, which here would be a setState loop.
  const handleChartRef = useCallback(
    (instance: ChartJS<'line', CustomChartData[]> | null | undefined) => {
      setChart(instance ?? null);
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
   * One month drives the tooltip, the crosshair and the enlarged dot, whichever
   * way it was chosen. A pin outranks the keyboard, which outranks the pointer:
   * a pin is the only one the reader asked to persist, and a stray mousemove
   * must not silently retarget what they pinned.
   */
  const activeIndex = pinnedIndex ?? keyboardIndex ?? hoverIndex;

  const eventsByIndex = groupEventsByMonthIndex(transitEvents, months);

  const pinIndex = useCallback(
    (index: number | null) => {
      if (index === null || !months[index]) {
        onPinnedMonthChange(null);
        return;
      }
      onPinnedMonthChange(months[index] === pinnedMonth ? null : months[index]);
    },
    [months, pinnedMonth, onPinnedMonthChange],
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
      if (event.key === 'Escape') onPinnedMonthChange(null);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [pinnedMonth, onPinnedMonthChange]);

  ChartJS.defaults.font.family = 'Overpass Mono Variable';
  ChartJS.defaults.color = colors.stone['700'];

  const handleClick = (
    event: ChartEvent,
    _elements: unknown[],
    chart: ChartJS,
  ) => {
    // The click that ends a drag is not a click; the drag already re-ranged.
    if (consumeDragSuppression(chart)) return;

    const found = chart.getElementsAtEventForMode(
      event.native as Event,
      'index',
      { intersect: false },
      false,
    );
    if (found.length) {
      pinIndex(found[0].index);
      return;
    }

    // Nothing under the pointer means the axis strip below the plot, where the
    // dots live. Fall back to the scale so a click on a dot still pins.
    const value = chart.scales.x.getValueForPixel(event.x ?? 0);
    if (value === undefined) return;
    pinIndex(Math.min(Math.max(Math.round(value), 0), months.length - 1));
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
        onPinnedMonthChange(null);
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
        external: ({ tooltip }) => {
          setHoverIndex(
            tooltip.opacity === 0 ? null : (tooltip.dataPoints?.[0]?.dataIndex ?? null),
          );
        },
      },
      eventGutter: {
        events: transitEvents,
        focusedIndex: activeIndex,
        highlightedIndex,
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
          ref={containerRef}
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
            containerWidth={containerRef.current?.clientWidth ?? 0}
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
