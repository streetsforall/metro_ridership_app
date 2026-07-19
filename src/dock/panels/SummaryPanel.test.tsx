import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import SummaryPanel from './SummaryPanel';
import { makeDashboardValue, makeLine, renderWithDashboard } from './testUtils';

describe('SummaryPanel', () => {
  it('shows the placeholder when no lines are selected', () => {
    const value = makeDashboardValue({
      lines: [makeLine({ selected: false })],
    });
    renderWithDashboard(<SummaryPanel />, value);
    expect(screen.getByText('Please select a Metro line.')).toBeTruthy();
    expect(screen.queryByText('Average Ridership')).toBeNull();
  });

  it('renders SummaryData stats for selected lines', () => {
    const value = makeDashboardValue({
      lines: [
        makeLine({
          selected: true,
          averageRidership: 4000,
          changeInRidership: 200,
          endingRidership: 4200,
        }),
      ],
    });
    renderWithDashboard(<SummaryPanel />, value);
    expect(screen.getByText('Average Ridership')).toBeTruthy();
    expect(screen.queryByText('Please select a Metro line.')).toBeNull();
  });
});
