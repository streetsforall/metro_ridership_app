import { test, expect, type Page } from '@playwright/test';
import { gotoDashboardShell } from './helpers';

/**
 * Panel Settings — the disclosure in the filter bar and the four visibility
 * params it writes.
 *
 * DOM assertions only, no screenshots. What this section changes is which
 * panels are in the document, and each hidden state's *appearance* is already
 * a baseline somewhere else: a hidden chart is `#output-placeholder`, which
 * `loading.spec.ts` shoots, and a hidden context log is the default view that
 * `visual.spec.ts` shoots. A second set of near-identical PNGs would gate on
 * pixels that nothing here can move.
 *
 * A line is selected in every case so the panels have something to render —
 * `#chart-panel` and `#summary-panel` are gated on a selection as well as on
 * their setting.
 */
const LINE = '?lines=801&start=2019-06&end=2020-12&day=wkday';

/**
 * `gotoDashboard` cannot be used here. Its readiness gate waits for `#lineMap`
 * to be *visible*, and half of these cases hide the map on purpose — the gate
 * would never pass. `#map-panel` having a count instead proves the same thing
 * the gate was there for, that the lazily-loaded OutputArea chunk has mounted,
 * without caring whether the panel is on screen.
 */
async function gotoPanels(page: Page, search: string): Promise<void> {
  await gotoDashboardShell(page, search);
  await expect(page.locator('td[data-qa^="select-"]').first()).toBeVisible();
  await expect(page.locator('#map-panel')).toHaveCount(1);
}

test('every panel is on screen by default', async ({ page }) => {
  await gotoPanels(page, LINE);

  await expect(page.locator('#chart-panel')).toBeVisible();
  await expect(page.locator('#summary-panel')).toBeVisible();
  await expect(page.locator('#map-panel')).toBeVisible();
});

test('the settings are collapsed on load', async ({ page }) => {
  await gotoPanels(page, LINE);

  await expect(page.locator('#panel-settings-toggle')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  await expect(page.locator('#panel-settings')).toHaveCount(0);
});

test('opening the disclosure reveals the four toggles and the reset', async ({
  page,
}) => {
  await gotoPanels(page, LINE);
  await page.locator('#panel-settings-toggle').click();

  await expect(page.locator('#panel-chart-toggle')).toBeVisible();
  await expect(page.locator('#panel-summary-toggle')).toBeVisible();
  await expect(page.locator('#panel-map-toggle')).toBeVisible();
  await expect(page.locator('#panel-context-logs-toggle')).toBeVisible();
  await expect(page.locator('#panel-settings-reset')).toBeVisible();
});

test('unchecking Chart drops the chart for the placeholder', async ({
  page,
}) => {
  await gotoPanels(page, LINE);
  await page.locator('#panel-settings-toggle').click();
  await page.locator('#panel-chart-toggle').click();

  await expect(page.locator('#chart-panel')).toHaveCount(0);
  await expect(page.locator('#output-placeholder')).toBeVisible();
});

test('chart=0 restores the same view from the URL', async ({ page }) => {
  await gotoPanels(page, `${LINE}&chart=0`);

  await expect(page.locator('#chart-panel')).toHaveCount(0);
  await expect(page.locator('#output-placeholder')).toBeVisible();
});

test('summary=0 hides the summary and leaves the chart alone', async ({
  page,
}) => {
  await gotoPanels(page, `${LINE}&summary=0`);

  await expect(page.locator('#summary-panel')).toHaveCount(0);
  await expect(page.locator('#chart-panel')).toBeVisible();
});

/**
 * The map is hidden, not unmounted — the one thing this feature must not do to
 * MapLibre. `#lineMap` staying in the document while `#map-panel` is invisible
 * is exactly that distinction.
 */
test('map=0 hides the map panel without unmounting MapLibre', async ({
  page,
}) => {
  await gotoPanels(page, `${LINE}&map=0`);

  await expect(page.locator('#map-panel')).toBeHidden();
  await expect(page.locator('#lineMap')).toHaveCount(1);
});

test('the map comes back visible when the toggle goes back on', async ({
  page,
}) => {
  await gotoPanels(page, `${LINE}&map=0`);
  await page.locator('#panel-settings-toggle').click();
  await page.locator('#panel-map-toggle').click();

  await expect(page.locator('#map-panel')).toBeVisible();
});

test('all four off leaves the placeholder standing', async ({ page }) => {
  await gotoPanels(page, `${LINE}&chart=0&summary=0&map=0`);

  await expect(page.locator('#output-placeholder')).toBeVisible();
  await expect(page.locator('#summary-panel')).toHaveCount(0);
  await expect(page.locator('#context-log-panel')).toHaveCount(0);
});

test('reset puts every panel back', async ({ page }) => {
  await gotoPanels(page, `${LINE}&chart=0&summary=0&map=0&logs=1`);
  await page.locator('#panel-settings-toggle').click();
  await page.locator('#panel-settings-reset').click();

  await expect(page.locator('#chart-panel')).toBeVisible();
  await expect(page.locator('#summary-panel')).toBeVisible();
  await expect(page.locator('#map-panel')).toBeVisible();
  await expect(page.locator('#context-log-panel')).toHaveCount(0);
});

/**
 * The one place `page.url()` is worth asserting on. Everywhere else the app
 * re-serialises its own state over the URL and the assertion would be circular
 * — here that re-serialisation *is* the subject: a panel left at its default
 * must not write a param.
 */
test('a default view writes no panel params', async ({ page }) => {
  await gotoPanels(page, LINE);

  const search = new URL(page.url()).search;
  expect(search).not.toContain('chart=');
  expect(search).not.toContain('summary=');
  expect(search).not.toContain('map=');
  expect(search).not.toContain('logs=');
});

test('switching a panel off writes its param', async ({ page }) => {
  await gotoPanels(page, LINE);
  await page.locator('#panel-settings-toggle').click();
  await page.locator('#panel-map-toggle').click();

  await expect
    .poll(() => new URL(page.url()).search)
    .toContain('map=0');
});

/**
 * Panel Settings' size half.
 *
 * Assertions are on computed style and on the grid template rather than on class
 * names, because what the setting has to change is the box — the class is only
 * how it gets there, and ADR-0008's reason for keeping it a class is that the
 * `ResizeObserver` stub in `helpers.ts` makes any JS-measured alternative inert
 * here. Still no screenshots: three heights of the same panel would be three
 * near-identical PNGs, and each one's *content* is already a baseline elsewhere.
 */
const styleOf = (page: Page, selector: string, property: string) =>
  page
    .locator(selector)
    .evaluate(
      (el, prop) => getComputedStyle(el).getPropertyValue(prop),
      property,
    );

test('the size controls sit alongside the visibility toggles', async ({
  page,
}) => {
  await gotoPanels(page, LINE);
  await page.locator('#panel-settings-toggle').click();

  await expect(page.locator('#panel-chart-size')).toBeVisible();
  await expect(page.locator('#panel-map-size')).toBeVisible();
  await expect(page.locator('#panel-log-size')).toBeVisible();
});

test('every size control starts on its Standard step', async ({ page }) => {
  await gotoPanels(page, LINE);
  await page.locator('#panel-settings-toggle').click();

  for (const id of [
    '#panel-chart-size-standard',
    '#panel-map-size-standard',
    '#panel-log-size-standard',
  ]) {
    await expect(page.locator(id)).toHaveAttribute('aria-checked', 'true');
  }
});

/**
 * The map's size drives its `min-height` floor and never its `height`. That is
 * the property PR A's elastic map depends on: with a taller summary beside it
 * the map fills the pane, and a fixed height would win back the box that made
 * the map float above empty space.
 */
test('mapsize=l raises the map floor without pinning its height', async ({
  page,
}) => {
  await gotoPanels(page, `${LINE}&mapsize=l`);

  expect(await styleOf(page, '#lineMap', 'min-height')).toBe('560px');
  const box = await page.locator('#lineMap').boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(560);
});

test('mapsize=s lowers the map floor', async ({ page }) => {
  await gotoPanels(page, `${LINE}&mapsize=s`);

  expect(await styleOf(page, '#lineMap', 'min-height')).toBe('280px');
});

test('a default view leaves the map floor at 400px', async ({ page }) => {
  await gotoPanels(page, LINE);

  expect(await styleOf(page, '#lineMap', 'min-height')).toBe('400px');
});

/**
 * The chart's floor is the one thing that does not move with its size. It is
 * what stopped the plot collapsing to a ~20px band on a phone once the legend
 * wrapped — see the sizing-box comment in `RidershipChart.tsx`.
 */
test('the chart keeps its 20rem floor at every size', async ({ page }) => {
  for (const size of ['s', '', 'l']) {
    await gotoPanels(page, size ? `${LINE}&chartsize=${size}` : LINE);
    const box = page.locator('#chart-panel .relative').first();
    expect(await box.evaluate((el) => getComputedStyle(el).minHeight)).toBe(
      '320px',
    );
  }
});

/**
 * Pinned to a desktop width on purpose. At 390px the container is narrow enough
 * that every ratio resolves below the 20rem floor, so all three steps render the
 * same height — true, and the assertion above is where that belongs.
 */
test('chartsize=l makes the chart taller than Standard', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoPanels(page, LINE);
  const standard = (await page
    .locator('#chart-panel .relative')
    .first()
    .boundingBox())!.height;

  await gotoPanels(page, `${LINE}&chartsize=l`);
  const large = (await page
    .locator('#chart-panel .relative')
    .first()
    .boundingBox())!.height;

  expect(large).toBeGreaterThan(standard);
});

/**
 * The split is the one setting that only exists from `lg` up, so it is asserted
 * at explicit widths rather than left to whichever project is running. Below
 * 1024px the row is a single column and the control is not on screen.
 */
test.describe('summary | map split', () => {
  test('splits the row 40/60 by default at lg', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoPanels(page, LINE);

    const template = await page
      .locator('#map-panel')
      .evaluate((el) => getComputedStyle(el.parentElement!).gridTemplateColumns);
    const [left, right] = template.split(' ').map(parseFloat);
    expect(right / left).toBeCloseTo(1.5, 1);
  });

  test('split=50 gives the summary and map equal tracks', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoPanels(page, `${LINE}&split=50`);

    const template = await page
      .locator('#map-panel')
      .evaluate((el) => getComputedStyle(el.parentElement!).gridTemplateColumns);
    const [left, right] = template.split(' ').map(parseFloat);
    expect(right / left).toBeCloseTo(1, 1);
  });

  /**
   * `split=30` is asserted as growth rather than as a ratio, and the difference
   * is real: at 1280px the summary's min-content floors its track at ~284px
   * where an exact 30% would be ~271px, so the map lands near 69% and not 70%.
   *
   * That is the grid honouring a `1fr` track's automatic minimum — the same rule
   * `OutputArea`'s `min-w-0` comment is about — and it is the behaviour to keep.
   * `min-w-0` on the summary would buy the exact ratio by letting a seven-digit
   * `text-3xl` figure overflow its tile, which is a worse answer than a track
   * 13px wider than asked for. The page not scrolling sideways is the half that
   * would actually be a bug.
   */
  test('split=30 gives the map more of the row than 40/60 does', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });

    await gotoPanels(page, LINE);
    const standard = (await page.locator('#map-panel').boundingBox())!.width;

    await gotoPanels(page, `${LINE}&split=30`);
    const wide = (await page.locator('#map-panel').boundingBox())!.width;

    expect(wide).toBeGreaterThan(standard);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
  });

  test('the control is on screen at lg', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await gotoPanels(page, LINE);
    await page.locator('#panel-settings-toggle').click();

    await expect(page.locator('#panel-split')).toBeVisible();
  });

  test('the control is gone below lg', async ({ page }) => {
    await page.setViewportSize({ width: 1023, height: 800 });
    await gotoPanels(page, LINE);
    await page.locator('#panel-settings-toggle').click();

    await expect(page.locator('#panel-split')).toBeHidden();
  });
});

test('a default view writes no size params', async ({ page }) => {
  await gotoPanels(page, LINE);

  const search = new URL(page.url()).search;
  expect(search).not.toContain('chartsize=');
  expect(search).not.toContain('mapsize=');
  expect(search).not.toContain('logsize=');
  expect(search).not.toContain('split=');
});

test('choosing a non-default size writes its param', async ({ page }) => {
  await gotoPanels(page, LINE);
  await page.locator('#panel-settings-toggle').click();
  await page.locator('#panel-map-size-large').click();

  await expect.poll(() => new URL(page.url()).search).toContain('mapsize=l');
});

test('reset clears the size params too', async ({ page }) => {
  await gotoPanels(page, `${LINE}&chartsize=s&mapsize=l&logsize=l&split=30`);
  await page.locator('#panel-settings-toggle').click();
  await page.locator('#panel-settings-reset').click();

  await expect
    .poll(() => new URL(page.url()).search)
    .not.toContain('chartsize=');
  const search = new URL(page.url()).search;
  expect(search).not.toContain('mapsize=');
  expect(search).not.toContain('logsize=');
  expect(search).not.toContain('split=');
  expect(await styleOf(page, '#lineMap', 'min-height')).toBe('400px');
});
