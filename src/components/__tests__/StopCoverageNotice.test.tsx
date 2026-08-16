import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import StopCoverageNotice from '../StopCoverageNotice';
import type { StopCoverage } from '../../stops';

/** Which state the notice is in is `stopCoverageState`, tested in `src/utils/`. */

const coverage = (overrides: Partial<StopCoverage> = {}): StopCoverage => ({
  from: '2025-07',
  to: '2026-06',
  overlapsWindow: true,
  ...overrides,
});

const renderNotice = (
  props: Partial<React.ComponentProps<typeof StopCoverageNotice>> = {},
) =>
  render(
    <StopCoverageNotice
      state="full"
      coverage={coverage()}
      months={['2025-07', '2026-06']}
      onUseCoverageWindow={vi.fn()}
      {...props}
    />,
  );

describe('StopCoverageNotice', () => {
  it('states both spans even when everything is covered', () => {
    renderNotice();
    const span = document.querySelector('[data-qa="stop-coverage-span"]');
    expect(span?.textContent).toContain('Stop-level data covers');
    expect(span?.textContent).toContain('The chart above covers');
  });

  it('offers the covered span as a window when nothing overlaps', () => {
    renderNotice({ state: 'no-overlap' });
    expect(
      document.querySelector('[data-qa="stop-coverage-empty"]'),
    ).toBeTruthy();
  });

  /**
   * The button sets the window; it never clamps one. Handing the endpoints back
   * verbatim is what lets the caller route them through the same setters a drag
   * across the chart uses, so the URL, the pickers and the chart all follow.
   */
  it('hands the coverage endpoints back untouched', () => {
    const onUseCoverageWindow = vi.fn();
    renderNotice({ state: 'no-overlap', onUseCoverageWindow });
    fireEvent.click(screen.getByRole('button'));
    expect(onUseCoverageWindow).toHaveBeenCalledWith('2025-07', '2026-06');
  });

  it('labels partial coverage with the span actually on screen', () => {
    renderNotice({ state: 'partial', months: ['2025-09', '2025-12'] });
    const label = document.querySelector('[data-qa="stop-coverage-partial"]');
    expect(label?.textContent).toBe('Sep 2025 → Dec 2025');
  });

  it('carries the line table’s partial-coverage wording in its title', () => {
    renderNotice({ state: 'partial', months: ['2025-09', '2025-12'] });
    const label = document.querySelector('[data-qa="stop-coverage-partial"]');
    expect(label?.getAttribute('title')).toContain('Partial coverage:');
  });

  it('renders neither the empty state nor the label when coverage is full', () => {
    renderNotice();
    expect(document.querySelector('[data-qa="stop-coverage-empty"]')).toBeNull();
    expect(
      document.querySelector('[data-qa="stop-coverage-partial"]'),
    ).toBeNull();
  });

  it('says so when no stop data has been ingested', () => {
    renderNotice({ state: 'no-data' });
    expect(
      document.querySelector('[data-qa="stop-coverage-no-data"]'),
    ).toBeTruthy();
  });
});
