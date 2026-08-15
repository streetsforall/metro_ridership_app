import type { ChartDataset } from 'chart.js';
import type { CustomChartData } from '../@types/chart.types';
import type { TransitEvent } from '../@types/events.types';
import {
  categoryTextColor,
  formatCategory,
  formatEventDate,
  formatMonthLabel,
} from '../chart';

const ridershipFormatter = new Intl.NumberFormat('en-US');

/** Matches `w-64` below. Used to clamp the box inside the plot. */
const TOOLTIP_WIDTH = 256;
const EDGE_PADDING = 8;
/** Horizontal gap between the crosshair and the box. */
const CARET_GAP = 12;

export interface ChartTooltipProps {
  /** Month index being described, or null to render nothing. */
  index: number | null;
  /** x-axis labels, `"YYYY M"`. */
  months: string[];
  datasets: ChartDataset<'line', CustomChartData[]>[];
  /** Events for this month, already grouped by the marker plugin's mapping. */
  events: TransitEvent[];
  /** Crosshair position in canvas pixels. */
  caret: { x: number; y: number } | null;
  /** Width of the plot box, for clamping. */
  containerWidth: number;
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
 * appeared within 6px of an event marker — so the ridership figures and the
 * reason they moved were never on screen together.
 */
export default function ChartTooltip({
  index,
  months,
  datasets,
  events,
  caret,
  containerWidth,
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

  // Prefer the right of the crosshair, flip left when that would overflow, then
  // clamp — the same rule the canvas box used, in CSS pixels.
  const maxLeft = Math.max(EDGE_PADDING, containerWidth - TOOLTIP_WIDTH - EDGE_PADDING);
  let left = caret.x + CARET_GAP;
  if (left > maxLeft) left = caret.x - CARET_GAP - TOOLTIP_WIDTH;
  left = Math.min(Math.max(left, EDGE_PADDING), maxLeft);

  return (
    <div
      role="tooltip"
      data-testid="chart-tooltip"
      data-pinned={isPinned ? 'true' : 'false'}
      className={`absolute z-10 w-64 rounded bg-stone-800 p-2 text-xs text-stone-100 shadow-lg ${
        isPinned ? 'pointer-events-auto ring-1 ring-stone-400' : 'pointer-events-none'
      }`}
      style={{ left, top: Math.max(EDGE_PADDING, caret.y - EDGE_PADDING) }}
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
          <p
            className="font-semibold"
            style={{ color: categoryTextColor(event.category) }}
          >
            {event.title}
          </p>
          <p className="text-stone-400">
            {formatEventDate(event.date)} · {formatCategory(event.category)}
          </p>
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

      {isPinned && (
        <p className="mt-2 text-stone-400">Click again or press Esc to unpin</p>
      )}
    </div>
  );
}
