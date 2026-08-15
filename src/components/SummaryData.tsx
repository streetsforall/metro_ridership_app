import { Fragment } from 'react';
import type { LineReadout } from '../ridership';
import infoIcon from '../assets/info.svg';

interface SummaryDataProps {
  lines: LineReadout[];
}

export default function SummaryData({ lines }: SummaryDataProps) {
  const selectedLines = lines.filter(
    (visibleLine: LineReadout) => visibleLine.selected,
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
    <div id="summary-panel">
      {/**
       * Two layouts. Below `sm` the tiles stack in one column: two do not fit a
       * 390px phone, because each `.pane` carries 4rem of horizontal padding,
       * giving it a min-content width larger than its ~171px track — and a
       * `1fr` track has to honour min-content, so the page scrolls sideways.
       * From `sm` up they sit two-by-two and stay that way.
       *
       * There was a third layout: `lg:flex flex-wrap` put all four in one row
       * once the viewport was wide enough. That is gone because the panel is no
       * longer full-width — it shares its row with the map and gets ~40% of it,
       * around 360px, which is a two-column width and never a four-column one.
       * The tiles shed their `lg:min-w-56` and most of their padding for the
       * same reason: 224px of declared minimum inside a ~170px tile is an
       * overflow, not a layout.
       *
       * The tiles are their own grid so the four stay one size. `auto-rows-fr`
       * gives every row the same height and `1fr 1fr` the same width, so a tile
       * whose label wraps to two lines — "Average Ridership" — or that carries a
       * change figure — "Ending Ridership" — no longer stands taller than the
       * one beside it. Each tile then spaces its own label and figure apart, so
       * the four figures sit on a common baseline. The explanatory text cannot
       * be in this grid: an equal-height row is exactly wrong for a paragraph.
       */}
      {selectedLines.length > 0 && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[1fr] sm:grid-cols-[1fr_1fr] auto-rows-fr gap-4">
            {/* Stats */}
            {/* TODO: Refactor into component */}
            <div className="pane lg:p-4 flex flex-col justify-between">
              <div className="flex flex-wrap justify-between gap-x-2 mb-2 text-sm">
                <span className="text-stone-400 uppercase">
                  Average Ridership
                </span>
              </div>
              <span
                aria-labelledby="avg-ridership"
                className="tracking-tighter text-3xl"
              >
                {Math.round(averageDailyRidership).toLocaleString()}
              </span>
            </div>

            {ridersPerMile !== undefined && (
              <div className="pane lg:p-4 flex flex-col justify-between">
                <div className="flex flex-wrap justify-between gap-x-2 mb-2 text-sm">
                  <span className="text-stone-400 uppercase">
                    Riders / Mile
                  </span>
                </div>
                <span className="tracking-tighter text-3xl">
                  {Math.round(ridersPerMile).toLocaleString()}
                </span>
              </div>
            )}

            {totalMiles > 0 && (
              <div className="pane lg:p-4 flex flex-col justify-between">
                <div className="flex flex-wrap justify-between gap-x-2 mb-2 text-sm">
                  <span className="text-stone-400 uppercase">Total Miles</span>
                </div>
                <span className="tracking-tighter text-3xl">
                  {totalMiles.toLocaleString()}
                </span>
              </div>
            )}

            <div className="pane lg:p-4 flex flex-col justify-between">
              <div className="flex flex-wrap justify-between gap-x-2 mb-2 text-sm">
                <span className="text-stone-400 uppercase">
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
                className="tracking-tighter text-3xl"
              >
                {Math.round(recentRidership).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Text */}
          <div className="flex flex-col gap-4 p-4 text-sm max-w-[54rem]">
            <p>
              <span className="font-bold mr-1">Selected:</span>

              {selectedLines.length > 0 &&
                selectedLines.map((visibleLine: LineReadout, index: number) => {
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
