# Documentation

Every document in this repo, what it's for, and when you'd read it.

## If you're new

Read these four, in this order. It's about half an hour, and it's enough to make a change safely.

1. **[`../README.md`](../README.md)** — what the app is, how to run it, what lives where.
2. **[`../CONTEXT.md`](../CONTEXT.md)** — the vocabulary. Short, and worth reading properly: these
   terms are used exactly everywhere else, and several of them mean something narrower than they
   sound.
3. **[`how-it-works.md`](how-it-works.md)** — the three-step derivation, the module rule, and the
   conventions that look like bugs and aren't. This is the one that saves you time.
4. **[`architecture/diagrams.md`](architecture/diagrams.md)** — start with *The whole system* and
   *Loading and deriving*. The other 19 are there when you need them.

Then read whichever guide matches what you're about to do. Don't read them all.

## Reference

| Document | What it's for | Read it when |
| --- | --- | --- |
| [`../CONTEXT.md`](../CONTEXT.md) | The ubiquitous language — every domain term, and the words to avoid | Always, first. Also whenever you're naming something. |
| [`how-it-works.md`](how-it-works.md) | How the derivation runs; conventions and quirks; the map | Orienting, or when something looks wrong and might be deliberate |
| [`guides/testing.md`](guides/testing.md) | Vitest, and the whole visual-regression story | Before changing anything that renders |
| [`guides/ci.md`](guides/ci.md) | The two CI jobs, and a symptom-to-fix table | CI is red |
| [`guides/data.md`](guides/data.md) | Ingesting new ridership data | You have new files from a records request |
| [`../scripts/README.md`](../scripts/README.md) | The Python pipeline in full — records requests, every script, compression | Working on the pipeline itself |
| [`ROADMAP.md`](ROADMAP.md) | The stop-level ridership batch — five PRs, the contract they share, the named risks | You're picking up one of those PRs, or wondering where stop data is up to |
| [`adr/`](adr/) | Eight decisions, with the reasoning | You want to know *why*, or you're about to change something one of them covers |
| [`architecture/diagrams.md`](architecture/diagrams.md) | 21 diagrams — system, data, state, URL, seams, tests, CI | You'd rather see it than read it |
| [`../CONTRIBUTING.md`](../CONTRIBUTING.md) | Conventions, and the one docs rule | Before your first PR |
| [`../DATA_RELEASE_NOTES.md`](../DATA_RELEASE_NOTES.md) | What data landed when | Tracing a change in the numbers |
| [`../RELEASE_NOTES.md`](../RELEASE_NOTES.md) | App releases — a different file from the one above | Tracing a change in the app |

## The decisions

| ADR | Says | Status |
| --- | --- | --- |
| [0001](adr/0001-ridership-month-window-is-deliberately-offset.md) | The Month Window's off-by-one is intended | accepted |
| [0002](adr/0002-ridership-view-returns-chart-js-dataset-types.md) | The view returns Chart.js dataset types | accepted |
| [0003](adr/0003-one-domain-folder-not-a-repo-wide-reorganisation.md) | One domain folder, not a repo-wide reorg | **superseded by 0007** |
| [0004](adr/0004-line-metrics-are-one-nullable-shape.md) | Line Metrics are one nullable shape | accepted |
| [0005](adr/0005-derived-figures-live-on-line-readouts.md) | Derived figures live on Line Readouts, never on `Line` | accepted, fully landed |
| [0006](adr/0006-a-month-is-a-year-and-a-month-not-a-date.md) | A month is a year and a month, not a `Date` | accepted, **half landed** — `month.ts` has no production caller yet |
| [0007](adr/0007-a-folder-with-an-index-is-a-sealed-module.md) | A folder with an `index.ts` is a sealed module; `src/` is flat by default | accepted |
| [0008](adr/0008-panel-layout-is-a-tailwind-grid-with-url-synced-settings.md) | Panel layout is a Tailwind grid with URL-synced settings; dockview was reverted | accepted |
| [0009](adr/0009-the-event-gutter-hit-tests-itself.md) | The Event Gutter hit-tests itself, because Chart.js will not | accepted |

## Not for humans

[`agents/`](agents/) is procedure for coding agents — where the issue tracker is, the triage
labels, how to find the domain docs. Three short files. You don't need them; agents do.

[`../CLAUDE.md`](../CLAUDE.md) is a pointer file for the same audience. **It holds no facts of its
own** — if you find one there that isn't in this directory, that's a bug in `CLAUDE.md`.

## Two orders

They are not the same, and conflating them is how documentation rots.

**Reading order** is the list at the top of this page: broad to narrow, general to specific, read
only as far as you need.

**Authority order** is who wins when two documents disagree:

```
CONTEXT.md  →  docs/adr/  →  docs/how-it-works.md + docs/guides/  →  CLAUDE.md
```

`CONTEXT.md` outranks the source code by its own rule. `CLAUDE.md` is last because it is a pointer
file and cannot contradict anything.

## Keeping this true

There is no CI check that the docs match the code. The one thing that substitutes is in
[`../CONTRIBUTING.md`](../CONTRIBUTING.md): **if you renamed or deleted an exported symbol, grep the
docs for it before you open the PR.** This directory exists because that step got skipped once and
four documents described a function that no longer existed.
