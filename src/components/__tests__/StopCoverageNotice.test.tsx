import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { formatEventDate } from '../../chart';
import StopCoverageNotice from '../StopCoverageNotice';

/** Which state the notice is in is `stopCoverageState`, tested in `src/utils/`. */

/** `"2025-07"` → `"Jul 2025"`, the spelling the notice uses. */
const monthLabel = (month: string) => formatEventDate(month);

const renderNotice = (
  props: Partial<React.ComponentProps<typeof StopCoverageNotice>> = {},
) =>
  render(
    <StopCoverageNotice
      state="full"
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

  /** The button hands back the span it names, verbatim, and never clamps it. */
  it('sets the same span it offers', () => {
    const onUseCoverageWindow = vi.fn();
    renderNotice({ state: 'no-overlap', onUseCoverageWindow });

    const label = screen.getByRole('button').textContent ?? '';
    fireEvent.click(screen.getByRole('button'));

    const [from, to] = onUseCoverageWindow.mock.calls[0] as [string, string];
    expect(label).toContain(monthLabel(from));
    expect(label).toContain(monthLabel(to));
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

  /** The manifest is built from the committed payloads, so "nothing ingested" can't happen here. */
  it('states the covered span while a payload is still loading', () => {
    renderNotice({ state: 'unknown', months: [] });
    expect(
      document.querySelector('[data-qa="stop-coverage-span"]'),
    ).toBeTruthy();
    expect(
      document.querySelector('[data-qa="stop-coverage-no-data"]'),
    ).toBeNull();
    expect(document.querySelector('[data-qa="stop-coverage-empty"]')).toBeNull();
  });
});
