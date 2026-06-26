import { useState } from 'react';
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
  type Plugin,
} from 'chart.js';
import { Line as LineChart } from 'react-chartjs-2';
import colors from 'tailwindcss/colors';
import SummaryData from './SummaryData';
import Map from './Map';
import type { CustomChartData } from '../@types/chart.types';
import type { Line } from '../@types/lines.types';
import type { TransitEvent } from '../@types/events.types';

interface OutputAreaProps {
  chartDatasets: ChartDataset<'line', CustomChartData[]>[];
  months: string[];
  lines: Line[];
  transitEvents: TransitEvent[];
}

const hoverCrosshairPlugin: Plugin<'line'> = {
  id: 'hoverCrosshair',
  afterDraw(chart) {
    const active = chart.tooltip?.getActiveElements();
    if (!active?.length) return;
    const x = active[0].element.x;
    const { ctx, chartArea: { top, bottom } } = chart;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = colors.stone['500'];
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.restore();
  },
};

const eventMarkersPlugin: Plugin<'line'> = {
  id: 'eventMarkers',
  afterDraw(chart) {
    const events: TransitEvent[] =
      (chart.options.plugins as Record<string, { events?: TransitEvent[] }>)
        .eventMarkers?.events ?? [];
    if (!events.length) return;

    const {
      ctx,
      chartArea: { top, bottom },
      scales: { x },
    } = chart;
    const labels = chart.data.labels as string[];

    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = colors.amber['500'];

    events.forEach((event) => {
      // Chart labels are "YYYY M" (e.g. "2023 2"); event dates are "YYYY-MM"
      const label = `${event.date.slice(0, 4)} ${parseInt(event.date.slice(5), 10)}`;
      const idx = labels.indexOf(label);
      if (idx === -1) return;

      const xPos = x.getPixelForValue(idx);
      ctx.beginPath();
      ctx.moveTo(xPos, top);
      ctx.lineTo(xPos, bottom);
      ctx.stroke();
    });

    ctx.restore();
  },
};

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  hoverCrosshairPlugin,
  eventMarkersPlugin,
);

function formatEventDate(date: string): string {
  const [year, month] = date.split('-').map(Number);
  return new Date(year, month - 1).toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

export default function OutputArea({
  chartDatasets,
  months,
  lines,
  transitEvents,
}: OutputAreaProps) {
  const [isContextLogOpen, setIsContextLogOpen] = useState(true);

  ChartJS.defaults.font.family = 'Overpass Mono Variable';
  ChartJS.defaults.color = colors.stone['700'];

  const options: ChartOptions<'line'> = {
    interaction: {
      axis: 'x',
      includeInvisible: false,
      intersect: false,
      mode: 'index',
    },
    plugins: {
      tooltip: {
        itemSort: (a, b) => (b.parsed.y ?? 0) - (a.parsed.y ?? 0),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      eventMarkers: { events: transitEvents } as any,
    },
    parsing: {
      xAxisKey: 'time',
      yAxisKey: 'stat',
    },
    responsive: true,
    scales: {
      x: {
        border: {
          color: colors.stone['700'],
        },
        grid: {
          color: colors.stone['300'],
        },
        title: {
          display: true,
          text: 'MONTH',
        },
      },
      y: {
        border: {
          color: colors.stone['700'],
        },
        grid: {
          color: colors.stone['300'],
          drawTicks: false,
        },
        min: 0,
        title: {
          display: true,
          text: 'AVG DAILY RIDERSHIP',
        },
      },
    },
  };

  return (
    <div className="flex flex-col gap-4 lg:min-h-[50vh]">
      {/* Only show chart and summary metrics if something selected */}
      {chartDatasets.length > 0 ? (
        <>
          {/* Chart pane */}
          <div className="pane">
            <LineChart
              options={options}
              data={{
                labels: months,
                datasets: chartDatasets,
              }}
            />
          </div>

          <SummaryData lines={lines} />
        </>
      ) : (
        /* Chart pane */
        <div className="pane flex-1 flex items-center justify-center text-sm text-stone-400">
          <p>Please select a Metro line.</p>
        </div>
      )}

      {/* Context log panel — only shown when events exist and a line is selected */}
      {transitEvents.length > 0 && chartDatasets.length > 0 && (
        <div className="pane">
          <button
            onClick={() => setIsContextLogOpen((o) => !o)}
            className="flex w-full items-center justify-between text-xs font-semibold text-stone-500 uppercase tracking-wider"
          >
            <span>Context Logs</span>
            <span>{isContextLogOpen ? '▴' : '▾'}</span>
          </button>
          {isContextLogOpen && (
            <ol className="flex flex-col gap-3 mt-3">
              {transitEvents.map((event) => (
                <li key={event.id} className="flex gap-3 text-sm">
                  <span className="text-stone-400 whitespace-nowrap shrink-0">
                    {formatEventDate(event.date)}
                  </span>
                  <div>
                    <p className="font-medium text-stone-700">{event.title}</p>
                    <p className="text-stone-500">{event.description}</p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* Map always visible below chart */}
      <div className="pane">
        <Map lines={lines} />
      </div>
    </div>
  );
}
