import { describe, it, expect } from 'vitest';
import { buildRidershipView, type LineSelection } from './buildRidershipView';
import type { DayOfWeek, RidershipRecord } from '../@types/metrics.types';
import { makeRidershipRecord, makeTransitEvent } from '../test/builders';

/**
 * Same shape as `App.test.tsx`'s fixture, so the assertions migrated from there
 * keep their meaning:
 *   807 (K Line) — 2019-01, 2022-01, 2026-01
 *   806 (L Line) — 2022-01 only; inserted before K so numeric key order differs
 *                  from alphabetical order
 *   804 (E Line) — 2020-08 → 2026-01, the long series
 *   805 (D Line) — 2025-07, 2026-01 only. D sorts before E alphabetically, so the
 *                  short series is the *first* dataset — the shape that used to
 *                  scramble the x-axis.
 */
const RECORDS: RidershipRecord[] = [
  makeRidershipRecord({
    year: 2019,
    month: 1,
    line_name: 807,
    est_wkday_ridership: 1000,
    est_sat_ridership: 600,
    est_sun_ridership: 400,
  }),
  makeRidershipRecord({
    year: 2020,
    month: 8,
    line_name: 804,
    est_wkday_ridership: 4000,
    est_sat_ridership: 2000,
    est_sun_ridership: 1000,
  }),
  makeRidershipRecord({
    year: 2022,
    month: 1,
    line_name: 807,
    est_wkday_ridership: 5000,
    est_sat_ridership: 3000,
    est_sun_ridership: 2000,
  }),
  makeRidershipRecord({
    year: 2022,
    month: 1,
    line_name: 806,
    est_wkday_ridership: 8000,
    est_sat_ridership: 5000,
    est_sun_ridership: 3000,
  }),
  makeRidershipRecord({
    year: 2022,
    month: 1,
    line_name: 804,
    est_wkday_ridership: 4400,
    est_sat_ridership: 2200,
    est_sun_ridership: 1100,
  }),
  makeRidershipRecord({
    year: 2025,
    month: 7,
    line_name: 804,
    est_wkday_ridership: 4800,
    est_sat_ridership: 2400,
    est_sun_ridership: 1200,
  }),
  makeRidershipRecord({
    year: 2025,
    month: 7,
    line_name: 805,
    est_wkday_ridership: 700,
    est_sat_ridership: 350,
    est_sun_ridership: 175,
  }),
  makeRidershipRecord({
    year: 2026,
    month: 1,
    line_name: 807,
    est_wkday_ridership: 9000,
    est_sat_ridership: 7000,
    est_sun_ridership: 5000,
  }),
  makeRidershipRecord({
    year: 2026,
    month: 1,
    line_name: 804,
    est_wkday_ridership: 5200,
    est_sat_ridership: 2600,
    est_sun_ridership: 1300,
  }),
  makeRidershipRecord({
    year: 2026,
    month: 1,
    line_name: 805,
    est_wkday_ridership: 900,
    est_sat_ridership: 450,
    est_sun_ridership: 225,
  }),
];

/** Window bounds are parsed the way the dashboard hook parses them: `new Date(year, month - 1)`. */
const month = (year: number, oneBasedMonth: number) =>
  new Date(year, oneBasedMonth - 1);

/** A window wide enough to hold every fixture record. */
const WIDE = { startDate: month(2018, 1), endDate: month(2027, 1) };

const build = (over: Partial<Parameters<typeof buildRidershipView>[0]> = {}) =>
  buildRidershipView({
    records: RECORDS,
    lines: [],
    startDate: WIDE.startDate,
    endDate: WIDE.endDate,
    dayOfWeek: 'est_wkday_ridership',
    includeAggregate: false,
    // Default to no events so dataset-focused cases aren't perturbed by the
    // bundled transit-events.json.
    events: [],
    ...over,
  });

const K: LineSelection = { id: 807, selected: true };
const L: LineSelection = { id: 806, selected: true };
const E: LineSelection = { id: 804, selected: true };
const D: LineSelection = { id: 805, selected: true };

describe('buildRidershipView — datasets follow the lines[] order', () => {
  it('follows the given lines[] order, not record-encounter order', () => {
    // 806 (L) appears before 807 (K) in RECORDS and is numerically smaller, but
    // `lines` is the ordering authority — alphabetical, K before L.
    const { datasets } = build({ lines: [K, L] });

    expect(datasets.map((ds) => ds.label)).toEqual(['K Line', 'L Line']);
  });

  it('reverses when lines[] reverses — nothing else decides the order', () => {
    const { datasets } = build({ lines: [L, K] });

    expect(datasets.map((ds) => ds.label)).toEqual(['L Line', 'K Line']);
  });
});

describe('buildRidershipView — line selection', () => {
  it('produces no datasets when no lines are selected', () => {
    const { datasets, months } = build({
      lines: [{ id: 807, selected: false }],
    });

    expect(datasets).toHaveLength(0);
    expect(months).toEqual([]);
  });

  it('produces one dataset per selected line', () => {
    const { datasets } = build({ lines: [K, { id: 806, selected: false }] });

    expect(datasets).toHaveLength(1);
    expect(datasets[0].label).toBe('K Line');
  });

  it('assigns the correct brand colour to each line', () => {
    const { datasets } = build({ lines: [K, L] });

    const kLine = datasets.find((ds) => ds.label === 'K Line');
    const lLine = datasets.find((ds) => ds.label === 'L Line');

    expect(kLine?.borderColor).toBe('#e56db1'); // K Line pink
    expect(lLine?.borderColor).toBe('#f9a825'); // L Line gold
  });
});

describe('buildRidershipView — day of week', () => {
  // Selecting a day-of-week does not filter records; it selects which field of
  // each record is read.
  const at2022 = (dayOfWeek: DayOfWeek) =>
    build({
      lines: [K],
      dayOfWeek,
      startDate: month(2021, 1),
      endDate: month(2024, 1),
    }).datasets[0].data[0].stat;

  it('reads est_wkday_ridership for weekdays', () => {
    expect(at2022('est_wkday_ridership')).toBe(5000);
  });

  it('reads est_sat_ridership for Saturday', () => {
    expect(at2022('est_sat_ridership')).toBe(3000);
  });

  it('reads est_sun_ridership for Sunday', () => {
    expect(at2022('est_sun_ridership')).toBe(2000);
  });
});

describe('buildRidershipView — the Month Window', () => {
  it('excludes records before the start and after the end', () => {
    // 2019-01 is before the start, 2026-01 after the end; only 2022-01 survives.
    const { datasets } = build({
      lines: [K],
      startDate: month(2021, 1),
      endDate: month(2024, 1),
    });

    expect(datasets[0].data).toHaveLength(1);
    expect(datasets[0].data[0].stat).toBe(5000);
  });

  it('includes every record when the window is wide enough', () => {
    const { datasets } = build({ lines: [K] });

    expect(datasets[0].data).toHaveLength(3);
  });

  it('produces no dataset for a selected line with no records in the window', () => {
    const { datasets, consolidated } = build({
      lines: [K],
      startDate: month(2023, 6),
      endDate: month(2024, 6),
    });

    expect(datasets).toHaveLength(0);
    // The line is absent from the grouping entirely, so there is no Selection
    // Snapshot for the dataset loop to filter on.
    expect(consolidated[807]).toBeUndefined();
  });

  /**
   * The boundary rule ADR-0001 depends on. With start = 2022-01 and end =
   * 2024-01, a record at calendar-month ordinal R is included when
   * S <= R <= E - 2 — so the window is 2022-01 … 2023-11 inclusive. The start
   * month is in; the end month **and the month immediately before it** are out.
   * This is intended. Do not "fix" it.
   */
  describe('boundaries (start 2022-01, end 2024-01)', () => {
    const windowed = (year: number, monthOfYear: number) =>
      buildRidershipView({
        records: [
          makeRidershipRecord({
            year,
            month: monthOfYear,
            line_name: 807,
          }),
        ],
        lines: [K],
        startDate: month(2022, 1),
        endDate: month(2024, 1),
        dayOfWeek: 'est_wkday_ridership',
        includeAggregate: false,
        events: [],
      }).datasets.length;

    it('excludes the month before the start (2021-12)', () => {
      expect(windowed(2021, 12)).toBe(0);
    });

    it('includes the start month itself (2022-01)', () => {
      expect(windowed(2022, 1)).toBe(1);
    });

    it('includes E − 2 (2023-11)', () => {
      expect(windowed(2023, 11)).toBe(1);
    });

    it('excludes E − 1 (2023-12)', () => {
      expect(windowed(2023, 12)).toBe(0);
    });

    it('excludes the end month itself (2024-01)', () => {
      expect(windowed(2024, 1)).toBe(0);
    });
  });
});

describe('buildRidershipView — the Aggregate Series', () => {
  it('is absent unless requested', () => {
    const { datasets } = build({ lines: [K, L] });

    expect(datasets.map((ds) => ds.label)).not.toContain('Aggregate');
  });

  it('is present and last when requested', () => {
    const { datasets } = build({ lines: [K, L], includeAggregate: true });

    expect(datasets).toHaveLength(3);
    expect(datasets[datasets.length - 1].label).toBe('Aggregate');
  });

  it('equals the per-month sum of the selected lines', () => {
    const { datasets } = build({
      lines: [K, L],
      includeAggregate: true,
      startDate: month(2021, 1),
      endDate: month(2024, 1),
    });

    const kLine = datasets.find((ds) => ds.label === 'K Line');
    const lLine = datasets.find((ds) => ds.label === 'L Line');
    const aggregate = datasets.find((ds) => ds.label === 'Aggregate');

    // 2022-01: K weekday = 5000, L weekday = 8000 → aggregate = 13000
    expect(aggregate!.data[0].stat).toBe(
      kLine!.data[0].stat! + lLine!.data[0].stat!,
    );
    expect(aggregate!.data[0].stat).toBe(13000);
  });
});

describe('buildRidershipView — the shared Month Axis', () => {
  // Regression #86-adjacent: the axis used to be taken from datasets[0] alone. D
  // Line sorts first and covers far fewer months than E Line, so the axis became
  // D Line's months and Chart.js appended E Line's remaining months to the *end*
  // — an x-axis that jumped from 2026 back to 2020, with a stroke across the plot.
  const bothRail = {
    lines: [D, E],
    startDate: month(2020, 1),
    endDate: month(2027, 1),
  };

  it('spans the chronological union of both lines months', () => {
    const { months } = build(bothRail);

    expect(months).toEqual(['2020 8', '2022 1', '2025 7', '2026 1']);
  });

  it('gives every dataset the same time sequence as the axis', () => {
    const { months, datasets } = build(bothRail);

    for (const dataset of datasets)
      expect(dataset.data.map((d) => d.time)).toEqual(months);
  });

  it('nulls the months the short line does not cover', () => {
    const { datasets } = build(bothRail);

    const dLine = datasets.find((ds) => ds.label === 'D Line');
    // Gaps, not points shifted onto the front of the axis — and never 0.
    expect(dLine?.data.map((d) => d.stat)).toEqual([null, null, 700, 900]);
  });

  it('keeps the long line aligned to its own months', () => {
    const { datasets } = build(bothRail);

    const eLine = datasets.find((ds) => ds.label === 'E Line');
    expect(eLine?.data.map((d) => d.stat)).toEqual([4000, 4400, 4800, 5200]);
  });

  it('sums the aggregate by month rather than by array index', () => {
    const { datasets } = build({ ...bothRail, includeAggregate: true });

    const aggregate = datasets.find((ds) => ds.label === 'Aggregate');
    // Months only E Line reports total E Line alone — a line with no record must
    // not be counted as a zero and drag the total down.
    expect(aggregate?.data.map((d) => d.stat)).toEqual([
      4000,
      4400,
      4800 + 700,
      5200 + 900,
    ]);
  });
});

describe('buildRidershipView — data point shape', () => {
  it('formats time as "year month" and carries both time and stat', () => {
    const { datasets } = build({
      lines: [K],
      startDate: month(2021, 1),
      endDate: month(2024, 1),
    });

    const point = datasets[0].data[0];
    expect(point.time).toBe('2022 1');
    expect(point).toHaveProperty('time');
    expect(point).toHaveProperty('stat');
  });
});

describe('buildRidershipView — Consolidated Ridership', () => {
  it('groups records by line and records the Selection Snapshot', () => {
    const { consolidated } = build({ lines: [K, { id: 806, selected: false }] });

    expect(consolidated[807].selected).toBe(true);
    expect(consolidated[807].ridershipRecords).toHaveLength(3);
    // Grouped even when unselected — the snapshot is what the dataset loop reads.
    expect(consolidated[806].selected).toBe(false);
    expect(consolidated[806].ridershipRecords).toHaveLength(1);
  });
});

describe('buildRidershipView — the Event Window', () => {
  // The Event Window is inclusive on both ends and correctly 1-based. It
  // genuinely disagrees with the Month Window pinned above — with the same
  // 2022-01 → 2024-01 bounds, a record at 2023-12 is *out* of the Month Window
  // while an event at 2024-01 is *in* the Event Window. That divergence is
  // deliberate and preserved.
  const eventWindow = {
    lines: [K],
    startDate: month(2022, 1),
    endDate: month(2024, 1),
  };

  it('includes an event exactly at the start month', () => {
    const { events } = build({
      ...eventWindow,
      events: [makeTransitEvent({ id: 'at-start', date: '2022-01', line_ids: [807] })],
    });

    expect(events.map((e) => e.id)).toEqual(['at-start']);
  });

  it('includes an event exactly at the end month — unlike the Month Window', () => {
    const { events, datasets } = build({
      ...eventWindow,
      records: [
        makeRidershipRecord({ year: 2024, month: 1, line_name: 807 }),
      ],
      events: [
        makeTransitEvent({ id: 'at-end', date: '2024-01', line_ids: [807] }),
      ],
    });

    expect(events.map((e) => e.id)).toEqual(['at-end']);
    // Same bounds, same month: the record at 2024-01 is excluded. The two
    // windows disagree on purpose.
    expect(datasets).toHaveLength(0);
  });

  it('excludes an event one month before the start', () => {
    const { events } = build({
      ...eventWindow,
      events: [makeTransitEvent({ id: 'before', date: '2021-12', line_ids: [807] })],
    });

    expect(events).toEqual([]);
  });

  it('excludes an event one month after the end', () => {
    const { events } = build({
      ...eventWindow,
      events: [makeTransitEvent({ id: 'after', date: '2024-02', line_ids: [807] })],
    });

    expect(events).toEqual([]);
  });
});

describe('buildRidershipView — event selection filtering', () => {
  const inWindow = {
    lines: [K],
    startDate: month(2022, 1),
    endDate: month(2024, 1),
  };

  it('returns a system-wide event (line_ids: []) regardless of selection', () => {
    const { events } = build({
      ...inWindow,
      lines: [{ id: 807, selected: false }],
      events: [makeTransitEvent({ id: 'system-wide', date: '2022-06', line_ids: [] })],
    });

    expect(events.map((e) => e.id)).toEqual(['system-wide']);
  });

  it('returns an event whose line_ids intersect the selection, and not one that does not', () => {
    const { events } = build({
      ...inWindow,
      events: [
        makeTransitEvent({ id: 'mine', date: '2022-06', line_ids: [807, 806] }),
        makeTransitEvent({ id: 'not-mine', date: '2022-07', line_ids: [806] }),
      ],
    });

    expect(events.map((e) => e.id)).toEqual(['mine']);
  });

  it('sorts events ascending by date', () => {
    const { events } = build({
      ...inWindow,
      events: [
        makeTransitEvent({ id: 'third', date: '2023-05', line_ids: [807] }),
        makeTransitEvent({ id: 'first', date: '2022-02', line_ids: [807] }),
        makeTransitEvent({ id: 'second', date: '2022-11', line_ids: [807] }),
      ],
    });

    expect(events.map((e) => e.id)).toEqual(['first', 'second', 'third']);
  });

  it('returns an event on a selected line that has no records in the window', () => {
    // The event filter reads the *live* selection, not the Selection Snapshot the
    // datasets filter on. A line with nothing to draw still gets its events.
    const { datasets, events } = build({
      ...inWindow,
      records: [
        makeRidershipRecord({ year: 2019, month: 1, line_name: 807 }),
      ],
      events: [
        makeTransitEvent({
          id: 'still-shows',
          date: '2022-06',
          line_ids: [807],
        }),
      ],
    });

    expect(datasets).toHaveLength(0);
    expect(events.map((e) => e.id)).toEqual(['still-shows']);
  });

  it('defaults to the bundled transit-events.json when no events are given', () => {
    const { events } = buildRidershipView({
      records: RECORDS,
      lines: [K],
      startDate: month(2022, 1),
      endDate: month(2024, 1),
      dayOfWeek: 'est_wkday_ridership',
      includeAggregate: false,
    });

    // k-line-opening (2022-10, line_ids [807]) is the bundled event this window
    // admits.
    expect(events.map((e) => e.id)).toContain('k-line-opening');
    for (const event of events)
      expect(
        event.line_ids.length === 0 || event.line_ids.includes(807),
      ).toBe(true);
  });
});

describe('buildRidershipView — the empty view', () => {
  it('yields empty months, datasets and consolidated while records are null', () => {
    const { months, datasets, consolidated } = build({ records: null, lines: [K, L] });

    expect(months).toEqual([]);
    expect(datasets).toEqual([]);
    expect(consolidated).toEqual({});
  });

  it('still filters and returns events while records are null', () => {
    // The events derivation does not depend on records — matching App today,
    // where the events memo has no ridershipRecords dependency.
    const { events } = build({
      records: null,
      lines: [K],
      startDate: month(2022, 1),
      endDate: month(2024, 1),
      events: [
        makeTransitEvent({ id: 'in-window', date: '2022-06', line_ids: [807] }),
        makeTransitEvent({ id: 'out-of-window', date: '2030-01', line_ids: [807] }),
      ],
    });

    expect(events.map((e) => e.id)).toEqual(['in-window']);
  });
});
