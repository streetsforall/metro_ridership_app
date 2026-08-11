# Derived figures live on a Line Readout returned by the Ridership View, and are never written back onto a Line

Status: accepted

`updateLinesWithLineMetrics` (`src/hooks/useUserDashboardInput.ts:175-242`) ran from a `useEffect` in
`src/App.tsx:93-96` and wrote eight derived figures back onto each `Line` — the same state they were
derived from. `Line` therefore meant two things at once: a Metro service, which exists whether or not
anyone selected it, and a snapshot of what the current Month Window says about it.

That round trip cost four things. A cycle held open by four `JSON.stringify` dependency arrays
(`App.tsx:96`, `useUserDashboardInput.ts:169`, `:273`, `LineSelector.tsx:271`), all of which exist
because the write-back mints a new `lines` array on every derivation. A line invisible until the trip
lands, because `isVisibleLine` gates on `averageRidership !== undefined` — so the table showed the
previous window's rows for one commit and re-ran `buildRidershipView` in full to produce them. A
clearing branch (`:195-209`) that must wipe all eight fields when a line drops out of the window, and
which once wiped only two, leaving rows rendering a previous window's figures. And a hook that owned
a three-clause display rule it had no other reason to know.

We return the figures from the Ridership View instead. `buildRidershipView` gains `metrics` and
`coverage`, both keyed by line id; `buildLineReadouts` joins them onto their `Line` to produce a
**Line Readout**; the line table, the summary panel and the map popup all read readouts.
`updateLinesWithLineMetrics`, its effect, and all four `JSON.stringify` arrays are deleted.
`CONTEXT.md` gains the terms **Line Readout** and **Listed Line**.

**The merge does not disappear — the round trip through state does.** Five call sites need a line's
identity and its figures in the same object: the sort in `LineSelector.tsx:270` (`lodash.orderBy`
over key strings, five of which are metric fields), the six fields `LineTableRow` renders, the three
`SummaryData` sums, `mapPopup.ts:9,13`, and the visibility rule. The alternative was to hand each
consumer a metrics map to join against itself. We rejected it: it rewrites the sort from key strings
to accessors, adds a parameter to `mapPopup` and a second ref to `Map`, and smears the joining
knowledge across five components. Doing the join once, in a pure derivation, leaves two types with
two honest meanings — a Line is metadata and selection, permanently; a Line Readout is a line as
displayed for one window, derived and thrown away. That is the same two-scopes-two-shapes reasoning
[ADR-0004](0004-line-metrics-are-one-nullable-shape.md) used to keep `LineMetrics` and coverage
apart.

**The fence in `buildRidershipView`'s docstring is crossed deliberately, and only in one direction.**
`LineSelection` was `{ id, selected }` and its comment read: "`Line` satisfies this structurally, so
callers pass `lines` unchanged — but this module cannot reach the derived metrics written back onto
`Line`, which is what keeps that write-back cycle out of here." Deriving Line Metrics inside the view
needs one thing that interface does not carry: `distanceMiles`. So it widens by exactly that field,
and the comment is rewritten to state the rule it was really enforcing — **metadata may cross;
derived figures may not.** `distanceMiles` comes from `line_distances.json` by line id and is never
written back from ridership, so nothing the module derives can now be read back in through its own
input. The alternative was for `buildRidershipView` to import `line_distances.json` itself, which it
has precedent for (it already imports `transit-events.json` and resolves names and colours from the
id). We rejected it because `distanceMiles` must stay on `Line` regardless — the Miles column,
`SummaryData`'s total and the map popup all read it and none of them are metrics — so that route
creates two independent readers of one file that must agree.

**`Line.visible` and the `modes` effect go in the same change.** `visible` was a pure function of
`modes` and `line.mode`, stored back onto `Line` by a second effect (`:136-148`) and read only by
`isVisibleLine`. It is structurally the same write-back, so leaving it would have shipped a `Line`
that still lied about itself and an ADR whose title its own type contradicted. We considered
deferring it to candidate 5, which owns `modes` and the hook's interface, and declined: the cost of
including it is four hook tests that move to a pure function, and the cost of excluding it is a
"one meaning per type" claim that is visibly false on the day it lands.

**Nothing observable changes, with one exception, and it is a removal rather than a change.** The
table currently shows the previous window's rows for one commit while the effect round-trips. After
this, readouts are derived in the same render as the view and that intermediate commit does not
exist. Settled state is byte-identical, which is what lets "any red in the wiring PR is drift" stay a
usable review rule and why the committed PNG baselines must not move.

## Consequences

- Four `JSON.stringify` dependency arrays are deleted, not relocated. `metrics` and `coverage` come
  out of an already-memoised `buildRidershipView`, so their identity is stable per view; and once the
  write-back stops churning `lines`, `useUserDashboardInput.ts:169` and `LineSelector.tsx:271` can
  take plain object dependencies.
- The clearing branch and its regression test become structurally unreachable. A `Line` never carries
  figures between windows, so there is nothing to clear — the readout is rebuilt whole each time, and
  spreading an absent entry writes no keys.
- **ADR-0004's rationale for `ridersPerMile: number | undefined` is superseded, though the
  declaration stands.** It was declared `| undefined` rather than `?:` so that "a spread onto a
  `Line` clears a previous window's figure rather than preserving it". After this change there is no
  previous figure to clear. The property is harmless and F should not be asked to revisit it; its
  reason simply stops load-bearing.
- `selectAllVisibleLines()` becomes `selectAllListedLines(ids)`. It can no longer re-derive the
  visibility rule, because that rule now needs readouts the hook does not have, so it takes the ids
  the table is displaying. The set is unchanged — `LineSelector` only sorts what App gives it, it
  never filters further — but the meaning shifts from "everything matching the predicate" to
  "everything currently listed", and the two can no longer drift apart.
- `buildCoverageByLine` leaves `src/ridership/index.ts`. The folder's public surface shrinks, which
  is the direction [ADR-0003](0003-one-domain-folder-not-a-repo-wide-reorganisation.md)'s seam
  argument wants; `chartData.ts` is untouched and its tests keep importing it directly.
- `RidershipView` grows from four fields to six, and `buildRidershipView` now derives per-line
  figures as well as chart data. That is a genuine widening of a module candidate 1 scoped
  deliberately. It is justified by the glossary's own definition of a Ridership View — everything on
  screen that follows from one set of user choices — which the per-line figures plainly are.
- `src/test/builders.ts` gains `makeLineReadout`; `makeLine` keeps returning a bare `Line`. Two
  builders for two types, so a test cannot assert figures on something the app types as a `Line`.
- Four fields with no live references — `isAggregate`, `aggregatedLines`, `viewMap`, `division` —
  are deleted from `Line` in the same body of work, and `ridershipOverTime` becomes a column-key
  literal rather than a phantom field. They are not caused by this decision; they are removed because
  this is the change that makes `Line`'s contents load-bearing.
- `UserDashboardInputState` loses `visibleLines` and `updateLinesWithLineMetrics`, and the hook's
  suite drops from 61 tests to roughly 40. What remains is
  the URL contract, line metadata and selection — a down-payment on candidate 5, which owns that
  interface.
- Re-anchoring Line Metrics to the Month Window's endpoints remains open and remains its own
  decision, exactly as ADR-0004 left it. Nothing here forecloses it.
