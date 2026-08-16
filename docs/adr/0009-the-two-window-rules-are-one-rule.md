# The two window rules are one rule, inclusive on both ends

Status: accepted. Supersedes [ADR-0001](0001-ridership-month-window-is-deliberately-offset.md).

A month falls inside the date range the user picked when `S ≤ R ≤ E` — both ends in. One rule,
`contains` in `src/utils/month.ts`, for the chart, the stop panel and the context log alike.

## What changed

ADR-0001 recorded a second rule, `S ≤ R ≤ E − 2`, that the chart and the stop panel filtered
through: the end month **and the month before it** were dropped. Ask for Jan–Dec 2022 and the chart
gave you January through October, while the context log beneath it showed events through December.

That offset was never designed. It fell out of `new Date(record.year, record.month)` treating the
month as 0-based where the data is 1-based, against bounds built as `new Date(year, month − 1)`, with
a strict comparison on both ends. ADR-0001 chose to keep it — not because it was right, but because
changing it was risk without a stated benefit, and it recorded the terms: *"if it is ever changed,
that is a deliberate product decision with a baseline regeneration attached, not a drive-by fix."*
This is that decision, with that regeneration attached.

## Why change it now

**The behaviour is wrong for users.** The two months it hides are the two most recent months of the
range asked for, which on the default view are the two most recent months of data in the app. The
newest data was the hardest to see.

**Two rules is a standing hazard, not a fixed cost.** [#187](https://github.com/streetsforall/metro_ridership_app/pull/187)
got the count down to one statement per rule, which is what makes this change a one-line edit rather
than parallel edits in two files that have to be kept in step. The next question was whether the
second rule needed to exist at all, and it did not.

**The stated cost had already been discounted.** ADR-0001 leaned on shared URLs depending on the
offset. That is no longer treated as binding — a shared link showing two more months than it used to
is not a broken link.

## The direction

The chart moves to the log's rule, not the reverse. Making the log offset instead would have
unified them by *hiding* two months of events, which is the same defect with wider reach.

## Consequences

- `containsOffset` is deleted. `contains` is the whole rule. The two `Date`-shaped adapters in
  `src/ridership/` — `monthWindow.ts` and `eventWindow.ts` — now differ only in what they accept: a
  record's `{year, month}` versus an event's `"YYYY-MM"`.
- **`dataDefaultEndDate` moved back a month**, from `maxMonth + 1` to `maxMonth`. It sat one month
  past the data purely to compensate for the offset; left alone, the default view would have opened
  on two empty trailing months. This is the one non-obvious edit in the change.
- **The chart baselines were regenerated.** Every chart gains two months on the right. The
  `-linux.png` set CI compares against was rebuilt in Docker via `npm run test:e2e:update:linux`, not
  from a developer machine.
- **The default end date shown in the picker changes**, and so does the `end` URL param the app
  writes. Old links still resolve; they show two more months than they used to.
- `month.test.ts` had a test named *"disagrees with containsOffset at the end of the window"*,
  written as a tripwire against exactly this change — *"the guard against a future tidy-up that
  'unifies' them."* It did its job: it made the change impossible to land by accident, and it is
  removed here deliberately rather than quietly. `monthWindow.test.ts` now pins the two months that
  changed hands, so the diff stays legible without opening a PNG.
- ADR-0001's addendum about retiring the original `Date` arithmetic still stands. Bounds must still
  be month-aligned; ADR-0006 is still the argument for why they should not be `Date`s at all.
