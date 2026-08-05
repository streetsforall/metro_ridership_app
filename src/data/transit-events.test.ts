import { describe, it, expect } from 'vitest';
import events from './transit-events.json';
import ridership from './ridership.json';
import { getLineNames } from '../utils/lines';
import type { TransitEvent } from '../@types/events.types';
import type { RidershipRecord } from '../@types/metrics.types';

/**
 * Data-integrity guardrail for the hand-curated transit events that render as
 * chart annotations. Catches the class of bug this file has already had —
 * wrong opening dates (D Line dated 2023-10 instead of its true 2026-05, K Line
 * dated 2021-10 instead of 2022-10) — before it ships.
 *
 * Runs in CI (no network). The GTFS-backed referential check lives in
 * scripts/check_transit_events.py, which needs to download the live feed.
 */

const transitEvents = events as TransitEvent[];
const records = ridership as RidershipRecord[];

const CATEGORIES = ['opening', 'extension', 'disruption', 'service_change'];
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

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

describe('transit-events.json referential integrity', () => {
  transitEvents.forEach((event) => {
    event.line_ids.forEach((lineId) => {
      it(`event "${event.id}" references known line ${lineId}`, () => {
        // getLineNames returns "Line <n>" for anything not in the brand-color
        // table, so a real rail/BRT line never starts with that prefix.
        expect(getLineNames(lineId).current.startsWith('Line ')).toBe(false);
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
