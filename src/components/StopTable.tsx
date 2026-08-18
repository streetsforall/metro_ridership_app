import { useMemo, useRef, useState } from 'react';
import * as Checkbox from '@radix-ui/react-checkbox';
import StopSparkline from './StopSparkline';
import checkIcon from '../assets/check.svg';
import { useVisibleRows } from '../hooks/useVisibleRows';
import type { LineReadout } from '../ridership';
import type { StopReadout } from '../stops';
import { signedChange } from '../utils/signedChange';
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
 * A column is sortable, presentational, or the selection checkbox, and the type says which.
 *
 * Neither `select` nor `ridershipOverTime` is a field on a Stop Readout — each is a
 * column's identity and nothing more. Keeping them out of `SortKey` rather than adding a
 * boolean flag means "sort by the sparkline" is unrepresentable instead of merely a
 * no-op: the comparator below indexes a readout by `sort.key`, and the compiler is what
 * stops that ever being a key no readout has.
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
    }
  | {
      kind: 'select';
      key: 'select';
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
    label: 'Change',
    align: 'right',
    initialDirection: 'desc',
    /* The tooltip carries more weight than the other columns' because the heading sits two
       away from "Ridership over time", where "change" would naturally read as a trend. It
       is not one: this is a net flow within each month, not a movement between months. */
    title:
      'Boardings less alightings — the net change in riders on board at this stop, within each month rather than between them. Negative where more riders get off than on, which is information rather than an error.',
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

/**
 * The Change cell's text and colour, drawn the way the line table draws its own — `+`
 * and green for a gain, `-` and red for a loss, from the one `signedChange` both share.
 *
 * Two things this column does not share with that one. **Zero is a figure here, not an
 * em dash**: Change is Boardings less Alightings within a Month, so zero is a stop where
 * as many riders got off as on, and only `undefined` means no figure at all. And what
 * the colours *mean* is narrower — green is a stop that takes on more riders than it
 * sheds, not a stop doing well. A terminus is deeply negative by design. The column
 * heading's own tooltip is where that is said to the reader.
 */
const changeCell = (
  value: number | undefined,
): { text: string; className: string } =>
  value === undefined
    ? { text: '—', className: '' }
    : signedChange(Math.round(value));

const share = (value: number | undefined): string =>
  value === undefined ? '—' : `${(value * 100).toFixed(1)}%`;

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

  /*
   * A set, not `selectedStopKeys.includes` per row. Selection is uncapped and a five-line
   * table is ~800 rows, so the array scan would be quadratic in exactly the case the
   * feature invites — `Select All`, then read the table.
   */
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
                  } ${column.kind === 'select' ? 'w-10' : ''} ${
                    column.align === 'right' ? 'text-right' : 'text-left'
                  } ${
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
                  {/* The checkbox column's heading is named but not drawn. Its label is
                      six characters against a 20px control, and a `w-10` cell cannot hold
                      it — the text would widen the column and push an already-overflowing
                      mobile table further sideways. `sr-only` keeps the accessible name,
                      which is what `aria-sort`'s absence and the row labels rely on. */}
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
            /* The row's identity, and it needs the line in it: a stop serving two
               selected lines is two rows, and a stop key alone would name them both.
               React keys by this, so a re-sort re-parents an already-mounted sparkline
               rather than remounting it, and every `data-qa` below is suffixed with it
               so a locator matches one row rather than two. */
            const rowKey = `${readout.line_name}-${readout.key}`;
            const lineName =
              lineNames.get(readout.line_name) ?? String(readout.line_name);
            /* One toggle for all three routes in — the row, the keyboard, the checkbox.
               Whether this adds or removes is the selection's question, so it is asked
               of the hook rather than answered again here. */
            const toggle = (): void => onToggleStop(readout.key);

            return (
              /* Selecting a stop is a click *or* a key press. A map circle is the
                 only other route in and that one is mouse-only by nature, so without
                 this the per-stop series would be unreachable from the keyboard.

                 No `aria-current`: it means "the current item in a set", which is not
                 what several selected rows are. The checkbox's own checked state is
                 what now says a row is selected, and it says it in the one place a
                 reader looks for that answer. */
              <tr
                key={rowKey}
                data-qa={`stop-row-${rowKey}`}
                tabIndex={0}
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
                {/* A second hit target for the row's own action, and the row's only
                    visible statement of whether it is selected.

                    Both handlers stop propagating, because this cell sits inside a row
                    that is itself a toggle: without them one click would toggle twice
                    and land back where it started. The keyboard needs the same guard as
                    the mouse — Radix renders a real `<button>`, so Space fires its click
                    *and* bubbles a keydown to the row.

                    No `id`. The line table's checkbox needs one because its accessible
                    name comes from a `<label htmlFor>` on the name cell; this one carries
                    `aria-label` directly, so an id here would be an attribute nothing
                    reads — and a stop key contains a `:`, which any `#`-selector would
                    then have to escape for no gain. */}
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
                <td className="text-right">
                  {figure(readout.averageBoardings)}
                </td>
                <td className="text-right">
                  {figure(readout.averageAlightings)}
                </td>
                <td
                  className={`text-right ${changeCell(readout.netAverage).className}`}
                >
                  {changeCell(readout.netAverage).text}
                </td>
                <td className="text-right">{share(readout.shareOfLine)}</td>

                {/* The observed box is the whole cell, so the ref goes here. The cell
                    has no accessible text on purpose: a canvas is opaque to assistive
                    tech regardless, and the figures beside it already carry the
                    information. */}
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
