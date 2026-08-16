import { test, expect, type Page } from '@playwright/test';
import { gotoDashboard, desktopOnly } from './helpers';

/**
 * DOM coverage for the chart's interactive layer: the pinned readout, the
 * chart ↔ context-log link, keyboard navigation, and drag-to-select.
 *
 * Deliberately snapshot-free. Everything asserted here is real DOM — the readout
 * is an HTML tooltip, not canvas — so text and attributes pin the behaviour
 * without adding baselines that a gutter-radius tweak would rebase. The canvas
 * side (the axis dots themselves) is covered by `chart-content.spec.ts`.
 *
 * ## The pinned window: `start=2019-06&end=2020-12`
 *
 * Same window and line as `context-logs.spec.ts`, and pinned for the same reason:
 * `end` otherwise defaults to `dataDefaultEndDate`, which advances on every
 * ridership refresh. It renders three context-log rows, the first being
 * **2020-03 "COVID-19 Service Reductions"**, and a Month Window of 2019-06
 * through 2020-12 on the axis — both ends inclusive. It ran to 2020-10 until
 * ADR-0009 removed the two-month offset.
 */
const WINDOW = '?logs=1&lines=801&start=2019-06&end=2020-12&day=wkday';

const tooltip = (page: Page) => page.locator('[data-testid="chart-tooltip"]');
const firstLogRow = (page: Page) =>
  page.locator('#context-log-panel li button').first();
/** The focusable plot surface — `role="application"` wraps the canvas. */
const plot = (page: Page) => page.getByRole('application');

/**
 * A point on a month's triangle in the Event Gutter, in page coordinates.
 *
 * The gutter is painted into the canvas, so there is nothing to locate — but
 * this is not pixel arithmetic either. It reads `chartArea.bottom` and the x
 * scale off the live chart through `window.__metroChart`, the seam
 * `RidershipChart` publishes for exactly this, so the point tracks whatever
 * layout the browser actually produced rather than one guessed from the box.
 *
 * Call this again before every gesture rather than reusing a point. Clicking the
 * plot focuses it — `role="application"` is `tabIndex={0}` — and the browser
 * scrolls a newly focused element into view, so viewport coordinates taken
 * before a click do not survive it.
 */
async function gutterPointFor(page: Page, monthLabel: string) {
  // At 390px the chart sits well below the fold, and a viewport coordinate off
  // the screen is not a coordinate you can click.
  await plot(page).scrollIntoViewIfNeeded();

  const box = await plot(page).boundingBox();
  if (!box) throw new Error('the plot has no box');

  const local = await page.evaluate((label) => {
    const chart = window.__metroChart;
    if (!chart) return null;
    const index = (chart.data.labels ?? []).indexOf(label);
    if (index === -1) return null;
    return {
      x: chart.scales.x.getPixelForValue(index),
      // Mid-triangle: below the axis rule, above the month labels.
      y: chart.chartArea.bottom + 7,
    };
  }, monthLabel);

  if (!local) throw new Error(`no month ${monthLabel} on the axis`);
  return { x: box.x + local.x, y: box.y + local.y };
}

/**
 * Pin a month by aiming at its triangle, the way the project's device would.
 *
 * `mobile` is a Pixel 7, so it has a touchscreen and no mouse — and "tapping a
 * triangle pins its month" is a requirement in its own right, not a stand-in for
 * clicking one. Driving a tap through `page.mouse` would prove neither.
 */
async function tapGutter(page: Page, monthLabel: string): Promise<void> {
  const point = await gutterPointFor(page, monthLabel);
  if (test.info().project.name === 'mobile') {
    await page.touchscreen.tap(point.x, point.y);
  } else {
    await page.mouse.click(point.x, point.y);
  }
}

test('a context log row pins the chart readout', async ({ page }) => {
  await gotoDashboard(page, WINDOW);
  await expect(tooltip(page)).toHaveCount(0);

  await firstLogRow(page).click();

  // The readout names the event, so the row and the tooltip are demonstrably
  // describing the same month rather than each holding their own idea of it.
  await expect(tooltip(page)).toBeVisible();
  await expect(tooltip(page)).toContainText('COVID-19 Service Reductions');
  await expect(tooltip(page)).toHaveAttribute('data-pinned', 'true');
  await expect(firstLogRow(page)).toHaveAttribute('aria-pressed', 'true');
});

test('clicking the same row again releases the pin', async ({ page }) => {
  await gotoDashboard(page, WINDOW);

  await firstLogRow(page).click();
  await expect(tooltip(page)).toBeVisible();

  await firstLogRow(page).click();
  await expect(tooltip(page)).toHaveCount(0);
  await expect(firstLogRow(page)).toHaveAttribute('aria-pressed', 'false');
});

test('Escape releases the pin from anywhere on the page', async ({ page }) => {
  await gotoDashboard(page, WINDOW);

  await firstLogRow(page).click();
  await expect(tooltip(page)).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(tooltip(page)).toHaveCount(0);
});

/**
 * The canvas is opaque to assistive tech, so the arrow keys and the live region
 * are the only way a keyboard or screen-reader user reaches a month at all.
 */
test('the arrow keys walk the months and Enter pins one', async ({ page }) => {
  await gotoDashboard(page, WINDOW);

  await plot(page).focus();
  await page.keyboard.press('ArrowRight');

  // Month Window starts at 2019-06, so one step right is July 2019.
  await expect(tooltip(page)).toContainText('Jul 2019');
  await expect(tooltip(page)).toHaveAttribute('data-pinned', 'false');

  await page.keyboard.press('Enter');
  await expect(tooltip(page)).toHaveAttribute('data-pinned', 'true');

  await page.keyboard.press('Escape');
  await expect(tooltip(page)).toHaveCount(0);
});

test('Home and End jump to the ends of the axis', async ({ page }) => {
  await gotoDashboard(page, WINDOW);

  await plot(page).focus();
  await page.keyboard.press('End');
  await expect(tooltip(page)).toContainText('Dec 2020');

  await page.keyboard.press('Home');
  await expect(tooltip(page)).toContainText('Jun 2019');
});

test('the focused month is announced to screen readers', async ({ page }) => {
  await gotoDashboard(page, WINDOW);

  await plot(page).focus();
  await page.keyboard.press('Home');

  const live = page.locator('[aria-live="polite"]');
  await expect(live).toContainText('Jun 2019');
  await expect(live).toContainText('A Line');
});

/**
 * The gutter sits outside `chartArea`, where Chart.js dispatches no click and
 * retargets no hover, so these pass only because the plugin hit-tests the strip
 * itself. See ADR-0010 — and note that a plugin-order regression breaks the
 * hover case here rather than at the unit seam.
 *
 * 2020-03 is the first log row's month, which the window is chosen to include.
 */
test.describe('the Event Gutter', () => {
  test('pointing at a triangle pins its month', async ({ page }) => {
    await gotoDashboard(page, WINDOW);
    await expect(tooltip(page)).toHaveCount(0);

    await tapGutter(page, '2020 3');

    await expect(tooltip(page)).toHaveAttribute('data-pinned', 'true');
    await expect(tooltip(page)).toContainText('Mar 2020');
    await expect(firstLogRow(page)).toHaveAttribute('aria-pressed', 'true');
  });

  /**
   * Asserted as "no pinned readout survives" rather than as a readout that has
   * gone unpinned. Both are correct outcomes and which one you get is layout:
   * the pinned box takes pointer events, so where it happens to overlap the
   * triangle the canvas sees a mouseout and the hover clears with the pin. The
   * log row is the unambiguous witness — it is DOM, and it tracks the pin alone.
   *
   * Desktop only, and this one is a real limitation rather than a test artifact.
   * The pinned readout is a fixed 256px box; on a 390px screen it covers the
   * triangle that opened it, so a second tap on the same target lands on the
   * readout and never reaches the canvas. Re-tapping is not how a phone reader
   * gets out of it — pressing anywhere outside dismisses, which `OutputArea`
   * owns and covers for every pin source, not just this one.
   */
  test.describe('re-pointing', () => {
    desktopOnly();

    test('at the same triangle releases the pin', async ({ page }) => {
      await gotoDashboard(page, WINDOW);

      await tapGutter(page, '2020 3');
      await expect(tooltip(page)).toHaveAttribute('data-pinned', 'true');

      // Recomputed inside the helper: the first press focused the plot, and the
      // browser scrolls a newly focused element into view.
      await tapGutter(page, '2020 3');

      await expect(firstLogRow(page)).toHaveAttribute('aria-pressed', 'false');
      await expect(
        page.locator('[data-testid="chart-tooltip"][data-pinned="true"]'),
      ).toHaveCount(0);
    });
  });

  /**
   * Hover only. `mobile` is a Pixel 7 — it has no pointer to hover with, so
   * running these there would assert nothing about a real interaction. Tapping
   * is the touch requirement and is covered above, on both projects.
   */
  test.describe('hovering', () => {
    desktopOnly();

    /**
     * The readout must not change depending on where the reader pointed, so this
     * asserts the ridership row as well as the event — that is the half a hover
     * outside the plot would lose if Chart.js were left to target it.
     */
    test('a triangle shows that month’s full readout', async ({ page }) => {
      await gotoDashboard(page, WINDOW);

      const point = await gutterPointFor(page, '2020 3');
      await page.mouse.move(point.x, point.y);

      await expect(tooltip(page)).toBeVisible();
      await expect(tooltip(page)).toContainText('Mar 2020');
      await expect(tooltip(page)).toContainText('COVID-19 Service Reductions');
      await expect(tooltip(page)).toContainText('A Line');
      await expect(tooltip(page)).toHaveAttribute('data-pinned', 'false');
    });

    test('moving off the gutter clears the readout', async ({ page }) => {
      await gotoDashboard(page, WINDOW);

      const point = await gutterPointFor(page, '2020 3');
      await page.mouse.move(point.x, point.y);
      await expect(tooltip(page)).toBeVisible();

      await page.mouse.move(0, 0);
      await expect(tooltip(page)).toHaveCount(0);
    });
  });
});

test.describe('drag to select a month range', () => {
  // Mouse-only by design: on touch a horizontal drag over the chart is how the
  // page scrolls, so the gesture is never claimed there.
  desktopOnly();

  /**
   * The pickers' two selects as a single comparable ordinal. The month select's
   * values are `Date#getMonth()`, so they are 0-based: June 2019 is `201905`.
   */
  const pickerMonth = async (page: Page, endpoint: 'start' | 'end') => {
    const year = await page.locator(`#${endpoint}-year`).inputValue();
    const month = await page.locator(`#${endpoint}-month`).inputValue();
    return Number(year) * 100 + Number(month);
  };

  test('narrows the window to the dragged span', async ({ page }) => {
    await gotoDashboard(page, WINDOW);
    expect(await pickerMonth(page, 'start')).toBe(201905);
    expect(await pickerMonth(page, 'end')).toBe(202011);

    const box = await plot(page).boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    /**
     * Across the middle of the plot, well inside the axis on both sides, and
     * held past `PROMOTE_HOLD_MS` before moving — a press does nothing until it
     * promotes. The `steps: 10` move covers far more than `PROMOTE_DISTANCE_PX`,
     * so this would promote on distance anyway; the wait keeps the test honest
     * about which rule it is exercising if that geometry ever narrows.
     */
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.4, y);
    await page.mouse.down();
    await page.waitForTimeout(600);
    await page.mouse.move(box.x + box.width * 0.7, y, { steps: 10 });
    await page.mouse.up();

    /**
     * Asserted as a narrowing rather than as two exact months. Which months a
     * drag lands on is a function of the plot's pixel geometry — axis width,
     * legend height, viewport — so pinning them would pin the layout, and the
     * contract here is that the drag writes through to the same two dates the
     * pickers own.
     */
    await expect
      .poll(() => pickerMonth(page, 'start'))
      .toBeGreaterThan(201905);
    expect(await pickerMonth(page, 'end')).toBeLessThan(202011);
    expect(await pickerMonth(page, 'end')).toBeGreaterThan(
      await pickerMonth(page, 'start'),
    );
  });

  /**
   * A confident drag across a year takes far less than half a second, so the
   * distance escape hatch exists to stop the hold making that gesture feel
   * broken. No wait here at all: only travel can have promoted this.
   */
  test('a fast drag past the promotion distance does not wait out the hold', async ({
    page,
  }) => {
    await gotoDashboard(page, WINDOW);

    const box = await plot(page).boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.4, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.75, y, { steps: 3 });
    await page.mouse.up();

    await expect.poll(() => pickerMonth(page, 'start')).toBeGreaterThan(201905);
    expect(await pickerMonth(page, 'end')).toBeLessThan(202011);
  });

  test('a click is not a drag, so it pins instead of re-ranging', async ({ page }) => {
    await gotoDashboard(page, WINDOW);

    const box = await plot(page).boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);

    await expect(tooltip(page)).toHaveAttribute('data-pinned', 'true');
    await expect(page.locator('#start-year')).toHaveValue('2019');
    await expect(page.locator('#end-year')).toHaveValue('2020');
  });

  /**
   * Jitter under both promotion rules, released well inside the hold. The reader
   * whose hand shakes during a click keeps their Month Window.
   */
  test('a press with jitter, released early, sets no window', async ({ page }) => {
    await gotoDashboard(page, WINDOW);

    const box = await plot(page).boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.5, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.5 + 6, y, { steps: 2 });
    await page.mouse.up();

    expect(await pickerMonth(page, 'start')).toBe(201905);
    expect(await pickerMonth(page, 'end')).toBe(202011);
  });
});
