import { useState } from 'react';
import * as Checkbox from '@radix-ui/react-checkbox';
import * as RadioGroup from '@radix-ui/react-radio-group';
import checkIcon from '../assets/check.svg';
import { daysOfWeek, type DayOfWeek } from '../hooks/useUserDashboardInput';
import { dataMinYear, dataMaxYear } from '../utils/dataDateRange';

const yearOptions: number[] = Array.from(
  { length: dataMaxYear - dataMinYear + 1 },
  (_, i) => dataMinYear + i,
);

export interface DateRangeSelectorProps {
  startDate: Date;
  setStartDate: React.Dispatch<React.SetStateAction<Date>>;

  endDate: Date;
  setEndDate: React.Dispatch<React.SetStateAction<Date>>;

  dayOfWeek: DayOfWeek;
  setDayOfWeek: React.Dispatch<React.SetStateAction<DayOfWeek>>;

  showChart: boolean;
  toggleShowChart: () => void;

  showSummary: boolean;
  toggleShowSummary: () => void;

  showMap: boolean;
  toggleShowMap: () => void;

  showContextLogs: boolean;
  toggleShowContextLogs: () => void;

  resetPanelSettings: () => void;
}

type IntervalEndpoint = 'start' | 'end';

export default function DateRangeSelector({
  startDate,
  setStartDate,
  endDate,
  setEndDate,
  dayOfWeek,
  setDayOfWeek,
  showChart,
  toggleShowChart,
  showSummary,
  toggleShowSummary,
  showMap,
  toggleShowMap,
  showContextLogs,
  toggleShowContextLogs,
  resetPanelSettings,
}: DateRangeSelectorProps) {
  /**
   * Panel Settings is a disclosure, collapsed on load. Open state is local and
   * deliberately not URL-synced: it is where the controls are, not what they
   * chose, and every choice inside it is already shareable on its own.
   */
  const [isPanelSettingsOpen, setIsPanelSettingsOpen] =
    useState<boolean>(false);

  const panelToggles = [
    { name: 'chart', label: 'Chart', checked: showChart, toggle: toggleShowChart },
    {
      name: 'summary',
      label: 'Summary',
      checked: showSummary,
      toggle: toggleShowSummary,
    },
    { name: 'map', label: 'Map', checked: showMap, toggle: toggleShowMap },
    {
      name: 'context-logs',
      label: 'Context Logs',
      checked: showContextLogs,
      toggle: toggleShowContextLogs,
    },
  ];
  const getDateSetter = (
    intervalEndpoint: IntervalEndpoint,
  ): React.Dispatch<React.SetStateAction<Date>> => {
    if (intervalEndpoint === 'end') {
      return setEndDate;
    } else if (intervalEndpoint === 'start') {
      return setStartDate;
    } else {
      const errorMessage = `Cannot support interval endpoint type: ${String(intervalEndpoint)}`;

      throw new Error(errorMessage);
    }
  };

  const updateMonth = (title: IntervalEndpoint, newMonth: string) => {
    // Update month state
    const setDate = getDateSetter(title);

    // Requires updater function
    setDate((prevDate: Date) => {
      const newDate: Date = new Date(prevDate);
      newDate.setMonth(Number(newMonth));

      return newDate;
    });
  };

  const updateYear = (title: IntervalEndpoint, newYear: string) => {
    // TODO: Add filter to make sure from is not larger than the "to" date

    // Update year state
    const setDate = getDateSetter(title);

    // Requires updater function
    setDate((prevDate: Date) => {
      const newDate: Date = new Date(prevDate);
      newDate.setFullYear(Number(newYear));

      return newDate;
    });
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
          {yearOptions.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
      </fieldset>
    );
  };

  return (
    <div className="flex flex-col sm:flex-row flex-wrap gap-x-16 gap-y-6">
      {/* Interval */}
      {dateForm(startDate, 'start', 'Start')}
      {dateForm(endDate, 'end', 'End')}

      {/* Day of week */}
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
          {Object.entries(daysOfWeek).map(([name, key]) => {
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

      {/**
       * Panel Settings. Collapsed by default so the filter bar keeps the height
       * it had when this was a single checkbox, and so the four toggles do not
       * push the line selector and the output area down the page on every load.
       */}
      <fieldset id="panel-settings">
        <legend>Panel Settings</legend>

        <button
          id="panel-settings-toggle"
          type="button"
          onClick={() => setIsPanelSettingsOpen((prevOpen) => !prevOpen)}
          aria-expanded={isPanelSettingsOpen}
          aria-controls="panel-settings-content"
          className="bg-transparent border-none p-0 font-bold text-xs text-[#0fada8]"
        >
          {isPanelSettingsOpen ? 'Hide panel settings' : 'Show panel settings'}
        </button>

        {isPanelSettingsOpen && (
          <div id="panel-settings-content" className="flex flex-col gap-2 pt-2">
            {panelToggles.map(({ name, label, checked, toggle }) => (
              <div key={name} className="flex items-center">
                <Checkbox.Root
                  id={`panel-${name}-toggle`}
                  onClick={toggle}
                  checked={checked}
                  className="flex items-center justify-center bg-white cursor-default data-[state=checked]:bg-[#033056] p-0 rounded size-[20px]"
                >
                  <Checkbox.Indicator>
                    <img
                      src={checkIcon}
                      height={20}
                      width={20}
                      alt="Check"
                      className="recolor-white"
                    />
                  </Checkbox.Indicator>
                </Checkbox.Root>

                <label className="pl-2" htmlFor={`panel-${name}-toggle`}>
                  {label}
                </label>
              </div>
            ))}

            <button
              id="panel-settings-reset"
              type="button"
              onClick={resetPanelSettings}
              className="self-start bg-transparent border-none p-0 font-bold text-xs text-[#0fada8]"
            >
              Reset to defaults
            </button>
          </div>
        )}
      </fieldset>
    </div>
  );
}
