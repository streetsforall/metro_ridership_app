import { useState, useEffect } from 'react';
import { type ChartDataset } from 'chart.js';
import DateRangeSelector from './components/DateRangeSelector';
import Footer from './components/Footer';
import Header from './components/Header';
import LineSelector from './components/LineSelector';
import OutputArea from './components/OutputArea';
import useUserDashboardInput, {
  type DayOfWeek,
  type UserDashboardInputState,
} from './hooks/useUserDashboardInput';
import { getLineColor, getLineNames } from './utils/lines';
import type { CustomChartData } from './@types/chart.types';
import type { Line } from './@types/lines.types';
import type {
  ConsolidatedRecord,
  ConsolidatedRidership,
  RidershipRecord,
} from './@types/metrics.types';
import ridershipRecords from './data/ridership.json';
import ShareUrls from './components/ShareUrl';

// let ridershipRecords: RidershipRecord[]; // Placeholder for the actual data import
let LoadOnce = 3; // To ensure URL parameters are only loaded once

function App() {
  const [isLineSelectorExpanded, setIsLineSelectorExpanded] =
    useState<boolean>(false);
  const [chartDatasets, setChartDatasets] = useState<
    ChartDataset<'line', CustomChartData[]>[]
  >([]);
  const [monthList, setMonthList] = useState<string[]>([]);
  const [ridershipByLine, setRidershipByLine] = useState<ConsolidatedRidership>(
    {},
  );

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

  const createTimeStringForChartData = (
    year: number,
    month: number,
  ): string => {
    return year + ' ' + month;
  };

  /**
   * Update params on state change
   */
  useEffect((): void => {
    if (!chartDatasets) return;

    /**
     * Consolidate by line
     */
    const consolidatedRidership: ConsolidatedRidership = {};
    console.log('ridershipRecords', ridershipRecords);
    for (let i = 0; i < ridershipRecords.length; i++) {
      const ridershipRecord: RidershipRecord = ridershipRecords[i];

      // Filter by year
      const newMetricDate = new Date(
        ridershipRecord.year,
        ridershipRecord.month,
      );

      // Need to filter our date to make sure it falls in our date range
      const startCap = startDate.getTime() >= newMetricDate.getTime();
      const endCap = endDate.getTime() <= newMetricDate.getTime();

      // If year false we break
      if (startCap || endCap) continue;

      if (!consolidatedRidership[ridershipRecord.line_name]?.ridershipRecords) {
        const isSelected: boolean = !!lines.find(
          (line: Line) => line.id === Number(ridershipRecord.line_name),
        )?.selected;

        consolidatedRidership[ridershipRecord.line_name] = {
          selected: isSelected,
          ridershipRecords: [],
        } as ConsolidatedRecord;
      }

      const consolidatedRecord =
        consolidatedRidership[ridershipRecord.line_name];
      consolidatedRecord.ridershipRecords.push(ridershipRecord);
    }

    /**
     * Add selected lines to the chart
     */
    const datasets: ChartDataset<'line', CustomChartData[]>[] = [];

    Object.entries(consolidatedRidership).forEach(
      ([line, consolidatedRecord]) => {
        if (!consolidatedRecord.selected) return;

        datasets.push({
          data: consolidatedRecord.ridershipRecords.map((record) => ({
            time: createTimeStringForChartData(record.year, record.month),
            stat: record[dayOfWeek],
          })) as CustomChartData[],
          label: getLineNames(Number(line)).current,
          backgroundColor: getLineColor(Number(line)),
          borderColor: getLineColor(Number(line)),
        });
      },
    );

    // Create month labels
    const months = chartDatasets[0]
      ? chartDatasets[0].data.map((a) => a.time)
      : [];
    setMonthList(months);

    /**
     * Add aggregate lines to chart dataset if applicable.
     */
    if (isAggregateVisible) {
      const aggregateDateToStatMap: CustomChartData[] = [];

      datasets.forEach((chartDataset) => {
        chartDataset.data.forEach(
          (timeStatDataPoint: CustomChartData, index: number) => {
            const { time, stat } = timeStatDataPoint;

            let customChartData: CustomChartData =
              aggregateDateToStatMap[index];
            if (!customChartData) {
              customChartData = { time: time, stat: 0 };
              aggregateDateToStatMap[index] = customChartData;
            }

            customChartData.stat += stat;
          },
        );
      });

      datasets.push({
        data: aggregateDateToStatMap,
        label: 'Aggregate',
        backgroundColor: getLineColor(-1),
        borderColor: getLineColor(-2),
      });
    }

    /**
     * Update state for chart dataset
     */
    setChartDatasets(datasets);

    setRidershipByLine(consolidatedRidership);

    /**
     * Need to add data as dependency.
     * Since data is an array, we need to stringify due to current React system.
     * https://github.com/facebook/react/issues/14476
     */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    startDate,
    endDate,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(lines),
    dayOfWeek,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(chartDatasets),
    isAggregateVisible,
  ]);

  /**
   * Add calculated metrics to each line
   */
  useEffect(
    () => {
      updateLinesWithLineMetrics(ridershipByLine);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(ridershipByLine)],
  );


  /**
   * Set state from URL parameters on mount
   * This runs multiple times to ensure lines are updated
   * This is a hacky solution to ensure the lines are updated correctly
  */
  const [linesRefreshTrigger, setLinesRefreshTrigger] = useState(0);  // State to trigger re-render
  const refreshLines = () => {
    setLinesRefreshTrigger((prev) => prev + 1); // Increment to trigger the effect
  };
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const selectedLinesParam = urlParams.get('selectedLines');
    if (selectedLinesParam) {
      console.log('if selectedLinesParam:', selectedLinesParam);
      const selectedIds = selectedLinesParam
        ? selectedLinesParam.split(',').map(Number)
        : [];
 
      // Update line to be visible if in list  
      userDashboardInputState.lines.forEach(vLine => {
        if (selectedIds.includes(vLine.id)) {
          vLine.selected = true;
        }
      });

      // this forces a re-render to ensure the changes are reflected in the UI
      if (LoadOnce < 4) {
        LoadOnce += 1;
        refreshLines(); // Trigger a re-render to apply changes
      }
    }

  }, [linesRefreshTrigger]); // Only run when linesRefreshTrigger changes

  /**
   * Set state from URL parameters on mount
   * This runs only once on mount
   */
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const dayOfWeekParam = urlParams.get('dayOfWeek');
    if (dayOfWeekParam) {
      setDayOfWeek(dayOfWeekParam as DayOfWeek);
    }
    const startDateParam = urlParams.get('startDate');
    if (startDateParam) {
      const [year, month] = startDateParam.split('-').map(Number);
      setStartDate(new Date(year, month - 1)); // Month is 0-indexed
    }
    const endDateParam = urlParams.get('endDate');
    if (endDateParam) {
        const [eYear, eMonth] = endDateParam.split('-').map(Number);
        setEndDate(new Date(eYear, eMonth - 1)); // Month is 0-indexed
    }
  }, []);

  /**
   * Edit Url Parameters for Sharing
   */
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const selectlineurl = lines.filter(line => line.selected).map(line => line.id).join(',');
    urlParams.set('dayOfWeek', dayOfWeek);
    urlParams.set('startDate', startDate.toISOString().slice(0, 7));
    urlParams.set('endDate', endDate.toISOString().slice(0, 7));
    urlParams.set('selectedLines', selectlineurl);
    urlParams.set('showAggregate', String(isAggregateVisible));
    const newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + '?' + urlParams.toString();
    window.history.replaceState({ path: newUrl }, '', newUrl);    
  }, [dayOfWeek, startDate, endDate, lines, isAggregateVisible]); // Only re-run when these change

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
        ></DateRangeSelector>
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
          />
        )}
      </div>
      
      {/* Share URL panel
      shows a link to current page with parameters included
      */}
      <div>
        <ShareUrls 
          url={window.location.search ? window.location.protocol + "//" + window.location.host + window.location.pathname + window.location.search : window.location.href} 
        />
      </div>

      <Footer />
    </div>
  );
}

export default App;