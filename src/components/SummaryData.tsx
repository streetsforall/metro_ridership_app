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
    <div className="summary-card grow basis-44 rounded-lg bg-[#f8f6f1] p-4">
      <div className="flex justify-between gap-2 mb-2 text-sm">
        <span className="summary-card-label text-stone-400 uppercase whitespace-nowrap">
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
      <span
        aria-labelledby={labelledBy}
        className="summary-card-value tracking-tighter text-4xl"
      >
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
    <div className="summary-stats">
      {selectedLines.length > 0 && (
        /* One wrapping row: the cards and the text block sit side by side when
           the panel can afford it, and drop onto their own lines when it can't.
           Sizing comes from each item's flex-basis, so this reflows on the
           PANEL's width — the original `xl:flex-nowrap` keyed off the viewport
           instead, which is why cards overflowed once the dock made this column
           narrower than the screen. */
        <div className="flex flex-wrap gap-4 items-center">
          {stats.map((stat) => (
            <StatCard key={stat.label} {...stat} />
          ))}

          {/* Text */}
          {/* No bottom padding: PanelChrome's p-8 already supplies it. */}
          <div className="summary-note grow basis-80 flex flex-col gap-2 px-4 text-sm">
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
