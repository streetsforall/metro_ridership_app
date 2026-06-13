import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import LineSelector from './LineSelector';
import type { Line } from '../@types/lines.types';
import type { ConsolidatedRidership } from '../@types/metrics.types';

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
