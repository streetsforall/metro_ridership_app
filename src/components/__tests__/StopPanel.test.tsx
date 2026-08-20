import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StopPanel from '../StopPanel';
import { makeLineReadout, makeStopPlace } from '../../test/builders';
import type { StopReadout, StopView } from '../../stops';

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

const makeView = (overrides: Partial<StopView> = {}): StopView => ({
  months: ['2025-07', '2026-06'],
  readouts: [makeStopReadout()],
  markers: { type: 'FeatureCollection', features: [] },
  coverage: { from: '2025-07', to: '2026-06', overlapsWindow: true },
  ...overrides,
});

const renderPanel = (
  props: Partial<React.ComponentProps<typeof StopPanel>> = {},
) =>
  render(
    <StopPanel
      view={makeView()}
      windowMonths={['2025-07', '2026-06']}
      isLoading={false}
      hasFailed={false}
      lines={[makeLineReadout({ id: 204, name: 'Line 204', mode: 'Bus' })]}
      measure="ons"
      onMeasureChange={vi.fn()}
      selectedStopKeys={[]}
      onToggleStop={vi.fn()}
      onClearStops={vi.fn()}
      onSelectAllStops={vi.fn()}
      searchText=""
      onSearchTextChange={vi.fn()}
      onUseCoverageWindow={vi.fn()}
      {...props}
    />,
  );

describe('StopPanel', () => {
  it('mounts as #stop-panel', () => {
    renderPanel();
    expect(document.querySelector('#stop-panel')).toBeTruthy();
  });

  it('renders the ranked table without any map interaction', () => {
    renderPanel();
    expect(document.querySelector('[data-qa="stop-table"]')).toBeTruthy();
  });

  it('offers the three measures by their vocabulary names', () => {
    renderPanel();
    expect(screen.getByText('Boardings')).toBeTruthy();
    expect(screen.getByText('Alightings')).toBeTruthy();
    expect(screen.getByText('Both')).toBeTruthy();
  });

  it('asks for a new measure when one is picked', () => {
    const onMeasureChange = vi.fn();
    renderPanel({ onMeasureChange });
    fireEvent.click(screen.getByText('Alightings'));
    expect(onMeasureChange).toHaveBeenCalledWith('offs');
  });

  it('toggles a stop from a table row', () => {
    const onToggleStop = vi.fn();
    renderPanel({ onToggleStop });
    fireEvent.click(screen.getByText('Vermont / Wilshire'));
    expect(onToggleStop).toHaveBeenCalledWith('bus:vermont-wilshire');
  });

  /**
   * `overlapsWindow` is `false` while nothing has loaded, so the loading state has to
   * win — otherwise a slow network is indistinguishable from a window with no stop
   * data, and the panel offers to move a window that is already right.
   */
  it('shows loading rather than the empty state while a payload is in flight', () => {
    renderPanel({
      isLoading: true,
      view: makeView({
        months: [],
        readouts: [],
        coverage: { from: null, to: null, overlapsWindow: false },
      }),
    });
    expect(screen.getByText('Loading stop ridership…')).toBeTruthy();
    expect(document.querySelector('[data-qa="stop-coverage-empty"]')).toBeNull();
    // And it must not claim the dataset was never ingested either. An empty coverage
    // is the loading state; the manifest is what knows whether stop data exists.
    expect(
      document.querySelector('[data-qa="stop-coverage-no-data"]'),
    ).toBeNull();
    expect(
      document.querySelector('[data-qa="stop-coverage-span"]'),
    ).toBeTruthy();
  });

  it('does not claim the dataset is missing when a fetch failed', () => {
    renderPanel({
      hasFailed: true,
      view: makeView({
        months: [],
        readouts: [],
        coverage: { from: null, to: null, overlapsWindow: false },
      }),
    });
    expect(
      document.querySelector('[data-qa="stop-coverage-no-data"]'),
    ).toBeNull();
  });

  it('offers the covered span when the window does not overlap it', () => {
    renderPanel({
      view: makeView({
        months: [],
        readouts: [],
        coverage: { from: '2025-07', to: '2026-06', overlapsWindow: false },
      }),
    });
    expect(
      document.querySelector('[data-qa="stop-coverage-empty"]'),
    ).toBeTruthy();
    expect(document.querySelector('[data-qa="stop-table"]')).toBeNull();
  });

  it('routes the coverage-window button at the caller, verbatim', () => {
    const onUseCoverageWindow = vi.fn();
    renderPanel({
      onUseCoverageWindow,
      view: makeView({
        months: [],
        readouts: [],
        coverage: { from: '2025-07', to: '2026-06', overlapsWindow: false },
      }),
    });
    fireEvent.click(screen.getByText(/^Show /));
    expect(onUseCoverageWindow).toHaveBeenCalledWith('2025-07', '2026-06');
  });

  it('asks for a line before it asks for anything else', () => {
    renderPanel({ lines: [], view: makeView({ readouts: [] }) });
    expect(screen.getByText('Select a Metro line to see its stops.')).toBeTruthy();
  });

  it('distinguishes a failed fetch from an empty period', () => {
    renderPanel({ hasFailed: true, view: makeView({ readouts: [] }) });
    expect(
      screen.getByText('Stop-level ridership could not be loaded.'),
    ).toBeTruthy();
  });

  /**
   * Rail and bus are separate requests with independent fates, and bus is 5.3 MB and
   * arrives later. Neither its wait nor its failure may take the panel over once there
   * is a table on screen — that would blank what the reader is looking at, or report
   * one 404 as "nothing could be loaded" when half of it loaded.
   */
  it('keeps the table on screen while a second payload loads', () => {
    renderPanel({ isLoading: true });
    expect(document.querySelector('[data-qa="stop-table"]')).toBeTruthy();
    expect(document.querySelector('[data-qa="stop-loading-more"]')).toBeTruthy();
    expect(screen.queryByText('Loading stop ridership…')).toBeNull();
  });

  it('keeps the table on screen when one of two payloads fails', () => {
    renderPanel({ hasFailed: true });
    expect(document.querySelector('[data-qa="stop-table"]')).toBeTruthy();
    expect(
      document.querySelector('[data-qa="stop-partial-failure"]'),
    ).toBeTruthy();
    expect(
      screen.queryByText('Stop-level ridership could not be loaded.'),
    ).toBeNull();
  });

  it('says so when the selected lines have no stop data in the period', () => {
    renderPanel({ view: makeView({ readouts: [] }) });
    expect(
      screen.getByText('No stop-level data for the selected lines in this period.'),
    ).toBeTruthy();
  });

  it('states the covered span persistently, not only when something is missing', () => {
    renderPanel();
    expect(document.querySelector('[data-qa="stop-coverage-span"]')).toBeTruthy();
  });

  /**
   * The ordinary case: the chart above covers years, the stop panel covers twelve
   * months inside them. That is partial coverage in exactly the sense the line table
   * uses, and the panel labels it the same way.
   */
  it('labels partial coverage against the chart’s own month axis', () => {
    renderPanel({
      windowMonths: ['2020-07', '2025-07', '2026-06'],
      view: makeView({ months: ['2025-07', '2026-06'] }),
    });
    expect(
      document.querySelector('[data-qa="stop-coverage-partial"]')?.textContent,
    ).toBe('Jul 2025 → Jun 2026');
  });
});

/**
 * The table's chrome, laid out as the line filter's is.
 *
 * `Deselect Stop` is gone: `Clear All` replaces it and sits above the table, because it
 * acts on the table rather than on one stop. Without
 * a way back the panel would be a one-way door — a reader could reach a different stop, or
 * close the panel, but never return to the state it opens in.
 */
describe('StopPanel table chrome', () => {
  const twoReadouts = makeView({
    readouts: [
      makeStopReadout(),
      makeStopReadout({
        key: 'bus:vermont-santa-monica',
        name: 'Vermont / Santa Monica',
      }),
    ],
  });

  it('offers a search bar above the table', () => {
    renderPanel();
    expect(document.querySelector('#search-stops')).toBeTruthy();
  });

  it('names the search bar for assistive tech, not only by placeholder', () => {
    renderPanel();
    expect(screen.getByRole('textbox', { name: 'Search stops' })).toBeTruthy();
  });

  it('shows the current search text', () => {
    renderPanel({ searchText: 'wilshire' });
    expect(
      (document.querySelector('#search-stops') as HTMLInputElement).value,
    ).toBe('wilshire');
  });

  it('asks for a new search text as it is typed', () => {
    const onSearchTextChange = vi.fn();
    renderPanel({ onSearchTextChange });

    fireEvent.change(document.querySelector('#search-stops')!, {
      target: { value: 'union' },
    });

    expect(onSearchTextChange).toHaveBeenCalledWith('union');
  });

  it('narrows the table to the stops whose names match', () => {
    renderPanel({ view: twoReadouts, searchText: 'santa' });
    expect(screen.queryByText('Vermont / Santa Monica')).toBeTruthy();
    expect(screen.queryByText('Vermont / Wilshire')).toBeNull();
  });

  it('matches a stop name case-insensitively, as the line search does', () => {
    renderPanel({ view: twoReadouts, searchText: 'SANTA' });
    expect(screen.queryByText('Vermont / Santa Monica')).toBeTruthy();
  });

  it('offers Select All and Clear All rather than a Deselect Stop link', () => {
    renderPanel({ selectedStopKeys: ['bus:vermont-wilshire'] });
    expect(screen.getByRole('button', { name: 'Select All' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clear All' })).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Deselect Stop' }),
    ).toBeNull();
  });

  /* Both are always there, so the controls do not appear and vanish under the reader. */
  it('offers both before anything is selected', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Select All' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Clear All' })).toBeTruthy();
  });

  it('clears every selection when Clear All is pressed', () => {
    const onClearStops = vi.fn();
    renderPanel({
      selectedStopKeys: ['bus:vermont-wilshire'],
      onClearStops,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Clear All' }));

    expect(onClearStops).toHaveBeenCalledTimes(1);
  });

  it('hands Select All every stop the table is listing', () => {
    const onSelectAllStops = vi.fn();
    renderPanel({ view: twoReadouts, onSelectAllStops });

    fireEvent.click(screen.getByRole('button', { name: 'Select All' }));

    expect(onSelectAllStops).toHaveBeenCalledWith([
      'bus:vermont-wilshire',
      'bus:vermont-santa-monica',
    ]);
  });

  /**
   * Scoped by the search, exactly as the line filter's `Select All` is scoped by its own.
   * That scoping is what stands in for a cap: nothing is capped, so a reader who wants a
   * corridor searches for it first.
   */
  it('scopes Select All to the searched rows', () => {
    const onSelectAllStops = vi.fn();
    renderPanel({ view: twoReadouts, searchText: 'santa', onSelectAllStops });

    fireEvent.click(screen.getByRole('button', { name: 'Select All' }));

    expect(onSelectAllStops).toHaveBeenCalledWith([
      'bus:vermont-santa-monica',
    ]);
  });

  it('does not call Clear All when Select All is pressed', () => {
    const onClearStops = vi.fn();
    renderPanel({ onClearStops });
    fireEvent.click(screen.getByRole('button', { name: 'Select All' }));
    expect(onClearStops).not.toHaveBeenCalled();
  });

  /** A bare <button> submits; inside any future form that would reload the page. */
  it.each(['Select All', 'Clear All'])(
    '%s is a button that does not submit',
    (name) => {
      renderPanel();
      expect(
        screen.getByRole('button', { name }).getAttribute('type'),
      ).toBe('button');
    },
  );

  /**
   * Both read as text links, like the line filter's pair — the dashboard's existing
   * selection actions. `bg-transparent border-none` is what does that: the global button
   * rule otherwise paints each a filled navy pill, which is how the old control first
   * shipped.
   */
  it.each(['Select All', 'Clear All'])(
    '%s is styled as a text link, not a filled button',
    (name) => {
      renderPanel();
      const className = screen.getByRole('button', { name }).className;

      expect(className).toContain('bg-transparent');
      expect(className).toContain('border-none');
      expect(className).toContain('text-[#0fada8]');
    },
  );
});
