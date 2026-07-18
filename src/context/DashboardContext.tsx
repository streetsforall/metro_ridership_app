import {
  createContext,
  use,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react';
import type { ChartDataset } from 'chart.js';
import type { UserDashboardInputState } from '../hooks/useUserDashboardInput';
import type { CustomChartData } from '../@types/chart.types';
import type { Line } from '../@types/lines.types';
import type { ConsolidatedRidership } from '../@types/metrics.types';

/**
 * FROZEN CONTRACT — see src/plans/dockable-panels.md. Wave-2 PRs import from
 * this file; do not change exported names or shapes.
 */

/* eslint-disable react-refresh/only-export-components -- contract module:
   exports the provider component alongside its hook */

/**
 * The dashboard data/state that App.tsx currently threads to its children as
 * props, exposed via context so dock panels can consume it from anywhere in
 * the tree.
 */
export interface DashboardContextValue {
  userDashboardInputState: UserDashboardInputState;
  lines: Line[];
  visibleLines: Line[];
  ridershipByLine: ConsolidatedRidership;
  chartDatasets: ChartDataset<'line', CustomChartData[]>[];
  monthList: string[];
  isLineSelectorExpanded: boolean;
  setIsLineSelectorExpanded: Dispatch<SetStateAction<boolean>>;
}

const DashboardContext = createContext<DashboardContextValue | null>(null);

export function DashboardProvider({
  value,
  children,
}: {
  value: DashboardContextValue;
  children: ReactNode;
}) {
  return <DashboardContext value={value}>{children}</DashboardContext>;
}

export function useDashboard(): DashboardContextValue {
  const value = use(DashboardContext);
  if (!value) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return value;
}
