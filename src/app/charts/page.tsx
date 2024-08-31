'use client';

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
import DateRangeSelector from '../inputComponents/dateRangeSelector';
import LineSelector from '../inputComponents/metroLinesSelector';
import useUserDashboardInput from '../hooks/useUserDashboardInput';
import { getLineColor, getLineName } from '../common/lines';
import { type Line } from '../common/types';
import * as metrics from '@/app/ridership.json';

import './chart.css'

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
  [key: string]: Metric[];
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

export default function Charts() {
  const [data, setData] = useState<ChartData[]>([]);
  const [monthList, setMonthList] = useState([]);
  const [expandedLineSelector, setExpandedLineSelector] =
    useState<boolean>(false);
  const [lineMetricDataset, setLineMetricDataset] = useState<LineMetricDataset>(
    {},
  );

  const {
    lines,
    onToggleSelectLine,
    startDate,
    setStartDate,
    dayOfWeek,
    setDayOfWeek,
    endDate,
    setEndDate,
    updateLinesWithLineMetrics,
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
    let aggregated: LineMetricDataset = {};

    console.log('date range FILTER (start / end)', startDate, endDate);

    for (let i = 0; i < metrics.length; i++) {
      const metric: Metric = metrics[i];

      // console.log(metric)
      // Filter by year and lines
      const inLines: boolean = !!lines.find(
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
    let datasets: ChartData[] = [];
    Object.entries(aggregated).forEach(([line, metrics]) => {
      datasets.push({
        data: metrics.map((metric) => ({
          time: metric.year + ' ' + metric.month,
          stat: metric[dayOfWeek],
        })),
        label: getLineName(Number(line)),
        id: Number(line),
        backgroundColor: getLineColor(Number(line)),
        borderColor: getLineColor(Number(line)),
      });
    });

    // create month labels
    const months = data[0] ? data[0].data.map((a) => a.time) : '';
    setMonthList(months);
    console.log('months', months);

    setData(datasets);
    console.log('chart data', datasets);

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
    JSON.stringify(data),
  ]);

  /**
   * Calculate metric data for each line.
   */
  useEffect(
    () => {
      updateLinesWithLineMetrics(lineMetricDataset);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(lineMetricDataset)],
  );

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

        <div id="window" className="h-screen mx-auto">
          <LineSelector
            lineMetricDataset={lineMetricDataset}
            lines={lines}
            onToggleSelectLine={onToggleSelectLine}
            expanded={expandedLineSelector}
            setExpanded={setExpandedLineSelector}
          />

          {!expandedLineSelector && (
            <div id="chart_container">

              {data.length > 0 ?
                <LineChart
                  options={options}
                  id="chart"
                  data={{
                    labels: monthList,
                    datasets: data,
                  }}
                />
                : <div id="invalidData">
                  <p>
                  Please select data
                  </p>
                  </div>}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
