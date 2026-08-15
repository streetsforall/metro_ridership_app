import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SummaryData from './SummaryData';
import { makeLineReadout } from '../test/builders';

describe('SummaryData with no selected lines', () => {
  it('renders nothing when the lines array is empty', () => {
    render(<SummaryData lines={[]} />);
    expect(screen.queryByText('Average Ridership')).toBeNull();
  });

  it('renders nothing when all lines are unselected', () => {
    render(
      <SummaryData
        lines={[
          makeLineReadout({ selected: false }),
          makeLineReadout({ id: 802, name: 'B Line', selected: false }),
        ]}
      />,
    );
    expect(screen.queryByText('Average Ridership')).toBeNull();
  });
});

describe('SummaryData with selected lines', () => {
  it('shows the Average Ridership label', () => {
    render(<SummaryData lines={[makeLineReadout({ selected: true, averageRidership: 5000 })]} />);
    expect(screen.getByText('Average Ridership')).toBeTruthy();
  });

  it('shows the Ending Ridership label', () => {
    render(
      <SummaryData
        lines={[makeLineReadout({ selected: true, endingRidership: 4000, changeInRidership: 0 })]}
      />,
    );
    expect(screen.getByText('Ending Ridership')).toBeTruthy();
  });

  it('sums average ridership across selected lines', () => {
    const lines = [
      makeLineReadout({ selected: true, averageRidership: 10000 }),
      makeLineReadout({ id: 802, name: 'B Line', selected: true, averageRidership: 5000 }),
    ];
    render(<SummaryData lines={lines} />);
    expect(screen.getByText('15,000')).toBeTruthy();
  });

  it('sums ending ridership across selected lines', () => {
    const lines = [
      makeLineReadout({ selected: true, endingRidership: 8000, changeInRidership: 500 }),
      makeLineReadout({ id: 802, name: 'B Line', selected: true, endingRidership: 2000, changeInRidership: 100 }),
    ];
    render(<SummaryData lines={lines} />);
    expect(screen.getByText('10,000')).toBeTruthy();
  });

  it('shows a positive change with a leading + sign', () => {
    render(
      <SummaryData
        lines={[makeLineReadout({ selected: true, changeInRidership: 2000, endingRidership: 9000 })]}
      />,
    );
    expect(screen.getByLabelText('Change').textContent).toBe('+2,000');
  });

  it('shows a negative change without a + sign', () => {
    render(
      <SummaryData
        lines={[makeLineReadout({ selected: true, changeInRidership: -500, endingRidership: 8000 })]}
      />,
    );
    expect(screen.getByLabelText('Change').textContent).toBe('-500');
  });

  it('applies red styling when change is negative', () => {
    render(
      <SummaryData
        lines={[makeLineReadout({ selected: true, changeInRidership: -100, endingRidership: 5000 })]}
      />,
    );
    const changeEl = screen.getByLabelText('Change');
    expect(changeEl.className).toContain('text-red-600');
  });

  it('applies green styling when change is positive', () => {
    render(
      <SummaryData
        lines={[makeLineReadout({ selected: true, changeInRidership: 100, endingRidership: 5000 })]}
      />,
    );
    const changeEl = screen.getByLabelText('Change');
    expect(changeEl.className).toContain('text-green-600');
  });

  it('lists the names of all selected lines', () => {
    const lines = [
      makeLineReadout({ selected: true, name: 'A Line' }),
      makeLineReadout({ id: 802, name: 'B Line', selected: true }),
    ];
    render(<SummaryData lines={lines} />);
    expect(screen.getByText(/A Line/)).toBeTruthy();
    expect(screen.getByText(/B Line/)).toBeTruthy();
  });

  it('excludes unselected lines from calculations', () => {
    const lines = [
      makeLineReadout({ selected: true, averageRidership: 5000 }),
      makeLineReadout({ id: 802, name: 'B Line', selected: false, averageRidership: 9999 }),
    ];
    render(<SummaryData lines={lines} />);
    expect(screen.getByText('5,000')).toBeTruthy();
    expect(screen.queryByText('14,999')).toBeNull();
  });

  it('shows the Total Miles label when selected lines have distance data', () => {
    render(
      <SummaryData
        lines={[makeLineReadout({ selected: true, averageRidership: 5000, distanceMiles: 22.3 })]}
      />,
    );
    expect(screen.getByText('Total Miles')).toBeTruthy();
  });

  it('sums total miles across selected lines', () => {
    const lines = [
      makeLineReadout({ selected: true, averageRidership: 5000, distanceMiles: 10.5 }),
      makeLineReadout({ id: 802, name: 'B Line', selected: true, averageRidership: 3000, distanceMiles: 9.5 }),
    ];
    render(<SummaryData lines={lines} />);
    expect(screen.getByText('20')).toBeTruthy();
  });

  it('hides Total Miles when no selected lines have distance data', () => {
    render(
      <SummaryData lines={[makeLineReadout({ selected: true, averageRidership: 5000 })]} />,
    );
    expect(screen.queryByText('Total Miles')).toBeNull();
  });

  it('shows the Riders / Mile label when selected lines have distance data', () => {
    render(
      <SummaryData
        lines={[makeLineReadout({ selected: true, averageRidership: 10000, distanceMiles: 20 })]}
      />,
    );
    expect(screen.getByText('Riders / Mile')).toBeTruthy();
  });

  it('computes riders per mile as total riders divided by total miles', () => {
    const lines = [
      makeLineReadout({ selected: true, averageRidership: 10000, distanceMiles: 20 }),
      makeLineReadout({ id: 802, name: 'B Line', selected: true, averageRidership: 5000, distanceMiles: 5 }),
    ];
    render(<SummaryData lines={lines} />);
    // total riders = 15000, total miles = 25 → 600
    expect(screen.getByText('600')).toBeTruthy();
  });

  it('hides the Riders / Mile stat when no lines have distance data', () => {
    render(
      <SummaryData
        lines={[makeLineReadout({ selected: true, averageRidership: 5000 })]}
      />,
    );
    expect(screen.queryByText('Riders / Mile')).toBeNull();
  });

  it('treats undefined averageRidership as 0 in the sum', () => {
    const lines = [
      makeLineReadout({ selected: true, averageRidership: undefined }),
      makeLineReadout({ id: 802, name: 'B Line', selected: true, averageRidership: 3000 }),
    ];
    render(<SummaryData lines={lines} />);
    expect(screen.getByText('3,000')).toBeTruthy();
  });

  it('attributes averages and changes to each line’s own available months', () => {
    // The footnote used to claim the figures spanned "the current selected time
    // period", which is false for any line whose data starts mid-window (issue #88).
    render(
      <SummaryData
        lines={[makeLineReadout({ selected: true, averageRidership: 5000 })]}
      />,
    );
    expect(
      screen.getByText(
        /calculated over each line’s own available months within the selected period/,
      ),
    ).toBeTruthy();
  });

  it('says the period can differ between lines', () => {
    render(
      <SummaryData
        lines={[makeLineReadout({ selected: true, averageRidership: 5000 })]}
      />,
    );
    expect(screen.getByText(/which can differ from line to line/)).toBeTruthy();
  });

  it('no longer claims a single uniform period across lines', () => {
    render(
      <SummaryData
        lines={[makeLineReadout({ selected: true, averageRidership: 5000 })]}
      />,
    );
    expect(
      screen.queryByText(/calculations across the current selected time period/),
    ).toBeNull();
  });

  it('shows the Selected label with selected line names', () => {
    render(
      <SummaryData
        lines={[makeLineReadout({ selected: true, name: 'A Line', averageRidership: 1000 })]}
      />,
    );
    expect(screen.getByText(/Selected:/)).toBeTruthy();
  });
});
