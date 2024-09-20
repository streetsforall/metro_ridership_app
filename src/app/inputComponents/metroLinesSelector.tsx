'use client';

import { useMemo, useState } from 'react';
import { LineMetricDataset, MetricWrapper } from '../page';
import { type Line } from '../common/types';
import MetroLineTableRow from './metroLineTableRow';
import lodash from 'lodash';
import Filters from './filters';

interface LineSelectorProps {
  lineMetricDataset: LineMetricDataset;
  lines: Line[];
  setLines: React.Dispatch<React.SetStateAction<Line[]>>;
  onToggleSelectLine: (line: Line) => void;
  expanded: boolean;
  dayOfWeek: string;
  setExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  searchText: string;
  setSearchText: React.Dispatch<React.SetStateAction<string>>;
  clearSelections: () => void;
}

// lazy load data rows
// const MetroLineTableRow = dynamic(() => import('./metroLineTableRow'),
// { ssr: false})

type sortDirection = 'asc' | 'desc' | false;

type LineKey = keyof Line;

interface ColumnHeaderState {
  label: string;
  key: LineKey;
  align?: 'center' | 'left' | 'right' | 'inherit' | 'justify';
  sortDirection: sortDirection;
}

const columnStates: ColumnHeaderState[] = [
  {
    label: '',
    key: 'id',
    sortDirection: false,
  },
  {
    label: 'Selected',
    key: 'selected',
    sortDirection: false,
  },
  {
    label: 'Line',
    key: 'name',
    sortDirection: false,
  },
  {
    label: 'Avg. Daily Ridership',
    key: 'averageRidership',
    sortDirection: false,
  },
  {
    label: 'Change',
    key: 'changeInRidership',
    sortDirection: false,
  },
  // {
  //   label: 'Division',,
  //   sortDirection: false,
  //   align: 'right',
  // },
  {
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

const toggleSortDirection = (sortDirection: sortDirection): sortDirection => {
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

export default function LineSelector({
  lineMetricDataset,
  lines,
  setLines,
  dayOfWeek,
  onToggleSelectLine,
  expanded,
  setExpanded,
  searchText,
  setSearchText,
  clearSelections,
}: LineSelectorProps) {
  const [columnHeaderStates, setColumnHeaderStates] =
    useState<ColumnHeaderState[]>(columnStates);

  const onExpandClick = (): void => {
    setExpanded((prevExpanded: boolean) => {
      return !prevExpanded;
    });
  };

  console.log(lines);

  /**
   * Only changes header column states.
   * @param key
   */
  const onSortLabelClick = (key: LineKey): void => {
    setColumnHeaderStates((prevColumnHeaderStates: ColumnHeaderState[]) => {
      let latestColumnHeaderStates: ColumnHeaderState[] = [
        ...prevColumnHeaderStates,
      ];

      // Find column header to update.
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

      // If we could not find column header, then no operations.
      if (!targetColumnHeader || targetColumnHeaderIndex < 0) {
        return latestColumnHeaderStates;
      }

      // Create new object to keep pure function.
      targetColumnHeader = { ...targetColumnHeader };

      // Update column header.
      targetColumnHeader.sortDirection = toggleSortDirection(
        targetColumnHeader.sortDirection,
      );

      // Update column header states with updated column header.
      latestColumnHeaderStates[targetColumnHeaderIndex] = targetColumnHeader;

      // Clear sort direction for other columns not being updated.
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
    // Get column headers that have a sort direction (ex: asc, desc).
    const sortableColumnHeaders: ColumnHeaderState[] =
      columnHeaderStates.filter(
        (columnHeaderState: ColumnHeaderState) =>
          !!columnHeaderState.sortDirection,
      );

    // If no sort direction is specified, just use original sorted legislators.
    if (sortableColumnHeaders.length === 0) {
      return lines;
    }

    // Get values needed to sort legislators via lodash.
    const sortKeys: LineKey[] = sortableColumnHeaders.map(
      (columnHeaderState: ColumnHeaderState) => columnHeaderState.key,
    );
    const sortDirections: sortDirection[] = sortableColumnHeaders.map(
      (columnHeaderState: ColumnHeaderState) => columnHeaderState.sortDirection,
    );

    // Sort lines.
    return lodash.orderBy(lines, sortKeys, sortDirections);

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(columnHeaderStates), JSON.stringify(lines), dayOfWeek]);

  console.log('lines', lines);
  console.log('sortedLines', sortedLines);

  const subtitleClass = 'text-neutral-400';

  return (
    /* Styled as flexbox so overflow scroll container stretches full height */
    <div
      id="line_selector"
      className={
        'flex flex-col bg-white p-4 rounded-xl ' + (expanded ? 'expanded' : '')
      }
    >
      <div className="flex gap-4 items-center justify-between">
        <span className="text-sm uppercase whitespace-nowrap">
          Line Selector
        </span>

        <button id="expandButton" onClick={onExpandClick}>
          {expanded ? 'Hide' : 'Expand'}
        </button>
      </div>
      <div id="filters-wrapper">
        <Filters
          setLines={setLines}
          searchText={searchText}
          setSearchText={setSearchText}
          clearSelections={clearSelections}
        ></Filters>
      </div>

      {/* Overflow scroll container */}
      <div className="overflow-y-auto">
        <table className="w-full">
          {/* Only show table header when line selector is expanded */}
          {expanded && (
            <thead>
              <tr>
                {columnHeaderStates.map(
                  (columnHeaderState: ColumnHeaderState, index: number) => {
                    let classNames: string = subtitleClass;
                    if (columnHeaderState.sortDirection === 'asc') {
                      classNames = `${classNames} headerSortUp`;
                    } else if (columnHeaderState.sortDirection === 'desc') {
                      classNames = `${classNames} headerSortDown`;
                    }

                    return (
                      <th
                        key={index}
                        style={{ textAlign: 'left' }}
                        className={classNames}
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
              const lineMetrics: MetricWrapper = lineMetricDataset[line.id];

              return (
                <MetroLineTableRow
                  lineMetrics={lineMetrics?.metrics}
                  key={line.id}
                  id={id}
                  onToggleSelectLine={onToggleSelectLine}
                  line={line}
                  dayOfWeek={dayOfWeek}
                  expanded={expanded}
                ></MetroLineTableRow>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
