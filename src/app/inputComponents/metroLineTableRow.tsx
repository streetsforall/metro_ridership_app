'use client';

import * as Checkbox from '@radix-ui/react-checkbox';
import { useState, useEffect } from 'react';
import { type Line } from '../common/types';
import { getLineColor } from '../common/lines';
import { Metric } from '../page';
import { Chart as ChartJS, type ChartOptions, ChartData } from 'chart.js';
import { Line as LineChart } from 'react-chartjs-2';

interface MetroLineTableRowProps {
  onToggleSelectLine: (line: Line) => void;
  expanded?: boolean;
  line: Line;
  id: number;
  dayOfWeek: string;
  lineMetrics: Metric[];
}

export default function MetroLineTableRow({
  onToggleSelectLine,
  line,
  expanded,
  dayOfWeek,
  id,
  lineMetrics,
}: MetroLineTableRowProps) {
  const collapsedSelectorWrapperClasses =
    'flex gap-2 items-center px-2 odd:bg-neutral-50 text-sm';

  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [data, setData] = useState<ChartData[]>([]);

  // most of these are suggested chartjs optomizations
  const options: ChartOptions<'line'> = {
    plugins: {
      legend: {
        display: false,
      },
    },

    events: [],
    animation: false,
    spanGaps: true,
    normalized: true,
    scales: {
      x: {
        display: false,
      },
      y: {
        display: false,
      },
    },
    elements: {
      point: {
        radius: 0,
      },
    },
    maintainAspectRatio: false,
    // @ts-ignore
    stepped: 0,
    borderDash: [],
    tension: false,
    responsive: true,
    parsing: {
      xAxisKey: 'time',
      yAxisKey: 'stat',
    },
  };

  let chartDataset: ChartData[] = [];

  // fires on load
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // fires on change
  useEffect(() => {
    lineMetrics
      ? chartDataset.push({
          // @ts-ignore
          borderColor: getLineColor(Number(line.id)),
          data: lineMetrics.map((metric) => ({
            time: metric.year + ' ' + metric.month,
            // @ts-ignore
            stat: metric[dayOfWeek],
          })),
          id: Number(line),
        })
      : '';

    setData(chartDataset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    line.averageRidership,
    dayOfWeek,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(lineMetrics),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(chartDataset),
  ]);

  return (
    <>
      {lineMetrics && (
        <tr
          className={
            expanded ? 'odd:bg-neutral-50' : collapsedSelectorWrapperClasses
          }
        >
          <td className="w-7 text-sm text-gray-300" >{id}</td>
          {/* Is Selected */}
          <td className="line-selected-checkbox max-w-max">
            <Checkbox.Root
              id={line.id.toString()}
              onClick={() => onToggleSelectLine(line)}
              checked={line.selected}
              className="flex items-center justify-center bg-white data-[state=checked]:bg-neutral-500 border border-neutral-500 rounded-lg h-5 w-5 overflow-hidden"
            >
              <Checkbox.Indicator className="bg-neutral-500 rounded-lg h-full w-full" />
            </Checkbox.Root>
          </td>

          {/* Line name (ex: Line 2, B Line) */}
          <td className="line-name flex-1">
            <label
              htmlFor={String(line.id)}
              className="flex-1 block cursor-pointer py-2"
            >
              {line.name}
            </label>
          </td>

          {/* Average ridership over a duration (ex: 3 months) */}
          {expanded && line.averageRidership && (
            <td>
              {!!line.averageRidership
                ? Math.round(line.averageRidership).toLocaleString()
                : 0}
            </td>
          )}

          {/* Change in ridership (ex: +1000, -200) */}
          {expanded &&
            line.changeInRidership &&
            (line.changeInRidership < 0 ? (
              <td className="changeDown">
                {line.changeInRidership.toLocaleString()}
              </td>
            ) : (
              <td className="changeUp">
                {'+' + line.changeInRidership.toLocaleString()}
              </td>
            ))}

          {/* Division (ex: 3, 5) */}
          {/* {expanded && <td>{line.division ?? division}</td>} */}

          {/* Ridership over time. Line graph showing ridership trend */}

          {expanded && (
            <td id="table_chart_container" key={line.id}>
              {isMounted ? (
                <LineChart
                  options={options}
                  id="chart"
                  data={{
                    // @ts-ignore
                    datasets: data,
                  }}
                />
              ) : (
                'Loading'
              )}
            </td>
          )}

          {/* View Map hyperlink */}
          {/* {expanded && <td>View Map</td>} */}
        </tr>
      )}
    </>
  );
}
