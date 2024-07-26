import { Label } from '@radix-ui/react-label';
import { DayOfWeek } from '../hooks/useUserDashboardInput';
import { Badge, RadioGroup } from '@radix-ui/themes';
import * as Select from '@radix-ui/react-select';
import { FieldValues, UseFormRegister } from 'react-hook-form';
import { Inputs } from '../charts/page';

export interface DateRangeSelectorProps {
  startDate: Date;
  setStartDate: React.Dispatch<React.SetStateAction<Date>>;

  endDate?: Date;
  setEndDate?: React.Dispatch<React.SetStateAction<Date>>;

  dayOfWeek: DayOfWeek;
  setDayOfWeek: React.Dispatch<React.SetStateAction<DayOfWeek>>;

  register: UseFormRegister<Inputs>;
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
  register,
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

  const isDateRange = startDate && endDate;
  console.log('start date value: ' + getValueDateString(startDate));

  return (
    <div>
      <div id="dateRangeSelector">
        <div>
          <Label>From</Label>
          <input
            type="date"
            id="start"
            name="trip-start"
            value={getValueDateString(startDate)}
            min="2018-01-01"
            max="2018-12-31"
          />
          <div>
            <Badge id="startDateValue" variant="outline">
              {getMonthYearString(startDate)}
            </Badge>
          </div>

          {/* <div id="startDateValue">{GetMonthYearString(startDate)}</div> */}
        </div>
        <div className="arrow"></div>
        <div>
          <Label>To</Label>
          <div>
            <Badge id="endDateValue" variant="outline">
              {getMonthYearString(endDate)}
            </Badge>
          </div>
        </div>
      </div>
      <div id="dayOfWeekSelector">
        {/* <Label>Day of Week</Label>
        <Select.Root defaultValue="apple">
          <Select.Trigger />
          <Select.Content>
            <Select.Item value="apple">Apple</Select.Item>
            <Select.Item value="orange">Orange</Select.Item>
          </Select.Content>
        </Select.Root> */}

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
                    {...register('stat')}
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
