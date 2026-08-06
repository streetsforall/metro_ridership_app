import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import LineTableRow from './LineTableRow';
import type { Line } from '../@types/lines.types';
import type { CustomChartData } from '../@types/chart.types';
import type { RidershipRecord } from '../@types/metrics.types';

/**
 * Records what the sparkline was actually handed, so the shared-axis alignment can be
 * asserted without rendering a real canvas.
 */
const { sparklineSpy } = vi.hoisted(() => ({ sparklineSpy: vi.fn() }));

vi.mock('react-chartjs-2', () => ({
  Line: ({
    data,
  }: {
    data: { datasets: { data: CustomChartData[] }[] };
  }) => {
    sparklineSpy(data.datasets[0]?.data);
    return <canvas data-testid="sparkline" />;
  },
}));

/** The points the most recent sparkline render received. */
const lastSparklinePoints = (): CustomChartData[] =>
  (sparklineSpy.mock.calls.at(-1)?.[0] ?? []) as CustomChartData[];

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
  monthAxis: ['2022 1'],
};

beforeEach(() => {
  vi.restoreAllMocks();
  sparklineSpy.mockClear();
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

describe('LineTableRow coverage marker', () => {
  const partialLine: Line = {
    ...mockLine,
    id: 805,
    name: 'D Line',
    former: undefined,
    coveredFrom: '2025-09',
    coveredTo: '2026-05',
    isPartialCoverage: true,
  };

  const renderRow = (line: Line) =>
    render(
      <table>
        <tbody>
          <LineTableRow {...baseProps} line={line} isExpanded />
        </tbody>
      </table>,
    );

  it('shows the covered range beside the name of a partial-coverage line', () => {
    const { container } = renderRow(partialLine);
    const marker = container.querySelector('[data-qa="coverage-805"]');

    expect(marker?.textContent).toBe('2025-09 → 2026-05');
  });

  it('explains the shorter span in the marker’s hover text', () => {
    const { container } = renderRow(partialLine);
    const marker = container.querySelector('[data-qa="coverage-805"]');

    expect(marker?.getAttribute('title')).toContain('2025-09');
    expect(marker?.getAttribute('title')).toContain('2026-05');
    expect(marker?.getAttribute('title')).toMatch(/shorter span/);
  });

  it('omits the marker on a line that spans the whole window', () => {
    const { container } = renderRow({
      ...partialLine,
      isPartialCoverage: false,
    });

    expect(container.querySelector('[data-qa="coverage-805"]')).toBeNull();
  });

  it('omits the marker in the collapsed list, which shows no metric columns', () => {
    const { container } = render(
      <table>
        <tbody>
          <LineTableRow {...baseProps} line={partialLine} isExpanded={false} />
        </tbody>
      </table>,
    );

    expect(container.querySelector('[data-qa="coverage-805"]')).toBeNull();
  });

  it('omits the marker when coverage has not been computed yet', () => {
    const { container } = renderRow({
      ...partialLine,
      coveredFrom: undefined,
      coveredTo: undefined,
    });

    expect(container.querySelector('[data-qa="coverage-805"]')).toBeNull();
  });

  it('leaves the cell count unchanged when the marker is present', () => {
    const { container } = renderRow(partialLine);
    expect(container.querySelectorAll('td')).toHaveLength(10);
  });
});

describe('LineTableRow sparkline alignment', () => {
  const axis = ['2020 7', '2020 8', '2025 9', '2025 10'];

  const metricsFor = (
    months: [number, number][],
    wkday = 500,
  ): RidershipRecord[] =>
    months.map(([year, month]) => ({
      year,
      month,
      line_name: 805,
      est_wkday_ridership: wkday,
      est_sat_ridership: 250,
      est_sun_ridership: 125,
    }));

  const renderRow = (lineMetrics: RidershipRecord[], monthAxis = axis) =>
    render(
      <table>
        <tbody>
          <LineTableRow
            {...baseProps}
            lineMetrics={lineMetrics}
            monthAxis={monthAxis}
            isExpanded
          />
        </tbody>
      </table>,
    );

  it('plots one point per window month, in axis order', () => {
    renderRow(metricsFor([[2025, 9]]));

    expect(lastSparklinePoints().map((p) => p.time)).toEqual(axis);
  });

  it('leaves months outside a short line’s coverage null instead of shifting it left', () => {
    // The D Line shape: a late, short series must occupy the right-hand slice of the
    // cell, not stretch across the whole width as it did on its own implicit axis.
    renderRow(metricsFor([[2025, 9]]));

    expect(lastSparklinePoints().map((p) => p.stat)).toEqual([
      null,
      null,
      500,
      null,
    ]);
  });

  it('renders an interior gap as a gap rather than bridging it', () => {
    renderRow(
      metricsFor([
        [2020, 7],
        [2025, 10],
      ]),
    );

    expect(lastSparklinePoints().map((p) => p.stat)).toEqual([
      500,
      null,
      null,
      500,
    ]);
  });

  it('fills every slot for a line that spans the window', () => {
    renderRow(
      metricsFor([
        [2020, 7],
        [2020, 8],
        [2025, 9],
        [2025, 10],
      ]),
    );

    expect(lastSparklinePoints().every((p) => p.stat === 500)).toBe(true);
  });

  it('reads the field named by dayOfWeek', () => {
    render(
      <table>
        <tbody>
          <LineTableRow
            {...baseProps}
            lineMetrics={metricsFor([[2025, 9]])}
            monthAxis={axis}
            dayOfWeek="est_sat_ridership"
            isExpanded
          />
        </tbody>
      </table>,
    );

    expect(lastSparklinePoints()[2].stat).toBe(250);
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
