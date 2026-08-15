import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import colors from 'tailwindcss/colors';
import ContextLogPanel from './ContextLogPanel';
import type { EventCategory, TransitEvent } from '../@types/events.types';
import { makeTransitEvent } from '../test/builders';

const opening = makeTransitEvent({
  id: 'regional-connector',
  date: '2023-02',
  title: 'Regional Connector Opening',
  description: 'Linked four lines through a new downtown tunnel.',
  category: 'opening',
});

const closure = makeTransitEvent({
  id: 'blue-line-closure',
  date: '2019-05',
  title: 'New Blue closure',
  description: 'The south segment closed for rebuilding.',
  category: 'closure',
});

const renderPanel = (
  events: TransitEvent[] = [opening],
  props: Partial<Parameters<typeof ContextLogPanel>[0]> = {},
) =>
  render(
    <ContextLogPanel
      events={events}
      pinnedMonth={null}
      onSelectMonth={vi.fn()}
      onHoverMonthChange={vi.fn()}
      {...props}
    />,
  );

describe('ContextLogPanel rendering', () => {
  it('lists each event with its title and description', () => {
    renderPanel([opening, closure]);
    expect(screen.getByText('Regional Connector Opening')).toBeTruthy();
    expect(screen.getByText(/south segment closed/)).toBeTruthy();
  });

  it('collapses and expands when the header is clicked', () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: /context logs/i }));
    expect(screen.queryByText('Regional Connector Opening')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /context logs/i }));
    expect(screen.getByText('Regional Connector Opening')).toBeTruthy();
  });

  it('dates each row', () => {
    renderPanel();
    expect(screen.getByText('Feb 2023')).toBeTruthy();
  });
});

/**
 * The palette is shared with the chart's dots and covered exhaustively in
 * `src/chart/eventMarkers.test.ts`. What matters here is that the panel reads
 * from that same table and still spells the category out, because these hues run
 * 2.15–4.76:1 on the pane's white and must never be the sole signal.
 */
describe('ContextLogPanel category colors', () => {
  const rowBorders = (container: HTMLElement) =>
    Array.from(container.querySelectorAll('#context-log-panel li')).map(
      (row) => (row as HTMLElement).style.borderColor,
    );

  /** jsdom serializes inline colors its own way; normalize both sides the same. */
  const asBorderColor = (value: string) => {
    const el = document.createElement('div');
    el.style.borderColor = value;
    return el.style.borderColor;
  };

  it('tints each row with its category color', () => {
    const { container } = renderPanel([opening, closure]);
    expect(rowBorders(container)).toEqual([
      asBorderColor(colors.emerald['500']),
      asBorderColor(colors.red['500']),
    ]);
  });

  it('also spells the category out', () => {
    renderPanel([makeTransitEvent({ category: 'headway_change' })]);
    expect(screen.getByText('Headway change')).toBeTruthy();
  });

  /**
   * The chip is the one place the palette carries text, so it uses 100/800
   * rather than the marker's 500 — every pair clears AA, where the 500 behind
   * text would not.
   */
  it('fills the chip with the category 100 and sets 800 text on it', () => {
    renderPanel([makeTransitEvent({ category: 'opening' })]);
    const chip = screen.getByText('Opening');
    const expected = document.createElement('div');
    expected.style.backgroundColor = colors.emerald['100'];
    expected.style.color = colors.emerald['800'];
    expect(chip.style.backgroundColor).toBe(expected.style.backgroundColor);
    expect(chip.style.color).toBe(expected.style.color);
  });

  it('gives no two categories the same chip fill', () => {
    const categories: EventCategory[] = [
      'opening',
      'extension',
      'closure',
      'route_change',
      'headway_change',
      'hours_change',
      'fare_change',
      'disruption',
      'service_change',
    ];
    const { container } = renderPanel(
      categories.map((category, i) =>
        makeTransitEvent({ id: `e${i}`, category }),
      ),
    );
    const fills = Array.from(
      container.querySelectorAll('#context-log-panel li span[style]'),
    )
      .map((el) => (el as HTMLElement).style.backgroundColor)
      .filter(Boolean);
    expect(new Set(fills).size).toBe(categories.length);
  });

  /**
   * The rail is the date alone precisely so a window's mix of categories cannot
   * move it. A chip in there makes every row's columns depend on the longest
   * category label present.
   */
  it('keeps the chip out of the date rail', () => {
    const { container } = renderPanel([
      makeTransitEvent({ category: 'headway_change' }),
    ]);
    const rail = container.querySelector('#context-log-panel li button > span');
    expect(rail?.textContent).toBe('Jan 2022');
  });

  it('falls back to slate for an unknown category', () => {
    const { container } = renderPanel([
      makeTransitEvent({ category: 'not_a_real_category' as EventCategory }),
    ]);
    expect(rowBorders(container)).toEqual([asBorderColor(colors.slate['500'])]);
  });

  it('falls back to slate when an event carries no category at all', () => {
    const untyped = makeTransitEvent();
    delete (untyped as Partial<TransitEvent>).category;
    const { container } = renderPanel([untyped]);
    // Same hue as an explicit service_change — both mean "something changed,
    // nobody said what", and the label agrees with the color.
    expect(rowBorders(container)).toEqual([asBorderColor(colors.slate['500'])]);
    expect(screen.getByText('Service change')).toBeTruthy();
  });
});

describe('ContextLogPanel → chart', () => {
  it('reports the hovered row month, so its dot can grow', () => {
    const onHoverMonthChange = vi.fn();
    renderPanel([opening], { onHoverMonthChange });
    fireEvent.mouseEnter(screen.getByRole('button', { name: /Regional Connector/ }));
    expect(onHoverMonthChange).toHaveBeenCalledWith('2023 2');
  });

  it('clears the hover on mouse leave', () => {
    const onHoverMonthChange = vi.fn();
    renderPanel([opening], { onHoverMonthChange });
    fireEvent.mouseLeave(screen.getByRole('button', { name: /Regional Connector/ }));
    expect(onHoverMonthChange).toHaveBeenCalledWith(null);
  });

  /** Keyboard users get the same link, which a plain `<li>` could not offer. */
  it('reports the month on focus as well as on hover', () => {
    const onHoverMonthChange = vi.fn();
    renderPanel([opening], { onHoverMonthChange });
    fireEvent.focus(screen.getByRole('button', { name: /Regional Connector/ }));
    expect(onHoverMonthChange).toHaveBeenCalledWith('2023 2');
  });

  it('pins the row month when the row is clicked', () => {
    const onSelectMonth = vi.fn();
    renderPanel([opening], { onSelectMonth });
    fireEvent.click(screen.getByRole('button', { name: /Regional Connector/ }));
    expect(onSelectMonth).toHaveBeenCalledWith('2023 2');
  });
});

describe('chart → ContextLogPanel', () => {
  it('marks the pinned month row as pressed', () => {
    renderPanel([opening, closure], { pinnedMonth: '2023 2' });
    expect(
      screen.getByRole('button', { name: /Regional Connector/ }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(
      screen.getByRole('button', { name: /New Blue/ }).getAttribute('aria-pressed'),
    ).toBe('false');
  });

  it('rings the pinned row', () => {
    renderPanel([opening], { pinnedMonth: '2023 2' });
    expect(
      screen.getByRole('button', { name: /Regional Connector/ }).className,
    ).toContain('ring-2');
  });

  it('scrolls the pinned row into view', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    renderPanel([opening, closure], { pinnedMonth: '2019 5' });
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });

  /**
   * Highlighting a row inside a collapsed panel highlights nothing, so a pin
   * from the chart reopens it.
   */
  it('reopens a collapsed panel when a month is pinned', () => {
    const { rerender } = renderPanel([opening], { pinnedMonth: null });
    fireEvent.click(screen.getByRole('button', { name: /context logs/i }));
    expect(screen.queryByText('Regional Connector Opening')).toBeNull();

    rerender(
      <ContextLogPanel
        events={[opening]}
        pinnedMonth="2023 2"
        onSelectMonth={vi.fn()}
        onHoverMonthChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Regional Connector Opening')).toBeTruthy();
  });

  it('leaves the panel alone when the pinned month has no entry', () => {
    renderPanel([opening], { pinnedMonth: '2021 9' });
    expect(
      screen.getByRole('button', { name: /Regional Connector/ }).getAttribute('aria-pressed'),
    ).toBe('false');
  });
});
