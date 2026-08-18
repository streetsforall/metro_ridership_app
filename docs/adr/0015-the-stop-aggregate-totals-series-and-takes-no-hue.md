# The stop aggregate totals series, and takes no hue from the palette

Status: accepted

The stop figure draws several stops so a reader can compare them. It could not answer the next
question that comes with a multi-select — *what do these carry between them?* — and a reader was left
adding four curves by eye. The line chart has answered that question since long before the stop panel
existed, with an Aggregate tick in its filter band, so the stop panel now offers the same tick in the
same place: at the right-hand end of the `Select All` row, mirroring `LineFilters` exactly.

Two things about it needed deciding.

## It totals series, not stops

The stop table's grain is stop × line. A stop served by two selected lines is two rows, two circles
and two drawn series, because its figures genuinely differ per line and there is no
stop-total-across-lines rollup in this project — `StopPanel` says so where it assembles `drawn`, and
`CONTEXT.md` says so under **Stop Selection**.

An aggregate has to sum something, and summing the drawn series does add that stop's two lines
together. That is not the rollup this project declines to derive, and the difference is not a
technicality: **the forbidden thing is presenting a cross-line total as a figure *for a stop***, in a
row or a popup where a reader would take it as that stop's ridership. The aggregate claims nothing of
the kind. It is one series labelled `Aggregate`, sitting above the series it totals, and the figure's
caption already counts stops and series separately whenever the two differ — which is exactly the
case where the distinction would otherwise be invisible.

The alternative was to deduplicate by stop key before summing. Rejected: it would have to pick one of
the two lines' figures to keep, and there is no principled way to choose. Summing both is the only
answer that uses all the data the figure is already showing.

## A gap stays a gap

A stop that did not report a month contributes nothing to that month rather than zero, so one stop's
missing month cannot read as ridership collapsing across the selection; a month **no** drawn stop
reports stays `null`. This is `buildAggregateSeries`' rule at line grain, restated at stop grain for
the same reason, and it is the reason `spanGaps` is off on both charts. Boardings and Alightings are
summed independently — a month can be a gap in one and a figure in the other, and borrowing one's
answer for the other would invent data.

## It takes no hue from the selection palette

[ADR-0014](0014-colour-in-the-stop-series-chart-means-which-stop.md) bought a scarce thing: inside
this one figure, hue means which stop. Spending a ninth hue on the aggregate would say the aggregate
was a ninth stop, and the palette cycles at eight, so it would eventually *be* a stop's colour. A
Metro line colour would say it was a line. Neutral grey — `stone-700`, in `AGGREGATE_COLOR` beside the
palette it is deliberately not part of — claims neither, and it is the same move the map makes with
its selection ring for the same reason.

Dash is untouched: it still means the Stop Measure, for the aggregate as for every other series, so
`both` draws a solid Boardings total and a dashed Alightings one. What separates the aggregate from
the stops is its colour and the legend's own word for it, never a third dash pattern.

## Its state is its own

`stopagg=1`, not a second reader of `aggregate=1`. One tick answering for two charts would mean a
reader who wanted the stop total silently changed the chart above it, and a shared link could not
express one without the other.

## Alternatives

**No aggregate; mirror the line filter's layout only.** Cheapest, and it was on the table. Rejected
because the row would then have an empty right-hand end — the layout mirrors `LineFilters` because the
two tables offer the same controls, and mirroring the shape without the control is mimicry.

**A total in the caption rather than a series.** One number, no palette question, no gap question.
Rejected because the figure is about change over time and a single number cannot show a month where
the selection's total dips.
