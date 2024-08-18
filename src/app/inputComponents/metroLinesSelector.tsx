import * as Checkbox from '@radix-ui/react-checkbox';
import * as lines from '../data/metro_line_metadata_current.json';
import { SetStateAction, useState } from 'react';
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

const railLetters = new Map([
  [801, 'A'],
  [802, 'B'],
  [803, 'C'],
  [804, 'E'],
  [805, 'D'],
  [806, 'L'],
  [807, 'K'],
]);

export default function LineSelector({
  selectedLines,
  setSelectedLines,
}: LineSelectorProps) {
  const [expanded, setExpanded] = useState<boolean>(false);

  const onClickForSelectedCheckbox = (line: Line): void => {
    setSelectedLines((prevSelectedLine) => {
      const selectedLinesCopy = [...prevSelectedLine];

      // Update checkbox value
      if (selectedLinesCopy.includes(line.line.toString())) {
        const pos = selectedLinesCopy.indexOf(line.line.toString());

        selectedLinesCopy.splice(pos, 1);
      } else {
        selectedLinesCopy.push(line.line.toString());
      }

      return selectedLinesCopy;
    });
  };

  return (
    /* Styled as flexbox so overflow scroll container stretches full height */
    <div className="flex flex-col gap-8 bg-white p-4 rounded-xl">
      <div className="flex gap-4 items-center">
        <span className="text-sm uppercase whitespace-nowrap">
          Line Selector
        </span>
        <button className="text-neutral-400 text-sm">Expand</button>
      </div>

      {/* Overflow scroll container */}
      <div className="overflow-y-auto">
        <table className="w-full">
          <tbody>
            {(lines as Line[]).map((line, index) => {
              return (
                <MetroLineTableRow
                  selectedLines={selectedLines}
                  key={index}
                  setSelectedLines={setSelectedLines}
                  line={line}
                ></MetroLineTableRow>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
