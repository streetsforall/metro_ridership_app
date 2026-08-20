import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import StopTable from '../StopTable';
import { makeLineReadout, makeStopPlace } from '../../test/builders';
import type { StopReadout } from '../../stops';

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
      {...props}
    />,
  );

/**
 * The stop names in the order the table currently lists them.
 *
 * Cell `1`, not `0`: the selection checkbox is the first column now.
 */
const rowNames = (): string[] =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell')[1].textContent ?? '');

/**
 * A row's selection checkbox, by stop key and the line the row is measured on.
 *
 * The line belongs in the selector because a stop key alone does not identify a row: one
 * interchange stop on two selected lines is two rows. Every readout here is on 204, so
 * that is the default.
 */
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

  /**
   * One tab stop per row, not two. The checkbox is the keyboard route — as it is in the
   * line table — so a focusable row as well would put ~1600 stops in an 800-row table and
   * announce every row twice, the second announcement being the only informative one.
   */
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
    // Space is the key the browser turns into a click; `fireEvent` does not synthesise
    // that click, so both halves are dispatched here.
    const checkbox = rowCheckbox('bus:vermont-wilshire');
    fireEvent.keyDown(checkbox, { key: ' ', code: 'Space' });
    fireEvent.click(checkbox);
    expect(onToggleStop).toHaveBeenCalledWith('bus:vermont-wilshire');
  });

  /**
   * The row asks to be toggled and says nothing about whether that adds or removes. The
   * selection is the hook's to know, so there is one membership rule rather than a copy
   * here that could disagree with it.
   */
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

  /**
   * One interchange stop on two selected lines is two rows, and each row's `data-qa` has
   * to name only itself. Suffixing the three attributes with the stop key alone gave both
   * rows the same names, which no fixture happened to produce: a Playwright locator would
   * then match two elements and fail strict mode, and a `querySelector` here would
   * silently take the first and assert about a row nobody meant.
   */
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

/**
 * The selection column.
 *
 * `aria-current` is gone: it means "the current item in a set", which is not what several
 * selected rows are. The checkbox's own checked state is what says a row is selected now,
 * and it says it where a reader looks for that answer.
 */
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

  /**
   * The checkbox sits inside a row that is itself a toggle, so without `stopPropagation`
   * one click would toggle twice and land back where it started.
   */
  it('fires one toggle per checkbox click, not two', () => {
    const onToggleStop = vi.fn();
    renderTable({ onToggleStop });

    fireEvent.click(rowCheckbox('bus:vermont-wilshire'));

    expect(onToggleStop).toHaveBeenCalledTimes(1);
  });

  /**
   * **Space, not Enter.** Radix cancels Enter on a checkbox, so no click follows it.
   * Space is the key the browser turns into a click, and `fireEvent` does not synthesise
   * that click, so both halves are dispatched here — which is what the browser does.
   */
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
