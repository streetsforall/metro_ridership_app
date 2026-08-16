# A pin marks what is read; it never moves what is shown

Status: accepted

A Pinned Month is a mark. It says *this is the Month everything is reporting on*, and that is the
whole of its job. It does not decide which Month gets marked next, and it does not open, scroll or
otherwise rearrange any view in order to be seen.

Two rules follow from that one principle, and they are recorded together because splitting them
would hide that they are the same rule:

- **Release before taking.** If any Month is pinned, a click releases it and pins nothing. A further
  click pins the Month it landed on. Identically on the chart and in the context-log panel.
- **No auto-move.** Pinning never opens the context-log panel and never scrolls a row into view.
  The panel's open state and scroll position belong to the reader.

## What motivated this

The accidental-repin report — [#196](https://github.com/streetsforall/metro_ridership_app/issues/196),
defects 4 and 5. A reader with a Month pinned clicks elsewhere on the chart meaning to dismiss the
readout, and pins something else instead. There is no way back to an unpinned chart except finding
the exact Month they started on, or knowing that Escape works. The same report carries the other
half: pinning a Month force-opens the context-log panel and scrolls its matching row into view, so a
reader part-way down the log is moved somewhere else by an action they took on the chart.

Both are the same mistake made twice. The pin was allowed to *do* things — to retarget itself, and
to move a view — on top of marking a Month.

## Why one decision and not two

A single pin with one release rule is explainable in a sentence: *click to pin, click again to
release, and one is the most you can have.* Direct-switching on the chart while the panel toggles is
one piece of state behaving two ways, which is two states wearing one name — and the reader is the
one who has to keep the two models in their head.

The auto-open and the auto-scroll are that same overreach in the other direction. A pin that moves
a view is a pin that has an opinion about what the reader should be looking at. Recorded separately,
the two would read as an interaction tweak and a scroll-behaviour tweak; recorded together, they
read as what they are — the boundary of what a pin is allowed to do.

That boundary is what a later change has to argue against. Restoring direct-switching as a "fix" for
the extra click, or restoring the auto-scroll as a "fix" for the off-screen row, each looks
reasonable on its own and each puts back half of the thing being removed here.

## What this costs, and why it is accepted

**Moving between Months takes two clicks rather than one.** That is the point: one accidental step
becomes two deliberate ones. The reader who wanted to move the pin loses a click; the reader who
wanted to dismiss it stops being surprised.

**Pin a Month from the chart while the panel is collapsed and the highlighted row is off-screen,
with no cue that it exists.** Deliberate. The tooltip carries the event content in full, so the
context-log panel is a second view of the events rather than the only one — the panel staying shut
costs the reader nothing they cannot read on the chart.

## Consequences

- The pin toggle states the rule once, where the Pinned Month is owned. The chart and the panel both
  route through it rather than each deciding for itself; a second copy of the rule is how two
  surfaces start disagreeing about what a click means.
- Escape, the press-outside release and the keyboard pin path are unchanged. All three already
  release rather than retarget, which is the rule this generalises.
- Completing a Range Selection still does not leave a Pinned Month behind. The suppression that
  stops a promoted drag from also pinning is a separate mechanism and is untouched.
- The context-log panel's own collapse toggle, ordering and content are untouched. Only the
  automatic movement goes, and any state that existed solely to drive it goes with it.
- Specs asserting that pinning opens or scrolls the panel are asserting a behaviour that is being
  removed. They are deleted rather than adjusted, and replaced by ones asserting the panel holds
  still.
- `CONTEXT.md` gains **Pinned Month**, which states the release-first rule as part of the term.
