/**
 * Shared fixture builders for the Vitest suite.
 *
 * Not a test file: Vitest's include glob is `**\/*.{test,spec}.?(c|m)[jt]s?(x)`,
 * which `builders.ts` does not match, so the runner will not try to collect it as
 * a suite. It lives beside `src/test-setup.ts` for the same reason — test-only
 * scaffolding, never imported by application code.
 *
 * Conventions:
 *
 * - Every builder takes a single `Partial<T>` of overrides and returns a **fresh,
 *   unfrozen** object. Freezing was considered and rejected: nothing in the suite
 *   mutates a fixture, a new object is minted per call so cross-test bleed is
 *   impossible anyway, and a meaningful guard would need a deep freeze over the
 *   nested `ridershipRecords` / `line_ids` arrays — more machinery than the
 *   problem warrants, and a trap for a future test that legitimately mutates.
 * - `selected` defaults to `false` everywhere. Line Selection is the axis most of
 *   these tests are actually varying, so it should be visible at the call site
 *   rather than inherited from a default.
 */
import type { Line } from '../@types/lines.types';
import type { LineReadout } from '../ridership';
import type {
  ConsolidatedRecord,
  ConsolidatedRidership,
  RidershipRecord,
} from '../@types/metrics.types';
import type { TransitEvent } from '../@types/events.types';

/**
 * A Line. Defaults to the A Line (801) — the shape four of the five factories
 * this replaced already used. `src/utils/lines.test.ts` was the outlier (a
 * generic `Line 1` bus); its sort cases override `name`, and `id` wherever the
 * numeric tiebreak matters, so it reads the same against these defaults.
 */
export const makeLine = (overrides: Partial<Line> = {}): Line => ({
  id: 801,
  name: 'A Line',
  mode: 'Rail',
  provider: 'DO',
  selected: false,
  visible: true,
  ...overrides,
});

/**
 * A Line Readout: a Line plus the figures one Month Window derives for it. Separate
 * from `makeLine` on purpose — a test that wants a bare Line should get one, so it
 * cannot accidentally assert figures on something the app types as a `Line`.
 */
export const makeLineReadout = (
  overrides: Partial<LineReadout> = {},
): LineReadout => ({
  ...makeLine(),
  ...overrides,
});

/**
 * A Ridership Record. The 1000 / 600 / 400 defaults come from
 * `buildRidershipView.test.ts`, the only site that relied on defaulted ridership
 * figures; every other call site states its numbers.
 */
export const makeRidershipRecord = (
  overrides: Partial<RidershipRecord> = {},
): RidershipRecord => ({
  year: 2022,
  month: 1,
  line_name: 801,
  est_wkday_ridership: 1000,
  est_sat_ridership: 600,
  est_sun_ridership: 400,
  ...overrides,
});

/**
 * A single-line Consolidated Ridership map, keyed by line id the way
 * `App.tsx` groups records. Spread several together for a multi-line fixture.
 */
export const makeConsolidatedRidership = (
  lineName: number,
  ridershipRecords: RidershipRecord[],
  overrides: Partial<ConsolidatedRecord> = {},
): ConsolidatedRidership => ({
  [lineName]: {
    selected: false,
    ridershipRecords,
    ...overrides,
  },
});

/** A Transit Event. `line_ids: []` means system-wide. */
export const makeTransitEvent = (
  overrides: Partial<TransitEvent> = {},
): TransitEvent => ({
  id: 'event',
  date: '2022-01',
  line_ids: [],
  title: 'Event',
  description: 'Event',
  category: 'service_change',
  ...overrides,
});
