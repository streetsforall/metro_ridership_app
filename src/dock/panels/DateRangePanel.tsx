import DateRangeSelector from '../../components/DateRangeSelector';
import { useDashboard } from '../../context/DashboardContext';

export default function DateRangePanel() {
  const { userDashboardInputState } = useDashboard();
  const {
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    dayOfWeek,
    setDayOfWeek,
  } = userDashboardInputState;

  return (
    <DateRangeSelector
      startDate={startDate}
      setStartDate={setStartDate}
      endDate={endDate}
      setEndDate={setEndDate}
      dayOfWeek={dayOfWeek}
      setDayOfWeek={setDayOfWeek}
    />
  );
}
