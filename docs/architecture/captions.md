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
`utils/`, `data/`, `@types/` — with exactly one domain folder, `src/ridership/`. ADR-0007 gives the
rule: a folder with an `index.ts` is a sealed module reached only through that file, everything
else is loose by default, and a new folder is earned by invariants a caller must not reach past
rather than by tidiness. And the prose is the system's memory — `CONTEXT.md` for the vocabulary,
seven ADRs for the decisions, `docs/how-it-works.md` for how the derivation actually runs. Read it
before changing behaviour that looks wrong. `docs/README.md` says what to read in which order.

## 03-python-data-pipeline — The Python data pipeline

How data gets into the repo: three independent chains, left to right. Nothing here runs in CI — a
human runs these scripts and commits the result, which is why `src/data/ridership.json` is a
checked-in 7 MB file rather than a build artifact.

`update_ridership.py` is the incremental path: when Metro publishes a single new month, it merges
that month into the canonical file instead of rebuilding it from every workbook. Every script has
a `test_*.py` of its own in `scripts/tests/`.

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

## 06-runtime-consume-the-view — Consuming the view

The second half: how one `RidershipView` reaches the screen.

`buildRidershipView` returns `metrics` and `coverage` keyed by line id — everything a caller needs.
`buildLineReadouts` joins them onto each `Line`, `listedReadouts` narrows to the rows the table
shows, and `LineSelector`, `LineTableRow`, `SummaryData`, `Map` and `mapPopup` all take a
`LineReadout`. Figures flow one way and are thrown away with the window that produced them.

**ADR-0005 is fully landed.** It took two changes: #154 moved every consumer onto readouts, and
#167 deleted the write-back — `updateLinesWithLineMetrics`, which used to stamp eight derived
fields back onto every `Line` and mint a new array that re-entered the memo it came from. With it
went `isVisibleLine` and `visibleLines`, and `selectAllVisibleLines` became
`selectAllListedLines(ids)`: the hook can no longer re-derive which rows are listed, so
`LineSelector` passes the ids it is displaying.

The one behaviour change was a transient — the table no longer shows the previous window's rows for
a single commit while the effect round-trips. Settled state is identical, which is why no baseline
moved.

`LineSelector` reads `consolidated` directly and builds its own axis, because the table draws a
sparkline for every *listed* line while the chart covers only the *selected* ones.

## 07-component-tree — Component tree

Nine components, no router, no context providers. `App` spreads the entire hook state into
`LineSelector` with `{...userDashboardInputState}`, so that component's real interface is far wider
than its props list suggests.

`OutputArea` is `React.lazy` on purpose: it pulls in Chart.js and MapLibre, and keeping them out of
the entry chunk lets the header and line table paint first. Note the gate — expanding the line
selector *hides* `OutputArea` rather than unmounting it (#168). The wrapper is `display: contents`
when visible, so `OutputArea`'s own root stays the grid item and the layout is identical to the
conditional render it replaced; `display: none` when expanded takes it out of the grid entirely.
Unmounting used to tear down the Chart.js canvas and the MapLibre instance, so every collapse paid
for a fresh WebGL context, basemap style and tiles. Both libraries watch their container with a
ResizeObserver, so they re-measure themselves when the box comes back.

## 08-state-slices — State slices

All shared state lives in one custom hook: four slices, no Redux, no Zustand, no Context. Each
slice is seeded once from the URL in a lazy `useState` initialiser, so a shared link reconstructs
the view before the first render rather than after it.

The store derives **nothing**. It did — a `visibleLines` memo held the line-table's filter rule —
but #167 deleted it along with the write-back, and `listedReadouts` now owns that rule, working
over Line Readouts in `App`. The payoff is that `lines` changes identity only when a user actually
does something, which is what let the next diagram's dependency keys go away.

## 09-state-mutators-and-effects — Mutators, effects, and local state

Everything that writes. Three mutators touch `lines`, which is why that one array is the hinge the
whole store turns on, and one effect syncs the URL.

There used to be three `JSON.stringify` dependency keys here, load-bearing because the write-back
minted a fresh `lines` array on every derivation and reference equality would have fired the
effects forever. Removing the write-back (ADR-0005, #167) was the real fix, and all three keys went
with it — the URL effect now keys on `lines` directly. Two guards survive in `LineTableRow`, for
`ridershipRecords` and `chartDataset`, which genuinely are new references each render. Don't "fix"
those.

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

The types and how they relate. `Line` is identity and metadata, and nothing else — the block of
optional derived figures it used to carry was deleted in #167, which is what ADR-0005 asked for.
`LineSelection` is a narrower view of the same information: it is what `buildRidershipView`
actually accepts, and `Line` satisfies it structurally, which keeps derived figures from being
handed back into the module that produced them.

`LineReadout` is where every consumer reads from: `Line & Partial<LineMetrics> &
Partial<LineCoverage>`, derived per window and thrown away. There is now exactly one shape carrying
the figures, and it is the one that renders. `Month` is ADR-0006's replacement for the several
encodings a month has; it exists with a full spec and still has no production caller — #144, #145
and #146 are the migration onto it.

## 12-ridership-module-seam — The `src/ridership/` seam

`index.ts` is the module's entire public surface. Everything else in the folder is implementation,
so an import of `../ridership/chartData` from outside is *visibly* reaching past a seam — which is
the whole point of the folder existing (ADR-0003). A flat `src/utils/ridershipView.ts` could only
have asked for that in a comment.

The month-axis and coverage exports are a deliberate second entry point rather than a leak.
`buildRidershipView` derives the **chart**, over the **selected** lines only; the line table draws
a sparkline for every **visible** line and needs the wider union across all of `consolidated`.

## 13-month-windows — Month Window, Event Window, Month Axis

One rule — `S ≤ R ≤ E`, inclusive on both ends — stated once as `contains` in `utils/month.ts` and
reached through two adapters that differ only in what they accept: a record's `{year, month}`, or an
event's `"YYYY-MM"`. The chart, the stop panel and the context log therefore cover exactly the same
months for a given date range.

This used to be the single most surprising thing in the codebase. One user choice produced two
windows that disagreed by two months: records used `S ≤ R ≤ E − 2` — the end month **and the month
before it** were out — while the context log used an ordinary inclusive range. The offset was an
accident of `Date`'s 0-based months that ADR-0001 chose to keep rather than risk changing, and it
meant the chart hid the two most recent months of whatever range you asked for. ADR-0009 removed it
and regenerated the baselines that had pinned it.

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

In practice that teardown almost never runs: since #168 expanding the line selector hides
`OutputArea` with CSS rather than unmounting it, so the instance built on first paint is usually the
only one a session ever has.

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

Vitest runs the specs in jsdom, each in a `__tests__/` folder beside the code it covers. One of
them is not a code test at all: `src/data/__tests__/transit-events.test.ts` refuses to let an
event ship without a source URL — the type
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

It is worth reading as a straight line, because that is now what it is. Derive, join the figures
onto readouts, narrow to the listed rows, render. Nothing feeds back into the store, so there is no
second pass to settle — the D Line appears in the table with its figures and a partial-coverage
label on the same commit that draws it purple on the map.

## 21-docs-adr-map — Documentation and decision map

Two orders, and they are not the same. **Reading order** is the disclosure gradient a newcomer
walks — README, then the vocabulary, then how the derivation runs, then a guide for whatever
you're actually doing, then the ADRs when you want the reasoning. `docs/README.md` is the hub that
states it. **Authority order** is who wins on conflict: `CONTEXT.md` outranks the source by its own
rule — where a term there conflicts with a name in the code, the code is what's out of date — then
the ADRs, then the prose. `CLAUDE.md` sits at the bottom because it holds no facts of its own; it
is a pointer file, so it cannot contradict anything.

Of the seven ADRs, one is superseded and one is half-landed. 0003 deferred a `src/utils/`
reorganisation; 0007 replaces its pause with a standing rule, and the reorg itself is now tracked
in #170, blocked on the month migration. 0006's `month.ts` now has its first production callers:
both window rules are stated there and reached through the adapters in `src/ridership/`. #144, #145
and #146 — the rest of the migration, moving the app's other month encodings onto `Month` — are
still the most actionable thing in this set. 0005 is done: #154 moved every consumer onto Line Readouts and #167 deleted the
write-back, so no `Line` carries a derived figure any more.
