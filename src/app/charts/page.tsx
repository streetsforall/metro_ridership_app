'use client';

import { useState } from 'react';
import { useForm, Controller, SubmitHandler } from 'react-hook-form';
import {
  Chart as ChartJS,
  CategoryScale,
  Colors,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  type ChartDataset,
  type ChartOptions,
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import LineSelector from '../components/lineSelector';
import * as metrics from '@/app/ridership.json';

interface Metric {
  year: number;
  month: number;
  line_name: string;
  est_wkday_ridership: number | null;
  est_sat_ridership: number | null;
  est_sun_ridership: number | null;
}

// Associative array with line name as key
interface Aggregate {
  [key: string]: Metric[];
}

type Inputs = {
  lines: string[];
  year: string;
  stat: keyof Metric;
};

ChartJS.register(
  CategoryScale,
  Colors,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
);

export default function Charts() {
  const {
    control,
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Inputs>({
    defaultValues: {
      year: '2024',
      stat: 'est_wkday_ridership',
      lines: [],
    },
  });
  const [data, setData] = useState<
    ChartDataset<'line', { month: number; stat: string | number | null }[]>[]
  >([]);

  /**
   * Form options
   */
  const startYear = 2009;
  const endYear = 2024;

  let years = [];
  for (let i = startYear; i <= endYear; i++) {
    years.push(i);
  }

  const stats = [
    {
      name: 'Weekday',
      key: 'est_wkday_ridership',
    },
    {
      name: 'Saturday',
      key: 'est_sat_ridership',
    },
    {
      name: 'Sunday',
      key: 'est_sun_ridership',
    },
  ];

  /**
   * Update params on submit
   */
  const onSubmit: SubmitHandler<Inputs> = (formData) => {
    // Aggregate by line
    let aggregated: Aggregate = {};
    for (let i = 0; i < metrics.length; i++) {
      const metric: Metric = metrics[i];

      // Filter by year and lines
      const inLines = formData.lines.includes(metric.line_name);
      const inYear = metric.year === parseInt(formData.year);

      if (!inLines || !inYear) continue;

      if (!aggregated[metric.line_name]) {
        aggregated[metric.line_name] = [];
      }

      aggregated[metric.line_name].push(metric);
    }

    // Condense aggregated objects
    let datasets: ChartDataset<
      'line',
      { month: number; stat: string | number | null }[]
    >[] = [];
    Object.entries(aggregated).forEach(([line, metrics]) => {
      datasets.push({
        data: metrics.map((metric) => ({
          month: metric.month,
          stat: metric[formData.stat],
        })),
        label: `Line ${line}`,
      });
    });

    setData(datasets);
  };

  const options: ChartOptions<'line'> = {
    interaction: {
      axis: 'x',
      includeInvisible: false,
      intersect: true,
      mode: 'index',
    },
    parsing: {
      xAxisKey: 'month',
      yAxisKey: 'stat',
    },
    plugins: {
      colors: {
        forceOverride: true,
      },
    },
    responsive: true,
    scales: {
      x: {
        border: {
          color: '#fff',
        },
        ticks: {
          color: '#fff',
        },
        title: {
          color: '#fff',
          display: true,
          text: 'Month',
        },
      },
      y: {
        border: {
          color: '#fff',
        },
        grid: {
          color: '#222',
          drawTicks: false,
        },
        ticks: {
          color: '#fff',
        },
        title: {
          color: '#fff',
          display: true,
          text: 'Avg Daily Ridership',
        },
      },
    },
  };

  return (
    <div className="h-screen max-w-screen-lg mx-auto">
      <form
        className="flex gap-8 items-start py-8"
        onSubmit={handleSubmit(onSubmit)}
      >
        <LineSelector control={control} name="lines" />

        <div>
          Year:
          <ul className="max-h-48 overflow-y-scroll">
            {years.map((year, index) => {
              return (
                <li key={index} className="flex gap-2 items-center px-2">
                  <input
                    type="radio"
                    id={year.toString()}
                    value={year}
                    {...register('year')}
                  />
                  <label htmlFor={year.toString()}>{year}</label>
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          Day:
          <ul className="max-h-48 overflow-y-scroll">
            {stats.map((stat, index) => {
              return (
                <li key={index} className="flex gap-2 items-center px-2">
                  <input
                    type="radio"
                    id={stat.key}
                    value={stat.key}
                    {...register('stat')}
                  />
                  <label htmlFor={stat.key}>{stat.name}</label>
                </li>
              );
            })}
          </ul>
        </div>

        <input
          type="submit"
          value="Chart"
          className="border cursor-pointer px-4 py-2 rounded hover:bg-white hover:text-black"
        />
      </form>

      <Line
        options={options}
        data={{
          labels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
          datasets: data,
        }}
      />
    </div>
  );
}
