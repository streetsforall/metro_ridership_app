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

  return (
    /* Centered vertically so the cards sit in the middle of whatever height the
       panel has rather than pinning to the top over a dead band. `safe center`
       (not plain `center`) so an overflowing row still scrolls from its start —
       PanelChrome gives this panel `overflow-auto`. A flex COLUMN keeps
       SummaryData full-width, which its container queries size against. */
    <div className="flex h-full flex-col [justify-content:safe_center]">
      <SummaryData lines={lines} />
    </div>
  );
}
