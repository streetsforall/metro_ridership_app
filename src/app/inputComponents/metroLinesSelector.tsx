import * as Checkbox from '@radix-ui/react-checkbox';
import * as lines from '../data/metro_line_metadata_current.json';
import { useState } from 'react';

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
                <tr
                  key={index}
                  className="flex gap-2 items-center px-2 odd:bg-neutral-50 text-sm"
                >
                  <td className="line-selected-checkbox">
                    <Checkbox.Root
                      id={line.line.toString()}
                      onClick={() => onClickForSelectedCheckbox(line)}
                      checked={selectedLines.includes(line.line.toString())}
                      className="flex items-center justify-center bg-white data-[state=checked]:bg-neutral-500 border border-neutral-500 rounded-lg h-5 w-5 overflow-hidden"
                    >
                      <Checkbox.Indicator className="bg-neutral-500 rounded-lg h-full w-full" />
                    </Checkbox.Root>
                  </td>

                  <td className="w-full line-name">
                    <label
                      htmlFor={String(line.line)}
                      className="flex-1 block cursor-pointer py-2"
                    >
                      {line.mode === 'Bus'
                        ? `Line ${line.line}`
                        : line.mode === 'Rail'
                          ? `${railLetters.get(line.line)} Line`
                          : ''}
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
