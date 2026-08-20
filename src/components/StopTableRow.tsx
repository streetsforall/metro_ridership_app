import { memo } from 'react';
import * as Checkbox from '@radix-ui/react-checkbox';
import checkIcon from '../assets/check.svg';
import { formatRiders, formatShare } from '../utils/figures';
import type { StopReadout } from '../stops';

/**
 * One row of the ranked stop table, memoised because there are ~800 of them: a re-sort or
 * a single selection re-renders the table, and inline that reconciled every row's Radix
 * subtree along with it.
 *
 * Every prop is therefore a primitive or a reference the caller keeps stable. That is a
 * standing constraint: one fresh object per render here undoes the whole thing.
 */

/**
 * Spelled out rather than interpolated, because Tailwind scans source text for whole class
 * names and a `text-${align}` template produces a class that is never generated. It lives
 * here and the headers import it, so the dependency runs one way and never cycles.
 */
export const ALIGN_CLASS = { left: 'text-left', right: 'text-right' } as const;

export interface StopTableRowProps {
  /**
   * The row's figures. A stable reference: readouts come from `buildStopView`, and a
   * re-sort reorders the array without minting new objects.
   */
  readout: StopReadout;
  /**
   * The row's identity, `${lineId}-${stopKey}`. The line has to be in it because a stop on
   * two selected lines is two rows. React keys by this, so a re-sort re-parents an
   * already-mounted sparkline rather than remounting it.
   */
  rowKey: string;
  /** The display name of the line this row is measured on. */
  lineName: string;
  isSelected: boolean;
  /** Whether this adds or removes is the hook's question to answer. */
  onToggleStop: (stopKey: string) => void;
}

function StopTableRow({
  readout,
  rowKey,
  lineName,
  isSelected,
  onToggleStop,
}: StopTableRowProps) {
  /* One toggle for both routes in: the row and its checkbox. */
  const toggle = (): void => onToggleStop(readout.key);

  return (
    /* A click target but not a tab stop; the checkbox is the keyboard route, as in
       `LineTableRow`. Focusing both would put ~1600 stops in an 800-row table and announce
       every row twice. No `aria-current` either: it means "the current item in a set",
       which several selected rows are not — the checkbox says a row is selected. */
    <tr
      data-qa={`stop-row-${rowKey}`}
      onClick={toggle}
      className={`cursor-pointer ${
        isSelected ? 'bg-stone-200' : 'even:bg-[rgba(0,0,0,0.05)]'
      }`}
    >
      {/* The row's only visible statement that it is selected, and the keyboard route in.
          No `id`: the accessible name comes from `aria-label` rather than a `<label
          htmlFor>` as the line table's does. */}
      <td data-qa={`stop-select-${rowKey}`} className="w-10">
        <Checkbox.Root
          aria-label={`${readout.name} · ${lineName}`}
          checked={isSelected}
          onClick={(event) => {
            // The row is a click target too, so without this one click toggles twice.
            event.stopPropagation();
            toggle();
          }}
          className="flex items-center justify-center bg-white data-[state=checked]:bg-[#033056] mx-auto rounded p-0 h-5 w-5"
        >
          <Checkbox.Indicator>
            <img
              src={checkIcon}
              height={20}
              width={20}
              alt="Check"
              className="recolor-white"
            />
          </Checkbox.Indicator>
        </Checkbox.Root>
      </td>

      <td className="py-2">{readout.name}</td>
      <td className="whitespace-nowrap">{lineName}</td>
      <td className={ALIGN_CLASS.right}>
        {formatRiders(readout.averageBoardings)}
      </td>
      <td className={ALIGN_CLASS.right}>
        {formatRiders(readout.averageAlightings)}
      </td>
      <td className={ALIGN_CLASS.right}>{formatRiders(readout.netAverage)}</td>
      <td className={ALIGN_CLASS.right}>{formatShare(readout.shareOfLine)}</td>
    </tr>
  );
}

export default memo(StopTableRow);
