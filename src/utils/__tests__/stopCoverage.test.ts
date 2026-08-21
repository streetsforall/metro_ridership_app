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
  /** An empty coverage is the loading state, not "there is no stop data". */
  it('says nothing about a window it has no data for yet', () => {
    expect(
      stopCoverageState({
        coverage: coverage({ from: null, to: null, overlapsWindow: false }),
        months: [],
        windowMonths: WINDOW,
      }),
    ).toBe('unknown');
  });

  /** The overlap answer is `buildStopView`'s, taken as given (ADR-0009). */
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

  /** Partial means what it means in the line table: only part of the selected period. */
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
