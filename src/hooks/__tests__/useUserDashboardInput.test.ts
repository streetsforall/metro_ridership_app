import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useUserDashboardInput, { daysOfWeek } from '../useUserDashboardInput';
import { dataDefaultEndDate } from '../../utils/dataDateRange';
import { formatMonthParam } from '../../utils/queryParams';

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

  it('sets showContextLogs to true when logs=1 in URL', () => {
    window.history.replaceState({}, '', '?logs=1');
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.showContextLogs).toBe(true);
  });

  it('sets showContextLogs to false when logs param is absent', () => {
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.showContextLogs).toBe(false);
  });

  it('sets showContextLogs to false when logs param is not 1', () => {
    window.history.replaceState({}, '', '?logs=0');
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.showContextLogs).toBe(false);
  });
});

describe('modes → mode filter state', () => {
  /**
   * These asserted on `Line.visible` until the write-back went. The mode clause now
   * lives in `listedReadouts`, which is tested in `src/utils/lines.test.ts`; what is
   * left here is the hook's own half — the URL contract onto `modes`.
   */
  it('switches bus off when buses=0 is in URL', () => {
    window.history.replaceState({}, '', '?buses=0');
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.modes).not.toContain('bus');
  });

  it('leaves train on when only buses=0', () => {
    window.history.replaceState({}, '', '?buses=0');
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.modes).toContain('train');
  });

  it('switches train off when trains=0 is in URL', () => {
    window.history.replaceState({}, '', '?trains=0');
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.modes).not.toContain('train');
  });

  it('updates the mode filter when modes state changes', () => {
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.setModes(['train']);
    });

    expect(result.current.modes).not.toContain('bus');
    expect(result.current.modes).toContain('train');
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

  it('adds logs=1 to URL when toggleShowContextLogs is called', () => {
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.toggleShowContextLogs();
    });

    expect(window.location.search).toContain('logs=1');
  });

  it('removes logs param from URL when toggled off', () => {
    window.history.replaceState({}, '', '?logs=1');
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.toggleShowContextLogs();
    });

    expect(window.location.search).not.toContain('logs=');
  });

  it('omits logs param when showContextLogs is false by default', () => {
    renderHook(() => useUserDashboardInput());
    expect(window.location.search).not.toContain('logs=');
  });
});

describe('line initialisation', () => {
  it('stamps distanceMiles onto lines that have GeoJSON data', () => {
    const { result } = renderHook(() => useUserDashboardInput());
    const aLine = result.current.lines.find((l) => l.id === 801);
    expect(aLine?.distanceMiles).toBeGreaterThan(0);
  });
});

describe('selectAllListedLines', () => {
  it('selects a listed line', () => {
    // Was `selectAllVisibleLines selects a zero-change line too`: the hook no longer
    // re-derives which rows are listed, so the ids are passed in. That a zero-change
    // line is among them is `listedReadouts`' assertion now.
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.selectAllListedLines([801]);
    });

    expect(result.current.lines.find((l) => l.id === 801)?.selected).toBe(true);
  });

  it('leaves a line that was not listed unselected', () => {
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.selectAllListedLines([801]);
    });

    expect(result.current.lines.find((l) => l.id === 802)?.selected).toBe(false);
  });

  it('keeps an already-selected line selected when it is not listed', () => {
    window.history.replaceState({}, '', '?lines=802');
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.selectAllListedLines([801]);
    });

    expect(result.current.lines.find((l) => l.id === 802)?.selected).toBe(true);
  });
});
