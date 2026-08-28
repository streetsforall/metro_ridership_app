# Contributing

Start with [`README.md`](README.md) if you haven't. It is the whole documentation set — the
vocabulary, how the derivation runs, the data pipeline, and how to test.

## Write so the next reader can skim

These apply to everything that lands in the repo — code, comments, docs, commit bodies and PR
descriptions — and they apply the same whether a person or an agent wrote it.

- **Every fact lives in exactly one place.** The docs rule below is that principle applied to
  `README.md`; it is why a document links rather than repeats.
- **Headings are assertions, not labels.** "Push neither creates nor drops what its schema does not
  describe" tells the reader whether to keep reading. "Push notes" does not.
- **Say it plainly, once.** Short words, short sentences. Cut a sentence whose only job is to
  introduce the next one.
- **Keep the causal connective.** A *because* or *so that* stays whole, because dropping it turns
  one explanation into two unrelated facts and leaves the reader to re-derive the link.
- **Length is a cost, not proof of effort.** A long description is read less carefully than a short
  one, so padding a section to look thorough makes review worse rather than better.

## Open the PR with the template filled in

[`.github/pull_request_template.md`](.github/pull_request_template.md) has four sections — where
the change sits, what it changes, what to check, and the pre-merge checklist.

- **One paragraph per section, maximum.** If a section needs more than that, the PR is
  probably two PRs.
- **Where this sits** is optional. Delete it when the PR touches one obvious place.
- **What to check** is for the reviewer, not the author. One bullet per behaviour to verify, with
  `file:line` pointers. It is not a file inventory — the Files changed tab already has that.
- **If the PR does two things, say why they are in one PR.** Better still, split before you start:
  deciding that up front is far cheaper than unpicking a branch afterwards.

Agents opening PRs with `gh pr create --body` bypass the template entirely, so copy its sections
across by hand.

## Before you open a PR

```bash
npm run lint
npm run test
npm run build
```

Those three are what the `build` job gates on, and they are all of CI.

If your change renders anything, also run the Playwright suite. It is gitignored rather than
committed, so it runs on your machine and nowhere else:

```bash
npm run test:e2e
```

If the change legitimately alters what the screenshots show, regenerate your baselines and put a
screenshot of the new UI in the PR description. **Never regenerate baselines to silence a diff you
can't explain** — that deletes the evidence. See the Testing section of `README.md`.

Because nothing in CI runs that suite, a UI regression is caught only by the person who runs it. If
you skipped it, say so in the PR rather than leaving the reviewer to assume it passed.

## The docs rule

**Every fact lives in exactly one place.** `README.md` is where. Anything else you find on disk —
`docs/`, `CONTEXT.md`, `CLAUDE.md` — is gitignored local material that a fresh clone does not have,
so it can never be the only place something is written down.

Nothing in CI enforces this, so one manual step substitutes:

> **If you renamed or deleted an exported symbol, grep the tracked docs for it before opening the
> PR.**

```bash
git grep -n 'theSymbolYouRemoved' -- '*.md'
```

`git grep` searches tracked files only, which is exactly the set that has to stay true. That is
`README.md`, this file, `scripts/README.md` and `DATA_RELEASE_NOTES.md`.

This rule exists because it got skipped. A PR deleted `updateLinesWithLineMetrics` and four
documents went on describing it — including two that told the next reader it was still running.

## Naming

The Terms section of [`README.md`](README.md) is the vocabulary, and it outranks the source: where a
term there conflicts with a name in the code, the term wins and the code is what's out of date.

## Decisions

If you make a call that a future reader would otherwise have to reverse-engineer — especially one
that looks wrong without the reasoning — say so in the PR description, and put the durable part in
`README.md` next to the behaviour it explains. A reason that only exists in a merged PR body is a
reason the next reader will not find.

## Issues

Issues live in GitHub Issues on `streetsforall/metro_ridership_app`. If you notice something out of
scope for your change, file it rather than widening the PR — and if you delete something that held
an idea nobody has tracked elsewhere, file that first.
