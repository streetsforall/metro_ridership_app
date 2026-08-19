# Roadmap — stop-level ridership

The app shows ridership per **line**. This is the sequence that gets it to
**stop and station** grain, with **alightings**, which the app has never shown at
any grain.

The data is already in the repo. The CPRA Excel files in `data/raw/` are
stop/station-level with ons, offs and activity for all three day types;
`aggregate_to_line_ridership` used to `groupby("LINE").sum()` and discard stop
identity, offs and activity at ingest. Nothing needs to be acquired.

Coverage is **2025-07 → 2026-06, 12 months, both modes** — 11 at the time this was
written, plus 2026-06 from #176. Everything before that is line-level only and stays
untouched.

> Figures elsewhere on this page that PR 1 measured — the row counts under *Decisions*,
> the 1,252 line-months under *Named risks* — were taken over 2025-07 → 2026-05 and have
> not been re-measured since.

## The five PRs

Tick a row when its PR merges. This table is the batch's shared reference — later
PRs update it rather than restating their own scope.

| PR | Contents | Gate | Status |
| --- | --- | --- | --- |
| **1** | `stop_identity.py`, `stop_aliases.json`, the `extract_leaf_rows` refactor, `aggregate_to_stop_ridership`, tests. **No data change.** | `pytest scripts/` green with the six existing test files unmodified; a full re-ingest produces byte-for-byte what it produced at the base commit (see below) | ☑ [#173](https://github.com/streetsforall/metro_ridership_app/pull/173) |
| **2** | `fetch_stop_locations.py`, `src/data/stop_locations.json`, `scripts/README.md`, tests | Match rate reported; unmatched reviewed and aliases extended | ☑ [#179](https://github.com/streetsforall/metro_ridership_app/pull/179) — bus 6,756/6,785 · rail 110/110 |
| **3** | `stop_ridership.py`, `update_ridership.py` wiring, the two data files, `DATA_RELEASE_NOTES.md` | Reconciliation within tolerance; two runs byte-identical | ☑ [#190](https://github.com/streetsforall/metro_ridership_app/pull/190) — 107,454 stop rows · two runs byte-identical · reconciliation median 0.06%, max 5.10% (see below) |
| **4** | Vite plugin, manifest, `src/stops/`, `stops.types.ts`, the `isInMonthWindow` extraction, vitest specs. **No visible UI.** | `ANALYZE=1 npm run build` — entry chunk unchanged; no visual baseline moves | ☑ [#180](https://github.com/streetsforall/metro_ridership_app/pull/180) — entry +36 B (the extracted predicate, nothing else) · 0 of 80 baselines moved |
| **5a** | The URL contract — `stops`, `measure`, `stop`, `stopq` — and the Stop Ridership checkbox | The checkbox round-trips through the URL; **the eight full-page baselines the checkbox moves are regenerated here and nowhere else** | ☐ |
| **5b** | `useStopView`: the two payloads' fetch gate and their independent fates. **No UI.** | `ANALYZE=1 npm run build` — entry chunk unchanged; the hook has no importer yet | ☐ |
| **5c** | `#stop-panel`, the ranked table, the coverage notice, the `OutputArea` wiring | New `stop-panel` baselines only; the eight 5a regenerated must **not** move again | ☐ |
| **5d** | The ridership-over-time column: `stopSeries`, `useVisibleRows`, the row sparkline | No new payloads; the trend column is the only baseline move | ☐ |
| **5e** | The stop series chart and its colour rule | [ADR-0014](adr/0014-colour-in-the-stop-series-chart-means-which-stop.md) written | ☐ this PR |
| **5f** | The map's circle layer and the `mapPopup` addition | Circles leave the map when the panel is unticked | ☐ |

1 → 2 → 3 are pipeline-serial. 4 can start once PR 1's schema is fixed. PR 3 carries
the multi-megabyte data diff alone, so its review is "is the data right", not "is the
code right".

PR 5 was authored whole and then split for review — first four ways, then 5a again into
three, because the first slice was still 4,000 lines. The six run in a stack, each adding
to what the one below ships. Exactly two of them touch visual baselines and they touch
disjoint sets: 5a regenerates the eight full-page shots the filter-bar checkbox displaces,
5c adds the four `stop-panel` shots, and 5d moves one of those four. The two ADRs the batch
owed (0012, 0013) went out separately, off `main`, since both record decisions PRs 1 and 3
already made.

### About PR 1's gate

It was originally written as "`git diff --stat src/data/ridership.json` empty after a
full re-ingest". **That is not satisfiable, and was not satisfiable before any of this
work started.** A re-ingest at the base commit already adds five rows — `line_name: 106`
at 2026-01 … 2026-05, all zero — because `fill_missing_months` synthesises them and the
committed file does not have them. So the committed `ridership.json` is not the fixed
point of its own pipeline.

Judge the gate against a **control run at the base commit**, not against the committed
file: the re-ingest must produce byte-for-byte what it produced before the change. PR 1
does (`sha256 f03df3a9…` for both runs).

The five synthesised rows are gone as of the padding fix below — but the gate does not
change, because a re-ingest still moves one value (line 602 at 2025-11, Saturday 238 →
237, a re-derivation of the days-weighted mean). **The control run remains the baseline.**

#### Settled: the committed file is right, the synthesised rows are wrong

Neither answer in the original framing was correct — `ridership.json` is not stale, and
line 106 is not missing data. **Line 106 was discontinued.** It ran normally to the end
of 2025 (158 stops, 4,062 weekday boardings in 2025-12), is absent from every export
from 2026-01 on — the *only* line dropped anywhere in the window — and is gone
from `public/metro_lines.geojson`, so Metro's own GTFS no longer carries it either.

A zero row asserts the line ran and carried nobody. Writing them would draw line 106
plunging from 4,062 to a flatline along the axis, which reads as a ridership collapse
rather than a line that ended — and the flatline grows by one month with every export
that lands. `CLAUDE.md` already has the words for this: *a month a line doesn't report
is a gap, not a zero.*

The rows appear because `fill_missing_months` cross-joins **the batch's** month range
with **the batch's** line set. Incremental ingests each covered a narrow range, so a line
that starts or stops mid-window was never padded across months outside its own batch. One
full re-ingest spans every month at once and pads everything. Line 74 is the mirror
image and is already in the committed file — five zeros for 2025-07 … 11, then real data
from 2025-12 — because its batch's range covered those months. So the file's working
convention is **pad the start, not the end**: at 2026-05 there are 114 lines and not one
with zero weekday ridership.

**Action for PR 3: none, beyond not "fixing" it.** Do not chase a clean
`git diff src/data/ridership.json` after a full re-ingest, and do not add the rows.

#### The padding rule is now enforced in code

Everything above described a convention the *data* followed and the *code* did not. Until
this was fixed, "pad the start, not the end" held only because the archives happen to be
delivered in narrow batches — feed the same months in as one wide batch and the padding
reappeared. `fill_missing_months` now pads a line's **leading** gap only. Months after a
line's last report, and interior months it skipped, are left absent.

**And the footgun that came with it is closed.** `merge_ridership`'s docstring promised
that "gaps in new data (within its date range) are backfilled from existing data before
the concat, preserving non-zero historical values." That backfill was **unreachable**: its
mask is `isnull(new) & notnull(old)`, but `fill_missing_months` had already `.fillna(0)`'d
every gap, so the new side was never null. Meanwhile
`pd.concat([merged, current]).drop_duplicates(keep="first")` let the new rows win — so a
wide-range re-ingest **could overwrite real committed ridership with zeros**, for any line
whose reporting is discontinuous inside the range, with the guard meant to prevent exactly
that sitting dead. It never fired on this data only because line 106's rows are absent
rather than present-and-nonzero.

Pads are now left as **NaN**, not `0`, which is what makes the existing mask reachable and
its docstring true. The NaN is load-bearing, and this is the part to not undo:

> **Padding cannot be detected by value — a real row may be all zeros.** Line 60 genuinely
> reported `0/0/0` for 2026-01. A backfill keyed on `== 0` instead of `isnull` would read
> that as padding and resurrect stale figures over a real zero report. Reported-ness comes
> from the merge indicator, never from the numbers.

Measured on a single wide batch over all five archives (2025-07 … 2026-06, 115 lines):
before, `42,747 → 42,753` records, writing six zero rows for line 106; after, `42,747 →
42,747` and none. Per-archive re-ingest is byte-identical to its control run.

`update_ridership.py`'s `diff_against_current` moved in step — a pad is not a pending
correction, and without that `--overwrite` reported 8 corrections where 1 was real.

## What PR 2 found and fixed

**The stop-grain ingest could not read `data/raw/` at all.** `06-2026-Bus.xlsx` has one
leaf row — line 155, 2.9 weekday boardings — whose `STOP_NAME` is blank.
`extract_leaf_rows` keeps it, because the bus rule filters on `DIRECTION`, and
`stop_identity._require_text` then raises `ValueError: Stop name is missing (nan)` by
design. So `aggregate_to_stop_ridership` raised on the whole archive. It was not
reachable when PR 1 was written: the month arrived in #176, afterwards.

Fixed in `aggregate_to_stop_ridership`, and **deliberately not in `extract_leaf_rows`.**
Those riders are a real observation of line 155 — what is missing is *where* they
boarded, not whether they did. Dropping them upstream would take them out of the line
totals too and quietly restate committed history in `ridership.json`. So the line keeps
them, the stop grain does not, and the drop is printed. That is the one case where the
per-line reconciliation is not exact; the test suite says so.

**Risk 7 is real, and the fix is to write no coordinate.** `STOP_NAME` is a corner pair
and LA reuses corner pairs across cities: `Main / Pico` exists in downtown LA and in
Santa Monica, 21 km apart. 39 stops centroided across more than 200 m, 12 of them across
more than 5 km.

Route shapes turn out to resolve almost none of it. The reporting lines for such a key
are the union over *both* places — `bus:main-pico` reports on lines 10, 30, 33 and 55,
and those serve both intersections — so the shapes of the reporting lines cover both and
filter nothing. Only one stop was rescued that way (`bus:mission-broadway`, 8.5 km →
25 m, dropping members no reporting line runs past). `stop_times.txt` would not help
either, for the same reason: the key is genuinely two places, and one dot per `stop_key`
cannot represent that.

So a group still more than 1 km wide gets **no coordinate**, and goes to `unmatched` with
`reason: "ambiguous-name"` — the already-designed "has ridership, no geometry" path, so
the ranked table and the series keep it and only the map skips it. **No stop in the file
now carries a coordinate known to be wrong**, which is what PR 5 would otherwise have had
to work around. 16 bus stops are in this state; the widest remaining centroid is 899 m.

**Match rate: bus 6,756/6,785 (99.6%), rail 110/110 (100%)** against the feeds of
2026-06-07. Rail reaches 100% via ten `stop_aliases.json` entries. The 29 bus stops
without coordinates are 16 `ambiguous-name` plus 13 `no-gtfs-match`, all **kept** in
`src/data/stop_locations.json`. Rail is 110 places rather than the 116 names in the
export because platform suffixes fold — `Union Station - A Line` and `Union Station -
Metro Red & Purple Lines` are one station.

## What PR 3 found

**Coverage is twelve months and that is all there is.** 107,454 stop rows —
105,984 bus across 6,785 stops and 109 lines, 1,470 rail across 110 stops and 6 lines,
2025-07 → 2026-06. The payloads are 5.3 MB and 89 KB; the bus file gzips to 1.2 MB.
`ridership.json` is untouched by the run, and a from-scratch regeneration followed by a
re-run produced byte-identical files both times.

**The reconciliation drift is one-sided, and it is arithmetic.** Risk 4 above has the
numbers. The short version: Metro's `+0.5`-then-truncate rounds half up, and 8.5–9% of
stop values land on exactly `.5` — a Saturday or Sunday figure is an average over four
or five days, so halves and quarters are common. Every one of those rounds up, worth
about +0.03 riders per stop. A 70-stop line therefore reports a few riders more at stop
grain than at line grain, in the same direction, every month. It is invisible on a big
line and 5% of line 602's Sunday total. Using a different rounding rule at stop grain
than the line side uses would trade a documented bias for an undocumented divergence.

**`src/stops/stopData.test.ts` pinned `monthCount` to `0`.** PR 4 wrote that assertion
with a comment saying the payloads "are not on this branch" and that what mattered was
that the virtual module resolved at all. Landing the payloads made it `12`. It is now
asserted as a non-negative integer, so it does not fail again on the month after next.
This is the one file PR 3 touched outside the pipeline.

**`iter_raw_frames` is still in the wrong module.** PR 2 put the walk over `data/raw/`
in `fetch_stop_locations.py` and noted it belongs beside `convert_zip`. PR 3 imports it
from there rather than copying it — a second copy of the archive-layout rule is what
`extract_leaf_rows` exists to prevent — so the merge step now imports from the geometry
fetcher. Worth moving, in a PR that is allowed to touch both.

## What PR 5 found

**The panel's visibility control was deferred, then added.** The panel opens with `stops=1`, and the
hook has always exposed `showStops` / `toggleShowStops`. No checkbox was added at first, for two
reasons pointing the same way: new chrome in the filter bar moves the full-page baselines, which this
PR's original gate forbade, and
[#181](https://github.com/streetsforall/metro_ridership_app/pull/181) and
[#182](https://github.com/streetsforall/metro_ridership_app/pull/182) are both open, both rewriting
`DateRangeSelector` into a Panel Settings section, and both regenerating those baselines.

It was added anyway, on request: a second checkbox in `DateRangeSelector`'s existing **Panel
Visibility** fieldset, beside Context Logs, labelled *Stop Ridership*. `App` threads `showStops` and
`toggleShowStops` down explicitly, because `DateRangeSelector` takes named props rather than the
`{...userDashboardInputState}` spread `LineSelector` gets.

**This trades the gate away, and the cost was eight baselines, not nine and not six.** Three specs
screenshot `fullPage` with the filter bar in frame: `visual.spec.ts` (6), `responsive-tablet.spec.ts`
(2 — its comment at `:45` names the `sm:flex-row` date range selector as a branch under test), and
`chart-tooltip.spec.ts`'s `chart-tooltip-strip-mobile` (1). **Eight moved and are regenerated here**;
the ninth did not move at all.

`chart-tooltip-strip-mobile` is the exception, and the reason is worth keeping: it shoots
`fullPage: true` with a `clip` computed from `#ridership-chart`'s own document rect
(`e2e/chart-tooltip.spec.ts:237-265`), so a taller filter bar shifts the pane and the clip by the same
amount and the captured pixels are unchanged. Do not regenerate it looking for a diff that is not
there.

Where the movement was real it was layout displacement rather than sub-threshold jitter, so it could
not have hidden inside `maxDiffPixelRatio`. Whoever regenerates these must reconcile with #181/#182,
which are editing the same component.

**`stop=<key>` needs no encoding, and gets some anyway.** The key is a URL-safe slug, but
`URLSearchParams.toString()` percent-encodes `:` regardless, so the written form is `bus%3A…`. It
decodes back to the same key, so a shared link still selects the stop it named; only the plan's claim
about the literal spelling was wrong.

**`src/stops/index.ts` exposes no per-stop series.** The panel assembles them in
`src/utils/stopSeries.ts` from the module's own month axis and `stopMetrics` — no window arithmetic,
no second copy of the Day Of Week → column mapping. It would sit better inside the module, next to
`stopMetrics`.

`buildStopSeriesIndex` is the whole panel's supply: one pass groups every record by (stop, line), and
a pair's months are aligned on first ask and cached. Both readers — the sparkline column and the
figure above it — read that one cache, so a stop's row and its chart draw the identical array. The
per-call scan it replaced was O(rows × records), ~800 × ~106,000 once every row has a sparkline.

**The selected stop can be deselected, four ways.** It was a one-way door: a reader who opened a
series could reach another stop or close the panel, but not return to the state the panel opens in.
Every route in is now a toggle — the table row, its checkbox, the map circle — and `Clear All` empties
the selection outright. The map's handler is registered once in `load`, so it calls out through a
ref; a closed-over prop would be the first render's and would leave the map wired to a selection
nobody has any more.

The toggling added no state. The URL sync already wrote `stop` conditionally, so clearing drops the
param and a cleared panel is as shareable as a selected one.

**`selectedStopKey: string | null` became `selectedStopKeys: string[]`**, comma-joined into the same
`stop=` param. A comma cannot occur inside a key, whose charset is `^(bus|rail):[a-z0-9-]+$`, so
splitting is unambiguous — and every link shared before this carries one key and still works. The
search is its own param, `stopq=`, wired through both the lazy initialiser and the URL-sync effect.

Selection order is load-bearing: the chart takes a hue by position, so a stop added later must land at
the end, since inserting anywhere else would recolour every series already drawn.

**Diagram 10 is now four parameters behind.** `10-url-contract.mmd` is titled "The nine parameters"
and enumerates them; this batch added `stops`, `measure`, `stop` and `stopq`, so the count and the
boxes are both wrong. It is the same file #181 and #182 are rewriting, which is why it was left alone.

**`stop_locations.json` is 1.6 MB, and `stops.types.ts` calls it "small".** A static import would have
put it in `OutputArea`'s chunk, which every reader downloads, so the panel `import()`s it into its own
chunk, fetched with the rail payload when the panel opens. Worth correcting the comment; worth more
not bundling it.

**The stop table is a multi-select, and the two ranked tables now match.** The line selector had a
checkbox per row, a search bar and a `Select All` / `Clear All` pair; the stop table had none in the
first draft. It has all three now, laid out as `LineFilters` lays them out — search in a row of its
own closed by a rule, then the two actions under it, both above the table they act on.

**Nothing caps the selection, and `Select All` is scoped by the search instead.** Strict analogy with
the line selector, which caps nothing either and relies on its own search. The exposure is real and
recorded rather than fixed: press `Select All` on an unsearched five-line table and you pick ~800
stops, all of which the chart will try to draw. `Select All` adds only the listed rows and `Clear All`
clears globally — the line pair's asymmetry, copied deliberately, because two ranked tables under one
dashboard should not answer the same two words differently.

**Colour in the stop series chart now means which stop, and only there.** Hue was spoken for by the
line and dash by the Stop Measure, so two stops on line 204 drew as identical teal lines. The figure's
series take an eight-hue palette in selection order; the row sparkline stays line-coloured and the
map's ring stays neutral navy. Colour therefore answers two questions on one screen, which is the cost
— recorded in **ADR-0014** along with why the palette stops at the figure. `Map.test.tsx` asserts the
ring is one colour, so extending the palette onto the map fails a test rather than sliding in unread.
The palette cycles past eight, the honest consequence of capping nothing.

**A stop row is identified by its line and its stop together, because a stop key alone does not
identify one.** A stop serving two selected lines occupies two rows. `stop-row-`, `stop-select-` and
`stop-sparkline-` all carry the row key — the identity React already keys on — rather than the stop
key, and a unit case renders one stop on lines 204 and 801 to hold it there. No fixture puts one stop
on two lines, so nothing failed; the trap was that an e2e locator would have matched two elements and
failed strict mode the moment one did, and `document.querySelector` in a unit spec would have
silently taken the first. The e2e half goes through `stopQa`, so the shape is written once.

**A long stop name still clips out of the legend at mobile width, after two attempts to fix it.** The
measure now joins a legend label only under `both`, where two datasets per stop need separating —
under a single measure every series *is* that measure and the toggle already says which. And the
checkbox column's `SELECT` heading became `sr-only`, because six characters cannot fit a `w-10` cell
and were widening the column, pushing an already-overflowing mobile table further sideways; narrowing
it brought `AVG. BOARDINGS` back into view. What remains is arithmetic: `7th Street / Metro Center
Station · A Line` is 41 characters in a 294px box, so Chart.js truncates it. The row beneath names the
stop in full and the desktop legend is clean, so nothing is unreadable — but a reader on a phone
comparing two long station names is reading the table, not the legend.

**The sparkline column mounts lazily, and on mobile that means not at all.** The ranked table can hold
~800 rows against the line table's ~180, so a Chart.js instance per row is not affordable up front;
`useVisibleRows` mounts a row's chart when it is scrolled to and keeps it mounted. One observer for
the table, rooted on the `max-h-[28rem]` scroller rather than the viewport, because `rootMargin` grows
the *root* rect and a viewport root would grow the wrong box and pre-mount nothing.

The consequence, measured: at mobile width the table is 696px of content in a 294px scroller, so the
last column sits outside the box and **no sparkline mounts until the reader scrolls sideways.** The
observer is right not to draw it, and the horizontal scroll is pre-existing — six columns were already
472px in that 294px — but the new column widens it by 224px. Hiding the column below `sm` is one
class; it was left visible because it was asked for and is reachable.

**The PR body carries four mermaid diagrams, and the committed diagram set does not.** A data flow of
the stop grain with the new modules accented, a sequence for the payload intent gate, a sequence for
picking a stop, and a small picture of the stop × line grain. They live in the pull request rather
than in `docs/architecture/mermaid/` for the reason nothing else here touches that directory:
`diagrams.md` is one generated file, and regenerating it would put this PR back in the path of #181
and #182. That reasoning expires when those land, so **#228** holds the decision about which of the
four earn a stem of their own — the data flow being the strongest candidate, since `05` covers line
grain and the set has no stop-grain counterpart. Each fence was rendered against the pinned mermaid
before publishing; GitHub renders with its own build, so parsing locally is necessary rather than
sufficient. `07`, `08` and `10` are all being edited by the two open panel PRs, so regenerating them
here would guarantee conflicts for no gain.

## The contract PR 1 freezes

PRs 2–5 read these and do not restate them.

**`aggregate_to_stop_ridership(df, year, month, mode)`** returns one row per line per
stop:

```
year, month, mode, line, stop_key, stop_name, station_order,
wd_ons, wd_offs, sa_ons, sa_offs, su_ons, su_offs
```

Values are raw decimals — rounding happens on write. `*_ACT` is dropped (it equals
ons + offs). Bus direction is collapsed. `station_order` is rail-only, an ordering
attribute, **never an identity**.

**`stop_identity`** owns naming: `normalise_stop_name`, `display_stop_name`,
`strip_rail_platform_suffix`, `parse_station_order`, `stop_key`. Keys are URL-safe
slugs (`^(bus|rail):[a-z0-9-]+$`) so `stop=<key>` needs no encoding.

**`extract_leaf_rows(df, mode)`** is the single source of truth for which rows are
real observations, and carries the ROUTE-over-LINE resolution. Any new aggregation
goes through it.

See [`../scripts/README.md`](../scripts/README.md) for the detail, including the
reconciliation caveat.

## Decisions that are settled

- **Bus grain is stop × line, direction collapsed.** Cuts the payload by ~41% —
  measured over `data/raw/`: 14,851 → 8,797 rows/month for 2025-07 … 11, 15,146 →
  8,953 for 2025-12, and 14,927 → 8,838 for 2026-01 … 05. It costs nothing
  renderable, because `STOP_NAME` is a name and not a `stop_id`, so both directions of
  a street share one name and therefore one coordinate. (Grouping on the raw name
  gives 8,841 for the last five months; name normalisation folds three further pairs
  that are spelling variants of one stop, e.g. `Pacific / RR-- Xing` and
  `Pacific / RR-Xing`.) Reopenable: `stop_times.txt` could recover direction later.
  2025-12 is the outlier month — 40 bus stops appear at once, an Altadena/Fair Oaks/
  Lake/Lincoln/Mariposa corridor plus `bus:little-tokyo-arts-district-station` on
  line 30 — and 8 disappear the month after.
- **No stop-total-across-lines rollup.** 79% of stops serve exactly one line, so the
  rollup would be ~77% the size of the detail table. Sum client-side.
- **Selection is the clutter control, not zoom-gating.** Max 154 stops on one bus
  line, so a 5-line selection draws ≤ ~800 circles.
- **Stop files ship columnar** from Python and the Vite plugin passes them through.
  `ridership.json`'s pretty-printed-records convention at ~97k rows × 10 fields would
  be ~25 MB rewritten in full every monthly update — a repo-growth problem, not a
  style preference. ADR-0008 records this.
- **Split by source export, not by app mode.** G Line (901) and J Line (910) BRT
  arrive in the *Bus* workbook, so `stop_ridership.bus.json` contains lines the app
  shows under the train filter. The client's mode filter keys off
  `metro_line_metadata_current.json`, never off which file a row came from.

## Named risks

1. **Forking the Month Window** — was highest, now **closed**, and then the fork's cause
   was removed outright.
   [ADR-0001](adr/0001-ridership-month-window-is-deliberately-offset.md) existed because
   this arithmetic drifted once already. PR 4 extracted `isInMonthWindow` so both
   derivations called one copy; the follow-up got each rule down to one statement in
   `src/utils/month.ts`; and
   [ADR-0009](adr/0009-the-two-window-rules-are-one-rule.md) then showed the second rule
   did not need to exist at all. There is now **one** rule, `contains` — `S ≤ R ≤ E`,
   inclusive both ends — reached through `src/ridership/monthWindow.ts` and
   `src/ridership/eventWindow.ts`, which differ only in what they accept. Bounds must
   stay month-aligned. **The rule that replaces this one: don't restate the window at a
   call site, and don't add a second one.**
2. **3.8 MB reaching first paint** — the bus file loads only when the stop panel is
   on *and* a bus-export line is selected, inside `OutputArea`'s lazy chunk. This is
   the failure that would undo that lazy-load.
3. **Non-deterministic write ordering** → a phantom multi-megabyte diff every run.
   Explicit sorts on both the rows and the stops dictionary.
4. **Stop sums ≠ line totals** — genuine and unavoidable. Documented as a tolerance;
   not engineered away. **The plan's `< 0.02` figure was a guess and the data
   disagrees.** PR 3 measured it over all three day types, twelve months, 3,978
   comparisons: median 0.06% / p95 0.83% / **max 5.10%**, with 26 at or above 2%.
   The earlier 2.35% figure in this file was **weekday only**; Sunday on a small line
   is the harder case. `--check` keeps `0.02` as its default and prints every
   exceedance rather than hiding them behind a looser bound — `--tolerance 0.06` is
   what green looks like over the current window. Note also that for this window the
   days-weighted average contributes **nothing** — the Excel importer hardcodes
   `Days = 1` — so the whole spread is per-stop rounding, and it is **one-sided**:
   `+0.5`-then-truncate rounds half up, 8.5–9% of stop values sit exactly on `.5`, and
   the result is about +0.03 riders per stop, every month, upward.
5. **Alias rot** — a rename silently splits a series. The rename guard (PR 3) fails
   the ingest when a key appears and another disappears in the same month, and
   **it is silent on the twelve committed months**, which is the outcome this risk
   wanted. Bus deltas are `+40/-0` at 2025-12 and `+0/-8` at 2026-01, never both in
   one month.
   **A same-month rule is still too narrow for the churn actually in this data.**
   `bus:san-vicente-fairfax` runs 2025-07 → 2025-12 and
   `bus:san-vicente-orange-grove` runs 2025-12 → 2026-05: same line 28, same
   corridor, comparable boardings, and **one month of overlap**, so the add lands in
   2025-12 and the drop in 2026-01. `detect_renames(..., window=1)` catches that shape
   and the ingest **prints it without failing** — it necessarily fires on this data
   (2025-12's 40 real additions sit next to 2026-01's 8 real discontinuations), and a
   gate that is red on correct data only teaches people to pass `--allow-new-stops`
   reflexively. Same-month fails; adjacent-month informs.
6. **805-under-802 at stop grain** — any aggregation skipping `extract_leaf_rows`
   attributes D Line stations to the B Line. Covered structurally plus a dedicated
   test.
7. **Bus centroid ambiguity** — **settled in PR 2.** Two sides of a street are ~20 m
   apart and fine at `maxZoom: 16`; a name reused by two distinct places is not. Every
   stop carries `spread_m`, and a group still more than 1 km wide after route-shape
   narrowing gets **no coordinate** rather than a midpoint in neither place. 16 bus
   stops. See *What PR 2 found and fixed*.
8. **Playwright project topology** — the `map` project runs once, not per viewport,
   and the two viewport projects `testIgnore` `map.spec.ts`. A feature spanning WebGL
   and DOM needs two specs in two projects.

## Docs each PR owes

- **ADR-0008** — stop ridership ships columnar from the pipeline, not as pretty
  records (PR 3 or 4).
- **ADR-0009** — a stop's identity is its normalised name, not Metro's row order
  (PR 2).
- **`CONTEXT.md`** — register **Stop Place**, **Stop Ridership Record**,
  **Boardings** / **Alightings** (*avoid*: ons, offs), **Stop Readout**, **Stop
  Coverage Window** (PR 5, or earlier if a PR needs the words first).
- **`docs/how-it-works.md`** — a "Stop-level ridership" section; the lazy-load rule
  and the BRT-901/910-in-the-bus-file quirk under *Conventions and quirks*.
- **`docs/guides/data.md`** — the stop step in "The usual path"; which baselines move.
- ~~**`DATA_RELEASE_NOTES.md`** — the backfill, its 12-month span, and that line history
  is untouched~~ — done in PR 3, along with the `stop_ridership` section of
  `scripts/README.md`.
- **Diagrams** — `03-python-data-pipeline.mmd` gains the stop chain,
  `04-build-pipeline.mmd` the second plugin; also `05`, `07`, `08`, `10`, `15`, `16`.
  **Every edited `.mmd` needs its `captions.md` section in the same commit** —
  `scripts/build_architecture_docs.mjs` pairs by filename stem and fails the build on
  a mismatch. Then `npm run docs:architecture`.

## Side task, not code

A CPRA request to `records.metro.net` (NextRequest) for average weekday/Saturday/Sunday
**boardings and alightings by rail station and by bus stop**, FY2022-23 through
FY2025-26, **in CSV or Excel matching the existing `MM-YYYY-{Bus|Rail}.xlsx` export
layout** — asking for the same export shape is what makes the response drop straight
into this pipeline. Precedent: a requester obtained station-level rail + BRT for
FY2022-23 and FY2023-24 this way (Streetsblog LA, 2024-08-14). Turnaround is weeks, so
file early and build against the 11 months meanwhile.

**A cleanup pass found two things that were not cleanup.** The stop series took its hue from a
position in the *flattened* series list rather than in the Stop Selection, so a stop served by two
selected lines drew in two hues and shifted every later stop's — the effect
[ADR-0014](adr/0014-colour-in-the-stop-series-chart-means-which-stop.md) exists to prevent. The hue is
now taken in `StopPanel`, where selection order is still in hand, and carried on `DrawnStopSeries`;
two series of one stop share a hue and the legend prefix names the line.

Separately, each stop row was **two** tab stops — the row and its checkbox — so an 800-row table held
~1600 and a screen reader announced every row twice, only the second announcement carrying anything.
The row keeps its click target and loses `tabIndex`, the convention `LineTableRow` already followed.
