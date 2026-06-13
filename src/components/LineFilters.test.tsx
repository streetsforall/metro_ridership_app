import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LineFilters from './LineFilters';

const defaultProps = {
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

describe('LineFilters rendering', () => {
  it('renders the search input with placeholder', () => {
    render(<LineFilters {...defaultProps} />);
    expect(screen.getByPlaceholderText('Search lines')).toBeTruthy();
  });

  it('displays the current search text', () => {
    render(<LineFilters {...defaultProps} searchText="silver" />);
    expect(screen.getByDisplayValue('silver')).toBeTruthy();
  });

  it('renders the Select All button', () => {
    render(<LineFilters {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Select All' })).toBeTruthy();
  });

  it('renders the Clear All button', () => {
    render(<LineFilters {...defaultProps} />);
    expect(screen.getByRole('button', { name: 'Clear All' })).toBeTruthy();
  });

  it('renders the Aggregate checkbox', () => {
    render(<LineFilters {...defaultProps} />);
    expect(screen.getByRole('checkbox', { name: 'Aggregate' })).toBeTruthy();
  });

  it('renders the Aggregate label', () => {
    render(<LineFilters {...defaultProps} />);
    expect(screen.getByText('Aggregate')).toBeTruthy();
  });

  it('renders Bus and Train mode toggle buttons', () => {
    render(<LineFilters {...defaultProps} />);
    // Radix ToggleGroup.Item renders as role="button" with aria-pressed
    expect(screen.getByRole('button', { name: 'Bus' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Train' })).toBeTruthy();
  });

  it('reflects the unchecked state of the Aggregate checkbox', () => {
    render(<LineFilters {...defaultProps} isAggregateVisible={false} />);
    const checkbox = screen.getByRole('checkbox', { name: 'Aggregate' });
    expect(checkbox.getAttribute('data-state')).toBe('unchecked');
  });

  it('reflects the checked state of the Aggregate checkbox', () => {
    render(<LineFilters {...defaultProps} isAggregateVisible={true} />);
    const checkbox = screen.getByRole('checkbox', { name: 'Aggregate' });
    expect(checkbox.getAttribute('data-state')).toBe('checked');
  });
});

describe('LineFilters interactions', () => {
  it('calls setSearchText with the new value when the search input changes', () => {
    const setSearchText = vi.fn();
    render(<LineFilters {...defaultProps} setSearchText={setSearchText} />);
    fireEvent.change(screen.getByPlaceholderText('Search lines'), {
      target: { value: 'blue' },
    });
    expect(setSearchText).toHaveBeenCalledWith('blue');
  });

  it('calls selectAllVisibleLines when Select All is clicked', () => {
    const selectAllVisibleLines = vi.fn();
    render(
      <LineFilters
        {...defaultProps}
        selectAllVisibleLines={selectAllVisibleLines}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Select All' }));
    expect(selectAllVisibleLines).toHaveBeenCalledOnce();
  });

  it('calls clearSelections when Clear All is clicked', () => {
    const clearSelections = vi.fn();
    render(<LineFilters {...defaultProps} clearSelections={clearSelections} />);
    fireEvent.click(screen.getByRole('button', { name: 'Clear All' }));
    expect(clearSelections).toHaveBeenCalledOnce();
  });

  it('calls toggleIsAggregateVisible when the Aggregate checkbox is clicked', () => {
    const toggleIsAggregateVisible = vi.fn();
    render(
      <LineFilters
        {...defaultProps}
        toggleIsAggregateVisible={toggleIsAggregateVisible}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Aggregate' }));
    expect(toggleIsAggregateVisible).toHaveBeenCalledOnce();
  });

  it('does not call clearSelections when Select All is clicked', () => {
    const clearSelections = vi.fn();
    render(<LineFilters {...defaultProps} clearSelections={clearSelections} />);
    fireEvent.click(screen.getByRole('button', { name: 'Select All' }));
    expect(clearSelections).not.toHaveBeenCalled();
  });

  it('does not call selectAllVisibleLines when Clear All is clicked', () => {
    const selectAllVisibleLines = vi.fn();
    render(
      <LineFilters
        {...defaultProps}
        selectAllVisibleLines={selectAllVisibleLines}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Clear All' }));
    expect(selectAllVisibleLines).not.toHaveBeenCalled();
  });
});
