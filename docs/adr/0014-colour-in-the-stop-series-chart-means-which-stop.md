# Colour in the stop series chart means which stop, and nowhere else does

Status: accepted

Everywhere in this dashboard, colour means **which line**. A route on the map takes its line's colour,
a circle takes its line's colour in the fill, a series on the ridership chart takes its line's colour,
and the stop table's row sparkline takes its line's colour. That consistency was deliberate, and
`stopSeriesDatasets` said so: Boardings solid, Alightings dashed, "so colour keeps meaning *which
line* and nothing else."

The stop panel then became a multi-select, and the figure above the table had to draw several stops at
once. **The encoding ran out of channels.** Hue was spoken for by the line and dash by the Stop
Measure, so two stops on line 204 — the common case, since the table exists to rank one line's stops —
drew as two identical teal lines. Nothing distinguished them.

So in **the figure above the stop table, and only there**, colour means which stop. Each selected stop
takes a hue from an eight-entry palette in `src/utils/stopSelectionColors.ts`, and the legend names the
stop and its line beside that hue.

## Where the palette stops

It reaches the figure's series and nothing else. In particular:

- **The row sparkline stays line-coloured.** A row exists whether or not its stop is selected, so most
  rows have no selection colour to take, and the sparkline's job is to sit beside the Line column and
  agree with it.
- **The map's selection ring stays neutral.** Every selected circle rings in the same `#033056`.

The ring was the closer call. Giving each ring its stop's series colour would make the map a legend for
the chart, which is a real gain when a reader is comparing four stops across a corridor. It was
rejected because the map's circles are already saturated line colours at radii from 4 to 22 pixels, and
a second meaning in the ring would compete with the line hues rather than clarify them. Colour on the
map keeps answering one question.

`src/components/__tests__/Map.test.tsx` asserts the ring is one colour rather than a colour per stop.
That assertion exists so extending the palette onto the map fails a test instead of sliding in unread —
if a later change wants it, this file is what it should argue with.

## What this costs

**Colour answers two questions on one screen.** A reader looking at a violet series in the figure and
a teal sparkline three rows below is reading two different encodings. That is the price of drawing
several stops at once, and the mitigation is that neither hue is ever the sole signal: the legend names
each series, the Line column names each row's line, and the map popup names both.

**The palette cycles.** Selection is deliberately uncapped — `Select All` is scoped by the search
rather than capped, matching the line selector, which caps nothing either — so a ninth selected stop
repeats the first hue. Two stops sharing a colour is the honest consequence of that choice, and the
legend is what tells them apart.

**No hue in the palette is a Metro line colour.** Checked in `stopSelectionColors.test.ts`, so a series
never reads as a claim about which line it belongs to.

**Strictly, a hue means which drawn `(stop, line)` pair, not which stop.** The title says "stop"
because that is the reader-facing reading and the common case, where a stop appears on one selected
line. But `colorForSelectionIndex` is indexed over the drawn series, and the data's grain is stop ×
line — so a stop served by two selected lines takes two hues and consumes two palette slots. That is
correct rather than a leak: the two series carry genuinely different figures, and the legend names
the line beside each. The append-only ordering property is unaffected, because a stop added later
still appends and never recolours what is already drawn. The panel's caption counts stops and names
the series count separately whenever the two differ, precisely so this grain never has to be
inferred from the chart.

## Alternatives

**Hue by line, lightness by stop.** Keeps the documented rule intact and needs no ADR. Rejected
because it goes muddy past about three stops on one line, and dash — the obvious third channel — is
already the Stop Measure's.

**Small multiples: one line-coloured mini chart per stop.** Preserves every existing encoding and
reuses `StopSeriesChart` verbatim. Rejected because it costs roughly 14rem of height per stop, which
would have forced a cap on the selection, and because the dashboard already charts several *lines* as
several series in one plot — a stop panel that charted several stops differently would be the same
question answered two ways.

**Colour by stop, ring follows.** Discussed above.

## Where the split is written down

`src/utils/stopSeriesDatasets.ts` is the seam. It encodes the measure as dash and takes the colour from
its caller, because the two callers mean different things by it: `StopSparkline` passes
`getLineColor(lineId)` and `StopSeriesChart` passes `colorForSelectionIndex(index)`. The measure
encoding still lives in one place, which was the original reason that module exists — the colour is the
one thing it no longer decides.
