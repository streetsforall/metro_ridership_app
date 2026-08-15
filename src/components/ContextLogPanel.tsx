import { useEffect, useRef, useState } from 'react';
import type { TransitEvent } from '../@types/events.types';
import {
  categoryColor,
  eventDateToLabel,
  formatCategory,
  formatEventDate,
} from '../chart';

export interface ContextLogPanelProps {
  events: TransitEvent[];
  /** Pinned month label (`"YYYY M"`); its rows are highlighted and scrolled to. */
  pinnedMonth: string | null;
  /** Clicking a row pins its month on the chart. */
  onSelectMonth: (month: string) => void;
  /** Hovering a row enlarges that month's dot. */
  onHoverMonthChange: (month: string | null) => void;
}

/**
 * The events in the current window, as a list beside the chart.
 *
 * The rows and the chart's dots are two views of one set, so each row is a
 * button: hovering it enlarges its dot, clicking it pins that month's tooltip,
 * and pinning a dot on the chart highlights and scrolls to the row here. Without
 * that pairing the panel is a second, unrelated list that happens to share data.
 */
export default function ContextLogPanel({
  events,
  pinnedMonth,
  onSelectMonth,
  onHoverMonthChange,
}: ContextLogPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

  // Pinning a month on the chart reveals its entry, rather than highlighting a
  // row inside a collapsed panel where nobody can see it.
  useEffect(() => {
    if (pinnedMonth === null) return;
    setIsOpen(true);
  }, [pinnedMonth]);

  useEffect(() => {
    if (pinnedMonth === null || !isOpen) return;
    const pinned = events.find(
      (event) => eventDateToLabel(event.date) === pinnedMonth,
    );
    if (!pinned) return;
    rowRefs.current.get(pinned.id)?.scrollIntoView?.({ block: 'nearest' });
  }, [pinnedMonth, isOpen, events]);

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
      {isOpen && (
        <ol className="flex flex-col gap-3 mt-3">
          {events.map((event) => {
            const month = eventDateToLabel(event.date);
            const isPinned = month === pinnedMonth;
            return (
              /* The rule carries the same category color as the chart marker, so a row
                 and its dot read as the same thing. It is decoration only — the
                 category is also spelled out below, because these hues run 2.15–4.76:1
                 on the pane's white and must never be the sole signal. Nine categories
                 also push past what color alone can carry: red/rose and amber/orange are
                 deliberately close, and the label is what tells them apart. */
              <li
                key={event.id}
                ref={(node) => {
                  if (node) rowRefs.current.set(event.id, node);
                  else rowRefs.current.delete(event.id);
                }}
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
                  <span className="text-stone-400 whitespace-nowrap shrink-0">
                    {formatEventDate(event.date)}
                  </span>
                  <span className="block">
                    <span className="block font-medium text-stone-700">
                      {event.title}
                    </span>
                    <span className="block text-stone-500">{event.description}</span>
                    <span className="mt-0.5 block text-xs uppercase tracking-wider text-stone-400">
                      {formatCategory(event.category)}
                    </span>
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
