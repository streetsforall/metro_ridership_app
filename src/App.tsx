import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { type ChartDataset } from 'chart.js';
import DateRangeSelector from './components/DateRangeSelector';
import Footer from './components/Footer';
import Header from './components/Header';
import LineSelector from './components/LineSelector';
import useUserDashboardInput, {
  type UserDashboardInputState,
} from './hooks/useUserDashboardInput';
import {
  alignToMonthAxis,
  buildAggregateSeries,
  buildMonthAxis,
} from './utils/chartData';
import { getLineColor, getLineNames } from './utils/lines';
import { decodeRidership, type ColumnarRidership } from './utils/ridershipData';
import type { CustomChartData } from './@types/chart.types';
import type {
  ConsolidatedRidership,
  RidershipRecord,
} from './@types/metrics.types';

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
  } = userDashboardInputState;

  const isLoading = ridershipRecords === null;

  /**
   * Computes chartDatasets, monthList and ridershipByLine together in a single pass
   * over ridershipRecords since all three are derived from the same filtered view of
   * the data. Until the data loads (`ridershipRecords` is null) this yields empty
   * results.
   */
  const { chartDatasets, monthList, ridershipByLine } = useMemo(() => {
    const consolidatedRidership: ConsolidatedRidership = {};

    /**
     * Group raw records by line ID, skipping any outside the selected date window.
     * new Date(year, month) treats month as 0-based, but the data stores it as
     * 1-based, so the comparison is effectively off by one month —
     * preserved from the original implementation.
     */
    if (ridershipRecords) {
      for (const record of ridershipRecords) {
        const metricDate = new Date(record.year, record.month);
        if (
          startDate.getTime() >= metricDate.getTime() ||
          endDate.getTime() <= metricDate.getTime()
        )
          continue;

        if (!consolidatedRidership[record.line_name]?.ridershipRecords) {
          /**
           * Snapshot selected status on first encounter for this line so the
           * dataset loop below doesn't need to search lines[] on every record.
           */
          consolidatedRidership[record.line_name] = {
            selected: !!lines.find((l) => l.id === Number(record.line_name))
              ?.selected,
            ridershipRecords: [],
          };
        }
        consolidatedRidership[record.line_name].ridershipRecords.push(record);
      }
    }

    /**
     * Collect the selected lines in lines[] order (already alphabetically sorted)
     * rather than consolidatedRidership order, so the legend ordering is stable
     * regardless of the numeric key enumeration order of the object.
     */
    const selected = lines.filter(
      (line) => consolidatedRidership[line.id]?.selected,
    );

    /**
     * One shared x-axis for every dataset: the chronologically sorted union of the
     * months the selected lines cover. Selected lines can cover different spans (a
     * line added mid-window has far fewer months), and Chart.js appends any label
     * missing from `labels` to the end of the axis — so deriving the axis from one
     * dataset scrambles the ordering of the rest.
     */
    const months = buildMonthAxis(
      selected.map((line) => consolidatedRidership[line.id].ridershipRecords),
    );

    const datasets: ChartDataset<'line', CustomChartData[]>[] = selected.map(
      (line) => ({
        data: alignToMonthAxis(
          consolidatedRidership[line.id].ridershipRecords,
          months,
          dayOfWeek,
        ),
        label: getLineNames(line.id).current,
        backgroundColor: getLineColor(line.id),
        borderColor: getLineColor(line.id),
      }),
    );

    /**
     * Sum every selected line's stat at each month into a single series.
     */
    if (isAggregateVisible) {
      datasets.push({
        data: buildAggregateSeries(
          datasets.map((dataset) => dataset.data),
          months,
        ),
        label: 'Aggregate',
        backgroundColor: getLineColor(-1),
        borderColor: getLineColor(-2),
      });
    }

    return {
      chartDatasets: datasets,
      monthList: months,
      ridershipByLine: consolidatedRidership,
    };
  }, [startDate, endDate, lines, dayOfWeek, isAggregateVisible, ridershipRecords]);

  /**
   * Attach computed metrics (average ridership, change, etc.) to each line entry
   * so the LineSelector can display them. JSON.stringify is used as the dependency
   * because ridershipByLine is a new object reference on every render (useMemo).
   */
  useEffect(() => {
    updateLinesWithLineMetrics(ridershipByLine);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(ridershipByLine)]);

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
        />
      </div>

      {/* Grow to fill remaining vertical space; only one column if expanded or on mobile */}
      <div
        className={`grow grid flex-col gap-4 ${isLineSelectorExpanded ? 'lg:grid-cols-[1fr]' : 'grid-cols-[1fr] lg:grid-cols-[25%_1fr]'}`}
      >
        {/* Metro lines pane */}
        {/* Hack to match sibling height - https://www.reddit.com/r/css/comments/15qu1ml/restrict_childs_height_to_parents_height_which_is/*/}
        <div
          className={`pane flex flex-col gap-4 h-[32rem] min-h-full w-0 min-w-full ${isLineSelectorExpanded ? 'lg:h-auto' : 'lg:h-0'}`}
        >
          <LineSelector
            {...userDashboardInputState}
            lines={visibleLines}
            ridershipByLine={ridershipByLine}
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
              chartDatasets={chartDatasets}
              months={monthList}
              lines={lines}
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
