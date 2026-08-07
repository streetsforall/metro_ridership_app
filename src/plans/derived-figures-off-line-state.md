# Plan: Move derived figures off `Line` state and onto Line Readouts

## Context

`updateLinesWithLineMetrics` (`src/hooks/useUserDashboardInput.ts:175-242`) runs from a `useEffect`
in `src/App.tsx:93-96` and writes eight derived figures back onto each `Line` — the same state they
were derived from. `Line` therefore means two things at once: a Metro service that exists whether or
not anyone selected it, and a snapshot of what the current Month Window says about it.

The eight fields, at `src/@types/lines.types.ts:15-34`:

| Field | Added by |
| --- | --- |
| `averageRidership`, `changeInRidership`, `startingRidership`, `endingRidership`, `ridersPerMile` | original |
| `coveredFrom`, `coveredTo`, `isPartialCoverage` | PR #93 |

Four costs follow from the round trip:

1. **A cycle held open by four `JSON.stringify` dependency arrays.** `App.tsx:96`,
   `useUserDashboardInput.ts:169`, `:273`, and `LineSelector.tsx:271` all exist because the
   write-back mints a new `lines` array on every derivation, so raw object deps would thrash.
2. **A line is invisible until the round trip lands.** `isVisibleLine` (`:262-267`) gates on
   `averageRidership !== undefined`, so the table shows the *previous* window's rows for one commit
   after any change, then updates. The wasted commit also re-runs `buildRidershipView` in full.
3. **A clearing branch and its bug class.** `:195-209` must wipe all eight fields when a line drops
   out of the window; it once wiped only two, and rows rendered the previous window's figures. The
   regression test at `useUserDashboardInput.test.ts:377-406` pins the fix.
4. **A hook that owns display state.** `visibleLines` (`:270-274`) and `selectAllVisibleLines`
   (`:276-284`) both re-derive a three-clause display rule the hook has no other reason to know.

This plan returns the figures from the Ridership View instead, joins them onto their `Line` in a
pure derivation, and deletes the write-back. This is candidate 2 of
[`docs/architecture-review-2026-08-05.md`](../../docs/architecture-review-2026-08-05.md), letter C
(spec) and D (implementation).

**Sequencing against candidate 3 (letter F, #125).** F is landing in two PRs and the first is
already in:

| This plan | Needs | Status at time of writing |
| --- | --- | --- |
| PRs 1–2 (steps 1–6) | nothing from F | **unblocked** |
| PRs 3–4 (steps 7–15) | `lineMetrics`, from F's #126 | **unblocked** — landed as `1f62404` (PR #128) |
| PRs 5–6 (steps 16–26) | F's #127 | **blocked.** #127 rewrites `useUserDashboardInput.ts:211-232`, which steps 21–25 delete. There is no ordering of those two edits that does not conflict in that file. |

See *Line citations and F* under the testing hazards.

### Terms

Defined in [`CONTEXT.md`](../../CONTEXT.md) and used exactly: **Line Readout** (new, added by this
work), **Listed Line** (new, added by this work), **Line Metrics**, **Line**, **Line Selection**,
**Ridership View**, **Month Window**, **Consolidated Ridership**, **Ridership Record**, **Day Of
Week**, **Selection Snapshot**.

`CONTEXT.md`'s glossary outranks both the source and this plan (`CONTEXT.md:8-9`) — the precedence
rule that settled issue #114. Two consequences this work must honour:

- **Line Readout** is the name, and the type is `LineReadout`. Not "enriched line", not "line with
  metrics", not "line view".
- **`lineMetrics` currently names three different things** and two of them are wrong.
  `LineSelector.tsx:368` binds it to a `ConsolidatedRecord`; `LineTableRow.tsx:19` takes it as a
  prop holding `RidershipRecord[]`; and since #126 it is also the metrics function in
  `src/ridership/lineMetrics.ts`. Per the glossary those first two are **Ridership Records**, not
  Line Metrics.
  Step 1 fixes them.

### Decisions already settled — do not re-open

| Decision | Where it is recorded |
| --- | --- |
| The Month Window's offset is intended, and is pinned by PNG baselines | [ADR-0001](../../docs/adr/0001-ridership-month-window-is-deliberately-offset.md) |
| The view returns Chart.js dataset types | [ADR-0002](../../docs/adr/0002-ridership-view-returns-chart-js-dataset-types.md) |
| One domain folder, `src/ridership/`; the rest of `src/utils/` stays flat | [ADR-0003](../../docs/adr/0003-one-domain-folder-not-a-repo-wide-reorganisation.md) |
| `lineMetrics` returns `null` for an empty series; callers handle `null` by omitting the line | [ADR-0004](../../docs/adr/0004-line-metrics-are-one-nullable-shape.md) |
| `LineMetrics` does **not** absorb `coveredFrom` / `coveredTo` / `isPartialCoverage`, because `isPartialCoverage` compares against the union over every line (`chartData.ts:115`) and cannot be computed per-line | [ADR-0004](../../docs/adr/0004-line-metrics-are-one-nullable-shape.md) |
| Metrics are estimated from each line's own first and last record, not the Month Window's endpoints; the UI *labels* the difference | PR #93 / issue #88 · restated in ADR-0004 |
| `isVisibleLine` uses `!== undefined` presence checks, because `changeInRidership` is legitimately exactly `0` for a single-record line | PR #93 |
| Derived figures live on a Line Readout and are never written back onto a `Line`; `LineSelection` may carry metadata but never derived figures; `Line.visible` goes with them | [ADR-0005](../../docs/adr/0005-derived-figures-live-on-line-readouts.md) |

ADR-0004 is settled in full, including its "Note for candidate 2". Build on it; do not reopen it.

### Behaviour that must not drift

1. **Every displayed figure is byte-identical.** This is a placement change, not an arithmetic one.
   The numbers in the table, the summary panel and the map popup must be exactly what the
   write-back produces today, for every window and every day-of-week.
2. **A line with no records in the Month Window is absent from the table, not shown with blanks.**
   Today that happens because the eight fields are cleared and `isVisibleLine` checks presence.
   After this change it happens because the line is absent from `metrics`, so its readout carries no
   figures and `listedReadouts` drops it. Same set, different mechanism.
3. **"Select All" selects the same set it selects today.** See step 23 for why the mechanism changes
   and why the set does not.
4. **Coverage labels are unchanged.** The `coveredFrom → coveredTo` badge at
   `LineTableRow.tsx:157-165` renders for exactly the same rows, with the same strings.
5. **The map hover popup renders the same rows.** `mapPopup.ts:5-16` emits Miles / Avg. Riders /
   Riders per Mile under the same truthiness conditions.
6. **Sorting ranks lines identically.** All nine sortable columns, including the five metric ones,
   produce the same order for the same data — including how `undefined` sorts.
7. Per ADR-0001, pinned by `e2e/chart-content.spec.ts` PNG baselines: the Month Window is exclusive
   on both ends and offset by one month on purpose; the legend follows the alphabetical `lines[]`
   array; one shared Month Axis with `spanGaps` unset; a line with no record for a month contributes
   nothing to the aggregate, not zero. **Nothing in this plan touches any of that** — it is listed
   so a baseline diff is read as a stop signal, not as something to regenerate.

**One intended change, stated so it is not mistaken for drift.** The table currently shows the
previous window's rows for one commit while the effect round-trips, then updates. Afterwards the
readouts are derived in the same render as the view, so there is no intermediate commit. **Settled
state is identical**, which is why the committed baselines must not move. If a baseline diffs,
something else drifted — find it.

### Testing hazards to know about

- **Line citations and F.** Every line number in this plan cites `1f62404` — F's #126 landed, so
  `src/ridership/lineMetrics.ts` exists, but **#127 has not**, so `src/utils/calc.ts` still exists
  and `useUserDashboardInput.ts` is untouched. #127 will move three of the citations below by the
  time PRs 5–6 are worked: `:211-232` collapses to a single `lineMetrics({...})` call returning a
  spread object; the `!Number.isNaN(...)` clause at `:265` is deleted; and the hook test at
  `:537-551` stops asserting on `NaN`. Where this plan says "delete the calc calls", read "delete
  whatever #127 left there". **Re-read the file before editing it** rather than trusting a line
  number. Line numbers in `src/ridership/`, `src/components/`, `src/@types/` and `src/utils/lines.ts`
  are unaffected by #127.
- **`vitest.config.ts` registers the real `ridership-data` plugin**, so `virtual:ridership-bounds`
  and `dataDefaultEndDate` track the live `src/data/ridership.json`. The new unit tests are pure and
  pass explicit records, so they are immune — but any test that renders the hook or App must pin
  `end=` explicitly rather than relying on the default end date.
- **Build on `src/test/builders.ts`.** It exists because #104/#110 ended five duplicated factories;
  do not declare a local line factory. Step 19 adds `makeLineReadout` there. Note that
  `SummaryData.test.tsx` alone has ~15 `makeLine({ ...figures })` call sites (`:27, :34, :42-43,
  :51-52, :61, :70, :79, :89, :108-109, :119, :127-128`) that all become `makeLineReadout`.
- **`LineFilters.test.tsx:81-90` and `:119-128` assert `selectAllVisibleLines` is called.** They use
  `toHaveBeenCalledOnce()` / `not.toHaveBeenCalled()`, which survive the signature change — but the
  prop is renamed in step 23, so the mock names move.
- **Do not run `npm run test:e2e:update` or `npm run test:e2e:update:linux`.** No rendered output
  changes. If a baseline diffs, the refactor changed behaviour; find it.
- **`chartData.test.ts:170-260` imports `buildCoverageByLine`.** Step 8 removes it from
  `src/ridership/index.ts`, not from `chartData.ts` — that test imports from `./chartData` directly
  and is unaffected, exactly as `buildMonthAxis` already is.

---

## The settled interface

### The Ridership View grows two maps

```ts
// src/ridership/buildRidershipView.ts

export interface LineSelection {
  id: number;
  selected: boolean;
  /**
   * The line's one-way route length. **Metadata, never derived** — it comes from
   * `line_distances.json` by line id and is never written back from ridership. It is
   * stated here because riders per mile cannot be derived without it.
   */
  distanceMiles?: number;
}

export interface RidershipView {
  months: string[];
  datasets: ChartDataset<'line', CustomChartData[]>[];
  consolidated: ConsolidatedRidership;
  events: TransitEvent[];
  /** Line Metrics per line id. A Line with no records in the Month Window is absent. */
  metrics: Record<number, LineMetrics>;
  /** The span each Line's records cover inside the Month Window, per line id. */
  coverage: Record<number, LineCoverage>;
}
```

### Line Readouts

```ts
// src/ridership/lineReadouts.ts

/** A Line together with everything the current Ridership View derives about it. */
export type LineReadout = Line & Partial<LineMetrics> & Partial<LineCoverage>;

export interface LineReadoutsInput {
  lines: readonly Line[];
  metrics: Readonly<Record<number, LineMetrics>>;
  coverage: Readonly<Record<number, LineCoverage>>;
}

export function buildLineReadouts(input: LineReadoutsInput): LineReadout[];
```

### The listed-lines rule

```ts
// src/utils/lines.ts

export interface ListedReadoutsInput {
  readouts: readonly LineReadout[];
  searchText: string;
  modes: readonly string[];
}

/** The Line Readouts the line table shows, in the order given. */
export function listedReadouts(input: ListedReadoutsInput): LineReadout[];
```

`Line` sheds nine fields and means one thing:

```ts
// src/@types/lines.types.ts
export interface Line {
  id: number;
  name: string;
  former?: string;
  mode: 'Bus' | 'Rail';
  provider: 'DO' | 'PT';
  selected: boolean;
  distanceMiles?: number;
}
```

Why an options object throughout: it matches `buildRidershipView`'s house style, which
`lineMetrics` also follows (ADR-0004), and adding a fourth input later is non-breaking.

Why `buildRidershipView` returns *maps* rather than assembled readouts: it deliberately does not
receive a full `Line`. `LineSelection` is `{ id, selected, distanceMiles }` and nothing more, which
is what keeps the write-back cycle structurally out of the module. Returning readouts would require
`name`, `mode` and `selected` to travel in and back out, reopening the very fence
`buildRidershipView.ts:17-22` was written to hold.

---

## Implementation

Six PRs, landed in order. Each is independently green and independently revertable.

- **PRs 1 and 2 need nothing from F** and may land at any time.
- **PRs 3 and 4 need F's #126**, which has landed (`1f62404`).

---

## PR 1 — Retire the `lineMetrics` name collision

No behaviour. A pure rename, landed alone so every later diff is legible. `CONTEXT.md:8-9` makes
the glossary binding, and after F the word `lineMetrics` would otherwise mean three things.

### Step 1 — Rename the local binding in `LineSelector.tsx`

`src/components/LineSelector.tsx:368-374`:

```diff
               {sortedLines.map((line, id) => {
-                const lineMetrics: ConsolidatedRecord =
+                const consolidatedRecord: ConsolidatedRecord =
                   ridershipByLine[line.id];

                 return (
                   <LineTableRow
-                    lineMetrics={lineMetrics?.ridershipRecords}
+                    ridershipRecords={consolidatedRecord?.ridershipRecords}
```

`consolidatedRecord` is the name `useUserDashboardInput.ts:192` already uses for this exact value.

### Step 2 — Rename the prop in `LineTableRow.tsx`

`lineMetrics: RidershipRecord[]` becomes `ridershipRecords: RidershipRecord[]` — the name it
already carries on `ConsolidatedRecord`. Four sites: the prop declaration (`:19`), the destructure
(`:33`), the effect body (`:83, :86`) and the `JSON.stringify` dependency (`:99`).

### Step 3 — Update `LineTableRow.test.tsx`

`:59`, `:102-106` (the "renders nothing when falsy" case, whose title says `lineMetrics`), `:321-327`
(the `renderRow` helper's parameter) and `:389`. Rename the parameter and the test title text too —
a case named after a prop that no longer exists is a trap.

### Step 4 — Verify PR 1

```bash
npm run lint && npm run test && npm run build
```

```bash
grep -rn "lineMetrics" src/components/
```

Must return nothing.

---

## PR 2 — Delete `Line`'s dead fields

Also independent of F, also no behaviour. Four fields with **zero live references**; `tsc` proves
the delete.

### Step 5 — Remove four fields from `Line`

`src/@types/lines.types.ts` loses `division?` (`:20`), `viewMap?` (`:21`), `isAggregate?` (`:22`)
and `aggregatedLines?` (`:23`).

Verified references before deleting:

| Field | Only reference |
| --- | --- |
| `division` | inside a commented-out `<td>` at `LineTableRow.tsx:235` |
| `viewMap` | inside a commented-out column block at `LineSelector.tsx:115-119` |
| `isAggregate` | none anywhere |
| `aggregatedLines` | none anywhere |

Leave the commented-out blocks themselves alone — they are someone's parked work, and deleting
commented code is not this PR's job.

`ridershipOverTime` (`:17`) is **not** deleted here. It has no reads or writes either, but
`LineSelector.tsx:112` uses it as a column key typed `keyof Line`, so removing it needs the column
key type to change — which happens in step 17, where that type changes anyway.

### Step 6 — Verify PR 2

```bash
npm run lint && npm run test && npm run build
```

```bash
grep -rn "isAggregate\b\|aggregatedLines\|viewMap\|\.division" src/ e2e/
```

Only the two commented-out blocks may match.

---

## PR 3 — The Ridership View returns metrics and coverage

**Requires F's #126, which has landed.** Purely additive: two new fields nothing consumes yet. Any red here means
the new maps are wrong — which is exactly the signal we want isolated from PR 6.

### Step 7 — Widen `LineSelection`

`src/ridership/buildRidershipView.ts:17-26`:

```diff
 /**
  * The minimum a caller must state about the lines. `Line` satisfies this
- * structurally, so callers pass `lines` unchanged — but this module cannot reach
- * the derived metrics written back onto `Line`, which is what keeps that
- * write-back cycle out of here.
+ * structurally, so callers pass `lines` unchanged.
+ *
+ * Metadata may cross this boundary; **derived figures may not**. `distanceMiles`
+ * is here because riders per mile cannot be derived without it, and it comes from
+ * `line_distances.json` by line id — it is never written back from ridership.
+ * Nothing this module derives is ever read back in through here. See
+ * `docs/adr/0005-derived-figures-live-on-line-readouts.md`.
  */
 export interface LineSelection {
   id: number;
   selected: boolean;
+  /** One-way route length. Metadata, never derived. */
+  distanceMiles?: number;
 }
```

`App.tsx:79` keeps passing `lines` unchanged — `Line` still satisfies the wider interface
structurally.

### Step 8 — Derive the two maps inside `buildRidershipView`

After the consolidation loop closes at `:114`, before the `selected` filter at `:126`:

```ts
  const coverage = buildCoverageByLine(consolidatedRidership);

  /**
   * Iterates `lines`, not `consolidatedRidership`: a record whose `line_name` has no
   * metadata entry produces a consolidated group but no `Line`, and the write-back
   * this replaced — which mapped over `lines` — gave it no metrics either. Preserved.
   *
   * A Line with no records in the Month Window, or whose records yield no Line
   * Metrics, is simply absent from the map. That is ADR-0004's `null` contract seen
   * from the caller's side: no records means no metrics, not zeroes.
   */
  const metrics: Record<number, LineMetrics> = {};
  for (const line of lines) {
    const group = consolidatedRidership[line.id];
    if (!group) continue;
    const figures = lineMetrics({
      records: group.ridershipRecords,
      dayOfWeek,
      distanceMiles: line.distanceMiles,
    });
    if (figures) metrics[line.id] = figures;
  }
```

Add `metrics` and `coverage` to the returned object at `:199-204` and to `RidershipView` at
`:41-50`. Import `lineMetrics` from `./lineMetrics` and `buildCoverageByLine` from `./chartData` —
both module-internal imports, not through the index.

`buildCoverageByLine` stays exported from `src/ridership/index.ts` for now — the hook still imports
it at `useUserDashboardInput.ts:3` until step 21. It leaves the public surface there.

### Step 9 — Extend `src/ridership/buildRidershipView.test.ts`

Port the write-back's coverage tests, which currently only exist as hook tests:

| Source | Becomes |
| --- | --- |
| `useUserDashboardInput.test.ts:341-350` | `metrics[id].ridersPerMile` is set when the line has `distanceMiles` |
| `:352-364` | `ridersPerMile` equals `averageRidership / distanceMiles` |
| `:366-375` | a line with no consolidated record is **absent from `metrics`** (was: `ridersPerMile` undefined) |
| `:431-442` | the short-coverage line is flagged and its range recorded |
| `:444-455` | a line spanning the whole window is not flagged |
| `:457-474` | **the records handed in are not reordered** — PR #93's guarantee, port verbatim |

New cases this interface requires:

- a line present in `lines` but absent from `consolidated` is absent from `metrics`
- a record whose `line_name` has no entry in `lines` produces no `metrics` entry (the orphan case
  the loop comment describes)
- `metrics` is keyed by line id, and `coverage` covers the same lines the old
  `buildCoverageByLine(consolidated)` covered

Build on `makeRidershipRecord` and `makeConsolidatedRidership` from `src/test/builders.ts`.

### Step 10 — Verify PR 3

```bash
npm run lint && npm run test && npm run build
```

```bash
npx vitest run src/ridership/buildRidershipView.test.ts
```

`git diff --stat` shows nothing touched outside `src/ridership/`. The hook and every component are
unchanged and still passing — the write-back is still the live path.

---

## PR 4 — Add Line Readouts and the listed-lines rule

**Requires PR 3.** Also purely additive: two new modules, green and unconsumed.

### Step 11 — Create `src/ridership/lineReadouts.ts`

```ts
import type { Line } from '../@types/lines.types';
import type { LineMetrics } from './lineMetrics';
import type { LineCoverage } from './chartData';

/**
 * A Line together with everything the current Ridership View derives about it —
 * its Line Metrics and the span its records cover.
 *
 * Derived per Month Window and thrown away. A `Line` never carries figures between
 * windows, which is why a stale figure cannot survive a change of window; the
 * clearing branch this replaced existed only because it could.
 */
export type LineReadout = Line & Partial<LineMetrics> & Partial<LineCoverage>;

export interface LineReadoutsInput {
  lines: readonly Line[];
  metrics: Readonly<Record<number, LineMetrics>>;
  coverage: Readonly<Record<number, LineCoverage>>;
}

/**
 * Attach each Line's derived figures to it.
 *
 * A Line absent from `metrics` — no records in the Month Window — simply gets no
 * figures: spreading `undefined` writes no keys. There is nothing to clear.
 *
 * Order is preserved, so readouts follow `lines`, which is alphabetical by line
 * name. Legend, dataset and table order all continue to follow that one array.
 */
export function buildLineReadouts({
  lines,
  metrics,
  coverage,
}: LineReadoutsInput): LineReadout[] {
  return lines.map((line) => ({
    ...line,
    ...metrics[line.id],
    ...coverage[line.id],
  }));
}
```

Export `buildLineReadouts` and `type LineReadout` from `src/ridership/index.ts`.

### Step 12 — Create `src/ridership/lineReadouts.test.ts`

Cases:

- a line present in `metrics` carries all five figures
- a line present in `coverage` carries `coveredFrom` / `coveredTo` / `isPartialCoverage`
- **a line in neither carries no figure keys at all** — assert with `'averageRidership' in readout`
  being `false`, not just `undefined`, since that is the property that makes staleness impossible
- order follows `lines`, not the key order of `metrics`
- the input `lines` array and its elements are not mutated

### Step 13 — Add `listedReadouts` to `src/utils/lines.ts`

The rule the hook's `isVisibleLine` (`:244-268`) encodes today, made pure and given the three inputs
it actually depends on:

```ts
/**
 * The Line Readouts the line table shows.
 *
 * Three clauses, all of which must hold: the line's mode is switched on, its name
 * matches the search text, and it has figures for this Month Window. That last one
 * is why a line with no records in the window is absent from the table rather than
 * shown with blanks.
 *
 * Presence checks, not truthiness: `changeInRidership` is legitimately exactly `0`
 * for a single-record line, so a truthy test dropped every line from the table
 * whenever the window narrowed to one month (PR #93).
 *
 * The map and the summary panel are **not** filtered this way — they read every
 * Line Readout and select on the user's own selection.
 */
export function listedReadouts({
  readouts,
  searchText,
  modes,
}: ListedReadoutsInput): LineReadout[] {
  const busVisible = modes.includes('bus');
  const trainVisible = modes.includes('train');
  const search = searchText.toLocaleLowerCase();

  return readouts.filter((readout) => {
    if (readout.mode === 'Bus' ? !busVisible : !trainVisible) return false;
    if (search && !readout.name.toLocaleLowerCase().includes(search)) return false;
    return (
      readout.averageRidership !== undefined &&
      readout.changeInRidership !== undefined
    );
  });
}
```

Two lifts worth checking line by line against the original:

- The mode clause replaces `line.visible` (`:263`), which the deleted effect at `:136-148` computed
  from exactly these two booleans. `createLinesData:71-73` and the effect at `:142-144` both write
  `false` for any mode that is neither `'Bus'` nor `'Rail'`; the ternary above preserves that,
  because `Line.mode` is typed `'Bus' | 'Rail'` and a `'Bus'` line is the only one that reads
  `busVisible`.
- The search clause is `:245-254` unchanged, including `toLocaleLowerCase` on both sides.
- The presence clause is `:264, :266` unchanged. **F deletes the `!Number.isNaN(...)` clause at
  `:265`** — do not reintroduce it.

### Step 14 — Create the `listedReadouts` tests

Port from `useUserDashboardInput.test.ts`:

| Source | Becomes |
| --- | --- |
| `:141-147`, `:149-154`, `:156-162` | a Bus line is dropped when `modes` excludes `'bus'`; likewise Rail |
| `:164-177` | changing `modes` changes the listed set (now trivially, as an input) |
| `:489-501` | a line whose change is exactly `0` is listed |
| `:503-511` | a line whose average is `0` is listed |
| `:527-535` | a line with no figures at all is not listed |
| `:553-561` | a line whose mode is switched off is not listed even with figures |

Plus: the search clause matches case-insensitively; an empty `searchText` filters nothing; order is
preserved.

`:537-551` (`excludes a line whose average is NaN`) is **F's to resolve** — F's plan step 9 says to
keep the assertion about the row being hidden and let the mechanism change. Port whatever F leaves,
as a case about a line with no figures.

### Step 15 — Verify PR 4

```bash
npm run lint && npm run test && npm run build
```

Nothing consumes either module yet. `git diff --stat` shows only `src/ridership/lineReadouts.ts`,
its test, `src/ridership/index.ts`, `src/utils/lines.ts` and `src/utils/lines.test.ts`.

---

## PR 5 — Consumers read Line Readouts

**Requires PR 4.** The switchover. `Line` still carries its fields and the write-back still runs,
so every figure is computed twice and the spread overwrites each with an identical value.

> **This PR deliberately computes the same figures twice.** That is not an oversight and it is not
> a bug — it is what makes this slice independently green and independently revertable. PR 6 deletes
> the write-back. A reviewer seeing the duplication should read this paragraph, not file a comment.

Any red in this PR means the readout path produces different numbers from the write-back.

### Step 16 — Build readouts in `App.tsx`

```diff
-  const { months, datasets, consolidated, events } = useMemo(
+  const { months, datasets, consolidated, events, metrics, coverage } = useMemo(
     () => buildRidershipView({ /* unchanged */ }),
     [ridershipRecords, lines, startDate, endDate, dayOfWeek, isAggregateVisible],
   );
+
+  /**
+   * Each Line with the figures this window derives for it. Rebuilt whole whenever
+   * the view changes, so a figure from a previous window cannot survive.
+   */
+  const readouts = useMemo(
+    () => buildLineReadouts({ lines, metrics, coverage }),
+    [lines, metrics, coverage],
+  );
+
+  const listed = useMemo(
+    () => listedReadouts({ readouts, searchText, modes }),
+    [readouts, searchText, modes],
+  );
```

`searchText` and `modes` come from `userDashboardInputState`; add them to the destructure at
`:49-62`. **No `JSON.stringify` in either dependency array** — `metrics` and `coverage` come out of
an already-memoised `buildRidershipView`, so their identity is stable per view.

Pass `listed` where `visibleLines` went (`:128`) and `readouts` where `lines` went (`:152`).

### Step 17 — Retype the consumers

No logic changes in this step. `Line` → `LineReadout` in:

| File | Sites |
| --- | --- |
| `src/components/LineSelector.tsx` | `LineKey`/`ColumnHeaderState` (`:22, :26`), `lines`/`setLines` props (`:136-137`), `sortedLines` (`:246`) |
| `src/components/LineTableRow.tsx` | `line` prop (`:14`) |
| `src/components/SummaryData.tsx` | `lines` prop (`:6`), the three `.map` callbacks (`:14, :23, :31`) |
| `src/components/OutputArea.tsx` | `lines` prop (`:26`) |
| `src/components/Map.tsx` | `lines` prop (`:15`), `linesRef` (`:23`) |
| `src/utils/mapPopup.ts` | the `line?` parameter (`:3`) |

The prop stays named `lines` everywhere — only its type changes. `Map`'s imperative read through
`linesRef.current.find(...)` inside the MapLibre `mousemove` handler (`:118-121`) needs no
restructuring: App already passes the full array to `OutputArea:152`, and readouts arrive by the
same route.

Also in this step, the column key type, which frees `ridershipOverTime`:

```diff
-type LineKey = keyof Line;
+/**
+ * `ridershipOverTime` is not a field on anything — it is the sparkline column's
+ * identity for sort-state bookkeeping only, and sorting by it is a no-op.
+ */
+type ColumnKey = keyof LineReadout | 'ridershipOverTime';
```

and delete `ridershipOverTime?: number` from `Line` (`src/@types/lines.types.ts:17`).

### Step 18 — Retype the tests

`LineTableRow.test.tsx` (`mockLine` at `:30-41` and the coverage fixtures at `:236-240, :271,
:292-293`), `SummaryData.test.tsx` (~15 sites), `OutputArea.test.tsx:88-94`, `mapPopup.test.ts`
(`:15, :26, :32, :37, :43, :53, :58-61`) and `LineSelector.test.tsx:11-18` all switch from
`makeLine` to `makeLineReadout`.

Step 19 adds that builder; this step is where it gets used.

### Step 19 — Add `makeLineReadout` to `src/test/builders.ts`

```ts
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
```

`makeLine` keeps returning a bare `Line`. Its `visible: true` default (`:41`) stays until step 24.

### Step 20 — Verify PR 5

```bash
npm run lint && npm run test && npm run build
```

Every existing component test must pass **unedited apart from its builder call and its types**. If
an assertion about a rendered number has to change, the readout path disagrees with the write-back
— stop and find out why. That is the entire purpose of this slice.

---

## PR 6 — Delete the write-back

**Requires PR 5.** Nothing new is written. The diff is deletions plus one signature change. **Any
red in this PR is behaviour drift** — that is the whole reason it is its own PR.

### Step 21 — Delete `updateLinesWithLineMetrics` and its effect

Remove `useUserDashboardInput.ts:171-242` entirely, along with `updateLinesWithLineMetrics` from
`UserDashboardInputState` (`:54`) and from the returned object (`:340`). Remove the effect at
`App.tsx:88-96` and its `JSON.stringify` dependency.

Remove the `buildCoverageByLine` import at `:3`. That was its last caller, so it also leaves the
ridership folder's public surface:

```diff
 export {
   alignToMonthAxis,
-  buildCoverageByLine,
   buildWindowMonthAxis,
   type LineCoverage,
 } from './chartData';
```

`LineCoverage` stays exported — `LineReadout` names it. `alignToMonthAxis` and
`buildWindowMonthAxis` stay too: `LineTableRow.tsx:5` and `LineSelector.tsx:5` still draw sparklines
with them. `buildCoverageByLine` itself is untouched in `chartData.ts` and its tests keep importing
it directly from `./chartData`, exactly as `buildMonthAxis` already does.

### Step 22 — Delete `isVisibleLine`, `visibleLines` and the `modes` effect

- `isVisibleLine` (`:244-268`) and `visibleLines` (`:270-274`) go; the rule now lives in
  `listedReadouts`. `visibleLines` leaves `UserDashboardInputState` (`:44`) and the return (`:329`).
- The `modes → line visibility` effect (`:136-148`) goes; the mode clause now lives in
  `listedReadouts`.
- `createLinesData` (`:65-86`) stops computing `visible` (`:71-73, :81`), so it no longer needs its
  `modes` parameter. Its two call sites are `:122` and the deleted effect.
- The URL-sync dependency array at `:169` drops its `JSON.stringify(lines)` for a plain `lines`, and
  the `react-hooks/exhaustive-deps` disable above it goes with it. `lines` now changes identity only
  on real user actions.

### Step 23 — `selectAllVisibleLines` becomes `selectAllListedLines(ids)`

It cannot re-derive the rule any more — the rule needs readouts, which the hook does not have. It
takes the ids the table is currently showing instead:

```ts
const selectAllListedLines = (ids: number[]): void => {
  const listed = new Set(ids);
  setLines((prevLines) =>
    prevLines.map((prevLine) => ({
      ...prevLine,
      selected: listed.has(prevLine.id) || prevLine.selected,
    })),
  );
};
```

Thread the rename through `LineSelector.tsx:147, :168, :324` and `LineFilters.tsx:14, :25, :80`.
`LineFilters` passes the ids of the rows it is displaying — `LineSelector` hands it
`sortedLines.map((l) => l.id)`.

**Why the set does not change.** `LineSelector` never filters beyond what App gives it; it only
sorts (`:246-271`). So the rows it displays are exactly `listed`, which is exactly what
`isVisibleLine` selected today. The *meaning* shifts from "everything matching the predicate" to
"everything currently listed", and those two can no longer disagree, which they previously could
have if the two derivations ever drifted apart.

### Step 24 — Strip `Line`

`src/@types/lines.types.ts` loses `visible` (`:14`) and the eight derived fields (`:15-16, :18-19,
:25, :31-32, :34`), leaving the shape given under *The settled interface*. `makeLine` in
`src/test/builders.ts:41` loses its `visible: true` default; its doc-comment about `selected`
defaulting to `false` stays and is still true.

`tsc` finds every remaining reader. There should be none — PR 5 already moved them all.

### Step 25 — Migrate the hook tests

`useUserDashboardInput.test.ts` goes from 61 tests to roughly 40, and what remains describes the
hook's actual job: the URL contract, line metadata, and selection.

| Block | Fate |
| --- | --- |
| `default state`, `initial state from URL params`, `URL sync`, `line initialisation` (`:18-321`) | **Unchanged.** |
| `modes → line visibility` (`:140-177`) | **Split.** The URL half (`buses=0`/`trains=0` → `modes`) stays, retargeted from `l.visible` onto `result.current.modes`. The filtering half was ported to `listedReadouts` in step 14. |
| `updateLinesWithLineMetrics` (`:323-406`) | **Deleted here** — ported to `buildRidershipView.test.ts` in step 9 and `lineReadouts.test.ts` in step 12. |
| `coverage metadata on lines` (`:408-474`) | **Deleted here** — ported in step 9. |
| `line visibility` (`:476-561`) | **Deleted here** — ported in step 14, except `:513-525` (`selectAllVisibleLines`), which stays as a `selectAllListedLines` test passing explicit ids. |

Do not delete a block until its port is green. The ports land in PRs 3 and 4, so they already are.

### Step 26 — Verify no drift

```bash
npm run lint && npm run test && npm run build
```

```bash
grep -rn "updateLinesWithLineMetrics\|isVisibleLine\|visibleLines\|JSON.stringify(lines)\|line.visible" src/
```

Must return nothing.

```bash
grep -rn "JSON.stringify" src/App.tsx src/hooks/useUserDashboardInput.ts src/components/LineSelector.tsx
```

Must return nothing — all four arrays are gone. `LineTableRow.tsx:99`'s
`JSON.stringify(ridershipRecords)` is a different array and **stays**; it is not one of the four.

No e2e run. Nothing rendered changes. If CI's e2e job diffs a baseline, that is drift. **Do not
regenerate baselines in this work**, and never run `npm run test:e2e:update`.

---

## Files to Modify

| File | PR | What |
| --- | --- | --- |
| `src/components/LineSelector.tsx` | 1, 5, 6 | rename local · retype + `ColumnKey` · `selectAllListedLines` |
| `src/components/LineTableRow.tsx` | 1, 5 | rename prop · retype |
| `src/components/LineTableRow.test.tsx` | 1, 5 | rename · `makeLineReadout` |
| `src/@types/lines.types.ts` | 2, 5, 6 | drop 4 dead fields · drop `ridershipOverTime` · strip 9 |
| `src/ridership/buildRidershipView.ts` | 3 | `LineSelection` widens · `metrics` + `coverage` |
| `src/ridership/buildRidershipView.test.ts` | 3 | ported metric and coverage cases |
| `src/ridership/index.ts` | 4, 6 | export readouts · drop `buildCoverageByLine` |
| `src/ridership/lineReadouts.ts` + `.test.ts` | 4 | **new** |
| `src/utils/lines.ts` + `lines.test.ts` | 4 | `listedReadouts` + its cases |
| `src/App.tsx` | 5, 6 | build readouts · delete the effect |
| `src/components/SummaryData.tsx`, `OutputArea.tsx`, `Map.tsx`, `src/utils/mapPopup.ts` | 5 | retype only |
| `src/components/SummaryData.test.tsx`, `OutputArea.test.tsx`, `Map.test.tsx`, `LineSelector.test.tsx`, `src/utils/mapPopup.test.ts` | 5 | `makeLineReadout` |
| `src/test/builders.ts` | 5, 6 | add `makeLineReadout` · drop `visible` default |
| `src/hooks/useUserDashboardInput.ts` | 6 | the deletions |
| `src/hooks/useUserDashboardInput.test.ts` | 6 | 61 tests → ~40 |
| `src/components/LineFilters.tsx` + `.test.tsx` | 6 | `selectAllListedLines` |

Not modified, and worth stating: `src/ridership/chartData.ts` (`buildCoverageByLine` stays exactly
as it is, it just stops being re-exported), `src/data/*`, `e2e/**`, and every baseline PNG.

---

## Verification

Each PR:

```bash
npm run lint && npm run test && npm run build
```

No e2e run in any of the six. Nothing rendered changes, so the committed Linux baselines are the
guard rather than something to refresh. **Never run `npm run test:e2e:update` or
`npm run test:e2e:update:linux` in this work.**

---

## Defaults taken where the design session had no explicit answer

Flagged so a reviewer can overrule rather than discover:

- **The readout module is `src/ridership/lineReadouts.ts`**, plural, named for its type rather than
  its function — `lineMetrics.ts` names its function because the function is the point there; here
  the type is. If you would rather have `buildLineReadouts.ts`, that is a fine substitution.
- **`listedReadouts` lives in `src/utils/lines.ts`**, not `src/ridership/`. It is a display rule
  over readouts, not a ridership derivation, and `lines.ts` already holds `lineNameSortFunction` and
  `generateCSV`. It does mean `lines.ts` gains a type-only import from `src/ridership/`.
- **`LineReadout` is a type alias intersection**, not an interface with nine restated optional
  fields. The alias cannot drift from `LineMetrics`; a restatement can.
- **The prop stays named `lines` in `OutputArea`, `Map`, `SummaryData` and `LineSelector`** — only
  its type changes. Renaming to `readouts` would be more precise and would enlarge PR 5's diff from
  types to types-and-names; the type is what carries the meaning.
- **`RidershipView`'s new fields are `metrics` and `coverage`**, matching the existing short style
  (`months`, `datasets`, `consolidated`, `events`) rather than `metricsByLine` / `coverageByLine`.
- **The commented-out `division` and `viewMap` blocks are left in place** in PR 2, even though the
  fields backing them are deleted. They are parked work and deleting commented code is a separate
  judgement.
- **`buildLineReadouts` takes `metrics` and `coverage` as two maps**, not one merged map. They have
  different scopes — ADR-0004 is explicit that coverage cannot be computed per-line — and merging
  them in the view would hide that.
- **PR 5 computes every figure twice on purpose.** The alternative is one large PR mixing "are the
  readouts right?" with "did deleting the write-back change anything?", which is precisely the
  question separation ADR-0004 bought for F.
- **No e2e run in any of the six PRs.**
- **Line numbers cite `origin/main` at `1f62404`** — after F's #126, before its #127. See the testing hazards.
