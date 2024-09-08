'use client';

import * as Checkbox from '@radix-ui/react-checkbox';
import { useState, useEffect, useMemo } from 'react';
import { type Line } from '../common/types';
import { getLineColor } from '../common/lines';
import { Metric } from '../charts/page';
import { Chart as ChartJS, type ChartOptions, ChartData } from 'chart.js';
import { Line as LineChart } from 'react-chartjs-2';

interface MetroLineTableRowProps {
  onToggleSelectLine: (line: Line) => void;
  expanded?: boolean;
  line: Line;
  dayOfWeek: string;
  lineMetrics: Metric[];
}

export default function MetroLineTableRow({
  onToggleSelectLine,
  line,
  expanded,
  dayOfWeek,
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
    animation: {
      onComplete: function () {
        setIsMounted(true);
      },
    },
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
    stepped: 0,
    borderDash: [],
    tension: false,
    responsive: true,
    parsing: {
      xAxisKey: 'time',
      yAxisKey: 'stat',
    },
  };

  // let chartDataset: ChartData[] = [];

  const chartData: ChartData[] = useMemo(
    () =>
      lineMetrics
        ? [
            {
              borderColor: getLineColor(Number(line.id)),
              data: lineMetrics.map((metric) => ({
                time: metric.year + ' ' + metric.month,
                stat: metric[dayOfWeek],
              })),
              id: Number(line),
            },
          ]
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(lineMetrics)],
  );

  useEffect(() => {
    if (!expanded) {
      return;
    }

    setIsMounted(false);

    const chartDataset: ChartData[] = lineMetrics
      ? [
          {
            borderColor: getLineColor(Number(line.id)),
            data: lineMetrics.map((metric) => ({
              time: metric.year + ' ' + metric.month,
              stat: metric[dayOfWeek],
            })),
            id: Number(line),
          },
        ]
      : [];

    setData(chartDataset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    line,
    dayOfWeek,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(lineMetrics),
  ]);

  const hashCode = function (s) {
    var h = 0,
      l = s.length,
      i = 0;
    if (l > 0) while (i < l) h = ((h << 5) - h + s.charCodeAt(i++)) | 0;
    return h;
  };

  if (line.name === 'Line 2') {
    console.log('Render Row -----------------------');
    console.log('Render Row - Line ' + line.name);
    console.log('Render Row - Metrics Length ' + lineMetrics?.length);
    console.log('Render Row - Mounted ' + isMounted);
    console.log('Render Row - Expanded ' + expanded);
    console.log('Render Row - Line ' + JSON.stringify(line));
    console.log('Render Row - Day of Week ' + dayOfWeek);
    console.log(
      'Render Row - Chart Data Hash' + hashCode(JSON.stringify(data)),
    );
  }

  return (
    <>
      <tr
        className={
          expanded ? 'odd:bg-neutral-50' : collapsedSelectorWrapperClasses
        }
      >
        {/* Is Selected */}
        <td className="line-selected-checkbox">
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
        <td className="w-full line-name">
          <label
            htmlFor={String(line.id)}
            className="flex-1 block cursor-pointer py-2"
          >
            {line.name}
          </label>
        </td>

        {/* Average ridership over a duration (ex: 3 months) */}
        {expanded && (
          <td>
            {!!line.averageRidership
              ? Math.round(line.averageRidership).toLocaleString()
              : 0}
          </td>
        )}

        {/* Change in ridership (ex: +1000, -200) */}
        {expanded && <td>{line.changeInRidership?.toLocaleString() ?? 0}</td>}

        {/* Division (ex: 3, 5) */}
        {/* {expanded && <td>{line.division ?? division}</td>} */}

        {/* Ridership over time. Line graph showing ridership trend */}

        {expanded && (
          <td id="table_chart_container" key={line.id}>
            {/* It seems the rendering takes time. We can't use loading because the data itself is already loaded. 
            Either make more efficient (ex: don't draw points/lines) or use another chart library. 
            Possible options include web worker, less data points */}
            {isMounted ? (
              <LineChart
                options={options}
                id="chart"
                data={{
                  datasets: data,
                }}
              />
            ) : (
              'Loading'
            )}
          </td>
        )}

        {/* View Map hyperlink */}
        {expanded && <td>View Map</td>}
      </tr>
    </>
  );
}
