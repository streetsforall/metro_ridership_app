import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import DateRangeSelector from './components/DateRangeSelector';
import Footer from './components/Footer';
import Header from './components/Header';
import LineSelector from './components/LineSelector';
import useUserDashboardInput, {
  type UserDashboardInputState,
} from './hooks/useUserDashboardInput';
import { buildRidershipView } from './ridership';
import { decodeRidership, type ColumnarRidership } from './utils/ridershipData';
import type { RidershipRecord } from './@types/metrics.types';

/**
 * OutputArea pulls in Chart.js and MapLibre GL. Lazy-loading it keeps MapLibre (the
 * single largest dependency) out of the entry chunk, so the header and line selector
 * can paint before the chart/map code downloads.
 */
const OutputArea = lazy(() => import('./components/OutputArea'));

function App() {
  const [isLineSelectorExpanded, setIsLineSelectorExpanded] =
    useState<boolean>(false);

  /**
   * Ridership records are fetched at runtime from /ridership.json — a minified
   * columnar blob emitted by the ridership-data Vite plugin — instead of being
   * bundled into the JS. That keeps ~6.6 MB of data out of the entry chunk's parse
   * path. `null` until the fetch resolves.
   */
  const [ridershipRecords, setRidershipRecords] = useState<
    RidershipRecord[] | null
  >(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/ridership.json', { signal: controller.signal })
      .then((res) => res.json() as Promise<ColumnarRidership>)
      .then((data) => setRidershipRecords(decodeRidership(data)))
      .catch((err) => {
        if (!controller.signal.aborted)
          console.error('Failed to load ridership data', err);
      });
    return () => controller.abort();
  }, []);

  const userDashboardInputState: UserDashboardInputState =
    useUserDashboardInput();

  const {
    lines,
    startDate,
    setStartDate,
    dayOfWeek,
    setDayOfWeek,
    endDate,
    setEndDate,
    updateLinesWithLineMetrics,
    visibleLines,
    isAggregateVisible,
    showContextLogs,
    toggleShowContextLogs,
  } = userDashboardInputState;

  const isLoading = ridershipRecords === null;

  /**
   * The whole derived view — month axis, per-line datasets, records grouped by
   * line, and the context-log events — in one pass. Every rule in it (the
   * deliberately offset month window, the shared axis, the aggregate ordering)
   * lives in src/ridership/ and is unit-tested there.
   *
   * Kept memoised: the metrics effect below keys on JSON.stringify(consolidated), and
   * a fresh object every render would thrash it.
   */
  const { months, datasets, consolidated, events } = useMemo(
    () =>
      buildRidershipView({
        records: ridershipRecords,
        lines,
        startDate,
        endDate,
        dayOfWeek,
        includeAggregate: isAggregateVisible,
      }),
    [ridershipRecords, lines, startDate, endDate, dayOfWeek, isAggregateVisible],
  );

  /**
   * Attach computed metrics (average ridership, change, etc.) to each line entry
   * so the LineSelector can display them. JSON.stringify is used as the dependency
   * because consolidated is a new object reference on every render (useMemo).
   */
  useEffect(() => {
    updateLinesWithLineMetrics(consolidated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(consolidated)]);

  return (
    /* Stretch full height */
    <div className="flex flex-col min-h-screen mx-4">
      <Header />

      {/* Date range pane */}
      <div className="pane mb-4">
        <DateRangeSelector
          startDate={startDate}
          setStartDate={setStartDate}
          endDate={endDate}
          setEndDate={setEndDate}
          dayOfWeek={dayOfWeek}
          setDayOfWeek={setDayOfWeek}
          showContextLogs={showContextLogs}
          toggleShowContextLogs={toggleShowContextLogs}
        />
      </div>

      {/* Grow to fill remaining vertical space; only one column if expanded or on mobile */}
      <div
        className={`grow grid gap-4 ${isLineSelectorExpanded ? 'grid-cols-[1fr]' : 'grid-cols-[1fr] lg:grid-cols-[25%_1fr]'}`}
      >
        {/* Metro lines pane */}
        {/* Hack to match sibling height - https://www.reddit.com/r/css/comments/15qu1ml/restrict_childs_height_to_parents_height_which_is/*/}
        <div
          className={`pane flex flex-col gap-4 min-h-full w-0 min-w-full ${isLineSelectorExpanded ? 'h-auto' : 'h-[32rem] lg:h-0'}`}
        >
          <LineSelector
            {...userDashboardInputState}
            lines={visibleLines}
            ridershipByLine={consolidated}
            isExpanded={isLineSelectorExpanded}
            setIsExpanded={setIsLineSelectorExpanded}
          />
        </div>

        {/**
         * Only show right side if line selector not selected
         * TODO: Change this from conditional rendering to conditional visibility; that way it doesn't rerender every time
         */}
        {!isLineSelectorExpanded && (
          <Suspense
            fallback={
              <div className="flex flex-col gap-4 lg:min-h-[50vh]">
                <div className="pane flex-1 flex items-center justify-center text-sm text-stone-400">
                  <p>Loading…</p>
                </div>
              </div>
            }
          >
            <OutputArea
              chartDatasets={datasets}
              months={months}
              lines={lines}
              transitEvents={events}
              showContextLogs={showContextLogs}
              isLoading={isLoading}
            />
          </Suspense>
        )}
      </div>

      <Footer />
    </div>
  );
}

export default App;
