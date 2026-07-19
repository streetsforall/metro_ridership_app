import { useState, useEffect, useMemo, useCallback } from 'react';
import { type ChartDataset } from 'chart.js';
import type { DockviewApi } from 'dockview-react';
import Footer from './components/Footer';
import Header from './components/Header';
import DockShell, {
  buildDefaultLayout,
  PANEL_DEFS,
  PANEL_IDS,
  type PanelId,
} from './dock/DockShell';
import {
  DockLayoutProvider,
  type DockLayoutContextValue,
} from './dock/DockLayoutContext';
import {
  DashboardProvider,
  type DashboardContextValue,
} from './context/DashboardContext';
import ChartPanel from './dock/panels/ChartPanel';
import DateRangePanel from './dock/panels/DateRangePanel';
import LineSelectorPanel from './dock/panels/LineSelectorPanel';
import MapPanel from './dock/panels/MapPanel';
import PanelChrome from './dock/panels/PanelChrome';
import SummaryPanel from './dock/panels/SummaryPanel';
import useIsDesktop from './dock/panels/useIsDesktop';
import useUserDashboardInput, {
  type UserDashboardInputState,
} from './hooks/useUserDashboardInput';
import { getLineColor, getLineNames } from './utils/lines';
import { clearLayout } from './utils/layoutStorage';
import type { CustomChartData } from './@types/chart.types';
import type {
  ConsolidatedRidership,
  RidershipRecord,
} from './@types/metrics.types';
import ridershipRecords from './data/ridership.json';

const allPanelsVisible = Object.fromEntries(
  PANEL_IDS.map((id) => [id, true]),
) as Record<PanelId, boolean>;

function App() {
  const [isLineSelectorExpanded, setIsLineSelectorExpanded] =
    useState<boolean>(false);
  const [dockApi, setDockApi] = useState<DockviewApi | null>(null);
  const [panelVisibility, setPanelVisibility] =
    useState<Record<PanelId, boolean>>(allPanelsVisible);
  /* Transient by design — not persisted to localStorage or the URL. */
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const isDesktop = useIsDesktop();

  const userDashboardInputState: UserDashboardInputState =
    useUserDashboardInput();

  const {
    lines,
    startDate,
    dayOfWeek,
    endDate,
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

  /* Dropping below the breakpoint unmounts DockShell; its api is then dead. */
  useEffect(() => {
    if (!isDesktop) {
      setDockApi(null);
      setPanelVisibility(allPanelsVisible);
      /* Nothing to rearrange without a dock. */
      setIsEditMode(false);
    }
  }, [isDesktop]);

  /* Track which panels exist in the dock. */
  useEffect(() => {
    if (!dockApi) return;

    const syncVisibility = () => {
      const present = new Set(dockApi.panels.map((panel) => panel.id));
      setPanelVisibility(
        Object.fromEntries(
          PANEL_IDS.map((id) => [id, present.has(id)]),
        ) as Record<PanelId, boolean>,
      );
    };

    syncVisibility();
    const addListener = dockApi.onDidAddPanel(syncVisibility);
    const removeListener = dockApi.onDidRemovePanel(syncVisibility);
    return () => {
      addListener.dispose();
      removeListener.dispose();
    };
  }, [dockApi]);

  /* Expand toggle → maximize the line-selector's group. */
  useEffect(() => {
    if (!dockApi) return;
    const panel = dockApi.getPanel('line-selector');
    if (!panel) return;

    if (isLineSelectorExpanded) {
      if (!panel.api.isMaximized()) panel.api.maximize();
    } else if (panel.api.isMaximized()) {
      panel.api.exitMaximized();
    }
  }, [dockApi, isLineSelectorExpanded]);

  /* Maximize changes made through dockview itself → expand toggle state. */
  useEffect(() => {
    if (!dockApi) return;
    const listener = dockApi.onDidMaximizedGroupChange(
      ({ group, isMaximized }) => {
        const lineSelectorGroup = dockApi.getPanel('line-selector')?.group;
        if (group === lineSelectorGroup) {
          setIsLineSelectorExpanded(isMaximized);
        } else if (isMaximized) {
          /* Some other group was maximized; the selector is no longer expanded */
          setIsLineSelectorExpanded(false);
        }
      },
    );
    return () => listener.dispose();
  }, [dockApi]);

  const togglePanel = useCallback(
    (id: PanelId) => {
      if (!dockApi) return;

      const existing = dockApi.getPanel(id);
      if (existing) {
        dockApi.removePanel(existing);
        return;
      }

      const def = PANEL_DEFS[id];
      let position:
        | { referencePanel: PanelId; direction: 'above' | 'below' | 'right' }
        | undefined = def.position;
      if (position && !dockApi.getPanel(position.referencePanel)) {
        position = undefined;
      }
      if (!position) {
        /* Reference panel is hidden (or the panel has none): fall back to the
           first panel still present — above it for the date-range strip,
           below it otherwise. */
        const fallbackRef = PANEL_IDS.find(
          (panelId) => panelId !== id && dockApi.getPanel(panelId),
        );
        if (fallbackRef) {
          position = {
            referencePanel: fallbackRef,
            direction: id === 'date-range' ? 'above' : 'below',
          };
        }
      }

      dockApi.addPanel({
        id,
        component: def.component,
        title: def.title,
        ...(position ? { position } : {}),
      });
    },
    [dockApi],
  );

  const resetLayout = useCallback(() => {
    if (!dockApi) return;
    dockApi.clear();
    clearLayout();
    buildDefaultLayout(dockApi);
    setIsLineSelectorExpanded(false);
  }, [dockApi]);

  const toggleEditMode = useCallback(() => {
    setIsEditMode((current) => !current);
  }, []);

  const dockLayoutValue: DockLayoutContextValue = useMemo(
    () => ({
      visibility: panelVisibility,
      togglePanel,
      resetLayout,
      isEditMode,
      toggleEditMode,
    }),
    [panelVisibility, togglePanel, resetLayout, isEditMode, toggleEditMode],
  );

  const dashboardValue: DashboardContextValue = {
    userDashboardInputState,
    lines,
    visibleLines,
    ridershipByLine,
    chartDatasets,
    monthList,
    isLineSelectorExpanded,
    setIsLineSelectorExpanded,
  };

  const handleApiReady = useCallback((api: DockviewApi) => {
    setDockApi(api);
  }, []);

  return (
    /* Both providers wrap the whole page, not just the dock: Header's panel
       controls call useDockLayout(), and that context has a no-op default, so a
       Header rendered outside the provider silently loses every toggle and the
       reset action instead of failing loudly. */
    <DashboardProvider value={dashboardValue}>
      <DockLayoutProvider value={dockLayoutValue}>
        {/* The dock fits the viewport (panels split the available height, no
            page scroll); the stacked mobile fallback still grows and scrolls. */}
        <div
          className={`flex flex-col mx-4 ${isDesktop ? 'h-screen' : 'min-h-screen'}`}
        >
          <Header />

          {isDesktop ? (
            /* Dockview's root is `height: 100%`, which only resolves against a
               parent with a definite height — a flex-grown `height: auto` box
               collapses it to 0. The outer div takes the space; the absolutely
               positioned inner div gives that space a definite height.

               `min-h-0` is load-bearing: a flex child defaults to
               `min-height: auto`, which refuses to shrink below its content and
               would push the footer off-screen on a short window. */
            <div className="relative grow min-h-0">
              <div className="absolute inset-0">
                <DockShell
                  panels={{
                    'date-range': (
                      <PanelChrome>
                        <DateRangePanel />
                      </PanelChrome>
                    ),
                    'line-selector': (
                      <PanelChrome scroll={false}>
                        <LineSelectorPanel />
                      </PanelChrome>
                    ),
                    chart: (
                      <PanelChrome scroll={false}>
                        <ChartPanel />
                      </PanelChrome>
                    ),
                    summary: (
                      <PanelChrome>
                        <SummaryPanel />
                      </PanelChrome>
                    ),
                    map: (
                      <PanelChrome scroll={false}>
                        <MapPanel />
                      </PanelChrome>
                    ),
                  }}
                  onApiReady={handleApiReady}
                />
              </div>
            </div>
          ) : (
            /* Below lg: the pre-dock stacked layout, from the same panel content */
            <>
              {/* Date range pane */}
              <div className="pane mb-4">
                <DateRangePanel />
              </div>

              <div className="grow flex flex-col gap-4">
                {/* Metro lines pane */}
                <div className="pane flex flex-col gap-4 h-[32rem]">
                  <LineSelectorPanel />
                </div>

                {/* Only show output if the line selector is not expanded */}
                {!isLineSelectorExpanded && (
                  <>
                    <div className="pane">
                      <ChartPanel />
                    </div>

                    {chartDatasets.length > 0 && <SummaryPanel />}

                    <div className="pane">
                      <MapPanel />
                    </div>
                  </>
                )}
              </div>
            </>
          )}

          <Footer />
        </div>
      </DockLayoutProvider>
    </DashboardProvider>
  );
}

export default App;
