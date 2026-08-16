import { test, expect, type Page } from '@playwright/test';
import { desktopOnly, gotoDashboard, mobileOnly, shootPane } from './helpers';

/**
 * Visual coverage for the chart's month readout.
 *
 * This is the one part of the chart that *can* be snapshotted cheaply. The readout is HTML —
 * `ChartTooltip` renders into the plot's box rather than into the canvas — so it crops to a
 * small, deterministic element rather than the 1184×592 canvas `chart-content.spec.ts` shoots.
 * Its sibling `chart-interaction.spec.ts` stays snapshot-free and asserts behaviour; what these
 * baselines add is the layout that no attribute assertion can describe: the ridership rows
 * against the event block, the Category Chip beside the date under a neutral title, and the clamp.
 *
 * ## Every test here is gated to one project, and that is the point
 *
 * The readout has two layouts and each exists at exactly one of the two viewports: the floating
 * box above a measured chart width of 480, the strip below it. An ungated shot would therefore
 * file the wrong layout under a name promising the right one — and worse than merely wrong. The
 * strip caps itself at a third of the plot and scrolls, so at 390px a crop of the readout holds
 * the month heading and one ridership row while the event block, the chip, the clamp and the
 * Source link sit below the fold. The DOM assertions still pass on that — `toContainText` does
 * not care whether a node is scrolled out of a box — so `--update-snapshots` would rebase three
 * baselines named for content none of them shows and report nothing wrong. Which is the same
 * trap the guide's assert-before-capture rule exists to close, one level further in.
 *
 * ## Reaching each state without pixel arithmetic
 *
 * No test hovers. A hover would have to guess a column's x-position from the plot's box,
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
 * 19 months of the resulting Month Window (2019-06 → 2020-12, both ends inclusive), so the
 * ridership figure in the readout is historical and frozen. The window ran to 2020-10, 17 months,
 * until ADR-0009 removed the two-month offset.
 *
 * The first log row is **2020-03 "COVID-19 Service Reductions"** (`disruption`, rose). Its
 * description runs well past three lines, which is what makes the clamp visible in the focused
 * shot and its absence visible in the pinned one. A data PR that rewrites that event's text, or
 * inserts an earlier event into the window, rebases both baselines — and should.
 */
const WINDOW = '?logs=1&lines=801&start=2019-06&end=2020-12&day=wkday';

/**
 * The same window with line 60 added, which is the cheapest way to reach a Month
 * carrying more than one event.
 *
 * An event names the lines it touches in `line_ids`, and an empty list means
 * network-wide. 2020-12 holds two — "NextGen Bus Plan Phase 1" (network-wide,
 * which is why `WINDOW` sees it) and "Rapid Lines Retired into Local Service",
 * which lists the eight Rapid lines it consolidated. 801 is not one of them; 60
 * is. Selecting both lines is therefore what makes that Month show two.
 *
 * The only other Month in the data with two is 2023-06, which would mean a
 * second window as well as a second line. This keeps the axis, the bounds and
 * the frozen ridership of `WINDOW` and adds one dataset.
 */
const BUSY_WINDOW = '?logs=1&lines=801,60&start=2019-06&end=2020-12&day=wkday';

const TOOLTIP = '[data-testid="chart-tooltip"]';

const plot = (page: Page) => page.getByRole('application');

/** The floating box. Desktop only, for the reason in the file note above. */
test.describe('wide chart', () => {
  desktopOnly();

  test('pinned readout — ridership, event, source link', async ({ page }) => {
    await gotoDashboard(page, WINDOW);

    await page.locator('#context-log-panel li button').first().click();

    // Prove the state before capturing: `--update-snapshots` would otherwise happily rebase a
    // hover-shaped readout, or an empty one, into a green baseline.
    const tooltip = page.locator(TOOLTIP);
    await expect(tooltip).toHaveAttribute('data-layout', 'floating');
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

    // 2020-12 is the last month of the window since ADR-0009 made both ends inclusive, and it
    // carries one event line 801 sees — "NextGen Bus Plan Phase 1", network-wide. So the shot is
    // heading, ridership row, the clamped event block, and the pin hint. No carousel: the month's
    // other event, "Rapid Lines Retired into Local Service", names the eight Rapid lines it
    // consolidated and 801 is not among them.
    const tooltip = page.locator(TOOLTIP);
    await expect(tooltip).toHaveAttribute('data-layout', 'floating');
    await expect(tooltip).toHaveAttribute('data-pinned', 'false');
    await expect(tooltip).toContainText('Dec 2020');

    await shootPane(page, TOOLTIP, 'chart-tooltip-focused.png');
  });

  test('focused readout on a month that has an event', async ({ page }) => {
    await gotoDashboard(page, WINDOW);

    await plot(page).focus();
    // 2019-06 is index 0; 2020-03 is nine months later.
    await page.keyboard.press('Home');
    for (let i = 0; i < 9; i++) await page.keyboard.press('ArrowRight');

    const tooltip = page.locator(TOOLTIP);
    await expect(tooltip).toHaveAttribute('data-layout', 'floating');
    await expect(tooltip).toContainText('Mar 2020');
    await expect(tooltip).toContainText('COVID-19 Service Reductions');
    // The clamp is the point of this shot, so assert the link's absence rather than the clamp
    // itself — `line-clamp` leaves no accessible signal, only pixels, which is what the baseline
    // is for.
    await expect(tooltip.getByRole('link', { name: 'Source' })).toHaveCount(0);

    await shootPane(page, TOOLTIP, 'chart-tooltip-focused-event.png');
  });

  /**
   * The state this ticket exists to produce, and the one no DOM assertion
   * describes: Prev, the position, and Next on one row above a single event
   * entry — where a busy Month used to stack every event it had and grow the
   * readout over the series underneath.
   *
   * Pinned by keyboard rather than by a log row, because the log's first row is
   * 2020-03 and that Month has exactly one event. 2020-12 is the Month with two
   * once line 60 is selected — see `BUSY_WINDOW` — and `End` is what reaches it.
   *
   * The mobile half of "identical on both surfaces" is not a second baseline
   * here. `chart-interaction.spec.ts` runs the whole carousel script ungated, so
   * the strip proves the behaviour at 390px; what a pixel would add over that is
   * the strip's own layout, which `chart-tooltip-strip.png` already holds.
   */
  test('pinned readout on a month with several events', async ({ page }) => {
    await gotoDashboard(page, BUSY_WINDOW);

    await plot(page).focus();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');

    const tooltip = page.locator(TOOLTIP);
    await expect(tooltip).toHaveAttribute('data-layout', 'floating');
    await expect(tooltip).toHaveAttribute('data-pinned', 'true');
    await expect(tooltip).toContainText('Dec 2020');
    // Assert the subject before capturing: the controls, the position, the one
    // event on show and the absence of the other.
    await expect(tooltip).toContainText('1 of 2');
    await expect(tooltip.getByRole('button', { name: 'Previous event' })).toBeVisible();
    await expect(tooltip.getByRole('button', { name: 'Next event' })).toBeVisible();
    await expect(tooltip).toContainText('NextGen Bus Plan Phase 1');
    await expect(tooltip).not.toContainText('Rapid Lines Retired');

    await shootPane(page, TOOLTIP, 'chart-tooltip-carousel.png');
  });
});

/**
 * The strip, and the thing the strip exists to prove: that the readout no longer
 * covers the Month it is describing — at this width it does not cover it at all,
 * because it sits above the chart entirely and breaks the pane to do so.
 *
 * jsdom can answer whether the component chooses the mode — `ChartTooltip.test.tsx`
 * does, by passing a width — but not whether a real 390px viewport produces a
 * chart narrow enough to trigger it, nor where the strip lands once it does.
 * Those are layout, and layout needs a browser.
 *
 * The one shot here that is not an element crop, for the reason at the capture.
 *
 * Mobile only. On desktop this shot would capture the floating box under a name
 * that promises a strip, and `--update-snapshots` would bake that in.
 */
test.describe('narrow chart', () => {
  mobileOnly();

  test('readout is a strip above the chart, clear of the plot entirely', async ({
    page,
  }) => {
    await gotoDashboard(page, WINDOW);

    await page.locator('#context-log-panel li button').first().click();

    const tooltip = page.locator(TOOLTIP);
    await expect(tooltip).toHaveAttribute('data-layout', 'strip');
    await expect(tooltip).toHaveAttribute('data-pinned', 'true');
    await expect(tooltip).toContainText('COVID-19 Service Reductions');

    // The plot's box in page coordinates, from the live chart rather than from
    // an assumption about where the axis ended up — the same seam and the same
    // reasoning as `chart-interaction.spec.ts`.
    const plotBox = await plot(page).boundingBox();
    if (!plotBox) throw new Error('the plot has no box');
    const area = await page.evaluate(() => {
      const chart = window.__metroChart;
      return chart ? { top: chart.chartArea.top, bottom: chart.chartArea.bottom } : null;
    });
    if (!area) throw new Error('the chart has not published itself');

    const strip = await tooltip.boundingBox();
    if (!strip) throw new Error('the strip has no box');

    const plotHeight = area.bottom - area.top;

    // A third of the plot, and a little over for the border and the rounding.
    expect(strip.height).toBeLessThanOrEqual(plotHeight / 3 + 2);
    // The whole of it above the whole of the chart. Not "clears the series" or
    // "clears the axis" — nothing of the chart is behind it, which is what makes
    // the crosshair, the highlighted point, the Month labels and the Event
    // Gutter readable at once rather than one at a time.
    expect(strip.y + strip.height).toBeLessThanOrEqual(plotBox.y);
    // Full width, rather than the floating box's 256.
    expect(strip.width).toBeGreaterThan(plotBox.width - 24);

    // It escapes the pane, so an element crop of the pane would cut the top off
    // the subject. Clip instead to the chart pane plus the band above it that
    // the strip now occupies — which keeps the subject most of its own frame,
    // where a full-page shot at this viewport would make it a sliver of a
    // 390x2868 image.
    //
    // Measured in *document* coordinates, because that is what `clip` takes
    // alongside `fullPage`. `boundingBox()` is viewport-relative and the page is
    // scrolled by now — clicking the log row scrolled it — so reading the box
    // that way clips a band off the top of the document instead.
    const region = await page.evaluate(() => {
      const pane = document.querySelector('#ridership-chart');
      const strip = document.querySelector('[data-testid="chart-tooltip"]');
      if (!pane || !strip) return null;
      const paneRect = pane.getBoundingClientRect();
      const stripRect = strip.getBoundingClientRect();
      const margin = 24;
      const top = Math.min(stripRect.top, paneRect.top) - margin;
      return {
        x: Math.max(0, paneRect.left + window.scrollX - margin),
        y: Math.max(0, top + window.scrollY),
        width: Math.min(
          document.documentElement.clientWidth,
          paneRect.width + margin * 2,
        ),
        height: paneRect.bottom + margin - top,
      };
    });
    if (!region) throw new Error('the pane and the strip are not both on the page');

    // The cap hides the event behind a scroll, so the readout says so and offers
    // to open itself. Asserted before the capture, like everything else here.
    const toggle = tooltip.getByRole('button', { name: 'Expand' });
    await expect(toggle).toBeVisible();

    await page.mouse.move(0, 0);
    await expect(page).toHaveScreenshot('chart-tooltip-strip.png', {
      fullPage: true,
      clip: region,
      threshold: 0.2,
      maxDiffPixelRatio: 0.01,
    });

    // And that it does what it says. Geometry rather than a second baseline: the
    // expanded strip is the same strip taller, which a screenshot would cost a
    // whole PNG to say.
    await toggle.click();
    await expect(tooltip).toHaveAttribute('data-expanded', 'true');
    await expect(tooltip.getByRole('button', { name: 'Collapse' })).toBeVisible();

    // Both boxes re-read together. `boundingBox()` is viewport-relative and
    // clicking scrolls its target into view, so a box measured before the click
    // and one measured after are in two different frames of reference — which
    // subtracts to a number with no meaning rather than to a failure.
    const expanded = await tooltip.boundingBox();
    const movedPlot = await plot(page).boundingBox();
    if (!expanded || !movedPlot) throw new Error('the strip has no box');

    expect(expanded.height).toBeGreaterThan(strip.height);
    // Still above the chart it is not allowed to cover.
    expect(expanded.y + expanded.height).toBeLessThanOrEqual(movedPlot.y);

    // And nothing left behind a scroll — which is what Expand promises, and
    // what a second, larger cap would have quietly broken. The Source link is
    // the last thing in the entry, so it is the thing a ceiling clips first.
    const scrolling = await tooltip.evaluate(
      (node) => node.scrollHeight > node.clientHeight + 1,
    );
    expect(scrolling).toBe(false);
    await expect(tooltip.getByRole('link', { name: 'Source' })).toBeVisible();
  });
});
