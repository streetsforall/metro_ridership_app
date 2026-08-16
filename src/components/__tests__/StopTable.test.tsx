import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import StopTable from '../StopTable';
import { makeLineReadout, makeStopPlace } from '../../test/builders';
import type { StopReadout } from '../../stops';

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
      {...props}
    />,
  );

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

  it('lists every readout — nothing is silently truncated', () => {
    const many = Array.from({ length: 200 }, (_, index) =>
      makeStopReadout({ key: `bus:stop-${index}`, name: `Stop ${index}` }),
    );
    renderTable({ readouts: many });
    expect(screen.getAllByRole('row')).toHaveLength(201);
  });
});
