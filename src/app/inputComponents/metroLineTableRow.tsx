import * as Checkbox from '@radix-ui/react-checkbox';
import { getLineName } from '../common/lines';
import { type Line } from '../common/types';
import { Metric } from '../charts/page';

interface MetroLineTableRowProps {
  onToggleSelectLine: (line: Line) => void;
  expanded?: boolean;
  line: Line;
  lineMetrics: Metric[];
}

const NotDefined = 'Not Defined';

export default function MetroLineTableRow({
  onToggleSelectLine,
  line,
  expanded,
}: MetroLineTableRowProps) {
  const collapsedSelectorWrapperClasses =
    'flex gap-2 items-center px-2 odd:bg-neutral-50 text-sm';

  return (
    <>
      <tr
        className={
          expanded ? 'odd:bg-neutral-50' : collapsedSelectorWrapperClasses
        }
      >
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
            {getLineName(line.id)}
          </label>
        </td>

        {/* Average ridership over a duration (ex: 3 months) */}
        {expanded && (
          <td>
            {!!line.averageRidership
              ? Math.round(line.averageRidership).toLocaleString()
              : NotDefined}
          </td>
        )}

        {/* Change in ridership (ex: +1000, -200) */}
        {expanded && <td>{line.changeInRidership ?? NotDefined}</td>}

        {/* Division (ex: 3, 5) */}
        {/* {expanded && <td>{line.division ?? division}</td>} */}

        {/* Ridership over time. Line graph showing ridership trend */}
        {expanded && <td></td>}

        {/* View Map hyperlink */}
        {expanded && <td>View Map</td>}
      </tr>
    </>
  );
}
