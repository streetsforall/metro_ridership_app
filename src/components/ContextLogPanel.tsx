import { useState } from 'react';
import type { TransitEvent } from '../@types/events.types';
import {
  categoryChip,
  categoryColor,
  eventDateToLabel,
  formatCategory,
  formatEventDate,
} from '../chart';

export interface ContextLogPanelProps {
  events: TransitEvent[];
  /** Pinned month label (`"YYYY M"`); its rows are highlighted where they sit. */
  pinnedMonth: string | null;
  /** Clicking a row pins its month on the chart. */
  onSelectMonth: (month: string) => void;
  /** Hovering a row enlarges that month's dot. */
  onHoverMonthChange: (month: string | null) => void;
}

/**
 * The events in the current window, as a scrolling list below the chart and map.
 *
 * The rows and the chart's dots are two views of one set, so each row is a
 * button: hovering it enlarges its dot, clicking it pins that month's tooltip,
 * and pinning a dot on the chart marks the row here. Without that pairing the
 * panel is a second, unrelated list that happens to share data.
 */
export default function ContextLogPanel({
  events,
  pinnedMonth,
  onSelectMonth,
  onHoverMonthChange,
}: ContextLogPanelProps) {
  // A pin marks; it does not move. Pinning used to force this panel open and
  // scroll the matching row into view, which took a reader part-way down the log
  // somewhere they had not asked to go, from a gesture made on the chart. Open
  // state and scroll position belong to the reader, so both effects are gone.
  //
  // The consequence is deliberate, not an oversight: pin a Month from the chart
  // while this panel is collapsed and the highlighted row is off-screen with no
  // cue that it exists. The tooltip carries the event content in full, so the
  // panel is a second view of it rather than the only one, and a reader who shut
  // the panel loses nothing by it staying shut. Don't add a substitute cue here.
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="pane" id="context-log-panel">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className="flex w-full items-center justify-between text-xs font-semibold text-stone-500 uppercase tracking-wider"
      >
        <span>Context Logs</span>
        <span>{isOpen ? '▴' : '▾'}</span>
      </button>
      {/**
       * The list scrolls rather than the page. It sits at the bottom of the
       * output column and a wide window can hold dozens of events, so an
       * unbounded list pushes the footer arbitrarily far down and makes the
       * chart and map above it unreachable without scrolling back.
       *
       * The cap is on the `<ol>` and not on the `.pane`, which keeps the
       * collapse toggle in view while the rows move under it.
       */}
      {isOpen && (
        <ol className="flex flex-col gap-3 mt-3 max-h-[32rem] overflow-y-auto">
          {events.map((event) => {
            const month = eventDateToLabel(event.date);
            const isPinned = month === pinnedMonth;
            return (
              /* The rule carries the same category color as the chart's gutter shape, so a row
                 and its dot read as the same thing. It is decoration only — the
                 category is also spelled out below, because these hues run 2.15–4.76:1
                 on the pane's white and must never be the sole signal. Nine categories
                 also push past what color alone can carry: red/rose and amber/orange are
                 deliberately close, and the label is what tells them apart. */
              <li
                key={event.id}
                className="border-l-2 pl-3"
                style={{ borderColor: categoryColor(event.category) }}
              >
                {/* Resets the global dark-blue button styling from index.css: this is a
                    row, not a control that should look like one. */}
                <button
                  type="button"
                  onClick={() => onSelectMonth(month)}
                  onMouseEnter={() => onHoverMonthChange(month)}
                  onMouseLeave={() => onHoverMonthChange(null)}
                  onFocus={() => onHoverMonthChange(month)}
                  onBlur={() => onHoverMonthChange(null)}
                  aria-pressed={isPinned}
                  className={`flex w-full gap-3 bg-transparent p-0 text-left text-sm font-normal text-stone-700 hover:opacity-100 ${
                    isPinned ? 'rounded-sm ring-2 ring-stone-400' : ''
                  }`}
                >
                  {/* The left rail carries the date alone, and that is what keeps every row's
                      columns aligned. Dates are uniform in this monospace face — "Mar 2020" is
                      the same width as "Dec 2025" — so a date-only rail is a fixed width
                      without one being declared, and it cannot shift when the window's mix of
                      categories changes.

                      The chip therefore sits in the flexible column instead, under the title.
                      It is the one place the palette carries text, so it is the one place
                      contrast is load-bearing; the rule down the row's left edge is the
                      gutter's exact 500, which ties the row to its dot on the chart but is far
                      too low-contrast to sit behind text. */}
                  <span className="shrink-0 text-stone-400 whitespace-nowrap">
                    {formatEventDate(event.date)}
                  </span>
                  <span className="block min-w-0">
                    <span className="block font-medium text-stone-700">
                      {event.title}
                    </span>
                    <span
                      className="my-1 inline-block rounded px-1.5 py-0.5 text-[0.65rem] uppercase tracking-wider whitespace-nowrap"
                      style={categoryChip(event.category)}
                    >
                      {formatCategory(event.category)}
                    </span>
                    <span className="block text-stone-500">{event.description}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
