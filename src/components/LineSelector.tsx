import { useMemo, useState } from 'react';
import lodash from 'lodash';
import LineFilters from './LineFilters';
import LineTableRow from './LineTableRow';
import { generateCSV } from '../utils/lines';
import type { Line } from '../@types/lines.types';
import type {
  AggregatedRidership,
  AggregatedRecord,
} from '../@types/metrics.types';
import downloadIcon from '../assets/download.svg';
import listIcon from '../assets/list.svg';
import tableIcon from '../assets/table.svg';

// TODO: Lazy load data rows
// const MetroLineTableRow = dynamic(() => import('./metroLineTableRow'),
// { ssr: false})

type SortDirection = 'asc' | 'desc' | false;

type LineKey = keyof Line;

interface ColumnHeaderState {
  label: string;
  key: LineKey;
  align?: 'center' | 'left' | 'right' | 'inherit' | 'justify';
  sortDirection: SortDirection;
}

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
  },
  {
    align: 'right',
    label: 'Avg. Ridership',
    key: 'averageRidership',
    sortDirection: false,
  },
  {
    align: 'right',
    label: 'Change',
    key: 'changeInRidership',
    sortDirection: false,
  },
  {
    align: 'right',
    label: 'Starting Ridership',
    key: 'startingRidership',
    sortDirection: false,
  },
  {
    align: 'right',
    label: 'Ending Ridership',
    key: 'endingRidership',
    sortDirection: false,
  },
  // {
  //   label: 'Division',,
  //   sortDirection: false,
  //   align: 'right',
  // },
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
  ridershipByLine: AggregatedRidership;
  lines: Line[];
  setLines: React.Dispatch<React.SetStateAction<Line[]>>;
  onToggleSelectLine: (line: Line) => void;
  expanded: boolean;
  dayOfWeek: string;
  setExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  searchText: string;
  setSearchText: React.Dispatch<React.SetStateAction<string>>;
  clearSelections: () => void;
  selectAllVisibleLines: () => void;
  showAggregateLines: boolean;
  toggleShowAggregateLines: () => void;
}

export default function LineSelector(props: LineSelectorProps) {
  const [columnHeaderStates, setColumnHeaderStates] =
    useState<ColumnHeaderState[]>(columnStates);

  const {
    ridershipByLine,
    lines,
    setLines,
    dayOfWeek,
    onToggleSelectLine,
    expanded,
    setExpanded,
    searchText,
    setSearchText,
    clearSelections,
    selectAllVisibleLines,
    showAggregateLines,
    toggleShowAggregateLines,
  } = props;

  const onExpandClick = (): void => {
    setExpanded((prevExpanded: boolean) => {
      return !prevExpanded;
    });
  };

  /**
   * Only changes header column states
   * @param key
   */
  const onSortLabelClick = (key: LineKey): void => {
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

  const sortedLines: Line[] = useMemo(() => {
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
    const sortKeys: LineKey[] = sortableColumnHeaders.map(
      (columnHeaderState: ColumnHeaderState) => columnHeaderState.key,
    );
    const sortDirections: SortDirection[] = sortableColumnHeaders.map(
      (columnHeaderState: ColumnHeaderState) => columnHeaderState.sortDirection,
    );

    // Sort lines
    return lodash.orderBy(lines, sortKeys, sortDirections);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(columnHeaderStates), JSON.stringify(lines), dayOfWeek]);

  return (
    <>
      {/* Expand button */}
      <button
        type="button"
        onClick={onExpandClick}
        className="self-end bg-transparent border-none hover:opacity-80 p-0"
      >
        {expanded ? (
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
        setLines={setLines}
        searchText={searchText}
        setSearchText={setSearchText}
        clearSelections={clearSelections}
        selectAllVisibleLines={selectAllVisibleLines}
        showAggregateLines={showAggregateLines}
        toggleShowAggregateLines={toggleShowAggregateLines}
      />

      {sortedLines.length ? (
        /* Overflow scroll container for non-expanded view */
        <div
          className={`${expanded ? 'overflow-x-auto lg:overflow-visible' : 'overflow-y-auto'}`}
        >
          <table className="text-sm w-full">
            {/* Only show table header when line selector is expanded */}
            {expanded && (
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
                const lineMetrics: AggregatedRecord = ridershipByLine[line.id];

                return (
                  <LineTableRow
                    lineMetrics={lineMetrics?.ridershipRecords}
                    key={line.id}
                    id={id}
                    onToggleSelectLine={onToggleSelectLine}
                    line={line}
                    dayOfWeek={dayOfWeek}
                    expanded={expanded}
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
        href={generateCSV(ridershipByLine)}
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
    </>
  );
}
