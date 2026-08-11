import { test, expect } from '@playwright/test';
import { desktopOnly, gotoDashboard, mapMask } from './helpers';

/**
 * Visual coverage for the tablet band — 640px ≤ width < 1024px.
 *
 * The app uses Tailwind's defaults and only ever branches at `sm:` (640px) and `lg:` (1024px).
 * The `desktop` project (1280px) therefore exercises every `lg:` branch and `mobile` (390px)
 * every base branch, leaving the band where `sm:` applies but `lg:` does not covered by nothing.
 * Four branches live only there:
 *
 * - `SummaryData.tsx` — `sm:grid-cols-[1fr_1fr]`, a two-column tile grid rendered in no other
 *   test, in the component whose own comments document a prior horizontal-overflow regression
 * - `DateRangeSelector.tsx` — `flex-col sm:flex-row`
 * - `LineSelector.tsx` — the expanded `max-h-[70vh] lg:max-h-none overflow-x-auto` nested
 *   scroller, with its `sticky top-0` thead
 * - `App.tsx` — `grid-cols-[1fr] lg:grid-cols-[25%_1fr]`, the single-column app layout at a
 *   width where that single column is wide
 *
 * Two caveats about how this file runs:
 *
 * - **No fourth Playwright project.** The viewport comes from the file-level `test.use` below,
 *   which overrides the project's own, paired with `desktopOnly()` so `mobile` does not write a
 *   second, meaningless baseline. Running under `desktop` means `deviceScaleFactor: 1` and no
 *   touch emulation — fine here, because these tests pin width-only CSS breakpoints, not pointer
 *   behaviour. A dedicated project would instead have multiplied every other spec in `e2e/`.
 * - **768 is a real device width**, not an arbitrary number: it is the classic tablet portrait
 *   width and sits comfortably inside `sm`-only territory, well clear of both edges of the band.
 *
 * Determinism follows the same rules as `visual.spec.ts` and `chart-content.spec.ts`: `#lineMap`
 * is masked (WebGL over third-party tiles, never identical twice; its container is a fixed 400px
 * so masking shifts no layout), navigation goes through `gotoDashboard` so the `ResizeObserver`
 * stub is installed before the document exists, and both `start` and `end` are pinned to a closed
 * historical window — `end` defaults to `dataDefaultEndDate`, derived from the dataset, so an
 * unpinned window would invalidate these baselines on the next ridership refresh. Line 805 (D) is
 * avoided: its coverage bounds advance every monthly refresh.
 */

test.use({ viewport: { width: 768, height: 1024 } });

desktopOnly();

test('dashboard at tablet width — line selected', async ({ page }) => {
  // One frame covers three of the four branches at once: the `sm:` two-column summary tile grid,
  // the `sm:flex-row` date range selector, and the below-`lg` single-column app grid.
  await gotoDashboard(page, '?lines=801,802&start=2019-12&end=2026-05&day=wkday');

  await expect(page.locator('#ridership-chart')).toBeVisible();
  await expect(page.getByText('Average Ridership', { exact: false })).toBeVisible();

  await expect(page).toHaveScreenshot('dashboard-tablet.png', {
    fullPage: true,
    mask: mapMask(page),
  });
});

test('line selector expanded at tablet width', async ({ page }) => {
  // `?buses=0` is not incidental. Expanded, the table renders one row per visible line, each
  // carrying its own Chart.js sparkline canvas — with buses on that is ~180 rows, which is why
  // the existing `line-selector-expanded-desktop-linux.png` is 1.2 MB on its own. Rail only keeps
  // the baseline small while still exercising the branch under test: the expanded
  // `max-h-[70vh] overflow-x-auto` nested scroller, which `lg:max-h-none` switches off at desktop.
  await gotoDashboard(page, '?buses=0&start=2019-12&end=2026-05&day=wkday');

  await page.locator('#expand-toggle').click();
  await expect(page.locator('table thead')).toBeVisible();

  await expect(page).toHaveScreenshot('line-selector-expanded-tablet.png', {
    fullPage: true,
    mask: mapMask(page),
  });
});
