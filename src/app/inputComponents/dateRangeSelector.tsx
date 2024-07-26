import { Label } from '@radix-ui/react-label';
import { DayOfWeek } from '../hooks/useUserDashboardInput';
import { Badge, RadioGroup } from '@radix-ui/themes';
import * as Select from '@radix-ui/react-select';
// import { FieldValues, UseFormRegister } from 'react-hook-form';
import { Inputs } from '../charts/page';
import { useEffect } from 'react';

export interface DateRangeSelectorProps {
  startDate: Date;
  setStartDate: React.Dispatch<React.SetStateAction<Date>>;

  endDate?: Date;
  setEndDate?: React.Dispatch<React.SetStateAction<Date>>;

  dayOfWeek: DayOfWeek;
  setDayOfWeek: React.Dispatch<React.SetStateAction<DayOfWeek>>;
}

const DayTypes = [
  {
    name: DayOfWeek.Weekday,
    key: 'est_wkday_ridership',
  },
  {
    name: DayOfWeek.Saturday,
    key: 'est_sat_ridership',
  },
  {
    name: DayOfWeek.Sunday,
    key: 'est_sun_ridership',
  },
];

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

  const getValueDateString = (date: Date): string => {
    console.log(date)
    const year = date.getFullYear();
    const month = date
      .getMonth()
      .toLocaleString('en-US', { minimumIntegerDigits: 2, useGrouping: false });
    const day = date
      .getDay()
      .toLocaleString('en-US', { minimumIntegerDigits: 2, useGrouping: false });

    return `${year}-${month}-${day}`;
  };

  const onDayOfWeekChange = (value: string): void => {
    switch (value) {
      case DayOfWeek.Saturday:
        setDayOfWeek(DayOfWeek.Saturday);
        break;
      case DayOfWeek.Sunday:
        setDayOfWeek(DayOfWeek.Sunday);
        break;
      case DayOfWeek.Weekday:
        setDayOfWeek(DayOfWeek.Weekday);
        break;
      default:
        console.error('Cannot support day of week:' + dayOfWeek);
    }
  };


  useEffect(() => {
    console.log(startDate)
  }, [startDate, endDate])



  const dateForm = (range, setRange, title) => {


    const updateMonth = newMonth => {
      // update month state
      range.setMonth(newMonth)
      setRange(range)
      // update form value
      const form = document.getElementById(title + 'Month');
      form.value = range.getMonth();
    }

    const updateYear = newYear => {

      // need to add filter to make sure from is not larger than the "to" date
      if (true) {
        // update month state
        range.setYear(newYear)
        setRange(range)
        // update form value
        const form = document.getElementById(title + 'Year');
        const yearNum = range.getFullYear()
        form.value = yearNum;
      } else {
        console.log('year not valid')
      }
    }


    return (
      <>
        <div id={title + 'Form'}>
          <h1>{range.toString()}</h1>
          <span>
            <label>Month:</label>
            <select defaultValue="1" onChange={e => updateMonth(e.target.value)} id={title + 'Month'} name="month">
              <option value="1" >January</option>
              <option value="2" >February</option>
              <option value="3">March</option>
              <option value="4">April</option>
              <option value="5">May</option>
              <option value="6">June</option>
              <option value="7">July</option>
              <option value="8">August</option>
              <option value="9">September</option>
              <option value="10">October</option>
              <option value="11" >November</option>
              <option value="12">December</option>
            </select>
          </span>
          <span>
            <label>Year:</label>
            <select defaultValue="1"  onChange={e => updateYear(Number(e.target.value))} id={title + 'Year'} name="year">
              <option >2009</option>
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
          </span >
        </div >
      </>
    )
  }

  const isDateRange = startDate && endDate;


  return (
    <div>
      <div id="dateRangeSelector">
        <div>
          <Label>From</Label>
          {/* <input
            type="month"
            id="start"
            name="trip-start"
            value={getValueDateString(startDate)}
            onChange={e => setStartDate(new Date(e.target.value))}
          /> */}

          {dateForm(startDate, setStartDate, 'Start')}


          {/* <div>
          <Badge id="startDateValue" variant="outline">
            {getMonthYearString(startDate)}
          </Badge>
        </div> */}

          {/* <div id="startDateValue">{GetMonthYearString(startDate)}</div> */}
        </div>
        <div className="arrow"></div>
        <div>
          <Label>To</Label>
          {/* <input
            type="month"
            id="end"
            name="trip-end"
            value={getValueDateString(endDate)}
            onChange={e => setEndDate(new Date(e.target.value))}
          /> */}
          {dateForm(endDate, setEndDate, 'End')}
          {/* <div>
          <Badge id="endDateValue" variant="outline">
            {getMonthYearString(endDate)}
          </Badge>
        </div> */}
        </div>
      </div>
      <div id="dayOfWeekSelector">

        <div>
          <Label>Day of Week</Label>
          <ul className="max-h-48 overflow-y-scroll">
            {DayTypes.map((dayType, index) => {
              return (
                <li key={dayType.key} className="flex gap-2 items-center px-2">
                  <input
                    type="radio"
                    id={dayType.key}
                    value={dayType.key}
                  />
                  <label htmlFor={dayType.key}>{dayType.name}</label>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
