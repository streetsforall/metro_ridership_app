import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useUserDashboardInput, { daysOfWeek } from './useUserDashboardInput';
import { dataDefaultEndDate } from '../utils/dataDateRange';
import { formatMonthParam } from '../utils/queryParams';
import type { ConsolidatedRidership } from '../@types/metrics.types';

// Reset URL and replaceState spy before each test
beforeEach(() => {
  window.history.replaceState({}, '', '/');
  vi.restoreAllMocks();
});

describe('default state (no URL params)', () => {
  it('uses default start date', () => {
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.startDate).toEqual(new Date(2020, 6));
  });

  it('uses default end date derived from the latest data', () => {
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.endDate).toEqual(dataDefaultEndDate);
  });

  it('uses weekday as default day of week', () => {
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.dayOfWeek).toBe(daysOfWeek.Weekday);
  });

  it('uses empty string as default search text', () => {
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.searchText).toBe('');
  });

  it('enables both modes by default', () => {
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.modes).toEqual(['bus', 'train']);
  });

  it('has no lines selected by default', () => {
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.lines.every((l) => !l.selected)).toBe(true);
  });
});

describe('initial state from URL params', () => {
  it('reads start date from URL', () => {
    window.history.replaceState({}, '', '?start=2022-03');
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.startDate).toEqual(new Date(2022, 2));
  });

  it('reads end date from URL', () => {
    window.history.replaceState({}, '', '?end=2024-11');
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.endDate).toEqual(new Date(2024, 10));
  });

  it('reads saturday day-of-week from URL', () => {
    window.history.replaceState({}, '', '?day=sat');
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.dayOfWeek).toBe(daysOfWeek.Saturday);
  });

  it('reads sunday day-of-week from URL', () => {
    window.history.replaceState({}, '', '?day=sun');
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.dayOfWeek).toBe(daysOfWeek.Sunday);
  });

  it('reads search text from URL', () => {
    window.history.replaceState({}, '', '?q=blue');
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.searchText).toBe('blue');
  });

  it('disables bus mode when buses=0', () => {
    window.history.replaceState({}, '', '?buses=0');
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.modes).toEqual(['train']);
  });

  it('disables train mode when trains=0', () => {
    window.history.replaceState({}, '', '?trains=0');
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.modes).toEqual(['bus']);
  });

  it('falls back to default start date for an invalid start param', () => {
    window.history.replaceState({}, '', '?start=invalid');
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.startDate).toEqual(new Date(2020, 6));
  });

  it('falls back to weekday for an unknown day param', () => {
    window.history.replaceState({}, '', '?day=xyz');
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.dayOfWeek).toBe(daysOfWeek.Weekday);
  });

  it('sets isAggregateVisible to true when aggregate=1 in URL', () => {
    window.history.replaceState({}, '', '?aggregate=1');
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.isAggregateVisible).toBe(true);
  });

  it('sets isAggregateVisible to false when aggregate param is absent', () => {
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.isAggregateVisible).toBe(false);
  });

  it('sets isAggregateVisible to false when aggregate param is not 1', () => {
    window.history.replaceState({}, '', '?aggregate=0');
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.isAggregateVisible).toBe(false);
  });
});

describe('modes → line visibility', () => {
  it('hides bus lines when buses=0 is in URL', () => {
    window.history.replaceState({}, '', '?buses=0');
    const { result } = renderHook(() => useUserDashboardInput());
    const busLines = result.current.lines.filter((l) => l.mode === 'Bus');
    expect(busLines.length).toBeGreaterThan(0);
    expect(busLines.every((l) => !l.visible)).toBe(true);
  });

  it('keeps rail lines visible when only buses=0', () => {
    window.history.replaceState({}, '', '?buses=0');
    const { result } = renderHook(() => useUserDashboardInput());
    const railLines = result.current.lines.filter((l) => l.mode === 'Rail');
    expect(railLines.every((l) => l.visible)).toBe(true);
  });

  it('hides rail lines when trains=0 is in URL', () => {
    window.history.replaceState({}, '', '?trains=0');
    const { result } = renderHook(() => useUserDashboardInput());
    const railLines = result.current.lines.filter((l) => l.mode === 'Rail');
    expect(railLines.length).toBeGreaterThan(0);
    expect(railLines.every((l) => !l.visible)).toBe(true);
  });

  it('updates visibility when modes state changes', () => {
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.setModes(['train']);
    });

    const busLines = result.current.lines.filter((l) => l.mode === 'Bus');
    expect(busLines.every((l) => !l.visible)).toBe(true);

    const railLines = result.current.lines.filter((l) => l.mode === 'Rail');
    expect(railLines.every((l) => l.visible)).toBe(true);
  });
});

describe('URL sync', () => {
  it('writes default params to URL on mount', () => {
    renderHook(() => useUserDashboardInput());
    expect(window.location.search).toContain('start=2020-07');
    expect(window.location.search).toContain(
      `end=${formatMonthParam(dataDefaultEndDate)}`,
    );
    expect(window.location.search).toContain('day=wkday');
  });

  it('updates URL when start date changes', () => {
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.setStartDate(new Date(2021, 0));
    });

    expect(window.location.search).toContain('start=2021-01');
  });

  it('updates URL when end date changes', () => {
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.setEndDate(new Date(2024, 5));
    });

    expect(window.location.search).toContain('end=2024-06');
  });

  it('updates URL when day of week changes to saturday', () => {
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.setDayOfWeek(daysOfWeek.Saturday);
    });

    expect(window.location.search).toContain('day=sat');
  });

  it('adds q param when search text is set', () => {
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.setSearchText('silver');
    });

    expect(window.location.search).toContain('q=silver');
  });

  it('omits q param when search text is empty', () => {
    renderHook(() => useUserDashboardInput());
    expect(window.location.search).not.toContain('q=');
  });

  it('adds buses=0 param when bus mode is disabled', () => {
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.setModes(['train']);
    });

    expect(window.location.search).toContain('buses=0');
    expect(window.location.search).not.toContain('trains=0');
  });

  it('adds trains=0 param when train mode is disabled', () => {
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.setModes(['bus']);
    });

    expect(window.location.search).toContain('trains=0');
    expect(window.location.search).not.toContain('buses=0');
  });

  it('omits buses/trains params when both modes are enabled', () => {
    renderHook(() => useUserDashboardInput());
    expect(window.location.search).not.toContain('buses=');
    expect(window.location.search).not.toContain('trains=');
  });

  it('adds aggregate=1 to URL when toggleIsAggregateVisible is called', () => {
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.toggleIsAggregateVisible();
    });

    expect(window.location.search).toContain('aggregate=1');
  });

  it('removes aggregate param from URL when toggled off', () => {
    window.history.replaceState({}, '', '?aggregate=1');
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.toggleIsAggregateVisible();
    });

    expect(window.location.search).not.toContain('aggregate=');
  });

  it('omits aggregate param when isAggregateVisible is false by default', () => {
    renderHook(() => useUserDashboardInput());
    expect(window.location.search).not.toContain('aggregate=');
  });
});

describe('line initialisation', () => {
  it('stamps distanceMiles onto lines that have GeoJSON data', () => {
    const { result } = renderHook(() => useUserDashboardInput());
    const aLine = result.current.lines.find((l) => l.id === 801);
    expect(aLine?.distanceMiles).toBeGreaterThan(0);
  });
});

describe('updateLinesWithLineMetrics', () => {
  const makeRidership = (lineId: number, wkday: number): ConsolidatedRidership => ({
    [lineId]: {
      selected: true,
      ridershipRecords: [
        {
          year: 2022,
          month: 1,
          line_name: lineId,
          est_wkday_ridership: wkday,
          est_sat_ridership: null,
          est_sun_ridership: null,
        },
      ],
    },
  });

  it('sets ridersPerMile on a line that has distanceMiles', () => {
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.updateLinesWithLineMetrics(makeRidership(801, 10000));
    });

    const aLine = result.current.lines.find((l) => l.id === 801);
    expect(aLine?.ridersPerMile).toBeGreaterThan(0);
  });

  it('computes ridersPerMile as averageRidership divided by distanceMiles', () => {
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.updateLinesWithLineMetrics(makeRidership(801, 10000));
    });

    const aLine = result.current.lines.find((l) => l.id === 801);
    expect(aLine?.ridersPerMile).toBeCloseTo(
      10000 / (aLine?.distanceMiles ?? 1),
      5,
    );
  });

  it('leaves ridersPerMile undefined when no ridership record exists for the line', () => {
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.updateLinesWithLineMetrics({});
    });

    const aLine = result.current.lines.find((l) => l.id === 801);
    expect(aLine?.ridersPerMile).toBeUndefined();
  });
});
