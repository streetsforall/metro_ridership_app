import { expect, test, type Page } from '@playwright/test';

/**
 * Shared navigation/capture helpers for the dashboard visual suites
 * (`visual.spec.ts`, `chart-content.spec.ts`).
 *
 * `map.spec.ts` deliberately does not use these: it needs its own readiness gate (MapLibre's
 * `idle` event) and its own basemap route stub, so it keeps `gotoMap()` locally.
 */

/**
 * The MapLibre map is WebGL over third-party basemap tiles and never renders identically twice,
 * so full-page snapshots mask it out. A mask paints over the element's own box and takes nothing
 * out of layout, so this does not move anything around it — which matters more now that the
 * container is elastic (`flex: 1` over a 400px floor, see Map.css) rather than a fixed 400px:
 * the masked box tracks whatever height the summary beside it drives. Element-scoped chart shots
 * do not need this — `#lineMap` sits in a sibling pane, outside the crop.
 */
export const mapMask = (page: Page) => [page.locator('#lineMap')];

/**
 * Navigate to the dashboard and wait only for the app shell — no data gate.
 *
 * `search` is appended verbatim to `/`, e.g. `'?lines=801&day=wkday'`. Dashboard state is parsed
 * from the query string once, in the lazy `useState` initialisers in `useUserDashboardInput.ts`,
 * so this is the only way to drive a specific view — and the app re-serialises its own state back
 * over the URL via `history.replaceState`, so never assert on `page.url()` afterwards.
 *
 * This exists separately from `gotoDashboard` because that helper's data gate
 * (`td[data-qa^="select-"]`) never resolves in two legitimate states: with both mode filters off
 * (`?buses=0&trains=0`) no line row is ever rendered, and with the ridership fetch stalled (see
 * `stallRidership`) none is rendered yet. A spec covering either would otherwise have to inline
 * its own navigation and quietly drift from this one.
 *
 * The `document.fonts.ready` await here settles the shell's own faces. A caller that goes on to
 * wait for later-mounting content must await it again afterwards — see `gotoDashboard`.
 */
export async function gotoDashboardShell(
  page: Page,
  search = '',
): Promise<void> {
  // Chart.js `responsive: true` observes its container via ResizeObserver and, during a
  // full-page capture, enters a 1px resize feedback loop that oscillates the document width
  // frame-to-frame — so the screenshot can never stabilise its dimensions. Stubbing
  // ResizeObserver makes Chart.js size once at load and hold, which fixes the page dimensions.
  // Layout is static after load, so nothing legitimately needs resize observation here.
  //
  // `RidershipChart` also observes its plot box, to keep the width the tooltip picks its layout
  // from current. That survives this stub because the first measurement is a synchronous
  // `clientWidth` read in a layout effect, not the observer's opening callback. What does *not*
  // survive is a re-measure — expand and collapse the line selector, which puts the chart through
  // `display: none`, and the width the tooltip holds is whatever it was before. No spec shoots a
  // readout after that, and one that wants to must drive the resize itself.
  //
  // This MUST stay ahead of `page.goto` — an init script only applies to documents created
  // after it is registered.
  await page.addInitScript(() => {
    window.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  await page.goto('/' + search);
  await expect(page.locator('#expand-toggle')).toBeVisible();

  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

/**
 * Navigate to the dashboard and wait for it to be interactive, populated with data, and for
 * fonts to be ready. The default for any spec that shoots a data-bearing view.
 *
 * `search` is passed through to `gotoDashboardShell`; see that helper for how query-string state
 * reaches the app.
 */
export async function gotoDashboard(page: Page, search = ''): Promise<void> {
  await gotoDashboardShell(page, search);

  // Ridership data is fetched at runtime (/ridership.json). Wait for it to land:
  // line rows only render once per-line metrics are computed from the dataset, and
  // #lineMap confirms the lazy-loaded OutputArea chunk has mounted. Without this the
  // screenshot can capture the loading state instead of the populated dashboard.
  await expect(page.locator('td[data-qa^="select-"]').first()).toBeVisible();
  await expect(page.locator('#lineMap')).toBeVisible();

  // Re-awaited after the data gates, not just inside the shell helper. `document.fonts.ready`
  // resolves against the faces pending when it is called, and the build ships several Overpass
  // subsets while the chart lives in the lazily-loaded OutputArea chunk that mounts after the
  // shell — so a face first exercised by the populated view can still be loading. Chart.js draws
  // its axis labels into canvas, where a late font swap repaints with no layout shift to wait on.
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
}

/**
 * Hold `/ridership.json` open forever so the app stays in its loading state.
 *
 * The route is registered but never fulfilled or aborted: an abort would put the app in its
 * error path instead, and a slow fulfil would eventually resolve and repaint mid-capture.
 *
 * MUST be called before navigating — a route registered after `page.goto` does not apply to a
 * request the page has already issued. Pair it with `gotoDashboardShell`, never `gotoDashboard`:
 * the data gate in the latter can never pass while the fetch is stalled.
 */
export async function stallRidership(page: Page): Promise<void> {
  await page.route('**/ridership.json', () => {
    // Deliberately empty: neither fulfil nor abort, so the request hangs for the run's duration.
  });
}

/**
 * Skip the calling spec outside the `desktop` project.
 *
 * Some views only exist at the desktop breakpoint, and a spec that shoots one would otherwise
 * write a second, meaningless baseline under `mobile`. Call this at file scope, above the tests.
 *
 * The condition reads `test.info()` rather than a `testInfo` parameter: Playwright's
 * `ConditionBody` takes fixtures only (`(args) => boolean`, test.d.ts), so a second argument does
 * not type-check. Modifier callbacks run inside the test's own scope, where `test.info()` is live.
 */
export function desktopOnly(): void {
  test.skip(() => test.info().project.name !== 'desktop', 'desktop-only view');
}

/**
 * Skip the calling spec outside the `mobile` project. See `desktopOnly`.
 *
 * For the other half of the same problem: a view that only exists at the narrow
 * breakpoint, where a desktop baseline would capture the wide form under a name
 * that promises the narrow one.
 */
export function mobileOnly(): void {
  test.skip(() => test.info().project.name !== 'mobile', 'mobile-only view');
}

/**
 * Screenshot one pane on its own.
 *
 * Prefer an id'd pane over an inner element: the pane's padding and background give a stable box
 * even if its contents resize, and an id is a named element rather than the DOM-order accident
 * that a `.pane`-plus-`.first()` selector relies on.
 */
/**
 * Per-shot tolerance override.
 *
 * `maxDiffPixelRatio` is the wrong instrument when the subject is a few thin strokes on a large
 * pane: 8 dashed event-gutter shapes are ~1,900 px of a ~462,000 px chart crop, so recolouring *every*
 * one of them moves 0.4% and sails under the 1% default. A shot whose subject is that small needs
 * an absolute `maxDiffPixels` instead — see `chart-content.spec.ts`'s event-gutter case.
 */
type ShotTolerance = { maxDiffPixels?: number; maxDiffPixelRatio?: number };

export async function shootPane(
  page: Page,
  selector: string,
  name: string,
  tolerance: ShotTolerance = {},
): Promise<void> {
  // hoverCrosshairPlugin draws a dashed line whenever the tooltip has active elements,
  // and interaction.intersect:false makes that trivially easy to trigger. Park the cursor.
  await page.mouse.move(0, 0);
  await expect(page.locator(selector)).toHaveScreenshot(name, {
    // Tighter than the config defaults: an element crop is a fraction of the full-page area, so
    // the same ratio would let a proportionally much larger regression through.
    threshold: 0.2,
    // An explicit maxDiffPixels replaces the ratio rather than adding to it: Playwright treats
    // whichever budgets are set as separate ceilings, so leaving the ratio in place would keep
    // the looser one in play for callers that asked for the tighter one.
    ...(tolerance.maxDiffPixels === undefined
      ? { maxDiffPixelRatio: tolerance.maxDiffPixelRatio ?? 0.01 }
      : { maxDiffPixels: tolerance.maxDiffPixels }),
  });
}

/** Screenshot the ridership chart pane. See `shootPane`. */
export async function shootChart(
  page: Page,
  name: string,
  tolerance: ShotTolerance = {},
): Promise<void> {
  await shootPane(page, '#ridership-chart', name, tolerance);
}
