import { test, expect, type Page } from '@playwright/test';
import { gotoDashboard, shootChart, desktopOnly } from './helpers';

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

/**
 * Event Gutter shapes, at several category colours in one frame.
 *
 * These render on **every** chart, not only under `logs=1` — `buildRidershipView` returns
 * `events` unconditionally and `OutputArea` hands them straight to the `eventGutter` plugin.
 * So every baseline in this file already contains gutter shapes; what none of them pinned is
 * that the shapes differ *from each other* by category. This case does.
 *
 * `start=2020-01&end=2023-12` with 801 + 804 puts six events in the Event Window, spanning
 * five distinct hues:
 *
 * | Event | Category | Hue |
 * |---|---|---|
 * | 2020-03 COVID-19 Service Reductions | `disruption` | rose |
 * | 2020-04 COVID-19 Emergency Schedule | `hours_change` | orange |
 * | 2020-12 NextGen Phase 1 | `route_change` | violet |
 * | 2021-06 NextGen Phase 2 | `route_change` | violet |
 * | 2021-10 GoPass Free Student Fares | `fare_change` | sky |
 * | 2021-12 NextGen Phase 3 | `route_change` | violet |
 * | 2022-12 Bus Service Restored | `headway_change` | amber |
 * | 2023-06 Regional Connector Opening | `opening` | emerald |
 *
 * A window this wide is deliberate: the four `*_change` variants used to share one amber, and
 * three of them are in frame here, so collapsing the palette back to groups is visible as a
 * repeated hue rather than as a subtle shift. `end` is pinned per the rule above; the events
 * themselves are committed data, so this only rebases if `transit-events.json` gains an entry
 * inside 2020-01..2023-12 with an empty `line_ids` or naming 801/804.
 */
test('event gutter across categories', async ({ page }) => {
  await gotoChart(page, '?lines=801,804&start=2020-01&end=2023-12&day=wkday');
  // The default `maxDiffPixelRatio: 0.01` cannot see this, which is not a guess: regenerating the
  // other ten chart baselines against this palette left all ten byte-identical, because a handful
  // of thin dashed rules on a ~462,000 px crop never reaches 1%. An absolute budget is what makes
  // the shot able to fail at all. Calibrated by mutation — collapsing `route_change` onto amber
  // moves 460 px across its three shapes, so ~153 px per shape, and 120 catches even a
  // single-category regression while leaving room for antialiasing drift.
  await shootChart(page, 'chart-event-gutter.png', { maxDiffPixels: 120 });
});

/**
 * The Month Window selection band, mid-gesture.
 *
 * The band has never had a baseline, which is a problem now that "a click no
 * longer flashes a window" is a claim someone could regress. The DOM specs in
 * `chart-interaction.spec.ts` can say a window was or was not *set*; only pixels
 * can say what the reader saw while the button was down. This shoots the promoted
 * state: the tinted band and its two edge rules.
 *
 * `shootChart` parks the cursor at 0,0 before capturing, which would end any
 * gesture driven with the mouse — so the press is held and the shot taken with
 * the button still down, using `toHaveScreenshot` directly rather than through
 * that helper.
 *
 * Desktop only, for the same reason the drag itself is: on touch a horizontal
 * drag over a chart is how the page scrolls, so the gesture is never claimed.
 */
test.describe('the promoted Month Window drag', () => {
  desktopOnly();

  test('bands the plot between its edges', async ({ page }) => {
    await gotoChart(page, '?lines=801,804&start=2020-01&end=2023-12&day=wkday');

    const box = await page.getByRole('application').boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.35, y);
    await page.mouse.down();
    // Past the promotion distance, so the band is painted by the time this settles.
    await page.mouse.move(box.x + box.width * 0.65, y, { steps: 10 });

    try {
      await expect(page.locator('#ridership-chart')).toHaveScreenshot(
        'chart-promoted-drag.png',
        { threshold: 0.2, maxDiffPixelRatio: 0.01 },
      );
    } finally {
      // Leave no button held down for whatever runs next in this worker.
      await page.mouse.up();
    }
  });
});
