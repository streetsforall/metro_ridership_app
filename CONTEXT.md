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
series, the aggregate, the per-line record groups and the context-log events. It is derived, never
stored, and recomputed whole whenever any choice changes.
_Avoid_: chart data, dashboard state, the memo

**Month Window**:
The stretch of months a Ridership View covers, chosen by the user as a start month and an end
month. The window's start month **is** included; the end month **and the month immediately before
it** are excluded. This is long-standing intended behaviour, not an off-by-one bug — see
[ADR-0001](docs/adr/0001-ridership-month-window-is-deliberately-offset.md).
_Avoid_: date range, date window, time period

**Event Window**:
The stretch of months a Transit Event must fall in to appear in the context log. Unlike the Month
Window it is **inclusive of both its start and end months**. The two windows are derived from the
same user choices but do not agree, and that divergence is deliberate — it is preserved, not
reconciled.
_Avoid_: treating this as the same thing as the Month Window

**Month Axis**:
The chronologically ordered union of every month covered by the selected lines. One axis is shared
by every series in a Ridership View, because a series drawn against its own months corrupts the
ordering of the others. A month a line does not report is a **gap** in that line's series, never a
zero.
_Avoid_: labels, months list, x-axis categories

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

### The inputs

**Ridership Record**:
One line's reported ridership for one month, carrying a separate figure for each Day Of Week.
_Avoid_: data point, row, entry

**Day Of Week**:
Which of the three reported figures — weekday, Saturday or Sunday — a Ridership View reads.
Choosing one does not filter records; it selects which field of each Ridership Record is used.
_Avoid_: day type, service day

**Line**:
A Metro bus or rail service, identified by its numeric id. Carries display name, brand colour,
mode and route length. A Line's identity comes from metadata, not from ridership data — a Line with
no records in the window is still a Line.
_Avoid_: route, service

**Line Selection**:
The minimum a caller must state about the lines for a Ridership View to be built: each line's id,
whether it is selected, and the order they come in. **Legend and dataset order follow this order**,
which is alphabetical by line name — not the order the user listed them in the URL, and not the
numeric order of line ids.
_Avoid_: selected lines, line list

**Transit Event**:
A dated real-world change — an opening, an extension, a disruption, a service change — that
explains a movement in the numbers. An event with no line ids is system-wide and applies to every
line.
_Avoid_: annotation, marker, milestone

**Consolidated Ridership**:
The Ridership Records of a Month Window grouped by line, each group carrying its Selection
Snapshot. Consumed by the line table, the summary metrics and the CSV export.
_Avoid_: grouped records, ridership by line

## Scope note

`src/ridership/` is the first and, for now, the only domain folder in an otherwise flat `src/`.
That is deliberate and is not the first step of a repo-wide reorganisation — see
[ADR-0003](docs/adr/0003-one-domain-folder-not-a-repo-wide-reorganisation.md).
