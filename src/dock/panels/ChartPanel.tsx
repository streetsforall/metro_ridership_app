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
    /* min-h keeps the chart visible in auto-height (mobile) containers */
    <div className="relative h-full min-h-[20rem] w-full">
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
