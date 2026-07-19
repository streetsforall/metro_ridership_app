import { Line as LineChart } from 'react-chartjs-2';
import { useDashboard } from '../../context/DashboardContext';
import { buildChartOptions } from './chartConfig';

export default function ChartPanel() {
  const { chartDatasets, monthList } = useDashboard();

  if (chartDatasets.length === 0) {
    return (
      <div className="flex h-full min-h-[10rem] items-center justify-center text-sm text-stone-400">
        <p>Please select a Metro line.</p>
      </div>
    );
  }

  return (
    /* min-h keeps the chart visible in auto-height (mobile) containers; inside
       the dock `chart-fill` drops it so the canvas tracks the panel instead
       (see src/dock/dockTheme.css). */
    <div className="chart-fill relative h-full min-h-[20rem] w-full">
      <LineChart
        options={buildChartOptions()}
        data={{
          labels: monthList,
          datasets: chartDatasets,
        }}
      />
    </div>
  );
}
