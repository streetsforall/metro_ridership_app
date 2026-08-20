import { useMemo, useState } from 'react';
import StopTableRow, { ALIGN_CLASS } from './StopTableRow';
import type { LineReadout } from '../ridership';
import type { StopReadout } from '../stops';

/**
 * The ranked stop table, which answers "which stops carry this line" without the map —
 * every prop here must stay reference-stable, because all ~800 rows are memoised.
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
 * A column is sortable, presentational, or the checkbox, so that sorting by a column with
 * no readout field behind it won't compile.
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

/** A row's identity, line included, because one stop on two selected lines is two rows. */
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
    /* Longer than its neighbours because "change" reads as a trend unless said otherwise. */
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
];

export interface StopTableProps {
  readouts: readonly StopReadout[];
  /** Line display names, by id. The readout carries the numeric id only. */
  lines: readonly LineReadout[];
  /** Every row whose key is in it is checked and highlighted. */
  selectedStopKeys: readonly string[];
  /** Toggles one stop, and must be stable across renders like `readouts` and `lines`. */
  onToggleStop: (stopKey: string) => void;
}

export default function StopTable({
  readouts,
  lines,
  selectedStopKeys,
  onToggleStop,
}: StopTableProps) {
  /** Ranked high-first by boardings until the reader sorts it otherwise. */
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({
    key: 'averageBoardings',
    direction: 'desc',
  });

  const lineNames = useMemo(
    () => new Map(lines.map((line) => [line.id, line.name])),
    [lines],
  );

  /* A set, not `includes` per row, which would be quadratic over ~800 rows. */
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
      // An absent figure sorts last either way rather than reading as zero (ADR-0004).
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
    /* Capped by height rather than rows, because a truncated table reads as the whole ranking. */
    <div className="max-h-[28rem] overflow-y-auto">
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
                  /* Sortable headers only, since `aria-sort="none"` still claims sortability. */
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
                onToggleStop={onToggleStop}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
