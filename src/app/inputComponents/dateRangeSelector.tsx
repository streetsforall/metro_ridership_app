'use client';

import * as RadioGroup from '@radix-ui/react-radio-group';
import { DayOfWeek } from '../hooks/useUserDashboardInput';

export interface DateRangeSelectorProps {
  startDate: Date;
  setStartDate: React.Dispatch<React.SetStateAction<Date>>;

  endDate: Date;
  setEndDate: React.Dispatch<React.SetStateAction<Date>>;

  dayOfWeek: DayOfWeek;
  setDayOfWeek: React.Dispatch<React.SetStateAction<DayOfWeek>>;

  visibleLines: Array<any>;
}

type IntervalEndpoint = 'start' | 'end';

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
    if (intervalEndpoint === 'end') {
      return setEndDate;
    } else if (intervalEndpoint === 'start') {
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
        newDate.setFullYear(Number(newYear));

        console.log('new year date', title, newDate);

        return newDate;
      });
    }
  };

  const dateForm = (
    range: Date,
    intervalEndpoint: IntervalEndpoint,
    title: string,
  ) => {
    return (
      <fieldset className="flex gap-2 items-start">
        <legend>{title}</legend>

        <label htmlFor={`${intervalEndpoint}-month`} className="sr-only">
          Month
        </label>
        <select
          onChange={(e) => {
            updateMonth(intervalEndpoint, e.target.value);
          }}
          id={`${intervalEndpoint}-month`}
          name={`${intervalEndpoint}-month`}
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

        <label htmlFor={`${intervalEndpoint}-year`} className="sr-only">
          Year
        </label>
        <select
          onChange={(e) => {
            updateYear(intervalEndpoint, e.target.value);
          }}
          id={`${intervalEndpoint}-year`}
          name={`${intervalEndpoint}-year`}
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
      </fieldset>
    );
  };

  return (
    <div className="flex flex-col sm:flex-row flex-wrap gap-x-16 gap-y-6">
      {dateForm(startDate, 'start', 'Start')}
      {dateForm(endDate, 'end', 'End')}

      <fieldset>
        <legend>Day of Week</legend>

        <RadioGroup.Root
          className="flex flex-col sm:flex-row gap-4"
          aria-label="View density"
          value={dayOfWeek}
          onValueChange={(v) => {
            setDayOfWeek(v as DayOfWeek);
          }}
        >
          {Object.entries(DayOfWeek).map(([name, key]) => {
            return (
              <div key={key} className="flex items-center">
                <RadioGroup.Item
                  value={key}
                  className="bg-white cursor-default p-0 rounded-full size-[20px]"
                  id={key}
                >
                  <RadioGroup.Indicator className="relative flex items-center justify-center size-full after:block after:size-[12px] after:rounded-full after:bg-[#033056]" />
                </RadioGroup.Item>

                <label className="pl-2" htmlFor={key}>
                  {name}
                </label>
              </div>
            );
          })}
        </RadioGroup.Root>
      </fieldset>
    </div>
  );
}
