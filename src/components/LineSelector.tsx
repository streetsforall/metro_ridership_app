import { useMemo, useState } from 'react';
import lodash from 'lodash';
import LineFilters from './LineFilters';
import LineTableRow from './LineTableRow';
import { buildWindowMonthAxis, type LineReadout } from '../ridership';
import { generateCSV } from '../utils/lines';
import type { Line } from '../@types/lines.types';
import type {
  ConsolidatedRecord,
  ConsolidatedRidership,
} from '../@types/metrics.types';
import downloadIcon from '../assets/download.svg';
import listIcon from '../assets/list.svg';
import tableIcon from '../assets/table.svg';

// TODO: Lazy load data rows
// const MetroLineTableRow = dynamic(() => import('./metroLineTableRow'),
// { ssr: false})

type SortDirection = 'asc' | 'desc' | false;

/**
 * `ridershipOverTime` is not a field on anything — it is the sparkline column's
 * identity for sort-state bookkeeping only, and sorting by it is a no-op.
 */
type ColumnKey = keyof LineReadout | 'ridershipOverTime';

interface ColumnHeaderState {
  label: string;
  key: ColumnKey;
  align?: 'center' | 'left' | 'right' | 'inherit' | 'justify';
  sortDirection: SortDirection;
  /** Hover text, used to qualify the period the metric columns are measured over. */
  title?: string;
}

/**
 * Every metric column is derived from each line's own first and last record inside the
 * window, not from the window's endpoints — so two rows can be measured over quite
 * different periods, and sorting ranks them against each other regardless. Rows whose
 * coverage is narrower than the window carry a range under the line name.
 */
const perLinePeriodNote =
  'Measured over this line’s own available months within the selected period, which can differ from line to line.';

const columnStates: ColumnHeaderState[] = [
  {
    align: 'right',
    label: '',
    key: 'id',
    sortDirection: false,
  },
  {
    align: 'center',
    label: 'Selected',
    key: 'selected',
    sortDirection: false,
  },
  {
    align: 'left',
    label: 'Line',
    key: 'name',
    sortDirection: false,
    title:
      'A date range beside a line name means its data covers only that part of the selected period.',
  },
  {
    align: 'right',
    label: 'Avg. Ridership',
    key: 'averageRidership',
    sortDirection: false,
    title: perLinePeriodNote,
  },
  {
    align: 'right',
    label: 'Change',
    key: 'changeInRidership',
    sortDirection: false,
    title: perLinePeriodNote,
  },
  {
    align: 'right',
    label: 'Starting Ridership',
    key: 'startingRidership',
    sortDirection: false,
    title: perLinePeriodNote,
  },
  {
    align: 'right',
    label: 'Ending Ridership',
    key: 'endingRidership',
    sortDirection: false,
    title: perLinePeriodNote,
  },
  // {
  //   label: 'Division',,
  //   sortDirection: false,
  //   align: 'right',
  // },
  {
    align: 'right',
    label: 'Miles',
    key: 'distanceMiles',
    sortDirection: false,
  },
  {
    align: 'right',
    label: 'Riders/Mile',
    key: 'ridersPerMile',
    sortDirection: false,
  },
  {
    align: 'left',
    label: 'Ridership over time',
    sortDirection: false,
    key: 'ridershipOverTime',
  },
  // Empty for view map
  // {
  //   label: '',
  //   sortDirection: false,
  //   key: 'viewMap',
  // },
];

const toggleSortDirection = (sortDirection: SortDirection): SortDirection => {
  if (!sortDirection) {
    return 'asc';
  } else if (sortDirection === 'asc') {
    return 'desc';
  } else if (sortDirection === 'desc') {
    return false;
  } else {
    return false;
  }
};

interface LineSelectorProps {
  consolidated: ConsolidatedRidership;
  lines: LineReadout[];
  /**
   * The Line state setter. Still `Line[]`: readouts are derived per Month Window
   * and thrown away, so there is nothing to set them back into.
   */
  setLines: React.Dispatch<React.SetStateAction<Line[]>>;
  onToggleSelectLine: (line: Line) => void;
  isExpanded: boolean;
  dayOfWeek: string;
  setIsExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  searchText: string;
  setSearchText: React.Dispatch<React.SetStateAction<string>>;
  modes: string[];
  setModes: React.Dispatch<React.SetStateAction<string[]>>;
  clearSelections: () => void;
  selectAllListedLines: (ids: number[]) => void;
  isAggregateVisible: boolean;
  toggleIsAggregateVisible: () => void;
}

export default function LineSelector(props: LineSelectorProps) {
  const [columnHeaderStates, setColumnHeaderStates] =
    useState<ColumnHeaderState[]>(columnStates);
  const [isCopied, setIsCopied] = useState(false);
  const {
    consolidated,
    lines,
    dayOfWeek,
    onToggleSelectLine,
    isExpanded,
    setIsExpanded,
    searchText,
    setSearchText,
    modes,
    setModes,
    clearSelections,
    selectAllListedLines,
    isAggregateVisible,
    toggleIsAggregateVisible,
  } = props;

  /**
   * One shared x-axis for every row's sparkline: the months that exist anywhere in the
   * current window. Without it each row plots against its own implicit axis, so a
   * 9-month line and a 17-year line span the same cell width with no cue that the
   * scales differ.
   */
  const monthAxis: string[] = useMemo(
    () => buildWindowMonthAxis(consolidated),
    [consolidated],
  );

  const onExpandClick = (): void => {
    setIsExpanded((prevIsExpanded: boolean) => {
      return !prevIsExpanded;
    });
  };

  /**
   * Only changes header column states
   * @param key
   */
  const onSortLabelClick = (key: ColumnKey): void => {
    setColumnHeaderStates((prevColumnHeaderStates: ColumnHeaderState[]) => {
      let latestColumnHeaderStates: ColumnHeaderState[] = [
        ...prevColumnHeaderStates,
      ];

      // Find column header to update
      let targetColumnHeaderIndex: number = -1;

      let targetColumnHeader: ColumnHeaderState | undefined =
        prevColumnHeaderStates.find(
          (columnState: ColumnHeaderState, index: number) => {
            if (columnState.key === key) {
              targetColumnHeaderIndex = index;

              return true;
            }

            return false;
          },
        );

      // If we could not find column header, then no operations
      if (!targetColumnHeader || targetColumnHeaderIndex < 0) {
        return latestColumnHeaderStates;
      }

      // Create new object to keep pure function
      targetColumnHeader = { ...targetColumnHeader };

      // Update column header
      targetColumnHeader.sortDirection = toggleSortDirection(
        targetColumnHeader.sortDirection,
      );

      // Update column header states with updated column header
      latestColumnHeaderStates[targetColumnHeaderIndex] = targetColumnHeader;

      // Clear sort direction for other columns not being updated
      latestColumnHeaderStates = latestColumnHeaderStates.map(
        (columnHeaderState: ColumnHeaderState, index: number) => {
          if (index !== targetColumnHeaderIndex) {
            columnHeaderState.sortDirection = false;
          }

          return columnHeaderState;
        },
      );

      return latestColumnHeaderStates;
    });
  };

  const sortedLines: LineReadout[] = useMemo(() => {
    // Get column headers that have a sort direction (ex: asc, desc)
    const sortableColumnHeaders: ColumnHeaderState[] =
      columnHeaderStates.filter(
        (columnHeaderState: ColumnHeaderState) =>
          !!columnHeaderState.sortDirection,
      );

    // If no sort direction is specified, just use original sorted lines
    if (sortableColumnHeaders.length === 0) {
      return lines;
    }

    // Get values needed to sort lines via lodash
    const sortKeys: ColumnKey[] = sortableColumnHeaders.map(
      (columnHeaderState: ColumnHeaderState) => columnHeaderState.key,
    );
    const sortDirections: SortDirection[] = sortableColumnHeaders.map(
      (columnHeaderState: ColumnHeaderState) => columnHeaderState.sortDirection,
    );

    // Sort lines
    return lodash.orderBy(lines, sortKeys, sortDirections);
  }, [columnHeaderStates, lines]);

  const shareData: ShareData = {
    title: 'LA Metro Ridership Data',
    url: window.location.href,
  };

  const handleShare = async (): Promise<void> => {
    const url = window.location.href;
    if (navigator.share && navigator.canShare(shareData)) {
      void navigator.share({ title: 'LA Metro Ridership Data', url });
    } else {
      await navigator.clipboard.writeText(url);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  return (
    <>
      {/* Expand button */}
      <button
        id="expand-toggle"
        type="button"
        onClick={onExpandClick}
        className="self-end bg-transparent border-none hover:opacity-80 p-0"
      >
        {isExpanded ? (
          <img
            src={listIcon}
            alt="Collapse to list view"
            title="Collapse to list view"
            height={16}
            width={16}
          />
        ) : (
          <img
            src={tableIcon}
            alt="Expand to table view"
            title="Expand to table view"
            height={16}
            width={16}
          />
        )}
      </button>

      <LineFilters
        searchText={searchText}
        setSearchText={setSearchText}
        modes={modes}
        setModes={setModes}
        clearSelections={clearSelections}
        selectAllListedLines={(): void =>
          selectAllListedLines(sortedLines.map((l) => l.id))
        }
        isAggregateVisible={isAggregateVisible}
        toggleIsAggregateVisible={toggleIsAggregateVisible}
      />

      {/**
       * Scroll container for the row list. Collapsed, the pane itself is capped
       * (`h-[32rem]` in App.tsx) and this just scrolls inside it. Expanded, the pane is
       * `h-auto`, so below `lg` the cap has to live here instead: every mode is visible by
       * default, which is ~180 rows, and an uncapped table runs the page past 9,000px on a
       * phone. `sticky top-0` on the thead keeps the column headers in view once this
       * element is the scroller. Desktop keeps page-level scrolling — the table is the
       * whole view there, so a nested scrollbar would only get in the way.
       */}
      {sortedLines.length ? (
        <div
          className={`${isExpanded ? 'overflow-x-auto max-h-[70vh] lg:max-h-none lg:overflow-visible' : 'overflow-y-auto'}`}
        >
          <table className="text-sm w-full">
            {/* Only show table header when line selector is expanded */}
            {isExpanded && (
              <thead className="sticky top-0">
                <tr>
                  {columnHeaderStates.map(
                    (columnHeaderState: ColumnHeaderState) => {
                      let sortClass = '';

                      if (columnHeaderState.sortDirection === 'asc') {
                        sortClass = 'headerSortUp';
                      } else if (columnHeaderState.sortDirection === 'desc') {
                        sortClass = 'headerSortDown';
                      }

                      return (
                        <th
                          key={columnHeaderState.key}
                          title={columnHeaderState.title}
                          className={`bg-stone-300 cursor-pointer p-2 max-w-24 uppercase text-${columnHeaderState.align} ${sortClass}`}
                          onClick={(): void =>
                            onSortLabelClick(columnHeaderState.key)
                          }
                        >
                          {columnHeaderState.label}
                        </th>
                      );
                    },
                  )}
                </tr>
              </thead>
            )}

            <tbody>
              {sortedLines.map((line, id) => {
                const consolidatedRecord: ConsolidatedRecord =
                  consolidated[line.id];

                return (
                  <LineTableRow
                    ridershipRecords={consolidatedRecord?.ridershipRecords}
                    monthAxis={monthAxis}
                    key={line.id}
                    id={id}
                    onToggleSelectLine={onToggleSelectLine}
                    line={line}
                    dayOfWeek={dayOfWeek}
                    isExpanded={isExpanded}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="py-8 text-center text-sm text-stone-400">
          Please select a transit mode.
        </div>
      )}

      <a
        id="download-csv"
        href={generateCSV(consolidated)}
        download="metro_ridership.csv"
        className="button flex gap-2 items-center justify-center"
      >
        Download selected data as CSV
        <img
          src={downloadIcon}
          height={16}
          width={16}
          alt=""
          className="recolor-white"
        />
      </a>

      <button
        type="button"
        id="share-button"
        onClick={() => void handleShare()}
        className="button flex gap-2 items-center justify-center"
      >
        {isCopied ? 'Copied to clipboard' : 'Share'}
      </button>
    </>
  );
}
