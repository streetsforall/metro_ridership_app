'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import lodash from 'lodash';
import { type Line } from '../common/types';
import { getLineName } from '../common/lines';
import Filters from './filters';
import MetroLineTableRow from './lineTableRow';
import { LineMetricDataset, Metric, MetricWrapper } from '../page';

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
  selectAllVisibleLines: () => void;
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
    label: 'Avg. Ridership',
    key: 'averageRidership',
    sortDirection: false,
  },
  {
    label: 'Change',
    key: 'changeInRidership',
    sortDirection: false,
  },
  {
    label: 'Starting Ridership',
    key: 'startingRidership',
    sortDirection: false,
  },
  {
    label: 'Current Ridership',
    key: 'endingRidership',
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
  selectAllVisibleLines,
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

  /**
   * From https://stackoverflow.com/a/14966131.
   *
   * Warning: Looks like it doesn't work for large dataset.
   * May return a NETWORK_INVALID_REQUEST.
   * Will need to have CSV export logic in a backend when that happens.
   */
  const csvDownload = (): string => {
    let csvContent = 'data:text/csv;charset=utf-8,';

    // Add headers to CSV.
    const headers =
      'line_name,year,month,est_wkday_ridership,est_sat_ridership,est_sun_ridership\r\n';
    csvContent += headers;

    // Add line data: get selected lines.
    const linesData: MetricWrapper[] = lines
      .filter((line: Line) => line.selected && lineMetricDataset[line.id])
      .map((line: Line) => {
        const lineMetricWrapper: MetricWrapper = lineMetricDataset[
          line.id
        ] as MetricWrapper;

        return lineMetricWrapper;
      });

    // Add line data: for each line, get all line metric and add to CSV.
    linesData.forEach((lineMetricWrapper: MetricWrapper) => {
      lineMetricWrapper.metrics.forEach((metric: Metric) => {
        const {
          year,
          month,
          line_name,
          est_wkday_ridership,
          est_sat_ridership,
          est_sun_ridership,
        } = metric;

        const friendly_line_name = getLineName(Number(line_name));

        const row: string = `${friendly_line_name},${year},${month},${est_wkday_ridership},${est_sat_ridership},${est_sun_ridership}`;
        csvContent += row + '\r\n';
      });
    });

    const encodedUri: string = encodeURI(csvContent);
    return encodedUri;
  };

  return (
    /* Styled as flexbox so overflow scroll container stretches full height */
    <div
      className={
        'flex flex-col gap-4 w-full ' +
        (expanded ? 'max-h-full' : 'max-h-[75vh]')
      }
    >
      {/* Expand button */}
      <button
        onClick={onExpandClick}
        className="self-end bg-transparent border-none hover:opacity-80 p-0"
      >
        {expanded ? (
          <Image
            src="/pin-left.svg"
            alt="Hide"
            height={16}
            width={16}
            unoptimized
          />
        ) : (
          <Image
            src="/pin-right.svg"
            alt="Expand"
            height={16}
            width={16}
            unoptimized
          />
        )}
      </button>

      <Filters
        setLines={setLines}
        searchText={searchText}
        setSearchText={setSearchText}
        clearSelections={clearSelections}
        selectAllVisibleLines={selectAllVisibleLines}
      ></Filters>

      {/* Overflow scroll container */}
      <div className="overflow-y-auto">
        <table className="text-sm w-full">
          {/* Only show table header when line selector is expanded */}
          {expanded && (
            <thead>
              <tr>
                {columnHeaderStates.map(
                  (columnHeaderState: ColumnHeaderState, index: number) => {
                    let classNames: string = 'cursor-pointer p-2';

                    if (columnHeaderState.sortDirection === 'asc') {
                      classNames = `${classNames} headerSortUp`;
                    } else if (columnHeaderState.sortDirection === 'desc') {
                      classNames = `${classNames} headerSortDown`;
                    }

                    return (
                      <th
                        key={index}
                        className={
                          'sticky top-0 bg-[rgba(0,0,0,0.1)] max-w-24 text-left ' +
                          classNames
                        }
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

      <a
        href={csvDownload()}
        download="metro_ridership.csv"
        className="button flex gap-2 items-center justify-center"
      >
        Download selected data as CSV
        <Image
          src="/download.svg"
          height={16}
          width={16}
          alt=""
          unoptimized
          className="recolor-white"
        />
      </a>
    </div>
  );
}
