import * as Checkbox from '@radix-ui/react-checkbox';
import { useState, useEffect } from 'react';
import { type Line } from '../common/types';
import { Metric } from '../charts/page';
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


interface MetroLineTableRowProps {
  onToggleSelectLine: (line: Line) => void;
  expanded?: boolean;
  line: Line;
  dayOfWeek: string;
  lineMetrics: Metric[];
}

const NotDefined = 'Not Defined';

export default function MetroLineTableRow({
  onToggleSelectLine,
  line,
  expanded,
  dayOfWeek,
  startDate,
  endDate,
  months,
  lineMetrics
}: MetroLineTableRowProps) {
  const collapsedSelectorWrapperClasses =
    'flex gap-2 items-center px-2 odd:bg-neutral-50 text-sm';


  const [isMounted, setIsMounted] = useState(false);
  const [data, setData] = useState([]);





  const options: ChartOptions<'line'> = {
    plugins: {
      legend: {
        display: false
      }
    },
    events: [],
    scales: {
      x: {
        display: false,
      },
      y: {
        display: false,
      }
    },
    elements: {
      point:{
          radius: 0
      }
  },
      maintainAspectRatio: false,

    responsive: true,
    parsing: {
      xAxisKey: 'time',
      yAxisKey: 'stat',
    },
  }


  let chartDataset: ChartData[] = [];

  useEffect(() => {


    console.log(lineMetrics)
    lineMetrics ? chartDataset.push({
      borderColor: "#ed840e",
      data: lineMetrics.map((metric) => ({
        time: metric.year + ' ' + metric.month,
        stat: metric[dayOfWeek],
      })),
      id: Number(line)
    }) : ''

    console.log('data', chartDataset)
    console.log(months)
    

    setData(chartDataset);

  }, [line.changeInRidership])

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
        {expanded && <td>{line.changeInRidership ?? 0}</td>}

        {/* Division (ex: 3, 5) */}
        {/* {expanded && <td>{line.division ?? division}</td>} */}

        {/* Ridership over time. Line graph showing ridership trend */}

        {expanded &&

          <div className={
            expanded ? 'expanded' : 'collapsed'
          } id="table_chart_container">
          <LineChart
            options={options}
            id="chart"
            data={{
              datasets: data,
            }}
          />
          </div>
        }



        {/* View Map hyperlink */}
        {expanded && <td>View Map</td>}
      </tr> 
    </>
  );
}
