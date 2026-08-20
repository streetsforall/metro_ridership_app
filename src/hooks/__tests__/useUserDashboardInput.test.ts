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

  it('sets showStops to true when stops=1 in URL', () => {
    window.history.replaceState({}, '', '?stops=1');
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.showStops).toBe(true);
  });

  it('leaves the stop panel off when stops is absent', () => {
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.showStops).toBe(false);
  });

  it('reads the stop measure from URL', () => {
    window.history.replaceState({}, '', '?measure=offs');
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.stopMeasure).toBe('offs');
  });

  it('falls back to boardings for an unrecognised measure', () => {
    window.history.replaceState({}, '', '?measure=sideways');
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.stopMeasure).toBe('ons');
  });

  it('reads the selected stop key from URL', () => {
    window.history.replaceState({}, '', '?stop=rail:union-station');
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.selectedStopKeys).toEqual(['rail:union-station']);
  });

  /** One key or many share the `stop=` param, so older shared links still work. */
  it('reads several selected stop keys from one stop param', () => {
    window.history.replaceState(
      {},
      '',
      '?stop=rail:union-station,bus:vermont-wilshire',
    );
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.selectedStopKeys).toEqual([
      'rail:union-station',
      'bus:vermont-wilshire',
    ]);
  });

  it('ignores a stop param that is not a stop key', () => {
    window.history.replaceState({}, '', '?stop=<script>');
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.selectedStopKeys).toEqual([]);
  });

  it('keeps the valid keys when one part of the stop param is malformed', () => {
    window.history.replaceState(
      {},
      '',
      '?stop=rail:union-station,<script>,bus:vermont-wilshire',
    );
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.selectedStopKeys).toEqual([
      'rail:union-station',
      'bus:vermont-wilshire',
    ]);
  });

  it('reads the stop search text from URL', () => {
    window.history.replaceState({}, '', '?stopq=vermont');
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.stopSearchText).toBe('vermont');
  });

  it('defaults the stop search text to empty', () => {
    const { result } = renderHook(() => useUserDashboardInput());
    expect(result.current.stopSearchText).toBe('');
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

  it('adds stops=1 to URL when toggleShowStops is called', () => {
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.toggleShowStops();
    });

    expect(window.location.search).toContain('stops=1');
  });

  it('omits every stop param at its default', () => {
    renderHook(() => useUserDashboardInput());
    expect(window.location.search).not.toContain('stops=');
    expect(window.location.search).not.toContain('measure=');
    expect(window.location.search).not.toContain('stop=');
    expect(window.location.search).not.toContain('stopq=');
  });

  it('writes a non-default stop measure to URL', () => {
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.setStopMeasure('both');
    });

    expect(window.location.search).toContain('measure=both');
  });

  /**
   * A stop key survives the round trip whole, even though `toString()` percent-encodes
   * its `:`.
   */
  it('round-trips the selected stop key through the URL', () => {
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.onToggleSelectStop('bus:vermont-wilshire');
    });

    expect(
      new URLSearchParams(window.location.search).get('stop'),
    ).toBe('bus:vermont-wilshire');
  });

  /** The joining comma survives `toString()` unescaped, so the param stays readable. */
  it('round-trips several selected stop keys through the one param', () => {
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.onToggleSelectStop('bus:vermont-wilshire');
    });
    act(() => {
      result.current.onToggleSelectStop('rail:union-station');
    });

    expect(new URLSearchParams(window.location.search).get('stop')).toBe(
      'bus:vermont-wilshire,rail:union-station',
    );
  });

  it('drops the stop param when the selection is cleared', () => {
    window.history.replaceState({}, '', '?stop=bus:vermont-wilshire');
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.clearStopSelections();
    });

    expect(window.location.search).not.toContain('stop=');
  });

  it('writes the stop search text to URL', () => {
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.setStopSearchText('vermont');
    });

    expect(new URLSearchParams(window.location.search).get('stopq')).toBe(
      'vermont',
    );
  });
});

/** The Stop Selection's three mutators: `Select All` adds, `Clear All` clears everything. */
describe('the Stop Selection', () => {
  it('selects a stop that was not selected', () => {
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.onToggleSelectStop('rail:union-station');
    });

    expect(result.current.selectedStopKeys).toEqual(['rail:union-station']);
  });

  it('deselects a stop that was selected', () => {
    window.history.replaceState({}, '', '?stop=rail:union-station');
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.onToggleSelectStop('rail:union-station');
    });

    expect(result.current.selectedStopKeys).toEqual([]);
  });

  it('leaves the other selected stops alone when one is deselected', () => {
    window.history.replaceState(
      {},
      '',
      '?stop=rail:union-station,bus:vermont-wilshire',
    );
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.onToggleSelectStop('rail:union-station');
    });

    expect(result.current.selectedStopKeys).toEqual(['bus:vermont-wilshire']);
  });

  /** Order is the colour assignment, so a stop added later has to land at the end. */
  it('appends a newly selected stop rather than reordering', () => {
    window.history.replaceState({}, '', '?stop=rail:union-station');
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.onToggleSelectStop('bus:vermont-wilshire');
    });

    expect(result.current.selectedStopKeys).toEqual([
      'rail:union-station',
      'bus:vermont-wilshire',
    ]);
  });

  it('adds every listed stop on top of what is already selected', () => {
    window.history.replaceState({}, '', '?stop=rail:union-station');
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.selectAllListedStops([
        'bus:vermont-wilshire',
        'bus:vermont-santa-monica',
      ]);
    });

    expect(result.current.selectedStopKeys).toEqual([
      'rail:union-station',
      'bus:vermont-wilshire',
      'bus:vermont-santa-monica',
    ]);
  });

  it('does not duplicate a listed stop that was already selected', () => {
    window.history.replaceState({}, '', '?stop=rail:union-station');
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.selectAllListedStops([
        'rail:union-station',
        'bus:vermont-wilshire',
      ]);
    });

    expect(result.current.selectedStopKeys).toEqual([
      'rail:union-station',
      'bus:vermont-wilshire',
    ]);
  });

  /** `Clear All` is global, unlike `Select All`, which reaches only the listed rows. */
  it('clears every selected stop, including ones no search would list', () => {
    window.history.replaceState(
      {},
      '',
      '?stop=rail:union-station,bus:vermont-wilshire',
    );
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.clearStopSelections();
    });

    expect(result.current.selectedStopKeys).toEqual([]);
  });

  it('leaves the search text alone when the selection is cleared', () => {
    window.history.replaceState({}, '', '?stop=rail:union-station&stopq=union');
    const { result } = renderHook(() => useUserDashboardInput());

    act(() => {
      result.current.clearStopSelections();
    });

    expect(result.current.stopSearchText).toBe('union');
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

/**
 * The mutators must keep a stable identity, because the ~800-row stop table memoises on
 * it.
 */
describe('mutator identity', () => {
  const mutators = [
    'onToggleSelectLine',
    'clearSelections',
    'selectAllListedLines',
    'onToggleSelectStop',
    'clearStopSelections',
    'selectAllListedStops',
    'toggleIsAggregateVisible',
    'toggleShowContextLogs',
    'toggleShowStops',
  ] as const;

  it('hands back the same function across a re-render', () => {
    const { result, rerender } = renderHook(() => useUserDashboardInput());
    const before = result.current;

    rerender();

    for (const name of mutators)
      expect(result.current[name], name).toBe(before[name]);
  });

  /** Identity has to survive the state changes the mutators themselves cause. */
  it('hands back the same function after the state it sets has changed', () => {
    const { result } = renderHook(() => useUserDashboardInput());
    const before = result.current;

    act(() => {
      result.current.onToggleSelectStop('bus:vermont-wilshire');
    });
    act(() => {
      result.current.toggleShowStops();
    });

    for (const name of mutators)
      expect(result.current[name], name).toBe(before[name]);
  });
});
