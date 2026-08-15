import colors from 'tailwindcss/colors';
import type { EventCategory } from '../@types/events.types';

/**
 * Tailwind hue each context-log category is drawn in, so the taxonomy is legible
 * on the chart instead of one undifferentiated amber.
 *
 * One hue per category, not one per group: the data exercises all nine, so a
 * grouped palette would still render an opening and an extension — or all four
 * of the `*_change` variants — as the same mark. The hues are still *chosen* in
 * families, so the coarse reading survives a glance:
 *
 *   emerald / teal    more service (opening, extension)
 *   red / rose        less service (closure, disruption)
 *   amber / orange    runs differently (headway, hours)
 *   violet            a different shape, not a different amount (route)
 *   sky               costs something different (fare)
 *   slate             generic, uncategorised (service_change)
 *
 * Only the hue is stored; callers pick the weight, which keeps the marker (500)
 * and the tooltip's title text (400, for contrast on stone-800) in the same
 * family without a second nine-entry table to keep in sync. All nine 400s clear
 * AA on stone-800 — red is the tightest at 5.48:1 — so no slot needs an
 * exception. The 500s run 2.15–4.76:1 on the panel's white, which is why the
 * panel tints a rule rather than text.
 */
type CategoryHue =
  | 'emerald'
  | 'teal'
  | 'red'
  | 'rose'
  | 'amber'
  | 'orange'
  | 'violet'
  | 'sky'
  | 'slate';

const CATEGORY_COLOR: Record<EventCategory, CategoryHue> = {
  opening: 'emerald',
  extension: 'teal',
  closure: 'red',
  disruption: 'rose',
  headway_change: 'amber',
  hours_change: 'orange',
  route_change: 'violet',
  fare_change: 'sky',
  service_change: 'slate',
};

/**
 * Category of last resort. Also what an unrecognised category falls back to —
 * deliberately the same hue as `service_change`, since that category *is* the
 * schema's generic fallback. An unknown string and an explicit `service_change`
 * mean the same thing to a reader: something changed, nobody said what.
 */
const DEFAULT_CATEGORY_HUE: CategoryHue = 'slate';

/**
 * Total lookup over `CATEGORY_COLOR`. The events are fetched data, so a category
 * the union doesn't cover can reach here at runtime regardless of the types —
 * those still render, in slate, rather than throwing or drawing nothing.
 */
function categoryHue(category: EventCategory | undefined): CategoryHue {
  return CATEGORY_COLOR[category as EventCategory] ?? DEFAULT_CATEGORY_HUE;
}

/** Marker/border color for an event's category. */
export function categoryColor(category: EventCategory | undefined): string {
  return colors[categoryHue(category)]['500'];
}

/** Lighter variant, for category-tinted text on the dark tooltip. */
export function categoryTextColor(category: EventCategory | undefined): string {
  return colors[categoryHue(category)]['400'];
}

/** "headway_change" → "Headway change", for the panel's category label. */
export function formatCategory(category: EventCategory | undefined): string {
  if (!category) return 'Service change';
  const words = category.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
