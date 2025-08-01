import { useMemo, useState } from 'react';
import { calcAbsChange, calcAvg, calcStart, calcEnd } from '../utils/calc';
import { getLineNames, lineNameSortFunction } from '../utils/lines';
import type { Line, LineJson } from '../@types/lines.types';
import type {
  ConsolidatedRecord,
  ConsolidatedRidership,
} from '../@types/metrics.types';
import LineJsonData from '../data/metro_line_metadata_current.json';

export interface UserDashboardInputState {
  startDate: Date;
  setStartDate: React.Dispatch<React.SetStateAction<Date>>;

  endDate: Date;
  setEndDate: React.Dispatch<React.SetStateAction<Date>>;

  dayOfWeek: DayOfWeek;
  setDayOfWeek: React.Dispatch<React.SetStateAction<DayOfWeek>>;

  lines: Line[];
  setLines: React.Dispatch<React.SetStateAction<Line[]>>;

  searchText: string;
  setSearchText: React.Dispatch<React.SetStateAction<string>>;

  visibleLines: Line[];

  isAggregateVisible: boolean;
  toggleIsAggregateVisible: () => void;

  onToggleSelectLine: (line: Line) => void;
  clearSelections: () => void;
  updateLinesWithLineMetrics: (ridershipByLine: ConsolidatedRidership) => void;
  selectAllVisibleLines: () => void;
}

// Object const instead of enum for TS 5.8
// https://www.typescriptlang.org/docs/handbook/enums.html#objects-vs-enums
export const daysOfWeek = {
  Weekday: 'est_wkday_ridership',
  Saturday: 'est_sat_ridership',
  Sunday: 'est_sun_ridership',
} as const;
export type DayOfWeek = (typeof daysOfWeek)[keyof typeof daysOfWeek];

/**
 * Default starting values
 */
const DefaultStartDate: Date = new Date(2020, 4);
const DefaultEndDate: Date = new Date(2024, 4);

const createLinesData = (): Line[] => {
  return (LineJsonData as LineJson[])
    .map((line: LineJson) => {
      return {
        ...line,
        id: line.line,
        name: getLineNames(line.line).current,
        former: getLineNames(line.line).former,
        selected: false,
        visible: true,
      } as Line;
    })
    .sort(lineNameSortFunction);
};

/**
 * Contains selected user inputs like bus lines and starting date.
 * @returns
 */
const useUserDashboardInput = (): UserDashboardInputState => {
  const [startDate, setStartDate] = useState<Date>(DefaultStartDate);
  const [endDate, setEndDate] = useState<Date>(DefaultEndDate);
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>(daysOfWeek.Weekday);

  const [lines, setLines] = useState<Line[]>(createLinesData);
  const [searchText, setSearchText] = useState<string>('');

  const [isAggregateVisible, setIsAggregateVisible] = useState<boolean>(false);

  /**
   * Use the aggregated metrics to add additional metrics to line metadata
   * @param ridershipByLine
   */
  const updateLinesWithLineMetrics = (
    ridershipByLine: ConsolidatedRidership,
  ): void => {
    setLines((prevLines: Line[]): Line[] =>
      prevLines.map((prevLine: Line) => {
        const updatedLine: Line = { ...prevLine };

        // Check if ridership metrics exist for line
        const consolidatedRecord: ConsolidatedRecord | undefined =
          ridershipByLine[updatedLine.id];

        if (!consolidatedRecord) {
          updatedLine.averageRidership = undefined;
          updatedLine.changeInRidership = undefined;

          return updatedLine;
        }

        // Calculate metrics for each line
        updatedLine.averageRidership = calcAvg(
          consolidatedRecord.ridershipRecords,
          dayOfWeek,
        );

        updatedLine.changeInRidership = calcAbsChange(
          consolidatedRecord.ridershipRecords,
          dayOfWeek,
        );

        updatedLine.startingRidership = calcStart(
          consolidatedRecord.ridershipRecords,
          dayOfWeek,
        );

        updatedLine.endingRidership = calcEnd(
          consolidatedRecord.ridershipRecords,
          dayOfWeek,
        );

        return updatedLine;
      }),
    );
  };

  const isVisibleLine = (line: Line): boolean => {
    if (searchText) {
      const searchTextLower = searchText.toLocaleLowerCase();
      const visible: boolean = line.name
        .toLocaleLowerCase()
        .includes(searchTextLower);

      if (!visible) {
        return false;
      }
    }

    return !!line.averageRidership && !!line.changeInRidership && line.visible;
  };

  const visibleLines = useMemo(
    () => lines.filter(isVisibleLine),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(lines), searchText],
  );

  const selectAllVisibleLines = (): void => {
    setLines((prevLines: Line[]) => {
      return prevLines.map((prevLine: Line) => {
        const isLineVisible: boolean = isVisibleLine(prevLine);

        return { ...prevLine, selected: isLineVisible || prevLine.selected };
      });
    });
  };

  const onToggleSelectLine = (line: Line): void => {
    setLines((prevLines: Line[]) => {
      const updatedLines = [...prevLines];

      // Update checkbox value
      const updateIndex = updatedLines.findIndex(
        (updatedLine: Line) => updatedLine.id === line.id,
      );
      const updatedLine: Line = { ...prevLines[updateIndex] };
      updatedLine.selected = !updatedLine.selected;
      updatedLines[updateIndex] = updatedLine;

      return updatedLines;
    });
  };

  const clearSelections = (): void => {
    setLines((prevLines: Line[]): Line[] => {
      return prevLines.map((prevLine) => {
        return { ...prevLine, selected: false } as Line;
      });
    });
  };

  const toggleIsAggregateVisible = (): void => {
    setIsAggregateVisible(
      (prevIsAggregateVisible: boolean) => !prevIsAggregateVisible,
    );
  };

  return {
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    dayOfWeek,
    setDayOfWeek,
    lines,
    setLines,
    visibleLines,
    isAggregateVisible,
    toggleIsAggregateVisible,
    searchText,
    setSearchText,
    onToggleSelectLine,
    clearSelections,
    updateLinesWithLineMetrics,
    selectAllVisibleLines,
  };
};

export default useUserDashboardInput;
