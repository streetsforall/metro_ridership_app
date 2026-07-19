import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  DashboardProvider,
  type DashboardContextValue,
} from '../../context/DashboardContext';
import type { UserDashboardInputState } from '../../hooks/useUserDashboardInput';
import type { Line } from '../../@types/lines.types';

export const makeLine = (overrides: Partial<Line>): Line => ({
  id: 801,
  name: 'A Line',
  mode: 'Rail',
  provider: 'DO',
  selected: false,
  visible: true,
  ...overrides,
});

export const makeDashboardValue = (
  overrides: Partial<DashboardContextValue> = {},
): DashboardContextValue => ({
  userDashboardInputState: {} as UserDashboardInputState,
  lines: [],
  visibleLines: [],
  ridershipByLine: {},
  chartDatasets: [],
  monthList: [],
  isLineSelectorExpanded: false,
  setIsLineSelectorExpanded: () => {},
  ...overrides,
});

export const renderWithDashboard = (
  ui: ReactNode,
  value: DashboardContextValue,
) => render(<DashboardProvider value={value}>{ui}</DashboardProvider>);
