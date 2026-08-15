import { test, expect, type Page } from '@playwright/test';
import { gotoDashboard, shootPane } from './helpers';

/**
 * Visual coverage for the chart's month readout.
 *
 * This is the one part of the chart that *can* be snapshotted cheaply. The readout is HTML —
 * `ChartTooltip` renders into the plot's box rather than into the canvas — so it crops to a
 * small, deterministic element rather than the 1184×592 canvas `chart-content.spec.ts` shoots.
 * Its sibling `chart-interaction.spec.ts` stays snapshot-free and asserts behaviour; what these
 * two baselines add is the layout that no attribute assertion can describe: the ridership rows
 * against the event block, the category-tinted title, and the clamp.
 *
 * ## Reaching each state without pixel arithmetic
 *
 * Neither test hovers. A hover would have to guess a column's x-position from the plot's box,
 * which moves with the axis width, the legend's wrap and the viewport — and `shootPane` parks
 * the cursor at 0,0 before capturing anyway, which would dismiss the very thing being shot.
 *
 * - **Pinned** — click the context-log row. That is DOM, and it pins the row's month by label,
 *   so the shot is anchored to an *event*, not to a pixel.
 * - **Focused** — `ArrowRight` from the focused plot. Keyboard focus renders the same readout
 *   with `data-pinned="false"`, which is the hover appearance exactly: description clamped to
 *   three lines, no source link, no unpin hint.
 *
 * ## The pinned window: `start=2019-06&end=2020-12`
 *
 * Both bounds are pinned, and for the reason `context-logs.spec.ts` spells out: `end` otherwise
 * defaults to `dataDefaultEndDate`, which advances on every ridership refresh. Line 801 has all
 * 17 months of the resulting Month Window (2019-06 → 2020-10), so the ridership figure in the
 * readout is historical and frozen.
 *
 * The first log row is **2020-03 "COVID-19 Service Reductions"** (`disruption`, rose). Its
 * description runs well past three lines, which is what makes the clamp visible in the focused
 * shot and its absence visible in the pinned one. A data PR that rewrites that event's text, or
 * inserts an earlier event into the window, rebases both baselines — and should.
 */
const WINDOW = '?logs=1&lines=801&start=2019-06&end=2020-12&day=wkday';

const TOOLTIP = '[data-testid="chart-tooltip"]';

const plot = (page: Page) => page.getByRole('application');

test('pinned readout — ridership, event, source link', async ({ page }) => {
  await gotoDashboard(page, WINDOW);

  await page.locator('#context-log-panel li button').first().click();

  // Prove the state before capturing: `--update-snapshots` would otherwise happily rebase a
  // hover-shaped readout, or an empty one, into a green baseline.
  const tooltip = page.locator(TOOLTIP);
  await expect(tooltip).toHaveAttribute('data-pinned', 'true');
  await expect(tooltip).toContainText('COVID-19 Service Reductions');
  await expect(tooltip.getByRole('link', { name: 'Source' })).toBeVisible();

  await shootPane(page, TOOLTIP, 'chart-tooltip-pinned.png');
});

test('focused readout — description clamped, no link', async ({ page }) => {
  await gotoDashboard(page, WINDOW);

  await plot(page).focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('End');

  // 2020-10 is the last month of the window and carries no event, so this is also the readout's
  // plain shape: heading and ridership rows, nothing else.
  const tooltip = page.locator(TOOLTIP);
  await expect(tooltip).toHaveAttribute('data-pinned', 'false');
  await expect(tooltip).toContainText('Oct 2020');

  await shootPane(page, TOOLTIP, 'chart-tooltip-focused.png');
});

test('focused readout on a month that has an event', async ({ page }) => {
  await gotoDashboard(page, WINDOW);

  await plot(page).focus();
  // 2019-06 is index 0; 2020-03 is nine months later.
  await page.keyboard.press('Home');
  for (let i = 0; i < 9; i++) await page.keyboard.press('ArrowRight');

  const tooltip = page.locator(TOOLTIP);
  await expect(tooltip).toContainText('Mar 2020');
  await expect(tooltip).toContainText('COVID-19 Service Reductions');
  // The clamp is the point of this shot, so assert the link's absence rather than the clamp
  // itself — `line-clamp` leaves no accessible signal, only pixels, which is what the baseline
  // is for.
  await expect(tooltip.getByRole('link', { name: 'Source' })).toHaveCount(0);

  await shootPane(page, TOOLTIP, 'chart-tooltip-focused-event.png');
});
