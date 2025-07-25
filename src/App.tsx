import { useState, useEffect } from 'react';
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
import type { Line } from './@types/lines.types';
import type {
  RidershipRecord,
  AggregatedRidership,
  AggregatedRecord,
} from './@types/metrics.types';
import ridershipRecords from './data/ridership.json';

function App() {
  const [isLineSelectorExpanded, setIsLineSelectorExpanded] =
    useState<boolean>(false);
  const [chartDatasets, setChartDatasets] = useState<
    ChartDataset<'line', CustomChartData[]>[]
  >([]);
  const [monthList, setMonthList] = useState<string[]>([]);
  const [ridershipByLine, setRidershipByLine] = useState<AggregatedRidership>(
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
    showAggregateLines,
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
     * Aggregate by line
     */
    const aggregatedRidership: AggregatedRidership = {};

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

      if (!aggregatedRidership[ridershipRecord.line_name]?.ridershipRecords) {
        const isSelected: boolean = !!lines.find(
          (line: Line) => line.id === Number(ridershipRecord.line_name),
        )?.selected;

        aggregatedRidership[ridershipRecord.line_name] = {
          selected: isSelected,
          ridershipRecords: [],
        } as AggregatedRecord;
      }

      const aggregatedRecord = aggregatedRidership[ridershipRecord.line_name];
      aggregatedRecord.ridershipRecords.push(ridershipRecord);
    }

    /**
     * Add selected lines to the chart
     */
    const datasets: ChartDataset<'line', CustomChartData[]>[] = [];

    Object.entries(aggregatedRidership).forEach(([line, aggregatedRecord]) => {
      if (!aggregatedRecord.selected) return;

      datasets.push({
        data: aggregatedRecord.ridershipRecords.map((record) => ({
          time: createTimeStringForChartData(record.year, record.month),
          stat: record[dayOfWeek],
        })) as CustomChartData[],
        label: getLineNames(Number(line)).current,
        backgroundColor: getLineColor(Number(line)),
        borderColor: getLineColor(Number(line)),
      });
    });

    // Create month labels
    const months = chartDatasets[0]
      ? chartDatasets[0].data.map((a) => a.time)
      : [];
    setMonthList(months);

    /**
     * Add aggregate lines to chart dataset if applicable.
     */
    if (showAggregateLines) {
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
        label: 'Aggregate Line',
        backgroundColor: getLineColor(-1),
        borderColor: getLineColor(-2),
      });
    }

    /**
     * Update state for chart dataset
     */
    setChartDatasets(datasets);

    setRidershipByLine(aggregatedRidership);

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
    showAggregateLines,
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
            expanded={isLineSelectorExpanded}
            setExpanded={setIsLineSelectorExpanded}
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

      <Footer />
    </div>
  );
}

export default App;
