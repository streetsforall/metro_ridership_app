import * as lines from '../data/metro_line_metadata_current.json';
import { useState } from 'react';
import MetroLineTableRow from './metroLineTableRow';

interface Line {
  line: number;
  mode: 'Bus' | 'Rail';
  provider: 'DO' | 'PT';
}

interface LineSelectorProps {
  selectedLines: string[];
  setSelectedLines: React.Dispatch<React.SetStateAction<Array<string>>>;
}

export default function LineSelector({
  selectedLines,
  setSelectedLines,
}: LineSelectorProps) {
  const [expanded, setExpanded] = useState<boolean>(false);

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
          {expanded ? 'Collapse' : 'Expand'}
        </button>
      </div>

      {/* Overflow scroll container */}
      <div className="overflow-y-auto">
        <table className="w-full">
          {/* Only show table header when line selector is expanded */}
          {expanded && (
            <thead>
              <tr>
                <th className={subtitleClass}>Selected</th>
              </tr>
              <tr>
                <th className={subtitleClass}>Line</th>
              </tr>
              <tr>
                <th className={subtitleClass}>Avg. Ridership</th>
              </tr>
              <tr>
                <th className={subtitleClass}>Change</th>
              </tr>
              <tr>
                <th className={subtitleClass}>Division</th>
              </tr>
              <tr>
                <th className={subtitleClass}>Ridership over time</th>
              </tr>
              <tr>
                {/* Empty for View Map */}
                <th></th>
              </tr>
            </thead>
          )}

          <tbody>
            {(lines as Line[]).map((line, index) => {
              return (
                <MetroLineTableRow
                  selectedLines={selectedLines}
                  key={index}
                  setSelectedLines={setSelectedLines}
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
