import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DateRangeSelector from './DateRangeSelector';
import { daysOfWeek } from '../hooks/useUserDashboardInput';

const defaultProps = {
  startDate: new Date(2020, 6), // July 2020
  setStartDate: vi.fn(),
  endDate: new Date(2025, 6), // July 2025
  setEndDate: vi.fn(),
  dayOfWeek: daysOfWeek.Weekday,
  setDayOfWeek: vi.fn(),
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('DateRangeSelector rendering', () => {
  it('renders the Start fieldset legend', () => {
    render(<DateRangeSelector {...defaultProps} />);
    expect(screen.getByText('Start')).toBeTruthy();
  });

  it('renders the End fieldset legend', () => {
    render(<DateRangeSelector {...defaultProps} />);
    expect(screen.getByText('End')).toBeTruthy();
  });

  it('renders the Day of Week fieldset legend', () => {
    render(<DateRangeSelector {...defaultProps} />);
    expect(screen.getByText('Day of Week')).toBeTruthy();
  });

  it('renders Weekday, Saturday, and Sunday labels', () => {
    render(<DateRangeSelector {...defaultProps} />);
    expect(screen.getByText('Weekday')).toBeTruthy();
    expect(screen.getByText('Saturday')).toBeTruthy();
    expect(screen.getByText('Sunday')).toBeTruthy();
  });

  it('renders four dropdowns (start month, start year, end month, end year)', () => {
    render(<DateRangeSelector {...defaultProps} />);
    expect(screen.getAllByRole('combobox')).toHaveLength(4);
  });

  it('shows the correct start month (July = index 6)', () => {
    render(<DateRangeSelector {...defaultProps} />);
    const selects = screen.getAllByRole('combobox');
    expect(Number((selects[0] as HTMLSelectElement).value)).toBe(6);
  });

  it('shows the correct start year', () => {
    render(<DateRangeSelector {...defaultProps} />);
    const selects = screen.getAllByRole('combobox');
    expect(Number((selects[1] as HTMLSelectElement).value)).toBe(2020);
  });

  it('shows the correct end month', () => {
    render(<DateRangeSelector {...defaultProps} />);
    const selects = screen.getAllByRole('combobox');
    expect(Number((selects[2] as HTMLSelectElement).value)).toBe(6);
  });

  it('shows the correct end year', () => {
    render(<DateRangeSelector {...defaultProps} />);
    const selects = screen.getAllByRole('combobox');
    expect(Number((selects[3] as HTMLSelectElement).value)).toBe(2025);
  });
});

describe('DateRangeSelector interactions', () => {
  it('calls setStartDate when the start month changes', () => {
    const setStartDate = vi.fn();
    render(<DateRangeSelector {...defaultProps} setStartDate={setStartDate} />);
    const [startMonth] = screen.getAllByRole('combobox');
    fireEvent.change(startMonth, { target: { value: '3' } });
    expect(setStartDate).toHaveBeenCalledOnce();
  });

  it('calls setStartDate when the start year changes', () => {
    const setStartDate = vi.fn();
    render(<DateRangeSelector {...defaultProps} setStartDate={setStartDate} />);
    const [, startYear] = screen.getAllByRole('combobox');
    fireEvent.change(startYear, { target: { value: '2021' } });
    expect(setStartDate).toHaveBeenCalledOnce();
  });

  it('calls setEndDate when the end month changes', () => {
    const setEndDate = vi.fn();
    render(<DateRangeSelector {...defaultProps} setEndDate={setEndDate} />);
    const [, , endMonth] = screen.getAllByRole('combobox');
    fireEvent.change(endMonth, { target: { value: '11' } });
    expect(setEndDate).toHaveBeenCalledOnce();
  });

  it('calls setEndDate when the end year changes', () => {
    const setEndDate = vi.fn();
    render(<DateRangeSelector {...defaultProps} setEndDate={setEndDate} />);
    const [, , , endYear] = screen.getAllByRole('combobox');
    fireEvent.change(endYear, { target: { value: '2024' } });
    expect(setEndDate).toHaveBeenCalledOnce();
  });

  it('calls setDayOfWeek when a day-of-week radio button is clicked', () => {
    const setDayOfWeek = vi.fn();
    render(<DateRangeSelector {...defaultProps} setDayOfWeek={setDayOfWeek} />);
    fireEvent.click(screen.getByText('Saturday'));
    expect(setDayOfWeek).toHaveBeenCalled();
  });
});
