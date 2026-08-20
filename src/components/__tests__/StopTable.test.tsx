import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import StopTable from '../StopTable';
import { makeLineReadout, makeStopPlace } from '../../test/builders';
import type { StopReadout } from '../../stops';
import type { StopSeriesIndex, StopSeriesPoint } from '../../utils/stopSeries';

/** The sparkline is stubbed, because jsdom has no 2D context for Chart.js to draw on. */
const { chartSpy } = vi.hoisted(() => ({ chartSpy: vi.fn() }));

vi.mock('react-chartjs-2', () => ({
  Line: ({ data }: { data: { datasets: { label?: string }[] } }) => {
    chartSpy(data.datasets);
    return <canvas data-testid="sparkline" />;
  },
}));

/** The datasets the most recent sparkline render received. */
const lastDatasets = (): { label?: string; borderDash?: number[] }[] =>
  (chartSpy.mock.calls.at(-1)?.[0] ?? []) as {
    label?: string;
    borderDash?: number[];
  }[];

const points: StopSeriesPoint[] = [
  { month: '2025-07', boardings: 100, alightings: 90 },
  { month: '2025-08', boardings: null, alightings: null },
  { month: '2025-09', boardings: 120, alightings: 110 },
];

const stubIndex = (): StopSeriesIndex => ({ seriesFor: () => points });

const makeStopReadout = (
  overrides: Partial<StopReadout> = {},
): StopReadout => ({
  ...makeStopPlace(),
  line_name: 204,
  measuredAverage: 1000,
  shareOfLine: 0.1,
  averageBoardings: 1000,
  averageAlightings: 900,
  netAverage: 100,
  monthsReported: 12,
  ...overrides,
});

const lines = [
  makeLineReadout({ id: 204, name: 'Line 204', mode: 'Bus' }),
  makeLineReadout({ id: 801, name: 'A Line' }),
];

const readouts = [
  makeStopReadout({
    key: 'bus:vermont-wilshire',
    name: 'Vermont / Wilshire',
    averageBoardings: 500,
    averageAlightings: 100,
    netAverage: 400,
    shareOfLine: 0.05,
  }),
  makeStopReadout({
    key: 'bus:vermont-santa-monica',
    name: 'Vermont / Santa Monica',
    averageBoardings: 1500,
    averageAlightings: 1800,
    netAverage: -300,
    shareOfLine: 0.15,
  }),
];

const renderTable = (
  props: Partial<React.ComponentProps<typeof StopTable>> = {},
) =>
  render(
    <StopTable
      readouts={readouts}
      lines={lines}
      selectedStopKeys={[]}
      onToggleStop={vi.fn()}
      seriesIndex={stubIndex()}
      measure="ons"
      {...props}
    />,
  );

afterEach(() => {
  // `restoreAllMocks` does not undo `stubGlobal`, and a leaked observer would put every
  // later test on the lazy branch.
  vi.unstubAllGlobals();
  chartSpy.mockClear();
});

/** The stop names in the order the table lists them, from cell 1 past the checkbox. */
const rowNames = (): string[] =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[1].textContent ?? '');

/** A row's checkbox, keyed by stop and line because one stop can be two rows. */
const rowCheckbox = (key: string, lineId = 204): HTMLElement =>
  document.querySelector(
    `[data-qa="stop-select-${String(lineId)}-${key}"] [role="checkbox"]`,
  ) as HTMLElement;

describe('StopTable', () => {
  it('is a ranking, not a list: boardings descending by default', () => {
    renderTable();
    expect(rowNames()).toEqual([
      'Vermont / Santa Monica',
      'Vermont / Wilshire',
    ]);
  });

  it('labels its columns Boardings and Alightings, never ons or offs', () => {
    renderTable();
    expect(screen.getByText('Avg. Boardings')).toBeTruthy();
    expect(screen.getByText('Avg. Alightings')).toBeTruthy();
    expect(screen.queryByText(/\bons\b|\boffs\b/i)).toBeNull();
  });

  it('shows the line each row is measured on, by display name', () => {
    renderTable();
    expect(screen.getAllByText('Line 204')).toHaveLength(2);
  });

  it('renders a negative net rather than hiding it', () => {
    renderTable();
    expect(screen.getByText('-300')).toBeTruthy();
  });

  it('renders the share of line as a percentage', () => {
    renderTable();
    expect(screen.getByText('15.0%')).toBeTruthy();
  });

  it('reverses on a second click of the same header', () => {
    renderTable();
    fireEvent.click(screen.getByText('Avg. Boardings'));
    expect(rowNames()).toEqual([
      'Vermont / Wilshire',
      'Vermont / Santa Monica',
    ]);
  });

  it('sorts a fresh column high-first for a figure', () => {
    renderTable();
    fireEvent.click(screen.getByText('Avg. Alightings'));
    expect(rowNames()).toEqual([
      'Vermont / Santa Monica',
      'Vermont / Wilshire',
    ]);
  });

  it('sorts a fresh column A–Z for a name', () => {
    renderTable();
    fireEvent.click(screen.getByText('Stop'));
    expect(rowNames()).toEqual([
      'Vermont / Santa Monica',
      'Vermont / Wilshire',
    ]);
  });

  /** No figures is not zero figures, at stop grain (ADR-0004). */
  it('sinks a readout with no figures below one reporting zero', () => {
    renderTable({
      readouts: [
        makeStopReadout({
          key: 'bus:nothing',
          name: 'Reported nothing',
          averageBoardings: undefined,
        }),
        makeStopReadout({
          key: 'bus:zero',
          name: 'Reported zero',
          averageBoardings: 0,
        }),
      ],
    });
    expect(rowNames()).toEqual(['Reported zero', 'Reported nothing']);
  });

  it('renders an em dash for an absent figure', () => {
    renderTable({
      readouts: [
        makeStopReadout({
          averageBoardings: undefined,
          shareOfLine: undefined,
        }),
      ],
    });
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('toggles a stop from a row click, with no map involved', () => {
    const onToggleStop = vi.fn();
    renderTable({ onToggleStop });
    fireEvent.click(screen.getByText('Vermont / Wilshire'));
    expect(onToggleStop).toHaveBeenCalledWith('bus:vermont-wilshire');
  });

  /** One tab stop per row: the checkbox is the keyboard route, as in the line table. */
  it('does not make the row itself a tab stop', () => {
    renderTable({});
    const row = document.querySelector(
      '[data-qa="stop-row-204-bus:vermont-wilshire"]',
    )!;
    expect(row.hasAttribute('tabindex')).toBe(false);
  });

  it('toggles a stop from the keyboard, through its checkbox', () => {
    const onToggleStop = vi.fn();
    renderTable({ onToggleStop });
    // `fireEvent` doesn't synthesise the click a Space press causes, so both are sent.
    const checkbox = rowCheckbox('bus:vermont-wilshire');
    fireEvent.keyDown(checkbox, { key: ' ', code: 'Space' });
    fireEvent.click(checkbox);
    expect(onToggleStop).toHaveBeenCalledWith('bus:vermont-wilshire');
  });

  /** The row asks to be toggled, and whether that adds or removes is the hook's to know. */
  it('asks for the same toggle whether or not the stop is already selected', () => {
    const onToggleStop = vi.fn();
    renderTable({
      selectedStopKeys: ['bus:vermont-wilshire'],
      onToggleStop,
    });

    fireEvent.click(screen.getByText('Vermont / Wilshire'));

    expect(onToggleStop).toHaveBeenCalledTimes(1);
    expect(onToggleStop).toHaveBeenCalledWith('bus:vermont-wilshire');
  });

  it('toggles a different row without disturbing the selected one', () => {
    const onToggleStop = vi.fn();
    renderTable({
      selectedStopKeys: ['bus:vermont-wilshire'],
      onToggleStop,
    });

    fireEvent.click(screen.getByText('Vermont / Santa Monica'));

    expect(onToggleStop).toHaveBeenCalledTimes(1);
    expect(onToggleStop).toHaveBeenCalledWith('bus:vermont-santa-monica');
  });

  /** Each row's `data-qa` names only itself, since one stop can appear on two lines. */
  it('gives a stop on two lines two rows, each identified on its own', () => {
    renderTable({
      readouts: [
        makeStopReadout({
          key: 'bus:vermont-wilshire',
          name: 'Vermont / Wilshire',
          line_name: 204,
        }),
        makeStopReadout({
          key: 'bus:vermont-wilshire',
          name: 'Vermont / Wilshire',
          line_name: 801,
        }),
      ],
    });

    expect(
      document.querySelectorAll(
        '[data-qa="stop-row-204-bus:vermont-wilshire"]',
      ),
    ).toHaveLength(1);
    expect(
      document.querySelectorAll(
        '[data-qa="stop-row-801-bus:vermont-wilshire"]',
      ),
    ).toHaveLength(1);
    expect(rowCheckbox('bus:vermont-wilshire', 204)).not.toBe(
      rowCheckbox('bus:vermont-wilshire', 801),
    );
  });
});

/** The selection column, where the checkbox's checked state is what says a row is selected. */
describe('StopTable selection column', () => {
  it('gives every row a checkbox', () => {
    renderTable();
    expect(screen.getAllByRole('checkbox')).toHaveLength(readouts.length);
  });

  it('names each checkbox for its stop and line, not just its stop', () => {
    renderTable();
    expect(
      screen.getByRole('checkbox', { name: 'Vermont / Wilshire · Line 204' }),
    ).toBeTruthy();
  });

  it('checks the rows whose stops are selected', () => {
    renderTable({ selectedStopKeys: ['bus:vermont-wilshire'] });
    expect(rowCheckbox('bus:vermont-wilshire').dataset.state).toBe('checked');
  });

  it('leaves the other rows unchecked', () => {
    renderTable({ selectedStopKeys: ['bus:vermont-wilshire'] });
    expect(rowCheckbox('bus:vermont-santa-monica').dataset.state).toBe(
      'unchecked',
    );
  });

  it('checks every row when several stops are selected', () => {
    renderTable({
      selectedStopKeys: ['bus:vermont-wilshire', 'bus:vermont-santa-monica'],
    });
    expect(rowCheckbox('bus:vermont-wilshire').dataset.state).toBe('checked');
    expect(rowCheckbox('bus:vermont-santa-monica').dataset.state).toBe(
      'checked',
    );
  });

  it('no longer marks a row with aria-current', () => {
    renderTable({ selectedStopKeys: ['bus:vermont-wilshire'] });
    const row = document.querySelector(
      '[data-qa="stop-row-204-bus:vermont-wilshire"]',
    );
    expect(row?.hasAttribute('aria-current')).toBe(false);
  });

  it('toggles the stop from its checkbox', () => {
    const onToggleStop = vi.fn();
    renderTable({ onToggleStop });

    fireEvent.click(rowCheckbox('bus:vermont-wilshire'));

    expect(onToggleStop).toHaveBeenCalledWith('bus:vermont-wilshire');
  });

  /** The row is a toggle too, so without `stopPropagation` one click toggles twice. */
  it('fires one toggle per checkbox click, not two', () => {
    const onToggleStop = vi.fn();
    renderTable({ onToggleStop });

    fireEvent.click(rowCheckbox('bus:vermont-wilshire'));

    expect(onToggleStop).toHaveBeenCalledTimes(1);
  });

  /** Space, not Enter, because Radix cancels Enter on a checkbox. */
  it('fires one toggle per Space press on the checkbox, not two', () => {
    const onToggleStop = vi.fn();
    renderTable({ onToggleStop });

    const checkbox = rowCheckbox('bus:vermont-wilshire');
    fireEvent.keyDown(checkbox, { key: ' ', code: 'Space' });
    fireEvent.click(checkbox);

    expect(onToggleStop).toHaveBeenCalledTimes(1);
  });

  /** The row has no key handler of its own, so a keydown alone toggles nothing. */
  it('does not let a Space press on the checkbox reach the row', () => {
    const onToggleStop = vi.fn();
    renderTable({ onToggleStop });

    fireEvent.keyDown(rowCheckbox('bus:vermont-wilshire'), {
      key: ' ',
      code: 'Space',
    });

    expect(onToggleStop).not.toHaveBeenCalled();
  });

  it('does not advertise the select header as sortable', () => {
    renderTable();
    const header = screen.getByRole('columnheader', { name: 'Select' });
    expect(header.hasAttribute('aria-sort')).toBe(false);
    expect(header.className).not.toContain('cursor-pointer');
  });

  it('does not reorder the table when the select header is clicked', () => {
    renderTable();
    const before = rowNames();
    fireEvent.click(screen.getByRole('columnheader', { name: 'Select' }));
    expect(rowNames()).toEqual(before);
  });
});

describe('StopTable ridership-over-time column', () => {
  it('renders the column header', () => {
    renderTable();
    expect(screen.getByText('Ridership over time')).toBeTruthy();
  });

  /** The column is presentational, so `aria-sort="none"` would announce a control that isn't one. */
  it('does not advertise itself as sortable', () => {
    renderTable();
    const header = screen.getByText('Ridership over time');
    expect(header.hasAttribute('aria-sort')).toBe(false);
    expect(header.className).not.toContain('cursor-pointer');
  });

  it('does not reorder the table when its header is clicked', () => {
    renderTable();
    const before = rowNames();
    fireEvent.click(screen.getByText('Ridership over time'));
    expect(rowNames()).toEqual(before);
  });

  it('gives every row a sparkline cell', () => {
    renderTable();
    expect(
      document.querySelectorAll('[data-qa^="stop-sparkline-"]'),
    ).toHaveLength(readouts.length);
  });

  /** Without an IntersectionObserver the fallback has to be a table that draws. */
  it('draws every row when IntersectionObserver is unavailable', () => {
    renderTable();
    expect(screen.getAllByTestId('sparkline')).toHaveLength(readouts.length);
  });

  it('draws the measure’s series: boardings only, alightings only, or both', () => {
    renderTable({ measure: 'ons' });
    expect(lastDatasets().map((d) => d.label)).toEqual(['Boardings']);

    chartSpy.mockClear();
    renderTable({ measure: 'offs' });
    expect(lastDatasets().map((d) => d.label)).toEqual(['Alightings']);

    chartSpy.mockClear();
    renderTable({ measure: 'both' });
    expect(lastDatasets().map((d) => d.label)).toEqual([
      'Boardings',
      'Alightings',
    ]);
    // Alightings dashed, so the two are distinguishable without a second colour.
    expect(lastDatasets()[1].borderDash).toBeTruthy();
  });

  it('asks the index for each row’s own (stop, line) pair', () => {
    const seriesFor = vi.fn(() => points);
    renderTable({ seriesIndex: { seriesFor } });

    expect(seriesFor.mock.calls).toEqual(
      expect.arrayContaining([
        ['bus:vermont-wilshire', 204],
        ['bus:vermont-santa-monica', 204],
      ]),
    );
  });
});

describe('StopTable lazy sparklines', () => {
  /** Drive the observer by hand: nothing scrolls in jsdom. */
  let notify: IntersectionObserverCallback;

  const withObserver = (): void => {
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        root = null;
        rootMargin = '';
        thresholds: number[] = [];
        constructor(callback: IntersectionObserverCallback) {
          notify = callback;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return [];
        }
      },
    );
  };

  const scrollTo = (cell: Element): void => {
    act(() => {
      notify(
        [{ target: cell, isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
  };

  it('mounts no chart until a row is scrolled to', () => {
    withObserver();
    renderTable();
    expect(screen.queryAllByTestId('sparkline')).toHaveLength(0);
  });

  it('mounts only the row that came into view', () => {
    withObserver();
    renderTable();

    scrollTo(
      document.querySelector(
        '[data-qa="stop-sparkline-204-bus:vermont-wilshire"]',
      )!,
    );

    expect(screen.getAllByTestId('sparkline')).toHaveLength(1);
  });

  /** Add-only, so a mounted chart survives a re-sort rather than being rebuilt. */
  it('keeps a mounted sparkline through a re-sort', () => {
    withObserver();
    renderTable();

    scrollTo(
      document.querySelector(
        '[data-qa="stop-sparkline-204-bus:vermont-wilshire"]',
      )!,
    );
    fireEvent.click(screen.getByText('Avg. Alightings'));

    expect(screen.getAllByTestId('sparkline')).toHaveLength(1);
  });

  it('lists every readout — nothing is silently truncated', () => {
    const many = Array.from({ length: 200 }, (_, index) =>
      makeStopReadout({ key: `bus:stop-${index}`, name: `Stop ${index}` }),
    );
    renderTable({ readouts: many });
    expect(screen.getAllByRole('row')).toHaveLength(201);
  });
});
