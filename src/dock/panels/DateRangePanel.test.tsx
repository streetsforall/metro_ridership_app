import { describe, it, expect, vi } from 'vitest';
import DateRangePanel from './DateRangePanel';
import { makeDashboardValue, renderWithDashboard } from './testUtils';
import type { DateRangeSelectorProps } from '../../components/DateRangeSelector';
import type { UserDashboardInputState } from '../../hooks/useUserDashboardInput';

let capturedProps: DateRangeSelectorProps | undefined;

vi.mock('../../components/DateRangeSelector', () => ({
  default: (props: DateRangeSelectorProps) => {
    capturedProps = props;
    return <div data-testid="date-range-selector" />;
  },
}));

describe('DateRangePanel', () => {
  it('threads the date/day state from context to DateRangeSelector', () => {
    const startDate = new Date(2020, 6);
    const endDate = new Date(2025, 6);
    const setStartDate = vi.fn();
    const setEndDate = vi.fn();
    const setDayOfWeek = vi.fn();
    const value = makeDashboardValue({
      userDashboardInputState: {
        startDate,
        endDate,
        setStartDate,
        setEndDate,
        dayOfWeek: 'est_wkday_ridership',
        setDayOfWeek,
      } as unknown as UserDashboardInputState,
    });

    renderWithDashboard(<DateRangePanel />, value);

    expect(capturedProps?.startDate).toBe(startDate);
    expect(capturedProps?.endDate).toBe(endDate);
    expect(capturedProps?.setStartDate).toBe(setStartDate);
    expect(capturedProps?.setEndDate).toBe(setEndDate);
    expect(capturedProps?.dayOfWeek).toBe('est_wkday_ridership');
    expect(capturedProps?.setDayOfWeek).toBe(setDayOfWeek);
  });
});
