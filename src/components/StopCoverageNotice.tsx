import {
  maxMonth,
  minMonth,
  monthCount,
} from 'virtual:stop-ridership-manifest';
import { formatEventDate } from '../chart';
import { dataMaxYear, dataMinYear } from '../utils/dataDateRange';
import type { StopCoverageState } from '../utils/stopCoverage';

/**
 * The stop coverage window against the month window, said out loud. The chart spans
 * 2009 → 2026 and stop data twelve months inside it, so a reader who drags to 2015 and
 * finds an empty table has been handed a broken panel unless the panel says what it
 * covers. The span is stated persistently, not only when something is missing, and comes
 * from the build-time manifest so the sentence is true before any payload is fetched.
 *
 * It never clamps or widens the window, because the window is the reader's choice and what
 * a shared link carries (ADR-0001); the no-overlap state offers a button instead. It also
 * states no window rule of its own — `stopCoverageState` reads the derivation's answers
 * rather than comparing against the window (ADR-0009).
 */

/** `"2025-07"` → `"Jul 2025"`. Absent months read as an em dash rather than "null". */
const monthLabel = (month: string | null): string =>
  month ? formatEventDate(month) : '—';

/** The build-time span, so the sentence is true before any fetch. */
const coveredSpan = `${monthLabel(minMonth)} – ${monthLabel(maxMonth)}`;

export interface StopCoverageNoticeProps {
  state: StopCoverageState;
  /** The stop view's month axis, for the partial-coverage label. */
  months: readonly string[];
  /** Set the month window to the coverage window. `YYYY-MM` both ends. */
  onUseCoverageWindow: (from: string, to: string) => void;
}

export default function StopCoverageNotice({
  state,
  months,
  onUseCoverageWindow,
}: StopCoverageNoticeProps) {
  /**
   * Whether stop data exists at all is the manifest's answer, not the view's. The view
   * reports empty coverage while a payload is in flight and again if one fails, so asking
   * `coverage` would tell a reader on a slow connection that nothing had been ingested.
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
          {/* The span the button sets is the span it names, both from the manifest.
              Sending the view's `coverage` would send whatever happens to be loaded —
              here the rail payload alone, since the bus fetch is gated on overlap. */}
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

      {/* The line table's own words for the same idea, so partial coverage reads one way
          across the dashboard — see `LineTableRow`. */}
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
