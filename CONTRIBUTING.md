# Contributing

Start with [`README.md`](README.md) and [`docs/README.md`](docs/README.md) if you haven't.

## Before you open a PR

```bash
npm run lint
npm run test
npm run build
```

Those three are what the `build` job gates on. `npm run build` also type-checks `e2e/` and
`playwright.config.ts`, so a broken spec fails it.

If your change renders anything, also run `npm run test:e2e`. If it legitimately changes what the
screenshots show, regenerate the committed Linux set in the same PR:

```bash
npm run test:e2e:update:linux
```

and put a screenshot of the new UI in the PR description. See
[`docs/guides/testing.md`](docs/guides/testing.md) — **never regenerate baselines to silence a diff
you can't explain.**

## The docs rule

**Every fact lives in exactly one place.** `docs/` is where. `README.md` is an entry point,
`CLAUDE.md` is a pointer file, and neither should be the only place something is written down. If
you catch yourself explaining the same behaviour in two files, one of them should link to the other.

Nothing in CI enforces this, so one manual step substitutes:

> **If you renamed or deleted an exported symbol, grep the docs for it before opening the PR.**

```bash
git grep -n 'theSymbolYouRemoved' -- '*.md'
```

Check `README.md`, `CONTEXT.md`, `CLAUDE.md` and all of `docs/` — including
`docs/architecture/mermaid/*.mmd` and `docs/architecture/captions.md`. If you edit either of those
two, regenerate the diagram set:

```bash
npm run docs:architecture
```

`diagrams.md` is committed; `architecture.html` and `.pdf` are gitignored build outputs.

This rule exists because it got skipped. A PR deleted `updateLinesWithLineMetrics` and four
documents went on describing it — including two that told the next reader it was still running.

## Naming

[`CONTEXT.md`](CONTEXT.md) is the vocabulary, and it outranks the source: where a term there
conflicts with a name in the code, the term wins and the code is what's out of date. Each entry has
an `_Avoid_` line listing the synonyms that shouldn't appear. Use the words in that file.

## Decisions

If you make a call that a future reader would otherwise have to reverse-engineer — especially one
that looks wrong without the reasoning — write an ADR in [`docs/adr/`](docs/adr/). They're short.
Number it sequentially, give it a `Status:` line, and say what you *rejected* as well as what you
chose.

If you supersede one, mark the old one superseded rather than editing it. The reasoning in a
superseded ADR is usually still worth reading.

## Issues

Issues live in GitHub Issues on `streetsforall/metro_ridership_app`. If you notice something out of
scope for your change, file it rather than widening the PR — and if you delete something that held
an idea nobody has tracked elsewhere, file that first.
