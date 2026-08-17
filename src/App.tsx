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
import { labelToDate } from './chart/months';

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
   * The whole derived view — month axis, per-line datasets, records grouped by
   * line, and the context-log events — in one pass. Every rule in it (the
   * deliberately offset month window, the shared axis, the aggregate ordering)
   * lives in src/ridership/ and is unit-tested there.
   *
   * Kept memoised: `metrics` and `coverage` feed the readouts below, whose own memo
   * keys on their identity, so a fresh view every render would thrash it.
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
   * Each Line with the figures this window derives for it. Rebuilt whole whenever
   * the view changes, so a figure from a previous window cannot survive.
   *
   * Nothing is stringified into the dependency array: `metrics` and `coverage` come
   * out of the already-memoised `buildRidershipView` above, so their identity is
   * stable per view.
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
   * A drag across the chart is just another way to set the month window, so it
   * writes to the same two dates the pickers do. Everything downstream — the
   * `start`/`end` query params, the pickers' displayed values, the rebuilt view —
   * then follows for free, and the dragged range is as shareable as a typed one.
   *
   * Imported from `./chart/months` rather than the `./chart` barrel on purpose:
   * the barrel registers Chart.js, and pulling that into App would undo the
   * lazy-loading of OutputArea above.
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

        {/**
         * The right side is hidden while the line selector is expanded, not unmounted.
         *
         * Unmounting it tore down the Chart.js canvas and the MapLibre instance, so every
         * collapse paid for a fresh map — new WebGL context, basemap style and tiles fetched
         * again — plus a chart rebuilt from scratch. Both are ready to draw already; the only
         * thing that changed is whether they are on screen.
         *
         * `contents` on the wrapper makes OutputArea's own root the grid item, exactly as it
         * was when this was conditionally rendered, so the visible layout is unchanged. When
         * expanded the wrapper is `display: none`, which takes it out of the grid entirely —
         * the `grid-cols-[1fr]` above then has a single column with a single item in it, as
         * before.
         *
         * Coming back is safe without a manual re-measure: Chart.js's responsive mode and
         * MapLibre's `trackResize` both watch their container with a ResizeObserver, which
         * fires again when the box goes from zero back to its real size.
         */}
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
              /* The stop panel's state is threaded through rather than read in
                 OutputArea, because it is URL-synced and useUserDashboardInput owns
                 the URL. The panel's *data* is not: `useStopView` lives inside the
                 lazy chunk so its payloads never reach the first-paint path. */
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
