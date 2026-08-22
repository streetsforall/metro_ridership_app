## Where this sits

<!-- Optional — delete this section when the PR touches one obvious place. One paragraph: which
     part of the codebase this changes, and how it fits into the bigger picture. -->

## What this changes

<!-- One paragraph: what the change does and why it's worth doing. Link the issue. If this PR
     does two things, say why they're in one PR. -->

## What to check

<!-- A paragraph's worth at most — one bullet per behaviour a reviewer should verify, with
     `file:line` pointers. Not a file inventory; the Files changed tab already lists those. -->

## Before you merge

<!-- Commands were current on 2026-08-22; CONTRIBUTING.md is authoritative if they have drifted. -->

- [ ] `npm run lint`, `npm run test` and `npm run build` pass
- [ ] Issue linked above
- [ ] Renamed or deleted an exported symbol? Grepped `README.md`, `CONTEXT.md`, `CLAUDE.md` and
      `docs/` for it — including `docs/architecture/mermaid/` and `captions.md`
- [ ] Changed a diagram source? Ran `npm run docs:architecture` and committed `diagrams.md`
- [ ] Changed the UI? Screenshot below, and Linux baselines regenerated with
      `npm run test:e2e:update:linux`
- [ ] Made a decision that looks wrong without the reasoning? Wrote an ADR in `docs/adr/`

<!--
Baselines: only the -linux.png set is committed and it is what gates CI.
Never regenerate baselines to silence a diff you can't explain — see docs/guides/testing.md.
-->
