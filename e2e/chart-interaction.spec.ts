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
 * through 2020-10 on the axis.
 */
const WINDOW = '?logs=1&lines=801&start=2019-06&end=2020-12&day=wkday';

const tooltip = (page: Page) => page.locator('[data-testid="chart-tooltip"]');
const firstLogRow = (page: Page) =>
  page.locator('#context-log-panel li button').first();
/** The focusable plot surface — `role="application"` wraps the canvas. */
const plot = (page: Page) => page.getByRole('application');

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
  await expect(tooltip(page)).toContainText('Oct 2020');

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

    // Across the middle of the plot, well inside the axis on both sides.
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width * 0.4, y);
    await page.mouse.down();
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

  test('a click is not a drag, so it pins instead of re-ranging', async ({ page }) => {
    await gotoDashboard(page, WINDOW);

    const box = await plot(page).boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);

    await expect(tooltip(page)).toHaveAttribute('data-pinned', 'true');
    await expect(page.locator('#start-year')).toHaveValue('2019');
  });
});
