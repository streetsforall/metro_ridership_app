import {
  maxMonth,
  minMonth,
  monthCount,
} from 'virtual:stop-ridership-manifest';
import { formatEventDate } from '../chart';
import { dataMaxYear, dataMinYear } from '../utils/dataDateRange';
import type { StopCoverageState } from '../utils/stopCoverage';
import type { StopCoverage } from '../stops';

/**
 * The Stop Coverage Window against the Month Window, said out loud.
 *
 * This is the panel's biggest usability risk and the reason it exists as its own
 * component. The chart above spans 2009 → 2026; stop data spans twelve months inside
 * that. A reader who drags the chart to 2015 and finds an empty table has been given a
 * broken panel unless the panel says what it covers — so the span is stated
 * **persistently**, not only when something is missing.
 *
 * The span comes from `virtual:stop-ridership-manifest`, which the Vite plugin fills
 * from the payloads at build time. That is what lets the sentence be true before any
 * payload is fetched, including on the empty-state path where none ever is.
 *
 * ## What this component does not do
 *
 * **It never clamps or widens the Month Window.** The window is what the reader chose
 * and what a shared link carries; silently moving it would make the same URL mean
 * different things (ADR-0001). The no-overlap state offers a button instead, and that
 * button goes through the same setters a drag across the chart uses, so the pickers,
 * the chart and the URL all follow one gesture.
 *
 * **It states no window rule of its own.** Which state it is in is
 * `stopCoverageState` in `src/utils/stopCoverage.ts`, which reads the derivation's own
 * answers rather than comparing anything against the window (ADR-0009).
 */

/** `"2025-07"` → `"Jul 2025"`. Absent months read as an em dash rather than "null". */
const monthLabel = (month: string | null): string =>
  month ? formatEventDate(month) : '—';

/** The build-time span, for the sentence that must be true before any fetch. */
const coveredSpan = `${monthLabel(minMonth)} – ${monthLabel(maxMonth)}`;

export interface StopCoverageNoticeProps {
  state: StopCoverageState;
  coverage: StopCoverage;
  /** The Stop View's month axis, for the partial-coverage label. */
  months: readonly string[];
  /** Set the Month Window to the Stop Coverage Window. `YYYY-MM` both ends. */
  onUseCoverageWindow: (from: string, to: string) => void;
}

export default function StopCoverageNotice({
  state,
  coverage,
  months,
  onUseCoverageWindow,
}: StopCoverageNoticeProps) {
  if (state === 'no-data')
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
          <button
            type="button"
            id="use-stop-coverage-window"
            onClick={() =>
              onUseCoverageWindow(coverage.from!, coverage.to!)
            }
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
