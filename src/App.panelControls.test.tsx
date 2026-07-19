import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import App from './App';
import { useDockLayout } from './dock/DockLayoutContext';
import type { DockLayoutContextValue } from './dock/DockLayoutContext';
import { PANEL_IDS } from './dock/DockShell';

/**
 * Regression coverage for the header's panel controls being wired to the real
 * dock.
 *
 * `DockLayoutContext` has a deliberately safe no-op default so the header can
 * render standalone. The cost is that a header rendered *outside*
 * `DockLayoutProvider` still renders perfectly — it just silently loses every
 * toggle and the reset action. That is exactly what shipped, and neither
 * `Header.test.tsx` (which mocks the context) nor `App.test.tsx` (which mocks
 * the header away entirely) could catch it.
 *
 * These tests render the real App with the real DockShell and assert the
 * controls actually move panels in and out of the dock.
 */

vi.mock('./data/ridership.json', () => ({
  default: [
    {
      year: 2022,
      month: 1,
      line_name: 807,
      est_wkday_ridership: 5000,
      est_sat_ridership: 3000,
      est_sun_ridership: 2000,
    },
  ],
}));

/* Panel bodies are irrelevant here and drag in canvas/WebGL; the dock itself
   stays real. */
vi.mock('./dock/panels/ChartPanel', () => ({ default: () => <div /> }));
vi.mock('./dock/panels/MapPanel', () => ({ default: () => <div /> }));
vi.mock('./dock/panels/DateRangePanel', () => ({ default: () => <div /> }));
vi.mock('./dock/panels/LineSelectorPanel', () => ({ default: () => <div /> }));
vi.mock('./dock/panels/SummaryPanel', () => ({ default: () => <div /> }));
vi.mock('./components/Footer', () => ({ default: () => <div /> }));

/* Stands in for Header at Header's position in the tree, and captures the
   context it receives there — so this asserts the wiring, not the markup. */
let captured: DockLayoutContextValue | null = null;
vi.mock('./components/Header', () => {
  const HeaderProbe = () => {
    captured = useDockLayout();
    return <div data-testid="header-probe" />;
  };
  return { default: HeaderProbe };
});

beforeEach(() => {
  captured = null;
  localStorage.clear();
  window.history.replaceState({}, '', '/');
});

const renderApp = async (): Promise<DockLayoutContextValue> => {
  render(<App />);
  await waitFor(() => {
    expect(captured).not.toBeNull();
  });
  return captured!;
};

describe('header panel controls', () => {
  it('reaches the header with all panels visible', async () => {
    await renderApp();
    for (const id of PANEL_IDS) {
      expect(captured!.visibility[id]).toBe(true);
    }
  });

  it('togglePanel actually removes the panel from the dock', async () => {
    await renderApp();

    act(() => {
      captured!.togglePanel('map');
    });

    /* With Header outside the provider this stayed true: the no-op default
       reports every panel visible no matter what the dock contains. */
    await waitFor(() => {
      expect(captured!.visibility.map).toBe(false);
    });
    expect(captured!.visibility.chart).toBe(true);
  });

  it('togglePanel adds a removed panel back', async () => {
    await renderApp();

    act(() => {
      captured!.togglePanel('map');
    });
    await waitFor(() => {
      expect(captured!.visibility.map).toBe(false);
    });

    act(() => {
      captured!.togglePanel('map');
    });
    await waitFor(() => {
      expect(captured!.visibility.map).toBe(true);
    });
  });

  it('resetLayout restores every panel after several are removed', async () => {
    await renderApp();

    act(() => {
      captured!.togglePanel('map');
      captured!.togglePanel('summary');
    });
    await waitFor(() => {
      expect(captured!.visibility.map).toBe(false);
      expect(captured!.visibility.summary).toBe(false);
    });

    act(() => {
      captured!.resetLayout();
    });

    await waitFor(() => {
      for (const id of PANEL_IDS) {
        expect(captured!.visibility[id]).toBe(true);
      }
    });
  });
});

