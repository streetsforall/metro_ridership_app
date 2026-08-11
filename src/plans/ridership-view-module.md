# Plan: Give the Ridership View a Module

## Context

`src/App.tsx` L84–186 holds the entire ridership derivation pipeline inside two `useMemo` blocks:
the date-window filter, grouping records by `line_name` into `ConsolidatedRidership`, the selection
snapshot, `buildMonthAxis` / `alignToMonthAxis` / `buildAggregateSeries`, and the transit-event
window filter. Every rule in it — including the deliberately offset month window and the
shared-axis requirement — is reachable only by rendering `App`.

`src/utils/chartData.ts` is that pipeline's interface today. It should become its implementation.

This plan extracts the pipeline into one module, `src/ridership/`, whose entire public surface is
`buildRidershipView(...) → RidershipView`. Nothing about what the app renders changes. The win is
that the rules become reachable from a plain unit test, `App.tsx` becomes markup and wiring, and
the transit-event filter — which has **zero** unit coverage today, because `App.test.tsx` mocks
`OutputArea` and discards the `transitEvents` prop — gets tested for the first time.

This is candidate 1 of `docs/architecture-review-2026-08-05.md` (PR #99). It is the frozen contract
that candidates 2 (derived metrics off state), 3 (collapse `calc.ts`) and 4 (a `Month` module) all
attach to, so it lands alone before any of them start.

### Terms

Defined in [`CONTEXT.md`](../../CONTEXT.md) and used exactly: **Ridership View**, **Month Window**,
**Event Window**, **Month Axis**, **Selection Snapshot**, **Aggregate Series**, **Line Selection**,
**Consolidated Ridership**, **Transit Event**.

### Decisions already settled — do not re-open

| Decision | Where it is recorded |
| --- | --- |
| The Month Window's offset is intended; keep the `Date` arithmetic verbatim | [ADR-0001](../../docs/adr/0001-ridership-month-window-is-deliberately-offset.md) |
| The view returns Chart.js `ChartDataset` types, not a neutral series type | [ADR-0002](../../docs/adr/0002-ridership-view-returns-chart-js-dataset-types.md) |
| One domain folder; the rest of `src/` stays flat | [ADR-0003](../../docs/adr/0003-one-domain-folder-not-a-repo-wide-reorganisation.md) |

### Behaviour that must not drift

1. **The Month Window is exclusive on both ends and offset by one month on purpose.** A record at
   calendar-month ordinal `R` is included when `S ≤ R ≤ E − 2`. `e2e/chart-content.spec.ts` renders
   windows through this into committed PNG baselines. Do not "fix" it. See ADR-0001.
2. **The Event Window is inclusive on both ends** and correctly 1-based. It genuinely disagrees with
   the Month Window. Preserve the disagreement.
3. **Legend and dataset order follow the `lines[]` array** — alphabetical by line name — not URL
   order and not numeric id order. Also pinned by baselines.
4. **One shared Month Axis for every dataset.** Chart.js `CategoryScale` appends any label missing
   from `labels` to the *end* of the axis, so a per-dataset axis scrambles the ordering. Do not set
   `spanGaps`; the gaps are meaningful.
5. **The Aggregate Series is always last** in `datasets`.
6. A month a line does not report is `null`, never `0` — and contributes nothing to the aggregate.

### A testing hazard to know about

`vitest` resolves `virtual:ridership-bounds` from the real `src/data/ridership.json` via the
`ridership-data` plugin, so `dataDefaultEndDate` under test tracks live data and moves when the
dataset is refreshed. The new pure tests always pass explicit dates and are immune. The surviving
wiring tests in `App.test.tsx` must keep pinning `end=` explicitly wherever the assertion depends on
the end of the window.

---

## Implementation

Three PRs, landed in order. Each is independently green and independently revertable.

---

## PR 1 — Move `chartData` into `src/ridership/`

Mechanical relocation. No behaviour, no logic edits, no test edits beyond the import path.

### Step 1 — Move the files

```
src/utils/chartData.ts      → src/ridership/chartData.ts
src/utils/chartData.test.ts → src/ridership/chartData.test.ts
```

Use `git mv` so the move is recorded as a rename and a reviewer can confirm the content is
byte-identical. `chartData.ts`'s three exports (`buildMonthAxis`, `alignToMonthAxis`,
`buildAggregateSeries`) stay `export`ed — they are used across files *within* the folder — but stop
being re-exported outside it.

Update the relative import in `chartData.test.ts` (`./chartData` is unchanged) and the type imports
inside `chartData.ts`, which move from `../@types/...` to `../@types/...` — the depth is the same, so
they are unchanged. Verify rather than assume.

### Step 2 — Add `src/ridership/index.ts`

```ts
export { buildRidershipView, type RidershipView } from './buildRidershipView';
```

In PR 1 that file does not exist yet, so PR 1 instead creates the index with only what exists:

```ts
export { buildMonthAxis, alignToMonthAxis, buildAggregateSeries } from './chartData';
```

…and PR 2 replaces those three exports with the single `buildRidershipView` export. This keeps PR 1
a pure move: `App.tsx` changes one import path and nothing else.

### Step 3 — Update `App.tsx`'s import

```diff
-import { alignToMonthAxis, buildAggregateSeries, buildMonthAxis } from './utils/chartData';
+import { alignToMonthAxis, buildAggregateSeries, buildMonthAxis } from './ridership';
```

`npm run test` and `npm run build` pass unchanged. No e2e run needed — nothing rendered changes.

---

## PR 2 — Add `buildRidershipView` and its test

Additive. `App.tsx` is **not** touched; the module is green but unused. Any failure here means the
new module is wrong, which is exactly the signal we want isolated from PR 3.

### Step 4 — Create `src/ridership/buildRidershipView.ts`

The interface:

```ts
import { type ChartDataset } from 'chart.js';
import { alignToMonthAxis, buildAggregateSeries, buildMonthAxis } from './chartData';
import { getLineColor, getLineNames } from '../utils/lines';
import transitEventsData from '../data/transit-events.json';
import type { CustomChartData } from '../@types/chart.types';
import type { TransitEvent } from '../@types/events.types';
import type {
  ConsolidatedRidership,
  DayOfWeek,
  RidershipRecord,
} from '../@types/metrics.types';

/**
 * The minimum a caller must state about the lines. `Line` satisfies this structurally, so
 * callers pass `lines` unchanged — but the module cannot reach the derived metrics on `Line`,
 * which is what keeps the write-back cycle out of here.
 */
export interface LineSelection {
  id: number;
  selected: boolean;
}

export interface RidershipViewInput {
  /** `null` is the loading state — it yields the empty view. */
  records: RidershipRecord[] | null;
  /** Legend and dataset order follow this order. Do not sort inside the module. */
  lines: readonly LineSelection[];
  startDate: Date;
  endDate: Date;
  dayOfWeek: DayOfWeek;
  includeAggregate: boolean;
  events?: readonly TransitEvent[];
}

export interface RidershipView {
  /** The shared Month Axis: chronological union of the selected lines' months. */
  months: string[];
  /** One dataset per selected line in `lines` order; the Aggregate Series last, if requested. */
  datasets: ChartDataset<'line', CustomChartData[]>[];
  /** Records grouped by line, each carrying its Selection Snapshot. */
  consolidated: ConsolidatedRidership;
  /** Transit Events inside the Event Window that apply to the selection, chronologically. */
  events: TransitEvent[];
}

export function buildRidershipView(input: RidershipViewInput): RidershipView;
```

> **Naming (issue #114):** this plan originally called the third field `byLine`, which is the
> synonym `CONTEXT.md:84-87` lists under _Avoid_ for **Consolidated Ridership**. Per the glossary's
> precedence rule (`CONTEXT.md:8-9`) the term wins and the plan was the out-of-date document, so the
> field is `consolidated` here and in the source.

The body is the two `App.tsx` memos, moved. Specifically:

**4a — Group and snapshot.** Lift `App.tsx` L85–115 verbatim, including the comment explaining the
offset. The `Date` comparison is copied **exactly** — see ADR-0001 — and the doc comment gains the
worked-out rule:

> A record at calendar-month ordinal `R` is included when `S ≤ R ≤ E − 2`: the start month is
> included, the end month and the month immediately before it are excluded. This is intended. See
> `docs/adr/0001-ridership-month-window-is-deliberately-offset.md`.

**4b — Select, axis, align.** Lift L117–148 verbatim. `selected` is `lines.filter(line =>
consolidated[line.id]?.selected)` — note it filters on the **Selection Snapshot**, not on
`line.selected`, so a line selected but with no records in the window produces no dataset.

**4c — Aggregate.** Lift L150–163, gated on `includeAggregate` instead of `isAggregateVisible`.

**4d — Events.** Lift L172–186, with `transitEventsData` reached through the `events` parameter:

```ts
const events = input.events ?? (transitEventsData as TransitEvent[]);
```

The selection set here uses `lines.filter(l => l.selected)` — the **live** selection, not the
snapshot. That differs from 4b and is not an oversight: an event on a line with no records in the
window still shows. Preserve it, and say so in a comment.

**4e — The empty view.** When `records` is `null`, the grouping loop simply does not run, so
`consolidated` is `{}`, `selected` is empty, `months` is `[]` and `datasets` is `[]`. Events are **still
filtered and returned** — they do not depend on records. Confirm this matches today: in `App.tsx`
the events memo does not depend on `ridershipRecords`, so it already returns events during loading.
Preserve that.

### Step 5 — Create `src/ridership/buildRidershipView.test.ts`

A local fixture helper (**not** a shared builder — that is out of scope, see PR 4):

```ts
const makeRecord = (
  year: number,
  month: number,
  line_name: number,
  overrides: Partial<RidershipRecord> = {},
): RidershipRecord => ({
  year, month, line_name,
  est_wkday_ridership: 1000,
  est_sat_ridership: 600,
  est_sun_ridership: 400,
  ...overrides,
});
```

Lines are plain literals — `[{ id: 807, selected: true }]` — because `LineSelection` is narrow. No
`makeLine` needed.

Reuse `App.test.tsx`'s fixture shape so the migrated assertions keep their meaning: line 807 (K) at
2019-01 / 2022-01 / 2026-01, 806 (L) at 2022-01, 804 (E) at 2020-08 / 2022-01 / 2025-07 / 2026-01,
805 (D) at 2025-07 / 2026-01.

Cases to cover:

**Migrated from `App.test.tsx`** (13 assertions — see the table in PR 3):

- datasets follow the given `lines[]` order, not record-encounter order and not numeric id order
- no selected lines → no datasets
- one dataset per selected line; correct brand colour per line (`#e56db1` K, `#f9a825` L)
- each `dayOfWeek` reads the matching field (weekday / Saturday / Sunday)
- records before the start are excluded; records after the end are excluded; a wide window includes
  all; a line with no records in window produces no dataset
- aggregate absent unless requested; present and last when requested; equals the per-month sum
- the axis spans the chronological union across lines of differing coverage; every dataset shares
  that time sequence; the short line's uncovered months are `null`; the long line stays aligned; the
  aggregate sums by month rather than by array index
- a data point's `time` is `"2022 1"` and it carries both `time` and `stat`

**New — the Month Window boundaries** (this is the coverage ADR-0001 depends on). With
`start = 2022-01`, `end = 2024-01`, so `S = 2022·12+0` and the window is 2022-01 … 2023-11:

| Record month | Expected |
| --- | --- |
| 2021-12 | excluded (before `S`) |
| 2022-01 | **included** (the start month is in) |
| 2023-11 | **included** (`E − 2`) |
| 2023-12 | excluded (`E − 1`) |
| 2024-01 | excluded (`E`) |

**New — the Event Window and event filtering** (zero coverage today):

- an event exactly at the start month is included, and one exactly at the end month is **also**
  included — the Event Window is inclusive on both ends, unlike the Month Window. Assert both
  windows in the same test file so the divergence is visible.
- an event one month before the start, and one one month after the end, are excluded
- an event with `line_ids: []` is returned regardless of selection (system-wide)
- an event whose `line_ids` intersect the selection is returned; one that does not is not
- events are returned sorted by `date` ascending
- an event on a **selected line that has no records in the window** is still returned — the event
  filter reads the live selection, not the Selection Snapshot

**New — the empty view:**

- `records: null` → `{ months: [], datasets: [], consolidated: {} }`
- `records: null` still returns the filtered events

### Step 6 — Point the index at the module

```ts
// src/ridership/index.ts
export {
  buildRidershipView,
  type RidershipView,
  type RidershipViewInput,
  type LineSelection,
} from './buildRidershipView';
```

`App.tsx` still imports the three chart helpers, so in PR 2 the index exports both sets. PR 3 drops
the chart-helper exports.

---

## PR 3 — Wire `App.tsx` to the module

Nothing new here. The diff is `App.tsx` shrinking and `App.test.tsx` losing tests. **Any red in this
PR is behaviour drift** — that is the whole reason it is its own PR.

### Step 7 — Replace both memos in `App.tsx`

```tsx
const { months, datasets, consolidated, events } = useMemo(
  () =>
    buildRidershipView({
      records: ridershipRecords,
      lines,
      startDate,
      endDate,
      dayOfWeek,
      includeAggregate: isAggregateVisible,
    }),
  [ridershipRecords, lines, startDate, endDate, dayOfWeek, isAggregateVisible],
);
```

Keep the `useMemo` — it is what stops the metrics `useEffect` (which keys on
`JSON.stringify(ridershipByLine)`) from thrashing. Do **not** convert the dependency array to
`JSON.stringify(lines)`; `lines` is already a state value with a stable reference between renders.

Delete from `App.tsx`: the `chartData` imports, the `getLineColor`/`getLineNames` imports if now
unused, `transitEventsData` and the `TransitEvent` / `ConsolidatedRidership` / `ChartDataset` /
`CustomChartData` type imports if now unused, and both memo bodies. Verify with `npm run lint`.

Rename at the call sites: `chartDatasets` → `datasets`, `monthList` → `months`, `ridershipByLine` →
`consolidated`, `transitEvents` → `events`. **`OutputArea` and `LineSelector` prop names do not change** —
only the local variable bound to them:

```tsx
<LineSelector ... ridershipByLine={consolidated} />
<OutputArea chartDatasets={datasets} months={months} lines={lines} transitEvents={events} ... />
```

`updateLinesWithLineMetrics(consolidated)` and its `JSON.stringify` dependency stay exactly as they are —
unwinding that write-back loop is candidate 2, not this work.

### Step 8 — Drop the chart-helper exports from the index

`src/ridership/index.ts` keeps only the `buildRidershipView` exports. `chartData.ts` is now
implementation: reachable within the folder, not from outside it.

### Step 9 — Cut `App.test.tsx` from 20 tests to ~7

Principle: **App keeps one wiring test per URL param that feeds the module, plus the fetch/loading
path. Everything asserting a derivation rule has moved to `buildRidershipView.test.ts`.**

| describe block | Tests | Disposition |
| --- | --- | --- |
| chart dataset ordering (K before L) | 1 | **Keep as-is.** The alphabetical part is `lineNameSortFunction`'s rule (covered in `lines.test.ts`); this is the #86 regression and deserves an end-to-end pin. |
| line selection | 4 | **Delete all 4** — covered in the pure test. |
| day of week | 4 | **Delete 4, keep 1 thin one**: `?lines=807&day=sat` → 3000, proving URL → hook → module threading. |
| date range filtering | 4 | **Delete 4, keep 1 thin one** pinning that `start=` and `end=` reach the module (`?lines=807&start=2021-01&end=2024-01` → one point). |
| aggregate dataset | 5 | **Delete 5, keep 1**: `aggregate=1` → an `Aggregate` dataset exists. |
| shared month axis | 5 | **Delete all 5** — pure through and through; `e2e/chart-content.spec.ts` pins the rendered result. |
| context log panel | 2 | **Keep both.** Nothing to do with the module — `showContextLogs` prop threading. |
| chart data format | 2 | **Delete both.** |

Result: ~7 tests — dataset ordering, one day-of-week, one date-range, one aggregate, two context-log,
and whatever remains observing the columnar fetch. Keep the `OutputArea` mock and the columnar fetch
mock; that is how wiring stays observable. Keep `end=` pinned in the surviving date-range test.

### Step 10 — Verify no drift

```bash
npm run lint && npm run test && npm run build
```

Then the e2e suite, which is the real guard on the baselines:

```bash
npm run test:e2e
```

**Every PNG baseline must pass untouched.** If a chart baseline diffs, the extraction changed
behaviour — find it. **Do not regenerate baselines in this work.** If a diff appears and looks like
unrelated render drift, run the control described in `README.md#ci-went-red--now-what` against `main`
before concluding anything.

---

## PR 4 — Shared test-data builders (independent)

Not blocked by and not blocking PRs 1–3. Listed here because it was discovered during this design,
not because it is part of the module.

Six near-identical fixture factories are redeclared across the test suite:

| File | Factory |
| --- | --- |
| `src/utils/lines.test.ts` | `makeLine` |
| `src/utils/mapPopup.test.ts` | `makeLine` |
| `src/components/Map.test.tsx` | `makeLine` |
| `src/components/OutputArea.test.tsx` | `makeLine` |
| `src/components/SummaryData.test.tsx` | `makeLine` |
| `src/hooks/useUserDashboardInput.test.ts` | `makeRidership` |

`src/utils/lines.test.ts` also builds `ConsolidatedRidership` object literals inline in four places.

Consolidate into one module — proposed `src/test/builders.ts`, exporting `makeLine`,
`makeRidershipRecord` and `makeConsolidatedRidership`. Open questions for that PR, not this one:
what the defaults are, whether the file lands somewhere `vitest.config.ts`'s include glob will try to
run as a suite, and whether builders return frozen objects.

**Do not fold this into PRs 1–3.** Their reviewability rests on the diff containing nothing but
relocation and extraction.

---

## Files to Modify

| File | PR | Change |
| --- | --- | --- |
| `src/utils/chartData.ts` | 1 | **Move** → `src/ridership/chartData.ts`, byte-identical |
| `src/utils/chartData.test.ts` | 1 | **Move** → `src/ridership/chartData.test.ts` |
| `src/ridership/index.ts` | 1, 2, 3 | **New** — the module's entire public surface |
| `src/ridership/buildRidershipView.ts` | 2 | **New** — the extracted pipeline |
| `src/ridership/buildRidershipView.test.ts` | 2 | **New** — migrated + boundary + event + empty-view cases |
| `src/App.tsx` | 1, 3 | Import path (1); both memos collapse to one call (3) |
| `src/App.test.tsx` | 3 | 20 tests → ~7 wiring tests |
| `CONTEXT.md` | — | Already written by the spec session |
| `docs/adr/0001…0003` | — | Already written by the spec session |

**Unchanged, and expected to stay unchanged:** `src/@types/metrics.types.ts` (`ConsolidatedRidership`
survives as-is), `src/hooks/useUserDashboardInput.ts`, `src/components/OutputArea.tsx`,
`src/components/LineSelector.tsx`, `src/components/SummaryData.tsx`, `src/utils/lines.ts`,
`src/utils/calc.ts`, all of `e2e/`, all PNG baselines.

---

## Verification

1. `npm run test` — green after each PR.
2. `npm run build` — green after each PR (it type-checks `e2e/` too).
3. `npm run test:e2e` after PR 3 — **all baselines pass untouched**. This is the drift guard.
4. Manual spot-check after PR 3: load `?lines=801,802,804&start=2019-12&end=2026-05&day=wkday` and
   confirm the chart is identical to `main`'s render of the same URL.
5. Confirm `?lines=801,802` and `?lines=802,801` still produce the same view (legend follows the
   alphabetical `lines[]` array, not URL order).
6. Confirm the context log still lists events for a selected line in a window that contains one —
   e.g. `?lines=801&start=2022-01&end=2024-01&logs=1` shows the Regional Connector opening.

---

## Defaults taken where the design session had no explicit answer

Flagged so a reviewer can overrule rather than discover:

- **ADR numbering starts at `0001`** — `docs/adr/` did not exist before this work.
- **A third ADR (0003) was written** beyond the two agreed, covering why `src/ridership/` is the only
  domain folder. It qualifies on the usual test: surprising, hard to reverse informally, and a real
  trade-off a future reviewer would otherwise re-suggest.
- **`RidershipViewInput` and `LineSelection` are exported from the index** alongside
  `RidershipView`, so a test or a future caller can name the input type.
- **PR 1 gives `index.ts` a transitional shape** (re-exporting the chart helpers) so that PR 1 stays
  a pure move. If you would rather `App.tsx` import `./ridership/chartData` directly for one PR, that
  works too and skips the transitional export.
