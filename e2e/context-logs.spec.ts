import { test, expect } from '@playwright/test';
import { gotoDashboard, shootPane } from './helpers';

/**
 * Visual + DOM coverage for `#context-log-panel`.
 *
 * The panel is gated on three conditions at once (`OutputArea.tsx` ~L385):
 * `showContextLogs && transitEvents.length > 0 && chartDatasets.length > 0`.
 * Nothing here is canvas — the panel is a plain `.pane` with a toggle button and an `<ol>` of
 * events — so it snapshots deterministically.
 *
 * ## The pinned window: `start=2019-06&end=2020-12`
 *
 * Both bounds are pinned on purpose. `end` defaults to `dataDefaultEndDate`, derived from the
 * dataset via `virtual:ridership-bounds`, and `start` defaults relative to it — leaving either
 * unpinned makes the baseline rot on the next ridership refresh.
 *
 * Two different windows are in play, and they disagree deliberately (ADR-0001):
 *
 * - **Event Window** — inclusive, 1-based: `201906 <= event <= 202012`. Of the seven entries in
 *   `src/data/transit-events.json` (2012-04, 2016-03, 2016-05, 2020-03, 2022-10, 2023-06,
 *   2026-05), exactly one lands inside: **2020-03, "COVID-19 Service Reductions"**. Its
 *   `line_ids` is `[]`, so it applies to any selection. A future data PR only rebases these
 *   baselines if it adds an event between 2019-06 and 2020-12.
 * - **Month Window** — a record at ordinal `R` is kept when `S <= R <= E - 2`, so these params
 *   render **2019-06 through 2020-10** on the chart axis. That is what drives
 *   `chartDatasets.length > 0`; line 801 has all 17 months in that span.
 *
 * Line 801 (A Line) is rail, so it carries a hardcoded brand colour rather than a golden-angle
 * bus hue. 805 (D Line) is avoided on purpose — its coverage advances every monthly refresh.
 */

test('context log panel renders its events', async ({ page }) => {
  await gotoDashboard(page, '?logs=1&lines=801&start=2019-06&end=2020-12&day=wkday');

  // Prove the gate actually opened before capturing — without this a typo'd param would
  // snapshot nothing and Playwright would fail on a missing element rather than a wrong view.
  const panel = page.locator('#context-log-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('ol > li')).toHaveCount(1);

  await shootPane(page, '#context-log-panel', 'context-log-panel-open.png');
});

test('panel is absent without logs=1', async ({ page }) => {
  // Same line and window as the shot above; only `logs` differs, so this isolates the
  // `showContextLogs` leg of the three-way gate.
  await gotoDashboard(page, '?lines=801&start=2019-06&end=2020-12&day=wkday');

  await expect(page.locator('#ridership-chart')).toBeVisible();
  await expect(page.locator('#context-log-panel')).toHaveCount(0);
});

test('panel is absent with logs=1 but no line selected', async ({ page }) => {
  // `logs=1` is on and the Event Window still holds the 2020-03 event, but no line is selected,
  // so `chartDatasets` is empty — the `chartDatasets.length > 0` leg of the gate.
  await gotoDashboard(page, '?logs=1&start=2019-06&end=2020-12&day=wkday');

  await expect(page.getByText('Please select a Metro line.')).toBeVisible();
  await expect(page.locator('#context-log-panel')).toHaveCount(0);
});
