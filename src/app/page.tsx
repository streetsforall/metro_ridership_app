'use client';

export const dynamic = 'force-dynamic'

import { useState, useEffect, useMemo } from 'react';
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
import DateRangeSelector from './inputComponents/dateRangeSelector';
import LineSelector from './inputComponents/metroLinesSelector';
import useUserDashboardInput from './hooks/useUserDashboardInput';
import { getLineColor, getLineName } from './common/lines';
import { type Line } from './common/types';
import * as metrics from '../app/ridership.json';

import './chart.css';

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

export default function Charts() {
  const [chartData, setChartData] = useState<ChartData[]>([]);
  const [monthList, setMonthList] = useState<string[]>([]);
  const [expandedLineSelector, setExpandedLineSelector] =
    useState<boolean>(false);
  const [lineMetricDataset, setLineMetricDataset] = useState<LineMetricDataset>(
    {},
  );

  const {
    lines,
    setLines,
    onToggleSelectLine,
    startDate,
    setStartDate,
    dayOfWeek,
    setDayOfWeek,
    endDate,
    setEndDate,
    searchText,
    setSearchText,
    updateLinesWithLineMetrics,
  } = useUserDashboardInput();


  
  const visibleLines = useMemo(
    () =>
      lines.filter((line: Line) => {
        if (searchText) {
          const searchTextLower = searchText.toLocaleLowerCase();
          const visible: boolean = line.name
            .toLocaleLowerCase()
            .includes(searchTextLower);

          if (!visible) {
            return false;
          }
        }

        return (
          !!line.averageRidership && !!line.changeInRidership && line.visible
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(lines), searchText],
  );


  // testing loads for build
  useEffect( () => {
    console.log('lines', lines)

     console.log('metrics', metrics)
    console.log('lineMetricDataset', lineMetricDataset)
   }, [])


  /**
   * Update params on state change
   */
  useEffect(() : void => {

    if (!chartData) {
      console.log('no chart data')
      return;
    }

    // console.log('metrics', metrics)
    // console.log('lineMetricDataset', lineMetricDataset)

    // Aggregate by line
    let aggregated: LineMetricDataset = {};

    console.log('date range FILTER (start / end)', startDate, endDate);

    for (let i = 0; i < metrics.length; i++) {
      const metric: Metric = metrics[i];
      // console.log(metrics[i])

      // Filter by year
      var newMetricDate = new Date(metric.year, metric.month);

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
    let chartDataset: ChartData[] = [];
  
    Object.entries(aggregated).forEach(([line, metricWrapper]) => {
      
      if (!metricWrapper.selected) {
        return;
      }

      console.log('metricWrapper', metricWrapper)

      chartDataset.push({
        data: metricWrapper.metrics.map((metric) => ({
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
      console.log('lineMetricDataset effect', lineMetricDataset)
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
            dayOfWeek={dayOfWeek}
            lineMetricDataset={lineMetricDataset}
            lines={visibleLines}
            setLines={setLines}
            searchText={searchText}
            setSearchText={setSearchText}
            onToggleSelectLine={onToggleSelectLine}
            expanded={expandedLineSelector}
            setExpanded={setExpandedLineSelector}
          />

          {!expandedLineSelector && (
            <div id="chart_container">
              {chartData.length > 0 ? (
                <LineChart
                  options={options}
                  id="chart"
                  data={{
                    labels: monthList,
                    datasets: chartData,
                  }}
                />
              ) : (
                <div id="invalidData">
                  <p>Please select data</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
