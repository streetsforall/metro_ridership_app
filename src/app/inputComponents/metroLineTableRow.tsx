import * as Checkbox from '@radix-ui/react-checkbox';
import { Line } from '../common/types';

interface MetroLineTableRowProps {
  setSelectedLines: React.Dispatch<React.SetStateAction<Line[]>>;
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
  setSelectedLines,
  line,
  expanded,
}: MetroLineTableRowProps) {
  const onClickForSelectedCheckbox = (line: Line): void => {
    setSelectedLines((prevLines: Line[]) => {
      const updatedLines = [...prevLines];

      // Update checkbox value
      const updateIndex = updatedLines.findIndex(
        (updatedLine: Line) => updatedLine.id === line.id,
      );
      const updatedLine: Line = { ...prevLines[updateIndex] };
      updatedLine.selected = !updatedLine.selected;
      updatedLines[updateIndex] = updatedLine;

      return updatedLines;
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
            id={line.id.toString()}
            onClick={() => onClickForSelectedCheckbox(line)}
            checked={line.selected}
            className="flex items-center justify-center bg-white data-[state=checked]:bg-neutral-500 border border-neutral-500 rounded-lg h-5 w-5 overflow-hidden"
          >
            <Checkbox.Indicator className="bg-neutral-500 rounded-lg h-full w-full" />
          </Checkbox.Root>
        </td>

        {/* Line name (ex: Line 2, B Line) */}
        <td className="w-full line-name">
          <label
            htmlFor={String(line.id)}
            className="flex-1 block cursor-pointer py-2"
          >
            {line.mode === 'Bus'
              ? `Line ${line.id}`
              : line.mode === 'Rail'
                ? `${railLetters.get(line.id)} Line`
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
