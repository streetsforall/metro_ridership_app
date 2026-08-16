import { describe, it, expect } from 'vitest';
import { stopCoverageState } from '../stopCoverage';
import type { StopCoverage } from '../../stops';

const coverage = (overrides: Partial<StopCoverage> = {}): StopCoverage => ({
  from: '2025-07',
  to: '2026-06',
  overlapsWindow: true,
  ...overrides,
});

/** The whole window, as the chart's own axis would report it. */
const WINDOW = ['2025-07', '2025-08', '2025-09', '2026-06'];

describe('stopCoverageState', () => {
  /**
   * An empty coverage is `buildStopView`'s loading state *and* its failed-fetch state,
   * so it cannot mean "there is no stop data" — reading it that way had the panel
   * announcing an un-ingested dataset every time the network was slow. Whether stop
   * data exists at all is a build-time fact and comes from the manifest instead.
   */
  it('says nothing about a window it has no data for yet', () => {
    expect(
      stopCoverageState({
        coverage: coverage({ from: null, to: null, overlapsWindow: false }),
        months: [],
        windowMonths: WINDOW,
      }),
    ).toBe('unknown');
  });

  /**
   * The overlap answer is `buildStopView`'s, taken as given. Deriving it here from
   * `from`/`to` against the window would be a second statement of the window rule,
   * which is the failure ADR-0009 exists to prevent.
   */
  it('reports no overlap straight from the derivation', () => {
    expect(
      stopCoverageState({
        coverage: coverage({ overlapsWindow: false }),
        months: [],
        windowMonths: WINDOW,
      }),
    ).toBe('no-overlap');
  });

  it('reports full coverage when both axes span the same months', () => {
    expect(
      stopCoverageState({
        coverage: coverage(),
        months: WINDOW,
        windowMonths: WINDOW,
      }),
    ).toBe('full');
  });

  /**
   * The line table's meaning of the word: this readout's data covers only part of the
   * selected period. It is the ordinary case — the chart spans 2009 → 2026 and stop
   * data spans twelve months inside it — so the label is what a reader meets first.
   */
  it('reports partial coverage when the stop axis ends before the chart’s does', () => {
    expect(
      stopCoverageState({
        coverage: coverage(),
        months: ['2025-07', '2025-08'],
        windowMonths: WINDOW,
      }),
    ).toBe('partial');
  });

  it('reports partial coverage when the stop axis starts after the chart’s does', () => {
    expect(
      stopCoverageState({
        coverage: coverage(),
        months: ['2025-09', '2026-06'],
        windowMonths: WINDOW,
      }),
    ).toBe('partial');
  });

  it('does not call an empty stop axis partial', () => {
    expect(
      stopCoverageState({
        coverage: coverage(),
        months: [],
        windowMonths: WINDOW,
      }),
    ).toBe('full');
  });

  it('does not call anything partial when no line is selected', () => {
    expect(
      stopCoverageState({
        coverage: coverage(),
        months: ['2025-07'],
        windowMonths: [],
      }),
    ).toBe('full');
  });
});
