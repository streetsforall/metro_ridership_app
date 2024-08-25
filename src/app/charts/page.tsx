'use client';

import { useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  Colors,
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
import * as metrics from '@/app/ridership.json';
import DateRangeSelector from '../inputComponents/dateRangeSelector';
import LineSelector from '../inputComponents/metroLinesSelector';
import useUserDashboardInput from '../hooks/useUserDashboardInput';
import { Line } from '../common/types';

export interface Metric {
  year: number;
  month: number;
  line_name: string;
  est_wkday_ridership: number | null;
  est_sat_ridership: number | null;
  est_sun_ridership: number | null;
}

// Associative array with line name as key
interface Aggregate {
  [key: string]: Metric[];
}

export type Inputs = {
  lines: string[];
  year: string;
  stat: keyof Metric;
};

ChartJS.register(
  CategoryScale,
  Colors,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
);

export default function Charts() {
  const [data, setData] = useState<
    ChartDataset<'line', { time: string; stat: string | number | null }[]>[]
  >([]);
  const [monthList, setMonthList] = useState([]);
  const [expandedLineSelector, setExpandedLineSelector] =
    useState<boolean>(false);

  const {
    lines,
    onToggleSelectLine,
    startDate,
    setStartDate,
    dayOfWeek,
    setDayOfWeek,
    endDate,
    setEndDate,
  } = useUserDashboardInput();

  /**
   * Update params on state change
   */
  useEffect(() => {
    if (!data) {
      return '';
    }

    console.log('lines', lines);

    // Aggregate by line
    let aggregated: Aggregate = {};

    console.log('date range FILTER (start / end)', startDate, endDate);

    for (let i = 0; i < metrics.length; i++) {
      const metric: Metric = metrics[i];

      // console.log(metric)
      // Filter by year and lines
      const inLines = lines.find(
        (line: Line) => line.id === Number(metric.line_name),
      )?.selected;

      var newMetricDate = new Date(metric.year, metric.month);

      // need to filter our date to make sure it falls in our date range
      // console.log(endDate, newMetricDate, startDate)

      const startCap = startDate.getTime() >= newMetricDate.getTime();
      const endCap = endDate.getTime() <= newMetricDate.getTime();

      // console.log(newMetricDate, startCap, endCap)

      // if line or year false we break
      if (!inLines) continue;
      if (startCap || endCap) continue;

      if (!aggregated[metric.line_name]) {
        aggregated[metric.line_name] = [];
      }

      aggregated[metric.line_name].push(metric);
    }

    // Condense aggregated objects
    let datasets: ChartDataset<
      'line',
      { time: string; stat: string | number | null }[]
    >[] = [];
    Object.entries(aggregated).forEach(([line, metrics]) => {
      datasets.push({
        data: metrics.map((metric) => ({
          time: metric.year + ' ' + metric.month,
          stat: metric[dayOfWeek],
        })),
        label: `Line ${line}`,
      });
    });

    // create month labels

    const months = data[0] ? data[0].data.map((a) => a.time) : '';
    setMonthList(months);
    console.log('months', months);

    setData(datasets);
    console.log('chart data', datasets);

    /*  
    Need to add data as dependency. 
    Since data is an array, we need to stringify due to current React system.
    https://github.com/facebook/react/issues/14476 
    */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, lines, dayOfWeek, JSON.stringify(data)]);

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
    plugins: {
      colors: {
        forceOverride: true,
      },
    },
    responsive: true,
    scales: {
      x: {
        border: {
          color: '#000',
        },
        ticks: {
          color: '#000',
        },
        title: {
          color: '#000',
          display: true,
          text: 'Month',
        },
      },
      y: {
        border: {
          color: '#000',
        },
        grid: {
          color: '#222',
          drawTicks: false,
        },
        ticks: {
          color: '#000',
        },
        title: {
          color: '#000',
          display: true,
          text: 'Avg Daily Ridership',
        },
      },
    },
  };

  return (
    <>
      <div>
        <DateRangeSelector
          startDate={startDate}
          setStartDate={setStartDate}
          endDate={endDate}
          setEndDate={setEndDate}
          dayOfWeek={dayOfWeek}
          setDayOfWeek={setDayOfWeek}
        ></DateRangeSelector>

        <div id="window" className="h-screen max-w-screen-lg mx-auto">
          <LineSelector
            lines={lines}
            onToggleSelectLine={onToggleSelectLine}
            expanded={expandedLineSelector}
            setExpanded={setExpandedLineSelector}
          />

          {!expandedLineSelector && (
            <LineChart
              options={options}
              id="chart"
              data={{
                labels: monthList,
                datasets: data,
              }}
            />
          )}
        </div>
      </div>
    </>
  );
}
