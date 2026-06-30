import { useMemo, useState, useEffect } from 'react';
import { calcAbsChange, calcAvg, calcStart, calcEnd, calcRidersPerMile } from '../utils/calc';
import { getLineNames, lineNameSortFunction } from '../utils/lines';
import {
  parseMonthParam,
  formatMonthParam,
  dayOfWeekToParam,
  paramToDayOfWeek,
  parseModesFromParams,
} from '../utils/queryParams';
import type { Line, LineJson } from '../@types/lines.types';
import {
  daysOfWeek,
  type DayOfWeek,
  type ConsolidatedRecord,
  type ConsolidatedRidership,
} from '../@types/metrics.types';

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

  visibleLines: Line[];

  isAggregateVisible: boolean;
  toggleIsAggregateVisible: () => void;

  onToggleSelectLine: (line: Line) => void;
  clearSelections: () => void;
  updateLinesWithLineMetrics: (ridershipByLine: ConsolidatedRidership) => void;
  selectAllVisibleLines: () => void;
}


/**
 * Default starting values
 */
const DefaultStartDate: Date = new Date(2020, 6);
const DefaultEndDate: Date = dataDefaultEndDate;

const createLinesData = (selectedLineIds: number[], modes: string[]): Line[] => {
  const busVis = modes.includes('bus');
  const trainVis = modes.includes('train');

  return (LineJsonData as LineJson[])
    .map((line: LineJson) => {
      let visible = false;
      if (line.mode === 'Bus') visible = busVis;
      else if (line.mode === 'Rail') visible = trainVis;

      return {
        ...line,
        id: line.line,
        name: getLineNames(line.line).current,
        former: getLineNames(line.line).former,
        selected: selectedLineIds.includes(line.line),
        visible,
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
    return createLinesData(selectedIds, parseModesFromParams(params));
  });

  const [isAggregateVisible, setIsAggregateVisible] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('aggregate') === '1';
  });

  // Sync modes → line visibility
  useEffect(() => {
    const busVis = modes.includes('bus');
    const trainVis = modes.includes('train');

    setLines((prevLines) =>
      prevLines.map((prevLine) => {
        let visible = false;
        if (prevLine.mode === 'Bus') visible = busVis;
        else if (prevLine.mode === 'Rail') visible = trainVis;
        return { ...prevLine, visible };
      }),
    );
  }, [modes]);

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

    window.history.replaceState(null, '', `?${params.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, dayOfWeek, searchText, modes, JSON.stringify(lines), isAggregateVisible]);

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
        const avgRidership = calcAvg(consolidatedRecord.ridershipRecords, dayOfWeek);
        updatedLine.averageRidership = avgRidership;

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

        if (updatedLine.distanceMiles) {
          updatedLine.ridersPerMile = calcRidersPerMile(avgRidership, updatedLine.distanceMiles);
        }

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
    modes,
    setModes,
    onToggleSelectLine,
    clearSelections,
    updateLinesWithLineMetrics,
    selectAllVisibleLines,
  };
};

export default useUserDashboardInput;
