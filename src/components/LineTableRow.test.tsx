import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LineTableRow from './LineTableRow';
import type { Line } from '../@types/lines.types';
import type { RidershipRecord } from '../@types/metrics.types';

vi.mock('react-chartjs-2', () => ({
  Line: () => <canvas data-testid="sparkline" />,
}));

const mockLine: Line = {
  id: 801,
  name: 'A Line',
  former: 'Blue Line',
  mode: 'Rail',
  provider: 'DO',
  selected: false,
  visible: true,
  averageRidership: 5000,
  changeInRidership: 1000,
  startingRidership: 4000,
  endingRidership: 5500, // distinct from averageRidership to avoid duplicate text matches
};

const mockMetrics: RidershipRecord[] = [
  {
    year: 2022,
    month: 1,
    line_name: 801,
    est_wkday_ridership: 5000,
    est_sat_ridership: 3000,
    est_sun_ridership: 2000,
  },
];

const baseProps = {
  onToggleSelectLine: vi.fn(),
  line: mockLine,
  id: 1,
  dayOfWeek: 'est_wkday_ridership',
  lineMetrics: mockMetrics,
};

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('LineTableRow rendering', () => {
  it('renders the line name', () => {
    render(
      <table>
        <tbody>
          <LineTableRow {...baseProps} />
        </tbody>
      </table>,
    );
    expect(screen.getByText('A Line')).toBeTruthy();
  });

  it('renders the row rank', () => {
    render(
      <table>
        <tbody>
          <LineTableRow {...baseProps} id={3} />
        </tbody>
      </table>,
    );
    expect(screen.getByText('3')).toBeTruthy();
  });

  it('renders a checkbox', () => {
    render(
      <table>
        <tbody>
          <LineTableRow {...baseProps} />
        </tbody>
      </table>,
    );
    expect(screen.getByRole('checkbox')).toBeTruthy();
  });

  it('renders nothing when lineMetrics is falsy', () => {
    const { container } = render(
      <table>
        <tbody>
          <LineTableRow {...baseProps} lineMetrics={undefined as never} />
        </tbody>
      </table>,
    );
    expect(container.querySelector('tr')).toBeNull();
  });

  it('shows the former name text in the DOM (hidden via CSS)', () => {
    render(
      <table>
        <tbody>
          <LineTableRow {...baseProps} />
        </tbody>
      </table>,
    );
    expect(screen.getByText('Former Blue Line')).toBeTruthy();
  });
});

describe('LineTableRow expanded view', () => {
  it('renders the sparkline chart when expanded', () => {
    render(
      <table>
        <tbody>
          <LineTableRow {...baseProps} isExpanded />
        </tbody>
      </table>,
    );
    expect(screen.getByTestId('sparkline')).toBeTruthy();
  });

  it('shows formatted average ridership when expanded', () => {
    render(
      <table>
        <tbody>
          <LineTableRow {...baseProps} isExpanded />
        </tbody>
      </table>,
    );
    expect(screen.getByText('5,000')).toBeTruthy();
  });

  it('shows positive change in ridership in green when expanded', () => {
    render(
      <table>
        <tbody>
          <LineTableRow {...baseProps} isExpanded />
        </tbody>
      </table>,
    );
    const changeCell = screen.getByText('+1,000');
    expect(changeCell.className).toContain('text-green-600');
  });

  it('shows negative change in ridership in red when expanded', () => {
    const lineWithDecline = { ...mockLine, changeInRidership: -200, endingRidership: 4800 };
    render(
      <table>
        <tbody>
          <LineTableRow {...baseProps} line={lineWithDecline} isExpanded />
        </tbody>
      </table>,
    );
    const changeCell = screen.getByText('-200');
    expect(changeCell.className).toContain('text-red-600');
  });

  it('shows distance miles when expanded', () => {
    const lineWithDistance = { ...mockLine, distanceMiles: 22.3 };
    render(
      <table>
        <tbody>
          <LineTableRow {...baseProps} line={lineWithDistance} isExpanded />
        </tbody>
      </table>,
    );
    expect(screen.getByText('22.3')).toBeTruthy();
  });

  it('shows — for miles when expanded and distanceMiles is absent', () => {
    render(
      <table>
        <tbody>
          <LineTableRow {...baseProps} isExpanded />
        </tbody>
      </table>,
    );
    // The first — should be for miles (ridersPerMile also uses — when absent)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });

  it('shows riders per mile when expanded', () => {
    const lineWithRpm = { ...mockLine, ridersPerMile: 750 };
    render(
      <table>
        <tbody>
          <LineTableRow {...baseProps} line={lineWithRpm} isExpanded />
        </tbody>
      </table>,
    );
    expect(screen.getByText('750')).toBeTruthy();
  });

  it('shows — for riders per mile when expanded and ridersPerMile is absent', () => {
    render(
      <table>
        <tbody>
          <LineTableRow {...baseProps} isExpanded />
        </tbody>
      </table>,
    );
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1);
  });

  it('does not render sparkline when not expanded', () => {
    render(
      <table>
        <tbody>
          <LineTableRow {...baseProps} isExpanded={false} />
        </tbody>
      </table>,
    );
    expect(screen.queryByTestId('sparkline')).toBeNull();
  });
});

describe('LineTableRow — zero ridership values', () => {
  const renderExpanded = (lineOverride: Partial<Line>) =>
    render(
      <table>
        <tbody>
          <LineTableRow
            {...baseProps}
            line={{ ...mockLine, ...lineOverride }}
            isExpanded
          />
        </tbody>
      </table>,
    );

  it('shows — in averageRidership cell when value is 0', () => {
    const { container } = renderExpanded({ averageRidership: 0 });
    expect(container.querySelector('[data-qa="avg-ridership-801"]')?.textContent).toBe('—');
  });

  it('shows — in changeInRidership cell when value is 0', () => {
    const { container } = renderExpanded({ changeInRidership: 0 });
    expect(container.querySelector('[data-qa="change-ridership-801"]')?.textContent).toBe('—');
  });

  it('shows — in startingRidership cell when value is 0', () => {
    const { container } = renderExpanded({ startingRidership: 0 });
    expect(container.querySelector('[data-qa="starting-ridership-801"]')?.textContent).toBe('—');
  });

  it('shows — in endingRidership cell when value is 0', () => {
    const { container } = renderExpanded({ endingRidership: 0 });
    expect(container.querySelector('[data-qa="ending-ridership-801"]')?.textContent).toBe('—');
  });

  it('renders the same number of cells whether ridership values are 0 or non-zero', () => {
    const { container } = renderExpanded({
      averageRidership: 0,
      changeInRidership: 0,
      startingRidership: 0,
      endingRidership: 0,
    });
    expect(container.querySelectorAll('td')).toHaveLength(10);
  });

  it('produces no stray 0 text nodes in the row when ridership values are 0', () => {
    const { container } = renderExpanded({
      averageRidership: 0,
      changeInRidership: 0,
      startingRidership: 0,
      endingRidership: 0,
    });
    const tr = container.querySelector('tr');
    const strayTextNodes = Array.from(tr?.childNodes ?? []).filter(
      (node) => node.nodeType === 3 && node.textContent?.trim() !== '',
    );
    expect(strayTextNodes).toHaveLength(0);
  });
});

describe('LineTableRow interactions', () => {
  it('calls onToggleSelectLine with the line when checkbox is clicked', () => {
    const onToggleSelectLine = vi.fn();
    render(
      <table>
        <tbody>
          <LineTableRow {...baseProps} onToggleSelectLine={onToggleSelectLine} />
        </tbody>
      </table>,
    );
    fireEvent.click(screen.getByRole('checkbox'));
    expect(onToggleSelectLine).toHaveBeenCalledWith(mockLine);
  });

  it('reflects the selected state on the checkbox', () => {
    const selectedLine = { ...mockLine, selected: true };
    render(
      <table>
        <tbody>
          <LineTableRow {...baseProps} line={selectedLine} />
        </tbody>
      </table>,
    );
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox.getAttribute('data-state')).toBe('checked');
  });

  it('reflects the unselected state on the checkbox', () => {
    render(
      <table>
        <tbody>
          <LineTableRow {...baseProps} />
        </tbody>
      </table>,
    );
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox.getAttribute('data-state')).toBe('unchecked');
  });
});
