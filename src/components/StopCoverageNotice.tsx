import {
  maxMonth,
  minMonth,
  monthCount,
} from 'virtual:stop-ridership-manifest';
import { formatEventDate } from '../chart';
import { dataMaxYear, dataMinYear } from '../utils/dataDateRange';
import type { StopCoverageState } from '../utils/stopCoverage';

/**
 * Says what stop data covers, so a reader who drags the window to 2015 sees why the table
 * is empty rather than a broken panel (ADR-0001, ADR-0009).
 */

/** `"2025-07"` → `"Jul 2025"`, or an em dash when the month is absent. */
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
   * Whether stop data exists at all is the manifest's answer, because the view reports
   * empty coverage while a payload is still in flight.
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
