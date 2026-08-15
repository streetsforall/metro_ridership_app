# A month is a `{year, month}` value, and `Date` is not used to represent one

Status: accepted. Still in force; two details below have been overtaken by later decisions.

> **Reading note.** This ADR was written when `month.ts` had two window predicates and no production
> caller. Both have changed and the decision itself has not:
>
> - **`containsOffset` no longer exists.** [ADR-0009](0009-the-two-window-rules-are-one-rule.md)
>   removed the offset rule; `contains` is the app's one window rule. Read every mention of
>   `containsOffset` below as `contains`.
> - **`month.ts` has production callers.** The window rule is reached through
>   `src/ridership/monthWindow.ts` and `src/ridership/eventWindow.ts`. The rest of the migration —
>   the chart axis, the picker, the sort — is still ahead, in #144 / #145 / #146.

A month was encoded seven ways: `new Date(y, m)` in the record filter, `y * 100 + m` in the event
filter, `"YYYY M"` on the chart axis, `y * 12 + m` in the axis sort, `"YYYY-MM"` in
`transit-events.json` and the URL, and a 0-based `<option value>` in the month picker. A converter
existed purely to bridge two of them — `formatMonthKey`, `"YYYY M"` → `"YYYY-MM"` — and the chart
label format was re-derived by hand in `src/components/OutputArea.tsx` from a third encoding, so a
change to `timeKey` would have made every Event Gutter shape silently fail to draw.

We introduce `src/utils/month.ts`: a `Month` is `{ year: number; month: number }` with a **1-based**
month, a `MonthWindow` is a pair of them, and the two window-containment rules are functions over
that pair. Every site above converts to it. `Date` leaves the app's domain, with exactly one
survivor described below.

**`Date` is the obvious alternative and it is the thing being removed, so the case against it has to
be specific.** `Date` is a timestamp, not a calendar month: it carries a day, an hour and a timezone
that a month does not have. Three consequences bit this codebase directly.

First, `Date` has two constructors that disagree about which month it is. `new Date(2025, 8)` is
local midnight on 1 September; `new Date("2025-09")` is **UTC** midnight on 1 September, which in Los
Angeles — every user of this app — is 31 August, and reports `getMonth() === 7`, August. The code
survived only because every construction happened to use the first form. Nothing enforced that.
Second, `Date`'s month is 0-based while the data, the URL and the events file are all 1-based, so
every crossing is a `±1`; that mismatch is the mechanical origin of the offset in
[ADR-0001](0001-ridership-month-window-is-deliberately-offset.md). Third, `Date` is mutable, which is
why `DateRangeSelector` cloned a `Date` and called `setMonth` on the copy rather than describing the
month it wanted.

**`Month` is a plain structural interface — not branded, not a class, not a wrapper around a
`Date`.** That is the load-bearing choice, and it is what a wrapper would have cost. Because `Month`
is structural and 1-based, a `RidershipRecord` **is** a `Month`, so the record filter passes records
straight into `containsOffset` with no conversion and no allocation. This is the pattern
`LineSelection` already established in `src/ridership/buildRidershipView.ts` — "`Line` satisfies this
structurally, so callers pass `lines` unchanged". A wrapper class fixes the two-constructors problem
but keeps the timezone and mutability hazards alive behind a curtain, re-exposes them at the
`JSON.stringify` boundary as a UTC ISO string, loses the structural fit at every call site, and is
unreadable in a test failure — `{ _d: 2025-08-31T23:00:00Z }` against `{year: 2025, month: 9}`.

The price is that an invalid month is representable: `{year: 2025, month: 13}` type-checks, and no
constructor can prevent a literal. We accept it. `parseMonth` rejects malformed text at the untrusted
edges — the URL and `transit-events.json` — returning `null` exactly as `parseMonthParam` did;
`monthOf` normalises out-of-range numbers rather than throwing, so month 13 is January of the next
year; and nothing in the module throws, so there is no crash path to guard in an app that has no
error boundary. Branding the type would buy compile-time rejection at the cost of the structural fit
above, and `as Month` would still escape it.

**Libraries were considered and none of them fit.** `date-fns`, Day.js and Luxon are functions or
wrappers over `Date`; they would give nicer syntax around every hazard listed above rather than
removing any of them. Two libraries genuinely model a year-month — js-joda's `YearMonth`, and
`Temporal.PlainYearMonth` via a polyfill — and both would supply the easy half, `parseMonth`,
`formatMonth` and `compareMonths`. Neither can supply `containsOffset`, which is this app's own rule,
or `chartLabel`, which is this chart's own format — and those two are the reason the module exists.
Against that, a class-based month reverses the structural fit and adds a runtime dependency on the
entry path, since the URL is parsed on mount and cannot be lazy-loaded the way `OutputArea` is. The
app has ten runtime dependencies and no date library today.

**This exercises a licence ADR-0001 granted, and does not amend it.** ADR-0001 kept the `Date`
arithmetic verbatim on the grounds that "copy-paste is provably non-drifting; algebra is only
provably equivalent if the algebra is right", and then said in the same breath that "a `Month` module
that unifies the app's several month encodings may replace the arithmetic; it may not change these
boundaries." The algebra, so a future reader does not have to redo it: the bounds are built as
`new Date(y, m - 1)` and records as `new Date(r.year, r.month)`, so with `S`, `E` the bound ordinals
and `R` the record's own 1-based ordinal, the strict comparison `start < record < end` is
`S < R + 1 < E`, which is `S ≤ R ≤ E − 2` — ADR-0001's rule, unchanged. As ADR-0001 insisted, the
boundary tests rather than this derivation are what make it safe.

## Consequences

- **`formatMonthKey` is deleted rather than moved.** It existed only to translate `"YYYY M"` into
  `"YYYY-MM"`; with a `Month` in hand there is nothing to translate between. That deletion, not the
  new module, is the measure of whether this change worked.
- **`chartLabel` is the only function permitted to produce `"YYYY M"`**, and it lives in
  `src/ridership/chartData.ts`, not in `month.ts`. The axis format belongs to the chart; `month.ts`
  is a leaf value module that should not know a chart exists. `OutputArea` reaches it through
  `src/ridership/index.ts`, which is a legal crossing of
  [ADR-0003](0003-one-domain-folder-not-a-repo-wide-reorganisation.md)'s seam.
- **The Event Gutter shapes can no longer silently fail.** They matched a hand-built `"YYYY M"` string
  against the axis, and `indexOf` returning `-1` drew nothing and reported nothing. They now compare
  `Month` values, so a mismatch is a type error rather than a missing annotation.
- **Both window rules sit adjacent in one file, and their disagreement is pinned by a test.** The
  Month Window rule (`containsOffset`, exclusive and offset) and the Event Window rule (`contains`,
  inclusive) read the same `MonthWindow` and give opposite answers at its end. ADR-0001 preserves
  that divergence deliberately; putting the two functions side by side makes it legible, and a test
  asserting both on the same month is what stops a future reader tidying it away.
- **`src/utils/month.ts` is not a second domain folder and does not reopen ADR-0003.** It is a flat
  leaf module with no dependencies, like `src/utils/lines.ts`, which holds brand colours and line
  naming and is already imported by `src/ridership/`. Placing it in `src/ridership/` would have
  created a folder-level cycle — `buildRidershipView.ts` imports `../utils/lines` — and would have
  pulled `transit-events.json` into the import graph of anything that parses a URL param.
- **Exactly one `new Date` survives in application code**, inside `displayMonth`, because
  `toLocaleString` needs a real `Date` to render "Sep 2025". It is local, immediately discarded, and
  the single permitted construction. A sweep for `new Date` should expect one hit, not zero.
- **`src/utils/queryParams.ts` loses its two month functions and keeps everything else.** Candidate 4
  owns what a month is in text; candidate 5 owns which params exist, what they are called and the
  round trip. `"YYYY-MM"` is not the URL's format — it is equally the format of
  `transit-events.json` and of the coverage labels — so a module named for the URL was the wrong
  owner of it.
- **`LineCoverage.coveredFrom` / `coveredTo` stay `string`.** They are rendered directly by the table
  badge, so they are a label rather than a month value.
- **Comparisons must move from `!==` to `monthsEqual`.** `Month` is an object, so `!==` between two
  freshly built months is always true. `buildCoverageByLine`'s partial-coverage check is the site
  where that silently marks every line partial, and its test must include a full-coverage line.
- **`Temporal.PlainYearMonth` is the eventual replacement, not an extension point.** When it ships
  broadly enough to use without a polyfill, delete this module and adopt it rather than growing it —
  it is the same concept, standardised. `containsOffset` and `chartLabel` are the only two things
  that would need to survive the swap.
