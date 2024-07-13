import { useEffect, useState } from "react";

export interface MetroDashboardState {
    startDate: Date;
    setStartDate: React.Dispatch<
        React.SetStateAction<Date>
    >;

    endDate: Date;
    setEndDate: React.Dispatch<
        React.SetStateAction<Date>
    >;

    dayOfWeek: DayOfWeek;
    setDayOfWeek: React.Dispatch<
        React.SetStateAction<DayOfWeek>
    >;

    line: Line;
    setLine: React.Dispatch<
        React.SetStateAction<Line>
    >;
}

export type Line = string;

export enum DayOfWeek
{
    Weekday = 1,
    Saturday = 2,
    Sunday = 3,
};

/**
 * Default starting values
 */
const DefaultStartDate: Date = new Date(2022, 3, 1);
const DefaultEndDate: Date = new Date(2023, 3, 1);
const DefaultLine: Line[] = ["123"];

/**
 * Contains selected user inputs like bus lines and starting date.
 * @returns 
 */
const useMetroDashboard = (): MetroDashboardState => {
    const [startDate, setStartDate] = useState<Date>(DefaultStartDate);
    const [endDate, setEndDate] = useState<Date>(DefaultEndDate);
    const [dayOfWeek, setDayOfWeek] =
        useState<DayOfWeek>(DayOfWeek.Weekday);

    const [line, setLine] = useState<Line[]>(DefaultLine);

    return {
        startDate,
        setStartDate,
        endDate,
        setEndDate,
        dayOfWeek,
        setDayOfWeek,
        line,
        setLine,
    };
};

export default useMetroDashboard;