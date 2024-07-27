'use client';

import { useState, useEffect } from 'react';
import { useForm, Controller, SubmitHandler } from 'react-hook-form';
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
import { Line } from 'react-chartjs-2';
import * as metrics from '@/app/ridership.json';
import DateRangeSelector from '../inputComponents/dateRangeSelector';
import LineSelector from '../inputComponents/metroLinesSelector';
import useUserDashboardInput from '../hooks/useUserDashboardInput';

interface Metric {
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

  const [data, setData] = useState<ChartDataset<'line', { time: string; stat: string | number | null }[]>[]>([]);
  const [monthList, setMonthList] = useState([])

  const {
    lines,
    setLines,
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
      return('');
    }
  
    console.log(lines)
 
    // Aggregate by line
    let aggregated: Aggregate = {};

    console.log('date range FILTER (start / end)', startDate, endDate)

    for (let i = 0; i < metrics.length; i++) {
      const metric: Metric = metrics[i];

      // console.log(metric)
      // Filter by year and lines
      const inLines = lines.includes(metric.line_name);

      var newMetricDate = new Date(metric.year, metric.month);

      // need to filter our date to make sure it falls in our date range
      // console.log(endDate, newMetricDate, startDate)


      const startCap = startDate.getTime() >= newMetricDate.getTime()
      const endCap =  endDate.getTime() <= newMetricDate.getTime() 

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


    const months = data[0] ? data[0].data.map(a => a.time) : '';
    setMonthList(months);
    console.log(months)

    setData(datasets);
    console.log('chart data', datasets)
}, [startDate, endDate, lines, dayOfWeek])

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

        <LineSelector selectedLines={lines} setSelectedLines={setLines} />

        <Line
          options={options}
          id="chart"
          data={{
            labels: monthList,
            datasets: data,
          }}
        />
      </div>
    </div>
    </>
  );
}
