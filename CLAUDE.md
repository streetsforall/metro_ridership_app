# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

**This file holds no facts of its own.** It is a pointer plus a short list of things that are easy
to break without noticing. Everything else lives in `docs/`, once. If you find a fact here that
contradicts `docs/`, `docs/` wins and this file is the bug.

## Project

Client-side React + Vite app (Streets for All Data/Dev Team) visualising LA Metro bus and rail
ridership. No backend. Small metadata JSON is bundled; the large ridership dataset is fetched at
runtime as a columnar asset so it stays out of the JS bundle.

## Read before working

- **[CONTEXT.md](CONTEXT.md)** — the ubiquitous language. Where a term there conflicts with a name
  in the source, the term wins and the source is out of date. Use these words.
- **[docs/how-it-works.md](docs/how-it-works.md)** — the derivation pipeline, the module rule, and
  every convention that looks like a bug and isn't.
- **[docs/README.md](docs/README.md)** — the index. Everything else is one link from there.
- **[docs/adr/](docs/adr/)** — read the ADRs covering whatever you're about to change.

## Commands

```bash
npm run dev          # Vite dev server at https://localhost:5173 (basicSsl in dev only)
npm run build        # tsc -b type-check, then vite build → dist/
npm run preview      # serve the production build at https://localhost:4173 (also HTTPS)
npm run test         # vitest run (all tests once)
npm run test:watch   # vitest watch mode
npm run lint         # eslint .

npm run test:e2e               # playwright visual-regression suite
npm run test:e2e:ui            # playwright UI / trace viewer
npm run test:e2e:update        # rewrite baselines for the current platform
npm run test:e2e:update:linux  # rewrite the Linux baselines in Docker

npm run docs:architecture      # regenerate the diagram set
```

Specs live in a `__tests__/` folder inside the directory they cover, so their relative imports
sit one level deeper than the module's — `vi.mock()` paths included.

One test file: `npx vitest run src/ridership/__tests__/lineMetrics.test.ts`, or filter by name
with `-t`.
**Every spec imports `describe`/`it`/`expect` from `vitest`.** `vitest.config.ts` sets
`globals: true` so the runtime doesn't need them, but `tsconfig.app.json` doesn't list
`vitest/globals`, so `tsc -b` doesn't see them and `npm run build` fails without the import.

Python pipeline: `pip install -r scripts/requirements.txt`, then `pytest scripts/`.

## Invariants — don't break these

Each one has cost someone real time. The reasoning is in `docs/`; this is the short list.

- **Never regenerate visual baselines to silence a diff you can't explain.** That deletes the
  evidence. Only the `-linux.png` set is committed and it is what gates CI —
  [docs/guides/testing.md](docs/guides/testing.md).
- **Don't delete `window.__metroMap`** from `src/components/Map.tsx`. Nothing in the app reads it;
  it is the only handle the map spec has on a WebGL canvas.
- **Don't import `src/ridership/chartData` from outside `src/ridership/`.** That folder is a sealed
  module and `index.ts` is its entire public surface — [ADR-0007](docs/adr/0007-a-folder-with-an-index-is-a-sealed-module.md).
- **Don't "fix" the two `JSON.stringify` dependency guards in `LineTableRow`.** `ridershipRecords`
  and `chartDataset` are new references every render.
- **Don't silently change the Month Window's off-by-one.** It is intended and pinned by the
  committed chart baselines — [ADR-0001](docs/adr/0001-ridership-month-window-is-deliberately-offset.md).
  The Event Window disagreeing with it is also intended.
- **Don't restate either window rule at a call site.** Each is stated once, in
  [`src/utils/month.ts`](src/utils/month.ts) — `containsOffset` and `contains` — and reached through
  the `Date`-shaped adapters `isInMonthWindow` and `isInEventWindow` in `src/ridership/`. A second
  copy is how the panels start disagreeing about which months a URL shows.
- **Don't hand a window bound a day or a time.** Every producer builds `new Date(y, m - 1)`, midnight
  on the first, and both adapters read only the year and month off it.
- **Don't set `spanGaps`** on the chart. A month a line doesn't report is a gap, not a zero.
- **Don't make `fill_missing_months` pad anything but a line's leading gap**, and don't let its pads
  become `0` before `merge_ridership` has backfilled them. A pad is NaN so the merge can tell it from
  a line that genuinely reported zero riders — line 60 did, in 2026-01 — so a backfill keyed on `== 0`
  is wrong. Pad the start, not the end: see *Settled* in [docs/ROADMAP.md](docs/ROADMAP.md).
- **Don't add a derived field to `Line`.** Figures belong on a Line Readout and last only as long as
  the window that produced them — [ADR-0005](docs/adr/0005-derived-figures-live-on-line-readouts.md).
  The write-back that used to do this was deleted in #167; don't reintroduce it.
- **New dashboard state must be wired through both** the lazy `useState` initialisers and the URL
  sync effect in `src/hooks/useUserDashboardInput.ts`, or the view stops being shareable.
- **Bumping `@playwright/test` means regenerating the Linux baselines in the same PR.** A new
  browser build re-renders text.

## When you change code, check the docs

There is no CI check for this. Renaming or deleting an exported symbol means grepping `README.md`,
`CONTEXT.md`, `CLAUDE.md` and `docs/` for it — including
`docs/architecture/mermaid/` and `captions.md`, then `npm run docs:architecture`. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## Agent skills

- **Issue tracker** — GitHub Issues on `streetsforall/metro_ridership_app`, via `gh`. See
  [docs/agents/issue-tracker.md](docs/agents/issue-tracker.md).
- **Triage labels** — the five canonical roles map onto existing repo labels (`needs-info` →
  `question`, `ready-for-human` → `help wanted`, `wontfix` → `wontfix`). See
  [docs/agents/triage-labels.md](docs/agents/triage-labels.md).
- **Domain docs** — single-context: one `CONTEXT.md` plus `docs/adr/` at the repo root, both of
  which exist. See [docs/agents/domain.md](docs/agents/domain.md).

## Styling

Tailwind (`tailwind.config.ts`). A reusable `.pane` class is used for card containers throughout.
Font is Overpass Mono via `@fontsource-variable`.
