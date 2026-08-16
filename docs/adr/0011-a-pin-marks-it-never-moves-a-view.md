# A pin marks what is read; it never moves what is shown

Status: accepted, **fully landed** — the no-auto-move rule shipped in
[#200](https://github.com/streetsforall/metro_ridership_app/issues/200) and the release-first rule
in [#199](https://github.com/streetsforall/metro_ridership_app/issues/199).

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
  surfaces start disagreeing about what a click means. That includes the Event Gutter's own click
  path — [ADR-0010](0010-the-event-gutter-hit-tests-itself.md) already requires the gutter to land on
  the *same* pin state the plot drives rather than a parallel copy, and this rule is a property of
  that state rather than of any route into it.
- Escape, the press-outside release and the keyboard pin path are unchanged. All three already
  release rather than retarget, which is the rule this generalises.
- Completing a Range Selection still does not leave a Pinned Month behind. Nothing here changes that
  outcome; the suppression that produces it is a separate mechanism, and it is
  [#198](https://github.com/streetsforall/metro_ridership_app/issues/198) — not this decision — that
  narrows it to fire only on a promoted drag.
- The context-log panel's own collapse toggle, ordering and content are untouched. Only the
  automatic movement goes, and any state that existed solely to drive it goes with it.
- Specs asserting that pinning opens or scrolls the panel are asserting a behaviour that is being
  removed. They are deleted rather than adjusted, and replaced by ones asserting the panel holds
  still.
- `CONTEXT.md` gains **Pinned Month**, which states the release-first rule as part of the term.

### What release-first exposed: one gesture, two `onClick` dispatches

Found while implementing #199, and recorded here because it looks like a bug and is not.
`RidershipChart`'s click handler opens with `if (event.type !== 'click') return;`.

Chart.js's `_isClickEvent` is `type === 'mouseup' || type === 'click' || type === 'contextmenu'`,
and `_handleEvent` dispatches `options.onClick` for any of the three. `mouseup` is in the chart's
`events` list because the Range Selection plugin needs it and a plugin cannot subscribe on its own
account — so **one press and release reaches the pin handler twice**.

The per-month toggle this decision replaces survived that by accident: both passes computed their
answer from the same `pinnedMonth` prop, which had not re-rendered in between, so both asked for the
same month and the second changed nothing. Release-first has no such luck — the second request
releases what the first pinned, and a click pins nothing at all.

The guard also repairs the Range Selection suppression, which had never actually been doing its job.
`Chart#_eventHandler` runs `options.onClick` *before* `notifyPlugins('afterEvent')`, so on `mouseup`
the handler ran while the plugin's suppression flag was still unset and pinned the month the drag
released over; only the later `click` pass, the one that got suppressed, was ever guarded.

One deliberate behaviour change comes with it: a right-click inside the plot used to toggle the pin,
via `contextmenu`. It no longer does anything. Nothing asked for that behaviour and no spec covered
it.

### What release-first exposed: a release that released nothing

Found from a phone, after the Month Readout gained its top strip in #204. Recorded here rather than
as its own decision, because it is this rule finishing rather than an exception to it.

Release-first assumed that what sits *underneath* a released pin is transient. On a mouse it is: the
hovered Month is disposed of by the next movement and ended for good by `mouseout`. A touch screen
sends no `mouseout`, and a finger has no resting position — so the hover a tap synthesises is not
"the Month under the pointer" but "the last Month tapped", permanently.

Releasing a pin therefore did not release anything the reader could see. The readout stayed up in
its *unpinned* form, which on a narrow chart is a strip still capped at a third of the plot but with
no Expand control, no full description and no source link: a box naming a Month whose event it was
too short to show, and offering nothing to open. Meanwhile the context-log panel banded no row,
because nothing was pinned — the two views disagreed, which is the thing the shared pin exists to
prevent.

**So releasing a pin releases the Month Readout with it, on every pointer.** The claim above that
*"the tooltip carries the event content in full, so the context-log panel is a second view"* is what
this restores: unpinned on a phone, it carried none of it.

Every pointer, rather than only the ones that cannot hover, and that is a decision rather than
laziness. Asking the platform — `matchMedia('(hover: none)')`, and dropping the hover only there —
reads better and does not work: the same emulated phone answers that query differently between one
render and the next, so the fix would hold or not hold at random, and the test proving it would be
flaky in both directions. A rule that has to be true cannot rest on an answer that wobbles.

What it costs on a mouse: releasing a pin without moving the pointer takes the readout away rather
than leaving a hovering one behind, until the pointer moves. Small, and arguably what "release"
should have looked like all along — the reader clicking to dismiss gets a dismissal.

The plausible-looking alternative, recorded so it is argued with rather than rediscovered: decouple
**Expand** from the pin, and let the orphaned readout open itself. The strip sits wholly above the
plot and so, unlike the floating box, could safely take the pointer. It is still wrong. Unpinned
means clamped descriptions and no source links — that is what pinning *is* — so an expanded unpinned
strip would show its full height with its content still abridged, and "Expand" would mean "all of
the shortened version". That is precisely the confusion `STRIP_HEIGHT_SHARE` rejected a second cap
for. It would also leave a release that visibly releases nothing.

The two-click cost above is unchanged by this. It was already the price of the rule; the first of
the two clicks now clears the screen rather than half-clearing it.
