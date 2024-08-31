'use client';

import { Label } from '@radix-ui/react-label';
import { DayOfWeek } from '../hooks/useUserDashboardInput';
import { useEffect, useState } from 'react';
import "./input_components.css"

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


useEffect (() => {
  // this sets year and month values on load

  const start_month = document.getElementById('StartMonth');
  const start_year = document.getElementById('StartYear');
  const end_month = document.getElementById('EndMonth');
  const end_year = document.getElementById('EndYear');

  start_month.value = startDate.getMonth();
  start_year.value = startDate.getYear() + 1900;
  end_month.value = endDate.getMonth();
  end_year.value = endDate.getYear() + 1900;

  var radiobtn = document.getElementById("est_wkday_ridership");
  radiobtn.checked = true;

}, [])

  // const getValueDateString = (date: Date): string => {
  //   console.log(date);
  //   const year = date.getFullYear();
  //   const month = date
  //     .getMonth()
  //     .toLocaleString('en-US', { minimumIntegerDigits: 2, useGrouping: false });
  //   const day = date
  //     .getDay()
  //     .toLocaleString('en-US', { minimumIntegerDigits: 2, useGrouping: false });

  //   return `${year}-${month}-${day}`;
  // };

  // const onDayOfWeekChange = (value: string): void => {
  //   switch (value) {
  //     case DayOfWeek.Saturday:
  //       setDayOfWeek(DayOfWeek.Saturday);
  //       break;
  //     case DayOfWeek.Sunday:
  //       setDayOfWeek(DayOfWeek.Sunday);
  //       break;
  //     case DayOfWeek.Weekday:
  //       setDayOfWeek(DayOfWeek.Weekday);
  //       break;
  //     default:
  //       console.error('Cannot support day of week:' + dayOfWeek);
  //   }
  // };


  const getDateSetter = (
    intervalEndpoint: IntervalEndpoint,
  ): React.Dispatch<React.SetStateAction<Date>> => {

    console.log('dates', endDate, startDate)
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

  const updateMonth = (
    range: Date,
    title: IntervalEndpoint,
    newMonth: string,
  ) => {
    // update month state
    const setDate = getDateSetter(title);

    // Requires updater function.
    setDate((prevDate: Date) => {
      const newDate: Date = new Date(prevDate);
      newDate.setMonth(Number(newMonth));

      console.log('new month date', title, newDate);

      // Update form value (should be side effect)
      

      const form = (document.getElementById(title + 'Month') as HTMLInputElement);
      form.value = newDate.getMonth() 

      return newDate;
    });
  };

  const updateYear = (
    range: Date,
    title: IntervalEndpoint,
    newYear: string,
  ) => {
    // need to add filter to make sure from is not larger than the "to" date
    if (true) {
      // update year state
      const setDate = getDateSetter(title);

      // Requires updater function.
      setDate((prevDate: Date) => {
        const newDate: Date = new Date(prevDate);
        newDate.setFullYear(newYear);

        console.log('new year date', title, newDate);

        // update form value (should be side effect)
        const form = document.getElementById(title + 'Year');
        const yearNum = newDate.getFullYear();
        form.value = yearNum;

        return newDate;
      });
    } else {
      console.log('year not valid');
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
                updateMonth(range, title, e.target.value);
              }}
              id={title + 'Month'}
              name="month"
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
                updateYear(range, title, e.target.value);
              }}
              id={title + 'Year'}
              name="year"
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
          {dateForm(startDate,  'Start')}
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
