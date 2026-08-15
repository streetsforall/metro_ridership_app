# The Event Gutter hit-tests itself, because Chart.js will not

Status: accepted

Transit Event shapes moved out of the plot and into the
[Event Gutter](../../CONTEXT.md) — the strip below the Month Axis rule. They had to: the shapes sat
on `chartArea.bottom`, which is the one row of pixels a Line reporting zero riders is drawn along,
so the D Line's flat run from 2020-07 to 2025-07 was buried under the very annotation explaining it.

Moving them down costs the reader clicking and hovering them, unless something replaces what
Chart.js stops doing. **The plugin that draws the gutter also hit-tests it**, via `afterEvent`, and
reports a month to the same pin and hover state the plot drives.

## Why Chart.js cannot do this

Two guards in `node_modules/chart.js/dist/chart.js`, neither configurable:

- `Chart#_handleEvent` wraps the `options.onClick` dispatch in `if (inChartArea)`. A click below the
  axis is delivered to the canvas, is turned into a Chart.js event, and is then dropped.
- `Chart#_getActiveElements` returns `lastActive` unchanged when the pointer is outside the plot
  rather than retargeting. A hover in the gutter leaves the tooltip describing whatever month the
  pointer last crossed inside the plot.

The tolerance on `inChartArea` is `_minPadding` — a couple of pixels. That is the whole reason the
shapes worked before this change: sitting exactly on `chartArea.bottom` put them inside the guard by
a hair. It was never a design, and nothing in the code said the shapes could not move.

`afterEvent` has no such guard. `Chart#_eventHandler` notifies it for every canvas event and passes
`args.inChartArea` as information rather than as a filter, which makes it the only hook that can see
a pointer below the plot.

## What this costs

There are now two routes to a pinned month — the chart component's `onClick`, and the gutter
plugin's `afterEvent` — and a reader meeting the second one will reasonably wonder whether it is
redundant. It is not. They cover disjoint regions, and `args.inChartArea` is the seam: the plugin
returns immediately when it is true, so exactly one of the two handles any given pointer event.

**The x-scale fallback is gone.** `handleClick` used to read `chart.scales.x` when a click found no
element under it, specifically so a click on the axis strip still pinned. That was the same job done
worse — it fired for clicks anywhere with no element, could not tell the gutter from the plot's
empty space, and had no hover equivalent, which is why hovering a shape never worked. Keeping both
would have left two paths to one outcome with no rule for which owns what.

## The rule this sets

**Anything later drawn below the plot carries its own hit-testing.** A second gutter row, a
brushable overview strip, an axis affordance — none of them will receive `onClick`, and none will
retarget a hover, however close to `chartArea.bottom` they sit. The plugin that paints a region owns
that region's pointer events, and `args.inChartArea` is how it stays out of the plot's way.

The corollary is that the gutter's callbacks must land on the *same* state the plot drives, not on a
parallel copy. `onGutterHover` is wired to the hover setter the tooltip's `external` handler writes,
and `onGutterClick` to the same `pinIndex` the plot's click path calls — which is what makes
hovering a triangle produce the identical readout to hovering its column, rather than a second
tooltip that agrees only by coincidence.

## Consequences

Gutter hover writes the hover index from `afterEvent`, and the built-in tooltip plugin clears it
from the same notification pass when the pointer is outside the plot. Both are registered in
`src/chart/index.ts`, tooltip first, and Chart.js notifies plugins in registration order — so the
gutter's write lands last and wins. That ordering is not asserted at the plugin seam, because a unit
test of it would pin the mechanism rather than the behaviour. It is covered where it is observable:
`e2e/chart-interaction.spec.ts` hovers a triangle and asserts the tooltip names that month.

The gutter's own unit tests assert the two things a screenshot cannot say — that the callbacks fire
for a pointer below the axis and stay silent when `inChartArea` is true, and that nothing is painted
at `chartArea.bottom` at all.
