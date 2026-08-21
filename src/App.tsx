import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import DateRangeSelector from './components/DateRangeSelector';
import Footer from './components/Footer';
import Header from './components/Header';
import LineSelector from './components/LineSelector';
import useUserDashboardInput, {
  type UserDashboardInputState,
} from './hooks/useUserDashboardInput';
import { buildLineReadouts, buildRidershipView } from './ridership';
import { listedReadouts } from './utils/lines';
import { decodeRidership, type ColumnarRidership } from './utils/ridershipData';
import type { RidershipRecord } from './@types/metrics.types';
// From `./chart/months`, not the `./chart` barrel, which registers Chart.js and would
// undo the lazy load below (ADR-0015).
import { labelToDate } from './chart/months';

/** Lazy so MapLibre, the largest dependency, stays out of the entry chunk (ADR-0015). */
const OutputArea = lazy(() => import('./components/OutputArea'));

function App() {
  const [isLineSelectorExpanded, setIsLineSelectorExpanded] =
    useState<boolean>(false);

  /**
   * Ridership records, fetched at runtime so ~6.6 MB stays out of the entry chunk —
   * `null` until the fetch resolves.
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
    searchText,
    modes,
    isAggregateVisible,
    showContextLogs,
    toggleShowContextLogs,
    showStops,
    toggleShowStops,
    stopMeasure,
    setStopMeasure,
    selectedStopKeys,
    onToggleSelectStop,
    clearStopSelections,
    selectAllListedStops,
    stopSearchText,
    setStopSearchText,
  } = userDashboardInputState;

  const isLoading = ridershipRecords === null;

  /**
   * The whole derived view in one pass, memoised because the readouts below key their
   * own memo on its identity.
   */
  const { months, datasets, consolidated, events, metrics, coverage } = useMemo(
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
   * Each Line with the figures this window derives, rebuilt whole so no figure outlives
   * its window (ADR-0005).
   */
  const readouts = useMemo(
    () => buildLineReadouts({ lines, metrics, coverage }),
    [lines, metrics, coverage],
  );

  const listed = useMemo(
    () => listedReadouts({ readouts, searchText, modes }),
    [readouts, searchText, modes],
  );

  /**
   * A chart drag writes the same two dates the pickers do, so the range it sets is as
   * shareable as a typed one.
   */
  const handleRangeSelect = useCallback(
    (startMonth: string, endMonth: string) => {
      const start = labelToDate(startMonth);
      const end = labelToDate(endMonth);
      if (!start || !end) return;
      setStartDate(start);
      setEndDate(end);
    },
    [setStartDate, setEndDate],
  );

  return (
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
          showStops={showStops}
          toggleShowStops={toggleShowStops}
        />
      </div>

      {/* Grow to fill remaining vertical space; only one column if expanded or on mobile */}
      <div
        className={`grow grid gap-4 ${isLineSelectorExpanded ? 'grid-cols-[1fr]' : 'grid-cols-[1fr] lg:grid-cols-[25%_1fr]'}`}
      >
        {/* Metro lines pane */}
        {/* Hack to match sibling height - https://www.reddit.com/r/css/comments/15qu1ml/restrict_childs_height_to_parents_height_which_is/*/}
        <div
          id="line-selector-pane"
          className={`pane flex flex-col gap-4 min-h-full w-0 min-w-full ${isLineSelectorExpanded ? 'h-auto' : 'h-[32rem] lg:h-0'}`}
        >
          <LineSelector
            {...userDashboardInputState}
            lines={listed}
            consolidated={consolidated}
            isExpanded={isLineSelectorExpanded}
            setIsExpanded={setIsLineSelectorExpanded}
          />
        </div>

        {/* Hidden, not unmounted — a fresh MapLibre instance per collapse is the cost
            being avoided (ADR-0015). */}
        <div className={isLineSelectorExpanded ? 'hidden' : 'contents'}>
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
              lines={readouts}
              transitEvents={events}
              showContextLogs={showContextLogs}
              isLoading={isLoading}
              onRangeSelect={handleRangeSelect}
              /* Threaded through rather than read in `OutputArea`, because this state is
                 URL-synced and `useUserDashboardInput` owns the URL. */
              showStops={showStops}
              stopMeasure={stopMeasure}
              onStopMeasureChange={setStopMeasure}
              selectedStopKeys={selectedStopKeys}
              onToggleStop={onToggleSelectStop}
              onClearStops={clearStopSelections}
              onSelectAllStops={selectAllListedStops}
              stopSearchText={stopSearchText}
              onStopSearchTextChange={setStopSearchText}
              startDate={startDate}
              endDate={endDate}
              dayOfWeek={dayOfWeek}
            />
          </Suspense>
        </div>
      </div>

      <Footer />
    </div>
  );
}

export default App;
