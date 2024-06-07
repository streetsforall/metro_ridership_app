'use client';

import { useState } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
import {
  LineChart,
  Line,
  CartesianGrid,
  Legend,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import * as metrics from '@/app/ridership.json';

interface Metric {
  year: number;
  month: number;
  line_name: string;
  est_wkday_ridership: number;
  est_sat_ridership: number;
  est_sun_ridership: number;
}

type Inputs = {
  lines: string[];
  year: string;
  stat: keyof Metric;
};

export default function Charts() {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<Inputs>();
  const [data, setData] = useState([
    { name: 'Page A', uv: 400, pv: 2400, amt: 2400 },
  ]);
  const [selectedLines, setSelectedLines] = useState([]);
  const [selectedStat, setSelectedStat] = useState();

  const onSubmit: SubmitHandler<Inputs> = (formData) => {
    setSelectedLines(formData.lines);
    setSelectedStat(formData.stat);

    // Filter by year and lines
    const filtered = (metrics as Metric[]).filter((metric) => {
      const inLines = formData.lines.includes(metric.line_name);
      const inYear = metric.year === parseInt(formData.year);

      return inLines && inYear;
    });

    // Transform to { month, line }
    const transformed = filtered.map((item) => {
      return {
        month: item.month,
        [item.line_name]: item[selectedStat],
      };
    });

    const final = [
      { month: 1 },
      { month: 2 },
      { month: 3 },
      { month: 4 },
      { month: 5 },
      { month: 6 },
      { month: 7 },
      { month: 8 },
      { month: 9 },
      { month: 10 },
      { month: 11 },
      { month: 12 },
    ];

    // Transform to { month, ...line }
    transformed.forEach((element) => {
      const index = final.findIndex((item) => item.month === element.month);
      final[index] = {
        ...final[index],
        ...element,
      };
    });

    setData(final);
  };

  // Form options
  
  let lines = (metrics as Metric[]).map((metric) => metric.line_name);
  lines = lines.filter((value, index, array) => array.indexOf(value) === index);

  let years = (metrics as Metric[]).map((metric) => metric.year);
  years = years.filter((value, index, array) => array.indexOf(value) === index);

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

  return (
    <div className="h-screen max-w-screen-lg mx-auto">
      <form
        className="flex gap-8 items-start py-8"
        onSubmit={handleSubmit(onSubmit)}
      >
        <div>
          Line(s):
          <ul className="max-h-48 overflow-y-scroll">
            {lines.map((line, index) => {
              return (
                <li key={index} className="flex gap-2 items-center px-2">
                  <input
                    type="checkbox"
                    className="border"
                    id={line}
                    value={line}
                    {...register('lines')}
                  />
                  <label htmlFor={line}>{line}</label>
                </li>
              );
            })}
          </ul>
        </div>

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

      <ResponsiveContainer>
        <LineChart
          data={data}
          margin={{
            top: 10,
            right: 30,
            left: 0,
            bottom: 0,
          }}
        >
          {selectedLines.map((line) => (
            <Line key={line} type="monotone" dataKey={line} />
          ))}

          <CartesianGrid stroke="#ccc" />
          <XAxis
            dataKey="month"
            label={{ value: 'Month', offset: 0, position: 'bottom' }}
          />
          <YAxis
            label={{
              value: 'Avg Daily Ridership',
              angle: -90,
              position: 'insideLeft',
            }}
          />
          <Tooltip />
          <Legend />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
