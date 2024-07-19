import { Label } from '@radix-ui/react-label';
import { DayOfWeek } from '../hooks/useUserDashboardInput';
import { Badge } from '@radix-ui/themes';
import * as Select from '@radix-ui/react-select';

export interface DateRangeSelectorProps {
  startDate: Date;
  setStartDate: React.Dispatch<React.SetStateAction<Date>>;

  endDate: Date;
  setEndDate: React.Dispatch<React.SetStateAction<Date>>;

  dayOfWeek: DayOfWeek;
  setDayOfWeek: React.Dispatch<React.SetStateAction<DayOfWeek>>;
}

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

    return `${month} ${date.getFullYear()}`;
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

  return (
    <div>
      <div id="dateRangeSelector">
        <div>
          <Label>From</Label>
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
        <Label>Day of Week</Label>
        <Select.Root defaultValue="apple">
          <Select.Trigger />
          <Select.Content>
            <Select.Item value="apple">Apple</Select.Item>
            <Select.Item value="orange">Orange</Select.Item>
          </Select.Content>
        </Select.Root>

        {/* <RadioGroup.Root
          value=""
          onValueChange={onDayOfWeekChange}
          name="example"
        >
          <RadioGroup.Item value={DayOfWeek.Weekday}>
            {DayOfWeek.Weekday}
          </RadioGroup.Item>
          <RadioGroup.Item value={DayOfWeek.Saturday}>
            {DayOfWeek.Saturday}
          </RadioGroup.Item>
          <RadioGroup.Item value={DayOfWeek.Sunday}>
            {DayOfWeek.Sunday}
          </RadioGroup.Item>
        </RadioGroup.Root> */}
      </div>
    </div>
  );
}
