import * as Checkbox from '@radix-ui/react-checkbox';
import { Line } from '../common/types';
import { Metric } from '../charts/page';

interface MetroLineTableRowProps {
  onToggleSelectLine: (line: Line) => void;
  expanded?: boolean;
  line: Line;
  lineMetrics: Metric[];
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
  onToggleSelectLine,
  line,
  expanded,
}: MetroLineTableRowProps) {
  /* Stub line data */
  const avgRidership: number = -1;
  const changeInRidership: number = -1;
  const division: number = -1;

  const collapsedSelectorWrapperClasses =
    'flex gap-2 items-center px-2 odd:bg-neutral-50 text-sm';

  return (
    <>
      <tr className={expanded ? '' : collapsedSelectorWrapperClasses}>
        {/* Is Selected */}
        <td className="line-selected-checkbox">
          <Checkbox.Root
            id={line.id.toString()}
            onClick={() => onToggleSelectLine(line)}
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
        {expanded && (
          <td>{Math.round(line.averageRidership ?? avgRidership)}</td>
        )}

        {/* Change in ridership (ex: +1000, -200) */}
        {expanded && <td>{line.changeInRidership ?? changeInRidership}</td>}

        {/* Division (ex: 3, 5) */}
        {expanded && <td>{line.division ?? division}</td>}

        {/* Ridership over time. Line graph showing ridership trend */}
        {expanded && <td></td>}

        {/* View Map hyperlink */}
        {expanded && <td>View Map</td>}
      </tr>
    </>
  );
}
