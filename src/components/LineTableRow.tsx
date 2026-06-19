import { useState, useEffect } from 'react';
import type { ChartOptions, ChartDataset } from 'chart.js';
import { Line as LineChart } from 'react-chartjs-2';
import * as Checkbox from '@radix-ui/react-checkbox';
import { getLineColor } from '../utils/lines';
import type { CustomChartData } from '../@types/chart.types';
import type { Line } from '../@types/lines.types';
import type { RidershipRecord } from '../@types/metrics.types';
import checkIcon from '../assets/check.svg';

interface MetroLineTableRowProps {
  onToggleSelectLine: (line: Line) => void;
  isExpanded?: boolean;
  line: Line;
  id: number;
  dayOfWeek: string;
  lineMetrics: RidershipRecord[];
}

export default function MetroLineTableRow({
  onToggleSelectLine,
  line,
  isExpanded,
  dayOfWeek,
  id,
  lineMetrics,
}: MetroLineTableRowProps) {
  const [isMounted, setIsMounted] = useState<boolean>(false);
  const [data, setData] = useState<ChartDataset<'line', CustomChartData[]>[]>(
    [],
  );

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

  const chartDataset: ChartDataset<'line', CustomChartData[]>[] = [];

  // fires on load
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Fires on change
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
          <td data-qa={`rank-${line.id}`} className="text-right text-stone-400 w-10">{id}</td>

          {/* Is Selected */}
          <td data-qa={`select-${line.id}`} className={isExpanded ? 'w-28' : 'w-10'}>
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
          <td data-qa={`name-${line.id}`}>
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
          {isExpanded && (
            <td data-qa={`avg-ridership-${line.id}`} className="text-right">
              {line.averageRidership
                ? Math.round(line.averageRidership).toLocaleString()
                : '—'}
            </td>
          )}

          {/* Change in ridership (ex: +1000, -200) */}
          {isExpanded &&
            (line.changeInRidership ? (
              line.changeInRidership < 0 ? (
                <td data-qa={`change-ridership-${line.id}`} className="text-right text-red-600">
                  {line.changeInRidership.toLocaleString()}
                </td>
              ) : (
                <td data-qa={`change-ridership-${line.id}`} className="text-right text-green-600">
                  {'+' + line.changeInRidership.toLocaleString()}
                </td>
              )
            ) : (
              <td data-qa={`change-ridership-${line.id}`} className="text-right">—</td>
            ))}

          {/* Starting ridership  */}
          {isExpanded && (
            <td data-qa={`starting-ridership-${line.id}`} className="text-right">
              {line.startingRidership
                ? Math.round(line.startingRidership).toLocaleString()
                : '—'}
            </td>
          )}

          {/* Recent ridership  */}
          {isExpanded && (
            <td data-qa={`ending-ridership-${line.id}`} className="text-right">
              {line.endingRidership
                ? Math.round(line.endingRidership).toLocaleString()
                : '—'}
            </td>
          )}

          {/* Route miles */}
          {isExpanded && (
            <td data-qa={`distance-miles-${line.id}`} className="text-right">{line.distanceMiles ?? '—'}</td>
          )}

          {/* Riders per mile */}
          {isExpanded && (
            <td data-qa={`riders-per-mile-${line.id}`} className="text-right">
              {line.ridersPerMile
                ? Math.round(line.ridersPerMile).toLocaleString()
                : '—'}
            </td>
          )}

          {/* Division (ex: 3, 5) */}
          {/* {isExpanded && <td>{line.division ?? division}</td>} */}

          {/* Ridership over time. Line graph showing ridership trend */}
          {isExpanded && (
            <td data-qa={`sparkline-${line.id}`} key={line.id} className="max-h-10 max-w-52">
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
          {/* {isExpanded && <td>View Map</td>} */}
        </tr>
      )}
    </>
  );
}
