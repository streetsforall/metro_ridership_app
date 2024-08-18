import * as Checkbox from '@radix-ui/react-checkbox';
import * as lines from '../data/metro_line_metadata_current.json';
import { useState } from 'react';

interface Line {
  line: number;
  mode: 'Bus' | 'Rail';
  provider: 'DO' | 'PT';
}

interface MetroLineTableRowProps {
  selectedLines: string[];
  setSelectedLines: React.Dispatch<React.SetStateAction<Array<string>>>;
  isExpanded?: boolean;
  line: Line;
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

export default function MetroLineTableRow({
  selectedLines,
  setSelectedLines,
  line,
}: MetroLineTableRowProps) {
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
    <>
      <tr className="flex gap-2 items-center px-2 odd:bg-neutral-50 text-sm">
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
    </>
  );
}
