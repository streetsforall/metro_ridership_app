import { useMemo, useRef, useState } from 'react';
import StopTableRow, { ALIGN_CLASS } from './StopTableRow';
import { useVisibleRows } from '../hooks/useVisibleRows';
import type { LineReadout } from '../ridership';
import type { StopReadout } from '../stops';
import type { StopSeriesIndex } from '../utils/stopSeries';
import type { StopMeasure } from '../@types/stops.types';

/**
 * The ranked stop table, the panel's primary readout: it answers "which stops carry this
 * line" without the reader touching the map. Every number comes off a readout
 * `buildStopView` derived; nothing is recomputed here.
 *
 * Rows are memoised in `StopTableRow`. This component re-renders on every
 * IntersectionObserver batch, since that is where `useVisibleRows` keeps its state, so the
 * props below must stay reference-stable or all ~800 rows reconcile each notification.
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
 * A column is sortable, presentational, or the selection checkbox. Neither `select` nor
 * `ridershipOverTime` is a readout field, so keeping them out of `SortKey` makes "sort by
 * the sparkline" unrepresentable rather than a no-op — the comparator indexes a readout by
 * `sort.key`, and the compiler is what stops that being a key no readout has.
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
 * A row's identity, and React's key for it. The line has to be in it because a stop on two
 * selected lines is two rows, which a stop key alone would name both of. Keying by this
 * also lets a re-sort re-parent an already-mounted sparkline rather than remount it.
 */
const rowKey = (readout: StopReadout): string =>
  `${String(readout.line_name)}-${readout.key}`;

const AVERAGE_TITLE =
  'Averaged over this stop’s own reported months inside the selected period.';

/** Boardings and alightings, never "ons"/"offs" — `CONTEXT.md`'s vocabulary. */
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
    /* Longer than its neighbours because "change" sits two columns from "Ridership over
       time", where it would read as a trend. It is a net flow within each month. */
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
  /** Every row whose key is in it is checked and highlighted. */
  selectedStopKeys: readonly string[];
  /**
   * A row click or its checkbox toggles that stop, as a map circle does. Must be stable
   * across renders, as must `readouts`, `lines` and `seriesIndex`, because every row is
   * memoised on the props it is handed and a fresh callback would re-render all ~800 on
   * every observer notification.
   */
  onToggleStop: (stopKey: string) => void;
  /** Every row's series, from one pass over the records. See `buildStopSeriesIndex`. */
  seriesIndex: StopSeriesIndex;
  /** Which figure the sparklines draw. */
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
   * Ranked high-first by boardings until the reader says otherwise, because a table
   * ordered by whatever the derivation emitted is a list rather than a ranking.
   */
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'averageBoardings',
    direction: 'desc',
  });

  const lineNames = useMemo(
    () => new Map(lines.map((line) => [line.id, line.name])),
    [lines],
  );

  /* A set, not `includes` per row: selection is uncapped and a five-line table is ~800
     rows, so the scan would be quadratic in the case the feature invites. */
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
      // An absent figure sorts last either way rather than reading as zero, because a
      // stop with no figures did not report nobody (ADR-0004) and must not out-rank one
      // that reported a genuine 0.
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
    /* The list scrolls rather than the page, and the cap is on height rather than rows,
       because a silently truncated table reads as a complete ranking. */
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
                  /* Sortable headers only: `aria-sort="none"` means "sortable, not
                     currently sorted", which the sparkline column is not. */
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
                  {/* Named but not drawn: six characters against a 20px control would
                      widen a `w-10` cell and push an already-overflowing mobile table
                      further sideways. `sr-only` keeps the accessible name. */}
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
            const key = rowKey(readout);
            return (
              <StopTableRow
                key={key}
                rowKey={key}
                readout={readout}
                lineName={
                  lineNames.get(readout.line_name) ?? String(readout.line_name)
                }
                isSelected={selected.has(readout.key)}
                isVisible={visibleRows.isVisible(key)}
                seriesIndex={seriesIndex}
                measure={measure}
                onToggleStop={onToggleStop}
                observe={visibleRows.observe(key)}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
