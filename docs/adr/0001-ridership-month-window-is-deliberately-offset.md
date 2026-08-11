# The Ridership Month Window is deliberately offset, and must not be normalised

Status: accepted

The date filter compares `new Date(record.year, record.month)` — where `month` is 1-based in the
data but 0-based in `Date` — against window bounds parsed as `new Date(year, month - 1)`. The
comparison is exclusive on both ends. Written out, a record at calendar-month ordinal `R` is
included when `S ≤ R ≤ E − 2`, where `S` and `E` are the start and end month ordinals: **the start
month is included; the end month and the month immediately before it are excluded.** We are keeping
this exactly as it is.

It reads like a bug and it is not. It is the behaviour the app has always had, users have shared
URLs against it, and `e2e/chart-content.spec.ts` renders windows through it into committed PNG
baselines. Changing it would shift every chart by a month and invalidate those baselines — so if it
is ever changed, that is a deliberate product decision with a baseline regeneration attached, not a
drive-by fix.

## Consequences

- The rule is now stated in prose in three places — `CONTEXT.md` (**Month Window**), this ADR, and
  the doc comment on the module that implements it — because it cannot be inferred from a glance at
  the code.
- The `Date` arithmetic was moved into `src/ridership/` **verbatim** rather than rewritten as an
  equivalent ordinal comparison. Copy-paste is provably non-drifting; algebra is only provably
  equivalent if the algebra is right, and this is not a rule anyone should have to re-derive.
- Boundary tests pin the rule at month granularity — a record exactly at the start month is in, one
  month earlier is out, `E − 2` is in, `E − 1` and `E` are out. Those tests, not the arithmetic, are
  what makes a future rewrite safe. A `Month` module that unifies the app's several month encodings
  may replace the arithmetic; it may not change these boundaries.
- The Event Window, which filters context-log events from the same user choices, is **inclusive on
  both ends**. The two windows genuinely disagree. That is preserved as-is: reconciling them would
  change which events appear for a given URL.
