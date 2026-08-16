import { test, expect } from '@playwright/test';
import { gotoDashboard, shootPane } from './helpers';

/**
 * Element-scoped visual coverage for the summary tiles (`src/components/SummaryData.tsx`).
 *
 * `visual.spec.ts` shoots the whole page, where these tiles are a small strip of a 1.2 MB frame —
 * small enough that a wrong figure, a lost tile or the wrong change colour still lands under the
 * full-page `maxDiffPixelRatio`. Cropping to `#summary-data` makes a regression here a small,
 * legible diff. The component is worth pinning on its own: its comments document two separate
 * real horizontal-overflow bugs caused by min-content width leaking into a `1fr` grid track, it
 * has three layout branches, a conditional red/green change colour, and two conditionally
 * rendered tiles (`ridersPerMile`, `totalMiles`).
 *
 * ## Window
 *
 * These tiles render literal numbers, so both `start` and `end` are pinned and the window is
 * closed and historical — an append to `ridership.json` cannot move a figure in these baselines.
 *
 * `?start=2015-01&end=2018-12` **renders 2015-01 through 2018-12**, 48 months — the window is
 * inclusive of both ends (ADR-0009).
 *
 * The window moved here from `end=2019-12`. Under the offset rule that URL rendered through
 * 2019-10; inclusive, it picks up two more months, and those two flip the three-line sum from
 * +3,560 to -1,689 — which would have left the `changeInRidership > 0` branch below unpinned.
 * `2018-12` is a nearby closed window where the two cases still land on opposite signs.
 *
 * ## Lines
 *
 * Rail line IDs only (802=B, 804=E, 901=G, 910=J), and never 805 (D Line): its coverage bounds
 * advance with every monthly refresh. 806/807 are avoided too — 806 has no entry in
 * `line_distances.json` and 807 reports zero weekday ridership across this window, so neither
 * exercises the conditional tiles.
 *
 * The tiles are a sum over the selection, so the "Selected:" paragraph is what identifies which
 * lines produced the figures.
 */

test('single rail line with a negative change', async ({ page }) => {
  // 802 (B Line) over the rendered window: a change of -9,371. Pins the
  // `changeInRidership < 0` branch, which is the only thing that renders the change readout in
  // `text-red-600` rather than `text-green-600`.
  await gotoDashboard(page, '?lines=802&start=2015-01&end=2018-12&day=wkday');

  // Asserted, not merely assumed from the PNG: if the underlying figure ever flips positive the
  // baseline would still "pass" as a green diff-free render of the wrong branch.
  await expect(page.locator('#summary-data [aria-label="Change"]')).toHaveText(
    /^-/,
  );

  await shootPane(page, '#summary-data', 'summary-negative-change.png');
});

test('several rail lines', async ({ page }) => {
  // Three lines, each with a `line_distances.json` entry, so `totalMiles > 0` and both
  // conditional tiles render — all four tiles at once, plus the "Selected:" paragraph on its own
  // `basis-full` row, which is what pins the `flex-wrap` row at `lg` and the stacked grid below.
  //
  // The set is chosen so the summed change is *positive* (+10,716 + -5,867 + -1,240 = +3,609):
  // together with the case above this pins both sides of the change colour — green with its `+`
  // prefix here, red there.
  await gotoDashboard(
    page,
    '?lines=804,901,910&start=2015-01&end=2018-12&day=wkday',
  );

  await expect(page.locator('#summary-data [aria-label="Change"]')).toHaveText(
    /^\+/,
  );
  await expect(page.locator('#summary-data .pane')).toHaveCount(4);

  await shootPane(page, '#summary-data', 'summary-all-tiles.png');
});
