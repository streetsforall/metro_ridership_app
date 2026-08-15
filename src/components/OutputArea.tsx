import { useState } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  type ChartDataset,
  type ChartOptions,
  type Plugin,
} from 'chart.js';
import { Line as LineChart } from 'react-chartjs-2';
import colors from 'tailwindcss/colors';
import SummaryData from './SummaryData';
import Map from './Map';
import type { CustomChartData } from '../@types/chart.types';
import type { LineReadout } from '../ridership';
import type { EventCategory, TransitEvent } from '../@types/events.types';

interface OutputAreaProps {
  chartDatasets: ChartDataset<'line', CustomChartData[]>[];
  months: string[];
  lines: LineReadout[];
  transitEvents: TransitEvent[];
  /** Whether the context-log panel is enabled from the filter bar. */
  showContextLogs: boolean;
  /** True while the ridership dataset is still being fetched. */
  isLoading?: boolean;
}

const hoverCrosshairPlugin: Plugin<'line'> = {
  id: 'hoverCrosshair',
  afterDraw(chart) {
    const active = chart.tooltip?.getActiveElements();
    if (!active?.length) return;
    const x = active[0].element.x;
    const {
      ctx,
      chartArea: { top, bottom },
    } = chart;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = colors.stone['500'];
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.restore();
  },
};

/**
 * Tailwind hue each context-log category is drawn in, so the taxonomy is legible
 * on the chart instead of one undifferentiated amber.
 *
 * One hue per category, not one per group: the data exercises all nine, so a
 * grouped palette would still render an opening and an extension — or all four
 * of the `*_change` variants — as the same rule. The hues are still *chosen* in
 * families, so the coarse reading survives a glance:
 *
 *   emerald / teal    more service (opening, extension)
 *   red / rose        less service (closure, disruption)
 *   amber / orange    runs differently (headway, hours)
 *   violet            a different shape, not a different amount (route)
 *   sky               costs something different (fare)
 *   slate             generic, uncategorised (service_change)
 *
 * Only the hue is stored; callers pick the weight, which keeps the marker (500)
 * and the tooltip's title text (400, for contrast on stone-800) in the same
 * family without a second nine-entry table to keep in sync. All nine 400s clear
 * AA on stone-800 — red is the tightest at 5.48:1 — so no slot needs an
 * exception. The 500s run 2.15–4.76:1 on the panel's white, which is why the
 * panel tints a rule rather than text.
 */
type CategoryHue =
  | 'emerald'
  | 'teal'
  | 'red'
  | 'rose'
  | 'amber'
  | 'orange'
  | 'violet'
  | 'sky'
  | 'slate';

const CATEGORY_COLOR: Record<EventCategory, CategoryHue> = {
  opening: 'emerald',
  extension: 'teal',
  closure: 'red',
  disruption: 'rose',
  headway_change: 'amber',
  hours_change: 'orange',
  route_change: 'violet',
  fare_change: 'sky',
  service_change: 'slate',
};

/**
 * Category of last resort. Also what an unrecognised category falls back to —
 * deliberately the same hue as `service_change`, since that category *is* the
 * schema's generic fallback. An unknown string and an explicit `service_change`
 * mean the same thing to a reader: something changed, nobody said what.
 */
const DEFAULT_CATEGORY_HUE: CategoryHue = 'slate';

/**
 * Total lookup over `CATEGORY_COLOR`. The events are fetched data, so a category
 * the union doesn't cover can reach here at runtime regardless of the types —
 * those still render, in slate, rather than throwing or drawing nothing.
 */
function categoryHue(category: EventCategory | undefined): CategoryHue {
  return CATEGORY_COLOR[category as EventCategory] ?? DEFAULT_CATEGORY_HUE;
}

/** Marker/border color for an event's category. */
function categoryColor(category: EventCategory | undefined): string {
  return colors[categoryHue(category)]['500'];
}

/** Lighter variant, for category-tinted text on the dark tooltip. */
function categoryTextColor(category: EventCategory | undefined): string {
  return colors[categoryHue(category)]['400'];
}

/** "headway_change" → "Headway change", for the panel's category label. */
function formatCategory(category: EventCategory | undefined): string {
  if (!category) return 'Service change';
  const words = category.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

interface EventMarkerHitbox {
  xPos: number;
  event: TransitEvent;
}

/** Fields stashed on the chart instance to bridge afterEvent → afterDraw. */
type ChartWithMarkers = ChartJS<'line'> & {
  $eventMarkers?: EventMarkerHitbox[];
  $hoveredEventId?: string | null;
};

// How close (px) the cursor must be to a marker's vertical line to hover it.
const MARKER_HIT_RADIUS = 6;

/** Draws a category-colored tooltip box for a hovered event marker. */
function drawEventTooltip(
  ctx: CanvasRenderingContext2D,
  hit: EventMarkerHitbox,
  area: { left: number; right: number; top: number },
): void {
  const { event, xPos } = hit;
  const title = event.title;
  const subtitle = `${formatEventDate(event.date)} · ${event.category}`;

  const titleFont = '600 12px "Overpass Mono Variable"';
  const subFont = '11px "Overpass Mono Variable"';

  ctx.save();
  ctx.font = titleFont;
  const titleWidth = ctx.measureText(title).width;
  ctx.font = subFont;
  const subWidth = ctx.measureText(subtitle).width;

  const padX = 8;
  const padY = 6;
  const gap = 4;
  const titleH = 12;
  const subH = 11;
  const boxW = Math.ceil(Math.max(titleWidth, subWidth)) + padX * 2;
  const boxH = padY * 2 + titleH + gap + subH;

  // Prefer the right of the marker; flip left if it would overflow the plot.
  let boxX = xPos + 8;
  if (boxX + boxW > area.right) boxX = xPos - 8 - boxW;
  boxX = Math.max(area.left, Math.min(boxX, area.right - boxW));
  const boxY = area.top + 8;

  const r = 4;
  ctx.beginPath();
  ctx.moveTo(boxX + r, boxY);
  ctx.arcTo(boxX + boxW, boxY, boxX + boxW, boxY + boxH, r);
  ctx.arcTo(boxX + boxW, boxY + boxH, boxX, boxY + boxH, r);
  ctx.arcTo(boxX, boxY + boxH, boxX, boxY, r);
  ctx.arcTo(boxX, boxY, boxX + boxW, boxY, r);
  ctx.closePath();
  ctx.fillStyle = colors.stone['800'];
  ctx.strokeStyle = categoryColor(event.category);
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.fill();
  ctx.stroke();

  ctx.textBaseline = 'top';
  ctx.font = titleFont;
  ctx.fillStyle = categoryTextColor(event.category);
  ctx.fillText(title, boxX + padX, boxY + padY);
  ctx.font = subFont;
  ctx.fillStyle = colors.stone['300'];
  ctx.fillText(subtitle, boxX + padX, boxY + padY + titleH + gap);

  ctx.restore();
}

const eventMarkersPlugin: Plugin<'line'> = {
  id: 'eventMarkers',

  // Hit-test the cursor against cached marker positions and request a redraw
  // only when the hovered marker changes.
  afterEvent(chart, args) {
    const c = chart as ChartWithMarkers;
    const markers = c.$eventMarkers ?? [];
    let hoveredId: string | null = null;

    if (args.event.type === 'mousemove' && args.inChartArea && markers.length) {
      const x = args.event.x ?? -1;
      let best = MARKER_HIT_RADIUS;
      for (const marker of markers) {
        const dist = Math.abs(marker.xPos - x);
        if (dist <= best) {
          best = dist;
          hoveredId = marker.event.id;
        }
      }
    }

    if (hoveredId !== (c.$hoveredEventId ?? null)) {
      c.$hoveredEventId = hoveredId;
      args.changed = true;
    }
  },

  afterDraw(chart) {
    const c = chart as ChartWithMarkers;
    const events: TransitEvent[] =
      (chart.options.plugins as Record<string, { events?: TransitEvent[] }>)
        .eventMarkers?.events ?? [];
    if (!events.length) {
      c.$eventMarkers = [];
      return;
    }

    const {
      ctx,
      chartArea: { top, bottom },
      scales: { x },
    } = chart;
    const labels = chart.data.labels as string[];

    // Draw each marker and cache its x-position for hover hit-testing.
    const hitboxes: EventMarkerHitbox[] = [];
    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1.5;

    events.forEach((event) => {
      // Chart labels are "YYYY M" (e.g. "2023 2"); event dates are "YYYY-MM"
      const label = `${event.date.slice(0, 4)} ${parseInt(event.date.slice(5), 10)}`;
      const idx = labels.indexOf(label);
      if (idx === -1) return;

      const xPos = x.getPixelForValue(idx);
      hitboxes.push({ xPos, event });
      // Per-event: markers in range can span several categories.
      ctx.strokeStyle = categoryColor(event.category);
      ctx.beginPath();
      ctx.moveTo(xPos, top);
      ctx.lineTo(xPos, bottom);
      ctx.stroke();
    });

    ctx.restore();
    c.$eventMarkers = hitboxes;

    // Overlay a tooltip box for the currently hovered marker, if any.
    if (c.$hoveredEventId) {
      const hovered = hitboxes.find((h) => h.event.id === c.$hoveredEventId);
      if (hovered) {
        drawEventTooltip(ctx, hovered, {
          left: chart.chartArea.left,
          right: chart.chartArea.right,
          top,
        });
      }
    }
  },
};

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  hoverCrosshairPlugin,
  eventMarkersPlugin,
);

function formatEventDate(date: string): string {
  const [year, month] = date.split('-').map(Number);
  return new Date(year, month - 1).toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

/** Turns a chart x-label ("YYYY M", e.g. "2026 5") into "May 2026". */
function formatMonthLabel(label: string): string {
  const [year, month] = label.split(' ').map(Number);
  if (!year || !month) return label;
  return new Date(year, month - 1).toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

const ridershipFormatter = new Intl.NumberFormat('en-US');

export default function OutputArea({
  chartDatasets,
  months,
  lines,
  transitEvents,
  showContextLogs,
  isLoading = false,
}: OutputAreaProps) {
  const [isContextLogOpen, setIsContextLogOpen] = useState(true);

  ChartJS.defaults.font.family = 'Overpass Mono Variable';
  ChartJS.defaults.color = colors.stone['700'];

  const options: ChartOptions<'line'> = {
    // Honour prefers-reduced-motion: skip the intro easing rather than animating the canvas.
    // Playwright sets this for snapshot runs, which also makes the chart deterministic.
    animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : undefined,
    interaction: {
      axis: 'x',
      includeInvisible: false,
      intersect: false,
      mode: 'index',
    },
    plugins: {
      tooltip: {
        itemSort: (a, b) => (b.parsed.y ?? 0) - (a.parsed.y ?? 0),
        callbacks: {
          // x-labels are "YYYY M"; show a readable "May 2026" heading.
          title: (items) =>
            items.length ? formatMonthLabel(items[0].label) : '',
          // "A Line: 12,345" with the color swatch Chart.js draws by default.
          label: (item) =>
            `${item.dataset.label ?? ''}: ${ridershipFormatter.format(
              item.parsed.y ?? 0,
            )}`,
        },
      },
      eventMarkers: { events: transitEvents },
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
   * `min-w-0` on the root opts this grid item out of its automatic minimum,
   * which is otherwise its min-content width. Without it a child that refuses
   * to wrap — the summary row below did at `xl` — hands the surrounding `1fr`
   * track a min-content width larger than its share, and the whole page scrolls
   * sideways.
   */
  return (
    <div className="flex flex-col gap-4 lg:min-h-[50vh] min-w-0">
      {/* Only show chart and summary metrics if something selected */}
      {chartDatasets.length > 0 ? (
        <>
          {/* Chart pane */}
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
              <div className="absolute inset-0">
                <LineChart
                  options={options}
                  data={{
                    labels: months,
                    datasets: chartDatasets,
                  }}
                />
              </div>
            </div>
          </div>

          <SummaryData lines={lines} />
        </>
      ) : (
        /* Chart pane */
        <div
          id="output-placeholder"
          className="pane flex-1 flex items-center justify-center text-sm text-stone-400"
        >
          <p>{isLoading ? 'Loading ridership data…' : 'Please select a Metro line.'}</p>
        </div>
      )}

      {/* Context log panel — opt-in from the filter bar, and only when events exist and a line is selected */}
      {showContextLogs && transitEvents.length > 0 && chartDatasets.length > 0 && (
        <div className="pane" id="context-log-panel">
          <button
            type="button"
            onClick={() => setIsContextLogOpen((o) => !o)}
            className="flex w-full items-center justify-between text-xs font-semibold text-stone-500 uppercase tracking-wider"
          >
            <span>Context Logs</span>
            <span>{isContextLogOpen ? '▴' : '▾'}</span>
          </button>
          {isContextLogOpen && (
            <ol className="flex flex-col gap-3 mt-3">
              {transitEvents.map((event) => (
                /* The rule carries the same category color as the chart marker, so a row
                   and its marker read as the same thing. It is decoration only — the
                   category is also spelled out below, because these hues run 2.15–4.76:1
                   on the pane's white and must never be the sole signal. Nine categories
                   also push past what color alone can carry: red/rose and amber/orange are
                   deliberately close, and the label is what tells them apart. */
                <li
                  key={event.id}
                  className="flex gap-3 text-sm border-l-2 pl-3"
                  style={{ borderColor: categoryColor(event.category) }}
                >
                  <span className="text-stone-400 whitespace-nowrap shrink-0">
                    {formatEventDate(event.date)}
                  </span>
                  <div>
                    {/* Category sits beside the title, not under the description, so the row
                        leads with what kind of event it is. It keeps the panel header's
                        small-caps treatment rather than the title's, because that contrast is
                        what marks it as a label and not part of the title — `items-baseline`
                        seats the smaller text on the title's baseline, and `flex-wrap` lets it
                        drop below at narrow widths instead of squeezing the title. */}
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <p className="font-medium text-stone-700">{event.title}</p>
                      <span className="text-xs uppercase tracking-wider text-stone-400 whitespace-nowrap">
                        {formatCategory(event.category)}
                      </span>
                    </div>
                    <p className="text-stone-500">{event.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* Map always visible below chart */}
      <div className="pane">
        <Map lines={lines} />
      </div>
    </div>
  );
}
