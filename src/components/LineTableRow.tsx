import { useState, useEffect } from 'react';
import type { ChartOptions, ChartDataset } from 'chart.js';
import { Line as LineChart } from 'react-chartjs-2';
import * as Checkbox from '@radix-ui/react-checkbox';
import { alignToMonthAxis } from '../ridership';
import { getLineColor } from '../utils/lines';
import type { CustomChartData } from '../@types/chart.types';
import type { Line } from '../@types/lines.types';
import type { DayOfWeek, RidershipRecord } from '../@types/metrics.types';
import checkIcon from '../assets/check.svg';

interface MetroLineTableRowProps {
  onToggleSelectLine: (line: Line) => void;
  isExpanded?: boolean;
  line: Line;
  id: number;
  dayOfWeek: string;
  ridershipRecords: RidershipRecord[];
  /**
   * The window's shared month axis, from `buildWindowMonthAxis`. Every row's sparkline
   * is drawn against it so a 9-month series and a 17-year one no longer fill the same
   * cell width as though their scales matched.
   */
  monthAxis: string[];
}

export default function MetroLineTableRow({
  onToggleSelectLine,
  line,
  isExpanded,
  dayOfWeek,
  id,
  ridershipRecords,
  monthAxis,
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
    // No spanGaps: months this line doesn't report are genuinely absent, and bridging
    // them draws a straight line through data that was never collected.
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
    if (ridershipRecords) {
      chartDataset.push({
        borderColor: getLineColor(Number(line.id)),
        data: alignToMonthAxis(ridershipRecords, monthAxis, dayOfWeek as DayOfWeek),
      });
    }

    setData(chartDataset);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    line.averageRidership,
    dayOfWeek,
    // `monthAxis` is memoised by LineSelector, so the reference is stable between
    // renders and doesn't need the JSON.stringify treatment the others get.
    monthAxis,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(ridershipRecords),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(chartDataset),
  ]);

  return (
    <>
      {ridershipRecords && (
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

                {/**
                 * Rows whose data starts after — or ends before — the window does. The
                 * figures beside them are still each line's own first-to-last record,
                 * so the marker says which period those figures actually describe.
                 *
                 * Beside the name rather than beneath it. Roughly half the network is
                 * partial over a multi-year window (a line discontinued or introduced
                 * mid-window counts), so a second line per row would add ~1200px to the
                 * table; inline it costs no height and the column absorbs the width.
                 *
                 * Expanded view only — the collapsed list renders no metric columns, so
                 * there is nothing there to qualify.
                 */}
                {isExpanded &&
                  line.isPartialCoverage &&
                  line.coveredFrom &&
                  line.coveredTo && (
                    <span
                      data-qa={`coverage-${line.id}`}
                      title={`Partial coverage: this line only reports ${line.coveredFrom} to ${line.coveredTo} of the selected period, so its figures cover a shorter span than fully covered lines.`}
                      className="ml-2 cursor-help text-xs text-stone-400"
                    >
                      {line.coveredFrom} → {line.coveredTo}
                    </span>
                  )}
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
