# June 2026 bus export is inflated ~2.4x

**Status:** withdrawn from the dataset 2026-08-16. Awaiting a corrected export from Metro.
**File:** `06-2026-Bus.xlsx`, delivered in the June 2026 CPRA response.
**Rail is not affected** — `06-2026-Rail.xlsx` from the same delivery is sound and is retained.

This is the evidence pack for the follow-up with Metro. It is written to be readable by someone
who has never seen this repo.

## Summary

Every bus line in the June 2026 export reports far more boardings than it did in May, by roughly
the same factor. The inflation is in the delivered workbook: the file's structure, row counts and
internal arithmetic are all intact, and the same processing code produces correct numbers for
every other month we hold. Nothing downstream can recover the true values, so the month has been
withdrawn rather than published.

## What the numbers do

Systemwide average daily boardings, summed across all 108 bus lines:

| | April 2026 | May 2026 | June 2026 | Jun ÷ May |
| --- | ---: | ---: | ---: | ---: |
| Weekday | 742,262 | 758,239 | 1,829,279 | **2.41×** |
| Saturday | 493,704 | 505,692 | 1,200,234 | **2.37×** |
| Sunday | 409,129 | 429,512 | 641,669 | **1.49×** |

April → May is +2.2% on weekdays, which is normal. May → June is not.

It is not a handful of lines dragging a total. Per-line weekday ratios, over the 108 lines
reporting in both months:

| min | p25 | median | p75 | max |
| ---: | ---: | ---: | ---: | ---: |
| 1.83× | 2.33× | **2.41×** | 2.45× | 2.62× |

**No line went down.** Not one of 108. For context, the largest month-over-month move in the
median bus line across seventeen years of prior data is 19%.

Individual lines, average weekday boardings:

| Line | May 2026 | June 2026 | |
| --- | ---: | ---: | ---: |
| 2 | 20,135 | 48,121 | 2.39× |
| 4 | 23,281 | 56,928 | 2.45× |
| 207 | 25,746 | 63,452 | 2.46× |
| 720 | 19,049 | 49,832 | 2.62× |

## What is *not* wrong with the file

These all held, which is what rules out a structural or parsing problem:

- **Row counts match.** 14,927 leaf stop-direction rows in May, 14,957 in June — so it is not
  duplicated rows or double-counted totals.
- **The same 108 lines** appear in both months.
- **The internal arithmetic is consistent.** `Avg Ons + Avg Offs == Avg Stop Activity` holds for
  **100%** of rows in both months, across all three day types.
- **Sheet layout, header rows and column order are identical** to previous deliveries.
- **The same code reads both files.** Our processing is unchanged since April, and reproduces
  April and May correctly.

So the workbook is well-formed. Its *values* are wrong.

## The most useful clue: the rounding changed

In every prior delivery, the bus `Avg Ons` figures are multiples of **1/10** — consistent with a
total divided by ten. In the June file, every value is a multiple of **1/20**.

```
May 2026:  0.1, 0.2, 0.3, 0.4, 0.5, 0.6 ...        (all multiples of 0.10)
June 2026: 0.1, 0.15, 0.2, 0.25, 0.3, 0.35 ...     (multiples of 0.05)
```

The denominator used to compute the averages changed between the two exports. That points at the
averaging step rather than at the underlying counts, and it is the single most likely place to
look first.

One further detail that may or may not be related: the inflation factor is **not** uniform across
day types (weekday 2.41×, Saturday 2.37×, Sunday 1.49×). A single mis-set scale factor would move
all three together, so whatever changed appears to interact with the day-type grouping.

## What we are asking

1. A corrected `06-2026-Bus.xlsx` for June 2026.
2. Confirmation of whether the averaging methodology changed for June — and if it did, which
   months are affected, so we can tell a methodology change from a defect.
3. Confirmation of whether **July 2026 onward** uses the pre-June or the June methodology.

## Reproducing this

The defective workbook is preserved, out of the ingest path, at
[`data/raw/quarantine/2026-06-bus-defective.zip`](../../data/raw/quarantine/2026-06-bus-defective.zip).

The guard that now catches this class of defect is
[`scripts/ridership_anomalies.py`](../../scripts/ridership_anomalies.py); running
`update_ridership.py` against the quarantined file exits 2 and prints the table above. The guard
did not exist when the month was ingested, which is why it merged.
