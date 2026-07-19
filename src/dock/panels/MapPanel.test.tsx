import { describe, it, expect, vi } from 'vitest';
import { screen } from '@testing-library/react';
import MapPanel from './MapPanel';
import { makeDashboardValue, makeLine, renderWithDashboard } from './testUtils';
import type { Line } from '../../@types/lines.types';

vi.mock('../../components/Map', () => ({
  default: ({ lines }: { lines: Line[] }) => (
    <div data-testid="map" data-line-count={String(lines.length)} />
  ),
}));

describe('MapPanel', () => {
  it('renders the Map even when nothing is selected', () => {
    renderWithDashboard(<MapPanel />, makeDashboardValue());
    expect(screen.getByTestId('map')).toBeTruthy();
  });

  it('passes the full lines list through to the Map', () => {
    const value = makeDashboardValue({
      lines: [makeLine({ id: 801 }), makeLine({ id: 802 })],
    });
    renderWithDashboard(<MapPanel />, value);
    expect(screen.getByTestId('map').getAttribute('data-line-count')).toBe('2');
  });
});
