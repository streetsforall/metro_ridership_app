import { Fragment } from 'react';
import type { Line } from '../@types/lines.types';
import infoIcon from '../assets/info.svg';

interface SummaryDataProps {
  lines: Line[];
}

interface Stat {
  label: string;
  value: string;
  /** Rendered as a colored +/- badge beside the label. */
  delta?: number;
  labelledBy?: string;
}

/** Shown in place of a value the current selection has no data for. */
const NO_VALUE = '—';

function StatCard({ label, value, delta, labelledBy }: Stat) {
  return (
    <div className="rounded-lg bg-white ring-1 ring-stone-200 p-4">
      <div className="flex justify-between gap-2 mb-2 text-sm">
        <span className="text-stone-400 uppercase whitespace-nowrap">
          {label}
        </span>

        {delta !== undefined && (
          <span
            aria-label="Change"
            className={delta < 0 ? 'text-red-600' : 'text-green-600'}
          >
            {delta > 0 && '+'}
            {delta.toLocaleString()}
          </span>
        )}
      </div>
      <span aria-labelledby={labelledBy} className="tracking-tighter text-4xl">
        {value}
      </span>
    </div>
  );
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

  /* Not every line has an entry in line_distances.json, so the distance-derived
     stats keep their card and show a dash rather than disappearing. */
  const hasDistance = totalMiles > 0;

  const stats: Stat[] = [
    {
      label: 'Average Ridership',
      value: Math.round(averageDailyRidership).toLocaleString(),
      labelledBy: 'avg-ridership',
    },
    {
      label: 'Riders / Mile',
      value: hasDistance
        ? Math.round(averageDailyRidership / totalMiles).toLocaleString()
        : NO_VALUE,
    },
    {
      label: 'Total Miles',
      value: hasDistance ? totalMiles.toLocaleString() : NO_VALUE,
    },
    {
      label: 'Ending Ridership',
      value: Math.round(recentRidership).toLocaleString(),
      delta: changeInRidership,
      labelledBy: 'cur-ridership',
    },
  ];

  return (
    <div>
      {selectedLines.length > 0 && (
        <div className="flex flex-col gap-4">
          {/* auto-fit tracks size against the panel, not the viewport — the dock
              gives this component far less width than the old full-page row.
              The text block stays outside the grid so unused tracks collapse
              and the cards stretch to fill the row. */}
          <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]">
            {stats.map((stat) => (
              <StatCard key={stat.label} {...stat} />
            ))}
          </div>

          {/* Text */}
          <div className="flex flex-col gap-4 px-4 pb-4 text-sm">
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
