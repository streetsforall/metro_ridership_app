import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  type ChartDataset,
  type ChartOptions,
} from 'chart.js';
import { Line as LineChart } from 'react-chartjs-2';
import colors from 'tailwindcss/colors';
import SummaryData from './SummaryData';
import type { CustomChartData } from '../@types/chart.types';
import type { Line } from '../@types/lines.types';

interface OutputAreaProps {
  chartDatasets: ChartDataset<'line', CustomChartData[]>[];
  months: string[];
  lines: Line[];
}

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
);

export default function OutputArea({
  chartDatasets,
  months,
  lines,
}: OutputAreaProps) {
  ChartJS.defaults.font.family = 'Overpass Mono Variable';
  ChartJS.defaults.color = colors.stone['700'];

  const options: ChartOptions<'line'> = {
    interaction: {
      axis: 'x',
      includeInvisible: false,
      intersect: true,
      mode: 'index',
    },
    parsing: {
      xAxisKey: 'time',
      yAxisKey: 'stat',
    },
    responsive: true,
    scales: {
      x: {
        border: {
          color: colors.stone['700'],
        },
        grid: {
          color: colors.stone['300'],
        },
        title: {
          display: true,
          text: 'MONTH',
        },
      },
      y: {
        border: {
          color: colors.stone['700'],
        },
        grid: {
          color: colors.stone['300'],
          drawTicks: false,
        },
        min: 0,
        title: {
          display: true,
          text: 'AVG DAILY RIDERSHIP',
        },
      },
    },
  };

  return (
    <div className="flex flex-col gap-4 lg:min-h-[50vh]">
      {/* Only show chart and summary metrics if something selected */}
      {chartDatasets.length > 0 ? (
        <>
          {/* Chart pane */}
          <div className="pane">
            <LineChart
              options={options}
              data={{
                labels: months,
                datasets: chartDatasets,
              }}
            />
          </div>

          <SummaryData lines={lines} />
        </>
      ) : (
        /* Chart pane */
        <div className="pane flex-1 flex items-center justify-center text-sm text-stone-400">
          <p>Please select a Metro line.</p>
        </div>
      )}
    </div>
  );
}
