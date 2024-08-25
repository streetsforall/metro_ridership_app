import { useState } from 'react';
import { Line } from '../common/types';
import * as LineJsonData from '../data/metro_line_metadata_current.json';

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
  onToggleSelectLine: (line: Line) => void;
}

export enum DayOfWeek {
  Weekday = 'est_wkday_ridership',
  Saturday = 'est_sat_ridership',
  Sunday = 'est_sun_ridership',
}

/**
 * Default starting values
 */
const DefaultStartDate: Date = new Date(2020, 1);
const DefaultEndDate: Date = new Date(2023, 1);
const DefaultLine: Line[] = [];

const createLinesData = (): Line[] => {
  return (LineJsonData as LineJson[]).map((line: LineJson) => {
    return {
      ...line,
      id: line.line,
      selected: false,
    } as Line;
  });
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

  return {
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    dayOfWeek,
    setDayOfWeek,
    lines,
    onToggleSelectLine,
  };
};

export default useUserDashboardInput;
