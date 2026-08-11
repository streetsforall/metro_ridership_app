import { test, expect } from '@playwright/test';
import {
  desktopOnly,
  gotoDashboardShell,
  shootPane,
  stallRidership,
} from './helpers';

/**
 * The dashboard before its data arrives — and what it does when the data never arrives at all.
 *
 * Every other spec in this suite waits the `/ridership.json` fetch out via `gotoDashboard`, so
 * the pre-data render is the one view nothing else can reach. Both tests here get at it by
 * intercepting the request, which is why each registers its route *before* navigating: a route
 * added after `page.goto` does not apply to a request the page has already issued, and the test
 * would quietly exercise the populated dashboard instead.
 *
 * Navigation is `gotoDashboardShell`, never `gotoDashboard` — the latter's data gate
 * (`td[data-qa^="select-"]`) cannot resolve while the fetch is held open.
 */

// A centred one-line message in a full-width pane has no width-dependent layout, so a second
// baseline at the mobile viewport would pin nothing the desktop one does not already pin.
desktopOnly();

test('output pane — loading state', async ({ page }) => {
  await stallRidership(page);
  await gotoDashboardShell(page);

  await expect(page.locator('#output-placeholder')).toContainText(
    'Loading ridership data…',
  );
  await shootPane(page, '#output-placeholder', 'output-loading.png');
});

/**
 * A 500 on `/ridership.json` is asserted, not snapshotted, and the distinction is the bug:
 * `src/App.tsx` catches the rejection with a bare `console.error` and never records a failure,
 * so `ridershipRecords` stays `null`, `isLoading` (App.tsx:64) stays `true`, and the app renders
 * the *loading* copy forever. A baseline of this state would be a byte-identical duplicate of
 * `output-loading.png` above, pinning a user-visible gap in place as if it were intended.
 *
 * Tracked in https://github.com/streetsforall/metro_ridership_app/issues/158. When that lands
 * and the error case gets its own distinct render, this test is the place to add a snapshot.
 */
test('a failed ridership fetch does not crash the app', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  // Registered ahead of navigation, same as `stallRidership`.
  await page.route('**/ridership.json', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'text/plain',
      body: 'Internal Server Error',
    }),
  );
  await gotoDashboardShell(page);

  // The shell renders and the placeholder shows the loading copy — today's behaviour, and the
  // whole of issue #158: nothing here tells the user the load failed.
  await expect(page.locator('#output-placeholder')).toContainText(
    'Loading ridership data…',
  );

  // Liveness, not just "something painted": React state still drives the tree. Expanding the
  // line selector unmounts the output area (App.tsx renders it only when collapsed), and
  // collapsing brings it back. A crashed or wedged render fails one of these.
  await page.locator('#expand-toggle').click();
  await expect(page.locator('#output-placeholder')).toHaveCount(0);
  await page.locator('#expand-toggle').click();
  await expect(page.locator('#output-placeholder')).toBeVisible();

  // The rejection is swallowed deliberately; what must not happen is it reaching the window as an
  // unhandled error and taking the React tree down with it.
  expect(pageErrors).toEqual([]);
});
