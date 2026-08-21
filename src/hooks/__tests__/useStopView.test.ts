import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import useStopView from '../useStopView';
import { daysOfWeek } from '../../@types/metrics.types';
import type { ColumnarStopRidership } from '../../@types/stops.types';

/** Every test here is a rule about *not* fetching the 5.3 MB bus payload. */

const cols = [
  'year',
  'month',
  'line',
  'stop',
  'wd_ons',
  'wd_offs',
  'sa_ons',
  'sa_offs',
  'su_ons',
  'su_offs',
];

const railPayload: ColumnarStopRidership = {
  schema: 1,
  cols,
  stops: [{ key: 'rail:union-station', name: 'Union Station' }],
  rows: [[2025, 7, 801, 0, 100, 90, 60, 55, 40, 35]],
};

const busPayload: ColumnarStopRidership = {
  schema: 1,
  cols,
  stops: [{ key: 'bus:vermont-wilshire', name: 'Vermont / Wilshire' }],
  rows: [[2025, 7, 204, 0, 500, 450, 300, 280, 200, 180]],
};

const requested: string[] = [];

const fetchMock = vi.fn((url: string) => {
  requested.push(url);
  const body = url.includes('rail') ? railPayload : busPayload;
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(body),
  } as Response);
});

/** The window the fixture months sit inside. */
const inWindow = { startDate: new Date(2025, 6), endDate: new Date(2026, 5) };
/** A window years away from any stop data. */
const outOfWindow = { startDate: new Date(2015, 0), endDate: new Date(2015, 11) };

const baseInput = {
  dayOfWeek: daysOfWeek.Weekday,
  measure: 'ons' as const,
  ...inWindow,
};

beforeEach(() => {
  requested.length = 0;
  fetchMock.mockClear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useStopView', () => {
  it('fetches nothing while the panel is off', async () => {
    renderHook(() =>
      useStopView({ ...baseInput, enabled: false, lineIds: [204] }),
    );
    await Promise.resolve();
    expect(requested).toEqual([]);
  });

  it('yields the empty view before anything has loaded', () => {
    const { result } = renderHook(() =>
      useStopView({ ...baseInput, enabled: false, lineIds: [204] }),
    );
    expect(result.current.view.readouts).toEqual([]);
    expect(result.current.records).toBeNull();
  });

  it('fetches rail as soon as the panel is on', async () => {
    renderHook(() => useStopView({ ...baseInput, enabled: true, lineIds: [] }));
    await waitFor(() =>
      expect(requested).toContain('/stop-ridership.rail.json'),
    );
  });

  it('leaves the bus payload alone when only rail lines are selected', async () => {
    const { result } = renderHook(() =>
      useStopView({ ...baseInput, enabled: true, lineIds: [801] }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(requested).not.toContain('/stop-ridership.bus.json');
  });

  it('fetches bus once a line the rail payload does not serve is selected', async () => {
    const { result } = renderHook(() =>
      useStopView({ ...baseInput, enabled: true, lineIds: [204] }),
    );
    await waitFor(() =>
      expect(requested).toContain('/stop-ridership.bus.json'),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
  });

  /** The hook reads `buildStopView`'s window answer before spending 5.3 MB (ADR-0009). */
  it('does not fetch bus for a window with no stop data in it', async () => {
    const { result } = renderHook(() =>
      useStopView({
        ...baseInput,
        ...outOfWindow,
        enabled: true,
        lineIds: [204],
      }),
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(requested).not.toContain('/stop-ridership.bus.json');
    expect(result.current.view.coverage.overlapsWindow).toBe(false);
  });

  it('still reports what the payload covers for a window it does not reach', async () => {
    const { result } = renderHook(() =>
      useStopView({
        ...baseInput,
        ...outOfWindow,
        enabled: true,
        lineIds: [204],
      }),
    );
    await waitFor(() => expect(result.current.view.coverage.from).toBe('2025-07'));
  });

  it('fetches each payload once, however often the inputs change', async () => {
    const { result, rerender } = renderHook(
      (lineIds: number[]) =>
        useStopView({ ...baseInput, enabled: true, lineIds }),
      { initialProps: [204] },
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    rerender([204, 801]);
    rerender([801]);
    rerender([204]);
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(
      requested.filter((url) => url === '/stop-ridership.bus.json'),
    ).toHaveLength(1);
    expect(
      requested.filter((url) => url === '/stop-ridership.rail.json'),
    ).toHaveLength(1);
  });

  it('keeps what it loaded when the panel is switched off and on again', async () => {
    const { result, rerender } = renderHook(
      (enabled: boolean) =>
        useStopView({ ...baseInput, enabled, lineIds: [801] }),
      { initialProps: true },
    );
    await waitFor(() => expect(result.current.records).not.toBeNull());

    rerender(false);
    rerender(true);

    expect(
      requested.filter((url) => url === '/stop-ridership.rail.json'),
    ).toHaveLength(1);
    // The view draws the stop again, rather than merely holding it in cache.
    expect(result.current.view.readouts).toHaveLength(1);
  });

  /** The cache is not the view: closing the panel has to clear the map's circles too. */
  it('yields the empty view while the panel is off, however much is cached', async () => {
    const { result, rerender } = renderHook(
      (enabled: boolean) =>
        useStopView({ ...baseInput, enabled, lineIds: [801] }),
      { initialProps: true },
    );
    await waitFor(() => expect(result.current.view.readouts).toHaveLength(1));
    expect(result.current.view.markers.features.length).toBeGreaterThan(0);

    rerender(false);

    expect(result.current.view.readouts).toHaveLength(0);
    expect(result.current.view.markers.features).toHaveLength(0);
    // The payload itself is kept — that is what makes reopening free.
    expect(result.current.records).not.toBeNull();
  });

  it('derives readouts for a selected line once its payload lands', async () => {
    const { result } = renderHook(() =>
      useStopView({ ...baseInput, enabled: true, lineIds: [801] }),
    );
    await waitFor(() => expect(result.current.view.readouts).toHaveLength(1));
    expect(result.current.view.readouts[0].key).toBe('rail:union-station');
    expect(result.current.view.readouts[0].averageBoardings).toBe(100);
  });

  it('surfaces a failed fetch rather than looking like an empty period', async () => {
    fetchMock.mockImplementationOnce(() =>
      Promise.reject(new Error('offline')),
    );
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { result } = renderHook(() =>
      useStopView({ ...baseInput, enabled: true, lineIds: [801] }),
    );

    await waitFor(() => expect(result.current.hasFailed).toBe(true));
    expect(result.current.isLoading).toBe(false);
    consoleError.mockRestore();
  });
});
