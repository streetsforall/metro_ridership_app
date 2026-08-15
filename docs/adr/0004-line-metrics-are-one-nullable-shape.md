# Line Metrics are one nullable shape, returned by one function, and they do not carry coverage

Status: accepted

`src/utils/calc.ts` exported five functions — `calcAvg`, `calcAbsChange`, `calcStart`, `calcEnd`,
`calcRidersPerMile` — that always fired together, from exactly one production caller. Three of them
sorted a copy of the same records independently, so one line's figures cost three copy-and-sorts per
render. The fifth could only be called safely if the caller first checked that the line had a
distance, which is why `useUserDashboardInput.ts` carried an `if (updatedLine.distanceMiles)` around
it. The module was shallow: its interface was nearly as complex as its implementation.

We replace all five with one function, `lineMetrics({ records, dayOfWeek, distanceMiles })`,
returning a named `LineMetrics`. It sorts once and reads both endpoints off the same array, and the
missing-distance rule moves inside. The module moves to `src/ridership/lineMetrics.ts` and
`src/utils/calc.ts` is deleted. That placement is not a widening of ADR-0003 but the thing ADR-0003
anticipated: it names "collapsing `calc.ts` into one metrics interface" as one of two queued pieces
of work expected to move a file into the domain folder. Per-line summary figures are ridership
derivation, and `buildCoverageByLine` — the labelling layer that describes those same figures —
already lives there.

`CONTEXT.md` gains the term **Line Metrics**, which fixes the type name. The glossary outranks both
the source and the plans, so `calc` survives in no identifier.

**`lineMetrics` returns `null` for an empty series.** The five functions it replaces used sentinels:
`NaN` from `calcAvg`'s division by a zero count, and `0` from the guards PR #93 added to the other
three. `0` is indistinguishable from a real figure, and `NaN` forced a `Number.isNaN` clause into
`isVisibleLine` that the caller had to know to write. One `null` gate replaces five sentinel values,
and it states the honest thing: no records means no metrics, not zero riders and no change. This is
safe to change because an empty series is unreachable in production — `buildRidershipView` creates a
line's group only at the moment it pushes a record — and because the caller already had a branch for
*this line has nothing*, which clears the derived fields to `undefined`. An empty series now funnels
into that same branch, so `isVisibleLine`'s existing `!== undefined` check hides the row exactly as
the `NaN` check did. Nothing observable changes.

**`LineMetrics` does not absorb `coveredFrom` / `coveredTo` / `isPartialCoverage`.** Folding the
eight derived fields into one shape is tempting, and candidate 2 will want one shape to return. But
`isPartialCoverage` is defined against `buildWindowMonthAxis(consolidated)` — the union of every
line's months — so it cannot be computed from one line's records. Merging it would force
`lineMetrics` to accept the whole `ConsolidatedRidership` map, turning a per-line function into a
whole-view one and spending the depth this change buys. The two shapes have two different scopes,
and that is the reason they stay two shapes.

**PR #93's *label, don't redefine* policy is carried forward unchanged, not reopened.** Line Metrics
are still estimated from each line's own first and last record rather than from the Month Window's
endpoints, and the UI still labels that difference rather than the metric being redefined. We
considered re-anchoring here and declined: it moves displayed numbers, and this change's entire
value is that nothing observable moves, which is what makes "any red in the wiring PR is drift" a
usable review rule.

## Consequences

- One import replaces five. The call site loses a conditional and three of its four sorts.
- `Number.isNaN(line.averageRidership)` in `isVisibleLine` becomes unreachable and is removed in the
  same change that orphans it. The `!== undefined` presence checks stay: `changeInRidership` is
  legitimately exactly `0` for a single-record line, which is what PR #93 fixed.
- Callers must handle `null`. Today that is one call site with an existing branch; candidate 2 will
  inherit it as "omit the line from the returned map".
- `ridersPerMile` is declared `number | undefined`, not optional, so the key is always written and a
  spread onto a `Line` clears a previous window's figure rather than preserving it.
- `src/ridership/index.ts` grows a third export group. The folder is now the ridership derivation,
  its month-axis helpers **and** its per-line metrics — which is what ADR-0003 reserved it for.
- Re-anchoring Line Metrics to the Month Window's endpoints remains open, and remains its own
  decision. If it is ever taken, `coveredFrom` / `coveredTo` / `isPartialCoverage` may become
  redundant; nothing here forecloses that.
- Changing the empty-series contract would be a breaking change for any future caller, which is why
  it is recorded here rather than left to the type signature to imply.
