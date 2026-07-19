import LineSelector from '../../components/LineSelector';
import { useDashboard } from '../../context/DashboardContext';

export default function LineSelectorPanel() {
  const {
    userDashboardInputState,
    visibleLines,
    ridershipByLine,
    isLineSelectorExpanded,
    setIsLineSelectorExpanded,
  } = useDashboard();

  return (
    /* LineSelector expects a height-constrained flex column so its list scrolls */
    <div className="flex h-full flex-col gap-4">
      <LineSelector
        {...userDashboardInputState}
        lines={visibleLines}
        ridershipByLine={ridershipByLine}
        isExpanded={isLineSelectorExpanded}
        setIsExpanded={setIsLineSelectorExpanded}
      />
    </div>
  );
}
