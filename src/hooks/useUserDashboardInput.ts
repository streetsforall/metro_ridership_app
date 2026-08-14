import { useState, useEffect } from 'react';
import { getLineNames, lineNameSortFunction } from '../utils/lines';
import {
  parseMonthParam,
  formatMonthParam,
  dayOfWeekToParam,
  paramToDayOfWeek,
  parseModesFromParams,
} from '../utils/queryParams';
import type { Line, LineJson } from '../@types/lines.types';
import { daysOfWeek, type DayOfWeek } from '../@types/metrics.types';

export { daysOfWeek, type DayOfWeek };
import LineJsonData from '../data/metro_line_metadata_current.json';
import LineDistances from '../data/line_distances.json';
import { dataDefaultEndDate } from '../utils/dataDateRange';

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

  modes: string[];
  setModes: React.Dispatch<React.SetStateAction<string[]>>;

  isAggregateVisible: boolean;
  toggleIsAggregateVisible: () => void;

  showContextLogs: boolean;
  toggleShowContextLogs: () => void;

  onToggleSelectLine: (line: Line) => void;
  clearSelections: () => void;
  selectAllListedLines: (ids: number[]) => void;
}


/**
 * Default starting values
 */
const DefaultStartDate: Date = new Date(2020, 6);
const DefaultEndDate: Date = dataDefaultEndDate;

const createLinesData = (selectedLineIds: number[]): Line[] => {
  return (LineJsonData as LineJson[])
    .map((line: LineJson) => {
      return {
        ...line,
        id: line.line,
        name: getLineNames(line.line).current,
        former: getLineNames(line.line).former,
        selected: selectedLineIds.includes(line.line),
        distanceMiles: (LineDistances as Record<string, number>)[String(line.line)],
      } as Line;
    })
    .sort(lineNameSortFunction);
};

/**
 * Contains selected user inputs like bus lines and starting date.
 * @returns
 */
const useUserDashboardInput = (): UserDashboardInputState => {
  const [startDate, setStartDate] = useState<Date>(() => {
    const val = new URLSearchParams(window.location.search).get('start');
    return val ? (parseMonthParam(val) ?? DefaultStartDate) : DefaultStartDate;
  });

  const [endDate, setEndDate] = useState<Date>(() => {
    const val = new URLSearchParams(window.location.search).get('end');
    return val ? (parseMonthParam(val) ?? DefaultEndDate) : DefaultEndDate;
  });

  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>(() => {
    const val = new URLSearchParams(window.location.search).get('day');
    return val ? ((paramToDayOfWeek[val] ?? daysOfWeek.Weekday) as DayOfWeek) : daysOfWeek.Weekday;
  });

  const [searchText, setSearchText] = useState<string>(() => {
    return new URLSearchParams(window.location.search).get('q') ?? '';
  });

  const [modes, setModes] = useState<string[]>(() => {
    return parseModesFromParams(new URLSearchParams(window.location.search));
  });

  const [lines, setLines] = useState<Line[]>(() => {
    const params = new URLSearchParams(window.location.search);
    const linesStr = params.get('lines');
    const selectedIds = linesStr
      ? linesStr.split(',').map(Number).filter((id) => !isNaN(id))
      : [];
    return createLinesData(selectedIds);
  });

  const [isAggregateVisible, setIsAggregateVisible] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('aggregate') === '1';
  });

  const [showContextLogs, setShowContextLogs] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('logs') === '1';
  });

  // Sync state → URL query params
  useEffect(() => {
    const params = new URLSearchParams();

    params.set('start', formatMonthParam(startDate));
    params.set('end', formatMonthParam(endDate));
    params.set('day', dayOfWeekToParam[dayOfWeek]);

    const selectedIds = lines.filter((l) => l.selected).map((l) => l.id);
    if (selectedIds.length > 0) params.set('lines', selectedIds.join(','));

    if (searchText) params.set('q', searchText);
    if (!modes.includes('bus')) params.set('buses', '0');
    if (!modes.includes('train')) params.set('trains', '0');
    if (isAggregateVisible) params.set('aggregate', '1');
    if (showContextLogs) params.set('logs', '1');

    window.history.replaceState(null, '', `?${params.toString()}`);
  }, [startDate, endDate, dayOfWeek, searchText, modes, lines, isAggregateVisible, showContextLogs]);

  /**
   * Select every row the table is currently showing, on top of whatever is already
   * selected. The hook cannot re-derive which rows those are — the rule needs Line
   * Readouts, which live in App — so it takes the displayed ids instead.
   */
  const selectAllListedLines = (ids: number[]): void => {
    const listed = new Set(ids);
    setLines((prevLines) =>
      prevLines.map((prevLine) => ({
        ...prevLine,
        selected: listed.has(prevLine.id) || prevLine.selected,
      })),
    );
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

  const toggleShowContextLogs = (): void => {
    setShowContextLogs((prevShowContextLogs: boolean) => !prevShowContextLogs);
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
    isAggregateVisible,
    toggleIsAggregateVisible,
    showContextLogs,
    toggleShowContextLogs,
    searchText,
    setSearchText,
    modes,
    setModes,
    onToggleSelectLine,
    clearSelections,
    selectAllListedLines,
  };
};

export default useUserDashboardInput;
