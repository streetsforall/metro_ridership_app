# Plan: One Representation of a Month

## Context

A month is the unit this whole app is measured in — every Ridership Record covers one, the Month
Axis is a sequence of them, the Month Window is a pair. It is encoded **seven** ways.

| Site | Encoding |
| --- | --- |
| `src/ridership/buildRidershipView.ts:94` date filter | `new Date(y, m)` — 0-based |
| `src/ridership/buildRidershipView.ts:186-187` event filter | `y * 100 + m` — 1-based, inclusive |
| `src/ridership/chartData.ts:12-13` `timeKey` | `"YYYY M"` |
| `src/ridership/chartData.ts:19-22` `formatMonthKey` | `"YYYY M"` → `"YYYY-MM"` |
| `src/ridership/chartData.ts:41` axis sort | `y * 12 + m` |
| `src/data/transit-events.json` | `"YYYY-MM"` |
| `src/utils/queryParams.ts:1-11` | `"YYYY-MM"` ↔ `Date` |
| `src/components/DateRangeSelector.tsx:98-111` | 0-based `<option value>` |

The last row is **not** in the architecture review's table and was found during the design session.
The month `<select>` is 0-based (`<option value="0">January`) because it round-trips through
`range.getMonth()`. So the picker itself speaks `Date`'s dialect.

`src/App.tsx` is **not** on this list. Candidate 1 moved both of its month encodings into
`buildRidershipView.ts`; App now contains no month arithmetic at all. The review doc used to list it
first, and that was wrong.

**Three costs follow.**

1. **A silent failure that already exists.** `OutputArea.tsx:183` re-derives the chart-label format
   from a *different* input encoding, in a different file:

   ```ts
   const label = `${event.date.slice(0, 4)} ${parseInt(event.date.slice(5), 10)}`;
   const idx = labels.indexOf(label);
   if (idx === -1) return;
   ```

   That is `timeKey` reimplemented by hand. If `timeKey` ever changes, `idx` is `-1` and the event
   marker simply **does not draw**. No error, no warning, no test failure — the chart just quietly
   stops annotating itself.

2. **A converter that exists only to bridge two of our own encodings.** `formatMonthKey`
   (`chartData.ts:19-22`) translates `"YYYY M"` into `"YYYY-MM"`. It is the newest arrival — added
   by PR #93 — and it is the clearest argument for this work: it is a function whose entire job is
   to undo a representation choice made three files away. Note it is **not** merely a display
   helper. `buildCoverageByLine` calls it at `:128-129` to populate `LineCoverage.coveredFrom` /
   `coveredTo`, which are a *public output shape* of `src/ridership/` (`:91-98`).

3. **A rule that exists only as prose.** ADR-0001's `S ≤ R ≤ E − 2` is stated in `CONTEXT.md`, in
   the ADR, and in `buildRidershipView.ts`'s docstring. It is stated as *arithmetic* nowhere. You
   cannot read the filter and learn the rule; you can only read the comment next to it.

This plan introduces `src/utils/month.ts` — a `Month` value, a `MonthWindow`, and the two
containment rules — and converts every site above to it. `Date` leaves the app's domain.

This is **candidate 4** of [`docs/architecture-review-2026-08-05.md`](../../docs/architecture-review-2026-08-05.md),
letter G. Decision record: [ADR-0006](../../docs/adr/0006-a-month-is-a-year-and-a-month-not-a-date.md).

---

### Terms

Defined in [`CONTEXT.md`](../../CONTEXT.md) and used exactly: **Month** (new, added by this work),
**Month Window**, **Event Window**, **Month Axis**, **Ridership Record**, **Ridership View**,
**Transit Event**, **Line Metrics**, **Consolidated Ridership**.

`CONTEXT.md`'s glossary outranks both the source and this plan (`CONTEXT.md:8-9`) — the precedence
rule that settled issue #114. Three consequences:

- **Month** is the term and `Month` is the type. Not `YearMonth`, not `MonthKey`, not `CalendarMonth`.
  It sits under the existing compounds (**Month Window**, **Month Axis**) rather than competing with
  them.
- **Month Window** is already a glossary term, so `MonthWindow` is the type name for the pair. Not
  `DateRange`, not `Period`.
- The word **date** does not survive as a name for a month. `startDate`/`endDate` become
  `start`/`end` on a `MonthWindow`; `parseMonthParam` becomes `parseMonth`; `dataDefaultEndDate`
  becomes `dataDefaultEnd`.

### Decisions already settled — do not re-open

| Decision | Where it is recorded |
| --- | --- |
| The Month Window's offset is intended and is pinned by PNG baselines | [ADR-0001](../../docs/adr/0001-ridership-month-window-is-deliberately-offset.md) |
| The Event Window is inclusive on both ends and genuinely disagrees with the Month Window; the disagreement is preserved, not reconciled | [ADR-0001](../../docs/adr/0001-ridership-month-window-is-deliberately-offset.md) |
| The view returns Chart.js dataset types | [ADR-0002](../../docs/adr/0002-ridership-view-returns-chart-js-dataset-types.md) |
| One domain folder, `src/ridership/`; the rest of `src/` stays flat; `src/ridership/index.ts` is its only public surface | [ADR-0003](../../docs/adr/0003-one-domain-folder-not-a-repo-wide-reorganisation.md) |
| `lineMetrics` returns `null` for an empty series | [ADR-0004](../../docs/adr/0004-line-metrics-are-one-nullable-shape.md) |
| `LineMetrics` does not absorb coverage | [ADR-0004](../../docs/adr/0004-line-metrics-are-one-nullable-shape.md) |
| Derived figures live on a Line Readout, never written back onto a `Line` | [ADR-0005](../../docs/adr/0005-derived-figures-live-on-line-readouts.md) |
| A month is `{year, month}`; `Date` is not used to represent one | [ADR-0006](../../docs/adr/0006-a-month-is-a-year-and-a-month-not-a-date.md) |

**ADR-0001 is not edited by this work, and does not need to be.** It pre-authorised exactly this:

> A `Month` module that unifies the app's several month encodings **may replace the arithmetic**; it
> may not change these boundaries.

ADR-0006 records that the licence was exercised, and carries the derivation. Do not open ADR-0001 to
"update" it.

### Behaviour that must not drift

1. **The Month Window is exclusive on both ends and offset by one month on purpose.** A record at
   calendar-month ordinal `R` is included when `S ≤ R ≤ E − 2`. `e2e/chart-content.spec.ts` renders
   windows through this into committed PNG baselines. **This plan replaces the arithmetic that
   implements the rule. It must not change the rule.** See *The derivation*, below, and step 2's
   boundary tests.
2. **The Event Window stays inclusive on both ends.** After this change the two rules sit adjacent
   in one file, which makes the disagreement easy to "tidy up". Do not.
3. **Legend and dataset order follow the `lines[]` array** — alphabetical by line name, not URL
   order, not numeric id order. Nothing here touches it.
4. **One shared Month Axis for every dataset**, and `spanGaps` stays unset. The axis changes its
   element *type*; it must not change its *contents* or its ordering.
5. **A line with no record for a month contributes nothing to the aggregate, not zero.**
6. **The chart's x-axis labels stay byte-identical `"YYYY M"` strings.** `chartLabel` is the only
   function permitted to produce them. Anything else — including a "nicer" `"YYYY-MM"` — moves every
   PNG baseline.
7. **`LineCoverage.coveredFrom` / `coveredTo` stay `string`, in `"YYYY-MM"`.** They are a rendered
   label, not a month value, and `LineTableRow.tsx:157-165` prints them directly. Converting them to
   `Month` would push this work into components candidate 2 is editing, for no gain.
8. **The URL contract is unchanged.** `?start=2019-12&end=2026-05` parses to the same window and
   serialises back to the same string. Every shared URL keeps working. Round-trip tests in
   `queryParams.test.ts` move to `month.test.ts` and must still pass on the same inputs.

### Testing hazards to know about

- **`vitest.config.ts` registers the real `ridership-data` plugin**, so `virtual:ridership-bounds`
  and the default end of the window track the live `src/data/ridership.json` and move when the
  dataset is refreshed. Any test whose assertion depends on the end of the window must pin `end=`
  explicitly. This bites step 8, which changes `dataDefaultEndDate`'s *type* — a test that silently
  relied on its value will fail for the wrong reason.
- **Shared fixture builders live in `src/test/builders.ts`.** Build on `makeRidershipRecord`,
  `makeConsolidatedRidership`, `makeTransitEvent`, `makeLine`. Do not redeclare a factory. This work
  adds no builder: a `Month` literal is `{year: 2025, month: 9}` and a builder would be longer than
  the value.
- **`e2e/chart-content.spec.ts` drives every window through the URL** (`?start=2019-12&end=2026-05`),
  never through the `<select>`. So the picker's option values are **not** pinned by any baseline —
  changing them from 0-based to 1-based is safe, and it is also completely uncovered end-to-end.
  Step 10 adds the unit coverage that gap deserves; do not assume it already exists.
- **`CustomChartData.time` has no production consumer.** The tooltip reads `items[0].label`
  (`OutputArea.tsx:273`), not `.time`. Every other reference is a test assertion
  (`buildRidershipView.test.ts:328`, `:370`, `chartData.test.ts:86`, `LineTableRow.test.tsx:338`).
  It is free to retype; the tests that assert on it are the only thing that has to move.
- **No e2e run in any slice of this work.** Nothing rendered changes, so the committed Linux
  baselines are the guard rather than something to refresh. **Never run `npm run test:e2e:update` or
  `npm run test:e2e:update:linux` here.** If a baseline diffs, something drifted — find it.
- **Line numbers in this plan cite `origin/main` at `ee34032`** (after candidate 3's #139 deleted
  `src/utils/calc.ts`, and after candidate 2's #137/#138). Citations that a **pending** candidate-2
  slice will move are marked ⚠ inline. Re-read a file before editing it rather than trusting a
  number.

---

## Sequencing against candidate 2 (#129)

Candidate 2 is in flight and edits four of the same files. Its remaining open slices are #132, #133,
#134, #135.

| This plan | Needs | Why |
| --- | --- | --- |
| **G1** (steps 1–3) | **nothing** | Pure add. `src/utils/month.ts` + its test. Nothing imports it. Can land today, in parallel with anything. |
| **G2** (steps 4–7) | **#132** | #132 adds `metrics` and `coverage` to `RidershipView` (`buildRidershipView.ts:41-50`, `:199-204`). G2 retypes the same interface's input and its `months` field. There is no ordering of those two edits that does not conflict. |
| **G3** (steps 8–12) | **#135**, and G2 | #135 rewrites `useUserDashboardInput.ts` wholesale — deleting `updateLinesWithLineMetrics`, `isVisibleLine`, `visibleLines` and the `modes` effect — and retypes `DateRangeSelector`'s consumers. G3 retypes the window state in the same file. |
| **G4** (steps 13–16) | **#133**, and G2 | #133 adds `lineReadouts.ts`, which consumes `LineCoverage` from `chartData.ts`. G4 rewrites `chartData.ts`'s exports. Landing G4 first would force #133 to be written against an interface that does not exist yet. |
| **G5** (steps 17–20) | **#134**, and G4 | #134 retypes `OutputArea`'s `lines` prop. G5 retypes its `months` prop and rewrites the event-marker block. Same file, same PR window. |

**In practice: land G1 now; hold G2–G5 until #135 has merged.** #134 and #135 retype the same
components G3 and G5 retype, and candidate 2 is already mid-flight. The alternative — starting G2 the
moment #132 lands — saves roughly one PR of wall-clock and buys a three-way conflict in
`buildRidershipView.ts` that nobody can review.

G1 is a genuine free win and should not wait: it adds one file and one test, imports nothing, and is
imported by nothing.

---

## The settled interface

### `Month`

```ts
/**
 * A calendar month: a year and a **1-based** month number, and nothing else.
 *
 * 1-based to match every other month in the system — the data (`RidershipRecord.month`),
 * the URL (`?start=2019-12`), and `transit-events.json`. A `RidershipRecord` therefore
 * satisfies this interface structurally, so callers pass records through unchanged; the
 * same pattern `LineSelection` uses in `src/ridership/buildRidershipView.ts`.
 *
 * A month is never a `Date`. See
 * `docs/adr/0006-a-month-is-a-year-and-a-month-not-a-date.md`.
 */
export interface Month {
  year: number;
  /** 1-based: January is 1. */
  month: number;
}
```

### `MonthWindow`

```ts
/**
 * The stretch of months a Ridership View covers, as the user chose it.
 *
 * The two containment rules below read this same pair and **deliberately disagree**
 * about it. That is not a bug; see ADR-0001.
 */
export interface MonthWindow {
  start: Month;
  end: Month;
}
```

### The functions

| Function | Signature | Notes |
| --- | --- | --- |
| `monthOf` | `(year: number, month: number) => Month` | **Total and normalising.** `monthOf(2025, 13)` is `{year: 2026, month: 1}`. Never throws. |
| `ordinal` | `(m: Month) => number` | `m.year * 12 + (m.month - 1)`. Module-private is fine; export it only if a test wants it. |
| `compareMonths` | `(a: Month, b: Month) => number` | `ordinal(a) - ordinal(b)`. Sort comparator. |
| `monthsEqual` | `(a: Month, b: Month) => boolean` | `a.year === b.year && a.month === b.month`. |
| `parseMonth` | `(text: string) => Month \| null` | `"2025-09"` → `{2025, 9}`. `null` on anything malformed. The untrusted edge. |
| `formatMonth` | `(m: Month) => string` | `"2025-09"`, zero-padded. The inverse of `parseMonth`. |
| `displayMonth` | `(m: Month) => string` | `"Sep 2025"`. **The one place a `Date` is constructed**, for `toLocaleString`. |
| `contains` | `(w: MonthWindow, m: Month) => boolean` | The Event Window rule. **Inclusive** on both ends. |
| `containsOffset` | `(w: MonthWindow, m: Month) => boolean` | The Month Window rule. `S ≤ R ≤ E − 2`. See below. |

**Naming.** Neither containment function is named for the app. `month.ts` is not a general calendar
library, but its functions should read as calendar facts with the app-specific one flagged by its
doc comment and its ADR link — not by carrying `Ridership` in its name.

### The derivation — why `containsOffset` is what it is

This is the load-bearing step of the whole plan. Write it into the implementation as a comment, not
just here.

Today (`buildRidershipView.ts:92-99`):

```ts
const metricDate = new Date(record.year, record.month);
if (startDate.getTime() >= metricDate.getTime() ||
    endDate.getTime() <= metricDate.getTime()) continue;
```

The bounds arrive as `new Date(y, m - 1)` (`queryParams.ts:6`). Writing `O(d)` for the calendar-month
ordinal of a `Date`:

```
record:  new Date(r.year, r.month)      → O = r.year*12 + r.month
bounds:  new Date(y, m - 1)             → S = sy*12 + sm - 1,   E = ey*12 + em - 1
filter:  startDate < metricDate < endDate          (strict at both ends)
    ⇒    S  <  r.year*12 + r.month  <  E
```

Let `R = ordinal({year: r.year, month: r.month}) = r.year*12 + (r.month - 1)`, so the record's `Date`
ordinal is `R + 1`. Substituting:

```
    S < R + 1 < E    ⇔    S - 1 < R < E - 1    ⇔    S ≤ R ≤ E - 2
```

Which is ADR-0001's stated rule, exactly. And `ordinal({year: sy, month: sm}) = sy*12 + sm - 1 = S`,
so the bound ordinals are just `ordinal(w.start)` and `ordinal(w.end)`. Therefore:

```ts
export function containsOffset(w: MonthWindow, m: Month): boolean {
  const r = ordinal(m);
  return r >= ordinal(w.start) && r <= ordinal(w.end) - 2;
}
```

**The tests, not the algebra, are what makes this safe.** ADR-0001 says so explicitly, and demands
four cases. Step 2 pins all four plus the inclusive rule's own boundaries.

---

## Implementation

Five slices, landed in order, each independently green and independently revertable. Steps are
numbered globally.

---

## G1 — Add `src/utils/month.ts`

Purely additive. Nothing imports it. Blocked on nothing.

### Step 1 — Create `src/utils/month.ts`

The full module. `ordinal` is exported because `month.test.ts` asserts on it directly and because
step 14 uses it as a `Map` key.

```ts
/**
 * A month, and the two rules for whether one falls inside a Month Window.
 *
 * A month is a year and a 1-based month number — not a `Date`. A `Date` is a
 * timestamp: it carries a day, an hour and a timezone that a month does not have, its
 * month is 0-based where every other month in this system is 1-based, and its two
 * constructors disagree about which month it is (`new Date("2025-09")` is UTC midnight,
 * which is August in Los Angeles). See
 * `docs/adr/0006-a-month-is-a-year-and-a-month-not-a-date.md`.
 */

export interface Month {
  year: number;
  /** 1-based: January is 1, matching the data, the URL and `transit-events.json`. */
  month: number;
}

export interface MonthWindow {
  start: Month;
  end: Month;
}

/**
 * Months since year 0. The single arithmetic form; every comparison goes through it.
 */
export const ordinal = (m: Month): number => m.year * 12 + (m.month - 1);

/**
 * Build a Month, normalising out-of-range month numbers rather than rejecting them:
 * `monthOf(2025, 13)` is January 2026. Total — it never throws, so there is no crash
 * path to guard.
 *
 * It does not make an invalid Month unrepresentable. `{year: 2025, month: 13}` is a
 * legal literal, because `Month` is structural on purpose (a `RidershipRecord` is one).
 * That is an accepted limitation: such a value sorts and compares as January 2026
 * rather than corrupting anything. Untrusted input goes through `parseMonth`, which
 * rejects instead.
 */
export function monthOf(year: number, month: number): Month {
  const o = year * 12 + (month - 1);
  return { year: Math.floor(o / 12), month: (((o % 12) + 12) % 12) + 1 };
}

export const monthsEqual = (a: Month, b: Month): boolean =>
  a.year === b.year && a.month === b.month;

/** Sort comparator. Chronological. */
export const compareMonths = (a: Month, b: Month): number => ordinal(a) - ordinal(b);

/**
 * Parse the canonical text form, `"YYYY-MM"` — the format of the `start`/`end` URL
 * params, of `transit-events.json` dates, and of the coverage labels. `null` for
 * anything malformed; this is the untrusted edge.
 */
export function parseMonth(text: string): Month | null {
  const [yearStr, monthStr] = text.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  if (isNaN(year) || isNaN(month) || month < 1 || month > 12) return null;
  return { year, month };
}

/** The inverse of `parseMonth`: `"2025-09"`, zero-padded. */
export const formatMonth = (m: Month): string =>
  `${m.year}-${String(m.month).padStart(2, '0')}`;

/**
 * For humans: `"Sep 2025"`.
 *
 * The **one** place in the app that constructs a `Date`, because `toLocaleString` needs
 * one. It is local and immediately discarded, so none of `Date`'s hazards escape this
 * function. Do not add a second.
 */
export const displayMonth = (m: Month): string =>
  new Date(m.year, m.month - 1).toLocaleString('en-US', {
    month: 'short',
    year: 'numeric',
  });

/**
 * Is `m` inside the window, **inclusive of both ends**?
 *
 * This is the **Event Window** rule (`CONTEXT.md`). It deliberately disagrees with
 * `containsOffset` below, which applies to the same window. Reconciling them would
 * change which events appear for a given URL — see ADR-0001.
 */
export function contains(w: MonthWindow, m: Month): boolean {
  const r = ordinal(m);
  return r >= ordinal(w.start) && r <= ordinal(w.end);
}

/**
 * Is `m` inside the window under the **Month Window** rule — `S <= R <= E - 2`?
 *
 * The start month is included; the end month **and the month immediately before it**
 * are excluded. This reads like a bug and is not: it is the behaviour the app has
 * always had, users have shared URLs against it, and `e2e/chart-content.spec.ts`
 * renders windows through it into committed PNG baselines. See
 * `docs/adr/0001-ridership-month-window-is-deliberately-offset.md`.
 *
 * Derived from the `Date` comparison it replaces. With bounds built as
 * `new Date(y, m - 1)` and records as `new Date(r.year, r.month)`, the strict
 * comparison `start < record < end` is `S < R + 1 < E`, i.e. `S <= R <= E - 2`. The
 * boundary tests in `month.test.ts`, not this derivation, are what make that safe;
 * ADR-0006 carries the working.
 */
export function containsOffset(w: MonthWindow, m: Month): boolean {
  const r = ordinal(m);
  return r >= ordinal(w.start) && r <= ordinal(w.end) - 2;
}
```

### Step 2 — Create `src/utils/month.test.ts`

The boundary cases ADR-0001 demands are the point of this file. Write them first.

**`containsOffset` — the four ADR-0001 cases**, against `{start: {2020,1}, end: {2020,12}}`:

| Month | In? | Why |
| --- | --- | --- |
| `2020-01` | ✅ | the start month is included |
| `2019-12` | ❌ | one month before the start |
| `2020-10` | ✅ | `E − 2` |
| `2020-11` | ❌ | `E − 1`, excluded |
| `2020-12` | ❌ | the end month, excluded |

Add a year-crossing case (`{start: {2019,11}, end: {2020,2}}` → `2019-11` and `2019-12` in,
`2020-01` and `2020-02` out) so the `*12` term is exercised.

**`contains` — the Event Window rule**, same window: `2020-01` in, `2020-12` in, `2019-12` out,
`2021-01` out. Assert **in the same file, adjacent**, with a comment naming the disagreement — one
`it('disagrees with containsOffset at the end of the window')` that asserts both functions on
`2020-12` and gets opposite answers. That test is the guard against a future tidy-up.

**`parseMonth` / `formatMonth`** — port the existing cases from `src/utils/queryParams.test.ts`
verbatim, including `'zero-pads single-digit months correctly'` (`:15`). Add: round-trip
`formatMonth(parseMonth(s)!) === s` for `'2019-12'`, `'2026-05'`, `'2009-01'`. Reject `'2025-13'`,
`'2025-00'`, `'nonsense'`, `''`.

**`monthOf`** — `(2025, 13)` → `{2026, 1}`; `(2025, 0)` → `{2024, 12}`; `(2025, 9)` unchanged; and a
negative rollover `(2025, -1)` → `{2024, 11}` to pin the `((o % 12) + 12) % 12` guard.

**`displayMonth`** — `{2025, 9}` → `'Sep 2025'`. One case; it is a thin wrapper.

**`compareMonths`** — `[{2025,10},{2025,7},{2024,12}].sort(compareMonths)` orders
`2024-12, 2025-7, 2025-10`. This is the case a lexicographic sort on `"YYYY M"` gets wrong, and it is
why `buildMonthAxis` sorts on an ordinal today (`chartData.ts:33`).

### Step 3 — Verify G1

```bash
npm run lint && npm run test && npm run build
```

```bash
npx vitest run src/utils/month.test.ts
```

```bash
grep -rn "from '.*utils/month'" src/ | grep -v month.test
```

Returns nothing — this slice is imported by nobody.

---

## G2 — `buildRidershipView` takes a `MonthWindow`

**Blocked on #132.** Re-read `buildRidershipView.ts` before editing: #132 adds `metrics` and
`coverage` to `RidershipView` and widens `LineSelection` with `distanceMiles`.

The Month Axis is **not** touched here — it stays `string[]` until G4. This slice is about the
window and the two filters only.

### Step 4 — Replace `startDate` / `endDate` on the input

⚠ `buildRidershipView.ts:28-39` — #132 does not touch this block, but re-verify.

```diff
 export interface RidershipViewInput {
   /** `null` is the loading state — it yields the empty view. */
   records: RidershipRecord[] | null;
   /** Legend and dataset order follow this order. Do not sort inside the module. */
   lines: readonly LineSelection[];
-  startDate: Date;
-  endDate: Date;
+  /** The user's chosen span. The two filters below read it under different rules. */
+  window: MonthWindow;
   dayOfWeek: DayOfWeek;
   includeAggregate: boolean;
   /** Defaults to the bundled `transit-events.json`. */
   events?: readonly TransitEvent[];
 }
```

One field, not two: **Month Window** is one glossary term, and both filters read the pair. Two loose
fields let a caller mix ends from different windows; one object cannot.

### Step 5 — Replace the record filter

⚠ `buildRidershipView.ts:86-99`.

```diff
-  /**
-   * Group raw records by line ID, skipping any outside the selected date window.
-   * new Date(year, month) treats month as 0-based, but the data stores it as
-   * 1-based, so the comparison is effectively off by one month —
-   * preserved from the original implementation.
-   */
+  /**
+   * Group raw records by line ID, skipping any outside the Month Window.
+   *
+   * `containsOffset` is the offset rule, unchanged: the start month is included, the
+   * end month and the month before it are excluded. A `RidershipRecord` satisfies
+   * `Month` structurally, so it is passed straight through. See ADR-0001 and ADR-0006.
+   */
   if (records) {
     for (const record of records) {
-      const metricDate = new Date(record.year, record.month);
-      if (
-        startDate.getTime() >= metricDate.getTime() ||
-        endDate.getTime() <= metricDate.getTime()
-      )
-        continue;
+      if (!containsOffset(window, record)) continue;
```

`record` is passed where a `Month` is expected. That is the structural-satisfaction win: no
conversion, no allocation, no `{year: record.year, month: record.month}` at the call site.

Update the module docstring (`:57-71`) — it currently explains the `Date` arithmetic that no longer
exists. Keep the paragraph about the two windows disagreeing; replace the "copied verbatim" sentence
with a pointer to `containsOffset` and ADR-0006.

### Step 6 — Replace the event filter

⚠ `buildRidershipView.ts:183-197`.

```diff
   const selectedLineIds = new Set(
     lines.filter((l) => l.selected).map((l) => l.id),
   );
-  const startYYYYMM = startDate.getFullYear() * 100 + (startDate.getMonth() + 1);
-  const endYYYYMM = endDate.getFullYear() * 100 + (endDate.getMonth() + 1);
 
   const events = allEvents
     .filter((event) => {
-      const [year, month] = event.date.split('-').map(Number);
-      const eventYYYYMM = year * 100 + month;
-      if (eventYYYYMM < startYYYYMM || eventYYYYMM > endYYYYMM) return false;
+      const eventMonth = parseMonth(event.date);
+      if (!eventMonth || !contains(window, eventMonth)) return false;
       if (event.line_ids.length === 0) return true;
       return event.line_ids.some((id) => selectedLineIds.has(id));
     })
     .sort((a, b) => a.date.localeCompare(b.date));
```

**One behaviour change, and it is a narrowing that cannot fire on real data.** A malformed
`event.date` previously produced `NaN`, every comparison returned `false`, and the event was
**included**. Now `parseMonth` returns `null` and it is **excluded**. `src/data/transit-events.test.ts`
already refuses to let a malformed date ship, so no bundled event can hit this. Note it in the PR
body rather than letting a reviewer find it.

The `.sort((a, b) => a.date.localeCompare(b.date))` stays as-is. It sorts the **event's own
`"YYYY-MM"` string**, which is zero-padded and therefore sorts chronologically. Do not "improve" it
to `compareMonths` — that would mean re-parsing every event inside the comparator for no change in
result.

### Step 7 — Adapt at App's call site, and extend the test

`src/App.tsx` still holds `startDate` / `endDate` as `Date`s from the hook until G3. Convert once, at
the call site:

```ts
window: {
  start: monthOf(startDate.getFullYear(), startDate.getMonth() + 1),
  end: monthOf(endDate.getFullYear(), endDate.getMonth() + 1),
},
```

**This adapter is temporary and step 11 deletes it.** Mark it with a `// TODO(G3)` comment naming
this plan, so a reviewer reads it as scaffolding rather than as the design.

`buildRidershipView.test.ts` — its `build(...)` helper constructs `startDate`/`endDate`. Change the
helper's defaults to a `MonthWindow` and leave every case's assertions untouched. Add:

- the five `containsOffset` boundary cases from step 2, asserted **through `buildRidershipView`**
  this time, on records rather than months — this is what proves the module wiring, not just the
  rule;
- an event exactly on `w.end` is **included** while a record in the same month is **excluded**. One
  test, both windows, the disagreement made concrete at the integration level.

### Step 8 — Verify G2

```bash
npm run lint && npm run test && npm run build
```

```bash
npx vitest run src/ridership/buildRidershipView.test.ts
```

```bash
grep -n "new Date\|getTime()\|YYYYMM" src/ridership/buildRidershipView.ts
```

Returns nothing.

---

## G3 — Month reaches the state, the URL and the picker

**Blocked on #135, and on G2.** #135 deletes `updateLinesWithLineMetrics` (`:171-242` at the time
#135 was written), `isVisibleLine`, `visibleLines` and the `modes` effect from
`useUserDashboardInput.ts`, and drops `JSON.stringify(lines)` from the URL-sync dependency at `:168`.
**Re-read the file.** Every line number below will have moved.

### Step 9 — Move the month text out of `queryParams.ts`

Delete `parseMonthParam` and `formatMonthParam` (`src/utils/queryParams.ts:1-11`). They are
`parseMonth` and `formatMonth` in `src/utils/month.ts`.

**Leave the rest of the file exactly as it is** — `dayOfWeekToParam`, `paramToDayOfWeek`,
`parseModesFromParams`. Those are the URL contract, and the URL contract is **candidate 5**'s
(review doc §5, unscheduled). See *The candidate 4 / candidate 5 boundary*, below.

Move the month cases out of `src/utils/queryParams.test.ts` into `month.test.ts` (already done in
step 2) and delete them from the former.

### Step 10 — Retype the hook's window state

⚠ `useUserDashboardInput.ts:5-6, :22, :25, :28, :61-62, :92-99, :153-154, :312, :314` at `ee34032` —
**all** of these move under #135.

```diff
-const DefaultStartDate: Date = new Date(2020, 6);
-const DefaultEndDate: Date = dataDefaultEndDate;
+const DefaultStart: Month = { year: 2020, month: 7 };
+const DefaultEnd: Month = dataDefaultEnd;
```

Note the **1-based** literal: `new Date(2020, 6)` is July 2020, so the Month is `{2020, 7}`. This is
the single most likely place in the whole plan to introduce an off-by-one. Assert it: a hook test
that renders with no `start` param and expects July 2020.

```diff
-  const [startDate, setStartDate] = useState<Date>(() => {
+  const [startMonth, setStartMonth] = useState<Month>(() => {
     const val = params.get('start');
-    return val ? (parseMonthParam(val) ?? DefaultStartDate) : DefaultStartDate;
+    return val ? (parseMonth(val) ?? DefaultStart) : DefaultStart;
   });
```

…and the same for `end`. In the sync effect:

```diff
-    params.set('start', formatMonthParam(startDate));
-    params.set('end', formatMonthParam(endDate));
+    params.set('start', formatMonth(startMonth));
+    params.set('end', formatMonth(endMonth));
```

Rename through `UserDashboardInputState` (`:25`, `:28`) and the return object (`:312`, `:314`), and
through the effect's dependency array (`:168`). The names lose "Date" per the Terms section.

### Step 11 — Delete the adapter in `App.tsx`

Step 7's `monthOf(...)` conversion goes; App passes `window: {start: startMonth, end: endMonth}`
straight through. If the hook returns them as a pair already, pass that.

### Step 12 — `dataDateRange.ts` returns a Month

⚠ `src/utils/dataDateRange.ts:23`.

```diff
-export const dataDefaultEndDate: Date = new Date(maxYear, maxMonth + 1);
+export const dataDefaultEnd: Month = monthOf(maxYear, maxMonth + 2);
```

**Check this arithmetic against the plugin, not against intuition.** `maxMonth` comes from
`virtual:ridership-bounds`; confirm whether it is 0- or 1-based before writing `+ 2`. The old
expression is `new Date(maxYear, maxMonth + 1)`, whose 1-based month is `maxMonth + 2`, so `+ 2` is
right **iff** `maxMonth` is what the old line assumed. Read `vite/ridership-data-plugin.ts` and
verify. `monthOf` normalises the December case (`maxMonth + 2 = 13` → next January) that the old
`Date` constructor also handled.

Rewrite its docstring: the "App.tsx filters with `new Date(record.year, record.month)`" paragraph is
already stale (candidate 1 moved that filter) and after G2 the filter is `containsOffset`. State the
rule it is actually compensating for: the default end sits **two** months past the latest record
because `containsOffset` excludes `E` and `E − 1`, and the latest record must still be included.

> **Verify this against the data before and after.** With the old code the default window's last
> included month was the latest record. Assert the same after: build a `MonthWindow` from
> `dataDefaultEnd` and check `containsOffset` accepts `{maxYear, maxMonth+1}` — whatever the latest
> record's 1-based month is. If it does not, the window silently narrowed by a month and every
> default view lost its newest data point. This is the highest-risk step in the plan.

### Step 13 — `DateRangeSelector` speaks Month

⚠ `src/components/DateRangeSelector.tsx:12-24`, `:38-78`, `:80-133`. #135 touches this component's
call site; re-read.

Props become `start: Month` / `end: Month` plus their setters. `getDateSetter`, `updateMonth` and
`updateYear` stop cloning and mutating a `Date`:

```diff
   const updateMonth = (title: IntervalEndpoint, newMonth: string) => {
-    const setDate = getDateSetter(title);
-    setDate((prevDate: Date) => {
-      const newDate: Date = new Date(prevDate);
-      newDate.setMonth(Number(newMonth));
-      return newDate;
-    });
+    getSetter(title)((prev) => ({ ...prev, month: Number(newMonth) }));
   };
```

**The `<option value>`s become 1-based** (`:100-111`): `<option value="1">January</option>` through
`<option value="12">December</option>`, and `value={range.getMonth()}` becomes `value={range.month}`.

The **rendered text does not change** — the labels are still "January" … "December" — so
`visual.spec.ts` is unaffected. And `chart-content.spec.ts` drives windows through the URL, never
through this `<select>`, so no baseline covers the option values either way. That cuts both ways:
this change is safe *and* completely uncovered end-to-end.

Add `src/components/DateRangeSelector.test.tsx` if none exists: selecting "September" in the start
picker yields `{year: <unchanged>, month: 9}`, and selecting a year leaves `month` alone. That is the
regression this step's off-by-one would produce, and nothing currently catches it.

### Step 14 — Verify G3

```bash
npm run lint && npm run test && npm run build
```

```bash
grep -rn "parseMonthParam\|formatMonthParam\|dataDefaultEndDate\|startDate\|endDate" src/
```

Returns nothing.

```bash
grep -rn "new Date" src/ --include=*.ts --include=*.tsx | grep -v "\.test\."
```

Returns exactly one line: `displayMonth` in `src/utils/month.ts`. **Not zero** — `toLocaleString`
needs a real `Date`. Any other hit is a site that was missed.

---

## G4 — The Month Axis carries Months

**Blocked on #133, and on G2.** #133 adds `src/ridership/lineReadouts.ts`, which consumes
`LineCoverage` from `chartData.ts`.

### Step 15 — `timeKey` and `formatMonthKey` become `chartLabel`

⚠ `src/ridership/chartData.ts:8-22`.

```diff
-export const timeKey = (year: number, month: number): string =>
-  `${year} ${month}`;
-
-export const formatMonthKey = (key: string): string => {
-  const [year, month] = key.split(' ');
-  return `${year}-${month.padStart(2, '0')}`;
-};
+/**
+ * A Month as a Chart.js category label: `"2025 9"`.
+ *
+ * The **only** function permitted to produce this string. It is not a general month
+ * format — it is this chart's axis format, unpadded and space-separated, and
+ * `e2e/chart-content.spec.ts` renders it into committed PNG baselines. For a month as
+ * text anywhere else, use `formatMonth` (`"2025-09"`) or `displayMonth` (`"Sep 2025"`)
+ * from `src/utils/month.ts`.
+ */
+export const chartLabel = (m: Month): string => `${m.year} ${m.month}`;
```

`chartLabel` stays in `src/ridership/chartData.ts` rather than moving to `month.ts`: the axis label
format belongs to the chart, and `month.ts` is a leaf value module that should not know one exists.

`formatMonthKey` is **deleted, not moved.** Its only two callers are `buildCoverageByLine`
(`:128-129`), which now has a `Month` in hand and calls `formatMonth` directly. That deletion is the
plan's thesis in one line: the converter disappears because there is nothing left to convert between.

### Step 16 — The axis functions return and take `Month[]`

⚠ `chartData.ts:35-48`, `:55-66`, `:83-89`.

`buildMonthAxis(series: RidershipRecord[][]): Month[]` — the dedupe `Map` is keyed on `ordinal(r)`
and the sort is `compareMonths`. The comment at `:32-33` explaining why it sorts on an ordinal
instead of the label can go: with `Month[]` there is no label to be tempted by.

`alignToMonthAxis(records, months: Month[], dayOfWeek)` — its internal `Map` is keyed on
`ordinal(...)` instead of `timeKey(...)`. Its `?? null` stays exactly as it is, comment included: a
legitimate `0` must survive.

`buildWindowMonthAxis` returns `Month[]` by construction.

`buildAggregateSeries(alignedData, months: Month[])` — unchanged except the parameter type. Its
index-based summing is untouched.

`CustomChartData.time` becomes `Month` (`src/@types/chart.types.ts:5`). Safe: it has no production
consumer. The four test assertions on `.time` move from string to object comparison.

**`LineCoverage.coveredFrom` / `coveredTo` stay `string`.** They are rendered directly by
`LineTableRow.tsx:157-165`; they are a label, not a month value. `buildCoverageByLine` builds them
with `formatMonth(months[0])` and `formatMonth(months.at(-1)!)`. Its `isPartialCoverage` comparison
switches from `first !== windowMonths[0]` to `!monthsEqual(...)` — **this is required**, not
cosmetic: `Month` objects are compared by identity under `!==` and every one of them is freshly
built, so leaving `!==` marks every single line partial.

> That last point is the most dangerous line in G4. `!==` on two `Month` objects compiles, type-checks
> and is always `true`. `buildCoverageByLine`'s tests must include a line that covers the **full**
> window and assert `isPartialCoverage === false`.

### Step 17 — Verify G4

```bash
npm run lint && npm run test && npm run build
```

```bash
npx vitest run src/ridership/chartData.test.ts src/ridership/buildRidershipView.test.ts
```

```bash
grep -rn "timeKey\|formatMonthKey" src/
```

Returns nothing.

---

## G5 — `OutputArea` matches events by value

**Blocked on #134, and on G4.** #134 retypes `OutputArea`'s `lines` prop from `Line` to
`LineReadout`. Re-read the file.

### Step 18 — The `months` prop becomes `Month[]`

⚠ `src/components/OutputArea.tsx:25`, `:246`, `:357`.

```diff
-  months: string[];
+  months: Month[];
```

At the Chart.js call site (`:357`): `labels: months.map(chartLabel)`, importing `chartLabel` from
`../ridership` — a legal crossing of ADR-0003's seam, since `index.ts` is the folder's public
surface. Add it to that index's export list alongside `alignToMonthAxis` and `buildWindowMonthAxis`.

### Step 19 — The event markers stop matching strings

⚠ `OutputArea.tsx:181-193`. This is the bug the whole candidate exists for.

```diff
     events.forEach((event) => {
-      // Chart labels are "YYYY M" (e.g. "2023 2"); event dates are "YYYY-MM"
-      const label = `${event.date.slice(0, 4)} ${parseInt(event.date.slice(5), 10)}`;
-      const idx = labels.indexOf(label);
-      if (idx === -1) return;
+      const eventMonth = parseMonth(event.date);
+      if (!eventMonth) return;
+      const idx = months.findIndex((m) => monthsEqual(m, eventMonth));
+      if (idx === -1) return;
```

The plugin reads `chart.data.labels` today (`:172`). It needs the `Month[]` instead. Pass it through
the plugin's own options object, beside `events` — the same route `eventMarkers.events` already
takes (`:159-161`, `:281`), extended to `{events, months}`. `PluginOptionsByType` is augmented in
`src/@types/chart.types.ts:10-16`; widen it there.

Do **not** reach for `labels.indexOf(chartLabel(eventMonth))`. It would work, and it would leave the
string round trip — and with it the exact failure mode being removed — intact.

### Step 20 — `formatMonthLabel` and `formatEventDate` collapse

⚠ `OutputArea.tsx:224-240`.

Both are `new Date(y, m-1).toLocaleString('en-US', {month:'short', year:'numeric'})` written twice.
Both become `displayMonth`:

- `formatEventDate(event.date)` → `displayMonth(parseMonth(event.date) ?? …)`. It renders the
  context-log entries; guard the `null` by falling back to the raw string, as
  `formatMonthLabel` already does at `:235`.
- `formatMonthLabel(label)` → `displayMonth(month)`, called from the tooltip callback at `:273`.
  ⚠ That callback currently reads `items[0].label` — a Chart.js-provided string. Switch it to index
  into `months` via `items[0].dataIndex`, which is the same value without a parse.

**The rendered tooltip text must not change.** `"May 2026"` before, `"May 2026"` after —
`OutputArea.test.tsx:363` pins it.

### Step 21 — Verify G5, and sweep

```bash
npm run lint && npm run test && npm run build
```

```bash
npx vitest run src/components/OutputArea.test.tsx
```

```bash
grep -rn "YYYY M\|slice(0, 4)\|split(' ')" src/ --include=*.ts --include=*.tsx
```

Returns only `chartLabel`'s doc comment in `src/ridership/chartData.ts`.

```bash
grep -rn "new Date" src/ --include=*.ts --include=*.tsx | grep -v "\.test\."
```

Returns exactly one line — `displayMonth`.

---

## The candidate 4 / candidate 5 boundary

`src/utils/queryParams.ts` is also **candidate 5**'s territory (review doc §5 — the URL contract
behind one interface; unscheduled, no letters assigned). This work takes part of that file. The line:

> **Candidate 4 owns what a month *is* in text. Candidate 5 owns which params exist, what they are
> called, their defaults, and the round trip.**

`"2025-09" ↔ {year: 2025, month: 9}` is month knowledge. `the param is spelled "start"` is URL
knowledge.

The reason that line sits where it does: **`"YYYY-MM"` is not the URL's format.** The same string is
the format of `transit-events.json` (`events.types.ts:13`), of `LineCoverage.coveredFrom`/`coveredTo`
(`chartData.ts:92-95`), and of the coverage badge. Three consumers, none of them the URL. A module
named for the URL is the wrong owner of it — that is the same mistake `formatMonthKey` made, at a
different scale.

| | Candidate 4 (this plan) | Candidate 5 (later) |
| --- | --- | --- |
| `src/utils/month.ts` | **adds** `parseMonth` / `formatMonth` — named for the format, not for the URL | untouched |
| `queryParams.ts` month functions | **deleted**; callers use `month.ts` | — |
| `queryParams.ts` `dayOfWeekToParam`, `paramToDayOfWeek`, `parseModesFromParams` | **untouched** | folded into `dashboardParams` |
| the hook's `useState` initialisers + sync effect | **only** the two month ones change type | restructured wholesale |
| param names (`start`, `end`, `day`, `buses`, `trains`, `lines`, `q`, `aggregate`) | never mentioned | owned |
| `read(search)` / `write(input)` | never proposed | owned |

**Candidate 5 gets easier, not pre-empted.** Its `read`/`write` will call two ready-made month
functions instead of carrying date parsing itself. Nothing it owns is decided early.

---

## Files to Modify

| File | Slice | Change |
| --- | --- | --- |
| `src/utils/month.ts` | G1 | **new** |
| `src/utils/month.test.ts` | G1 | **new** |
| `src/ridership/buildRidershipView.ts` | G2 | input takes `window: MonthWindow`; both filters |
| `src/ridership/buildRidershipView.test.ts` | G2, G4 | window fixtures; boundary cases; `.time` assertions |
| `src/App.tsx` | G2, G3 | adapter added, then deleted |
| `src/utils/queryParams.ts` | G3 | two functions deleted |
| `src/utils/queryParams.test.ts` | G3 | month cases removed |
| `src/hooks/useUserDashboardInput.ts` | G3 | window state retyped |
| `src/hooks/useUserDashboardInput.test.ts` | G3 | window fixtures |
| `src/utils/dataDateRange.ts` | G3 | `dataDefaultEndDate` → `dataDefaultEnd: Month` |
| `src/components/DateRangeSelector.tsx` | G3 | props, setters, 1-based `<option value>` |
| `src/components/DateRangeSelector.test.tsx` | G3 | **new** (if absent) |
| `src/ridership/chartData.ts` | G4 | `chartLabel`; axis carries `Month`; `formatMonthKey` deleted |
| `src/ridership/chartData.test.ts` | G4 | axis assertions |
| `src/@types/chart.types.ts` | G4, G5 | `CustomChartData.time: Month`; plugin options gain `months` |
| `src/ridership/index.ts` | G5 | export `chartLabel` |
| `src/components/OutputArea.tsx` | G5 | `months: Month[]`; markers; label collapse |
| `src/components/OutputArea.test.tsx` | G5 | `months` fixtures |
| `src/components/LineTableRow.test.tsx` | G4 | one `.time` assertion |
| `CONTEXT.md` | G1 | **Month** added |
| `docs/adr/0006-…` | G1 | **new** |

Not touched: `src/utils/lines.ts`, `src/ridership/lineMetrics.ts`, `src/components/SummaryData.tsx`,
`src/utils/mapPopup.ts`, `scripts/**`, `e2e/**`.

## Verification

Each slice:

```bash
npm run lint && npm run test && npm run build
```

No e2e run in any of the five. Nothing rendered changes, so the committed Linux baselines are the
guard rather than something to refresh. **Never run `npm run test:e2e:update` or
`npm run test:e2e:update:linux` in this work.** If a baseline diffs, the offset rule or the axis
drifted — stop and find out where.

---

## Defaults taken where the design session had no explicit answer

Flagged so a reviewer can overrule rather than discover:

- **The module is `src/utils/month.ts`, not `src/ridership/month.ts`.** Every arrow then points one
  way: `ridership/` → `utils/month`, `components/` → `utils/month`, `utils/queryParams` →
  `utils/month`. The alternative creates a folder-level cycle (`buildRidershipView.ts:7` already
  imports `../utils/lines`) and would drag `transit-events.json` into the import graph of anything
  that parses a URL param. `src/utils/lines.ts` is the precedent: unambiguously domain knowledge,
  living flat, imported by `src/ridership/`. **This is not a second domain folder and does not
  reopen ADR-0003.**
- **`Month` is 1-based.** Matching the data, the URL and the events file — three of four boundaries.
  `Date` is the only 0-based thing in the system and it is leaving.
- **`Month` is a plain structural interface, not branded and not a class.** A `RidershipRecord` is
  therefore a `Month`, which is why step 5 passes records straight into `containsOffset`. The cost —
  `{year: 2025, month: 13}` type-checks — is accepted and stated in the module doc comment. Branding
  would buy compile-time rejection at the price of that structural fit, and `as Month` would still
  escape it.
- **`monthOf` normalises rather than throwing.** Nothing in the module throws, so there is no crash
  path to guard in an app with no error boundary. (**An error boundary is a real gap and is
  genuinely out of scope here** — it is not a month problem.)
- **Both containment rules live in `month.ts`, adjacent**, with neutral names (`contains` /
  `containsOffset`). The alternative — leaving the offset rule in `buildRidershipView` — keeps the
  weird rule roughly where it started and keeps the disagreement invisible. Adjacency plus the
  explicit disagreement test is the point.
- **`chartLabel` stays in `src/ridership/chartData.ts`.** The axis format belongs to the chart, and
  `month.ts` should not know a chart exists. It is reached from `OutputArea` through
  `src/ridership/index.ts`, which is a legal seam crossing.
- **`LineCoverage.coveredFrom` / `coveredTo` stay `string`.** Rendered labels, not month values, and
  keeping them as strings keeps this work out of components candidate 2 is editing.
- **`MonthWindow` is one field on `RidershipViewInput`, not two.** Month Window is one glossary term
  and both filters read the pair.
- **Names drop "Date"** — `startDate` → `startMonth`, `dataDefaultEndDate` → `dataDefaultEnd`,
  `parseMonthParam` → `parseMonth`. The glossary outranks the source, and the term is Month.
- **G1 lands immediately; G2–G5 wait for #135.** Interleaving off #132 saves about one PR of
  wall-clock and buys a three-way conflict in files candidate 2 is mid-edit on.
- **Line numbers cite `origin/main` at `ee34032`.** Citations a pending candidate-2 slice will move
  are marked ⚠.
- **No `Month` builder is added to `src/test/builders.ts`.** `{year: 2025, month: 9}` is shorter than
  any call that would build it.
