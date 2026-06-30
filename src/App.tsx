import { useState, useEffect, useMemo } from 'react';
import { type ChartDataset } from 'chart.js';
import DateRangeSelector from './components/DateRangeSelector';
import Footer from './components/Footer';
import Header from './components/Header';
import LineSelector from './components/LineSelector';
import OutputArea from './components/OutputArea';
import useUserDashboardInput, {
  type UserDashboardInputState,
} from './hooks/useUserDashboardInput';
import { getLineColor, getLineNames } from './utils/lines';
import type { CustomChartData } from './@types/chart.types';
import type {
  ConsolidatedRidership,
  RidershipRecord,
} from './@types/metrics.types';
import ridershipRecords from './data/ridership.json';
import transitEventsData from './data/transit-events.json';
import type { TransitEvent } from './@types/events.types';

function App() {
  const [isLineSelectorExpanded, setIsLineSelectorExpanded] =
    useState<boolean>(false);

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

  /**
   * Computes chartDatasets and ridershipByLine together in a single pass over
   * ridershipRecords since both are derived from the same filtered view of the data.
   */
  const { chartDatasets, ridershipByLine } = useMemo(() => {
    /**
     * Group raw records by line ID, skipping any outside the selected date window.
     * new Date(year, month) treats month as 0-based, but the data stores it as
     * 1-based, so the comparison is effectively off by one month —
     * preserved from the original implementation.
     */
    const consolidatedRidership: ConsolidatedRidership = {};

    for (const record of ridershipRecords as RidershipRecord[]) {
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

    /**
     * Build one Chart.js dataset per selected line. Iterating lines[] (already
     * alphabetically sorted) rather than consolidatedRidership preserves legend
     * order regardless of the numeric key enumeration order of the object.
     */
    const datasets: ChartDataset<'line', CustomChartData[]>[] = [];

    lines.forEach((line) => {
      const consolidated = consolidatedRidership[line.id];
      if (!consolidated?.selected) return;

      datasets.push({
        data: consolidated.ridershipRecords.map((r) => ({
          time: `${r.year} ${r.month}`,
          stat: r[dayOfWeek],
        })) as CustomChartData[],
        label: getLineNames(line.id).current,
        backgroundColor: getLineColor(line.id),
        borderColor: getLineColor(line.id),
      });
    });

    /**
     * Sum every selected line's stat at each time index into a single series.
     */
    if (isAggregateVisible) {
      const aggregateMap: CustomChartData[] = [];
      datasets.forEach((dataset) => {
        dataset.data.forEach((point, i) => {
          if (!aggregateMap[i]) aggregateMap[i] = { time: point.time, stat: 0 };
          aggregateMap[i].stat += point.stat;
        });
      });
      datasets.push({
        data: aggregateMap,
        label: 'Aggregate',
        backgroundColor: getLineColor(-1),
        borderColor: getLineColor(-2),
      });
    }

    return { chartDatasets: datasets, ridershipByLine: consolidatedRidership };
  }, [startDate, endDate, lines, dayOfWeek, isAggregateVisible]);

  const transitEvents = useMemo(() => {
    const selectedLineIds = new Set(lines.filter((l) => l.selected).map((l) => l.id));
    const startYYYYMM = startDate.getFullYear() * 100 + (startDate.getMonth() + 1);
    const endYYYYMM = endDate.getFullYear() * 100 + (endDate.getMonth() + 1);

    return (transitEventsData as TransitEvent[])
      .filter((event) => {
        const [year, month] = event.date.split('-').map(Number);
        const eventYYYYMM = year * 100 + month;
        if (eventYYYYMM < startYYYYMM || eventYYYYMM > endYYYYMM) return false;
        if (event.line_ids.length === 0) return true;
        return event.line_ids.some((id) => selectedLineIds.has(id));
      })
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [startDate, endDate, lines]);

  /**
   * Pull time labels from the first dataset; all datasets share the same x-axis.
   */
  const monthList = useMemo(
    () => chartDatasets[0]?.data.map((d) => d.time) ?? [],
    [chartDatasets],
  );

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
          <OutputArea
            chartDatasets={chartDatasets}
            months={monthList}
            lines={lines}
            transitEvents={transitEvents}
          />
        )}
      </div>

      <Footer />
    </div>
  );
}

export default App;
