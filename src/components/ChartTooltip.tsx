import type { CSSProperties } from 'react';
import type { ChartDataset } from 'chart.js';
import type { CustomChartData } from '../@types/chart.types';
import type { TransitEvent } from '../@types/events.types';
import { formatEventDate, formatMonthLabel } from '../chart';
import CategoryChip from './CategoryChip';

const ridershipFormatter = new Intl.NumberFormat('en-US');

/** Matches `w-64` below. Used to clamp the floating box inside the plot. */
const TOOLTIP_WIDTH = 256;
const EDGE_PADDING = 8;
/** Horizontal gap between the crosshair and the floating box. */
const CARET_GAP = 12;

/**
 * Below this measured chart width the readout stops floating and becomes a strip
 * along the top edge of the plot.
 *
 * It lives here, beside the width constants it is measured against, because the
 * choice between the two layouts is this component's: it is the only place that
 * knows `TOOLTIP_WIDTH` is 256 and therefore most of a phone's plot. The chart
 * measures the width and hands it over; what that width *means* is decided here,
 * which is also what makes the mode reachable in a test by passing a number.
 *
 * Deliberately not exported. The spec spells 480 out rather than importing it,
 * so a change to the threshold fails a test instead of quietly moving one.
 */
const STRIP_MAX_WIDTH = 480;

/**
 * Share of the plot's height the strip may occupy before it scrolls.
 *
 * The strip covers the top of the plot rather than sitting beside it, so its
 * height is how much of the series it hides. A Month carrying several events
 * would otherwise grow the readout over the line it annotates.
 */
const STRIP_HEIGHT_SHARE = 1 / 3;

/** Which layout the readout is drawn in. Derived from the width alone. */
type TooltipLayout = 'floating' | 'strip';

/** @see STRIP_MAX_WIDTH */
function tooltipLayoutFor(containerWidth: number): TooltipLayout {
  return containerWidth < STRIP_MAX_WIDTH ? 'strip' : 'floating';
}

export interface ChartTooltipProps {
  /** Month index being described, or null to render nothing. */
  index: number | null;
  /** x-axis labels, `"YYYY M"`. */
  months: string[];
  datasets: ChartDataset<'line', CustomChartData[]>[];
  /** Events for this month, already grouped by the Event Gutter plugin's mapping. */
  events: TransitEvent[];
  /** Crosshair position in canvas pixels. */
  caret: { x: number; y: number } | null;
  /**
   * Measured width of the chart's container. Chooses the layout, and clamps the
   * floating box when that is the layout chosen.
   */
  containerWidth: number;
  /** Height of the plot box. Caps the strip; the floating box ignores it. */
  plotHeight: number;
  /**
   * Pinned tooltips accept the pointer so their source links are clickable;
   * hovering ones must not, or the box would steal the hover that spawned it.
   */
  isPinned: boolean;
}

/**
 * The month readout: ridership per line, then whatever happened that month.
 *
 * Rendered as HTML rather than painted into the canvas, which is what lets an
 * event description wrap, a source link be clicked, and a screen reader read any
 * of it. The canvas box this replaces could do none of the three, and it only
 * appeared within 6px of an event shape — so the ridership figures and the
 * reason they moved were never on screen together.
 */
export default function ChartTooltip({
  index,
  months,
  datasets,
  events,
  caret,
  containerWidth,
  plotHeight,
  isPinned,
}: ChartTooltipProps) {
  if (index === null || !caret || !months[index]) return null;

  const rows = datasets
    .map((dataset) => ({
      label: dataset.label ?? '',
      color:
        typeof dataset.borderColor === 'string' ? dataset.borderColor : '#78716c',
      value: dataset.data[index]?.stat ?? null,
    }))
    .filter((row) => row.value !== null)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  const layout = tooltipLayoutFor(containerWidth);

  /**
   * The strip spans the plot, so there is nothing to flip away from and nothing
   * to clamp: both edges are simply the edge padding, and `right` is what makes
   * the box full-width without a width to compute. It sits on the plot's top
   * edge and caps its own height, so the Month it describes stays visible under
   * it — which is the whole point of the mode.
   *
   * The floating box prefers the right of the crosshair, flips left when that
   * would overflow, then clamps — the same rule the canvas box used, in CSS
   * pixels.
   */
  let position: CSSProperties;
  if (layout === 'strip') {
    position = {
      left: EDGE_PADDING,
      right: EDGE_PADDING,
      top: caret.y,
      maxHeight: Math.max(0, plotHeight * STRIP_HEIGHT_SHARE),
    };
  } else {
    const maxLeft = Math.max(EDGE_PADDING, containerWidth - TOOLTIP_WIDTH - EDGE_PADDING);
    let left = caret.x + CARET_GAP;
    if (left > maxLeft) left = caret.x - CARET_GAP - TOOLTIP_WIDTH;
    left = Math.min(Math.max(left, EDGE_PADDING), maxLeft);
    position = { left, top: Math.max(EDGE_PADDING, caret.y - EDGE_PADDING) };
  }

  return (
    <div
      role="tooltip"
      data-testid="chart-tooltip"
      data-pinned={isPinned ? 'true' : 'false'}
      data-layout={layout}
      className={`absolute z-10 rounded bg-stone-800 p-2 text-xs text-stone-100 shadow-lg ${
        layout === 'strip' ? 'overflow-y-auto overscroll-contain' : 'w-64'
      } ${isPinned ? 'pointer-events-auto ring-1 ring-stone-400' : 'pointer-events-none'}`}
      style={position}
    >
      <p className="font-semibold">{formatMonthLabel(months[index])}</p>

      {rows.length > 0 && (
        <ul className="mt-1 flex flex-col gap-0.5">
          {rows.map((row) => (
            <li key={row.label} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 shrink-0 rounded-sm"
                style={{ backgroundColor: row.color }}
              />
              <span className="grow truncate">{row.label}</span>
              <span className="tabular-nums">
                {ridershipFormatter.format(row.value ?? 0)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {events.map((event) => (
        <div
          key={event.id}
          className="mt-2 border-t border-stone-600 pt-2 first-of-type:mt-2"
        >
          {/* Neutral, not category-tinted. The chip below carries the category,
              and a tinted title made colour say two things at once — which
              category this is, and where the title ends — while leaving the
              category itself as unremarkable grey text after the date. */}
          <p className="font-semibold">{event.title}</p>
          {/* Chip and date on one row, chip first: it is the same component the
              context-log panel draws, so an event reads the same way in both.
              The middot went with the inline category text it separated. */}
          <div className="mt-1 flex items-center gap-1.5">
            <CategoryChip category={event.category} surface="dark" />
            <span className="text-stone-400">{formatEventDate(event.date)}</span>
          </div>
          {/* Clamped while hovering, full once pinned. Unclamped, a long
              description makes the box taller than half the plot and buries the
              series it is annotating under the cursor. Pinning is the reader
              asking for the whole thing. */}
          <p className={`mt-1 text-stone-300 ${isPinned ? '' : 'line-clamp-3'}`}>
            {event.description}
          </p>
          {isPinned && event.source && (
            <a
              href={event.source}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block underline"
            >
              Source
            </a>
          )}
        </div>
      ))}

      {/* The clamp above and the missing source link are both undone by pinning,
          and nothing on screen said so — a reader who hit a truncated
          description had no reason to believe there was more. "Click" rather
          than a pointer-type branch, matching the unpin hint it gives way to. */}
      {!isPinned && events.length > 0 && (
        <p className="mt-2 text-stone-400">
          Click to pin and read the full description
        </p>
      )}

      {/* "Any month" rather than "again", because a click on a *different* month
          now releases too instead of moving the pin (ADR-0011) — and rather than
          "anywhere", because a click that lands on no month asks for nothing and
          leaves the pin held. */}
      {isPinned && (
        <p className="mt-2 text-stone-400">Click any month or press Esc to unpin</p>
      )}
    </div>
  );
}
