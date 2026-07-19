import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  type ChartOptions,
  type Plugin,
} from 'chart.js';
import colors from 'tailwindcss/colors';

export const hoverCrosshairPlugin: Plugin<'line'> = {
  id: 'hoverCrosshair',
  afterDraw(chart) {
    const active = chart.tooltip?.getActiveElements();
    if (!active?.length) return;
    const x = active[0].element.x;
    const {
      ctx,
      chartArea: { top, bottom },
    } = chart;
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

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  hoverCrosshairPlugin,
);

ChartJS.defaults.font.family = 'Overpass Mono Variable';
ChartJS.defaults.color = colors.stone['700'];

export const buildChartOptions = (): ChartOptions<'line'> => ({
  interaction: {
    axis: 'x',
    includeInvisible: false,
    intersect: false,
    mode: 'index',
  },
  /* The chart fills its dock panel, which resizes freely */
  maintainAspectRatio: false,
  plugins: {
    tooltip: {
      itemSort: (a, b) => (b.parsed.y ?? 0) - (a.parsed.y ?? 0),
    },
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
});
