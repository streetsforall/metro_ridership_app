# Metro Ridership

A client-side dashboard for exploring LA Metro bus and rail ridership over time. A user picks
some lines, a stretch of months and a day-of-week, and the app derives everything on screen —
the chart, the per-line metrics, the map highlighting and the context log — from that one set of
choices.

This glossary is the language the code should use. Where a term below conflicts with a name
currently in the source, the term below wins and the source is the thing that's out of date.

## Language

### The derived view

**Ridership View**:
Everything on screen that follows from one set of user choices — the month axis, the per-line
series, the aggregate, the per-line record groups, each line's summary figures and covered span,
and the context-log events. It is derived, never stored, and recomputed whole whenever any choice
changes.
_Avoid_: chart data, dashboard state, the memo

**Month Window**:
The stretch of months a Ridership View covers, chosen by the user as a start month and an end
month. **Inclusive of both ends** — ask for Jan 2022 to Dec 2022 and you get January through
December. Until [ADR-0009](docs/adr/0009-the-two-window-rules-are-one-rule.md) the end month and the
month before it were excluded, so the chart hid the two most recent months of the range asked for.
_Avoid_: date range, date window, time period

**Event Window**:
The stretch of months a Transit Event must fall in to appear in the context log. **The same rule and
the same bounds as the Month Window** — the log and the chart cover the same months. The two used to
disagree by exactly two months; ADR-0009 removed the disagreement, and the term survives only because
the two are reached through different code paths (a record's year-and-month, an event's `"YYYY-MM"`).
_Avoid_: treating this as a different rule from the Month Window

**Month Axis**:
The chronologically ordered union of every month covered by the selected lines. One axis is shared
by every series in a Ridership View, because a series drawn against its own months corrupts the
ordering of the others. A month a line does not report is a **gap** in that line's series, never a
zero.
_Avoid_: labels, months list, x-axis categories

**Event Gutter**:
The strip below the Month Axis rule where a month's Transit Events are drawn, one triangle per
distinct category. Chart.js does not hit-test outside its plot area, so the gutter's pointer
handling belongs to the chart plugin that draws it rather than to the chart's own element
callbacks.
_Avoid_: marker strip, axis dots, annotation row

**Category Chip**:
A Transit Event's category, drawn as a tinted label with the category's name written in it. One
chip wherever a category is shown, so the same event reads as the same event in every surface. It
takes the surface it sits on — light or dark — because a fill that reads as a tint on the panel's
white is a glare on the tooltip's stone-800. Its colours come from the same nine-entry
category-to-hue table the Event Gutter fills from, so a chip cannot drift from the shape marking the
event it describes. The name is written in the chip rather than left to hue: nine categories are
more than colour alone can carry, and the panel keeps its coloured left rule alongside the chip
rather than in place of it. Both surfaces are in use: the context-log panel's rows and the chart
tooltip's event entries. Where the chip appears, the title beside it is neutral — colour names the
category and nothing else.
_Avoid_: badge, tag, pill, category label

**Month Readout**:
What the chart says about one Month: its ridership per Line, then the Transit Events that Month
carries — one at a time, through an Event Carousel. It has two layouts and picks between them from
the width the chart measures for it, not from the viewport — a chart placed in a narrow panel on a
wide screen is a narrow chart. Above the
threshold it is a **floating box** beside the crosshair, flipping and clamping to stay inside the
plot. Below it the box is most of the plot's width and the clamp overrides the gap holding it off
the crosshair, so it becomes a **top strip** instead: full width, edge padding both sides, no flip
and no clamp, capped at a third of the plot's height and scrolling within that. It sits *above* the
chart rather than on any part of it, escaping the pane's padding and border to do so — the readout
and the Month it describes stop competing for the same pixels, which is the whole of the mode. The
cap is the reader's to lift: a pinned strip with anything under it offers **Expand**, which removes
the ceiling rather than raising it, so nothing is left clipped. Distinct from a Line Readout, which is figures for one Line
over the whole Month Window.
_Caution_: "strip" is the Event Gutter's word too, and the two are different things at opposite ends
of the plot. Say **top strip** or **Month Readout strip** where both are in play.
_Avoid_: tooltip content, hover card, mobile tooltip

**Event Carousel**:
How a Month Readout presents a Month carrying more than one Transit Event: one event on show, a
position indicator saying which of how many, and Prev/Next to step. **The same component and the
same behaviour in both of the readout's layouts** — the readout is not relearned between a phone and
a desktop. A Month with exactly one event has no carousel at all: there is nothing to step through
and "1 of 1" is not information. Moving to a different Month reopens at the first event. The
controls appear only on a Pinned Month, on the same terms as Expand — an unpinned readout does not
take the pointer, so a control on one could be seen and not pressed — while the position indicator
shows either way, since it is what tells a hovering reader that pinning would get them anywhere.
_Caution_: **the arrow keys are deliberately not bound to it.** Left and Right mean "change Month"
wherever focus sits, including on a control. The controls are reached by Tab and fired by Enter or
Space. Binding the arrows here is the obvious next change and the wrong one — the same key would
mean two things depending on invisible focus state.
_Avoid_: pager, slider, event list, stepper

**Pinned Month**:
The single sticky Month the chart, the tooltip and the context-log panel all read. Owned by the
output area rather than by any one of them, because they are three views of one piece of state.
**At most one exists, and it must be released before another can be taken** — a click while a Month
is pinned releases it and pins nothing, identically on the chart and in the panel. Distinct from the
hovered Month, which is transient and which a pin outranks. A pin marks what is read; it never opens
or scrolls a view in order to be seen. See
[ADR-0011](docs/adr/0011-a-pin-marks-it-never-moves-a-view.md).
_Avoid_: selected month, active month, focused month, sticky tooltip

**Range Selection**:
The drag across the plot that sets the Month Window, and the band drawn while that drag is in
progress. It begins only once the pointer has travelled far enough for the gesture to be a drag
rather than a click, so a plain click pins a Month and paints nothing. Deliberately mouse-only: a
horizontal drag across a chart is how a page is scrolled on a phone. **Never named with *window*** —
that word already belongs to the Month Window and the Event Window, and a third sense of it makes
all three ambiguous.
_Avoid_: sliding window, brush, drag window, range window

**Selection Snapshot**:
Whether a line was selected at the moment its records were grouped, recorded once per line rather
than re-checked per record. It is a property of the Ridership View, not of the line — the same line
can be selected in the app while an older Ridership View still reports it as unselected.
_Avoid_: selected flag, is-selected

**Aggregate Series**:
The month-by-month total across the selected lines, drawn as one additional series and always
ordered last. A line with no record for a month contributes nothing rather than zero, so an absent
line never reads as ridership collapsing.
_Avoid_: total, sum series, combined line

**Line Metrics**:
The five summary figures one Line's Ridership Records yield for the chosen Day Of Week — average,
absolute change, starting and ending ridership, and riders per mile. They are estimated from that
line's own first and last record inside the Month Window, **not** from the window's endpoints, so
two rows of the table can describe different periods; the table labels that difference rather than
the figures being redefined. A Line reporting no records in the window has **no** Line Metrics at
all, rather than zeroes. Riders per mile is absent, not zero or infinite, for a Line with no
recorded route length. See
[ADR-0004](docs/adr/0004-line-metrics-are-one-nullable-shape.md).
_Avoid_: calc, summary stats, line stats, the metrics

**Line Readout**:
One Line together with everything the current Ridership View derives about it — its Line Metrics and
the span its records cover. Derived per Month Window and thrown away; a Line never carries figures
from one window to the next, which is why a figure from an earlier window cannot survive a change of
window. A Line with no records in the window still has a Line Readout, just one with no figures. The
map's hover popup and the summary panel read the same Line Readouts the table does. See
[ADR-0005](docs/adr/0005-derived-figures-live-on-line-readouts.md).
_Avoid_: enriched line, updated line, line with metrics, line view, the row

**Listed Line**:
A Line Readout the line table currently shows. A Line is listed when its mode is switched on, its
name matches the search text, and it has figures for the Month Window — a Line with no records in the
window is absent from the table rather than shown with blanks. The map and the summary panel are not
filtered this way; they read every Line Readout and select on the user's own selection.
_Avoid_: visible line, filtered line, matching line

### Stop grain

**Boardings** / **Alightings**:
Riders getting on, and riders getting off, at one stop. The pipeline's wire format calls them
`ons` and `offs` after Metro's own export columns, and `StopMeasure`'s literals keep those
spellings because they are URL values — but **no text a reader sees ever says "ons" or "offs"**.
Alightings are the figure this app has never shown at any grain until now, and half of what stop
data is for.
_Avoid_: ons, offs, entries, exits, taps

**Stop Place**:
A stop or station as a place — its identity, its display name and, where GTFS knew one, its
coordinate. Identity is the **normalised-name slug** the pipeline mints (`bus:vermont-wilshire`,
`rail:union-station`), never Metro's row order, which renumbers when a line is extended. A Stop
Place GTFS had no geometry for is **kept, not dropped**: it still has ridership, so it belongs in
the ranked table and the series, and is simply absent from the map layer. Its `mode` says which
export it arrived in, not which filter lists it — G Line and J Line BRT stops are `Bus`.
_Avoid_: station, marker, point, stop id

**Stop Ridership Record**:
One Stop Place's Boardings and Alightings for one Line for one Month, carrying a separate pair for
each Day Of Week. The grain is **stop × line**, direction collapsed — a stop served by three lines
has three records per month, and there is deliberately no stop-total-across-lines rollup. `null` is
a Month the stop did not report, never a zero.
_Avoid_: stop row, stop data point

**Stop View**:
Everything the stop panel and the stop map layer draw that follows from one set of user choices —
the stop-grain Month Axis, the Stop Readouts, the map markers and the Stop Coverage Window. The
stop-grain parallel of a Ridership View, derived by one call and thrown away. It reads **the same**
Month Window predicate the Ridership View does; there is one rule and it is never restated.
_Avoid_: stop data, the stop memo

**Stop Readout**:
One Stop Place together with everything the current Stop View derives about it **for one Line** —
its average Boardings and Alightings, the net between them, and its share of that Line's total.
Derived per Month Window and thrown away, exactly as a Line Readout is
([ADR-0005](docs/adr/0005-derived-figures-live-on-line-readouts.md)). The ranked table, the map
markers and the map's hover popup all read the same Stop Readouts.
_Avoid_: stop with metrics, enriched stop, the marker

**Stop Measure**:
Which figure a Stop View ranks, sizes and draws by — Boardings, Alightings, or both summed. It
selects a figure rather than filtering anything, the same way Day Of Week does. On the map it is
carried by fill and stroke, never by a second colour ramp: colour already means *which line*.
_Avoid_: metric, mode, stat

**Stop Selection**:
The Stop Places a reader has picked out of the ranked table to compare — an **ordered** set, because
the order they were picked in is what fixes each one's colour on the chart. It is a set of Stop
Places rather than of Stop Readouts: a stop served by two selected Lines is picked once and drawn
twice, since its figures genuinely differ per Line and there is no stop-total-across-lines rollup.
Nothing bounds it. Picking a stop, unpicking it and clearing every pick are the only three things
that change it, and a table row, its checkbox and its map circle all ask for the first two.
_Avoid_: the selected stop, highlighted stops, active stops

**Stop Coverage Window**:
The span of Months stop-level data exists for at all — twelve, inside the chart's 2009 → 2026. It
is a property of the **data**, not of the user's choice, and the panel states it persistently
rather than only when something is missing. Where it does not reach the Month Window the panel
offers to move the window; it **never** clamps or widens one, because the window is what the reader
chose and what a shared link carries.
_Avoid_: stop date range, available months, the stop window

### The inputs

**Ridership Record**:
One line's reported ridership for one month, carrying a separate figure for each Day Of Week.
_Avoid_: data point, row, entry

**Day Of Week**:
Which of the three reported figures — weekday, Saturday or Sunday — a Ridership View reads.
Choosing one does not filter records; it selects which field of each Ridership Record is used.
_Avoid_: day type, service day

**Month**:
A calendar month — a year and a month number, nothing finer. The unit everything here is measured
in: a Ridership Record covers one, the Month Axis is a sequence of them, the Month Window is a pair.
Months are counted from 1, matching the data, the URL and the events file. A month is never
represented as a point in time, because a timestamp carries a day and a timezone that a month does
not have, and two timestamps for the same month can disagree about which month it is. See
[ADR-0006](docs/adr/0006-a-month-is-a-year-and-a-month-not-a-date.md).
_Avoid_: date, timestamp, period, calling one a `Date`

**Line**:
A Metro bus or rail service, identified by its numeric id. Carries display name, brand colour,
mode and route length. A Line's identity comes from metadata, not from ridership data — a Line with
no records in the window is still a Line. A Line carries **no** derived figures: averages, changes
and covered spans belong to its Line Readout and last only as long as the Month Window that produced
them.
_Avoid_: route, service, enriched line

**Line Selection**:
The minimum a caller must state about the lines for a Ridership View to be built: each line's id,
whether it is selected, its route length, and the order they come in. **Legend and dataset order
follow this order**, which is alphabetical by line name — not the order the user listed them in the
URL, and not the numeric order of line ids. Route length is metadata rather than selection; it is
stated here because riders per mile cannot be derived without it. Metadata may be stated this way;
figures the Ridership View derives may never be handed back to it.
_Avoid_: selected lines, line list

**Transit Event**:
A dated real-world change — an opening, an extension, a disruption, a service change — that
explains a movement in the numbers. An event with no line ids is system-wide and applies to every
line.
_Avoid_: annotation, marker, milestone

**Consolidated Ridership**:
The Ridership Records of a Month Window grouped by line, each group carrying its Selection
Snapshot. Consumed by the line table's sparklines and the CSV export, and the source each line's
Line Metrics are derived from.
_Avoid_: grouped records, ridership by line

## Scope note

`src/ridership/` and `src/stops/` are the domain folders in an otherwise flat `src/`. That is
deliberate: a folder with an `index.ts` is a sealed module whose index is its entire public
surface, and everything else in `src/` is flat by default — see
[ADR-0007](docs/adr/0007-a-folder-with-an-index-is-a-sealed-module.md), which supersedes
[ADR-0003](docs/adr/0003-one-domain-folder-not-a-repo-wide-reorganisation.md).
