import { useState } from 'react';
import type { TransitEvent } from '../@types/events.types';
import {
  categoryColor,
  eventDateToLabel,
  formatEventDate,
} from '../chart';
import CategoryChip from './CategoryChip';

export interface ContextLogPanelProps {
  events: TransitEvent[];
  /** Pinned month label (`"YYYY M"`); its rows are highlighted where they sit. */
  pinnedMonth: string | null;
  /**
   * Asks for a row's month to be pinned. A request, not a pin: while any month
   * is pinned the answer is a release, and the same rule holds on the chart —
   * see `OutputArea`.
   */
  onSelectMonth: (month: string) => void;
  /** Hovering a row enlarges that month's dot. */
  onHoverMonthChange: (month: string | null) => void;
}

/**
 * The events in the current window, as a scrolling list below the chart and map.
 *
 * The rows and the chart's dots are two views of one set, so each row is a
 * button: hovering it enlarges its dot, clicking it asks for that month's
 * tooltip to be pinned, and pinning a dot on the chart marks the row here.
 * Without that pairing the panel is a second, unrelated list that happens to
 * share data.
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
                 deliberately close, and the label is what tells them apart.

                 Selection lands on this element rather than on the button inside it, because
                 this is what already carries the category rule: marking the row and marking
                 the category then read as one thing instead of a box floating within a box.
                 Selected thickens the rule and fills the row with a flat neutral band.

                 The fill is neutral, never the category's own hue. The nine hues have visibly
                 different weights at equal lightness — the same reason the palette is never
                 the sole signal for a category — so a tinted band would shout on some
                 categories and whisper on others, and selection would look like a different
                 event depending on what kind of event it was. The rule thickens rather than
                 changing colour for the same reason: selection and category stay two signals.

                 `pl-[10px]` is `pl-3` less the 2px the rule gains, which holds the text still
                 while the rule thickens under it. The row does grow vertically — that is the
                 padding the band needs to read as a band rather than as ink behind the text. */
              <li
                key={event.id}
                className={
                  isPinned
                    ? 'border-l-4 bg-stone-200 py-2 pr-3 pl-[10px]'
                    : 'border-l-2 pl-3'
                }
                style={{ borderColor: categoryColor(event.category) }}
              >
                {/* Resets the global dark-blue button styling from index.css: this is a
                    row, not a control that should look like one.

                    The focus ring is the control's own, and it has to be: this button used to
                    draw a ring only while pinned, so the one ring was standing in for both
                    selection and keyboard focus. Selection has moved to the row's band, which
                    leaves focus with nothing of its own unless it is written here — and a
                    missing focus ring is invisible to a screenshot, so no baseline would have
                    caught it. Ring for focus, band for selection: the two are now different
                    marks, and a focused row that is also pinned shows both at once.

                    The ring is inset because it would otherwise be clipped. A ring is a
                    box-shadow drawn outside the border box, this button's right edge sits flush
                    against the scrolling `<ol>`, and `overflow-y-auto` computes `overflow-x` to
                    `auto` as well — so an outset ring loses its right side to the scroll port,
                    or wins a horizontal scrollbar. */}
                <button
                  type="button"
                  onClick={() => onSelectMonth(month)}
                  onMouseEnter={() => onHoverMonthChange(month)}
                  onMouseLeave={() => onHoverMonthChange(null)}
                  onFocus={() => onHoverMonthChange(month)}
                  onBlur={() => onHoverMonthChange(null)}
                  aria-pressed={isPinned}
                  className="flex w-full gap-3 rounded-sm bg-transparent p-0 text-left text-sm font-normal text-stone-700 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-500 focus-visible:ring-inset"
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
                    <span className="my-1 block">
                      <CategoryChip category={event.category} surface="light" />
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
