# Orchestration

Protocol: the `/orchestrate` skill (`~/.claude/skills/orchestrate/`). This file holds only this
repo's parameters.

**Mode:** `wave`

**Merge authority: the user merges every PR himself.** The review subagent reports; it does not
merge. This is the standing exception to the reviewer-holds-the-gate rule, and **every brief for this
repo must say so explicitly** — a session that is not told infers merge rights from the protocol.

**The gate** — run from the worktree root before reporting anything complete:

```bash
npm run lint && npm run test && npm run build
```

If the change renders anything, also `npm run test:e2e`. If it legitimately changes what the
screenshots show, regenerate the committed Linux set in the same PR with
`npm run test:e2e:update:linux` and put a screenshot in the PR description.

**Worktree bootstrap:** none — create a worktree off `main` and `npm ci`.

**Model pin:** `.claude/settings.local.json` carries `"model": "opus"` and `"effortLevel": "high"`;
`.worktreeinclude` copies it into fresh worktrees.

> **`.worktreeinclude` has gone missing three times in this repo, most recently 2026-08-21.** It is
> untracked and appears in **zero commits on any branch**, so nothing restores it automatically and
> nothing reports its absence — workers just run on the wrong model. It is one line:
> `.claude/settings.local.json`. Check it before every spawn.

**Tracker:** `streetsforall/metro_ridership_app`, via `gh` — see [issue-tracker.md](./issue-tracker.md)

**Batch prefix:** `<Batch Name> / <letter> — <short name>`, e.g.
`Metro Ridership - Improvements / C — chart-content e2e`

## Wave mode

**The frozen contract** varies per batch and is named in the wave-1 PR. It has covered the columnar
data schema, the derivation pipeline outputs, and the shared fixtures. Whatever wave 1 owns is
READ-ONLY to every later session, which reports gaps in its PR body instead of patching.

**Roadmap:** [`docs/ROADMAP.md`](../ROADMAP.md) — tick it as PRs merge.

## Repo-specific notes

- **Never regenerate visual baselines to silence a diff you can't explain.** That deletes the
  evidence. Only the `-linux.png` set is committed and it is what gates CI.
- **Committed screenshots are the behaviour gate**, so a PR left open across other merges goes stale
  invisibly — its green check stops testing anything. `gh pr update-branch` and re-run CI. This is
  what happened to #154.
- `CONTEXT.md` outranks the source: where a term there conflicts with a name in the code, the term
  wins.
- The full invariants list is in [`CLAUDE.md`](../../CLAUDE.md) — read it before changing anything.
