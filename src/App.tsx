export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
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
import DateRangeSelector from './inputComponents/dateRangeSelector';
import LineSelector from './inputComponents/linesSelector';
import SummaryData from './pureDisplayComponents/summaryData';
import useUserDashboardInput, {
  type UserDashboardInputState,
} from './hooks/useUserDashboardInput';
import { getLineColor, getLineNames } from './common/lines';
import { type Line } from './common/types';
import metrics from './data/ridership.json';
import sfaLogo from './assets/sfa-logo.png';

export interface MetricWrapper {
  selected: boolean;
  metrics: Metric[];
}

export interface Metric {
  year: number;
  month: number;
  line_name: string;
  est_wkday_ridership: number | null;
  est_sat_ridership: number | null;
  est_sun_ridership: number | null;
}

// Associative array with line name as key
export interface LineMetricDataset {
  [key: string]: MetricWrapper;
}

interface ChartLineData {
  time: string;
  stat: string | number | null;
}

type ChartData = ChartDataset<'line', ChartLineData[]> & { id: number };

export type Inputs = {
  lines: string[];
  year: string;
  stat: keyof Metric;
};

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
);

function App() {
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [monthList, setMonthList] = useState<string[]>([]);
  const [expandedLineSelector, setExpandedLineSelector] =
    useState<boolean>(false);
  const [lineMetricDataset, setLineMetricDataset] = useState<LineMetricDataset>(
    {},
  );

  const userDashboardInputState: UserDashboardInputState =
    useUserDashboardInput();

  const {
    lines,
    startDate,
    setStartDate,
    dayOfWeek,
    setDayOfWeek,
    endDate,
    setEndDate,
    updateLinesWithLineMetrics,
    visibleLines,
  } = userDashboardInputState;

  console.log('visibleLines', visibleLines);

  // testing loads for build
  useEffect(() => {
    console.log('lines', lines);

    console.log('metrics', metrics);
    console.log('lineMetricDataset', lineMetricDataset);
  }, []);

  /**
   * Update params on state change
   */
  useEffect((): void => {
    if (!chartData) {
      console.log('no chart data');
      return;
    }

    // Aggregate by line
    const aggregated: LineMetricDataset = {};

    console.log('date range FILTER (start / end)', startDate, endDate);

    for (let i = 0; i < metrics.length; i++) {
      const metric: Metric = metrics[i];

      // Filter by year
      const newMetricDate = new Date(metric.year, metric.month);

      // need to filter our date to make sure it falls in our date range

      const startCap = startDate.getTime() >= newMetricDate.getTime();
      const endCap = endDate.getTime() <= newMetricDate.getTime();

      // if year false we break
      if (startCap || endCap) continue;

      if (!aggregated[metric.line_name]?.metrics) {
        const selectedLine: boolean = !!lines.find(
          (line: Line) => line.id === Number(metric.line_name),
        )?.selected;

        aggregated[metric.line_name] = {
          selected: selectedLine,
          metrics: [],
        } as MetricWrapper;
      }

      const metricWrapper = aggregated[metric.line_name];
      metricWrapper.metrics.push(metric);

      // console.log(metricWrapper)
    }

    // Condense aggregated objects
    // add selected lines to the chart
    const chartDataset: ChartData[] = [];

    Object.entries(aggregated).forEach(([line, metricWrapper]) => {
      if (!metricWrapper.selected) {
        return;
      }

      console.log('metricWrapper', metricWrapper);

      chartDataset.push({
        data: metricWrapper.metrics.map((metric) => ({
          time: metric.year + ' ' + metric.month,
          stat: metric[dayOfWeek],
        })),
        label: getLineNames(Number(line)).current,
        id: Number(line),
        backgroundColor: getLineColor(Number(line)),
        borderColor: getLineColor(Number(line)),
      });
    });

    // create month labels
    const months = chartData[0] ? chartData[0].data.map((a) => a.time) : [];
    setMonthList(months);

    console.log('aggregated', aggregated);

    setChartData(chartDataset);

    setLineMetricDataset(aggregated);

    /**
     * Need to add data as dependency.
     * Since data is an array, we need to stringify due to current React system.
     * https://github.com/facebook/react/issues/14476
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    startDate,
    endDate,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(lines),
    dayOfWeek,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(chartData),
  ]);

  /**
   * Calculate metric data for each line.
   */
  useEffect(
    () => {
      console.log('lineMetricDataset effect', lineMetricDataset);
      updateLinesWithLineMetrics(lineMetricDataset);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(lineMetricDataset)],
  );

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
    /* Stretch full height */
    <div className="flex flex-col min-h-screen mx-4">
      <div className="flex items-center justify-between font-bold py-4 uppercase">
        <span className="ml-2">LA Metro Ridership App</span>

        <a href="https://www.streetsforall.org">
          <img
            src={sfaLogo}
            height={48}
            width={48}
            alt="Streets for All logo"
          />
        </a>
      </div>

      <div className="pane mb-4">
        <DateRangeSelector
          startDate={startDate}
          setStartDate={setStartDate}
          endDate={endDate}
          setEndDate={setEndDate}
          dayOfWeek={dayOfWeek}
          setDayOfWeek={setDayOfWeek}
        ></DateRangeSelector>
      </div>

      {/* Grow to fill remaining vertical space; only one column if expanded or on mobile */}
      <div
        className={`grow grid flex-col gap-4 ${expandedLineSelector ? 'lg:grid-cols-[1fr]' : 'grid-cols-[1fr] lg:grid-cols-[25%_1fr]'}`}
      >
        {/* Hack to match sibling height - https://www.reddit.com/r/css/comments/15qu1ml/restrict_childs_height_to_parents_height_which_is/ */}
        <div
          className={`pane flex flex-col gap-4 h-[32rem] min-h-full w-0 min-w-full ${expandedLineSelector ? 'lg:h-auto' : 'lg:h-0'}`}
        >
          <LineSelector
            {...userDashboardInputState}
            lineMetricDataset={lineMetricDataset}
            expanded={expandedLineSelector}
            setExpanded={setExpandedLineSelector}
            lines={visibleLines}
          />
        </div>

        {/**
         * Only show right side if line selector not selected
         * TODO: Change this from conditional rendering to conditional visibility; that way it doesn't rerender every time
         */}
        {!expandedLineSelector && (
          <div className="flex flex-col gap-4 lg:min-h-[50vh]">
            {/* Only show chart and summary metrics if something selected */}
            {chartData.length > 0 ? (
              <>
                <div className="pane">
                  <LineChart
                    options={options}
                    data={{
                      labels: monthList,
                      datasets: chartData,
                    }}
                  />
                </div>

                <SummaryData visibleLines={visibleLines}></SummaryData>
              </>
            ) : (
              <div className="pane flex-1 flex items-center justify-center text-sm text-stone-400">
                <p>Please select a Metro line.</p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="py-8 leading-relaxed text-xs">
        <p>
          Built with care by the{' '}
          <a href="https://data.streetsforall.org">
            Streets for All Data/Dev Team
          </a>{' '}
          with data from <a href="https://metro.net">LA Metro</a>
        </p>
        <p>
          © 2025 <a href="https://streetsforall.org">Streets for All</a>
        </p>
        <p>🚌 🚲👩🏻‍🦽🚶🏾🌳</p>
      </div>
    </div>
  );
}

export default App;
