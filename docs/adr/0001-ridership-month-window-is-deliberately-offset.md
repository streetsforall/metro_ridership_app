# The Ridership Month Window is deliberately offset, and must not be normalised

Status: **superseded** by [ADR-0009](0009-the-two-window-rules-are-one-rule.md).

The offset described below is gone. There is now one window rule, `S ≤ R ≤ E`, inclusive on both
ends, for the chart and the context log alike. ADR-0009 is the decision that removed it, taken on the
terms this ADR set out: a deliberate product decision with a baseline regeneration attached.

Kept unedited below because it is the record of why the offset survived as long as it did, and its
addendum is still the account of how the arithmetic was replaced.

---

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

## Addendum — the arithmetic was replaced; the boundaries were not

The consequence above about keeping the `Date` arithmetic **verbatim** no longer describes the code,
and the reason it stopped holding is worth recording. That argument — copy-paste is provably
non-drifting, algebra is only provably equivalent if the algebra is right — was sound while there was
one statement of the rule. It stopped being sound once `src/utils/month.ts` grew `containsOffset`, a
second statement over `Month` ordinals, because from then on **two** statements existed and the fork
this ADR exists to prevent was already open, whichever one production happened to call.

So each rule is now stated exactly once, in `src/utils/month.ts`, and production reaches it through a
`Date`-shaped adapter in `src/ridership/`:

| rule | statement | adapter | callers |
| --- | --- | --- | --- |
| Month Window, `S ≤ R ≤ E − 2` | `month.ts` `containsOffset` | `ridership/monthWindow.ts` `isInMonthWindow` | the chart's Ridership View, the stop panel's Stop View |
| Event Window, `S ≤ R ≤ E` | `month.ts` `contains` | `ridership/eventWindow.ts` `isInEventWindow` | the context log |

The boundaries did not move, and this ADR's licence is what permitted the swap: *"a `Month` module
that unifies the app's several month encodings may replace the arithmetic; it may not change these
boundaries."* What makes it safe is the third bullet above, not the derivation —
`monthWindow.test.ts` runs the live function, `containsOffset`, and the retired `Date` comparison
against each other over every window pair in a decade. **The retired comparison is kept in that spec
verbatim for exactly this purpose**: with `isInMonthWindow` now delegating, checking it against
`containsOffset` alone would be a tautology, and the old arithmetic is the only comparand in the file
that cannot move.

One new obligation falls out of the swap. The ordinal form compares months where the `Date` form
compared timestamps, so **window bounds must stay month-aligned** — `new Date(y, m − 1)`, midnight on
the first. Every producer is (`parseMonthParam`, `DefaultStartDate`, `dataDefaultEndDate`,
`labelToDate`, and `DateRangeSelector`, which mutates an already-aligned date). A bound carrying a day
or a time would be truncated to its month rather than compared. ADR-0006 is the standing argument for
why these bounds should not be `Date`s at all.
