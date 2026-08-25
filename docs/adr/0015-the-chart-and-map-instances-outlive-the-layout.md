# The chart and map instances outlive every layout change

Status: accepted

The Chart.js canvas and the MapLibre instance are the two expensive objects this app builds. A
MapLibre instance is a WebGL context, a basemap style and a set of tiles fetched over the network; a
Chart.js instance is a canvas plus a full dataset registration. Both take long enough to build that a
reader notices, and both are *ready to draw* the moment they exist.

So the layout is arranged around a single constraint: **whatever the reader does to the arrangement of
panels, neither instance is torn down.** Panels hide, stretch, reflow and change column count, and the
two instances sit through all of it. [ADR-0008](0008-panel-layout-is-a-tailwind-grid-with-url-synced-settings.md)
decides *that* the layout is a Tailwind grid with URL-synced settings; this one records *why the grid
is shaped the way it is*, because every part of that shape has been mistaken for arbitrary at least
once.

## Instances outlive the layout

**`OutputArea` is lazy.** It pulls in Chart.js and MapLibre GL, and MapLibre is the single largest
dependency in the bundle. Loading `OutputArea` behind `React.lazy` keeps it out of the entry chunk so
the header and the line selector paint before the chart and map code has downloaded.

**`App.tsx` imports `./chart/months`, never the `./chart` barrel.** The barrel registers Chart.js as a
side effect, so importing it from `App` would pull Chart.js into the entry chunk and undo the lazy
boundary above. The narrower import is load-bearing, not a style preference, and a tidying pass that
"simplifies" it to the barrel silently costs the entry chunk its size.

**The right side is hidden, not unmounted.** While the line selector is expanded, the wrapper around
`OutputArea` goes to `display: none`; otherwise it is `display: contents`, which makes `OutputArea`'s
own root the grid item exactly as it was when this was conditionally rendered. The visible layout is
unchanged either way.

Unmounting was what this replaced, and it was expensive: every collapse tore down the WebGL context
and rebuilt the map from a fresh style and a fresh tile fetch, plus a chart rebuilt from scratch.
Nothing about the data had changed — only whether the panes were on screen.

**Coming back needs no manual re-measure.** Chart.js's responsive mode and MapLibre's `trackResize`
both watch their container with a `ResizeObserver`, which fires again when the box goes from zero back
to its real size. Adding a re-measure on top of that is redundant, and the `ResizeObserver` stub in
`e2e/helpers.ts` means it would be untestable anyway.

**The map is rendered in exactly one JSX position, and that position is never inside a branch.** The
summary-and-map row falls back to a single column when nothing is selected rather than rendering the
map from a second place, because moving it between branches would unmount MapLibre the moment the last
line was deselected. A layout refactor that "cleans up" by rendering the map in both arms of a
conditional reintroduces the teardown this decision exists to prevent.

## Grid sizing

**`min-w-0` on the `OutputArea` root.** It opts the grid item out of its automatic minimum, which is
otherwise its min-content width. Without it, a child that refuses to wrap — the summary row did, at
`xl` — hands the surrounding `1fr` track a min-content width larger than its share, and the whole page
scrolls sideways.

This is the same failure mode as a floored `aspect-ratio` box on a chart container, which transfers
height into min-content width and blows out the grid the same way. Both are cases of an intrinsic
minimum leaking upward through a `1fr` track, and `min-w-0` is the guard.

**Summary and map share a row from `lg` up.** With no summary beside it, the row falls back to one
column so the map spans the full width, rather than sitting in a `2fr` track with a hole next to it.

**The two panes stretch to a common height, and the map fills its pane** rather than sitting at a
fixed height inside a taller one — which is why the pane is a flex column, and what `#lineMap` in
`Map.css` is for. The row is as tall as whichever side is taller: the summary grows with the number
of selected lines, and the map holds a 400px floor below that.

**The map pane keeps `.pane`'s 2rem padding, like every other pane.** A full-bleed variant — the map
filling the card to its edge — was tried and reverted. The complaint it was meant to answer was the
*pane* not reaching the bottom of the row, and that is fixed by the common-height stretch above, so
full-bleed changed the map's inset without addressing the thing anyone had objected to.

## Consequences

Comments at these sites say one sentence and cite this ADR. That is the point of writing it: the
reasoning was previously carried only in four- and five-paragraph JSDoc blocks above the code, which
is both too long to read at the call site and too easy to delete.

The costs are real and worth naming. A hidden `OutputArea` is still mounted, so its effects still run
and its state still lives while the reader cannot see it — the memory a collapsed panel holds is the
price of not rebuilding it. And the constraints above are invisible in the code they govern: nothing
about `min-w-0`, `display: contents` or a single unbranched JSX position looks deliberate to a reader
who has not been bitten. Each has been "simplified" away at least once.

The one thing that would justify revisiting this is a cheap MapLibre instance. If the map ever becomes
fast to build — a different renderer, or a genuinely warm cache — hide-don't-unmount stops paying for
itself and the layout can be arranged for whatever reads best instead.
