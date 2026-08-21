import { useState, useEffect, useCallback } from 'react';
import { getLineNames, lineNameSortFunction } from '../utils/lines';
import {
  parseMonthParam,
  formatMonthParam,
  dayOfWeekToParam,
  paramToDayOfWeek,
  parseModesFromParams,
  parseStopKeysParam,
  parseStopMeasureParam,
} from '../utils/queryParams';
import type { Line, LineJson } from '../@types/lines.types';
import type { StopMeasure } from '../@types/stops.types';
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

  /** Whether the stop panel is on. `stops=1`. */
  showStops: boolean;
  toggleShowStops: () => void;

  /** Which figure the panel ranks, sizes and draws by. `measure=offs|both`. */
  stopMeasure: StopMeasure;
  setStopMeasure: React.Dispatch<React.SetStateAction<StopMeasure>>;

  /**
   * Every stop the chart draws, in selection order — colour comes from position, so the
   * order has to hold still. `stop=`.
   */
  selectedStopKeys: string[];

  /** Narrows the table by stop name, and with it what `Select All` reaches. `stopq=`. */
  stopSearchText: string;
  setStopSearchText: React.Dispatch<React.SetStateAction<string>>;

  onToggleSelectLine: (line: Line) => void;
  clearSelections: () => void;
  selectAllListedLines: (ids: number[]) => void;

  onToggleSelectStop: (key: string) => void;
  clearStopSelections: () => void;
  selectAllListedStops: (keys: string[]) => void;
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

  /**
   * Each stop-panel slice seeds itself from the URL here and the effect below writes it
   * back, because a slice that skips either half stops being shareable (`CLAUDE.md`).
   */
  const [showStops, setShowStops] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('stops') === '1';
  });

  const [stopMeasure, setStopMeasure] = useState<StopMeasure>(() => {
    const params = new URLSearchParams(window.location.search);
    return parseStopMeasureParam(params.get('measure')) ?? 'ons';
  });

  const [selectedStopKeys, setSelectedStopKeys] = useState<string[]>(() => {
    const params = new URLSearchParams(window.location.search);
    return parseStopKeysParam(params.get('stop'));
  });

  const [stopSearchText, setStopSearchText] = useState<string>(() => {
    return new URLSearchParams(window.location.search).get('stopq') ?? '';
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
    if (showStops) params.set('stops', '1');
    if (stopMeasure !== 'ons') params.set('measure', stopMeasure);
    if (selectedStopKeys.length > 0)
      params.set('stop', selectedStopKeys.join(','));
    if (stopSearchText) params.set('stopq', stopSearchText);

    window.history.replaceState(null, '', `?${params.toString()}`);
  }, [
    startDate,
    endDate,
    dayOfWeek,
    searchText,
    modes,
    lines,
    isAggregateVisible,
    showContextLogs,
    showStops,
    stopMeasure,
    selectedStopKeys,
    stopSearchText,
  ]);

  /*
   * Every mutator below is `useCallback`ed so its identity holds still, because the
   * ~800-row stop table re-renders whenever a callback it receives is new.
   */

  /**
   * Select every row the table is currently showing, on top of whatever is already
   * selected. The hook cannot re-derive which rows those are — the rule needs Line
   * Readouts, which live in App — so it takes the displayed ids instead.
   */
  const selectAllListedLines = useCallback((ids: number[]): void => {
    const listed = new Set(ids);
    setLines((prevLines) =>
      prevLines.map((prevLine) => ({
        ...prevLine,
        selected: listed.has(prevLine.id) || prevLine.selected,
      })),
    );
  }, []);

  const onToggleSelectLine = useCallback((line: Line): void => {
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
  }, []);

  const clearSelections = useCallback((): void => {
    setLines((prevLines: Line[]): Line[] => {
      return prevLines.map((prevLine) => {
        return { ...prevLine, selected: false } as Line;
      });
    });
  }, []);

  /**
   * `Select All` adds only the rows the search lists, while `Clear All` clears everything —
   * the same asymmetry the line mutators have.
   */
  const selectAllListedStops = useCallback((keys: string[]): void => {
    setSelectedStopKeys((prevKeys) => {
      const selected = new Set(prevKeys);
      // New keys go on the end, because inserting one in the middle would recolour the
      // series already drawn.
      return [...prevKeys, ...keys.filter((key) => !selected.has(key))];
    });
  }, []);

  const onToggleSelectStop = useCallback((key: string): void => {
    setSelectedStopKeys((prevKeys) =>
      prevKeys.includes(key)
        ? prevKeys.filter((prevKey) => prevKey !== key)
        : [...prevKeys, key],
    );
  }, []);

  const clearStopSelections = useCallback((): void => {
    setSelectedStopKeys([]);
  }, []);

  const toggleIsAggregateVisible = useCallback((): void => {
    setIsAggregateVisible(
      (prevIsAggregateVisible: boolean) => !prevIsAggregateVisible,
    );
  }, []);

  const toggleShowContextLogs = useCallback((): void => {
    setShowContextLogs((prevShowContextLogs: boolean) => !prevShowContextLogs);
  }, []);

  const toggleShowStops = useCallback((): void => {
    setShowStops((prevShowStops: boolean) => !prevShowStops);
  }, []);

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
    showStops,
    toggleShowStops,
    stopMeasure,
    setStopMeasure,
    selectedStopKeys,
    stopSearchText,
    setStopSearchText,
    searchText,
    setSearchText,
    modes,
    setModes,
    onToggleSelectLine,
    clearSelections,
    selectAllListedLines,
    onToggleSelectStop,
    clearStopSelections,
    selectAllListedStops,
  };
};

export default useUserDashboardInput;
