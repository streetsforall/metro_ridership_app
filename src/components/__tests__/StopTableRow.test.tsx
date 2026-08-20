import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import StopTable from '../StopTable';
import { makeLineReadout, makeStopPlace } from '../../test/builders';
import type { StopReadout } from '../../stops';
import type { StopSeriesIndex, StopSeriesPoint } from '../../utils/stopSeries';

/** What one row costs, in renders, when a *different* row scrolls into view. */

const { rowSpy, chartSpy } = vi.hoisted(() => ({
  rowSpy: vi.fn<(label: string | undefined) => void>(),
  chartSpy: vi.fn<() => void>(),
}));

/** Two counters: the checkbox stands in for the row body, the chart for the sparkline. */
vi.mock('@radix-ui/react-checkbox', () => ({
  Root: ({
    children,
    'aria-label': label,
  }: {
    children?: React.ReactNode;
    'aria-label'?: string;
  }) => {
    rowSpy(label);
    return (
      <button type="button" role="checkbox">
        {children}
      </button>
    );
  },
  Indicator: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

vi.mock('react-chartjs-2', () => ({
  Line: () => {
    chartSpy();
    return <canvas data-testid="sparkline" />;
  },
}));

const points: StopSeriesPoint[] = [
  { month: '2025-07', boardings: 100, alightings: 90 },
  { month: '2025-08', boardings: 120, alightings: 110 },
];

/** Stable like the real index, or the measurement would be of the stub's churn. */
const stubIndex: StopSeriesIndex = { seriesFor: () => points };

const lines = [makeLineReadout({ id: 204, name: 'Line 204', mode: 'Bus' })];

const readouts: StopReadout[] = Array.from({ length: 20 }, (_, index) => ({
  ...makeStopPlace(),
  key: `bus:stop-${String(index)}`,
  name: `Stop ${String(index)}`,
  line_name: 204,
  measuredAverage: 1000 - index,
  shareOfLine: 0.1,
  averageBoardings: 1000 - index,
  averageAlightings: 900,
  netAverage: 100,
  monthsReported: 12,
}));

/** Which rows rendered since the counter was last cleared, named by their checkbox. */
const renderedRows = (): (string | undefined)[] =>
  rowSpy.mock.calls.map(([label]) => label);

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

const scrollTo = (index: number): void => {
  const cell = document.querySelector(
    `[data-qa="stop-sparkline-204-bus:stop-${String(index)}"]`,
  );
  act(() => {
    notify(
      [{ target: cell, isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );
  });
};

/** One stable callback, as the fixed `useUserDashboardInput` now hands the table. */
const onToggleStop = vi.fn();

const renderTable = () =>
  render(
    <StopTable
      readouts={readouts}
      lines={lines}
      selectedStopKeys={[]}
      onToggleStop={onToggleStop}
      seriesIndex={stubIndex}
      measure="ons"
    />,
  );

beforeEach(() => {
  vi.unstubAllGlobals();
  rowSpy.mockClear();
  chartSpy.mockClear();
});

describe('StopTable row rendering', () => {
  it('re-renders only the row that scrolled into view', () => {
    withObserver();
    renderTable();
    scrollTo(0);

    rowSpy.mockClear();
    scrollTo(1);

    expect(renderedRows()).toEqual(['Stop 1 · Line 204']);
  });

  /** The expensive half: a mounted sparkline is a whole Chart.js instance. */
  it('leaves an already-mounted sparkline alone when another row arrives', () => {
    withObserver();
    renderTable();
    scrollTo(0);

    chartSpy.mockClear();
    scrollTo(1);

    expect(chartSpy).toHaveBeenCalledTimes(1);
  });

  /** A batch that adds nothing new must not reach a single row. */
  it('re-renders no row at all when the batch adds nothing new', () => {
    withObserver();
    renderTable();
    scrollTo(0);

    rowSpy.mockClear();
    scrollTo(0);

    expect(rowSpy).not.toHaveBeenCalled();
  });

  /** The selection is what a click changes, so only the clicked row may repaint. */
  it('re-renders only the rows whose selected state changed', () => {
    withObserver();
    const { rerender } = renderTable();
    scrollTo(0);

    rowSpy.mockClear();
    rerender(
      <StopTable
        readouts={readouts}
        lines={lines}
        selectedStopKeys={['bus:stop-3']}
        onToggleStop={onToggleStop}
        seriesIndex={stubIndex}
        measure="ons"
      />,
    );

    expect(renderedRows()).toEqual(['Stop 3 · Line 204']);
  });
});
