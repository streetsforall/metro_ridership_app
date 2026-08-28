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

<!-- Commands were current on 2026-08-28; CONTRIBUTING.md is authoritative if they have drifted. -->

- [ ] `npm run lint`, `npm run test` and `npm run build` pass
- [ ] Issue linked above
- [ ] Changed the UI? Ran `npm run test:e2e` locally, screenshot below. Say so if you skipped it.

<!--
CI runs lint, the tracked vitest suites and the build. Playwright is gitignored and runs only on
your machine, so nothing but you catches a visual regression.
Never regenerate baselines to silence a diff you can't explain — that deletes the evidence.
-->
