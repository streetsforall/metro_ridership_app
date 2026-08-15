# A folder with an `index.ts` is a sealed module; everything else in `src/` is flat by default

Status: accepted. Supersedes
[ADR-0003](0003-one-domain-folder-not-a-repo-wide-reorganisation.md).

ADR-0003 recorded a **pause**: `src/ridership/` exists as one domain folder, the rest of `src/`
stays flat, and the question of sorting `src/utils/` into domain folders waits on two named pieces
of work. A pause is a poor thing to leave in a decision record. It reads as unfinished business
rather than a rule, it gives a newcomer nothing to apply, and it expires quietly when the work it
names lands — or half lands, which is what happened.

This ADR replaces the pause with a rule.

## The rule

**A folder in `src/` with an `index.ts` is a sealed module. That index is its entire public
surface.** Importing anything else inside the folder from outside it is reaching past a seam, and
should fail review. `src/ridership/` is the only one today.

**Everything else in `src/` is flat by default.** `components/`, `hooks/`, `utils/`, `data/`,
`@types/` are containers, not modules: they group files by kind, seal nothing, and imply nothing
about what may import what.

**A new sealed module is earned, not assigned.** The test is whether a body of logic has invariants
a caller must not reach past — an ordering that must hold across every consumer, a derivation that
must not be re-entered, a representation that must not leak. Topical similarity is not enough.
`src/ridership/` qualifies because the shared Month Axis is only correct if every series is built
through the same entry point; a caller reaching `chartData.ts` directly can silently produce a
chart whose axis is wrong. Grouping `mapPopup.ts` and `queryParams.ts` into folders because they
are both "UI helpers" would buy nothing and cost every importer.

## What changed since ADR-0003

ADR-0003 deferred the `src/utils/` question to two follow-ups. One landed, one did not.

`calc.ts` collapsed into a single metrics interface ([ADR-0004](0004-line-metrics-are-one-nullable-shape.md)),
and the result went into `src/ridership/lineMetrics.ts` — as ADR-0003 predicted.

The month unification only half landed. `src/utils/month.ts` exists, with the `Month` and
`MonthWindow` types, eleven exports and its own spec, and **no production caller**. #144, #145 and
#146 are the migration that gives it one. So the precondition ADR-0003 set is not met, and the
evidence it wanted — where the month code settles once every consumer moves onto it — does not
exist yet.

ADR-0003 also predicted the month module would live in `src/ridership/`. It did not, and that looks
correct: `Month`, `MonthWindow`, `parseMonth` and `formatMonth` serve the URL parameters and the
date picker, not only the ridership derivation. Worth recording, because it is a concrete case of a
folder boundary being non-obvious from the outside — which is the argument for a rule rather than a
plan.

## The `src/utils/` reorganisation is deferred, not abandoned

It is tracked in
[#170](https://github.com/streetsforall/metro_ridership_app/issues/170), blocked on #144, #145 and
#146. That issue carries the current importer counts and the questions to answer when it unblocks.
Closing it as "no change, the rule is documented" is a legitimate outcome.

## Consequences

The asymmetry in `src/` is now explained by a rule a reader can apply, rather than by a decision
that has to be looked up. That rule is stated where a newcomer will actually meet it —
[`docs/how-it-works.md`](../how-it-works.md) and [`README.md`](../../README.md)'s repo map — because
the confusion ADR-0003 was really addressing was never about folder names. It was that nothing told
you `src/ridership/` was different from its neighbours.

`src/ridership/index.ts` already documents its own seam and points at ADR-0003. That reference stays
valid — 0003 is superseded, not withdrawn, and its reasoning about reviewable diffs still holds.
