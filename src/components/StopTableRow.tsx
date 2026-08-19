import { memo } from 'react';
import * as Checkbox from '@radix-ui/react-checkbox';
import StopSparkline from './StopSparkline';
import checkIcon from '../assets/check.svg';
import { formatRiders, formatShare } from '../utils/figures';
import type { StopReadout } from '../stops';
import type { StopSeriesIndex } from '../utils/stopSeries';
import type { StopMeasure } from '../@types/stops.types';

/**
 * One row of the ranked stop table, memoised because all ~800 of them re-render on every
 * IntersectionObserver batch — every prop has to be a primitive or a stable reference.
 */

/** Spelled out rather than interpolated, because Tailwind only generates whole class names. */
export const ALIGN_CLASS = { left: 'text-left', right: 'text-right' } as const;

export interface StopTableRowProps {
  /** The row's figures, a stable reference straight from `buildStopView`. */
  readout: StopReadout;
  /** The row's identity, line included, because one stop on two selected lines is two rows. */
  rowKey: string;
  /** The display name of the line this row is measured on. */
  lineName: string;
  isSelected: boolean;
  /** Whether the row has been scrolled to, and so whether its sparkline is drawn. */
  isVisible: boolean;
  /**
   * The panel's one series index, passed rather than the series itself. `seriesFor` aligns
   * a pair's months on first call and caches the result, so resolving in the parent's map
   * would align all ~800 pairs up front for rows nobody scrolls to. Asking here, only when
   * the row is visible, keeps that deferral; the index is memoised by `StopPanel`.
   */
  seriesIndex: StopSeriesIndex;
  measure: StopMeasure;
  /** Whether this adds or removes is the hook's question to answer. */
  onToggleStop: (stopKey: string) => void;
  /** The observed cell's `ref`, from `visibleRows.observe(rowKey)` — one per key. */
  observe: (element: Element | null) => void;
}

function StopTableRow({
  readout,
  rowKey,
  lineName,
  isSelected,
  isVisible,
  seriesIndex,
  measure,
  onToggleStop,
  observe,
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
      {/* The row's only visible statement that it is selected, and the keyboard route in. */}
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

      {/* The observed box is the whole cell. No accessible text on purpose: a canvas is
          opaque to assistive tech anyway, and the figures beside it carry the same
          information. */}
      <td data-qa={`stop-sparkline-${rowKey}`} ref={observe}>
        {/* The same box whether or not the chart has mounted, so a sparkline arriving
            never moves the rows below. */}
        <div className="h-10 w-52">
          {isVisible && (
            <StopSparkline
              series={seriesIndex.seriesFor(readout.key, readout.line_name)}
              measure={measure}
              lineId={readout.line_name}
            />
          )}
        </div>
      </td>
    </tr>
  );
}

export default memo(StopTableRow);
