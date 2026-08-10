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

  const totalMiles = selectedLines.reduce(
    (sum, line) => sum + (line.distanceMiles ?? 0),
    0,
  );
  const ridersPerMile =
    totalMiles > 0 ? averageDailyRidership / totalMiles : undefined;

  return (
    <div id="summary-data">
      {/**
       * Three layouts, widest last. Below `sm` the tiles stack: two columns do
       * not fit a 390px phone, because each `.pane` carries 4rem of horizontal
       * padding and a `whitespace-nowrap` label, giving it a min-content width
       * of ~262px against a ~171px track — and a `1fr` track has to honour
       * min-content, so the page scrolls sideways. `lg:flex` restores the
       * single row. Deliberately not `xl:flex-nowrap`: an unwrappable row hands
       * the surrounding `1fr` grid track its full min-content width and
       * overflows the page (see OutputArea's min-w-0).
       */}
      {selectedLines.length > 0 && (
        <div className="grid grid-cols-[1fr] sm:grid-cols-[1fr_1fr] lg:flex flex-wrap gap-4 items-center">
          {/* Stats */}
          {/* TODO: Refactor into component */}
          <div className="pane">
            <div className="flex justify-between mb-2 lg:min-w-56 text-sm">
              <span className="text-stone-400 uppercase whitespace-nowrap">
                Average Ridership
              </span>
            </div>
            <span
              aria-labelledby="avg-ridership"
              className="tracking-tighter text-3xl lg:text-5xl"
            >
              {Math.round(averageDailyRidership).toLocaleString()}
            </span>
          </div>

          {ridersPerMile !== undefined && (
            <div className="pane">
              <div className="flex justify-between mb-2 lg:min-w-56 text-sm">
                <span className="text-stone-400 uppercase whitespace-nowrap">
                  Riders / Mile
                </span>
              </div>
              <span className="tracking-tighter text-3xl lg:text-5xl">
                {Math.round(ridersPerMile).toLocaleString()}
              </span>
            </div>
          )}

          {totalMiles > 0 && (
            <div className="pane">
              <div className="flex justify-between mb-2 lg:min-w-56 text-sm">
                <span className="text-stone-400 uppercase whitespace-nowrap">
                  Total Miles
                </span>
              </div>
              <span className="tracking-tighter text-3xl lg:text-5xl">
                {totalMiles.toLocaleString()}
              </span>
            </div>
          )}

          <div className="pane">
            <div className="flex justify-between mb-2 lg:min-w-56 text-sm">
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
              className="tracking-tighter text-3xl lg:text-5xl"
            >
              {Math.round(recentRidership).toLocaleString()}
            </span>
          </div>

          {/* Text */}
          <div className="basis-full flex flex-col col-span-full gap-4 p-4 text-sm max-w-[54rem]">
            <p>
              <span className="font-bold mr-1">Selected:</span>

              {selectedLines.length > 0 &&
                selectedLines.map((visibleLine: Line, index: number) => {
                  const { name, id } = visibleLine;

                  return (
                    <Fragment key={id}>
                      {name}

                      {index !== selectedLines.length - 1 && ', '}
                    </Fragment>
                  );
                })}
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
                given month. Averages and changes are calculated over each
                line&rsquo;s own available months within the selected period,
                which can differ from line to line.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
