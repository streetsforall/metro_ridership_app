import { useEffect, useLayoutEffect, useState, type CSSProperties } from 'react';
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
  const layout = tooltipLayoutFor(containerWidth);

  /**
   * Whether the reader has asked for the capped box to be opened up, and whether
   * there is anything down there to open it for.
   *
   * Both live above the early return, because hooks cannot be called
   * conditionally and the readout renders nothing for a month it has not got.
   */
  const [isExpanded, setIsExpanded] = useState(false);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [hasMore, setHasMore] = useState(false);

  /** A new Month is a new readout; it opens collapsed, as this one did. */
  useEffect(() => setIsExpanded(false), [index]);

  /**
   * "More to read" is not a property of the content — a single long description
   * overflows a phone's strip and three events fit a desktop's box — so it is
   * measured rather than counted: is the box scrolling anything?
   *
   * Only the strip is asked. It is the only layout with a ceiling, so it is the
   * only one that can be hiding anything; the floating box grows to its content
   * and there is nothing under it to offer.
   *
   * The dependency list is every input that can change either the content or the
   * ceiling. `events` is a new array on every render, so in practice this runs
   * on every render — which is what a measurement wants, and the list is there
   * to say what it is measuring rather than to save renders. The updater returns
   * the previous value when nothing changed, which is React's own bail-out and
   * what stops a measurement that runs every render from looping.
   */
  useLayoutEffect(() => {
    const overflowing =
      layout === 'strip' && box !== null && box.scrollHeight > box.clientHeight + 1;
    setHasMore((previous) => (previous === overflowing ? previous : overflowing));
  }, [box, layout, index, events, datasets, isPinned, isExpanded, plotHeight]);

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

  /**
   * The strip spans the chart, so there is nothing to flip away from and nothing
   * to clamp: both edges are simply the edge padding, and `right` is what makes
   * the box full-width without a width to compute. It does not move with the
   * crosshair at all.
   *
   * `bottom: 100%` puts it wholly *above* the chart rather than over any part
   * of it — the readout and the thing it describes stop competing for the same
   * pixels, which is the entire problem the mode exists to solve. It escapes
   * the pane's padding and its rounded border to do that, deliberately: the
   * border is decoration and the series is not, and there is nothing else worth
   * covering at this width.
   *
   * The cap stays measured against the plot even though the strip no longer
   * touches it. Nothing below is at risk now, but an uncapped box would grow
   * upward over the page instead, and a third of the plot is as good a ceiling
   * for that as any. Expanded, the ceiling is the plot's whole height rather
   * than none: the strip grows upward, and a box with no ceiling at all grows
   * off the top of the viewport, where the reader cannot reach the end of what
   * they just asked to see.
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
      bottom: '100%',
      marginBottom: EDGE_PADDING,
      maxHeight: Math.max(0, plotHeight * (isExpanded ? 1 : STRIP_HEIGHT_SHARE)),
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
      data-expanded={isExpanded ? 'true' : 'false'}
      ref={setBox}
      className={`absolute z-10 rounded bg-stone-800 p-2 text-xs text-stone-100 shadow-lg ${
        layout === 'strip' ? 'overflow-y-auto overscroll-contain' : 'w-64'
      } ${isPinned ? 'pointer-events-auto ring-1 ring-stone-400' : 'pointer-events-none'}`}
      style={position}
    >
      {/* The month, and — only where the box is capped and there is something
          under the cap — the control that lifts it. Offered only once pinned:
          a hovering readout does not accept the pointer, so a button on one is
          a control the reader can see and cannot press. On touch there is no
          hover and a tap pins, so the strip is always in the form that has it. */}
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold">{formatMonthLabel(months[index])}</p>
        {isPinned && (hasMore || isExpanded) && (
          <button
            type="button"
            aria-expanded={isExpanded}
            /* The same treatment as Select All / Clear All in `LineFilters`,
               down to the hex: a bold text action in the app's teal, no button
               chrome. One kind of inline action, one way of looking. */
            className="shrink-0 bg-transparent border-none p-0 font-bold text-xs text-[#0fada8]"
            onClick={(event) => {
              // The chart pins on click and the output area unpins on a press
              // outside itself. This is neither: it is a control on the readout.
              event.stopPropagation();
              setIsExpanded((wasExpanded) => !wasExpanded);
            }}
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
        )}
      </div>

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
