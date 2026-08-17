import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StopPanel from '../StopPanel';
import { makeLineReadout, makeStopPlace, makeStopRecord } from '../../test/builders';
import { daysOfWeek } from '../../@types/metrics.types';
import type { StopReadout, StopView } from '../../stops';

/**
 * The per-stop series is a Chart.js canvas; what it draws is `buildStopSeries`'s job
 * and is tested there. Here it is a props sink, so the panel's own responsibility —
 * which state it renders, and that a row click and a map click reach the same place —
 * is what is under test.
 */
vi.mock('../StopSeriesChart', async () => {
  const actual = await vi.importActual<typeof import('../StopSeriesChart')>(
    '../StopSeriesChart',
  );
  return {
    ...actual,
    default: () => <canvas data-qa="stop-series" />,
  };
});

/**
 * The table's per-row sparkline, for the same reason: a Chart.js canvas that
 * `StopTable`'s own spec covers. Here it only has to not need a 2D context.
 */
vi.mock('../StopSparkline', () => ({
  default: () => <canvas data-qa="stop-sparkline" />,
}));

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
      records={[makeStopRecord()]}
      isLoading={false}
      hasFailed={false}
      lines={[makeLineReadout({ id: 204, name: 'Line 204', mode: 'Bus' })]}
      dayOfWeek={daysOfWeek.Weekday}
      measure="ons"
      onMeasureChange={vi.fn()}
      selectedStopKey={null}
      onSelectStop={vi.fn()}
      onClearStop={vi.fn()}
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

  it('draws no series until a stop is selected', () => {
    renderPanel();
    expect(document.querySelector('[data-qa="stop-series"]')).toBeNull();
  });

  it('draws the selected stop’s series and names its line', () => {
    renderPanel({ selectedStopKey: 'bus:vermont-wilshire' });
    expect(document.querySelector('[data-qa="stop-series"]')).toBeTruthy();
    expect(
      document.querySelector('[data-qa="stop-series-figure"]')?.textContent,
    ).toContain('Line 204');
  });

  it('selects a stop from a table row', () => {
    const onSelectStop = vi.fn();
    renderPanel({ onSelectStop });
    fireEvent.click(screen.getByText('Vermont / Wilshire'));
    expect(onSelectStop).toHaveBeenCalledWith('bus:vermont-wilshire');
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
 * Without this the series is a one-way door: a reader who opens one can reach a
 * different stop, or close the whole panel, but not get back to the state the panel
 * opens in.
 */
describe('StopPanel clearing the selected stop', () => {
  const selected = { selectedStopKey: 'bus:vermont-wilshire' };

  it('offers no clear control when no stop is selected', () => {
    renderPanel();
    expect(document.querySelector('[data-qa="stop-series-clear"]')).toBeNull();
  });

  it('offers one beside the series once a stop is selected', () => {
    renderPanel(selected);
    expect(document.querySelector('[data-qa="stop-series-clear"]')).toBeTruthy();
  });

  it('calls onClearStop when it is pressed', () => {
    const onClearStop = vi.fn();
    renderPanel({ ...selected, onClearStop });

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));

    expect(onClearStop).toHaveBeenCalledTimes(1);
  });

  /** A bare <button> submits; inside any future form that would reload the page. */
  it('is a button that does not submit', () => {
    renderPanel(selected);
    expect(
      screen.getByRole('button', { name: 'Clear' }).getAttribute('type'),
    ).toBe('button');
  });
});
