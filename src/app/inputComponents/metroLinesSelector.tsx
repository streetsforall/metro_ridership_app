import { LineMetricDataset, Metric } from '../charts/page';
import { getLineName } from '../common/lines';
import { type Line } from '../common/types';
import MetroLineTableRow from './metroLineTableRow';

interface LineSelectorProps {
  lineMetricDataset: LineMetricDataset;
  lines: Line[];
  onToggleSelectLine: (line: Line) => void;
  expanded: boolean;
  setExpanded: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function LineSelector({
  lineMetricDataset,
  lines,
  onToggleSelectLine,
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
            {lines
              .sort((a, b) => {
                const nameA = getLineName(a.id);
                const nameB = getLineName(b.id);

                // Lettered lines should come first
                if (nameA.startsWith('Line') && !nameB.startsWith('Line')) {
                  return 1;
                }
                if (!nameA.startsWith('Line') && nameB.startsWith('Line')) {
                  return -1;
                }

                // Numbered lines should be in numerical order (e.g., 2 before 10)
                if (nameA.startsWith('Line') && nameB.startsWith('Line')) {
                  return a.id - b.id;
                }

                // Lettered lines should be in alphabetical order
                if (nameA < nameB) {
                  return -1;
                }
                if (nameA > nameB) {
                  return 1;
                }

                // Names must be equal
                return 0;
              })
              .map((line) => {
                const lineMetrics: Metric[] = lineMetricDataset[line.id];

                return (
                  <MetroLineTableRow
                    lineMetrics={lineMetrics}
                    key={line.id}
                    onToggleSelectLine={onToggleSelectLine}
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
