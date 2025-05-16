'use client';

import { type Line } from '../common/types';
import { Label } from '@radix-ui/react-label';
import Image from 'next/image';
import React, { Fragment } from 'react';

interface SummaryDataProps {
  visibleLines: Line[];
}

export default function SummaryData(props: SummaryDataProps) {
  const { visibleLines } = props;

  const visibleAndSelectedLines = visibleLines.filter(
    (visibleLine: Line) => visibleLine.selected,
  );

  const changeInRidership = visibleAndSelectedLines
    .map((line) => line.changeInRidership ?? 0)
    .reduce(
      (totalChangeInRidership, currLineChangeInRidership) =>
        totalChangeInRidership + currLineChangeInRidership,
      0,
    );

  const averageDailyRidership = visibleAndSelectedLines
    .map((line) => line.averageRidership ?? 0)
    .reduce(
      (totalAvgRidership, currLineAvgRidership) =>
        totalAvgRidership + currLineAvgRidership,
      0,
    );

  const recentRidership = visibleAndSelectedLines
    .map((line) => line.endingRidership ?? 0)
    .reduce(
      (totalRecentRidership, currRecentRidership) =>
        totalRecentRidership + currRecentRidership,
      0,
    );

  return (
    <div>
      {visibleAndSelectedLines.length > 0 && (
        <div className="flex gap-4 items-center">
          {/* Stats */}
          {/* TODO: Refactor into component */}
          <div className="pane">
            <div className="flex justify-between mb-2 min-w-48 text-sm">
              <span className="text-stone-500">Average Ridership</span>
            </div>
            <span aria-labelledby="avg-ridership" className="text-5xl">
              {Math.round(averageDailyRidership).toLocaleString()}
            </span>
          </div>

          <div className="pane">
            <div className="flex justify-between mb-2 min-w-48 text-sm">
              <span className="text-stone-500">Current Ridership</span>

              <span
                aria-label="Change"
                className={
                  changeInRidership < 0 ? 'text-red-600' : 'text-green-600'
                }
              >
                {changeInRidership > 0 && '+'}
                {changeInRidership.toLocaleString()}
              </span>
            </div>
            <span aria-labelledby="cur-ridership" className="text-5xl">
              {Math.round(recentRidership).toLocaleString()}
            </span>
          </div>

          {/* Text */}
          <div className="flex flex-col gap-4 p-4 text-sm">
            <p>
              <span className="font-bold mr-1">Selected:</span>

              {visibleAndSelectedLines.length > 0 &&
                visibleAndSelectedLines.map(
                  (visibleLine: Line, index: number) => {
                    const { name, id } = visibleLine;

                    return (
                      <Fragment key={id}>
                        {name}

                        {index !== visibleAndSelectedLines.length - 1 && ', '}
                      </Fragment>
                    );
                  },
                )}
            </p>

            <div className="flex gap-2 items-start">
              <Image
                src="/info.svg"
                height={20}
                width={20}
                alt=""
                unoptimized
                className="mt-1"
              />
              <p>
                Ridership numbers represent daily rider counts averaged over a
                given month. Averages and changes represent calculations across
                the current selected time period.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
