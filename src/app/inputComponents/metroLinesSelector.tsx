import { useState } from 'react';
import { Line } from '../common/types';
import * as lines from '../data/metro_line_metadata_current.json';
import MetroLineTableRow from './metroLineTableRow';

interface LineJson {
  line: number;
  mode: string;
  provider: string;
}

interface LineSelectorProps {
  lines: Line[];
  setLines: React.Dispatch<React.SetStateAction<Line[]>>;
  expanded: boolean;
  setExpanded: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function LineSelector({
  lines: selectedLines,
  setLines,
  expanded,
  setExpanded,
}: LineSelectorProps) {
  const onExpandClick = (): void => {
    setExpanded((prevExpanded: boolean) => {
      return !prevExpanded;
    });
  };

  const subtitleClass = 'text-neutral-400';

  return (
    /* Styled as flexbox so overflow scroll container stretches full height */
    <div className="flex flex-col gap-8 bg-white p-4 rounded-xl">
      <div className="flex gap-4 items-center">
        <span className="text-sm uppercase whitespace-nowrap">
          Line Selector
        </span>
        <button className={`${subtitleClass} text-sm`} onClick={onExpandClick}>
          {expanded ? 'Hide' : 'Expand'}
        </button>
      </div>

      {/* Overflow scroll container */}
      <div className="overflow-y-auto">
        <table className="w-full">
          {/* Only show table header when line selector is expanded */}
          {expanded && (
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }} className={subtitleClass}>
                  Selected
                </th>
                <th style={{ textAlign: 'left' }} className={subtitleClass}>
                  Line
                </th>
                <th style={{ textAlign: 'left' }} className={subtitleClass}>
                  Avg. Ridership
                </th>
                <th style={{ textAlign: 'left' }} className={subtitleClass}>
                  Change
                </th>
                <th style={{ textAlign: 'left' }} className={subtitleClass}>
                  Division
                </th>
                <th style={{ textAlign: 'left' }} className={subtitleClass}>
                  Ridership over time
                </th>
                {/* Empty for View Map */}
                <th></th>
              </tr>
            </thead>
          )}

          <tbody>
            {selectedLines.map((line) => {
              return (
                <MetroLineTableRow
                  key={line.id}
                  setSelectedLines={setLines}
                  line={line}
                  expanded={expanded}
                ></MetroLineTableRow>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
