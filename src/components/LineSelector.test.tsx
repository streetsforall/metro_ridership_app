import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import LineSelector from './LineSelector';
import type { Line } from '../@types/lines.types';
import type { ConsolidatedRidership } from '../@types/metrics.types';

vi.mock('react-chartjs-2', () => ({
  Line: () => <canvas data-testid="sparkline" />,
}));

const mockLine: Line = {
  id: 801,
  name: 'A Line',
  mode: 'Rail',
  provider: 'DO',
  selected: false,
  visible: true,
};

const defaultProps = {
  ridershipByLine: {} as ConsolidatedRidership,
  lines: [] as Line[],
  setLines: vi.fn(),
  onToggleSelectLine: vi.fn(),
  isExpanded: false,
  dayOfWeek: 'est_wkday_ridership',
  setIsExpanded: vi.fn(),
  searchText: '',
  setSearchText: vi.fn(),
  modes: ['bus', 'train'],
  setModes: vi.fn(),
  clearSelections: vi.fn(),
  selectAllVisibleLines: vi.fn(),
  isAggregateVisible: false,
  toggleIsAggregateVisible: vi.fn(),
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('expand toggle button', () => {
  it('shows "Expand to table view" icon when not expanded', () => {
    render(<LineSelector {...defaultProps} isExpanded={false} />);
    expect(screen.getByAltText('Expand to table view')).toBeTruthy();
  });

  it('shows "Collapse to list view" icon when expanded', () => {
    render(<LineSelector {...defaultProps} isExpanded={true} />);
    expect(screen.getByAltText('Collapse to list view')).toBeTruthy();
  });

  it('calls setIsExpanded when clicked', () => {
    const setIsExpanded = vi.fn();
    render(<LineSelector {...defaultProps} setIsExpanded={setIsExpanded} />);
    fireEvent.click(screen.getByRole('button', { name: 'Expand to table view' }));
    expect(setIsExpanded).toHaveBeenCalled();
  });
});

describe('empty state', () => {
  it('shows "Please select a transit mode." when lines is empty', () => {
    render(<LineSelector {...defaultProps} lines={[]} />);
    expect(screen.getByText('Please select a transit mode.')).toBeTruthy();
  });
});

describe('lines table', () => {
  it('does not show empty state message when lines are provided', () => {
    render(<LineSelector {...defaultProps} lines={[mockLine]} />);
    expect(screen.queryByText('Please select a transit mode.')).toBeNull();
  });

  it('hides table header when not expanded', () => {
    render(<LineSelector {...defaultProps} lines={[mockLine]} isExpanded={false} />);
    expect(screen.queryByText('Avg. Ridership')).toBeNull();
  });

  it('shows table header columns when expanded', () => {
    render(<LineSelector {...defaultProps} lines={[mockLine]} isExpanded={true} />);
    expect(screen.getByText('Avg. Ridership')).toBeTruthy();
    expect(screen.getByText('Line')).toBeTruthy();
  });

  it('cycles sort direction on column header click: none → asc → desc → none', () => {
    render(<LineSelector {...defaultProps} lines={[mockLine]} isExpanded={true} />);
    const lineHeader = screen.getByText('Line');
    expect(lineHeader.closest('th')?.className).not.toContain('headerSort');
    fireEvent.click(lineHeader);
    expect(lineHeader.closest('th')?.className).toContain('headerSortUp');
    fireEvent.click(lineHeader);
    expect(lineHeader.closest('th')?.className).toContain('headerSortDown');
    fireEvent.click(lineHeader);
    expect(lineHeader.closest('th')?.className).not.toContain('headerSort');
  });

  it('clears sort on other columns when a new column is sorted', () => {
    render(<LineSelector {...defaultProps} lines={[mockLine]} isExpanded={true} />);
    const lineHeader = screen.getByText('Line');
    const avgHeader = screen.getByText('Avg. Ridership');
    fireEvent.click(lineHeader);
    expect(lineHeader.closest('th')?.className).toContain('headerSortUp');
    fireEvent.click(avgHeader);
    expect(lineHeader.closest('th')?.className).not.toContain('headerSort');
    expect(avgHeader.closest('th')?.className).toContain('headerSortUp');
  });
});

describe('download CSV link', () => {
  it('renders the download CSV link', () => {
    render(<LineSelector {...defaultProps} />);
    expect(screen.getByRole('link', { name: /Download selected data as CSV/ })).toBeTruthy();
  });

  it('sets the download filename to metro_ridership.csv', () => {
    render(<LineSelector {...defaultProps} />);
    const link = screen.getByRole('link', { name: /Download selected data as CSV/ });
    expect(link.getAttribute('download')).toBe('metro_ridership.csv');
  });
});

describe('share button', () => {
  it('renders a Share button', () => {
    render(<LineSelector {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Share' })).toBeTruthy();
  });

  it('calls navigator.share with the current URL and title when supported', () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      ...navigator,
      share: shareMock,
      canShare: vi.fn().mockReturnValue(true),
    });

    render(<LineSelector {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    expect(shareMock).toHaveBeenCalledWith({
      title: 'LA Metro Ridership Data',
      url: window.location.href,
    });
  });

  it('falls back to clipboard when navigator.share is not available', () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      ...navigator,
      share: undefined,
      clipboard: { writeText: writeTextMock },
    });

    render(<LineSelector {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    expect(writeTextMock).toHaveBeenCalledWith(window.location.href);
  });

  it('falls back to clipboard when navigator.canShare returns false', () => {
    const shareMock = vi.fn();
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      ...navigator,
      share: shareMock,
      canShare: vi.fn().mockReturnValue(false),
      clipboard: { writeText: writeTextMock },
    });

    render(<LineSelector {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    expect(shareMock).not.toHaveBeenCalled();
    expect(writeTextMock).toHaveBeenCalledWith(window.location.href);
  });

  it('shows "Copied to clipboard" after clipboard write resolves', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      share: undefined,
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });

    render(<LineSelector {...defaultProps} />);
    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Copied to clipboard' })).toBeTruthy(),
    );
  });

  it('reverts button text to "Share" after 2 seconds', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', {
      ...navigator,
      share: undefined,
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });

    render(<LineSelector {...defaultProps} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Share' }));
      await Promise.resolve(); // flush clipboard promise microtask
    });

    expect(screen.getByRole('button', { name: 'Copied to clipboard' })).toBeTruthy();

    await act(() => vi.advanceTimersByTime(2000));

    expect(screen.getByRole('button', { name: 'Share' })).toBeTruthy();

    vi.useRealTimers();
  });
});
