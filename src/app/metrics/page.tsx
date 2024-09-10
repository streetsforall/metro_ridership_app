'use client';

import { useState } from 'react';
import { useForm, SubmitHandler } from 'react-hook-form';
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

export default function Metrics() {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<Inputs>();
  const [total, setTotal] = useState(0);

  const onSubmit: SubmitHandler<Inputs> = (data) => {
    const filtered = (metrics as Metric[]).filter((metric) => {
      const inLines = data.lines.includes(metric.line_name);
      const inYear = metric.year === parseInt(data.year);

      return inLines && inYear;
    });

    const total = filtered.reduce((prev: number, curr: Metric) => {
      // @ts-ignore
      return prev + curr[data.stat];
    }, 0);

    setTotal(total);
  };

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
    <div className="max-w-screen-lg mx-auto">
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
          value="Calculate"
          className="border cursor-pointer px-4 py-2 rounded hover:bg-white hover:text-black"
        />
      </form>

      <div className="font-bold mt-8 text-4xl">
        Ridership: {total.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
      </div>
    </div>
  );
}
