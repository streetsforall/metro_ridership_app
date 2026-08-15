import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import DateRangeSelector, {
  type DateRangeSelectorProps,
} from './DateRangeSelector';
import { daysOfWeek } from '../hooks/useUserDashboardInput';

const defaultProps = {
  startDate: new Date(2020, 6), // July 2020
  setStartDate: vi.fn(),
  endDate: new Date(2025, 6), // July 2025
  setEndDate: vi.fn(),
  dayOfWeek: daysOfWeek.Weekday,
  setDayOfWeek: vi.fn(),
  showChart: true,
  toggleShowChart: vi.fn(),
  showSummary: true,
  toggleShowSummary: vi.fn(),
  showMap: true,
  toggleShowMap: vi.fn(),
  showContextLogs: false,
  toggleShowContextLogs: vi.fn(),
  chartSize: 'standard',
  setChartSize: vi.fn(),
  mapSize: 'standard',
  setMapSize: vi.fn(),
  logSize: 'standard',
  setLogSize: vi.fn(),
  summarySplit: 40,
  setSummarySplit: vi.fn(),
  resetPanelSettings: vi.fn(),
} satisfies DateRangeSelectorProps;

/**
 * Panel Settings is collapsed on load, so every assertion about a control
 * inside it opens the disclosure first.
 */
const openPanelSettings = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Show panel settings' }));
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

  it('offers 2026 as a selectable year (dynamic range tracks the data)', () => {
    render(<DateRangeSelector {...defaultProps} />);
    const [, startYear] = screen.getAllByRole('combobox');
    const years = Array.from(
      (startYear as HTMLSelectElement).options,
      (o) => o.value,
    );
    expect(years).toContain('2026');
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

describe('Panel Settings disclosure', () => {
  it('renders the Panel Settings fieldset legend', () => {
    render(<DateRangeSelector {...defaultProps} />);
    expect(screen.getByText('Panel Settings')).toBeTruthy();
  });

  it('is collapsed on load', () => {
    render(<DateRangeSelector {...defaultProps} />);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('reports its collapsed state to assistive technology', () => {
    render(<DateRangeSelector {...defaultProps} />);
    const toggle = screen.getByRole('button', { name: 'Show panel settings' });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('reveals the four panel checkboxes when opened', () => {
    render(<DateRangeSelector {...defaultProps} />);
    openPanelSettings();
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
  });

  it('collapses again when the toggle is clicked a second time', () => {
    render(<DateRangeSelector {...defaultProps} />);
    openPanelSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Hide panel settings' }));
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });
});

describe('Panel Settings visibility checkboxes', () => {
  const panels = [
    { label: 'Chart', prop: 'showChart', toggle: 'toggleShowChart' },
    { label: 'Summary', prop: 'showSummary', toggle: 'toggleShowSummary' },
    { label: 'Map', prop: 'showMap', toggle: 'toggleShowMap' },
    {
      label: 'Context Logs',
      prop: 'showContextLogs',
      toggle: 'toggleShowContextLogs',
    },
  ] as const;

  panels.forEach(({ label, prop, toggle }) => {
    it(`renders the ${label} checkbox`, () => {
      render(<DateRangeSelector {...defaultProps} />);
      openPanelSettings();
      expect(screen.getByRole('checkbox', { name: label })).toBeTruthy();
    });

    it(`shows ${label} as unchecked when its panel is hidden`, () => {
      render(<DateRangeSelector {...defaultProps} {...{ [prop]: false }} />);
      openPanelSettings();
      expect(
        screen.getByRole('checkbox', { name: label }).getAttribute('aria-checked'),
      ).toBe('false');
    });

    it(`shows ${label} as checked when its panel is shown`, () => {
      render(<DateRangeSelector {...defaultProps} {...{ [prop]: true }} />);
      openPanelSettings();
      expect(
        screen.getByRole('checkbox', { name: label }).getAttribute('aria-checked'),
      ).toBe('true');
    });

    it(`calls ${toggle} when the ${label} checkbox is clicked`, () => {
      const spy = vi.fn();
      render(<DateRangeSelector {...defaultProps} {...{ [toggle]: spy }} />);
      openPanelSettings();
      fireEvent.click(screen.getByRole('checkbox', { name: label }));
      expect(spy).toHaveBeenCalledOnce();
    });
  });
});

/**
 * Radix's `type="single"` ToggleGroup is a radiogroup: the root takes
 * `role="group"` and each item `role="radio"` with `aria-checked`. Every
 * assertion here goes through those roles rather than the ids, because the three
 * size controls all offer a "Small"/"Standard"/"Large" and only the enclosing
 * group tells them apart — which is the same thing a screen reader relies on.
 */
describe('Panel Settings size controls', () => {
  const sizeControls = [
    { name: 'Chart height', prop: 'chartSize', setter: 'setChartSize' },
    { name: 'Map height', prop: 'mapSize', setter: 'setMapSize' },
    { name: 'Context log height', prop: 'logSize', setter: 'setLogSize' },
  ] as const;

  /**
   * Asserted per group rather than as a bare `radio` count: Day of Week is a
   * RadioGroup too and its three items are on screen whether or not this
   * disclosure is open.
   */
  it('are not reachable while the disclosure is collapsed', () => {
    render(<DateRangeSelector {...defaultProps} />);
    for (const name of [
      'Chart height',
      'Map height',
      'Context log height',
      'Summary | map split',
    ]) {
      expect(screen.queryByRole('group', { name })).toBeNull();
    }
  });

  sizeControls.forEach(({ name, prop, setter }) => {
    it(`renders the ${name} control with three steps`, () => {
      render(<DateRangeSelector {...defaultProps} />);
      openPanelSettings();
      const group = within(screen.getByRole('group', { name }));
      expect(group.getAllByRole('radio')).toHaveLength(3);
    });

    it(`marks Standard as the checked ${name} step by default`, () => {
      render(<DateRangeSelector {...defaultProps} />);
      openPanelSettings();
      const group = within(screen.getByRole('group', { name }));
      expect(
        group.getByRole('radio', { name: 'Standard' }).getAttribute('aria-checked'),
      ).toBe('true');
    });

    it(`reflects a non-default ${name} back onto its step`, () => {
      render(<DateRangeSelector {...defaultProps} {...{ [prop]: 'large' }} />);
      openPanelSettings();
      const group = within(screen.getByRole('group', { name }));
      expect(
        group.getByRole('radio', { name: 'Large' }).getAttribute('aria-checked'),
      ).toBe('true');
    });

    it(`calls ${setter} with the step that was clicked`, () => {
      const spy = vi.fn();
      render(<DateRangeSelector {...defaultProps} {...{ [setter]: spy }} />);
      openPanelSettings();
      const group = within(screen.getByRole('group', { name }));
      fireEvent.click(group.getByRole('radio', { name: 'Small' }));
      expect(spy).toHaveBeenCalledWith('small');
    });

    /**
     * Radix emits `''` when the pressed item is clicked again. There is no
     * fourth "no size" state, so that must reach the setter as nothing at all.
     */
    it(`ignores a click that would deselect the current ${name}`, () => {
      const spy = vi.fn();
      render(<DateRangeSelector {...defaultProps} {...{ [setter]: spy }} />);
      openPanelSettings();
      const group = within(screen.getByRole('group', { name }));
      fireEvent.click(group.getByRole('radio', { name: 'Standard' }));
      expect(spy).not.toHaveBeenCalled();
    });
  });

  it('renders the split control with its three ratios', () => {
    render(<DateRangeSelector {...defaultProps} />);
    openPanelSettings();
    const group = within(screen.getByRole('group', { name: 'Summary | map split' }));
    expect(group.getByRole('radio', { name: '50/50' })).toBeTruthy();
    expect(group.getByRole('radio', { name: '40/60' })).toBeTruthy();
    expect(group.getByRole('radio', { name: '30/70' })).toBeTruthy();
  });

  it('checks 40/60 by default', () => {
    render(<DateRangeSelector {...defaultProps} />);
    openPanelSettings();
    expect(
      screen.getByRole('radio', { name: '40/60' }).getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('calls setSummarySplit with the ratio as a number', () => {
    const setSummarySplit = vi.fn();
    render(
      <DateRangeSelector {...defaultProps} setSummarySplit={setSummarySplit} />,
    );
    openPanelSettings();
    fireEvent.click(screen.getByRole('radio', { name: '30/70' }));
    expect(setSummarySplit).toHaveBeenCalledWith(30);
  });

  /**
   * Below `lg` the summary and map stack and the row is a single column, so the
   * split has nothing to change. It is hidden with a Tailwind class rather than
   * dropped from the tree — jsdom has no viewport to branch on, so the class is
   * what there is to assert.
   */
  it('hides the split control below the lg breakpoint', () => {
    render(<DateRangeSelector {...defaultProps} />);
    openPanelSettings();
    const wrapper =
      screen.getByRole('group', { name: 'Summary | map split' }).parentElement;
    expect(wrapper?.className).toContain('hidden');
    expect(wrapper?.className).toContain('lg:flex');
  });

  it('leaves the three size controls visible at every width', () => {
    render(<DateRangeSelector {...defaultProps} />);
    openPanelSettings();
    const wrapper = screen.getByRole('group', { name: 'Map height' }).parentElement;
    expect(wrapper?.className).not.toContain('hidden');
  });
});

describe('Panel Settings reset', () => {
  it('is not reachable while the disclosure is collapsed', () => {
    render(<DateRangeSelector {...defaultProps} />);
    expect(
      screen.queryByRole('button', { name: 'Reset to defaults' }),
    ).toBeNull();
  });

  it('calls resetPanelSettings when clicked', () => {
    const resetPanelSettings = vi.fn();
    render(
      <DateRangeSelector
        {...defaultProps}
        resetPanelSettings={resetPanelSettings}
      />,
    );
    openPanelSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Reset to defaults' }));
    expect(resetPanelSettings).toHaveBeenCalledOnce();
  });
});
