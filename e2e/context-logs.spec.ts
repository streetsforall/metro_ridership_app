import { test, expect, type Page } from '@playwright/test';
import { gotoDashboard, shootPane } from './helpers';

/**
 * Lift the list's `max-h-[32rem]` scroll cap for a shot.
 *
 * The cap is real behaviour and is asserted on its own below, but it is wrong
 * for these two baselines: they exist to prove the panel renders *every* event
 * and every category hue, and a scroll container shows only its first screenful.
 * Without this the palette shot would pin two of fifteen rows while the nine
 * category assertions above it still passed — Playwright counts an element
 * scrolled out of a container as visible, since it still has a box.
 */
async function unclampLog(page: Page): Promise<void> {
  await page.addStyleTag({
    content: '#context-log-panel ol { max-height: none !important; }',
  });
}

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
 * Two windows are in play. Since ADR-0009 they are the same rule over the same bounds, so the log
 * and the chart cover the same months; before it they disagreed by two:
 *
 * - **Event Window** — inclusive, 1-based: `201906 <= event <= 202012`. Four entries in
 *   `src/data/transit-events.json` land inside, and three of them render here:
 *   **2020-03 "COVID-19 Service Reductions"**, **2020-04 "COVID-19 Emergency Schedule"** and
 *   **2020-12 "NextGen Bus Plan Phase 1"** — each has `line_ids: []`, so it applies to any
 *   selection. The fourth, 2020-12 "Rapid Lines Retired into Local Service", is scoped to eight
 *   bus lines that exclude 801, which is why the count below is 3 and not 4. A future data PR
 *   only rebases these baselines if it adds an event between 2019-06 and 2020-12 that either
 *   carries an empty `line_ids` or names line 801.
 * - **Month Window** — the same rule and the same bounds, so these params render **2019-06
 *   through 2020-12** on the chart axis, matching the log exactly. That is what drives
 *   `chartDatasets.length > 0`; line 801 has all 19 months in that span. It stopped at 2020-10,
 *   17 months, until ADR-0009.
 *
 * Line 801 (A Line) is rail, so it carries a hardcoded brand colour rather than a golden-angle
 * bus hue. 805 (D Line) is avoided on purpose — its coverage advances every monthly refresh.
 */

test('context log panel renders its events', async ({ page }) => {
  await gotoDashboard(
    page,
    '?logs=1&lines=801&start=2019-06&end=2020-12&day=wkday',
  );

  // Prove the gate actually opened before capturing — without this a typo'd param would
  // snapshot nothing and Playwright would fail on a missing element rather than a wrong view.
  const panel = page.locator('#context-log-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('ol > li')).toHaveCount(3);

  await unclampLog(page);
  await shootPane(page, '#context-log-panel', 'context-log-panel-open.png');
});

/**
 * The selected row, as a band.
 *
 * This case exists because nothing else pins it. `chart-interaction.spec.ts` covers the
 * chart ↔ row link but is DOM-only, `chart-tooltip.spec.ts` clicks a row to pin and then
 * crops the chart, and the two shots either side of this one are of an unpinned panel — so
 * before this test the selected state had no visual coverage at all, and the change that
 * moved selection from a ring inside the button to a band across the row regenerated
 * nothing.
 *
 * Same window and line as the shot above, for the reasons in this file's header. The first
 * row is `2020-03 "COVID-19 Service Reductions"`, whose category is `disruption`; the band is
 * neutral on every category — `ContextLogPanel` says why — so which row is pinned does not
 * matter to what is being asserted, only that one is.
 *
 * `shootPane` parks the cursor at 0,0 before capturing, which clears the row's hover. The
 * pin survives it — it is state, not hover — and Chromium does not match `:focus-visible`
 * on a button focused by a mouse click, so this baseline carries the band alone and not the
 * focus ring. Focus is asserted in `ContextLogPanel.test.tsx`; a ring is a few hundred
 * pixels on a large pane and a screenshot is the wrong instrument for it.
 */
test('the pinned row takes a band across the full row', async ({ page }) => {
  await gotoDashboard(
    page,
    '?logs=1&lines=801&start=2019-06&end=2020-12&day=wkday',
  );

  const row = page.locator('#context-log-panel li button').first();
  await row.click();
  // Prove the pin before capturing. Without it `--update-snapshots` would happily rebase
  // this baseline onto an unpinned panel and the case would assert nothing.
  await expect(row).toHaveAttribute('aria-pressed', 'true');

  await unclampLog(page);
  await shootPane(page, '#context-log-panel', 'context-log-panel-pinned.png');
});

/**
 * Every category, in one panel — the visual contract for the nine-hue palette.
 *
 * The window above holds `disruption`, `hours_change` and `route_change` only, so six of the
 * nine rule colours were unpinned by it. `start=2020-03&end=2026-05` with lines 801 + 805
 * renders 15 rows covering all nine:
 *
 * | Category | Hue | First row that carries it |
 * |---|---|---|
 * | `disruption` | rose | 2020-03 COVID-19 Service Reductions |
 * | `hours_change` | orange | 2020-04 COVID-19 Emergency Schedule |
 * | `route_change` | violet | 2020-12 NextGen Bus Plan Phase 1 |
 * | `fare_change` | sky | 2021-10 GoPass Free Student Fares |
 * | `headway_change` | amber | 2022-12 Bus Service Restored |
 * | `opening` | emerald | 2023-06 Regional Connector Opening |
 * | `closure` | red | 2025-05 D Line Closed for 70 Days |
 * | `service_change` | slate | 2025-07 D Line Service Resumes |
 * | `extension` | teal | 2025-09 A Line Foothill Extension |
 *
 * **805 appears here despite the file-header warning**, and the exception is narrow: the
 * warning is about *ridership coverage* advancing each monthly refresh, which moves the chart's
 * shape. This shot crops to `#context-log-panel`, which renders events and nothing else, and
 * 805 is the only line carrying a `closure` or a `service_change`. Line 801 is what opens the
 * `chartDatasets.length > 0` leg of the gate, so the panel does not depend on 805 having data.
 *
 * The nine category labels are asserted as **text** before the screenshot. That is what keeps
 * this test meaningful under `--update-snapshots`, which would otherwise rebase a wrong view
 * into a green baseline — and it doubles as the accessibility contract, since these hues run
 * 2.15–4.76:1 on the pane's white and must never be the only signal.
 */
test('context log panel spans the category palette', async ({ page }) => {
  await gotoDashboard(
    page,
    '?logs=1&lines=801,805&start=2020-03&end=2026-05&day=wkday',
  );

  const panel = page.locator('#context-log-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('ol > li')).toHaveCount(15);

  // formatCategory() output, one per EventCategory. All nine must be on screen.
  for (const label of [
    'Opening',
    'Extension',
    'Closure',
    'Route change',
    'Headway change',
    'Hours change',
    'Fare change',
    'Disruption',
    'Service change',
  ]) {
    await expect(panel.getByText(label, { exact: true }).first()).toBeVisible();
  }

  await unclampLog(page);
  await shootPane(page, '#context-log-panel', 'context-log-panel-palette.png');
});

/**
 * The scroll cap, asserted rather than snapshotted — the two shots above lift it
 * on purpose, so without this nothing would catch its removal.
 *
 * A long window is what makes the assertion meaningful: 15 rows exceed `32rem`,
 * so the list must overflow its own box while the pane around it does not grow
 * to fit. The pane staying at the list's height is the half that keeps the map
 * and chart above it reachable.
 */
test('the event list scrolls instead of growing the page', async ({ page }) => {
  await gotoDashboard(
    page,
    '?logs=1&lines=801,805&start=2020-03&end=2026-05&day=wkday',
  );

  const list = page.locator('#context-log-panel ol');
  await expect(list).toBeVisible();

  const { scrolls, clientHeight } = await list.evaluate((ol) => ({
    scrolls: ol.scrollHeight > ol.clientHeight,
    clientHeight: ol.clientHeight,
  }));

  expect(scrolls).toBe(true);
  // 32rem at the app's 16px root.
  expect(clientHeight).toBeLessThanOrEqual(512);
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
