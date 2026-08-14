<!--
  GENERATED FILE — do not edit. Built by scripts/build_architecture_docs.mjs.
  Edit the diagram in docs/architecture/mermaid/<name>.mmd or the prose in
  docs/architecture/captions.md, then run `npm run docs:architecture`.
-->

# metro_ridership_app — architecture

A whole-system view plus one diagram per subsystem. GitHub renders the fences below;
`architecture.html` and `architecture.pdf` in this folder are the same content, rendered.

## Contents

1. [The whole system](#the-whole-system)
2. [Repository map](#repository-map)
3. [The Python data pipeline](#the-python-data-pipeline)
4. [The build pipeline](#the-build-pipeline)
5. [Runtime data flow](#runtime-data-flow)
6. [Component tree](#component-tree)
7. [State model](#state-model)
8. [The URL contract](#the-url-contract)
9. [Domain type model](#domain-type-model)
10. [The `src/ridership/` seam](#the-srcridership-seam)
11. [Month Window, Event Window, Month Axis](#month-window-event-window-month-axis)
12. [Line colour resolution](#line-colour-resolution)
13. [The map subsystem](#the-map-subsystem)
14. [Test topology](#test-topology)
15. [CI pipeline](#ci-pipeline)
16. [Selecting a line, end to end](#selecting-a-line-end-to-end)
17. [Documentation and decision map](#documentation-and-decision-map)

---

## The whole system

The one view that contains everything else. Three stages, and the boundaries between them are
what matter: a **Python pipeline** that runs by hand and writes JSON into the repo, a **Vite
build** that re-encodes that JSON into a wire format, and a **browser** that fetches it and
derives everything on screen from one set of user choices.

There is no backend. The repository *is* the database, `dist/` is the whole deployment, and the
URL query string is the only thing that survives a page reload. Every remaining diagram drills
into one box here.

```mermaid
flowchart TB
  user(["User"])

  subgraph ext["External — outside the repo"]
    metroXlsx["LA Metro ridership workbooks<br/>.xlsx / .zip, published periodically"]
    metroGis["Metro GIS<br/>route geometry"]
    announce["Service-change<br/>announcements"]
    tiles["Basemap tiles<br/>OpenFreeMap positron<br/>or MapTiler if VITE_MAPTILER_KEY"]
  end

  subgraph authoring["Authoring — run by hand, never in CI"]
    raw[/"data/raw/"/]
    py["Python pipeline<br/>scripts/*.py"]
    nb["notebooks/<br/>scrapers and updaters"]
  end

  subgraph committed["Committed data — the repo is the database"]
    canonical[("src/data/ridership.json<br/>canonical records, ~7 MB")]
    meta[("src/data/<br/>metro_line_metadata_current.json<br/>line_distances.json<br/>transit-events.json")]
    geo[("public/metro_lines.geojson<br/>2.3 MB route geometry")]
  end

  subgraph build["Build — Vite 6"]
    plugin["vite/ridership-data-plugin.ts"]
    entry["Entry chunk<br/>App, hook, line table"]
    lazychunk["Lazy chunk<br/>OutputArea + Chart.js + MapLibre"]
    columnar[/"dist/ridership.json<br/>columnar cols + rows, minified"/]
  end

  host["Static host<br/>dist/ only — there is no backend"]

  subgraph browser["Browser runtime"]
    hook["useUserDashboardInput<br/>the only store"]
    view["buildRidershipView<br/>the whole derived view, one pass"]
    ui["Chart · line table · summary · map · context log"]
    urlbar["URL query string<br/>the only persistence layer"]
  end

  ci["GitHub Actions CI<br/>lint · unit tests · build · visual regression"]

  metroXlsx --> raw
  metroGis --> py
  announce --> py
  raw --> py
  nb --> py
  py --> canonical
  py --> meta
  py --> geo

  canonical --> plugin
  plugin --> columnar
  meta --> entry
  geo --> host
  entry --> host
  lazychunk --> host
  columnar --> host
  entry -. "React.lazy, on demand" .-> lazychunk

  host -- "fetch /ridership.json" --> view
  host --> hook
  geo -. "fetch at map init" .-> ui
  tiles -. "fetch at map init" .-> ui

  user -- "picks lines, months, day of week" --> hook
  hook --> view
  view --> ui
  ui --> user
  hook <--> urlbar
  urlbar -- "shareable link" --> user

  committed --> ci
  build --> ci

  classDef unbuilt fill:#fef3c7,stroke:#b45309,color:#111827
  classDef seam fill:#e0f2fe,stroke:#0369a1,color:#111827
  class view seam
  class urlbar unbuilt
```

---

## Repository map

What lives where. Two things are worth noticing. `src/` is flat — `components/`, `hooks/`,
`utils/`, `data/`, `@types/` — with exactly one domain folder, `src/ridership/`, and ADR-0003 says
that is deliberate and not the first step of a reorganisation. And the repo carries an unusual
amount of prose: `CONTEXT.md`, six ADRs, an architecture review, seven design plans. That is the
system's memory; read it before changing behaviour that looks wrong.

```mermaid
flowchart LR
  root(["metro_ridership_app/"])

  root --- srcN["src/<br/>the application"]
  root --- dataN["data/raw/<br/>source workbooks, input to the pipeline"]
  root --- scriptsN["scripts/<br/>Python pipeline + its tests"]
  root --- nbN["notebooks/<br/>Jupyter scrapers"]
  root --- viteN["vite/<br/>ridership-data-plugin.ts"]
  root --- publicN["public/<br/>favicon, metro_lines.geojson"]
  root --- e2eN["e2e/<br/>Playwright visual regression + baselines"]
  root --- docsN["docs/<br/>adr/ · agents/ · architecture/ · review"]
  root --- ghN[".github/workflows/ci.yml"]
  root --- perfN["perf/BASELINE.md"]
  root --- cfgN["configs<br/>vite · vitest · playwright · eslint · tailwind · tsconfig×4"]
  root --- prose["CLAUDE.md · CONTEXT.md · README.md"]

  srcN --- cmp["components/<br/>8 components, 7 specs"]
  srcN --- hooks["hooks/<br/>useUserDashboardInput — the store"]
  srcN --- rid["ridership/<br/>the one domain folder (ADR-0003)"]
  srcN --- utils["utils/<br/>lines · month · queryParams · ridershipData · dataDateRange · mapPopup"]
  srcN --- types["@types/<br/>domain types + ambient decls"]
  srcN --- dataDir["data/<br/>bundled JSON + the canonical dataset"]
  srcN --- assets["assets/<br/>SVG icons, logo"]
  srcN --- plans["plans/<br/>7 per-feature design notes"]
  srcN --- testDir["test/builders.ts<br/>fixture builders"]
  srcN --- rootFiles["App.tsx · main.tsx · index.css · test-setup.ts"]

  classDef domain fill:#e0f2fe,stroke:#0369a1,color:#111827
  classDef gen fill:#f1f5f9,stroke:#64748b,color:#111827
  class rid,hooks domain
  class docsN gen
```

---

## The Python data pipeline

How data gets into the repo. Nothing here runs in CI — a human runs these scripts and commits
the result, which is why `src/data/ridership.json` is a checked-in 7 MB file rather than a build
artifact.

The ridership chain is the main line; three side chains produce the geometry, the per-line route
lengths, and the transit-events file. Every script has a `test_*.py` sibling.

```mermaid
flowchart TB
  subgraph inputs["Inputs"]
    xlsx[/"data/raw/*.xlsx<br/>monthly bus workbooks"/]
    zips[/"data/raw/Rail *.zip"/]
    gisapi["Metro GIS endpoint"]
    sources["Published service-change<br/>announcements"]
  end

  subgraph ridershipChain["Ridership chain"]
    convert["convert_excel_ridership.py<br/>npm run load-ridership"]
    process["process_ridership.py<br/>normalise, dedupe, type"]
    update["update_ridership.py<br/>merge a new month into the canonical file"]
  end

  subgraph sideChains["Side chains"]
    fetchLines["fetch_metro_lines.py<br/>npm run fetch-lines"]
    distances["compute_line_distances.py"]
    checkEvents["check_transit_events.py<br/>npm run check-transit-events"]
  end

  subgraph outputs["Committed outputs"]
    ridJson[("src/data/ridership.json")]
    geojson[("public/metro_lines.geojson")]
    distJson[("src/data/line_distances.json")]
    events[("src/data/transit-events.json")]
  end

  tests["scripts/test_*.py<br/>one sibling per script, 6 in all"]

  xlsx --> convert
  zips --> convert
  convert --> process
  process --> ridJson
  update --> ridJson
  xlsx -. "a newly published month" .-> update

  gisapi --> fetchLines --> geojson
  geojson --> distances --> distJson
  sources --> checkEvents --> events

  ridershipChain -.-> tests
  sideChains -.-> tests

  note["Run by hand. CI never runs the pipeline —<br/>it consumes the committed JSON."]
  note -.- outputs

  classDef out fill:#dcfce7,stroke:#15803d,color:#111827
  classDef warn fill:#fef3c7,stroke:#b45309,color:#111827
  class ridJson,geojson,distJson,events out
  class note warn
```

---

## The build pipeline

`vite/ridership-data-plugin.ts` is the interesting part. The canonical JSON repeats six field
names on every one of ~42K rows and, imported normally, would inline about 6.6 MB of object
literal into the entry chunk. The plugin reads it once and produces two things from that single
pass: a minified columnar blob served at `/ridership.json`, and a `virtual:ridership-bounds`
module carrying just the min/max year and latest month.

The blob reaches the app two different ways — dev middleware in `configureServer`, an emitted
asset in `generateBundle` — so the runtime `fetch` is identical in both. The plugin is registered
in `vitest.config.ts` as well, or the virtual module would not resolve under the test runner.

```mermaid
flowchart TB
  canonical[("src/data/ridership.json<br/>pretty-printed array, keys repeated per row")]

  subgraph pluginBox["vite/ridership-data-plugin.ts — one encode(), cached"]
    encode["encode()<br/>read once, walk records once"]
    blob["columnar blob<br/>cols + rows, JSON.stringify with no spacing"]
    bounds["bounds<br/>minYear · maxYear · maxMonth"]
  end

  subgraph hooksBox["Vite plugin hooks"]
    resolveId["resolveId<br/>virtual:ridership-bounds"]
    load["load<br/>emits three const exports"]
    configureServer["configureServer<br/>dev middleware on /ridership.json"]
    generateBundle["generateBundle<br/>emitFile asset ridership.json"]
  end

  subgraph consumers["Consumers"]
    dateRange["src/utils/dataDateRange.ts<br/>dataMinYear · dataMaxYear · dataDefaultEndDate"]
    appFetch["src/App.tsx<br/>fetch('/ridership.json')"]
  end

  subgraph registered["Registered in both configs"]
    viteCfg["vite.config.ts<br/>dev + build"]
    vitestCfg["vitest.config.ts<br/>so the virtual module resolves under the test runner"]
  end

  subgraph otherPlugins["Other Vite plugins"]
    swc["@vitejs/plugin-react-swc"]
    ssl["@vitejs/plugin-basic-ssl<br/>command === 'serve' only"]
    vis["rollup-plugin-visualizer<br/>opt-in via ANALYZE=1"]
  end

  subgraph out["dist/"]
    indexHtml[/"index.html"/]
    entryChunk[/"entry chunk"/]
    lazyChunk[/"OutputArea-*.js + .css<br/>Chart.js + MapLibre"/]
    ridAsset[/"ridership.json"/]
    geoAsset[/"metro_lines.geojson<br/>copied from public/"/]
  end

  canonical --> encode
  encode --> blob
  encode --> bounds
  bounds --> load
  resolveId --> load
  load --> dateRange
  blob --> configureServer
  blob --> generateBundle
  configureServer -- "dev server" --> appFetch
  generateBundle --> ridAsset
  ridAsset -- "vite preview / static host" --> appFetch

  registered --- pluginBox
  otherPlugins --> out
  swc --> entryChunk
  entryChunk -. "React.lazy import" .-> lazyChunk

  classDef key fill:#e0f2fe,stroke:#0369a1,color:#111827
  class blob,bounds key
```

---

## Runtime data flow

The core architecture. Records are fetched (never bundled), decoded, and handed with the user's
choices to a single `buildRidershipView` call that produces the whole derived view in one pass.

Two things stand out. `buildRidershipView` already returns `metrics` and `coverage` keyed by line
id — everything a caller needs — yet `App.tsx:94` still calls `updateLinesWithLineMetrics`, which
writes eight derived fields back onto every `Line`. That write-back mints a new `lines` array,
which re-enters the memo it came from; the four `JSON.stringify` dependency keys exist to keep
that loop from thrashing. ADR-0005 accepted removing it, and `buildLineReadouts` is the
replacement — built, tested, and not yet imported by anything that renders.

```mermaid
flowchart TB
  subgraph load["Loading the dataset — App.tsx:34-44"]
    fetchCall["fetch('/ridership.json')<br/>AbortController, cancelled on unmount"]
    decode["decodeRidership(data)<br/>src/utils/ridershipData.ts"]
    records["ridershipRecords: RidershipRecord[] | null<br/>null IS the loading state"]
  end

  subgraph bundled["Bundled at import time"]
    lineMeta[("metro_line_metadata_current.json")]
    lineDist[("line_distances.json")]
    eventsJson[("transit-events.json")]
  end

  hook["useUserDashboardInput()<br/>lines · startDate · endDate · dayOfWeek<br/>searchText · modes · isAggregateVisible · showContextLogs"]

  subgraph derive["buildRidershipView — one pass, useMemo'd (App.tsx:75-86)"]
    group["group records by line<br/>Month Window filter, Selection Snapshot"]
    cover["buildCoverageByLine"]
    metricsLoop["lineMetrics per line<br/>iterates lines, not the groups"]
    axis["buildMonthAxis<br/>union of the selected lines' months"]
    align["alignToMonthAxis per line<br/>a missing month is a gap, never a zero"]
    agg["buildAggregateSeries<br/>always ordered last"]
    evfilter["Event Window filter<br/>inclusive, reads the LIVE selection"]
  end

  view["RidershipView<br/>months · datasets · consolidated · events · metrics · coverage"]

  subgraph consumers["Consumers"]
    outputArea["OutputArea<br/>chart · summary · context log · map"]
    lineSelector["LineSelector<br/>buildWindowMonthAxis over consolidated —<br/>a wider axis than RidershipView.months"]
  end

  writeback["updateLinesWithLineMetrics(consolidated)<br/>useEffect keyed on JSON.stringify(consolidated)<br/>stamps 8 derived fields back onto every Line"]

  readouts["buildLineReadouts + listedReadouts<br/>the ADR-0005 replacement — built, tested,<br/>NOT yet wired into the render path"]

  fetchCall --> decode --> records --> group
  lineMeta --> hook
  lineDist --> hook
  hook -- "lines, window, dayOfWeek" --> group
  eventsJson --> evfilter
  hook -- "live selection" --> evfilter

  group --> cover
  group --> metricsLoop
  group --> axis --> align --> agg
  cover --> view
  metricsLoop --> view
  agg --> view
  align --> view
  evfilter --> view

  view --> outputArea
  view --> lineSelector
  view -- "consolidated" --> writeback
  writeback -- "new lines array → re-derive" --> hook
  view -. "metrics + coverage, already returned" .-> readouts

  classDef cycle fill:#fee2e2,stroke:#b91c1c,color:#111827
  classDef pending fill:#fef3c7,stroke:#b45309,color:#111827
  classDef out fill:#dcfce7,stroke:#15803d,color:#111827
  class writeback cycle
  class readouts pending
  class view out
```

---

## Component tree

Eight components, no router, no context providers. `App` spreads the entire hook state into
`LineSelector` with `{...userDashboardInputState}`, so that component's real interface is much
wider than its props list suggests.

`OutputArea` is `React.lazy` on purpose: it pulls in Chart.js and MapLibre, and keeping them out
of the entry chunk lets the header and line table paint first. Note the branch on
`isLineSelectorExpanded` — expanding the selector *unmounts* `OutputArea` entirely rather than
hiding it, so the chart and map rebuild from scratch on collapse. `App.tsx:136-138` flags this.

```mermaid
flowchart TB
  main["main.tsx<br/>createRoot → StrictMode"]
  app["App<br/>container · no router · no context providers"]

  header["Header — leaf"]
  drs["DateRangeSelector — leaf<br/>Radix RadioGroup + Checkbox"]
  footer["Footer — leaf"]

  subgraph leftPane["#line-selector-pane — always mounted"]
    ls["LineSelector — container, 428L<br/>sorting · CSV · share · expand toggle"]
    lf["LineFilters — leaf<br/>search · bus/train ToggleGroup · aggregate"]
    ltr["LineTableRow × N — leaf<br/>Radix Checkbox + per-row Chart.js sparkline"]
  end

  suspense{{"isLineSelectorExpanded ?"}}
  susp["Suspense fallback<br/>'Loading…' pane"]

  subgraph rightPane["OutputArea — React.lazy chunk"]
    oa["OutputArea — container, 416L"]
    chart["LineChart (react-chartjs-2)<br/>#ridership-chart"]
    summary["SummaryData — leaf"]
    ctxlog["context-log panel<br/>#context-log-panel, inline JSX"]
    map["Map — leaf<br/>#lineMap, imperative MapLibre"]
  end

  main --> app
  app --> header
  app --> drs
  app --> leftPane
  app --> suspense
  suspense -- "true → OutputArea unmounted entirely" --> none["nothing rendered<br/>TODO at App.tsx:136-138"]
  suspense -- "false" --> susp --> oa
  app --> footer

  ls --> lf
  ls --> ltr
  oa --> chart
  oa --> summary
  oa --> ctxlog
  oa --> map

  app -. "spreads the entire hook state:<br/>{...userDashboardInputState}" .-> ls

  classDef lazy fill:#ede9fe,stroke:#6d28d9,color:#111827
  classDef warn fill:#fef3c7,stroke:#b45309,color:#111827
  class oa,chart,summary,ctxlog,map lazy
  class none warn
```

---

## State model

All shared state lives in one custom hook. No Redux, no Zustand, no Context — four slices
(window, lines, filters, toggles), a set of mutators, and two effects.

The `JSON.stringify` dependency keys at `App.tsx:96`, `useUserDashboardInput.ts:168` and `:264`
are load-bearing, not sloppiness: `lines` is a fresh array on every derivation, so reference
equality would fire these effects forever. `CLAUDE.md` asks you not to "fix" them. The real fix
is removing the write-back that mints the array (ADR-0005), not changing the keys.

```mermaid
flowchart TB
  subgraph store["useUserDashboardInput — the whole store. No Redux, Zustand or Context anywhere."]
    subgraph windowSlice["Month Window"]
      startDate["startDate — default new Date(2020, 6)"]
      endDate["endDate — default dataDefaultEndDate"]
      dow["dayOfWeek — Weekday | Sat | Sun"]
    end
    subgraph linesSlice["Lines"]
      lines["lines: Line[]<br/>createLinesData(), sorted by lineNameSortFunction"]
      visible["visibleLines — useMemo<br/>key: JSON.stringify(lines) + searchText"]
    end
    subgraph filterSlice["Filters"]
      search["searchText"]
      modes["modes: string[] — 'bus' | 'train'"]
    end
    subgraph toggleSlice["Toggles"]
      aggregate["isAggregateVisible"]
      logs["showContextLogs"]
    end
  end

  subgraph mutators["Mutators returned by the hook"]
    toggleLine["onToggleSelectLine(line)"]
    clear["clearSelections()"]
    selectAll["selectAllVisibleLines()"]
    updateMetrics["updateLinesWithLineMetrics(consolidated)"]
    setters["setStartDate · setEndDate · setDayOfWeek<br/>setSearchText · setModes · setLines<br/>toggleIsAggregateVisible · toggleShowContextLogs"]
  end

  subgraph effects["Effects inside the hook"]
    modeSync["modes → per-line visible<br/>useEffect on [modes]"]
    urlSync["state → history.replaceState<br/>useEffect, JSON.stringify(lines) in the deps"]
  end

  subgraph local["Component-local state — deliberately not in the store"]
    appLocal["App: isLineSelectorExpanded · ridershipRecords"]
    lsLocal["LineSelector: columnHeaderStates · isCopied"]
    oaLocal["OutputArea: isContextLogOpen"]
    ltrLocal["LineTableRow: isMounted · data"]
    mapLocal["Map: mapContainer · map · isStyleLoaded · linesRef (refs, not state)"]
  end

  bundledMeta[("metro_line_metadata_current.json<br/>+ line_distances.json")]
  urlIn["URL query string<br/>read once in lazy useState initialisers"]

  bundledMeta --> lines
  urlIn --> windowSlice
  urlIn --> linesSlice
  urlIn --> filterSlice
  urlIn --> toggleSlice

  modes --> modeSync --> lines
  lines --> visible
  search --> visible
  store --> urlSync

  toggleLine --> lines
  clear --> lines
  selectAll --> lines
  updateMetrics --> lines
  setters --> store

  note["Three JSON.stringify dependency keys are load-bearing<br/>(App.tsx:96, hook :168, :264). CLAUDE.md: do not 'fix' these."]
  note -.- visible

  classDef warn fill:#fef3c7,stroke:#b45309,color:#111827
  classDef cycle fill:#fee2e2,stroke:#b91c1c,color:#111827
  class note warn
  class updateMetrics cycle
```

---

## The URL contract

Nine parameters, read once into lazy `useState` initialisers and written back with
`history.replaceState` on every change. There is no router, no `localStorage` and no server, so
this is the app's entire persistence layer — and the reason every view is a shareable link.

The contract is asymmetric by design: `buses`/`trains` are written only when *off*,
`aggregate`/`logs` only when *on*, keeping the common URL short. Malformed values fall back to
defaults rather than throwing. Nine ad-hoc reads and one hand-built writer are what candidate 5
of the architecture review would replace with an explicit parsed contract; it is unscheduled.

```mermaid
flowchart LR
  subgraph params["Query parameters — the full contract"]
    p1["start=YYYY-MM"]
    p2["end=YYYY-MM"]
    p3["day=weekday | saturday | sunday"]
    p4["lines=801,802,720"]
    p5["q=free text"]
    p6["buses=0 — written only when OFF"]
    p7["trains=0 — written only when OFF"]
    p8["aggregate=1 — written only when ON"]
    p9["logs=1 — written only when ON"]
  end

  subgraph state["State slices"]
    s1["startDate"]
    s2["endDate"]
    s3["dayOfWeek"]
    s4["lines[].selected"]
    s5["searchText"]
    s6["modes includes 'bus'"]
    s7["modes includes 'train'"]
    s8["isAggregateVisible"]
    s9["showContextLogs"]
  end

  p1 <--> s1
  p2 <--> s2
  p3 <--> s3
  p4 <--> s4
  p5 <--> s5
  p6 <--> s6
  p7 <--> s7
  p8 <--> s8
  p9 <--> s9

  subgraph readPath["Read — once, on mount (hook L92-132)"]
    lazyInit["lazy useState initialisers<br/>new URLSearchParams(window.location.search)"]
    parsers["parseMonthParam · paramToDayOfWeek<br/>parseModesFromParams — src/utils/queryParams.ts"]
    fallback["malformed value → the default, never a throw"]
  end

  subgraph writePath["Write — on every change (hook L150-168)"]
    build["build a fresh URLSearchParams"]
    formatters["formatMonthParam · dayOfWeekToParam"]
    replace["history.replaceState(null, '', '?' + params)"]
  end

  params --> lazyInit --> parsers --> fallback --> state
  state --> build --> formatters --> replace
  replace -- "no history entry, no reload" --> params

  share["Share button copies window.location —<br/>every view is a link (CLAUDE.md)"]
  replace --> share

  note["No router, no localStorage, no server: the URL is the only persistence layer.<br/>Candidate 5 of docs/architecture-review-2026-08-05.md would make this<br/>an explicit parsed contract rather than nine ad-hoc reads. Unscheduled."]
  note -.- writePath

  classDef warn fill:#fef3c7,stroke:#b45309,color:#111827
  class note warn
```

---

## Domain type model

The types and how they relate. Read `Line` from the top down: identity and metadata first, then
a block of optional derived figures that ADR-0005 says do not belong there. `LineSelection` is
the same information minus the derived block — it is what `buildRidershipView` actually accepts,
and `Line` satisfies it structurally, which is what keeps derived figures from being handed back
into the module that produced them.

`LineReadout` is the intended destination: `Line & Partial<LineMetrics> & Partial<LineCoverage>`,
derived per window and thrown away. `Month` is ADR-0006's replacement for the seven encodings a
month currently has. Both exist; neither is wired in.

```mermaid
classDiagram
  direction TB

  class LineJson {
    <<on disk>>
    +line: number
    +mode: string
    +provider: string
  }

  class Line {
    <<identity + metadata>>
    +id: number
    +name: string
    +former?: string
    +mode: Bus | Rail
    +provider: DO | PT
    +selected: boolean
    +visible: boolean
    +distanceMiles?: number
    --derived, written back — ADR-0005 says these do not belong here--
    +averageRidership?: number
    +changeInRidership?: number
    +startingRidership?: number
    +endingRidership?: number
    +ridersPerMile?: number
    +ridershipOverTime?: number
    +coveredFrom?: string
    +coveredTo?: string
    +isPartialCoverage?: boolean
  }

  class LineSelection {
    <<the module's real input>>
    +id: number
    +selected: boolean
    +distanceMiles?: number
  }

  class RidershipRecord {
    +year: number
    +month: number
    +line_name: number
    +est_wkday_ridership: number | null
    +est_sat_ridership: number | null
    +est_sun_ridership: number | null
  }

  class ConsolidatedRecord {
    +selected: boolean
    +ridershipRecords: RidershipRecord[]
  }

  class ConsolidatedRidership {
    <<Record~lineId, ConsolidatedRecord~>>
  }

  class LineMetrics {
    +averageRidership: number
    +changeInRidership: number
    +startingRidership: number
    +endingRidership: number
    +ridersPerMile: number | undefined
  }

  class LineCoverage {
    +coveredFrom: string
    +coveredTo: string
    +isPartialCoverage: boolean
  }

  class LineReadout {
    <<Line & Partial~LineMetrics~ & Partial~LineCoverage~>>
    built, not yet wired in
  }

  class TransitEvent {
    +id: string
    +date: string
    +line_ids: number[]
    +title: string
    +description: string
    +category: EventCategory
    +source?: string
    +shakeup?: string
    +details?: object
  }

  class CustomChartData {
    +time: string
    +stat: number | null
  }

  class RidershipView {
    +months: string[]
    +datasets: ChartDataset
    +consolidated: ConsolidatedRidership
    +events: TransitEvent[]
    +metrics: Record~number, LineMetrics~
    +coverage: Record~number, LineCoverage~
  }

  class Month {
    <<src/utils/month.ts — unwired>>
    +year: number
    +month: number 1-based
  }

  LineJson --> Line : createLinesData enriches
  Line ..|> LineSelection : satisfies structurally
  RidershipRecord --* ConsolidatedRecord
  ConsolidatedRecord --* ConsolidatedRidership
  ConsolidatedRecord --> LineMetrics : lineMetrics(), null for an empty series
  ConsolidatedRidership --> LineCoverage : buildCoverageByLine()
  RidershipRecord --> CustomChartData : alignToMonthAxis()
  CustomChartData --* RidershipView
  ConsolidatedRidership --* RidershipView
  LineMetrics --* RidershipView
  LineCoverage --* RidershipView
  TransitEvent --* RidershipView
  Line --> LineReadout
  LineMetrics --> LineReadout
  LineCoverage --> LineReadout
  LineMetrics ..> Line : write-back today (the cycle)
  RidershipRecord ..|> Month : is structurally one
```

---

## The `src/ridership/` seam

`index.ts` is the module's entire public surface. Everything else in the folder is
implementation, so an import of `../ridership/chartData` from outside is *visibly* reaching past
a seam — which is the whole point of the folder existing (ADR-0003). A flat
`src/utils/ridershipView.ts` could only have asked for that in a comment.

The three month-axis and coverage exports are a deliberate second entry point rather than a leak.
`buildRidershipView` derives the **chart**, over the **selected** lines only; the line table draws
a sparkline for every **visible** line and needs the wider union across all of `consolidated`.

```mermaid
flowchart TB
  subgraph outside["Outside the seam — may import only from src/ridership (the index)"]
    app["src/App.tsx"]
    hook["src/hooks/useUserDashboardInput.ts"]
    lineSel["src/components/LineSelector.tsx"]
    utilsLines["src/utils/lines.ts<br/>type-only import of LineReadout —<br/>no runtime edge back in"]
  end

  subgraph folder["src/ridership/ — one domain folder (ADR-0003)"]
    idx["index.ts<br/>THE ENTIRE PUBLIC SURFACE"]

    subgraph exported["Exported"]
      brv["buildRidershipView<br/>+ RidershipView · RidershipViewInput · LineSelection"]
      align["alignToMonthAxis"]
      coverage["buildCoverageByLine + LineCoverage"]
      winAxis["buildWindowMonthAxis"]
      lm["lineMetrics + LineMetrics · LineMetricsInput"]
      readouts["buildLineReadouts + LineReadout · LineReadoutsInput"]
    end

    subgraph private["Module-private — importing these from outside is the violation"]
      chartData["chartData.ts<br/>timeKey · formatMonthKey · buildMonthAxis · buildAggregateSeries"]
      brvImpl["buildRidershipView.ts internals"]
      lmImpl["lineMetrics.ts internals"]
      lrImpl["lineReadouts.ts internals"]
    end
  end

  app --> idx
  hook --> idx
  lineSel --> idx
  utilsLines -. "import type only" .-> idx

  idx --> brv
  idx --> align
  idx --> coverage
  idx --> winAxis
  idx --> lm
  idx --> readouts

  brv --- brvImpl
  lm --- lmImpl
  readouts --- lrImpl
  align --- chartData
  coverage --- chartData
  winAxis --- chartData
  brvImpl --> chartData
  brvImpl --> lmImpl

  bad["import from '../ridership/chartData'"]
  bad -. "visibly reaching past the seam — ADR-0003" .-> chartData

  why["The three axis/coverage exports are a deliberate second entry point,<br/>not a leak: buildRidershipView derives the CHART, over SELECTED lines only.<br/>The table draws every VISIBLE line and needs the wider union across consolidated."]
  why -.- winAxis

  classDef forbidden fill:#fee2e2,stroke:#b91c1c,color:#111827
  classDef surface fill:#dcfce7,stroke:#15803d,color:#111827
  classDef pending fill:#fef3c7,stroke:#b45309,color:#111827
  class bad,private forbidden
  class idx surface
  class readouts pending
```

---

## Month Window, Event Window, Month Axis

The single most surprising thing in the codebase. One user choice produces two windows that
disagree by two months: records use `S ≤ R ≤ E − 2` (the start month is in; the end month **and
the month before it** are out), while the context log uses an ordinary inclusive range.

This reads like an off-by-one and is not. It is long-standing behaviour, users have shared URLs
against it, and `e2e/chart-content.spec.ts` renders windows through it into committed PNG
baselines — normalising it would change what every existing link shows. ADR-0001 accepts it and
`src/utils/month.ts` now encodes both rules once, as `containsOffset` and `contains`, though the
production filters still do the original `Date` and `YYYYMM` arithmetic.

The Month Axis is derived after filtering: one shared axis for every series, because Chart.js
appends any label missing from `labels` to the end and a per-series axis scrambles the rest. A
month a line does not report is a gap, never a zero.

```mermaid
flowchart TB
  choice["One user choice: start = 2025-01, end = 2025-06"]

  subgraph monthWindow["Month Window — records, chart, metrics"]
    mwRule["S ≤ R ≤ E − 2<br/>start included; end month AND the month before it excluded"]
    mwMonths["2025-01 · 02 · 03 · 04<br/>2025-05 and 2025-06 excluded"]
    mwCode["new Date(record.year, record.month) compared against<br/>new Date(year, month − 1) — 1-based data vs 0-based Date"]
  end

  subgraph eventWindow["Event Window — context log"]
    ewRule["S ≤ R ≤ E<br/>inclusive on both ends, correctly 1-based"]
    ewMonths["2025-01 · 02 · 03 · 04 · 05 · 06"]
    ewCode["year * 100 + month, compared numerically"]
  end

  disagree["The two windows disagree by two months, from the same user choice."]
  keep["Preserved, not reconciled: the app has always behaved this way,<br/>users have shared URLs against it, and e2e/chart-content.spec.ts renders<br/>windows through it into committed PNG baselines. — ADR-0001"]

  subgraph axis["Month Axis — derived after filtering"]
    axisDef["chronological union of the months the SELECTED lines cover"]
    axisGap["a month a line does not report is a GAP (null), never a zero"]
    axisWhy["one axis shared by every series — Chart.js appends any label missing<br/>from `labels` to the end, so a per-series axis scrambles the others"]
    axisTwo["buildMonthAxis → RidershipView.months (selected lines)<br/>buildWindowMonthAxis → the line table's wider axis (all consolidated)"]
  end

  onePlace["src/utils/month.ts encodes both rules once —<br/>contains() and containsOffset() over an ordinal.<br/>Landed and tested; the production path still uses the Date arithmetic. ADR-0006"]

  choice --> monthWindow
  choice --> eventWindow
  monthWindow --> disagree
  eventWindow --> disagree
  disagree --> keep
  mwMonths --> axis
  monthWindow -.-> onePlace
  eventWindow -.-> onePlace

  classDef warn fill:#fef3c7,stroke:#b45309,color:#111827
  classDef keepc fill:#fee2e2,stroke:#b91c1c,color:#111827
  class onePlace warn
  class keep,disagree keepc
```

---

## Line colour resolution

Nine rail and BRT lines carry hardcoded brand colours; every other line gets a deterministic
golden-angle hue, so a bus line looks the same on every render without anything being stored.

The honest part of this diagram is the right-hand branch. The map does **not** call
`getLineColor` — MapLibre paints from a `color` property baked into `metro_lines.geojson` by
`scripts/fetch_metro_lines.py`, which reimplements the same formula and the same brand table in
Python with a docstring reading "Must match lines.ts". Nothing tests the two against each other,
so changing one desynchronises the map until the geojson is regenerated.

```mermaid
flowchart TB
  getColor["getLineColor(lineId) — src/utils/lines.ts"]
  lookup{"lineId in definedLines?"}

  subgraph defined["definedLines — 9 hardcoded brand colours"]
    rail["801 A/Blue #0072bc · 802 B/Red #eb131b<br/>803 C/Green #58a738 · 804 E/Expo #fdb913<br/>805 D/Purple #a05da5 · 806 L/Gold #f9a825<br/>807 K #e56db1"]
    brt["901 G #fc4c02 · 910 J/Silver #adb8bf"]
  end

  golden["busLineColor(lineId)<br/>hue = round(lineId × 137.508 mod 360)<br/>hsl(hue, 75%, 45%)"]

  names["getLineNames(lineId)<br/>defined → 'A Line' (+ former 'Blue Line')<br/>otherwise → 'Line 720'"]

  subgraph consumers["TypeScript consumers — all read getLineColor"]
    chartDs["buildRidershipView datasets<br/>backgroundColor + borderColor"]
    sparkline["LineTableRow sparkline"]
    aggregate["Aggregate Series<br/>getLineColor(-1) fill · getLineColor(-2) stroke —<br/>negative ids fall through to the golden-angle branch"]
  end

  subgraph pyside["The map takes a different path"]
    pyFn["scripts/fetch_metro_lines.py:39-41<br/>bus_line_color() — the SAME formula, written a second time<br/>docstring: 'Must match lines.ts'"]
    pyRail["RAIL_COLORS — a second copy of the brand table"]
    geoProp["baked into metro_lines.geojson<br/>as a per-feature `color` property"]
    mapLayer["MapLibre 'lines-selected'<br/>paint: line-color = ['get', 'color']"]
  end

  pyFn --> geoProp
  pyRail --> geoProp
  geoProp --> mapLayer

  sort["lineNameSortFunction<br/>lettered lines first, then numbered by id.<br/>This order fixes legend, dataset AND table order."]

  getColor --> lookup
  lookup -- yes --> defined
  lookup -- no --> golden
  defined --> consumers
  golden --> consumers
  names --> chartDs
  names --> sort

  why["Deterministic by construction, so a bus line gets the same colour on every render."]
  why -.- golden

  dup["Chart and map agree because the formula is implemented twice and kept in step by hand.<br/>Nothing tests the two against each other; a change to one silently desynchronises the map<br/>until metro_lines.geojson is regenerated."]
  dup -.- pyFn

  classDef warn fill:#fef3c7,stroke:#b45309,color:#111827
  classDef risk fill:#fee2e2,stroke:#b91c1c,color:#111827
  class aggregate warn
  class dup risk
```

---

## The map subsystem

The one imperative corner of an otherwise declarative app. MapLibre owns its own canvas, so
`Map.tsx` holds everything in refs and never re-renders: one `useEffect([])` builds the map, a
second `useEffect([lines])` syncs the selection filter.

Two details are load-bearing. The hover handler reads `linesRef.current` rather than the `lines`
closure, because the handler is installed inside the `load` callback and would otherwise capture
the mount-time array forever. And `window.__metroMap` exists purely so `e2e/map.spec.ts` has
something to await — a WebGL canvas offers the DOM no signal that it has finished drawing.

```mermaid
sequenceDiagram
  autonumber
  participant OA as OutputArea
  participant M as Map.tsx
  participant ML as MapLibre GL instance
  participant Tiles as Basemap host
  participant Geo as /metro_lines.geojson
  participant W as window.__metroMap
  participant Spec as e2e/map.spec.ts

  OA->>M: render, lines prop

  Note over M: refs only — mapContainer, map,<br/>isStyleLoaded, linesRef. No React state.

  M->>M: useEffect([]) — guard: return if map.current != null
  M->>ML: new maplibregl.Map(container, STYLE_URL, center LA, zoom 10, min 8 max 16)
  Note over M,ML: STYLE_URL = MapTiler if VITE_MAPTILER_KEY,<br/>else OpenFreeMap positron
  M->>W: window.__metroMap = map.current
  Note over W: test seam only — MapLibre draws into a WebGL canvas,<br/>so a spec has no DOM handle to wait on. Inert in the app.
  ML->>Tiles: fetch style + tiles
  M->>ML: addControl(NavigationControl, top-right)

  ML-->>M: 'load'
  M->>M: isStyleLoaded.current = true
  M->>ML: addSource 'metro-lines' (geojson, generateId)
  ML->>Geo: fetch
  M->>ML: addLayer 'lines-all' — grey, opacity 0.15, below
  M->>ML: addLayer 'lines-selected' — line-color ['get','color'],<br/>width 5 when feature-state hover else 3
  M->>ML: on mousemove / mouseleave over 'lines-selected'
  M->>ML: setFilter 'lines-selected' to the initial selection

  rect rgb(238, 242, 255)
    Note over M,ML: Selection sync — useEffect([lines])
    OA->>M: lines changed
    M->>M: linesRef.current = lines
    alt style not loaded yet
      M-->>M: return — the 'load' handler will apply it
    else loaded
      M->>ML: setFilter 'lines-selected' ['in', ['get','line_id'], selectedIds]
    end
  end

  rect rgb(240, 253, 244)
    Note over ML,M: Hover popup
    ML-->>M: mousemove with features
    M->>ML: setFeatureState hover false on the previous id, true on this one
    M->>M: linesRef.current.find(l => l.id === line_id)
    M->>ML: popup.setHTML(buildPopupHTML(name, lineData))
    Note over M: reads the ref, not the closure — the 'load' handler<br/>captured the mount-time lines array and would go stale
  end

  Spec->>W: await window.__metroMap idle, queryRenderedFeatures()
  Note over Spec: own Playwright project — SwiftShader ANGLE,<br/>deviceScaleFactor 1, blank style stub

  M->>ML: cleanup — remove(), null the ref, delete window.__metroMap
```

---

## Test topology

Three suites that never overlap. Vitest runs 20 co-located specs in jsdom, including one that is
not a code test at all: `src/data/transit-events.test.ts` refuses to let an unsourced event ship.
Playwright runs 9 visual-regression specs across three projects — the map gets its own because it
renders identical geometry at any viewport. Six Python specs cover the pipeline.

Only `-linux.png` baselines are committed; Windows and macOS shots are git-ignored per-developer
scratch. A UI change that moves pixels therefore needs exactly one command,
`npm run test:e2e:update:linux`, which regenerates inside the same Docker image CI uses.

```mermaid
flowchart TB
  subgraph unit["Vitest — jsdom, globals, 20 specs co-located with the source"]
    setup["src/test-setup.ts<br/>polyfills window.matchMedia"]
    builders["src/test/builders.ts<br/>fixture builders"]
    uDomain["src/ridership/<br/>buildRidershipView · chartData · lineMetrics · lineReadouts"]
    uUtils["src/utils/<br/>lines · month · queryParams · ridershipData · dataDateRange · mapPopup"]
    uHook["src/hooks/useUserDashboardInput"]
    uComp["src/components/ — 7 specs<br/>DateRangeSelector · LineFilters · LineSelector · LineTableRow<br/>Map · OutputArea · SummaryData"]
    uApp["src/App.test.tsx"]
    uGuard["src/data/transit-events.test.ts<br/>a DATA guardrail: every event must carry a source URL"]
    excl["excludes e2e/** and .claude/**"]
    virt["ridershipDataPlugin registered here too,<br/>so virtual:ridership-bounds resolves"]
  end

  subgraph e2e["Playwright — visual regression, fullyParallel false, workers 1"]
    subgraph projects["Projects"]
      desktop["desktop — 1280×800<br/>testIgnore map.spec.ts"]
      mobile["mobile — Pixel 7, 390×844<br/>testIgnore map.spec.ts"]
      mapProj["map — SwiftShader ANGLE,<br/>deviceScaleFactor 1, testMatch map.spec.ts"]
    end
    subgraph specs["Specs — 9, with committed -linux.png baselines"]
      s1["visual.spec.ts — 6"]
      s2["chart-content.spec.ts — 10, scoped to #ridership-chart"]
      s3["line-filters.spec.ts — 5"]
      s4["summary-tiles.spec.ts — 4"]
      s5["map.spec.ts — 3"]
      s6["context-logs.spec.ts — 2"]
      s7["responsive-tablet.spec.ts — 2"]
      s8["table-view.spec.ts — 2"]
      s9["loading.spec.ts — 1"]
    end
    helpers["e2e/helpers.ts — gotoDashboard, mapMask"]
    thresholds["threshold 0.25 · maxDiffPixelRatio 0.02<br/>animations disabled · reducedMotion reduce"]
    server["webServer: build + preview locally,<br/>preview ONLY on CI (dist/ arrives as an artifact)"]
  end

  subgraph py["Python — 6 specs, one per pipeline script"]
    pyT["test_convert_excel_ridership · test_process_ridership<br/>test_update_ridership · test_fetch_metro_lines<br/>test_compute_line_distances · test_check_transit_events"]
  end

  baselines["Only -linux.png is committed.<br/>-win32.png / -darwin.png are git-ignored per-developer scratch."]
  regen["scripts/update_linux_snapshots.py<br/>regenerates in the same Docker image CI uses,<br/>tag resolved from package-lock.json"]

  setup --> unit
  builders --> unit
  projects --> specs
  helpers --> specs
  specs --> baselines
  baselines --> regen

  classDef warn fill:#fef3c7,stroke:#b45309,color:#111827
  classDef out fill:#dcfce7,stroke:#15803d,color:#111827
  class baselines warn
  class uGuard out
```

---

## CI pipeline

Two jobs. `build` lints, unit-tests, builds, and uploads `dist/`; `e2e` downloads that artifact
and runs the visual suite against `vite preview` — the app is built exactly once per run.

The Playwright container tag is derived from `package-lock.json` by `jq` and passed between jobs
as an output, so the browser build that produced the committed baselines can never drift from the
installed client. `--ipc=host` is not optional: Docker's default 64 MB `/dev/shm` crashes Chromium
mid-screenshot.

There is no deploy job and no deploy target in the repo, and CI never runs the Python pipeline.

```mermaid
flowchart TB
  trigger["push to main · pull_request to main"]
  conc["concurrency: one in-flight run per ref<br/>PR runs are cancelled when superseded; main runs never are"]
  perms["permissions: contents: read"]

  subgraph buildJob["Job: build — ubuntu-latest, 15 min"]
    co1["actions/checkout@v4"]
    node["setup-node from .node-version (22.23.2), npm cache"]
    ci1["npm ci"]
    resolve["Resolve Playwright version from package-lock.json<br/>jq → job output, so the image can never drift from the client"]
    lint["npm run lint — eslint ."]
    test["npm run test — vitest run"]
    build["npm run build — tsc -b && vite build<br/>tsc -b also type-checks e2e/ and playwright.config.ts"]
    upload["upload-artifact dist/ — 1 day, if-no-files-found: error"]
  end

  subgraph e2eJob["Job: e2e — needs build, 30 min"]
    container["container mcr.microsoft.com/playwright:v{version}-noble<br/>options --ipc=host, because Docker's 64MB /dev/shm<br/>crashes Chromium on full-page screenshots"]
    co2["actions/checkout@v4"]
    cache["cache ~/.npm — HOME is /github/home in a container job"]
    ci2["npm ci — for the playwright CLI and vite preview only;<br/>browsers come from the image"]
    dl["download-artifact dist/"]
    verify["test -s dist/index.html"]
    runE2e["npm run test:e2e — preview only, never rebuilds"]
    onFail["on failure: upload playwright-report/ + test-results/<br/>(the -actual / -diff triplets and traces), 14 days"]
  end

  trigger --> conc --> buildJob
  perms --- buildJob
  co1 --> node --> ci1 --> resolve --> lint --> test --> build --> upload
  buildJob -- "dist artifact + playwright-version output" --> e2eJob
  container --- co2 --> cache --> ci2 --> dl --> verify --> runE2e --> onFail

  note["No deploy job and no deploy target in the repo.<br/>dist/ is a plain static bundle — index.html, hashed assets,<br/>ridership.json, metro_lines.geojson."]
  note -.- upload

  note2["CI never runs the Python pipeline. It consumes committed JSON."]
  note2 -.- ci1

  classDef warn fill:#fef3c7,stroke:#b45309,color:#111827
  class note,note2 warn
```

---

## Selecting a line, end to end

One click traced through every layer, to show how the pieces above compose. The user checks a
box; the hook mints a new `lines` array; the URL is rewritten; `buildRidershipView` re-derives
the entire view in one pass; the chart, table, summary and map all update from that one result.

The `par` block is the write-back cycle seen live: rendering and re-deriving happen alongside
each other, and the loop settles only because the second pass produces figures identical to the
first, so the stringified dependency key stops changing.

```mermaid
sequenceDiagram
  autonumber
  actor U as User
  participant Row as LineTableRow
  participant Hook as useUserDashboardInput
  participant App as App
  participant View as buildRidershipView
  participant OA as OutputArea
  participant Map as Map
  participant URL as window.history

  U->>Row: check the box for the D Line (805)
  Row->>Hook: onToggleSelectLine(line)
  Hook->>Hook: setLines — new array, one line's `selected` flipped

  Note over Hook,URL: URL effect fires on JSON.stringify(lines)
  Hook->>URL: replaceState('?start=…&lines=805&day=weekday')

  Hook-->>App: new state object, re-render
  App->>View: useMemo — records, lines, window, dayOfWeek, includeAggregate

  activate View
  View->>View: group records by line under the Month Window,<br/>snapshotting `selected` once per line
  View->>View: buildCoverageByLine
  View->>View: lineMetrics per line — absent, not zeroed, when no records
  View->>View: buildMonthAxis over the selected lines' months
  View->>View: alignToMonthAxis per line — gaps stay null
  View->>View: buildAggregateSeries, ordered last (if enabled)
  View->>View: Event Window filter against the LIVE selection
  View-->>App: months · datasets · consolidated · events · metrics · coverage
  deactivate View

  par Render
    App->>OA: chartDatasets, months, lines, transitEvents
    OA->>OA: Chart.js redraws — the event markers plugin reads transitEvents
    OA->>Map: lines
    Map->>Map: setFilter 'lines-selected' → the D Line lights up in brand purple
  and Write-back
    App->>Hook: updateLinesWithLineMetrics(consolidated)<br/>useEffect keyed on JSON.stringify(consolidated)
    Hook->>Hook: setLines — stamps 8 derived fields onto every Line
    Note right of Hook: This mints a NEW lines array, which re-enters<br/>the useMemo above. The cycle settles because the<br/>second pass produces identical figures, so the<br/>stringified key stops changing. ADR-0005 removes it.
  end

  Note over App,Map: The line table now lists the D Line with its figures<br/>and a partial-coverage label — its data begins 2025-09.
  URL-->>U: the address bar is a shareable link to exactly this view
```

---

## Documentation and decision map

Which document governs what, and where the code has not caught up. `CONTEXT.md` outranks the
source by its own rule — where a term there conflicts with a name in the code, the code is what's
out of date.

All six ADRs are accepted, but two are only half-landed: 0005's `buildLineReadouts` and 0006's
`month.ts` both exist with full test coverage and no production caller. That gap is the most
actionable thing in this whole set. Separately, `CLAUDE.md` still refers to `src/utils/calc.ts`,
which ADR-0004 deleted.

```mermaid
flowchart TB
  subgraph authority["Authority order"]
    ctx["CONTEXT.md — the ubiquitous language.<br/>'Where a term below conflicts with a name in the source, the term wins.'"]
    adrs["docs/adr/ — decisions, all six accepted"]
    claude["CLAUDE.md — working notes for agents"]
    readme["README.md — data coverage, screenshots, CI runbook"]
  end

  subgraph decided["ADRs, and what each governs"]
    a1["0001 — the Month Window offset is deliberate"]
    a2["0002 — the view returns Chart.js dataset types"]
    a3["0003 — src/ridership/ is one domain folder"]
    a4["0004 — Line Metrics are one nullable shape"]
    a5["0005 — derived figures live on a Line Readout"]
    a6["0006 — a month is {year, month}, not a Date"]
  end

  subgraph code["Modules"]
    m1["buildRidershipView.ts + utils/month.ts"]
    m2["RidershipView.datasets"]
    m3["src/ridership/index.ts — the seam"]
    m4["lineMetrics.ts"]
    m5["lineReadouts.ts + utils/lines.ts listedReadouts"]
    m6["utils/month.ts"]
  end

  subgraph gap["Accepted, machinery landed, NOT yet in the render path"]
    g5["buildLineReadouts and listedReadouts exist and are unit-tested,<br/>but nothing in src/ imports them. App.tsx:94 still calls<br/>updateLinesWithLineMetrics, so figures are still written onto Line."]
    g6["month.ts exists with contains/containsOffset and its own spec,<br/>but the only reference outside its test is a plan document.<br/>The production filters still do Date and YYYYMM arithmetic."]
  end

  subgraph planning["Planning docs — intent, not decisions"]
    review["docs/architecture-review-2026-08-05.md<br/>six deepening candidates; 1 landed, 5 (URL contract) and 6 (CSV seam) unscheduled"]
    plans["src/plans/ — 7 per-feature design notes"]
    agents["docs/agents/ — domain.md · issue-tracker.md · triage-labels.md"]
    perf["perf/BASELINE.md"]
  end

  stale["CLAUDE.md still names src/utils/calc.ts,<br/>which ADR-0004 deleted. The doc is out of date, not the code."]

  ctx --> adrs --> claude --> readme
  a1 --> m1
  a2 --> m2
  a3 --> m3
  a4 --> m4
  a5 --> m5
  a6 --> m6
  a5 -.-> g5
  a6 -.-> g6
  review --> adrs
  plans --> review
  claude -.- stale

  classDef pending fill:#fef3c7,stroke:#b45309,color:#111827
  classDef risk fill:#fee2e2,stroke:#b91c1c,color:#111827
  classDef auth fill:#dcfce7,stroke:#15803d,color:#111827
  class g5,g6,gap pending
  class stale risk
  class ctx auth
```

---

<sub>Generated by `scripts/build_architecture_docs.mjs` from `mermaid/` + `captions.md`.</sub>
