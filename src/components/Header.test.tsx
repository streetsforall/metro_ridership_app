import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Header from './Header';
import {
  DockLayoutProvider,
  type DockLayoutContextValue,
} from '../dock/DockLayoutContext';
import { PANEL_IDS, PANEL_DEFS } from '../dock/DockShell';

const PANEL_TITLES = PANEL_IDS.map((id) => PANEL_DEFS[id].title);

const openPanelsMenu = (): void => {
  // Radix triggers open on pointerdown, not click.
  fireEvent.pointerDown(
    screen.getByRole('button', { name: 'Panels' }),
    // ctrlKey false + button 0 marks this as a plain left press.
    { button: 0, ctrlKey: false },
  );
};

const makeMockValue = (
  overrides?: Partial<DockLayoutContextValue>,
): DockLayoutContextValue => ({
  visibility: {
    'date-range': true,
    'line-selector': true,
    chart: true,
    summary: true,
    map: true,
  },
  togglePanel: vi.fn(),
  resetLayout: vi.fn(),
  ...overrides,
});

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('Header standalone (default no-op context)', () => {
  it('renders the app title and logo link', () => {
    render(<Header />);
    expect(screen.getByText('LA Metro Ridership App')).toBeTruthy();
    expect(screen.getByAltText('Streets for All logo')).toBeTruthy();
  });

  it('renders the Panels menu trigger', () => {
    render(<Header />);
    expect(screen.getByRole('button', { name: 'Panels' })).toBeTruthy();
  });

  it('shows one checkbox item per panel, labeled from PANEL_DEFS', () => {
    render(<Header />);
    openPanelsMenu();
    for (const title of PANEL_TITLES) {
      expect(
        screen.getByRole('menuitemcheckbox', { name: title }),
      ).toBeTruthy();
    }
    expect(screen.getAllByRole('menuitemcheckbox')).toHaveLength(
      PANEL_IDS.length,
    );
  });

  it('shows all panels checked by default', () => {
    render(<Header />);
    openPanelsMenu();
    for (const title of PANEL_TITLES) {
      const item = screen.getByRole('menuitemcheckbox', { name: title });
      expect(item.getAttribute('aria-checked')).toBe('true');
    }
  });

  it('shows a Reset layout item', () => {
    render(<Header />);
    openPanelsMenu();
    expect(
      screen.getByRole('menuitem', { name: 'Reset layout' }),
    ).toBeTruthy();
  });

  it('clicking items with the no-op default context throws no errors', () => {
    render(<Header />);
    openPanelsMenu();
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Map' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reset layout' }));
  });
});

describe('Header with a DockLayoutProvider', () => {
  it('reflects hidden panels as unchecked', () => {
    const value = makeMockValue();
    value.visibility.map = false;
    render(
      <DockLayoutProvider value={value}>
        <Header />
      </DockLayoutProvider>,
    );
    openPanelsMenu();
    expect(
      screen
        .getByRole('menuitemcheckbox', { name: 'Map' })
        .getAttribute('aria-checked'),
    ).toBe('false');
    expect(
      screen
        .getByRole('menuitemcheckbox', { name: 'Ridership' })
        .getAttribute('aria-checked'),
    ).toBe('true');
  });

  it('calls togglePanel with the panel id when a checkbox item is clicked', () => {
    const value = makeMockValue();
    render(
      <DockLayoutProvider value={value}>
        <Header />
      </DockLayoutProvider>,
    );
    openPanelsMenu();
    fireEvent.click(
      screen.getByRole('menuitemcheckbox', { name: 'Metro Lines' }),
    );
    expect(value.togglePanel).toHaveBeenCalledExactlyOnceWith('line-selector');
    expect(value.resetLayout).not.toHaveBeenCalled();
  });

  it('keeps the menu open after toggling a panel', () => {
    const value = makeMockValue();
    render(
      <DockLayoutProvider value={value}>
        <Header />
      </DockLayoutProvider>,
    );
    openPanelsMenu();
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Summary' }));
    expect(
      screen.getByRole('menuitemcheckbox', { name: 'Summary' }),
    ).toBeTruthy();
  });

  it('calls resetLayout when Reset layout is clicked', () => {
    const value = makeMockValue();
    render(
      <DockLayoutProvider value={value}>
        <Header />
      </DockLayoutProvider>,
    );
    openPanelsMenu();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reset layout' }));
    expect(value.resetLayout).toHaveBeenCalledOnce();
    expect(value.togglePanel).not.toHaveBeenCalled();
  });
});
