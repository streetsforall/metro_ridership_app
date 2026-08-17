import { useMemo, useRef, useState } from 'react';
import StopSparkline from './StopSparkline';
import { useVisibleRows } from '../hooks/useVisibleRows';
import type { LineReadout } from '../ridership';
import type { StopReadout } from '../stops';
import type { StopSeriesIndex } from '../utils/stopSeries';
import type { StopMeasure } from '../@types/stops.types';

/**
 * The ranked stop table — the panel's **primary** readout.
 *
 * It answers "which stops carry this line" without the reader ever touching the map,
 * which is how the rest of the dashboard behaves: the line table is the primary view
 * of line ridership and the map highlights it. A map-click-only stop view would make
 * this the one figure in the app you have to hunt for.
 *
 * Every number here comes off a Stop Readout that `buildStopView` derived. Nothing is
 * recomputed, including the share of line, which needs every stop on the line and so
 * cannot be derived from a row.
 */

type SortKey =
  | 'name'
  | 'line_name'
  | 'averageBoardings'
  | 'averageAlightings'
  | 'netAverage'
  | 'shareOfLine';

type SortDirection = 'asc' | 'desc';

/**
 * A column is either sortable or presentational, and the type says which.
 *
 * `ridershipOverTime` is not a field on a Stop Readout — it is the sparkline column's
 * identity and nothing more. Keeping it out of `SortKey` rather than adding a boolean
 * flag means "sort by the sparkline" is unrepresentable instead of merely a no-op: the
 * comparator below indexes a readout by `sort.key`, and the compiler is what stops that
 * ever being a key no readout has.
 */
type Column =
  | {
      kind: 'sortable';
      key: SortKey;
      label: string;
      align: 'left' | 'right';
      /** Which way a first click on this header sorts. Figures rank high-first. */
      initialDirection: SortDirection;
      title?: string;
    }
  | {
      kind: 'presentational';
      key: 'ridershipOverTime';
      label: string;
      align: 'left' | 'right';
      title?: string;
    };

type SortableColumn = Extract<Column, { kind: 'sortable' }>;

/**
 * **Boardings and Alightings**, never "ons"/"offs" — `CONTEXT.md`'s vocabulary, and
 * these strings are the reader's only exposure to it.
 */
const columns: Column[] = [
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
    title:
      'Averaged over this stop’s own reported months inside the selected period.',
  },
  {
    kind: 'sortable',
    key: 'averageAlightings',
    label: 'Avg. Alightings',
    align: 'right',
    initialDirection: 'desc',
    title:
      'Averaged over this stop’s own reported months inside the selected period.',
  },
  {
    kind: 'sortable',
    key: 'netAverage',
    label: 'Net',
    align: 'right',
    initialDirection: 'desc',
    title:
      'Boardings less alightings. Negative where more riders get off than on, which is information rather than an error.',
  },
  {
    kind: 'sortable',
    key: 'shareOfLine',
    label: 'Share of line',
    align: 'right',
    initialDirection: 'desc',
    title:
      'This stop’s share of its line’s total under the current measure.',
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

const figure = (value: number | undefined): string =>
  value === undefined ? '—' : Math.round(value).toLocaleString();

const share = (value: number | undefined): string =>
  value === undefined ? '—' : `${(value * 100).toFixed(1)}%`;

export interface StopTableProps {
  readouts: readonly StopReadout[];
  /** Line display names, by id. The readout carries the numeric id only. */
  lines: readonly LineReadout[];
  selectedStopKey: string | null;
  /** A row click selects that stop, exactly as a map circle does. */
  onSelectStop: (stopKey: string) => void;
  /** Clicking the already-selected row clears it, so the row is a real toggle. */
  onClearStop: () => void;
  /** Every row's series, from one pass over the records. See `buildStopSeriesIndex`. */
  seriesIndex: StopSeriesIndex;
  /** Which figure the sparklines draw — the panel's Stop Measure. */
  measure: StopMeasure;
}

export default function StopTable({
  readouts,
  lines,
  selectedStopKey,
  onSelectStop,
  onClearStop,
  seriesIndex,
  measure,
}: StopTableProps) {
  /*
   * The scroller is the sparklines' observation root, so it needs a ref it did not have
   * before. See `useVisibleRows` for why the viewport will not do.
   */
  const scroller = useRef<HTMLDivElement | null>(null);
  const visibleRows = useVisibleRows(scroller);
  /**
   * Ranked high-first by boardings until the reader says otherwise. A table whose
   * default order is "whatever the derivation emitted" is a list, not a ranking, and
   * the whole point of this view is which stops carry the line.
   */
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'averageBoardings',
    direction: 'desc',
  });

  const lineNames = useMemo(
    () => new Map(lines.map((line) => [line.id, line.name])),
    [lines],
  );

  const sorted = useMemo(() => {
    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...readouts].sort((a, b) => {
      if (sort.key === 'name') return factor * a.name.localeCompare(b.name);
      if (sort.key === 'line_name') {
        const nameA = lineNames.get(a.line_name) ?? String(a.line_name);
        const nameB = lineNames.get(b.line_name) ?? String(b.line_name);
        return factor * nameA.localeCompare(nameB);
      }
      // An absent figure sorts last in either direction rather than reading as zero:
      // a stop with no figures did not report nobody (ADR-0004's contract at stop
      // grain), so it must not out-rank one that reported a genuine 0.
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
    /* The list scrolls rather than the page. A five-line selection is up to ~800 rows
       — nothing is truncated, because a silently capped table reads as a complete
       ranking — so the cap is on height, and `sticky top-0` keeps the headers in view
       once this element is the scroller. */
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
                  /* Only on a sortable header. `aria-sort="none"` does not mean "not
                     sortable" — it means "sortable, not currently sorted" — so putting
                     it on the sparkline column would announce a control that isn't one. */
                  aria-sort={
                    !isSortable
                      ? undefined
                      : isSorted
                        ? sort.direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                  }
                  /* Spelled out rather than interpolated: Tailwind scans source text for
                     whole class names, so a `text-${align}` template produces a class
                     that is never generated. */
                  className={`bg-stone-300 p-2 uppercase ${
                    isSortable ? 'cursor-pointer' : ''
                  } ${column.align === 'right' ? 'text-right' : 'text-left'} ${
                    isSorted
                      ? sort.direction === 'asc'
                        ? 'headerSortUp'
                        : 'headerSortDown'
                      : ''
                  }`}
                  onClick={
                    isSortable ? () => onHeaderClick(column) : undefined
                  }
                >
                  {column.label}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {sorted.map((readout) => {
            const isSelected = readout.key === selectedStopKey;
            /* The same identity React keys the row by, so a re-sort re-parents an
               already-mounted sparkline rather than remounting it. */
            const rowKey = `${readout.line_name}-${readout.key}`;
            /* Selecting the selected stop again clears it. Without this the row is a
               dead click once it is selected, which reads as a broken toggle — and it
               is the only way out of the series that the keyboard can reach. */
            const toggle = (): void => {
              if (isSelected) onClearStop();
              else onSelectStop(readout.key);
            };

            return (
              /* Selecting a stop is a click *or* a key press. A map circle is the
                 only other route in and that one is mouse-only by nature, so without
                 this the per-stop series would be unreachable from the keyboard.

                 `aria-current` rather than `aria-selected`: `aria-selected` is only
                 honoured on a row inside a `grid`/`treegrid`, and this is a plain
                 table — it would have been an attribute nothing reads. */
              <tr
                key={rowKey}
                data-qa={`stop-row-${readout.key}`}
                tabIndex={0}
                aria-current={isSelected ? 'true' : undefined}
                onClick={toggle}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  // Space scrolls the page otherwise, and the row is the thing being
                  // acted on rather than a page-level gesture.
                  event.preventDefault();
                  toggle();
                }}
                className={`cursor-pointer ${
                  isSelected ? 'bg-stone-200' : 'even:bg-[rgba(0,0,0,0.05)]'
                }`}
              >
                <td className="py-2">{readout.name}</td>
                <td className="whitespace-nowrap">
                  {lineNames.get(readout.line_name) ?? readout.line_name}
                </td>
                <td className="text-right">
                  {figure(readout.averageBoardings)}
                </td>
                <td className="text-right">
                  {figure(readout.averageAlightings)}
                </td>
                <td className="text-right">{figure(readout.netAverage)}</td>
                <td className="text-right">{share(readout.shareOfLine)}</td>

                {/* The observed box is the whole cell, so the ref goes here. The cell
                    has no accessible text on purpose: a canvas is opaque to assistive
                    tech regardless, and the figures beside it already carry the
                    information. */}
                <td
                  data-qa={`stop-sparkline-${readout.key}`}
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
