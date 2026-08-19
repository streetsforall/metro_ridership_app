import {
  maxMonth,
  minMonth,
  monthCount,
} from 'virtual:stop-ridership-manifest';
import { formatEventDate } from '../chart';
import { dataMaxYear, dataMinYear } from '../utils/dataDateRange';
import type { StopCoverageState } from '../utils/stopCoverage';

/**
 * The Stop Coverage Window against the Month Window, said out loud.
 *
 * The panel's biggest usability risk, and why this is its own component. The chart spans
 * 2009 → 2026 and stop data spans twelve months inside it, so a reader who drags to 2015
 * and finds an empty table has been handed a broken panel unless the panel says what it
 * covers. The span is therefore stated **persistently**, not only when something is
 * missing, and it comes from `virtual:stop-ridership-manifest` — filled at build time,
 * which is what lets the sentence be true before any payload is fetched.
 *
 * **It never clamps or widens the Month Window**, because the window is what the reader
 * chose and what a shared link carries (ADR-0001). The no-overlap state offers a button
 * instead, through the same setters a drag across the chart uses.
 *
 * **It states no window rule of its own**: `stopCoverageState` reads the derivation's
 * answers rather than comparing anything against the window (ADR-0009).
 */

/** `"2025-07"` → `"Jul 2025"`. Absent months read as an em dash rather than "null". */
const monthLabel = (month: string | null): string =>
  month ? formatEventDate(month) : '—';

/** The build-time span, for the sentence that must be true before any fetch. */
const coveredSpan = `${monthLabel(minMonth)} – ${monthLabel(maxMonth)}`;

export interface StopCoverageNoticeProps {
  state: StopCoverageState;
  /** The Stop View's month axis, for the partial-coverage label. */
  months: readonly string[];
  /** Set the Month Window to the Stop Coverage Window. `YYYY-MM` both ends. */
  onUseCoverageWindow: (from: string, to: string) => void;
}

export default function StopCoverageNotice({
  state,
  months,
  onUseCoverageWindow,
}: StopCoverageNoticeProps) {
  /**
   * Whether stop data exists **at all** is the manifest's answer, not the view's.
   *
   * The view reports empty coverage while a payload is in flight and again if one
   * fails, so deciding this from `coverage` would tell a reader on a slow connection
   * that the dataset had never been ingested. The manifest is filled from the files at
   * build time, so it is right before the first fetch and right if every fetch fails.
   */
  if (minMonth === null)
    return (
      <p className="text-sm text-stone-400" data-qa="stop-coverage-no-data">
        No stop-level data has been ingested yet.
      </p>
    );

  return (
    <>
      <p className="text-xs text-stone-500" data-qa="stop-coverage-span">
        Stop-level data covers {coveredSpan} ({monthCount}{' '}
        {monthCount === 1 ? 'month' : 'months'}). The chart above covers{' '}
        {dataMinYear} – {dataMaxYear}.
      </p>

      {state === 'no-overlap' && (
        <div
          className="mt-3 flex flex-col items-start gap-2 text-sm text-stone-500"
          data-qa="stop-coverage-empty"
        >
          <p>
            The selected period has no stop-level data. It is available for{' '}
            {coveredSpan}.
          </p>
          {/* The span the button *sets* is the span it *names* — both from the
              manifest. Sending the view's own `coverage` instead would send the span
              of whatever happens to be loaded, which in this state is the rail payload
              alone, because the bus fetch is gated on the window overlapping. Today
              the two agree; one source is what keeps them agreeing. */}
          <button
            type="button"
            id="use-stop-coverage-window"
            onClick={() => onUseCoverageWindow(minMonth!, maxMonth!)}
            className="button"
          >
            Show {coveredSpan}
          </button>
        </div>
      )}

      {/* The line table's own words for the same idea, so a reader meets one
          vocabulary for partial coverage rather than two — see `LineTableRow`. */}
      {state === 'partial' && (
        <p
          data-qa="stop-coverage-partial"
          title={`Partial coverage: stop-level data only reports ${monthLabel(months[0])} to ${monthLabel(months[months.length - 1])} of the selected period, so these figures cover a shorter span than the chart above.`}
          className="mt-1 cursor-help text-xs text-stone-400"
        >
          {monthLabel(months[0])} → {monthLabel(months[months.length - 1])}
        </p>
      )}
    </>
  );
}
