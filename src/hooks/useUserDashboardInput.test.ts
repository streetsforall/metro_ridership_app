import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useUserDashboardInput, { daysOfWeek } from './useUserDashboardInput';
import { dataDefaultEndDate } from '../utils/dataDateRange';
import { formatMonthParam } from '../utils/queryParams';
import type { ConsolidatedRidership } from '../@types/metrics.types';
import {
  makeConsolidatedRidership,
  makeRidershipRecord,
} from '../test/builders';

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

describe('updateLinesWithLineMetrics', () => {
  const makeRidership = (
    lineId: number,
    wkday: number,
  ): ConsolidatedRidership =>
    makeConsolidatedRidership(
      lineId,
      [
        makeRidershipRecord({
          line_name: lineId,
          est_wkday_ridership: wkday,
          est_sat_ridership: null,
          est_sun_ridership: null,
        }),
      ],
      { selected: true },
    );

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

  it('clears every derived metric when a line drops out of the window', () => {
    // The no-record branch used to clear only averageRidership and changeInRidership,
    // leaving the previous window's starting/ending/riders-per-mile on the row.
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.updateLinesWithLineMetrics(makeRidership(801, 10000));
    });

    const populated = result.current.lines.find((l) => l.id === 801);
    expect(populated?.startingRidership).toBe(10000);
    expect(populated?.endingRidership).toBe(10000);
    expect(populated?.ridersPerMile).toBeGreaterThan(0);
    expect(populated?.coveredFrom).toBe('2022-01');

    act(() => {
      result.current.updateLinesWithLineMetrics({});
    });

    const cleared = result.current.lines.find((l) => l.id === 801);
    expect(cleared?.averageRidership).toBeUndefined();
    expect(cleared?.changeInRidership).toBeUndefined();
    expect(cleared?.startingRidership).toBeUndefined();
    expect(cleared?.endingRidership).toBeUndefined();
    expect(cleared?.ridersPerMile).toBeUndefined();
    expect(cleared?.coveredFrom).toBeUndefined();
    expect(cleared?.coveredTo).toBeUndefined();
    expect(cleared?.isPartialCoverage).toBeUndefined();
  });
});

describe('coverage metadata on lines', () => {
  const makeRecord = (lineId: number, year: number, month: number) =>
    makeRidershipRecord({
      year,
      month,
      line_name: lineId,
      est_wkday_ridership: 5000,
      est_sat_ridership: null,
      est_sun_ridership: null,
    });

  // 801 spans the window, 805 only its tail — the D Line shape from #86.
  const mixedCoverage: ConsolidatedRidership = {
    ...makeConsolidatedRidership(
      801,
      [makeRecord(801, 2025, 7), makeRecord(801, 2025, 8), makeRecord(801, 2025, 9)],
      { selected: true },
    ),
    ...makeConsolidatedRidership(805, [makeRecord(805, 2025, 9)], {
      selected: true,
    }),
  };

  it('flags the short-coverage line and records its range', () => {
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.updateLinesWithLineMetrics(mixedCoverage);
    });

    const dLine = result.current.lines.find((l) => l.id === 805);
    expect(dLine?.isPartialCoverage).toBe(true);
    expect(dLine?.coveredFrom).toBe('2025-09');
    expect(dLine?.coveredTo).toBe('2025-09');
  });

  it('does not flag a line that spans the whole window', () => {
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.updateLinesWithLineMetrics(mixedCoverage);
    });

    const aLine = result.current.lines.find((l) => l.id === 801);
    expect(aLine?.isPartialCoverage).toBe(false);
    expect(aLine?.coveredFrom).toBe('2025-07');
    expect(aLine?.coveredTo).toBe('2025-09');
  });

  it('does not reorder the records it was handed', () => {
    // The metric functions used to sort ridershipRecords in place — the same array
    // the sparklines and the CSV export read. `lineMetrics` sorts a copy.
    const unsorted: ConsolidatedRidership = makeConsolidatedRidership(
      801,
      [makeRecord(801, 2025, 9), makeRecord(801, 2025, 7), makeRecord(801, 2025, 8)],
      { selected: true },
    );

    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.updateLinesWithLineMetrics(unsorted);
    });

    expect(unsorted[801].ridershipRecords.map((r) => r.month)).toEqual([9, 7, 8]);
  });
});

describe('line visibility', () => {
  const singleMonth = (lineId: number, wkday: number): ConsolidatedRidership =>
    makeConsolidatedRidership(lineId, [
      makeRidershipRecord({
        year: 2026,
        month: 3,
        line_name: lineId,
        est_wkday_ridership: wkday,
        est_sat_ridership: null,
        est_sun_ridership: null,
      }),
    ]);

  it('keeps a line whose change is exactly 0 in the table', () => {
    // `lineMetrics` returns changeInRidership 0 for a single record, so the old
    // truthiness check emptied the whole table for any single-month window.
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.updateLinesWithLineMetrics(singleMonth(801, 10000));
    });

    const aLine = result.current.lines.find((l) => l.id === 801);
    expect(aLine?.changeInRidership).toBe(0);
    expect(result.current.visibleLines.some((l) => l.id === 801)).toBe(true);
  });

  it('keeps a line whose average ridership is 0 in the table', () => {
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.updateLinesWithLineMetrics(singleMonth(801, 0));
    });

    expect(result.current.visibleLines.some((l) => l.id === 801)).toBe(true);
  });

  it('selectAllVisibleLines selects a zero-change line too', () => {
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.updateLinesWithLineMetrics(singleMonth(801, 10000));
    });

    act(() => {
      result.current.selectAllVisibleLines();
    });

    expect(result.current.lines.find((l) => l.id === 801)?.selected).toBe(true);
  });

  it('excludes a line with no metrics at all', () => {
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.updateLinesWithLineMetrics({});
    });

    expect(result.current.visibleLines).toHaveLength(0);
  });

  it('excludes a line with an empty record set', () => {
    // `lineMetrics` returns null for an empty series, so the derived fields are
    // cleared to undefined. The module this replaced divided by the record count and
    // put a NaN there instead; either way no metric reaches the table and the row is
    // hidden. The row staying hidden is the assertion that matters here.
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.updateLinesWithLineMetrics({
        801: { selected: false, ridershipRecords: [] },
      });
    });

    const aLine = result.current.lines.find((l) => l.id === 801);
    expect(aLine?.averageRidership).toBeUndefined();
    expect(result.current.visibleLines.some((l) => l.id === 801)).toBe(false);
  });

  it('excludes a hidden line even when it has metrics', () => {
    window.history.replaceState({}, '', '?trains=0');
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.updateLinesWithLineMetrics(singleMonth(801, 10000));
    });

    expect(result.current.visibleLines.some((l) => l.id === 801)).toBe(false);
  });
});
