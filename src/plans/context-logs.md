# Plan: Context Logs for Ridership Changes

## Context

The ridership chart shows raw numbers over time, but gives users no explanation for significant jumps or drops. When the Regional Connector opened in February 2023, it rerouted the A, C, E, and L lines through downtown, fundamentally restructuring ridership counts. When the D Line's Section 1 extension opened in October 2023, it added new stations that inflated ridership. Without context, a user sees a sudden spike and has no way to know why.

This feature adds two things: (1) vertical annotation lines on the chart at event dates, and (2) a "Context Logs" panel below the chart that lists relevant events for the selected lines within the selected date range.

---

## Implementation

### Step 1 — Create `src/data/transit-events.json`

New static file with a starter set of major LA Metro milestones. Schema:

```typescript
interface TransitEvent {
  id: string;
  date: string; // "YYYY-MM" — matches ridership data granularity
  line_ids: number[]; // empty array = system-wide (affects all lines)
  title: string; // short label (shown on chart marker tooltip)
  description: string; // 1–2 sentences of user-facing context
  category: 'opening' | 'extension' | 'disruption' | 'service_change';
}
```

Initial events to populate:

| Date    | Line IDs          | Title                           |
| ------- | ----------------- | ------------------------------- |
| 2012-04 | [804]             | E Line Opening                  |
| 2016-03 | [806]             | L Line Azusa Extension          |
| 2016-05 | [804]             | E Line Extended to Santa Monica |
| 2020-03 | [] (all lines)    | COVID-19 Service Reductions     |
| 2021-10 | [807]             | K Line Opening                  |
| 2023-02 | [801,803,804,806] | Regional Connector Opening      |
| 2023-10 | [805]             | D Line Section 1 Extension      |

### Step 2 — Add `src/@types/events.types.ts`

Export the `TransitEvent` interface matching the JSON schema above.

### Step 3 — Filter events in `src/App.tsx`

Add a `transitEvents` useMemo (alongside the existing `chartDatasets` + `ridershipByLine` memo) that:

1. Imports `transitEventsData` from `./data/transit-events.json`
2. Builds `selectedLineIds = new Set(lines.filter(l => l.selected).map(l => l.id))`
3. Converts startDate/endDate to YYYYMM integers using the same pattern as the historical map plan
4. Filters events where: date is within [startYYYYMM, endYYYYMM] AND (line_ids is empty OR overlaps selectedLineIds)
5. Sorts results chronologically

Pass `transitEvents={transitEvents}` to `<OutputArea />` (add to `OutputAreaProps`).

### Step 4 — Update `src/components/OutputArea.tsx`

**4a — Add `eventMarkersPlugin` at module level** (alongside existing `hoverCrosshairPlugin`):

The plugin reads dynamic data from `chart.options.plugins.eventMarkers.events` (idiomatic Chart.js pattern for parameterized plugins — avoids module-level mutable state):

```typescript
const eventMarkersPlugin: Plugin<'line'> = {
  id: 'eventMarkers',
  afterDraw(chart) {
    const events: TransitEvent[] =
      (chart.options.plugins as any).eventMarkers?.events ?? [];
    if (!events.length) return;

    const {
      ctx,
      chartArea: { top, bottom },
      scales: { x },
    } = chart;
    const labels = chart.data.labels as string[];

    ctx.save();
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = colors.amber['500'];

    events.forEach((event) => {
      // Chart labels are "YYYY M" (e.g. "2023 2"), event dates are "YYYY-MM"
      const label = `${event.date.slice(0, 4)} ${parseInt(event.date.slice(5), 10)}`;
      const idx = labels.indexOf(label);
      if (idx === -1) return;

      const xPos = x.getPixelForValue(idx);
      ctx.beginPath();
      ctx.moveTo(xPos, top);
      ctx.lineTo(xPos, bottom);
      ctx.stroke();
    });

    ctx.restore();
  },
};
```

Register with `ChartJS.register(..., eventMarkersPlugin)`.

**4b — Thread events into chart options:**

In the `options` object, add:

```typescript
plugins: {
  eventMarkers: { events: transitEvents } as any,
  tooltip: { ... },
}
```

**4c — Add Context Log panel** below the chart pane, before the Map.

The panel is collapsible. Add `const [isContextLogOpen, setIsContextLogOpen] = useState(true)` in the component. Only render the panel when `transitEvents.length > 0 && chartDatasets.length > 0`:

```tsx
{
  transitEvents.length > 0 && chartDatasets.length > 0 && (
    <div className="pane">
      <button
        onClick={() => setIsContextLogOpen((o) => !o)}
        className="flex w-full items-center justify-between text-xs font-semibold text-stone-500 uppercase tracking-wider"
      >
        <span>Context Logs</span>
        <span>{isContextLogOpen ? '▴' : '▾'}</span>
      </button>
      {isContextLogOpen && (
        <ol className="flex flex-col gap-3 mt-3">
          {transitEvents.map((event) => (
            <li key={event.id} className="flex gap-3 text-sm">
              <span className="text-stone-400 whitespace-nowrap shrink-0">
                {formatEventDate(event.date)} {/* "Apr 2012" */}
              </span>
              <div>
                <p className="font-medium text-stone-700">{event.title}</p>
                <p className="text-stone-500">{event.description}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
```

Add `formatEventDate(date: string): string` as a local helper that formats "2023-02" → "Feb 2023".

### Step 5 — Update `src/components/OutputArea.test.tsx`

- Add `transitEvents={[]}` to all existing `OutputArea` render calls
- Add one new test: render with a sample `TransitEvent` and verify the event title appears in the DOM

---

## Files to Modify

| File                                 | Change                                                            |
| ------------------------------------ | ----------------------------------------------------------------- |
| `src/data/transit-events.json`       | **New** — 7 starter events                                        |
| `src/@types/events.types.ts`         | **New** — `TransitEvent` interface                                |
| `src/App.tsx`                        | Import events, add `transitEvents` useMemo, pass to OutputArea    |
| `src/components/OutputArea.tsx`      | Add `eventMarkersPlugin`, context log panel, `transitEvents` prop |
| `src/components/OutputArea.test.tsx` | Add `transitEvents` prop to existing renders + new test           |

---

## Verification

1. Select the **E Line** with date range **2012-01 to 2013-01** — a vertical amber line appears on the chart at Apr 2012; the context log panel shows "E Line Opening"
2. Select the **A Line** with range **2022-01 to 2024-01** — the Regional Connector event (Feb 2023) appears
3. Select only the **B Line** with range **2022-01 to 2024-01** — no events appear (B Line is unaffected by Regional Connector), no panel rendered
4. Select any line with range fully outside all event dates — no panel rendered
5. Select any line spanning **Mar 2020** — system-wide COVID event appears regardless of which line is selected
