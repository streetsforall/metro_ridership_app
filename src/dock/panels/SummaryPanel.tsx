import SummaryData from '../../components/SummaryData';
import { useDashboard } from '../../context/DashboardContext';

export default function SummaryPanel() {
  const { lines } = useDashboard();

  if (!lines.some((line) => line.selected)) {
    return (
      <div className="flex h-full min-h-[10rem] items-center justify-center text-sm text-stone-400">
        <p>Please select a Metro line.</p>
      </div>
    );
  }

  return <SummaryData lines={lines} />;
}
