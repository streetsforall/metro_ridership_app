# Plan: Collapse `calc.ts` into one Line Metrics interface

## Context

`src/utils/calc.ts` is 77 lines exporting five functions — `calcAvg`, `calcAbsChange`, `calcStart`,
`calcEnd`, `calcRidersPerMile` — that always fire together, from exactly one production caller:
`updateLinesWithLineMetrics` in `src/hooks/useUserDashboardInput.ts` (L211–232). The module is
shallow: its interface is nearly as complex as its implementation.

Three costs follow from that shape:

1. **Three redundant sorts.** `calcAbsChange`, `calcStart` and `calcEnd` each call
   `sortChronologically`, which copies the array before sorting. One line's metrics therefore
   trigger three copy-and-sorts of the same records, per line, per render
   (`useUserDashboardInput.ts:215`, `:220`, `:225`).
2. **A rule the caller has to know.** `if (updatedLine.distanceMiles)` at `:230-232` is the
   missing-distance rule, living in the caller because `calcRidersPerMile` would return `Infinity`
   or `NaN` if it were not.
3. **Five loose `number`s.** The figures travel as five separate assignments onto `Line` with no
   name for the group they form — which is precisely the shape candidate 2 needs to *return*
   rather than write back into state.

This plan replaces all five with one function, `lineMetrics(input) → LineMetrics | null`, living at
`src/ridership/lineMetrics.ts`. `src/utils/calc.ts` is deleted.

This is candidate 3 of `docs/architecture-review-2026-08-05.md`. **PR #93 (`249de8f`) already did
the bug-fix half** — `sortChronologically` copies before sorting, the empty-array guards are in, and
issue #88 is closed by the *label, don't redefine* policy whose implementation lives in
`src/ridership/chartData.ts` (`buildCoverageByLine`), **not** in `calc.ts`. What remains, and all
that this plan covers, is the depth half: five exports → one.

### Terms

Defined in [`CONTEXT.md`](../../CONTEXT.md) and used exactly: **Line Metrics** (new, added by this
work), **Ridership Record**, **Day Of Week**, **Line**, **Month Window**, **Consolidated
Ridership**, **Ridership View**.

`CONTEXT.md`'s glossary outranks both the source and this plan — that precedence rule
(`CONTEXT.md:8-9`) is what settled issue #114. **Line Metrics** is therefore the name, and the type
is `LineMetrics`. The word `calc` is on that entry's `_Avoid_` list and does not survive this work
in any identifier.

### Decisions already settled — do not re-open

| Decision | Where it is recorded |
| --- | --- |
| Metrics are estimated from each line's own first and last record, not the Month Window's endpoints; the UI *labels* the difference rather than redefining the metric | PR #93 / issue #88 · restated in [ADR-0004](../../docs/adr/0004-line-metrics-are-one-nullable-shape.md) |
| Coverage labelling (`coveredFrom` / `coveredTo` / `isPartialCoverage`) lives in `src/ridership/chartData.ts`, not in the metrics module | PR #93 |
| `sortChronologically` copies before sorting, because the array handed in is the live `ridershipRecords` that also backs the row sparklines and the CSV export | PR #93 |
| `isVisibleLine` uses explicit `!== undefined` presence checks, because `changeInRidership` is legitimately exactly `0` for a single-record line | PR #93 |
| One domain folder, `src/ridership/`; the rest of `src/utils/` stays flat — and ADR-0003 names *this* work as one of the two pieces expected to move a file into it | [ADR-0003](../../docs/adr/0003-one-domain-folder-not-a-repo-wide-reorganisation.md) |
| The Month Window's offset is intended | [ADR-0001](../../docs/adr/0001-ridership-month-window-is-deliberately-offset.md) |
| The view returns Chart.js dataset types | [ADR-0002](../../docs/adr/0002-ridership-view-returns-chart-js-dataset-types.md) |
| `lineMetrics` returns `null` for an empty series, and `LineMetrics` does **not** absorb the coverage fields | [ADR-0004](../../docs/adr/0004-line-metrics-are-one-nullable-shape.md) |

### Behaviour that must not drift

1. **Every displayed figure is byte-identical.** This is a depth refactor. `averageRidership`,
   `changeInRidership`, `startingRidership`, `endingRidership` and `ridersPerMile` must come out of
   `lineMetrics` with the values the five `calc` functions produce today, for every input.
2. **`null` ridership counts as `0`, it is not skipped.** `calcAvg` divides by `metrics.length`,
   not by the count of non-null figures (`calc.ts:10-15`), and both endpoints use `?? 0`. An
   all-null series averages `0`, not `NaN`. Preserve this exactly.
3. **The input array is never mutated.** `sortChronologically` copies. The array handed in is the
   live `ridershipRecords` inside Consolidated Ridership, which also feeds the row sparklines and
   the CSV export.
4. **Ordering is by year then month**, not by array position and not by a string key.
5. **A falsy `distanceMiles` yields no `ridersPerMile`.** `0` and `undefined` both mean *no
   figure*, never `Infinity` and never `NaN`. This preserves `useUserDashboardInput.ts:230`
   verbatim.
6. **A line with no Line Metrics is hidden from the table, not shown with zeroes.** Today that
   happens because the fields are cleared to `undefined` and `isVisibleLine` checks presence. After
   this change it happens the same way, via the `null` return.
7. Per ADR-0001, pinned by `e2e/chart-content.spec.ts` PNG baselines: the Month Window is exclusive
   on both ends and offset by one month on purpose; the legend follows the alphabetical `lines[]`
   array; one shared Month Axis with `spanGaps` unset; a line with no record for a month
   contributes nothing to the aggregate, not zero. **Nothing in this plan touches any of that** —
   it is listed so that a baseline diff is read as a stop signal, not as something to regenerate.

### Testing hazards to know about

- **`calc.test.ts` declares its own local `makeRecord`.** `src/test/builders.ts` now exists and
  exports `makeRidershipRecord`. Build the new suite on the shared builder; do not port the local
  factory across. Note the builder's positional convention differs — it takes a single
  `Partial<RidershipRecord>`, not `(year, month, wkday, sat, sun)`.
- **An empty series is unreachable in production.** `buildRidershipView.ts:101-111` creates a
  line's group only at the moment it pushes a record, so `ridershipRecords` always has length ≥ 1.
  The `null` return and the empty-series tests are a defensive contract, not a live path. That is
  *why* it is safe to change the empty-series return value at all — see ADR-0004.
- **Do not run `npm run test:e2e:update`.** Neither slice changes rendered output. If a baseline
  diffs, the refactor changed behaviour; find it.
- `vitest` resolves `virtual:ridership-bounds` from the real `src/data/ridership.json`. The new
  tests are pure and pass explicit records, so they are immune — but do not reach for
  `dataDefaultEndDate` in them.

---

## The settled interface

```ts
// src/ridership/lineMetrics.ts

export interface LineMetricsInput {
  /** One Line's Ridership Records, in any order. Never mutated. */
  records: readonly RidershipRecord[];
  /** Which of the three reported figures to read. */
  dayOfWeek: DayOfWeek;
  /**
   * The line's one-way route length. Falsy — `0` or absent — yields no `ridersPerMile`,
   * which is the rule this module absorbs from its caller.
   */
  distanceMiles?: number;
}

export interface LineMetrics {
  averageRidership: number;
  changeInRidership: number;
  startingRidership: number;
  endingRidership: number;
  /**
   * `undefined` when `distanceMiles` is falsy. Declared `| undefined` rather than `?:`
   * deliberately: the key is *always written*, so spreading `LineMetrics` onto a `Line`
   * clears a previous window's figure instead of silently preserving it.
   */
  ridersPerMile: number | undefined;
}

/**
 * The five summary figures one Line's records yield for one Day Of Week.
 *
 * Returns `null` for an empty series: no records means no metrics, not zeroes. One gate
 * for the caller instead of five sentinel values.
 */
export function lineMetrics(input: LineMetricsInput): LineMetrics | null;
```

Exported from `src/ridership/index.ts`. `sortChronologically` stays module-private.

Why an options object rather than `(records, dayOfWeek, distanceMiles?)`: matches
`buildRidershipView`'s house style, and adding a fourth input later is non-breaking. This was
Michael's call in the design session, over a positional recommendation.

Why `null` rather than the current `NaN`/`0` sentinels: the caller already has a branch for *this
line has nothing* (`useUserDashboardInput.ts:195-209`, which clears all eight derived fields). An
empty series funnels into that same branch, so `averageRidership` becomes `undefined` and
`isVisibleLine`'s `!== undefined` check hides the row exactly as the `NaN` check did today.
Observable behaviour is unchanged; the sentinel stops crossing the seam.

---

## Implementation

Two PRs, landed in order. Each is independently green and independently revertable.

---

## PR 1 — Add `src/ridership/lineMetrics.ts` and its test

Purely additive. `src/utils/calc.ts` is untouched and still the live implementation; the new module
is green but unused. **Any red in this PR means the new module is wrong** — which is exactly the
signal we want isolated from PR 2.

### Step 1 — Create `src/ridership/lineMetrics.ts`

The body is `calc.ts` L9–75, merged into one pass with the three sorts collapsed to one. Nothing is
reworded; the arithmetic is lifted verbatim.

```ts
import type { DayOfWeek, RidershipRecord } from '../@types/metrics.types';

/**
 * Chronological copy of a line's records.
 *
 * Copies before sorting: the array handed in is the live `ridershipRecords` array
 * inside Consolidated Ridership, which also feeds the row sparklines and the CSV
 * export — sorting it in place reorders data other callers are reading. See PR #93,
 * which is where that bug was fixed.
 */
function sortChronologically(
  records: readonly RidershipRecord[],
): RidershipRecord[] {
  return [...records].sort((a, b) => {
    if (a.year === b.year) {
      return a.month - b.month;
    } else {
      return a.year - b.year;
    }
  });
}

export interface LineMetricsInput {
  records: readonly RidershipRecord[];
  dayOfWeek: DayOfWeek;
  distanceMiles?: number;
}

export interface LineMetrics {
  averageRidership: number;
  changeInRidership: number;
  startingRidership: number;
  endingRidership: number;
  ridersPerMile: number | undefined;
}

/**
 * The Line Metrics one line's Ridership Records yield for one Day Of Week.
 *
 * Sorts once, on a copy, and reads both endpoints off the same array — the five
 * functions this replaced sorted three times for one line's figures.
 *
 * These figures describe the span the line itself covers, which is not necessarily the
 * Month Window: a line whose data starts mid-window reports its own first and last
 * record, not the window's endpoints. That is deliberate — see `buildCoverageByLine`
 * in `./chartData`, which labels the difference in the UI rather than redefining the
 * metric, and `docs/adr/0004-line-metrics-are-one-nullable-shape.md`.
 *
 * Returns `null` for an empty series. No records means no metrics, not zeroes.
 */
export function lineMetrics({
  records,
  dayOfWeek,
  distanceMiles,
}: LineMetricsInput): LineMetrics | null {
  if (records.length === 0) return null;

  const sorted = sortChronologically(records);
  const first = sorted[0];
  const last = sorted[sorted.length - 1];

  // Divides by the record count, not by the count of non-null figures: a null month
  // counts as 0 ridership rather than being excluded. Lifted from `calcAvg`.
  const sum = sorted.reduce((prev, curr) => prev + (curr[dayOfWeek] ?? 0), 0);
  const averageRidership = sum / sorted.length;

  const startingRidership = first[dayOfWeek] ?? 0;
  const endingRidership = last[dayOfWeek] ?? 0;

  return {
    averageRidership,
    changeInRidership: endingRidership - startingRidership,
    startingRidership,
    endingRidership,
    // The missing-distance rule, absorbed from the caller. A falsy distance means no
    // figure — never Infinity, never NaN.
    ridersPerMile: distanceMiles
      ? averageRidership / distanceMiles
      : undefined,
  };
}
```

Two lifts worth checking line by line against the original:

- `changeInRidership` is `calc.ts:53` — `(last[dayOfWeek] ?? 0) - (first[dayOfWeek] ?? 0)`. Here it
  reuses `endingRidership` and `startingRidership`, which are the same two expressions
  (`calc.ts:62`, `calc.ts:70`). Identical result, one fewer null-coalesce.
- The average is `calc.ts:10-15` unchanged, except that it reduces over `sorted` rather than the
  input. Sorting does not change a sum.

### Step 2 — Export it from the index

```diff
 export {
   buildRidershipView,
   type RidershipView,
   type RidershipViewInput,
   type LineSelection,
 } from './buildRidershipView';
+
+/**
+ * The per-line summary figures the line table and the summary panel read.
+ * Replaces the five exports of the former `src/utils/calc.ts`.
+ */
+export {
+  lineMetrics,
+  type LineMetrics,
+  type LineMetricsInput,
+} from './lineMetrics';
```

Leave the existing `chartData` re-export block exactly as it is.

### Step 3 — Create `src/ridership/lineMetrics.test.ts`

Every behavioural case in `src/utils/calc.test.ts` is ported 1:1 and retargeted at the one
function, rebuilt on the shared builder. Do **not** port `calc.test.ts`'s local `makeRecord`.

```ts
import { describe, it, expect } from 'vitest';
import { lineMetrics } from './lineMetrics';
import { makeRidershipRecord } from '../test/builders';

const at = (
  year: number,
  month: number,
  wkday: number | null,
  sat: number | null = null,
  sun: number | null = null,
) =>
  makeRidershipRecord({
    year,
    month,
    est_wkday_ridership: wkday,
    est_sat_ridership: sat,
    est_sun_ridership: sun,
  });

// Unsorted on purpose: March, January, June.
const records = [at(2022, 3, 1000, 500, 300), at(2022, 1, 2000, 800, 400), at(2022, 6, 3000, 1200, 600)];

const metricsFor = (
  input: Parameters<typeof lineMetrics>[0],
) => {
  const result = lineMetrics(input);
  if (!result) throw new Error('expected metrics');
  return result;
};
```

The case list, mapped from the file it replaces:

| `calc.test.ts` block | Disposition |
| --- | --- |
| `calcAvg` (6 cases) | **Port all 6** onto `averageRidership`: weekday average `2000`; Saturday `≈833.33`; Sunday `≈433.33`; a null figure counts as `0` so `[null, 3000]` averages `1500`; a single record averages itself; an all-null series averages `0`. |
| `calcAbsChange` (6 cases) | **Port all 6** onto `changeInRidership`: last minus first *after sorting* (`1000`); a decline is negative (`-3000`); a single record is exactly `0`; sorts across years; a null endpoint counts as `0`; Saturday reads the Saturday field (`400`). |
| `calcStart` | **Port all** onto `startingRidership`, including the null-first-value case. |
| `calcEnd` (5 cases) | **Port all 5** onto `endingRidership`, including the null-last-value case and the later-year-wins case. |
| `calcRidersPerMile` | **Port**, plus the two new cases below. |
| `empty series` (3 cases) | **Collapse into one**: `lineMetrics({ records: [], ... })` is `null`. The three per-function guards no longer have three functions to guard. |
| `input is not mutated` | **Port verbatim.** This is PR #93's guarantee and the reason `sortChronologically` copies. |

New cases this interface requires:

```ts
describe('an empty series', () => {
  // No records means no metrics, not zeroes. The caller's existing
  // "this line has nothing" branch handles null — see ADR-0004.
  it('returns null', () => {
    expect(lineMetrics({ records: [], dayOfWeek: 'est_wkday_ridership' })).toBeNull();
  });
});

describe('ridersPerMile', () => {
  it('divides the average by the distance', () => {
    const m = metricsFor({ records, dayOfWeek: 'est_wkday_ridership', distanceMiles: 10 });
    expect(m.ridersPerMile).toBe(200);
  });

  // Preserves `if (updatedLine.distanceMiles)` from the former call site: a falsy
  // distance means no figure, never Infinity and never NaN.
  it('is undefined when the distance is absent', () => {
    const m = metricsFor({ records, dayOfWeek: 'est_wkday_ridership' });
    expect(m.ridersPerMile).toBeUndefined();
  });

  it('is undefined when the distance is 0', () => {
    const m = metricsFor({ records, dayOfWeek: 'est_wkday_ridership', distanceMiles: 0 });
    expect(m.ridersPerMile).toBeUndefined();
  });

  // Always written, never omitted, so spreading onto a Line clears a stale figure.
  it('is present as a key even when undefined', () => {
    const m = metricsFor({ records, dayOfWeek: 'est_wkday_ridership' });
    expect('ridersPerMile' in m).toBe(true);
  });
});

describe('one call, all five figures', () => {
  it('returns every figure from a single call', () => {
    const m = metricsFor({ records, dayOfWeek: 'est_wkday_ridership', distanceMiles: 10 });
    expect(m).toEqual({
      averageRidership: 2000,
      changeInRidership: 1000,
      startingRidership: 2000,
      endingRidership: 3000,
      ridersPerMile: 200,
    });
  });
});
```

### Step 4 — Verify PR 1

```bash
npm run lint && npm run test && npm run build
```

`src/utils/calc.ts` and `calc.test.ts` are unchanged and still passing. No e2e run — nothing
rendered changes.

---

## PR 2 — Wire the hook and delete `calc.ts`

Nothing new is written here. The diff is the call site shrinking and the old module leaving.
**Any red in this PR is behaviour drift** — that is the whole reason it is its own PR.

### Step 5 — Replace the call site

`src/hooks/useUserDashboardInput.ts` L211–232 becomes:

```ts
const metrics = lineMetrics({
  records: consolidatedRecord.ridershipRecords,
  dayOfWeek,
  distanceMiles: updatedLine.distanceMiles,
});

const coverage = coverageByLine[updatedLine.id];

return {
  ...updatedLine,
  ...(metrics ?? {
    averageRidership: undefined,
    changeInRidership: undefined,
    startingRidership: undefined,
    endingRidership: undefined,
    ridersPerMile: undefined,
  }),
  coveredFrom: coverage?.coveredFrom,
  coveredTo: coverage?.coveredTo,
  isPartialCoverage: coverage?.isPartialCoverage,
};
```

Notes on that block, each of which a reviewer should be able to check without re-deriving anything:

- **It returns a new object rather than assigning fields onto `updatedLine`.** That is what makes
  candidate 2's later deletion a move of one `lineMetrics(...)` call, not a rewrite of a mutation
  sequence.
- **The `?? { ...undefined }` fallback is the empty-series path**, and it is unreachable today —
  `buildRidershipView.ts:101-111` never creates an empty group. It is written out rather than
  ignored because the type demands it and because it must clear the same five fields the
  `!consolidatedRecord` branch clears at `:199-203`.
- **`coverage` stays a separate call.** `buildCoverageByLine` at `:185` is unchanged and stays
  outside the loop. It is cross-line by construction: `isPartialCoverage` compares against
  `buildWindowMonthAxis(ridershipByLine)`, the union over *every* line (`chartData.ts:115`), so it
  cannot be computed from one line's records and cannot be folded into `LineMetrics`. See ADR-0004.
- The `!consolidatedRecord` early-return branch at `:195-209` is **unchanged**.

### Step 6 — Update the import

```diff
-import { calcAbsChange, calcAvg, calcStart, calcEnd, calcRidersPerMile } from '../utils/calc';
-import { buildCoverageByLine } from '../ridership';
+import { buildCoverageByLine, lineMetrics } from '../ridership';
```

### Step 7 — Remove the dead `Number.isNaN` guard

`lineMetrics` never returns `NaN`, so `isVisibleLine`'s guard at `:262` can no longer fire, and its
comment names a function that no longer exists.

```diff
     /**
-     * Presence checks, not truthiness: `calcAbsChange` returns exactly 0 for a line
-     * with a single record, so a truthy test dropped every line from the table
-     * whenever the window narrowed to one month. NaN is still excluded — `calcAvg`
-     * divides by the record count and returns it for an empty series.
+     * Presence checks, not truthiness: `changeInRidership` is exactly 0 for a line
+     * with a single record, so a truthy test dropped every line from the table
+     * whenever the window narrowed to one month. There is no NaN case to exclude:
+     * `lineMetrics` returns null for an empty series, so the fields are cleared to
+     * undefined rather than carrying a sentinel.
      */
     return (
       line.visible &&
       line.averageRidership !== undefined &&
-      !Number.isNaN(line.averageRidership) &&
       line.changeInRidership !== undefined
     );
```

The `!== undefined` presence checks and the "exactly 0 for a single record" rationale are PR #93's
and stay. Only the `NaN` clause goes. `isVisibleLine`'s wider fate belongs to candidate 2.

### Step 8 — Delete the old module

```bash
git rm src/utils/calc.ts src/utils/calc.test.ts
```

`calc.ts` has exactly two importers — the hook and its own test — so that is the complete blast
radius. Confirm with:

```bash
grep -rn "utils/calc\|calcAvg\|calcAbsChange\|calcStart\|calcEnd\|calcRidersPerMile" src/ e2e/
```

That should return nothing. Two comments in `src/hooks/useUserDashboardInput.test.ts` (L458, L490,
L538) reference the old function names in prose; update them to `lineMetrics` so the reasons they
record stay findable. One comment in `src/ridership/chartData.ts:107-108` names all four metric
functions — reword it to name `lineMetrics`.

### Step 9 — Verify no drift

```bash
npm run lint && npm run test && npm run build
```

`src/hooks/useUserDashboardInput.test.ts` is the real check here: it already covers the
in-place-mutation regression (L458), the single-record row (L490) and the `NaN` exclusion (L538).
All three must pass **unedited apart from their comments**. If the L538 test asserts on `NaN`
specifically rather than on the row being hidden, keep the assertion about the row and let the
mechanism change — say so in the PR description.

No e2e run is required: no rendered output changes. If CI's e2e job diffs a baseline, that is drift.
**Do not regenerate baselines in this work**, and never run `npm run test:e2e:update`.

---

## What this leaves for candidate 2 (letter D)

Stated so D does not have to reverse-engineer it. After PR 2, `updateLinesWithLineMetrics` contains
exactly two derivation calls — `buildCoverageByLine(ridershipByLine)` once, and `lineMetrics({...})`
per line — surrounded by the write-back into `setLines` that D is deleting. Moving both into
`buildRidershipView` and returning `Record<lineId, LineMetrics>` alongside the existing coverage map
is then a move, not a rewrite.

Two things D should not have to rediscover:

- `LineMetrics` is the shape metrics travel in. It is already `null`-gated, so D's returned map
  simply omits lines with no records.
- Coverage does **not** merge into `LineMetrics`, for the structural reason given in ADR-0004.

---

## Defaults taken where the design session had no explicit answer

Flagged so a reviewer can overrule rather than discover:

- **The file is `src/ridership/lineMetrics.ts`, singular, named for its function.** The folder's
  other files (`buildRidershipView.ts`, `chartData.ts`) follow the same rule.
- **`sortChronologically` stays module-private.** It is not exported from `calc.ts` today either,
  and `chartData.ts` has its own month-ordering machinery it should not be tempted into sharing.
- **The call site applies metrics by spread-on-return**, rather than field-by-field assignment onto
  `updatedLine`. Chosen because it makes candidate 2's later deletion a one-line move; the
  field-by-field form would work identically today.
- **`LineMetricsInput` is exported from the index** alongside `LineMetrics`, so a test or a future
  caller can name the input type — matching what `ridership-view-module.md` did for
  `RidershipViewInput`.
- **`changeInRidership` is computed as `endingRidership - startingRidership`** rather than
  re-reading both endpoints with their own `?? 0`. Provably the same value; if a reviewer would
  rather see `calc.ts:53` lifted character-for-character, that is a fine substitution.
- **The local `at(...)` test helper wraps `makeRidershipRecord`** so the ported cases keep their
  original positional readability. It is three lines and file-local; it is not a new factory in the
  sense `src/test/builders.ts` exists to prevent.
- **No e2e run in either PR.** Nothing rendered changes, so the committed baselines are the guard,
  not something to refresh.
- **The stale comments in `useUserDashboardInput.test.ts` and `chartData.ts` are updated, not
  deleted.** They record *why* the tests and the coverage layer exist; only the function names in
  them are out of date.
