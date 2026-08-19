# Testing

Two suites. Vitest for units and components, Playwright for visual regression. They do not overlap
and they fail differently.

## Unit and component tests

```bash
npm run test        # run all tests once
npm run test:watch  # watch mode
```

Vitest with `@testing-library/react`, jsdom. Specs live in a `__tests__/` folder inside the
directory they cover — `src/ridership/lineMetrics.ts` is tested by
`src/ridership/__tests__/lineMetrics.test.ts` — so a source directory lists only source.
Imports are therefore one level deeper than the module: `'../lineMetrics'` for the subject,
`'../../test/builders'` for shared fixtures. **`vi.mock()` paths obey the same rule**, and get
it wrong and the mock silently does nothing rather than failing.

`vitest.config.ts` sets no `include`, so the default glob picks up `__tests__/` at any depth; it
excludes `e2e/**` (Playwright's) and `.claude/**` (throwaway worktrees).

**Import `describe`/`it`/`expect` from `vitest` in every spec.** `vitest.config.ts` does set
`globals: true`, so the runtime would not need them — but `tsconfig.app.json` does not list
`vitest/globals` under `types`, so `tsc -b` cannot see them and `npm run build` fails on a spec
that omits the import. Runtime globals and type-level globals are separate switches and only one
is on.

One file:

```bash
npx vitest run src/ridership/__tests__/lineMetrics.test.ts
```

Or filter by name with `-t`. Shared fixtures are in [`src/test/builders.ts`](../../src/test/builders.ts).

The `ridership-data` Vite plugin is registered in `vitest.config.ts` as well as `vite.config.ts`,
because tests that touch the date bounds need `virtual:ridership-bounds` to resolve.

## Visual regression

Playwright screenshots the app and compares against committed baselines. **Eleven specs, 53 Linux
baselines.** A twelfth, [`chart-interaction.spec.ts`](../../e2e/chart-interaction.spec.ts), shoots
nothing — the chart's interactive layer is an HTML tooltip and DOM attributes, so it is asserted
rather than captured. [`stop-fixtures.ts`](../../e2e/stop-fixtures.ts) is not a spec either — it is
the route stub the stop suites share.

```bash
npm run test:e2e               # run the suite (builds, serves, compares)
npm run test:e2e:ui            # interactive UI / trace viewer
npm run test:e2e:update        # rewrite baselines for YOUR platform
npm run test:e2e:update:linux  # rewrite the Linux baselines (needs Docker)
```

Tests run against the production build served by `vite preview`, not the dev server.
`npm run test:e2e` builds automatically. Note that `vite preview` is **HTTPS** — `basicSsl` runs for
`command === 'serve'`, which covers preview — which is why the config sets `ignoreHTTPSErrors` and
`NODE_TLS_REJECT_UNAUTHORIZED=0`.

`npm run build` type-checks `e2e/` and `playwright.config.ts`, because `tsconfig.json` references
`tsconfig.e2e.json`. A broken spec fails the build. E2E code is part of the build, not a side
project.

### What each spec covers

Most specs run in two projects — desktop 1280×800 and mobile 390×844 — so one `toHaveScreenshot`
call yields two baselines. A few are gated to one viewport with `desktopOnly()` or `mobileOnly()`
([`e2e/helpers.ts`](../../e2e/helpers.ts)): either the view has no meaningful form at the other
breakpoint, an element crop would clip at the narrow viewport edge, or — the tooltip's strip — the
view *only* exists below a width the other project never reaches, so an ungated shot would file the
wrong layout under a name promising the right one.

The converse is worth stating too, because it looks like a missing gate: where sameness across the
two layouts is the *requirement* rather than a property that happens to hold, the gate would be the
bug. The Event Carousel is the case — one component and one behaviour on both the floating box and
the strip, so a reader does not relearn the readout between a phone and a desktop — so
`chart-interaction.spec.ts` runs its whole carousel block ungated and both projects execute the
identical script.

| Spec | Covers | Baselines |
| --- | --- | --- |
| [`visual.spec.ts`](../../e2e/visual.spec.ts) | full page — default dashboard, a line selected, the expanded selector | 6 |
| [`chart-content.spec.ts`](../../e2e/chart-content.spec.ts) | what the chart *draws* — one line, several, aggregate, Saturday, a narrow window, Event Gutter shapes at several category colours, a promoted Month Window drag mid-gesture | 13 |
| [`line-filters.spec.ts`](../../e2e/line-filters.spec.ts) | search, rail-only mode, the empty-mode state (desktop) | 5 |
| [`summary-tiles.spec.ts`](../../e2e/summary-tiles.spec.ts) | the summary pane — a negative change, several lines | 4 |
| [`map.spec.ts`](../../e2e/map.spec.ts) | all lines dimmed, selected in brand colours, selected at phone width | 3 |
| [`chart-tooltip.spec.ts`](../../e2e/chart-tooltip.spec.ts) | the readout — the floating box pinned with its source link, focused with the description clamped, focused on a month carrying an event, and pinned on a month carrying several, where the Event Carousel puts Prev/Next and a position above one entry (desktop); the strip it becomes on a narrow chart (mobile) | 5 |
| [`context-logs.spec.ts`](../../e2e/context-logs.spec.ts) | the context-log panel open, a window spanning all nine event categories, and a selected row wearing its band (plus two absence assertions, no shots) | 6 |
| [`responsive-tablet.spec.ts`](../../e2e/responsive-tablet.spec.ts) | 768×1024 via a file-level `test.use`, not a fourth project | 2 |
| [`table-view.spec.ts`](../../e2e/table-view.spec.ts) | sort chrome and ordering, a partial-coverage row (desktop) | 2 |
| [`loading.spec.ts`](../../e2e/loading.spec.ts) | the output pane mid-fetch, and that a failed fetch doesn't crash (desktop) | 1 |
| [`stop-panel.spec.ts`](../../e2e/stop-panel.spec.ts) | the stop panel — the ranked table, a selected stop's series, the no-overlap empty state, plus the lazy-load gate and the covered-period button (no shots) | 6 |

The map is masked out of every full-page shot, because a live MapLibre map over third-party tiles
never renders identically twice.

The stop suite route-stubs both payloads with `stop-fixtures.ts` rather than reading the 5.3 MB
`stop_ridership.bus.json`, which is rewritten every time an export lands: a baseline shot against it
would move for reasons unrelated to the code. The fixtures use **real stop keys**, because
`attachStopLocations` joins against the bundled `stop_locations.json` and an invented key would
decode fine and then be silently absent from the join.

### Why some shots are element-scoped

Five specs — `chart-content`, `summary-tiles`, `table-view`, `line-filters` and `context-logs` —
crop to a pane through `shootPane()` rather than shooting full-page, and that is worth keeping. On a
full-page capture the subject is a small fraction of the frame, and `maxDiffPixelRatio` is measured
against the whole page — so a chart drawing the wrong series, the wrong brand colours or the wrong
axis stays comfortably under the threshold and passes. Cropping makes the subject most of its own
frame, which is why `shootPane` also applies a tighter tolerance (`maxDiffPixelRatio: 0.01`) than
the full-page set's `0.02`. It parks the mouse at (0,0) first, so a stray cursor can't leave a hover
state in the shot.

**A ratio is still the wrong instrument when the subject is a few thin strokes.** The chart's event
shapes are ~1,900 px of a ~462,000 px crop, so recolouring *every* shape moves 0.4% and passes at
`0.01` — which is not a hypothetical: regenerating the ten other `chart-content` baselines against
the nine-hue palette left all ten byte-identical. `shootPane`/`shootChart` take an optional
`{ maxDiffPixels }` for these, which replaces the ratio rather than adding to it. Calibrate it by
mutation — break the thing on purpose and read the pixel count out of the failure — rather than by
picking a round number.

Prefer an id'd pane over a bare `<canvas>` or a `.pane`-plus-`.first()` selector: the pane's padding
and background give a stable box even when its contents resize, an id is a named element rather than
a DOM-order accident, and `#lineMap` sits outside these panes, so no mask is needed.

The Chart.js intro animation is disabled under test via `prefers-reduced-motion`, which
[`RidershipChart.tsx`](../../src/components/RidershipChart.tsx) honours and `playwright.config.ts` emulates.
That is a real accessibility behaviour rather than a test-only hook; making the canvas paint its
final frame immediately is a side benefit.

### Only the Linux baselines are committed

Playwright names each snapshot after the OS that captured it, and font rendering differs enough
between platforms to cause false diffs. CI runs on Linux, so every `*-snapshots/` directory commits
only the Linux set:

| Suffix | Used by | In git? | Regenerate with |
| --- | --- | --- | --- |
| `-linux.png` | CI — the only baselines that gate a PR | committed | `npm run test:e2e:update:linux` |
| `-win32.png` / `-darwin.png` | your local runs | git-ignored, per-developer scratch | `npm run test:e2e:update` |

**When a UI change legitimately alters the screenshots, regenerate the Linux set and commit it:**

```bash
npm run test:e2e:update:linux
```

That's the only baseline command a PR needs. It shells out to the same Playwright Docker image CI
uses — [`scripts/update_linux_snapshots.py`](../../scripts/update_linux_snapshots.py) resolves the
image tag from `package-lock.json`, the same source `ci.yml` reads, which is what keeps local
regeneration and CI in lockstep. It needs Docker Desktop running.

Your own platform's baselines are yours alone. The first local `npm run test:e2e` writes them, and
nothing you do to them can turn CI red.

**Never regenerate baselines to silence a diff you can't explain** — that deletes the evidence.

That rule needs help from the specs, because `--update-snapshots` will happily bake a *wrong* view
into a green baseline: a mistyped query param renders some other valid-looking page, and the
regenerated PNG then asserts it forever. So a shot whose subject is the point of the test asserts
that subject in the DOM first — `context-logs.spec.ts` checks its row count and all nine category
labels as text before capturing, and `chart-content.spec.ts` proves the chart rendered rather than
the "Please select a Metro line." placeholder. The screenshot pins the pixels; the assertions pin
what the pixels are *of*.

**A DOM assertion is not a visibility assertion, and the gap is wider than it looks.** `toContainText`
passes on a node scrolled out of an `overflow-y-auto` box, and `toBeVisible` passes on one merely
clipped by an ancestor. So a subject can be asserted, present, and absent from every pixel of the
capture. The chart readout is the live example: below 480px of measured chart width it becomes a
strip capped at a third of the plot, and a crop of it at 390px holds the month heading and one
ridership row while the event block sits below the fold — which is why each of that spec's tests is
gated to the one project whose layout it is named for, and asserts `data-layout` before shooting.
When a subject can be scrolled or clipped, assert the layout that puts it on screen, not only the
text.

To regenerate one project or one suite:

```bash
npm run test:e2e:update:linux -- --project=map
npm run test:e2e:update:linux -- --update-snapshots=all chart-content
```

The explicit `=all` is load-bearing. `--update-snapshots` takes an *optional* mode argument, so a
bare positional filter directly after it is swallowed as the mode and the run dies with
`argument 'chart-content' is invalid`. Flag-shaped filters like `--project=map` are unaffected.

**Bumping `@playwright/test` means regenerating the Linux baselines in the same PR** — a new browser
build re-renders text. The CI container tag follows the lockfile automatically, so `ci.yml` itself
needs no edit.

### The map suite

[`e2e/map.spec.ts`](../../e2e/map.spec.ts) runs in its own `map` project — once, not per-viewport —
and gets determinism by stubbing the basemap: every off-localhost request is fulfilled with a blank
style, one solid background layer and no sources, so no tiles, sprites or glyphs are fetched and the
only thing that paints is the route geometry the app loads from same-origin
`public/metro_lines.geojson`. That is the part that actually regresses when line data or map styling
changes.

Beyond its three screenshots it asserts on what MapLibre actually rendered — the layer stack, and
the `line_id`s each layer paints, read back with `queryRenderedFeatures`. Those assertions fail with
a list of line IDs instead of a pixel count, so they localise a broken selection filter far faster
than a diff image does; the screenshots cover what IDs can't express — colour, width, opacity, draw
order.

Two pieces make it deterministic and are worth not breaking:

- [`Map.tsx`](../../src/components/Map.tsx) publishes the live map as `window.__metroMap`. It is a
  test seam and nothing in the app reads it — but without a handle on the instance there is no way
  to wait on a WebGL canvas or inspect it. The spec uses it to await MapLibre's `idle` event rather
  than sleeping. **Don't delete it.**
- The `map` project in [`playwright.config.ts`](../../playwright.config.ts) pins
  `deviceScaleFactor: 1` and forces ANGLE's SwiftShader backend, so rasterisation happens on the CPU
  and does not depend on the host GPU.

With the basemap stubbed, repeated runs are byte-identical, not merely within `maxDiffPixelRatio`.
If this suite starts flaking, something has been let back in — check for a request escaping the
route stub before you touch the tolerances.

## Python tests

The data-processing scripts have their own suite:

```bash
pip install -r scripts/requirements.txt
pytest scripts/
```

They live in `scripts/tests/`, one `test_<script>.py` per script. The tests import the modules
under test by bare name (`import process_ridership`) because `scripts/` is a flat directory of
standalone entry points, not a package — so `scripts/tests/conftest.py` puts `scripts/` on
`sys.path`. Delete that file and every import in the suite breaks at collection.

Run `npm run fetch-lines` first — several script tests use `public/metro_lines.geojson` as a
fixture. See [`scripts/README.md`](../../scripts/README.md).

## When it goes red in CI

See [the CI guide](ci.md), which has a symptom-to-fix table.
