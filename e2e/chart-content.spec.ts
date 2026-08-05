import { test, expect, type Page } from '@playwright/test';
import { gotoDashboard, shootChart } from './helpers';

/**
 * Element-scoped visual coverage for what the ridership chart actually draws.
 *
 * `visual.spec.ts` shoots the whole page, where the chart is a small fraction of the frame —
 * small enough that a chart rendering the wrong series, the wrong colours or the wrong axis
 * still lands under the full-page `maxDiffPixelRatio`. These tests crop to `#ridership-chart`
 * and tighten the tolerance, so the graph is pinned on its own terms.
 *
 * Each case is driven purely by the query string, which `useUserDashboardInput.ts` parses in its
 * lazy `useState` initialisers. Two rules that keep these baselines stable:
 *
 * - **`end` is always pinned.** Its default is `dataDefaultEndDate`, derived from the dataset via
 *   `virtual:ridership-bounds`; omitting it would silently invalidate every baseline here on the
 *   next ridership refresh.
 * - **Rail line IDs only** (801=A, 802=B, 803=C, 804=E, 806=L, 807=K, 901=G, 910=J). Rail lines
 *   carry hardcoded brand colours, so a colour regression is visible; buses get a golden-angle
 *   HSL hue that shifts with the line list. 805 (D Line) is avoided on purpose — it starts
 *   mid-series, so its shape depends on data coverage rather than on rendering.
 *
 * Note the date filter in `src/App.tsx` is exclusive on both ends and off by one month (it
 * compares `new Date(year, month)` against 1-based data months). That is long-standing intended
 * behaviour, so the rendered window is whatever these params actually produce, not what they
 * read like — the baselines record it.
 *
 * The legend follows the alphabetical `lines[]` array rather than URL order, so `lines=801,802`
 * and `lines=802,801` are the same view.
 */

/**
 * Load a dashboard view and prove the chart rendered before anything is captured.
 *
 * Without this a typo'd `lines` param would quietly snapshot the "Please select a Metro line."
 * placeholder — which is a `.pane` too, and would happily bake in as a green baseline.
 */
async function gotoChart(page: Page, search: string): Promise<void> {
  await gotoDashboard(page, search);
  await expect(page.locator('#ridership-chart')).toBeVisible();
  await expect(page.getByText('Please select a Metro line.')).toHaveCount(0);
}

test('single rail line', async ({ page }) => {
  await gotoChart(page, '?lines=801&start=2019-12&end=2026-05&day=wkday');
  await shootChart(page, 'chart-single-line.png');
});

test('multiple rail lines', async ({ page }) => {
  // Three brand colours at once: a broken per-line colour lookup shows up as a repeated hue.
  await gotoChart(page, '?lines=801,802,804&start=2019-12&end=2026-05&day=wkday');
  await shootChart(page, 'chart-multiple-lines.png');
});

test('aggregate series', async ({ page }) => {
  // Same three lines plus the summed "Aggregate" series, which rides well above the rest and so
  // also rescales the y-axis — the axis labels are part of what this pins.
  await gotoChart(page, '?lines=801,802,804&aggregate=1&start=2019-12&end=2026-05&day=wkday');
  await shootChart(page, 'chart-aggregate.png');
});

test('saturday ridership', async ({ page }) => {
  // Same lines and window as the weekday cases but a different `dayOfWeek` stat, so this fails if
  // the day-of-week filter stops reaching the chart data.
  await gotoChart(page, '?lines=801,802&start=2019-12&end=2026-05&day=sat');
  await shootChart(page, 'chart-saturday.png');
});

test('narrow date window', async ({ page }) => {
  // A ~1-year window: far fewer x-axis labels than the full-span cases, which is what pins the
  // date filter's effect on the rendered axis.
  await gotoChart(page, '?lines=801,802&start=2022-12&end=2023-12&day=wkday');
  await shootChart(page, 'chart-narrow-window.png');
});
