import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import StopTable from '../StopTable';
import { makeLineReadout, makeStopPlace } from '../../test/builders';
import type { StopReadout } from '../../stops';
import type { StopSeriesIndex, StopSeriesPoint } from '../../utils/stopSeries';

/**
 * The sparkline is a Chart.js canvas; jsdom has no 2D context. Stub it and capture the
 * datasets so the measure's encoding is assertable without a real canvas.
 */
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

const makeStopReadout = (overrides: Partial<StopReadout> = {}): StopReadout => ({
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

const renderTable = (props: Partial<React.ComponentProps<typeof StopTable>> = {}) =>
  render(
    <StopTable
      readouts={readouts}
      lines={lines}
      selectedStopKey={null}
      onSelectStop={vi.fn()}
      onClearStop={vi.fn()}
      seriesIndex={stubIndex()}
      measure="ons"
      {...props}
    />,
  );

afterEach(() => {
  // `restoreAllMocks` does not undo `stubGlobal`; a leaked IntersectionObserver would
  // put every later test in this file on the lazy branch.
  vi.unstubAllGlobals();
  chartSpy.mockClear();
});

/** The stop names in the order the table currently lists them. */
const rowNames = (): string[] =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[0].textContent ?? '');

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

  /**
   * ADR-0004's contract at stop grain: no figures is not zero figures. A stop that
   * reported nothing must not out-rank one that genuinely reported zero riders.
   */
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
        makeStopReadout({ averageBoardings: undefined, shareOfLine: undefined }),
      ],
    });
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('selects a stop from a row click, with no map involved', () => {
    const onSelectStop = vi.fn();
    renderTable({ onSelectStop });
    fireEvent.click(screen.getByText('Vermont / Wilshire'));
    expect(onSelectStop).toHaveBeenCalledWith('bus:vermont-wilshire');
  });

  it('selects a stop from the keyboard', () => {
    const onSelectStop = vi.fn();
    renderTable({ onSelectStop });
    fireEvent.keyDown(
      document.querySelector('[data-qa="stop-row-bus:vermont-wilshire"]')!,
      { key: 'Enter' },
    );
    expect(onSelectStop).toHaveBeenCalledWith('bus:vermont-wilshire');
  });

  it('leaves other keys alone', () => {
    const onSelectStop = vi.fn();
    renderTable({ onSelectStop });
    fireEvent.keyDown(
      document.querySelector('[data-qa="stop-row-bus:vermont-wilshire"]')!,
      { key: 'a' },
    );
    expect(onSelectStop).not.toHaveBeenCalled();
  });

  /**
   * `aria-current`, not `aria-selected` — the latter is only honoured on a row inside
   * a `grid`/`treegrid`, so on a plain table it would be an attribute nothing reads.
   */
  it('marks the selected row', () => {
    renderTable({ selectedStopKey: 'bus:vermont-wilshire' });
    const row = document.querySelector(
      '[data-qa="stop-row-bus:vermont-wilshire"]',
    );
    expect(row?.getAttribute('aria-current')).toBe('true');
    expect(row?.getAttribute('tabindex')).toBe('0');
  });

  it('leaves an unselected row unmarked rather than marking it false', () => {
    renderTable({ selectedStopKey: 'bus:vermont-wilshire' });
    const row = document.querySelector(
      '[data-qa="stop-row-bus:vermont-santa-monica"]',
    );
    expect(row?.hasAttribute('aria-current')).toBe(false);
  });

  /**
   * The row is a toggle. Without this, clicking the selected row is a dead click —
   * and it is the only route out of the series a keyboard can reach.
   */
  it('clears the stop when the selected row is clicked again', () => {
    const onSelectStop = vi.fn();
    const onClearStop = vi.fn();
    renderTable({
      selectedStopKey: 'bus:vermont-wilshire',
      onSelectStop,
      onClearStop,
    });

    fireEvent.click(screen.getByText('Vermont / Wilshire'));

    expect(onClearStop).toHaveBeenCalledTimes(1);
    expect(onSelectStop).not.toHaveBeenCalled();
  });

  it('still selects when a different row is clicked', () => {
    const onSelectStop = vi.fn();
    const onClearStop = vi.fn();
    renderTable({
      selectedStopKey: 'bus:vermont-wilshire',
      onSelectStop,
      onClearStop,
    });

    fireEvent.click(screen.getByText('Vermont / Santa Monica'));

    expect(onSelectStop).toHaveBeenCalledWith('bus:vermont-santa-monica');
    expect(onClearStop).not.toHaveBeenCalled();
  });

  it('clears from the keyboard too', () => {
    const onClearStop = vi.fn();
    renderTable({ selectedStopKey: 'bus:vermont-wilshire', onClearStop });

    fireEvent.keyDown(
      document.querySelector('[data-qa="stop-row-bus:vermont-wilshire"]')!,
      { key: 'Enter' },
    );

    expect(onClearStop).toHaveBeenCalledTimes(1);
  });
});

describe('StopTable ridership-over-time column', () => {
  it('renders the column header', () => {
    renderTable();
    expect(screen.getByText('Ridership over time')).toBeTruthy();
  });

  /**
   * The column is presentational. `aria-sort="none"` would be wrong here — it means
   * "sortable, not currently sorted", so it would announce a control that isn't one.
   */
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

  /**
   * jsdom has no IntersectionObserver, and the fallback there must be a table that
   * draws rather than a table of blank cells.
   */
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
      document.querySelector('[data-qa="stop-sparkline-bus:vermont-wilshire"]')!,
    );

    expect(screen.getAllByTestId('sparkline')).toHaveLength(1);
  });

  /**
   * Add-only: a mounted chart survives a re-sort. React keys rows by the same identity
   * the hook does, so the DOM is re-parented rather than rebuilt.
   */
  it('keeps a mounted sparkline through a re-sort', () => {
    withObserver();
    renderTable();

    scrollTo(
      document.querySelector('[data-qa="stop-sparkline-bus:vermont-wilshire"]')!,
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
