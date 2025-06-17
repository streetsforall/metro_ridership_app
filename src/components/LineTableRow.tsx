import { useState, useEffect } from 'react';
import type { ChartOptions, ChartDataset } from 'chart.js';
import { Line as LineChart } from 'react-chartjs-2';
import * as Checkbox from '@radix-ui/react-checkbox';
import { type Line } from '../utils/lines';
import { getLineColor } from '../utils/lines';
import type { Metric } from '../App';
import checkIcon from '../assets/check.svg';

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
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [data, setData] = useState<
    ChartDataset<'line', Array<{ time: string; stat: number }>>[]
  >([]);

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
    responsive: true,
    parsing: {
      xAxisKey: 'time',
      yAxisKey: 'stat',
    },
  };

  const chartDataset: ChartDataset<
    'line',
    Array<{ time: string; stat: number }>
  >[] = [];

  // fires on load
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // fires on change
  useEffect(() => {
    if (lineMetrics) {
      chartDataset.push({
        borderColor: getLineColor(Number(line.id)),
        data: lineMetrics.map((metric) => ({
          time: metric.year + ' ' + metric.month,
          //@ts-expect-error: No index signature with a parameter of type 'string'
          stat: metric[dayOfWeek] as number,
        })),
      });
    }

    console.log(line);

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
        <tr className="even:bg-[rgba(0,0,0,0.05)]">
          {/* Line rank */}
          <td className="text-right text-stone-400 w-10">{id}</td>

          {/* Is Selected */}
          <td className={expanded ? 'w-28' : 'w-10'}>
            <Checkbox.Root
              id={line.id.toString()}
              onClick={() => onToggleSelectLine(line)}
              checked={line.selected}
              className="flex items-center justify-center bg-white data-[state=checked]:bg-[#033056] mx-auto rounded p-0 h-5 w-5"
            >
              <Checkbox.Indicator>
                <img
                  src={checkIcon}
                  height={20}
                  width={20}
                  alt="Check"
                  className="recolor-white"
                />
              </Checkbox.Indicator>
            </Checkbox.Root>
          </td>

          {/* Line name (ex: Line 2, B Line) */}
          <td>
            <label
              htmlFor={String(line.id)}
              className="group block cursor-pointer py-2 whitespace-nowrap"
            >
              <span
                className={`block visible h-auto ${line.former && 'group-hover:invisible group-hover:h-0'}`}
              >
                {line.name}
              </span>
              <span
                className={`block invisible h-0 ${line.former && 'group-hover:visible group-hover:h-auto'}`}
              >
                Former {line.former}
              </span>
            </label>
          </td>

          {/* Average ridership over a duration (ex: 3 months) */}
          {expanded && line.averageRidership && (
            <td className="text-right">
              {line.averageRidership
                ? Math.round(line.averageRidership).toLocaleString()
                : 0}
            </td>
          )}

          {/* Change in ridership (ex: +1000, -200) */}
          {expanded &&
            line.changeInRidership &&
            (line.changeInRidership < 0 ? (
              <td className="text-right text-red-600">
                {line.changeInRidership.toLocaleString()}
              </td>
            ) : (
              <td className="text-right text-green-600">
                {'+' + line.changeInRidership.toLocaleString()}
              </td>
            ))}

          {/* Starting ridership  */}
          {expanded && line.startingRidership && (
            <td className="text-right">
              {line.id
                ? Math.round(line.startingRidership).toLocaleString()
                : 0}
            </td>
          )}

          {/* Recent ridership  */}
          {expanded && line.endingRidership && (
            <td className="text-right">
              {line.id ? Math.round(line.endingRidership).toLocaleString() : 0}
            </td>
          )}

          {/* Division (ex: 3, 5) */}
          {/* {expanded && <td>{line.division ?? division}</td>} */}

          {/* Ridership over time. Line graph showing ridership trend */}
          {expanded && (
            <td key={line.id} className="max-h-10 max-w-52">
              {isMounted ? (
                <LineChart
                  options={options}
                  id="row_chart"
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
          {/* {expanded && <td>View Map</td>} */}
        </tr>
      )}
    </>
  );
}
