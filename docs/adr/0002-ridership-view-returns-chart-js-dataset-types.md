# The Ridership View returns Chart.js dataset types

Status: accepted

`buildRidershipView` returns its per-line and aggregate series as `ChartDataset<'line',
CustomChartData[]>` — the Chart.js type — rather than a rendering-neutral series type that the
output component would then map. The import is `import type`, so it is erased at build and adds no
runtime dependency or bundle weight.

The alternative was a neutral `{ lineId, label, color, data }[]`, leaving the view free of any
rendering library. We rejected it for now because the conventions bundled into a dataset here — the
series label, the brand colour, and the rule that the Aggregate Series is ordered last — are pinned
by the committed chart PNG baselines, and they belong next to the code that produces them. Splitting
them across the module boundary would put a baseline-pinned ordering rule in the caller, and would
drag `OutputArea` and its tests into a change whose entire value is that it is a behaviour-preserving
extraction.

## Consequences

- A domain module knows the name of the charting library. This is the cost, and it is the thing a
  future reader will object to. The objection is noted and answered here rather than reopened: the
  coupling is type-only, and the alternative moves baseline-pinned rules outward, which is worse.
- Revisit if a second consumer ever needs the series in a non-Chart.js form — the CSV export reads
  `Consolidated Ridership`, not the datasets, so today there is no such consumer.
