import { useState } from 'react';
import { Line, lineNameSortFunction } from '../common/types';
import * as LineJsonData from '../data/metro_line_metadata_current.json';
import { LineMetricDataset, MetricWrapper } from '../page';
import { calcAbsChange, calcAvg } from '../inputComponents/calc';
import { getLineName } from '../common/lines';

interface LineJson {
  line: number;
  mode: string;
  provider: string;
}

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

  onToggleSelectLine: (line: Line) => void;
  updateLinesWithLineMetrics: (lineMetricDataset: LineMetricDataset) => void;
}

export enum DayOfWeek {
  Weekday = 'est_wkday_ridership',
  Saturday = 'est_sat_ridership',
  Sunday = 'est_sun_ridership',
}

/**
 * Default starting values
 */
const DefaultStartDate: Date = new Date(2020, 4);
const DefaultEndDate: Date = new Date(2024, 4);

const createLinesData = (): Line[] => {
  return (LineJsonData as LineJson[])
    .map((line: LineJson) => {

      console.log(line)
      return {
        ...line,
        id: line.line,
        name: getLineName(line.line),
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
  const [dayOfWeek, setDayOfWeek] = useState<DayOfWeek>(DayOfWeek.Weekday);

  const [lines, setLines] = useState<Line[]>(createLinesData);
  const [searchText, setSearchText] = useState<string>('');

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

  const updateLinesWithLineMetrics = (
    lineMetricDataset: LineMetricDataset,
  ): void => {
    setLines((prevLines: Line[]): Line[] => {
      return prevLines.map((prevLine: Line) => {
        const updatedLine: Line = { ...prevLine };

        // Check if metrics exist for line.
        const lineMetricWrapper: MetricWrapper | undefined =
          lineMetricDataset[updatedLine.id];
        if (!lineMetricWrapper) {
          updatedLine.averageRidership = undefined;
          updatedLine.changeInRidership = undefined;

          return updatedLine;
        }

        // Calculate metric data for each line.
        updatedLine.averageRidership = calcAvg(
          lineMetricWrapper.metrics,
          dayOfWeek,
        );
        updatedLine.changeInRidership = calcAbsChange(
          lineMetricWrapper.metrics,
          dayOfWeek,
        );

        return updatedLine;
      });
    });
  };

  console.log('dashboard lines', lines)

  return {
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    dayOfWeek,
    setDayOfWeek,
    lines,
    setLines,
    searchText,
    setSearchText,
    onToggleSelectLine,
    updateLinesWithLineMetrics,
  };
};

export default useUserDashboardInput;
