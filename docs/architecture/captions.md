# Diagram captions

One section per file in `mermaid/`. The heading is `## <filename stem> — <title>`; everything
below it is the caption. `scripts/build_architecture_docs.mjs` reads this file and pairs each
section with its `.mmd` by stem, so a section with no matching file — or a file with no section —
fails the build.

Captions carry the detail. The diagrams deliberately do not: a note box floating beside a graph
drags a long edge across it, so anything that reads as an aside belongs here instead.

## 01-whole-system — The whole system

The one view that contains everything else. Three stages, and the boundaries between them are
what matter: a **Python pipeline** that runs by hand and writes JSON into the repo, a **Vite
build** that re-encodes that JSON into a wire format, and a **browser** that derives everything on
screen from one set of user choices.

There is no backend. The repository *is* the database, `dist/` is the whole deployment, and the
URL query string is the only thing that survives a reload. Every remaining diagram drills into one
box here.

## 02-repository-map — Repository map

What lives where. Two things are worth noticing. `src/` is flat — `components/`, `hooks/`,
`utils/`, `data/`, `@types/` — with exactly one domain folder, `src/ridership/`, and ADR-0003 says
that is deliberate rather than the first step of a reorganisation. And the repo carries an unusual
amount of prose: `CONTEXT.md`, six ADRs, an architecture review, seven design plans. That is the
system's memory; read it before changing behaviour that looks wrong.

## 03-python-data-pipeline — The Python data pipeline

How data gets into the repo: three independent chains, left to right. Nothing here runs in CI — a
human runs these scripts and commits the result, which is why `src/data/ridership.json` is a
checked-in 7 MB file rather than a build artifact.

`update_ridership.py` is the incremental path: when Metro publishes a single new month, it merges
that month into the canonical file instead of rebuilding it from every workbook. Every script has
a `test_*.py` sibling — six in all.

## 04-build-pipeline — The build pipeline

`vite/ridership-data-plugin.ts` is the interesting part. The canonical JSON repeats six field
names on every one of ~42K rows and, imported normally, would inline about 6.6 MB of object
literal into the entry chunk. The plugin reads it once and produces two things from that single
cached pass: a minified columnar blob served at `/ridership.json`, and a `virtual:ridership-bounds`
module carrying just the min/max year and latest month.

The blob reaches the app two different ways — dev middleware in `configureServer`, an emitted
asset in `generateBundle` — so the runtime `fetch` is identical in both. The plugin is registered
in `vitest.config.ts` as well, or the virtual module would not resolve under the test runner.

## 05-runtime-load-and-derive — Loading and deriving

The core architecture, first half. Records are fetched rather than bundled, decoded from the
columnar blob, and handed with the user's choices to a single `buildRidershipView` call that
produces the whole derived view in one pass.

`null` is the loading state, not an empty array — the distinction is what lets the app filter and
show context-log events while the ridership data is still in flight. Note that the metrics loop
iterates `lines`, not the consolidated groups: a record whose `line_name` has no metadata entry
produces a group but no `Line`, and therefore no figures.

## 06-runtime-consume-and-writeback — Consuming the view, and the write-back

The second half, and the one live design problem in the app.

`buildRidershipView` already returns `metrics` and `coverage` keyed by line id — everything a
caller needs — yet `App.tsx:114` still calls `updateLinesWithLineMetrics`, which writes eight
derived fields back onto every `Line`. That mints a new `lines` array, which re-enters the memo it
came from; the `JSON.stringify` dependency keys exist to keep the loop from thrashing. It settles
only because the second pass produces figures identical to the first.

**ADR-0005 is now half landed.** #154 wired the replacement in: `App.tsx:98` builds `readouts` with
`buildLineReadouts`, `:103` narrows them with `listedReadouts`, and `LineSelector`, `LineTableRow`,
`SummaryData`, `Map` and `mapPopup` all take `LineReadout` rather than `Line`. What the ADR also
asked for — deleting the write-back — did not happen, so the consumers moved but the round trip
did not.

The stamped fields are consequently no longer what the screen renders: `buildLineReadouts` spreads
`metrics[line.id]` and `coverage[line.id]` *over* the `Line`, so this window's figures win. They are
still load-bearing, though, and that is the reason the effect cannot simply be deleted —
`isVisibleLine` in the hook gates on `line.averageRidership !== undefined`, and
`selectAllVisibleLines` behind the line table's *Select all* button runs through it.

`LineSelector` reads `consolidated` directly and builds its own axis, because the table draws a
sparkline for every *visible* line while the chart covers only the *selected* ones.

## 07-component-tree — Component tree

Eight components, no router, no context providers. `App` spreads the entire hook state into
`LineSelector` with `{...userDashboardInputState}`, so that component's real interface is far wider
than its props list suggests.

`OutputArea` is `React.lazy` on purpose: it pulls in Chart.js and MapLibre, and keeping them out of
the entry chunk lets the header and line table paint first. Note the gate — expanding the line
selector *unmounts* `OutputArea` rather than hiding it, so the chart and map rebuild from scratch
on collapse. `App.tsx:156-159` flags this.

## 08-state-slices — State slices

All shared state lives in one custom hook: four slices, no Redux, no Zustand, no Context. Each
slice is seeded once from the URL in a lazy `useState` initialiser, so a shared link reconstructs
the view before the first render rather than after it.

`visibleLines` is the only derived value in the store, and its memo key is
`JSON.stringify(lines)` rather than `lines` — see the next diagram for why. Since #154 nothing in
`src/` reads it but the hook's own spec; `listedReadouts` computes the same rule over readouts
instead. The rule it encodes is still live, though — `selectAllVisibleLines` shares
`isVisibleLine` with it.

## 09-state-mutators-and-effects — Mutators, effects, and local state

Everything that writes. Four of the five mutators touch `lines`, which is why that one array is the
hinge the whole store turns on.

The `JSON.stringify` dependency keys at `App.tsx:116`, `useUserDashboardInput.ts:168` and `:264` are
load-bearing, not sloppiness: `lines` is a fresh array on every derivation, so reference equality
would fire these effects forever. `CLAUDE.md` asks you not to "fix" them. The real fix is removing
the write-back that mints the array (ADR-0005), not changing the keys.

What is *not* in the store matters too. Expansion, the fetched records, sort state, the context-log
disclosure and every MapLibre handle stay local, so none of them participate in the derivation
above.

## 10-url-contract — The URL contract

Nine parameters, read once into lazy `useState` initialisers and written back with
`history.replaceState` on every change. No router, no `localStorage`, no server — this is the
app's entire persistence layer, and the reason every view is a shareable link.

The contract is asymmetric by design: `buses`/`trains` are written only when *off*,
`aggregate`/`logs` only when *on*, which keeps the common URL short. Malformed values fall back to
defaults rather than throwing. Nine ad-hoc reads and one hand-built writer are what candidate 5 of
the architecture review would replace with an explicit parsed contract; it is unscheduled.

## 11-domain-type-model — Domain type model

The types and how they relate. Read `Line` from the top down: identity and metadata first, then a
block of optional derived figures that ADR-0005 says do not belong there. `LineSelection` is the
same information minus that block — it is what `buildRidershipView` actually accepts, and `Line`
satisfies it structurally, which is what keeps derived figures from being handed back into the
module that produced them.

`LineReadout` is the destination, and since #154 it is where every consumer reads from:
`Line & Partial<LineMetrics> & Partial<LineCoverage>`, derived per window and thrown away. The
optional block on `Line` survives anyway, because the write-back that fills it is still running —
so both shapes carry the figures today, and only one of them is what renders. `Month` is
ADR-0006's replacement for the seven encodings a month currently has; it exists with a full spec
and still has no production caller.

## 12-ridership-module-seam — The `src/ridership/` seam

`index.ts` is the module's entire public surface. Everything else in the folder is implementation,
so an import of `../ridership/chartData` from outside is *visibly* reaching past a seam — which is
the whole point of the folder existing (ADR-0003). A flat `src/utils/ridershipView.ts` could only
have asked for that in a comment.

The month-axis and coverage exports are a deliberate second entry point rather than a leak.
`buildRidershipView` derives the **chart**, over the **selected** lines only; the line table draws
a sparkline for every **visible** line and needs the wider union across all of `consolidated`.

## 13-month-windows — Month Window, Event Window, Month Axis

The single most surprising thing in the codebase. One user choice produces two windows that
disagree by two months: records use `S ≤ R ≤ E − 2` — the start month is in, the end month **and
the month before it** are out — while the context log uses an ordinary inclusive range.

This reads like an off-by-one and is not. It is long-standing behaviour, users have shared URLs
against it, and `e2e/chart-content.spec.ts` renders windows through it into committed PNG
baselines, so normalising it would change what every existing link shows. ADR-0001 accepts it.

The Month Axis is derived after filtering: one shared axis for every series, because Chart.js
appends any label missing from `labels` to the end and a per-series axis scrambles the rest.

## 14-line-color-resolution — Line colour resolution

Nine rail and BRT lines carry hardcoded brand colours; every other line gets a deterministic
golden-angle hue, so a bus line looks the same on every render without anything being stored.
These are the colours this document is drawn in.

The honest part of the diagram is the right-hand branch. The map does **not** call `getLineColor`
— MapLibre paints from a `color` property baked into `metro_lines.geojson` by
`scripts/fetch_metro_lines.py`, which reimplements the same formula and the same brand table in
Python with a docstring reading "Must match lines.ts". Changing one desynchronises the map until
the geojson is regenerated, and no test would catch it.

## 15-map-lifecycle — Map lifecycle

The one imperative corner of an otherwise declarative app. MapLibre owns its own canvas, so
`Map.tsx` holds everything in refs and the component never re-renders on map state: one
`useEffect([])` builds the map, adds the two layers once the style has loaded, and tears it all
down on unmount.

Layer order is load-bearing — `lines-all` paints every route dimmed underneath, `lines-selected`
paints the chosen ones on top in brand colour, so selection reads as emphasis rather than as the
only thing on the map.

## 16-map-interaction — Map interaction and the test seam

What happens after the map exists. Selection changes only update a layer filter; the map is never
rebuilt.

Two details are load-bearing. The hover handler reads `linesRef.current` rather than the `lines`
closure, because it is installed inside the `load` callback and would otherwise capture the
mount-time array forever. And `window.__metroMap` exists purely so `e2e/map.spec.ts` has something
to await — a WebGL canvas gives the DOM no signal that it has finished drawing. Nothing in the app
reads it; don't delete it.

## 17-test-unit-and-python — Unit and Python suites

Vitest runs 20 co-located specs in jsdom. One of them is not a code test at all:
`src/data/transit-events.test.ts` refuses to let an event ship without a source URL — the type
makes `source` optional so fixtures stay cheap, and the guardrail closes the gap.

The Python side mirrors the pipeline exactly, one spec per script.

## 18-test-visual-regression — Visual regression

Nine specs across three projects. The map gets its own because it renders identical geometry at any
viewport, so running it twice would only double the flake surface.

Only `-linux.png` baselines are committed; Windows and macOS shots are git-ignored per-developer
scratch. A UI change that moves pixels therefore needs exactly one command,
`npm run test:e2e:update:linux`, which regenerates inside the same Docker image CI uses — the tag
resolved from the same `package-lock.json` the workflow reads.

## 19-ci-pipeline — CI pipeline

Two jobs. `build` lints, unit-tests, builds and uploads `dist/`; `e2e` downloads that artifact and
runs the visual suite against `vite preview`, so the app is built exactly once per run.

The Playwright container tag is derived from `package-lock.json` by `jq` and passed between jobs as
an output, so the browser build that produced the committed baselines can never drift from the
installed client.

## 20-interaction-sequence — Selecting a line, end to end

One click traced through every layer, to show how the pieces above compose. The user checks a box;
the hook mints a new `lines` array; the URL is rewritten; `buildRidershipView` re-derives the entire
view in one pass; chart, table, summary and map all update from that one result.

The `par` block is the write-back cycle seen live: rendering and re-deriving happen alongside each
other, and the loop settles only because the second pass produces figures identical to the first.

## 21-docs-adr-map — Documentation and decision map

Which document governs what, and where the code has not caught up. `CONTEXT.md` outranks the source
by its own rule — where a term there conflicts with a name in the code, the code is what's out of
date.

All six ADRs are accepted, but two are only half-landed, and differently. 0006's `month.ts` exists
with a full spec and no production caller at all. 0005 got its consumers in #154 — the line table,
summary panel, map and popup all read a Line Readout now — but not its deletion: the write-back
still stamps eight figures onto every `Line` on every derivation. Finishing it is the most
actionable thing in this whole set, and the remaining work is subtraction rather than addition.
