import { describe, it, expect } from 'vitest';
import events from './transit-events.json';
import ridership from './ridership.json';
import shakeupList from './shakeups.json';
import lineMetadata from './metro_line_metadata_current.json';
import { getLineNames } from '../utils/lines';
import type { TransitEvent } from '../@types/events.types';
import type { RidershipRecord } from '../@types/metrics.types';

/**
 * Data-integrity guardrail for the hand-curated transit events that render as
 * chart annotations. Catches the class of bug this file has already had —
 * wrong opening dates (D Line dated 2023-10 instead of its true 2026-05, K Line
 * dated 2021-10 instead of 2022-10) — before it ships.
 *
 * Runs in CI (no network). The GTFS-backed referential check and the source
 * link-rot check live in scripts/check_transit_events.py, which needs to
 * download the live feed.
 */

const transitEvents = events as TransitEvent[];
const records = ridership as RidershipRecord[];

const CATEGORIES = [
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
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const SHAKEUP_RE = /^\d{6}$/;
const SOURCE_RE = /^https:\/\//;
/** 24h "HH:MM". Deliberately loose on the hour so "24:00" style entries fail loudly. */
const SPAN_RE = /^\d{2}:\d{2}$/;

const shakeups = new Set(shakeupList);

/**
 * Every line id the ridership dataset knows about. The referential check used
 * to assert `getLineNames(id).current` doesn't start with "Line ", but
 * utils/lines.ts:definedLines only names 801-807, 901 and 910 — so that check
 * rejected every bus line, which blocks curating bus service changes. Metadata
 * membership is the honest test of "is this a real line"; the definedLines
 * union below keeps BRT ids valid if the metadata ever lags behind.
 */
const metadataLineIds = new Set(
  (lineMetadata as { line: number }[]).map((entry) => entry.line),
);

const isKnownLine = (lineId: number): boolean =>
  metadataLineIds.has(lineId) ||
  // Falls back to the brand-color table: anything it names is a real rail/BRT line.
  !getLineNames(lineId).current.startsWith('Line ');

const yyyymmOf = (date: string): number => {
  const [year, month] = date.split('-').map(Number);
  return year * 100 + month;
};

/** Absolute month count, so date differences are correct across year boundaries. */
const monthIndex = (yyyymm: number): number =>
  Math.floor(yyyymm / 100) * 12 + (yyyymm % 100);

// Dataset month bounds (reduce, not spread — the array has tens of thousands of rows).
const allMonths = records.map((r) => r.year * 100 + r.month);
const firstRidershipMonth = allMonths.reduce((a, b) => Math.min(a, b), Infinity);
const lastRidershipMonth = allMonths.reduce((a, b) => Math.max(a, b), -Infinity);

/** Earliest month a line reports any non-zero ridership, or null if it never does. */
const firstNonZeroMonth = (lineId: number): number | null => {
  let earliest: number | null = null;
  for (const r of records) {
    if (r.line_name !== lineId) continue;
    if (!(r.est_wkday_ridership || r.est_sat_ridership || r.est_sun_ridership)) continue;
    const ym = r.year * 100 + r.month;
    if (earliest === null || ym < earliest) earliest = ym;
  }
  return earliest;
};

describe('transit-events.json schema', () => {
  it('contains at least one event', () => {
    expect(transitEvents.length).toBeGreaterThan(0);
  });

  it('has no duplicate ids', () => {
    const ids = transitEvents.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  transitEvents.forEach((event, i) => {
    // Fall back to the index so a malformed/absent id still names its test.
    it(`event "${event.id ?? `#${i}`}" is well-formed`, () => {
      expect(typeof event.id).toBe('string');
      expect(event.id.length).toBeGreaterThan(0);
      expect(event.date).toMatch(DATE_RE);
      expect(Array.isArray(event.line_ids)).toBe(true);
      expect(event.line_ids.every((id) => Number.isInteger(id))).toBe(true);
      expect(typeof event.title).toBe('string');
      expect(event.title.length).toBeGreaterThan(0);
      expect(typeof event.description).toBe('string');
      expect(event.description.length).toBeGreaterThan(0);
      expect(CATEGORIES).toContain(event.category);
    });
  });
});

describe('transit-events.json provenance', () => {
  transitEvents.forEach((event) => {
    // `source` is optional on the TypeScript interface so fixtures stay cheap to
    // write, but mandatory here — an unsourced claim is not curated data.
    it(`event "${event.id}" cites an https source`, () => {
      expect(event.source).toMatch(SOURCE_RE);
    });
  });
});

describe('transit-events.json shakeup alignment', () => {
  const withShakeup = transitEvents.filter((e) => e.shakeup !== undefined);

  withShakeup.forEach((event) => {
    const shakeup = event.shakeup as string;

    it(`event "${event.id}" names a real Metro shakeup`, () => {
      expect(shakeup).toMatch(SHAKEUP_RE);
      // Metro only changes service on a pick period, so a service-change date
      // that names a shakeup Metro never ran is a typo, not a schedule.
      expect(shakeups.has(shakeup)).toBe(true);
    });

    it(`event "${event.id}" is dated within a month of shakeup ${shakeup}`, () => {
      // A change announced in one month usually takes effect on the adjacent
      // pick (COVID: announced 2020-03, landed on the 202004 pick), so allow
      // one month of slack — but no more, or the pairing is meaningless.
      const diff = Math.abs(
        monthIndex(yyyymmOf(event.date)) - monthIndex(Number(shakeup)),
      );
      expect(diff).toBeLessThanOrEqual(1);
    });
  });
});

describe('transit-events.json details', () => {
  const withDetails = transitEvents.filter((e) => e.details !== undefined);

  withDetails.forEach((event) => {
    const details = event.details!;

    it(`event "${event.id}" has well-formed details`, () => {
      for (const key of ['headway_before_min', 'headway_after_min'] as const) {
        const value = details[key];
        if (value === undefined) continue;
        expect(typeof value).toBe('number');
        // A zero or negative headway is nonsense; catch a unit slip (seconds
        // written as minutes rounds to 0) rather than render it on the chart.
        expect(value).toBeGreaterThan(0);
      }

      for (const key of ['span_before_end', 'span_after_end'] as const) {
        const value = details[key];
        if (value === undefined) continue;
        expect(value).toMatch(SPAN_RE);
      }

      if (details.stations_added !== undefined) {
        expect(Number.isInteger(details.stations_added)).toBe(true);
        expect(details.stations_added).toBeGreaterThan(0);
      }
    });
  });
});

describe('transit-events.json referential integrity', () => {
  transitEvents.forEach((event) => {
    event.line_ids.forEach((lineId) => {
      it(`event "${event.id}" references known line ${lineId}`, () => {
        expect(isKnownLine(lineId)).toBe(true);
      });
    });

    it(`event "${event.id}" is not dated past the available ridership data`, () => {
      // Guards against future-snapping typos (e.g. a 2062 fat-finger). The D Line
      // extension (2026-05) sits exactly at the current data boundary.
      expect(yyyymmOf(event.date)).toBeLessThanOrEqual(lastRidershipMonth);
    });
  });
});

describe('opening dates cross-checked against ridership first-appearance', () => {
  const singleLineOpenings = transitEvents.filter(
    (e) => e.category === 'opening' && e.line_ids.length === 1,
  );

  let checkedCount = 0;

  singleLineOpenings.forEach((event) => {
    const lineId = event.line_ids[0];
    const firstNonZero = firstNonZeroMonth(lineId);
    // Only meaningful when the line demonstrably begins mid-series. A line that
    // reports from the dataset's very first month (or never) carries no opening
    // signal — e.g. the E/Expo line has spurious pre-2012 rows — so we skip it
    // rather than assert a false expectation.
    const checkable =
      firstNonZero !== null && firstNonZero !== firstRidershipMonth;
    if (checkable) checkedCount++;

    const label = checkable
      ? `opening "${event.id}" matches its first ridership month`
      : `opening "${event.id}" has no mid-series signal (skipped)`;

    it(label, () => {
      if (!checkable) return;
      const diff = Math.abs(
        monthIndex(yyyymmOf(event.date)) - monthIndex(firstNonZero),
      );
      expect(diff).toBeLessThanOrEqual(1);
    });
  });

  it('actually cross-checks at least one opening (guards against a silent no-op)', () => {
    expect(checkedCount).toBeGreaterThanOrEqual(1);
  });
});

describe('shakeups.json', () => {
  const list = shakeupList;

  it('is a non-empty, de-duplicated, chronologically sorted YYYYMM list', () => {
    expect(list.length).toBeGreaterThan(0);
    expect(new Set(list).size).toBe(list.length);
    expect(list.every((s) => SHAKEUP_RE.test(s))).toBe(true);
    expect([...list].sort()).toEqual(list);
  });

  it('covers the pick periods the curated events name', () => {
    // Coverage stops at 202412 (see scripts/README.md) — an event after that
    // simply carries no shakeup, which the alignment suite above tolerates.
    expect(shakeups.has('202004')).toBe(true);
    expect(shakeups.has('202210')).toBe(true);
    expect(shakeups.has('202306')).toBe(true);
  });
});

describe('the guardrails themselves reject malformed values', () => {
  // These predicates only ever see good data above, so exercise them directly —
  // a validator that cannot fail is worthless. Chip-B service-change events are
  // the first data to hit the headway/span branches.
  it('rejects a shakeup id Metro never ran', () => {
    expect(shakeups.has('202405')).toBe(false); // real format, not a real pick
    expect(SHAKEUP_RE.test('2024-06')).toBe(false);
  });

  it('rejects a shakeup more than a month from its event', () => {
    const diff = Math.abs(monthIndex(yyyymmOf('2022-06')) - monthIndex(202210));
    expect(diff).toBeGreaterThan(1);
  });

  it('rejects non-https and malformed span values', () => {
    expect(SOURCE_RE.test('http://example.com')).toBe(false);
    expect(SPAN_RE.test('1:00')).toBe(false);
    expect(SPAN_RE.test('0100')).toBe(false);
    expect(SPAN_RE.test('01:00')).toBe(true);
  });

  it('recognises bus lines the old brand-color check rejected', () => {
    // The regression this suite exists to prevent: line 2 is a real bus line.
    expect(isKnownLine(2)).toBe(true);
    expect(isKnownLine(720)).toBe(true);
    expect(isKnownLine(805)).toBe(true);
    expect(isKnownLine(999999)).toBe(false);
  });
});
