# Metro Ridership App

A client-side dashboard for exploring LA Metro bus and rail ridership over time, built by
[Streets for All](https://streetsforall.org)'s Data/Dev Team. Pick some lines, a stretch of months
and a day of the week; the chart, the per-line figures, the map highlighting and the context log are
all derived from that one set of choices.

React + Vite, no backend. The repository is the database and `dist/` is the whole deployment. It may
become full-stack if the data processing gets too heavy.

## Quickstart

Requires **Node 22** — the repo pins `22.23.2` in [`.node-version`](.node-version), which
`fnm`/`nvs`/`asdf` read automatically, and CI uses the same file.

```bash
npm install
npm run dev
```

The app runs at **`https://localhost:5173`**. Note the `https` —
[`@vitejs/plugin-basic-ssl`](https://www.npmjs.com/package/@vitejs/plugin-basic-ssl) is enabled for
`vite serve`, so your browser warns about the self-signed certificate the first time. Accept it and
carry on.

```bash
npm run lint     # eslint
npm run test     # vitest, once
npm run build    # tsc -b, then vite build → dist/
npm run preview  # serve the production build at https://localhost:4173
```

Those four are what CI gates on, minus the visual-regression suite. Run them before opening a PR.

Python 3 is needed only for the data-processing scripts, and Docker only for regenerating visual
baselines. Neither is required to run the app.

## A caution about the data

Not every **Line** reports for the same span of months. Lines are added and discontinued, and a line
can appear late because the source data only began breaking it out separately — the D Line starts
2025-09 while most rail goes back to 2009.

The chart handles this: every series is drawn against one shared **Month Axis**, and a month a line
doesn't report is a gap, never a zero.

The summary table is different, deliberately. **Line Metrics** are estimated from each line's *own*
first and last **Ridership Record** inside the window, not from the window's endpoints — so two rows
can describe different periods, and the table labels that rather than pretending otherwise. Tracked
in [issue #88](https://github.com/streetsforall/metro_ridership_app/issues/88).

Those bolded terms are defined in [`CONTEXT.md`](CONTEXT.md), and they mean something specific.

## What lives where

| Path | Holds |
| --- | --- |
| `src/ridership/` | The derivation. A sealed module — `index.ts` is its whole public surface. |
| `src/components/` | Eight components, each with a spec beside it. |
| `src/hooks/` | `useUserDashboardInput` — all shared state, in one hook. |
| `src/utils/` | Loose helpers: lines, month, query params, date bounds, map popup. |
| `src/data/`, `src/@types/` | Bundled JSON — including canonical `ridership.json` — and the domain types. |
| `data/raw/` | The Excel and CSV files LA Metro returns to a public-records request, compressed. |
| `scripts/` | The Python data pipeline that turns those into `src/data/`, with a `test_*.py` beside each script. |
| `e2e/` | Playwright specs and the committed Linux baselines. |
| `vite/` | The `ridership-data` plugin, which keeps the dataset out of the JS bundle. |
| `docs/` | Everything written down. Start at [`docs/README.md`](docs/README.md). |

## Where to go next

- **[`CONTEXT.md`](CONTEXT.md)** — the vocabulary. Where a term there conflicts with a name in the
  source, the term wins and the source is out of date.
- **[`docs/how-it-works.md`](docs/how-it-works.md)** — how the derivation actually runs, and the
  conventions that look like bugs but aren't.
- **[`docs/README.md`](docs/README.md)** — every document, what it's for, and the order to read them
  in.
- **[`CONTRIBUTING.md`](CONTRIBUTING.md)** — before your first PR.

Changing anything visual? Read [`docs/guides/testing.md`](docs/guides/testing.md) first — this repo
gates on 35 committed screenshots.
