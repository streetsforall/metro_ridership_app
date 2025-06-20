import { Fragment } from 'react';
import type { Line } from '../@types/lines.types';
import infoIcon from '../assets/info.svg';

interface SummaryDataProps {
  lines: Line[];
}

export default function SummaryData({ lines }: SummaryDataProps) {
  const selectedLines = lines.filter(
    (visibleLine: Line) => visibleLine.selected,
  );

  const changeInRidership = selectedLines
    .map((line) => line.changeInRidership ?? 0)
    .reduce(
      (totalChangeInRidership, currLineChangeInRidership) =>
        totalChangeInRidership + currLineChangeInRidership,
      0,
    );

  const averageDailyRidership = selectedLines
    .map((line) => line.averageRidership ?? 0)
    .reduce(
      (totalAvgRidership, currLineAvgRidership) =>
        totalAvgRidership + currLineAvgRidership,
      0,
    );

  const recentRidership = selectedLines
    .map((line) => line.endingRidership ?? 0)
    .reduce(
      (totalRecentRidership, currRecentRidership) =>
        totalRecentRidership + currRecentRidership,
      0,
    );

  return (
    <div>
      {selectedLines.length > 0 && (
        <div className="flex flex-wrap xl:flex-nowrap gap-4 items-center">
          {/* Stats */}
          {/* TODO: Refactor into component */}
          <div className="pane">
            <div className="flex justify-between mb-2 min-w-56 text-sm">
              <span className="text-stone-400 uppercase whitespace-nowrap">
                Average Ridership
              </span>
            </div>
            <span
              aria-labelledby="avg-ridership"
              className="tracking-tighter text-5xl"
            >
              {Math.round(averageDailyRidership).toLocaleString()}
            </span>
          </div>

          <div className="pane">
            <div className="flex justify-between mb-2 min-w-56 text-sm">
              <span className="text-stone-400 uppercase whitespace-nowrap">
                Ending Ridership
              </span>

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
            <span
              aria-labelledby="cur-ridership"
              className="tracking-tighter text-5xl"
            >
              {Math.round(recentRidership).toLocaleString()}
            </span>
          </div>

          {/* Text */}
          <div className="basis-full xl:basis-auto flex flex-col gap-4 p-4 text-sm">
            <p>
              <span className="font-bold mr-1">Selected:</span>

              {selectedLines.length > 0 &&
                selectedLines.map(
                  (visibleLine: Line, index: number) => {
                    const { name, id } = visibleLine;

                    return (
                      <Fragment key={id}>
                        {name}

                        {index !== selectedLines.length - 1 && ', '}
                      </Fragment>
                    );
                  },
                )}
            </p>

            <div className="flex gap-2 items-start">
              <img
                src={infoIcon}
                height={20}
                width={20}
                alt=""
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
