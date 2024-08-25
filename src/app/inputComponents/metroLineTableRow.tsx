import * as Checkbox from '@radix-ui/react-checkbox';
import { Line } from '../common/types';

interface MetroLineTableRowProps {
  selectedLines: string[];
  setSelectedLines: React.Dispatch<React.SetStateAction<Array<string>>>;
  expanded?: boolean;
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
  expanded,
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

  /* Stub line data */
  const avgRidership: number = 18002;
  const changeInRidership: number = 1203;
  const division: number = 3;

  const collapsedSelectorWrapperClasses =
    'flex gap-2 items-center px-2 odd:bg-neutral-50 text-sm';

  return (
    <>
      <tr className={expanded ? '' : collapsedSelectorWrapperClasses}>
        {/* Is Selected */}
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

        {/* Line name (ex: Line 2, B Line) */}
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

        {/* Average ridership over a duration (ex: 3 months) */}
        {expanded && <td>{avgRidership}</td>}

        {/* Change in ridership (ex: +1000, -200) */}
        {expanded && <td>{changeInRidership}</td>}

        {/* Division (ex: 3, 5) */}
        {expanded && <td>{division}</td>}

        {/* Ridership over time. Line graph showing ridership trend */}
        {expanded && <td></td>}

        {/* View Map hyperlink */}
        {expanded && <td>View Map</td>}
      </tr>
    </>
  );
}
