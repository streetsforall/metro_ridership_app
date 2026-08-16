import { useMemo, useState } from 'react';
import type { LineReadout } from '../ridership';
import type { StopReadout } from '../stops';

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

interface Column {
  key: SortKey;
  label: string;
  align: 'left' | 'right';
  /** Which way a first click on this header sorts. Figures rank high-first. */
  initialDirection: SortDirection;
  title?: string;
}

/**
 * **Boardings and Alightings**, never "ons"/"offs" — `CONTEXT.md`'s vocabulary, and
 * these strings are the reader's only exposure to it.
 */
const columns: Column[] = [
  { key: 'name', label: 'Stop', align: 'left', initialDirection: 'asc' },
  { key: 'line_name', label: 'Line', align: 'left', initialDirection: 'asc' },
  {
    key: 'averageBoardings',
    label: 'Avg. Boardings',
    align: 'right',
    initialDirection: 'desc',
    title:
      'Averaged over this stop’s own reported months inside the selected period.',
  },
  {
    key: 'averageAlightings',
    label: 'Avg. Alightings',
    align: 'right',
    initialDirection: 'desc',
    title:
      'Averaged over this stop’s own reported months inside the selected period.',
  },
  {
    key: 'netAverage',
    label: 'Net',
    align: 'right',
    initialDirection: 'desc',
    title:
      'Boardings less alightings. Negative where more riders get off than on, which is information rather than an error.',
  },
  {
    key: 'shareOfLine',
    label: 'Share of line',
    align: 'right',
    initialDirection: 'desc',
    title:
      'This stop’s share of its line’s total under the current measure.',
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
}

export default function StopTable({
  readouts,
  lines,
  selectedStopKey,
  onSelectStop,
}: StopTableProps) {
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

  const onHeaderClick = (column: Column): void => {
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
    <div className="max-h-[28rem] overflow-y-auto">
      <table className="text-sm w-full" data-qa="stop-table">
        <thead className="sticky top-0">
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                title={column.title}
                aria-sort={
                  sort.key === column.key
                    ? sort.direction === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                }
                /* Spelled out rather than interpolated: Tailwind scans source text for
                   whole class names, so a `text-${align}` template produces a class
                   that is never generated. */
                className={`bg-stone-300 cursor-pointer p-2 uppercase ${
                  column.align === 'right' ? 'text-right' : 'text-left'
                } ${
                  sort.key === column.key
                    ? sort.direction === 'asc'
                      ? 'headerSortUp'
                      : 'headerSortDown'
                    : ''
                }`}
                onClick={() => onHeaderClick(column)}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {sorted.map((readout) => {
            const isSelected = readout.key === selectedStopKey;
            return (
              <tr
                key={`${readout.line_name}-${readout.key}`}
                data-qa={`stop-row-${readout.key}`}
                aria-selected={isSelected}
                onClick={() => onSelectStop(readout.key)}
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
