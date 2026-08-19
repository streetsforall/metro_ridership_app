import { useMemo, useRef, useState } from 'react';
import * as Checkbox from '@radix-ui/react-checkbox';
import StopSparkline from './StopSparkline';
import checkIcon from '../assets/check.svg';
import { useVisibleRows } from '../hooks/useVisibleRows';
import { formatRiders, formatShare } from '../utils/figures';
import type { LineReadout } from '../ridership';
import type { StopReadout } from '../stops';
import type { StopSeriesIndex } from '../utils/stopSeries';
import type { StopMeasure } from '../@types/stops.types';

/**
 * The ranked stop table — the panel's **primary** readout.
 *
 * It answers "which stops carry this line" without the reader touching the map, which is
 * how the rest of the dashboard behaves. A map-click-only stop view would make this the
 * one figure in the app you have to hunt for.
 *
 * Every number comes off a Stop Readout that `buildStopView` derived; nothing is
 * recomputed here.
 */

type SortKey =
  | 'name'
  | 'line_name'
  | 'averageBoardings'
  | 'averageAlightings'
  | 'netAverage'
  | 'shareOfLine';

type SortDirection = 'asc' | 'desc';

interface ColumnBase {
  label: string;
  align: 'left' | 'right';
  /** Hover copy on the header. */
  title?: string;
}

/**
 * A column is sortable, presentational, or the selection checkbox.
 *
 * Neither `select` nor `ridershipOverTime` is a field on a Stop Readout, so keeping them
 * out of `SortKey` makes "sort by the sparkline" unrepresentable rather than a no-op: the
 * comparator indexes a readout by `sort.key`, and the compiler is what stops that ever
 * being a key no readout has.
 */
type Column = ColumnBase &
  (
    | {
        kind: 'sortable';
        key: SortKey;
        /** Which way a first click sorts. Figures rank high-first. */
        initialDirection: SortDirection;
      }
    | { kind: 'presentational'; key: 'ridershipOverTime' }
    | { kind: 'select'; key: 'select' }
  );

type SortableColumn = Extract<Column, { kind: 'sortable' }>;

/**
 * Spelled out rather than interpolated: Tailwind scans source text for whole class names,
 * so a `text-${align}` template produces a class that is never generated.
 */
const ALIGN_CLASS = { left: 'text-left', right: 'text-right' } as const;

const AVERAGE_TITLE =
  'Averaged over this stop’s own reported months inside the selected period.';

/**
 * **Boardings and Alightings**, never "ons"/"offs" — `CONTEXT.md`'s vocabulary, and these
 * strings are the reader's only exposure to it.
 */
const columns: Column[] = [
  {
    kind: 'select',
    key: 'select',
    label: 'Select',
    align: 'left',
    title:
      'Draw this stop’s ridership over time. Several stops can be drawn at once.',
  },
  {
    kind: 'sortable',
    key: 'name',
    label: 'Stop',
    align: 'left',
    initialDirection: 'asc',
  },
  {
    kind: 'sortable',
    key: 'line_name',
    label: 'Line',
    align: 'left',
    initialDirection: 'asc',
  },
  {
    kind: 'sortable',
    key: 'averageBoardings',
    label: 'Avg. Boardings',
    align: 'right',
    initialDirection: 'desc',
    title: AVERAGE_TITLE,
  },
  {
    kind: 'sortable',
    key: 'averageAlightings',
    label: 'Avg. Alightings',
    align: 'right',
    initialDirection: 'desc',
    title: AVERAGE_TITLE,
  },
  {
    kind: 'sortable',
    key: 'netAverage',
    label: 'Change',
    align: 'right',
    initialDirection: 'desc',
    /* Longer than its neighbours because the heading sits two columns from "Ridership
       over time", where "change" would read as a trend. It is not one: this is a net flow
       within each month, not a movement between them. */
    title:
      'Boardings less alightings — the net change in riders on board at this stop, within each month rather than between them. Negative where more riders get off than on, which is information rather than an error.',
  },
  {
    kind: 'sortable',
    key: 'shareOfLine',
    label: 'Share of line',
    align: 'right',
    initialDirection: 'desc',
    title: 'This stop’s share of its line’s total under the current measure.',
  },
  {
    kind: 'presentational',
    key: 'ridershipOverTime',
    label: 'Ridership over time',
    align: 'left',
    title:
      'This stop’s reported months across the selected period, under the current measure. A break is a month the stop did not report.',
  },
];

export interface StopTableProps {
  readouts: readonly StopReadout[];
  /** Line display names, by id. The readout carries the numeric id only. */
  lines: readonly LineReadout[];
  /** The Stop Selection. Every row whose key is in it is checked and highlighted. */
  selectedStopKeys: readonly string[];
  /** A row click, a key press or its checkbox toggles that stop, as a map circle does. */
  onToggleStop: (stopKey: string) => void;
  /** Every row's series, from one pass over the records. See `buildStopSeriesIndex`. */
  seriesIndex: StopSeriesIndex;
  /** Which figure the sparklines draw — the panel's Stop Measure. */
  measure: StopMeasure;
}

export default function StopTable({
  readouts,
  lines,
  selectedStopKeys,
  onToggleStop,
  seriesIndex,
  measure,
}: StopTableProps) {
  /* The scroller is the sparklines' observation root. See `useVisibleRows` for why the
     viewport will not do. */
  const scroller = useRef<HTMLDivElement | null>(null);
  const visibleRows = useVisibleRows(scroller);
  /**
   * Ranked high-first by boardings until the reader says otherwise. A table ordered by
   * "whatever the derivation emitted" is a list, not a ranking, and which stops carry the
   * line is the point of this view.
   */
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'averageBoardings',
    direction: 'desc',
  });

  const lineNames = useMemo(
    () => new Map(lines.map((line) => [line.id, line.name])),
    [lines],
  );

  /* A set, not `selectedStopKeys.includes` per row. Selection is uncapped and a five-line
     table is ~800 rows, so the array scan would be quadratic in exactly the case the
     feature invites — `Select All`, then read the table. */
  const selected = useMemo(() => new Set(selectedStopKeys), [selectedStopKeys]);

  const sorted = useMemo(() => {
    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...readouts].sort((a, b) => {
      if (sort.key === 'name') return factor * a.name.localeCompare(b.name);
      if (sort.key === 'line_name') {
        const nameA = lineNames.get(a.line_name) ?? String(a.line_name);
        const nameB = lineNames.get(b.line_name) ?? String(b.line_name);
        return factor * nameA.localeCompare(nameB);
      }
      // An absent figure sorts last in either direction rather than reading as zero: a
      // stop with no figures did not report nobody (ADR-0004 at stop grain), so it must
      // not out-rank one that reported a genuine 0.
      const valueA = a[sort.key];
      const valueB = b[sort.key];
      if (valueA === undefined) return valueB === undefined ? 0 : 1;
      if (valueB === undefined) return -1;
      return factor * (valueA - valueB);
    });
  }, [readouts, sort, lineNames]);

  const onHeaderClick = (column: SortableColumn): void => {
    setSort((previous) =>
      previous.key === column.key
        ? {
            key: column.key,
            direction: previous.direction === 'asc' ? 'desc' : 'asc',
          }
        : { key: column.key, direction: column.initialDirection },
    );
  };

  return (
    /* The list scrolls rather than the page. Nothing is truncated, because a silently
       capped table reads as a complete ranking, so the cap is on height — and `sticky
       top-0` keeps the headers in view once this element is the scroller. */
    <div className="max-h-[28rem] overflow-y-auto" ref={scroller}>
      <table className="text-sm w-full" data-qa="stop-table">
        <thead className="sticky top-0">
          <tr>
            {columns.map((column) => {
              const isSortable = column.kind === 'sortable';
              const isSorted = isSortable && sort.key === column.key;

              return (
                <th
                  key={column.key}
                  title={column.title}
                  /* Only on a sortable header. `aria-sort="none"` means "sortable, not
                     currently sorted", so on the sparkline column it would announce a
                     control that isn't one. */
                  aria-sort={
                    !isSortable
                      ? undefined
                      : isSorted
                        ? sort.direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                  }
                  className={`bg-stone-300 p-2 uppercase ${
                    isSortable ? 'cursor-pointer' : ''
                  } ${column.kind === 'select' ? 'w-10' : ''} ${
                    ALIGN_CLASS[column.align]
                  } ${
                    isSorted
                      ? sort.direction === 'asc'
                        ? 'headerSortUp'
                        : 'headerSortDown'
                      : ''
                  }`}
                  onClick={isSortable ? () => onHeaderClick(column) : undefined}
                >
                  {/* The checkbox column's heading is named but not drawn: six characters
                      against a 20px control would widen a `w-10` cell and push an
                      already-overflowing mobile table further sideways. `sr-only` keeps
                      the accessible name. */}
                  {column.kind === 'select' ? (
                    <span className="sr-only">{column.label}</span>
                  ) : (
                    column.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {sorted.map((readout) => {
            const isSelected = selected.has(readout.key);
            /* The row's identity needs the line in it: a stop serving two selected lines
               is two rows, and a stop key alone would name them both. React keys by this,
               so a re-sort re-parents an already-mounted sparkline rather than remounting
               it, and every `data-qa` below is suffixed with it. */
            const rowKey = `${readout.line_name}-${readout.key}`;
            const lineName =
              lineNames.get(readout.line_name) ?? String(readout.line_name);
            /* One toggle for all three routes in — row, keyboard, checkbox. Whether this
               adds or removes is the selection's question, asked of the hook. */
            const toggle = (): void => onToggleStop(readout.key);

            return (
              /* Selecting a stop is a click *or* a key press. The only other route in is
                 a map circle, which is mouse-only by nature, so without this the per-stop
                 series would be unreachable from the keyboard.

                 No `aria-current`: it means "the current item in a set", which several
                 selected rows are not. The checkbox's checked state says a row is
                 selected, in the one place a reader looks for that answer. */
              <tr
                key={rowKey}
                data-qa={`stop-row-${rowKey}`}
                tabIndex={0}
                onClick={toggle}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  // Space would scroll the page otherwise, and the row is the thing being
                  // acted on rather than a page-level gesture.
                  event.preventDefault();
                  toggle();
                }}
                className={`cursor-pointer ${
                  isSelected ? 'bg-stone-200' : 'even:bg-[rgba(0,0,0,0.05)]'
                }`}
              >
                {/* A second hit target for the row's action, and the row's only visible
                    statement of whether it is selected.

                    Both handlers stop propagating, because this cell sits inside a row
                    that is itself a toggle: without them one click would toggle twice and
                    land back where it started. The keyboard needs the same guard — Radix
                    renders a real `<button>`, so Space fires its click *and* bubbles a
                    keydown to the row.

                    No `id`: the accessible name comes from `aria-label` here rather than
                    from a `<label htmlFor>` as the line table's does. */}
                <td data-qa={`stop-select-${rowKey}`} className="w-10">
                  <Checkbox.Root
                    aria-label={`${readout.name} · ${lineName}`}
                    checked={isSelected}
                    onClick={(event) => {
                      event.stopPropagation();
                      toggle();
                    }}
                    onKeyDown={(event) => event.stopPropagation()}
                    className="flex items-center justify-center bg-white data-[state=checked]:bg-[#033056] mx-auto rounded p-0 h-5 w-5"
                  >
                    <Checkbox.Indicator>
                      <img
                        src={checkIcon}
                        height={20}
                        width={20}
                        alt="Check"
                        className="recolor-white"
                      />
                    </Checkbox.Indicator>
                  </Checkbox.Root>
                </td>

                <td className="py-2">{readout.name}</td>
                <td className="whitespace-nowrap">{lineName}</td>
                <td className={ALIGN_CLASS.right}>
                  {formatRiders(readout.averageBoardings)}
                </td>
                <td className={ALIGN_CLASS.right}>
                  {formatRiders(readout.averageAlightings)}
                </td>
                <td className={ALIGN_CLASS.right}>
                  {formatRiders(readout.netAverage)}
                </td>
                <td className={ALIGN_CLASS.right}>
                  {formatShare(readout.shareOfLine)}
                </td>

                {/* The observed box is the whole cell, so the ref goes here. The cell has
                    no accessible text on purpose: a canvas is opaque to assistive tech
                    regardless, and the figures beside it carry the information. */}
                <td
                  data-qa={`stop-sparkline-${rowKey}`}
                  ref={visibleRows.observe(rowKey)}
                >
                  {/* The same box whether or not the chart has mounted, so a sparkline
                      arriving never moves the rows below it. */}
                  <div className="h-10 w-52">
                    {visibleRows.isVisible(rowKey) && (
                      <StopSparkline
                        series={seriesIndex.seriesFor(
                          readout.key,
                          readout.line_name,
                        )}
                        measure={measure}
                        lineId={readout.line_name}
                      />
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
