# Panel layout is a Tailwind grid with URL-synced settings

Status: accepted.

The dashboard's panel arrangement is a fixed Tailwind grid in `App.tsx` and `OutputArea.tsx`, and
the user's control over it — which panels show, how tall they are, how the summary and map split the
row — is ordinary dashboard state synced to the URL query string like every other choice in this
app.

The obvious alternative was tried and rejected, and the rejection is not visible in the code: `main`
today looks like the grid was never replaced. This ADR records that it was.

## Dockview was adopted, then reverted

A three-wave rollout replaced the grid with [dockview](https://dockview.dev) — VS Code-style docking
with drag-to-resize sashes, drag-to-rearrange panels, a header panel menu, a reset action, and
layout persisted to localStorage under `metro-panel-layout-v1`. It merged in full: `#78` (the
`DockShell` contract, contexts, layout storage), `#79` (header controls), `#80` (MapLibre singleton
lifecycle), the B2 dashboard integration, and `#82`.

It was then backed out in one commit — `3d0b4a3`, "Revert DockView dockable-panels rollout" (`#83`),
merged 2026-08-04. Those five squashes were the entire delta on `main` since `0ae6bf9`, so the revert
restored the pre-dockview tree exactly and removed the `dockview-react` dependency.

Two artefacts of that rollout survive and mislead:

- **Stale `feature/panels-*` branches and `.claude/worktrees/` checkouts.** They still hold
  `src/dock/DockShell.tsx`, `src/utils/layoutStorage.ts` and a confident plan document at
  `src/plans/dockable-panels.md` describing a frozen contract and a wave-2 split. Read on its own,
  that document reads like live work. It is not; it predates the revert. These worktrees also pollute
  a root `npm test` / `npm run lint` with failures that are not about your branch.
- **`e2e/helpers.ts` stubs out `ResizeObserver`.** That stub is a survivor of making Playwright
  deterministic around dockview and Chart.js, and it still shapes what is testable here — see
  Consequences.

Reviving dockview is a legitimate future decision. It is not an oversight to be corrected, and
anyone proposing it should be arguing against `#83`, not filling a gap.

## Panel settings are URL state, not device-local state

This is where the reverted design and the current one genuinely disagree, so it is worth stating
plainly rather than leaving as an inference.

The dockable-panels plan held that panel layout is device-local UI chrome and belongs in
localStorage, explicitly outside this app's URL-sync rule. Under a docking model that is right: a
serialized dockview grid is a large, opaque, machine-generated blob, and there is nothing meaningful
to put in a query string.

Under the grid model it is wrong. Panel settings here are a handful of named, enumerated choices —
map height, chart height, log height, split ratio, four visibility flags — and they are the same
*kind* of thing as the day-of-week or the selected lines: a small choice that shapes what the
Ridership View looks like, and one a user would reasonably expect to survive sending someone a link.
So they follow the same rule everything else follows, wired through both the lazy `useState`
initialiser and the URL sync effect in `src/hooks/useUserDashboardInput.ts`, and written to the query
string only when they differ from the default. A default view's URL is unchanged.

This app has no storage layer at all today. Introducing one for four settings, in a codebase whose
stated invariant is that dashboard state is shareable, would be the surprising choice — and it is the
choice that would need the ADR.

## Consequences

Panel size and visibility must stay expressible as CSS classes and enumerated values. Two things
depend on that. The `ResizeObserver` stub in `e2e/helpers.ts` means any JavaScript-driven resize
logic is inert under Playwright and effectively untested. And a setting that cannot be named in a
query parameter cannot be shared, which is the property this decision protects. Continuous
drag-resizing fails both tests — which is the honest reason it is not on offer, and a fair argument
for revisiting `#83` the day continuous resizing genuinely matters.

Two consequences of staying a grid are worth naming, because both look like bugs.

The **summary|map split is a request, not a guarantee**. `lg:grid-cols-[3fr_7fr]` gives the map 70%
only while the summary's content fits in 30%; at 1280px it does not, and the grid honours the `1fr`
track's automatic minimum instead — the summary lands at ~284px where an exact 30% is ~271px. That is
the rule to keep. Buying the exact ratio means `min-w-0` on the summary, which lets a seven-digit
`text-3xl` figure overflow its tile: a worse answer than a track 13px wider than asked for. The
property that would genuinely be a bug is the page scrolling sideways, and it does not.

The **map's size sets a floor, not a height**. `#lineMap` is `flex: 1 1 auto` over
`min-height: var(--map-min-height, 400px)`, with the property set as a class on `#map-panel`. A size
that pinned `height` would win back the fixed box that made the map float above empty pane whenever
the summary beside it was taller.

The regions are called **panels**, matching the Panel Settings control the user sees. The ids were
inconsistent — `line-selector-pane`, `ridership-chart`, `summary-data`, `context-log-panel`, `map` —
and settled on `<name>-panel` when the Panel Settings work landed: `line-selector-panel`,
`chart-panel`, `summary-panel`, `context-log-panel`, `map-panel`, with toggles at
`panel-<name>-toggle`. Two names are deliberately untouched. The `.pane` class in `src/index.css` is
a style hook, not a name, and keeps its spelling; and `#lineMap` is the MapLibre container *inside*
`#map-panel`, which both the map instance and `mapMask` in `e2e/helpers.ts` bind to.

The panel arrangement is not domain language and does not appear in [`CONTEXT.md`](../../CONTEXT.md).
The glossary describes what the Ridership View *is*; where its pieces sit on screen is not part of
that.
