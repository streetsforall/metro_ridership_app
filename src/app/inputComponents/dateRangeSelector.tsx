'use client';

import { Label } from '@radix-ui/react-label';
import { DayOfWeek } from '../hooks/useUserDashboardInput';
import './input_components.css';

export interface DateRangeSelectorProps {
  startDate: Date;
  setStartDate: React.Dispatch<React.SetStateAction<Date>>;

  endDate: Date;
  setEndDate: React.Dispatch<React.SetStateAction<Date>>;

  dayOfWeek: DayOfWeek;
  setDayOfWeek: React.Dispatch<React.SetStateAction<DayOfWeek>>;
}

type IntervalEndpoint = 'Start' | 'End';

export default function DateRangeSelector({
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  dayOfWeek,
  setDayOfWeek,
}: DateRangeSelectorProps) {
  const getMonthYearString = (date: Date): string => {
    const monthName: (date?: number | Date | undefined) => string =
      new Intl.DateTimeFormat('en-US', {
        month: 'long',
      }).format;
    var month = monthName(date); // ex: "July"

    return `${month} ${date?.getFullYear()}`;
  };

  const getDateSetter = (
    intervalEndpoint: IntervalEndpoint,
  ): React.Dispatch<React.SetStateAction<Date>> => {
    console.log('dates', endDate, startDate);
    if (intervalEndpoint === 'End') {
      return setEndDate;
    } else if (intervalEndpoint === 'Start') {
      return setStartDate;
    } else {
      const errorMessage =
        'Cannot support interval endpoint type: ' + intervalEndpoint;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }
  };

  const updateMonth = (title: IntervalEndpoint, newMonth: string) => {
    // update month state
    const setDate = getDateSetter(title);

    // Requires updater function.
    setDate((prevDate: Date) => {
      const newDate: Date = new Date(prevDate);
      newDate.setMonth(Number(newMonth));

      console.log('new month date', title, newDate);

      return newDate;
    });
  };

  const updateYear = (title: IntervalEndpoint, newYear: string) => {
    // need to add filter to make sure from is not larger than the "to" date
    if (true) {
      // update year state
      const setDate = getDateSetter(title);

      // Requires updater function.
      setDate((prevDate: Date) => {
        const newDate: Date = new Date(prevDate);
        newDate.setFullYear(newYear);

        console.log('new year date', title, newDate);

        return newDate;
      });
    }
  };

  const dateForm = (range: Date, title: IntervalEndpoint) => {
    return (
      <>
        <div id={title + 'Form'}>
          <span>
            <label>Month: </label>
            <select
              onChange={(e) => {
                updateMonth(title, e.target.value);
              }}
              id={title + 'Month'}
              name="month"
              value={range.getMonth()}
            >
              <option value="0">January</option>
              <option value="1">February</option>
              <option value="2">March</option>
              <option value="3">April</option>
              <option value="4">May</option>
              <option value="5">June</option>
              <option value="6">July</option>
              <option value="7">August</option>
              <option value="8">September</option>
              <option value="9">October</option>
              <option value="10">November</option>
              <option value="11">December</option>
            </select>
          </span>
          <span>
            <label>Year: </label>
            <select
              onChange={(e) => {
                updateYear(title, e.target.value);
              }}
              id={title + 'Year'}
              name="year"
              value={range.getFullYear()}
            >
              <option>2009</option>
              <option>2010</option>
              <option>2011</option>
              <option>2012</option>
              <option>2013</option>
              <option>2014</option>
              <option>2015</option>
              <option>2016</option>
              <option>2017</option>
              <option>2018</option>
              <option>2019</option>
              <option>2020</option>
              <option>2021</option>
              <option>2022</option>
              <option>2023</option>
              <option>2024</option>
            </select>
          </span>
        </div>
      </>
    );
  };

  return (
    <div id="dateSelector">
      <div id="dateRangeSelector">
        <div className="dateRange">
          <Label>From</Label>
          {dateForm(startDate, 'Start')}
        </div>
        <div className="arrow"></div>
        <div className="dateRange">
          <Label>To</Label>
          {dateForm(endDate, 'End')}
        </div>
      </div>
      <div id="dayOfWeekSelector">
        <div>
          <Label>Day of Week</Label>
          <ul className="max-h-48 overflow-y-scroll">
            {Object.entries(DayOfWeek).map(([name, key]) => {
              return (
                <li key={key} className="flex gap-2 items-center px-2">
                  <input
                    onClick={(e) => setDayOfWeek(e.target.value)}
                    name="day"
                    type="radio"
                    id={key}
                    value={key}
                  />
                  <label htmlFor={key}>{name}</label>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
