import { memo } from 'react';
import * as Checkbox from '@radix-ui/react-checkbox';
import StopSparkline from './StopSparkline';
import checkIcon from '../assets/check.svg';
import { formatRiders, formatShare } from '../utils/figures';
import type { StopReadout } from '../stops';
import type { StopSeriesIndex } from '../utils/stopSeries';
import type { StopMeasure } from '../@types/stops.types';

/**
 * One row of the ranked stop table.
 *
 * **Its own memoised component because of how the table learns what is visible.**
 * `useVisibleRows` keeps the visible set in React state, so every IntersectionObserver
 * batch re-renders `StopTable` — dozens of times during one scroll. Inline, that
 * reconciled all ~800 rows each time, eight cells and a Radix subtree apiece, plus a
 * Chart.js sparkline for every row already mounted. Behind `memo` only the row that
 * actually changed does any work.
 *
 * Every prop is therefore either a primitive or a reference the caller keeps stable, and
 * that is a standing constraint rather than an incidental fact: one fresh object or arrow
 * per render here would put the whole table back where it started.
 */

/**
 * Spelled out rather than interpolated: Tailwind scans source text for whole class names,
 * so a `text-${align}` template produces a class that is never generated.
 *
 * It lives here, and the table's headers import it, so that the dependency runs one way —
 * `StopTable` → `StopTableRow` — and the two never form a cycle.
 */
export const ALIGN_CLASS = { left: 'text-left', right: 'text-right' } as const;

export interface StopTableRowProps {
  /**
   * The row's figures. A stable reference: the readouts come from `buildStopView` and a
   * re-sort reorders the array without minting new objects.
   */
  readout: StopReadout;
  /**
   * The row's identity, `${lineId}-${stopKey}`.
   *
   * The line has to be in it: a stop serving two selected lines is two rows, and a stop
   * key alone would name them both. React keys by this, so a re-sort re-parents an
   * already-mounted sparkline rather than remounting it, and every `data-qa` below is
   * suffixed with it.
   */
  rowKey: string;
  /** The display name of the line this row is measured on. */
  lineName: string;
  isSelected: boolean;
  /** Whether the row has been scrolled to, and so whether its sparkline is drawn. */
  isVisible: boolean;
  /**
   * The panel's one series index, passed rather than the series itself.
   *
   * `seriesFor` aligns a pair's months on first call and caches the result, deliberately
   * so — see `buildStopSeriesIndex`. Resolving the series in the parent's map would align
   * all ~800 pairs up front, doing that work for rows nobody scrolls to. Asking here, and
   * only when the row is visible, keeps that deferral intact; the index itself is
   * memoised by `StopPanel`, so it is as stable a prop as the array would have been.
   */
  seriesIndex: StopSeriesIndex;
  measure: StopMeasure;
  /** Whether this adds or removes is the selection's question, asked of the hook. */
  onToggleStop: (stopKey: string) => void;
  /**
   * The `ref` callback for the observed cell, from `visibleRows.observe(rowKey)`, which
   * caches one callback per key.
   */
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
  /* One toggle for both routes in — the row and its checkbox. */
  const toggle = (): void => onToggleStop(readout.key);

  return (
    /* The whole row is a click target, but **not a tab stop**. The checkbox inside it is
       the keyboard route, as it is in `LineTableRow`: focusing both would put ~1600 stops
       in an 800-row table and announce every row twice, and the row itself carries no
       role saying it is actionable.

       No `aria-current` either — it means "the current item in a set", which several
       selected rows are not. The checkbox's checked state says a row is selected, in the
       one place a reader looks for that answer. */
    <tr
      data-qa={`stop-row-${rowKey}`}
      onClick={toggle}
      className={`cursor-pointer ${
        isSelected ? 'bg-stone-200' : 'even:bg-[rgba(0,0,0,0.05)]'
      }`}
    >
      {/* The row's only visible statement of whether it is selected, and the one route in
          from the keyboard.

          No `id`: the accessible name comes from `aria-label` here rather than from a
          `<label htmlFor>` as the line table's does. */}
      <td data-qa={`stop-select-${rowKey}`} className="w-10">
        <Checkbox.Root
          aria-label={`${readout.name} · ${lineName}`}
          checked={isSelected}
          onClick={(event) => {
            // The row is a click target too, so without this one click would toggle
            // twice and land back where it started.
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

      {/* The observed box is the whole cell, so the ref goes here. The cell has no
          accessible text on purpose: a canvas is opaque to assistive tech regardless, and
          the figures beside it carry the information. */}
      <td data-qa={`stop-sparkline-${rowKey}`} ref={observe}>
        {/* The same box whether or not the chart has mounted, so a sparkline arriving
            never moves the rows below it. */}
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
